import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { checkPassword, normalizePhone } from "./phone";

/**
 * AuthService (server side): registration, e-mail confirmation and
 * OTP-based password recovery. The e-mail is the login identifier; the
 * phone number and the nickname are required profile data.
 */

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .min(5)
  .max(255)
  .email({ message: "invalid_email" });

const phoneField = z
  .string()
  .trim()
  .max(30)
  .transform((v) => normalizePhone(v))
  .refine((v): v is string => v !== null, { message: "invalid_phone" });

const passwordField = z
  .string()
  .min(8)
  .max(72)
  .refine((v) => checkPassword(v).ok, { message: "weak_password" });

const nicknameField = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[\p{L}\p{N}._\- ]+$/u, { message: "invalid_nickname" });

const registerSchema = z.object({
  nickname: nicknameField,
  email: emailField,
  phone: phoneField,
  password: passwordField,
});

type ProfileRow = {
  id: string;
  email: string | null;
  nickname: string | null;
  email_verified: boolean;
};

export const registerAccount = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => registerSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { issueOtp } = await import("./otp.server");

    const { data: byEmail } = await supabaseAdmin
      .from("profiles")
      .select("id, email, nickname, email_verified")
      .ilike("email", data.email)
      .maybeSingle<ProfileRow>();

    if (byEmail?.email_verified) return { ok: false as const, error: "email_taken" };

    const { data: byNick } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("nickname", data.nickname)
      .maybeSingle<{ id: string }>();
    if (byNick && byNick.id !== byEmail?.id) return { ok: false as const, error: "nickname_taken" };

    let userId = byEmail?.id ?? null;

    if (!userId) {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        phone: data.phone,
        password: data.password,
        email_confirm: true,
        phone_confirm: true,
        user_metadata: { nickname: data.nickname, phone: data.phone },
      });
      if (error || !created.user) {
        console.error("[registerAccount] createUser failed", error);
        const taken = /already|registered|exists/i.test(error?.message ?? "");
        return { ok: false as const, error: taken ? ("email_taken" as const) : ("failed" as const) };
      }
      userId = created.user.id;

      const { error: profileError } = await supabaseAdmin.from("profiles").insert({
        id: userId,
        first_name: data.nickname,
        last_name: "",
        nickname: data.nickname,
        email: data.email,
        phone: data.phone,
      });
      if (profileError) {
        console.error("[registerAccount] profile insert failed", profileError);
        await supabaseAdmin.auth.admin.deleteUser(userId);
        const taken = /duplicate|unique/i.test(profileError.message);
        return { ok: false as const, error: taken ? ("phone_taken" as const) : ("failed" as const) };
      }
    } else {
      // Unfinished registration for the same e-mail — refresh it.
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: data.password,
        phone: data.phone,
        phone_confirm: true,
        user_metadata: { nickname: data.nickname, phone: data.phone },
      });
      await supabaseAdmin
        .from("profiles")
        .update({
          first_name: data.nickname,
          nickname: data.nickname,
          phone: data.phone,
        })
        .eq("id", userId);
    }

    const { devCode } = await issueOtp(supabaseAdmin, {
      userId,
      email: data.email,
      phone: data.phone,
      name: data.nickname,
      purpose: "registration",
    });

    return { ok: true as const, devCode };
  });

const otpSchema = z.object({ email: emailField, code: z.string().trim().min(4).max(8) });

async function findByEmail(email: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, email, nickname, email_verified, phone")
    .ilike("email", email)
    .maybeSingle<ProfileRow & { phone: string | null }>();
  return { supabaseAdmin, profile: data ?? null };
}

export const confirmRegistration = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => otpSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin, profile } = await findByEmail(data.email);
    const { verifyOtp } = await import("./otp.server");

    if (!profile) return { ok: false as const, error: "invalid" };
    if (profile.email_verified) return { ok: true as const };

    const result = await verifyOtp(supabaseAdmin, {
      userId: profile.id,
      email: data.email,
      purpose: "registration",
      code: data.code,
    });
    if (result !== "ok") return { ok: false as const, error: result };

    await supabaseAdmin
      .from("profiles")
      .update({ email_verified: true, phone_verified: true })
      .eq("id", profile.id);
    return { ok: true as const };
  });

const emailOnly = z.object({ email: emailField });

export const resendRegistrationCode = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => emailOnly.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin, profile } = await findByEmail(data.email);
    const { issueOtp } = await import("./otp.server");
    if (!profile || profile.email_verified) return { ok: true as const, devCode: null };

    const { devCode } = await issueOtp(supabaseAdmin, {
      userId: profile.id,
      email: data.email,
      phone: profile.phone,
      name: profile.nickname ?? "",
      purpose: "registration",
    });
    return { ok: true as const, devCode };
  });

/** Password recovery: the code goes to the account e-mail. */
export const requestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => emailOnly.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin, profile } = await findByEmail(data.email);
    const { issueOtp } = await import("./otp.server");
    // Always report success so the endpoint cannot enumerate customers.
    if (!profile) return { ok: true as const, devCode: null };

    const { devCode } = await issueOtp(supabaseAdmin, {
      userId: profile.id,
      email: data.email,
      phone: profile.phone,
      name: profile.nickname ?? "",
      purpose: "password_reset",
    });
    return { ok: true as const, devCode };
  });

const resetSchema = z.object({
  email: emailField,
  code: z.string().trim().min(4).max(8),
  password: passwordField,
});

export const resetPasswordWithCode = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => resetSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin, profile } = await findByEmail(data.email);
    const { verifyOtp } = await import("./otp.server");
    if (!profile) return { ok: false as const, error: "invalid" };

    const result = await verifyOtp(supabaseAdmin, {
      userId: profile.id,
      email: data.email,
      purpose: "password_reset",
      code: data.code,
    });
    if (result !== "ok") return { ok: false as const, error: result };

    const { error } = await supabaseAdmin.auth.admin.updateUserById(profile.id, {
      password: data.password,
    });
    if (error) return { ok: false as const, error: "invalid" };

    await supabaseAdmin.from("profiles").update({ email_verified: true }).eq("id", profile.id);
    return { ok: true as const };
  });
