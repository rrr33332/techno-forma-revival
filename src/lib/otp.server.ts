/**
 * OtpService — one-time codes for phone verification and password reset.
 *
 * Delivery is behind a provider interface so a real SMS / Telegram / Viber
 * gateway can be plugged in later without touching the auth flow:
 *
 *   OTP_PROVIDER=dev   (default) — the code is logged and returned to the
 *                      client so the flow is testable without a gateway.
 *   OTP_PROVIDER=<x>   — implement `sendOtp` for the real provider below.
 *
 * Production must NOT run with the dev provider: `isDevOtp()` is the single
 * switch that exposes the code, and it is false for any other provider value.
 */

export type OtpPurpose = "registration" | "password_reset";

const TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

export function isDevOtp(): boolean {
  return (process.env["OTP_PROVIDER"] ?? "dev") === "dev";
}

function randomCode(): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(100000 + ((bytes[0] ?? 0) % 900000));
}

async function hashCode(phone: string, code: string): Promise<string> {
  const data = new TextEncoder().encode(`${phone}:${code}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Provider seam: replace the body when a real gateway is connected. */
async function deliver(phone: string, code: string, purpose: OtpPurpose): Promise<void> {
  if (isDevOtp()) {
    console.info(`[OtpService:dev] ${purpose} code for ${phone}: ${code}`);
    return;
  }
  // TODO: real SMS / Telegram / Viber provider goes here.
  throw new Error("otp_provider_not_configured");
}

type AdminClient = Awaited<
  typeof import("@/integrations/supabase/client.server")
>["supabaseAdmin"];

/** Issues a fresh code, invalidating previous unused ones for the same purpose. */
export async function issueOtp(
  admin: AdminClient,
  params: { userId: string; phone: string; purpose: OtpPurpose },
): Promise<{ devCode: string | null }> {
  const code = randomCode();
  const code_hash = await hashCode(params.phone, code);

  await admin
    .from("phone_verifications")
    .update({ consumed_at: new Date().toISOString() })
    .eq("user_id", params.userId)
    .eq("purpose", params.purpose)
    .is("consumed_at", null);

  const { error } = await admin.from("phone_verifications").insert({
    user_id: params.userId,
    phone: params.phone,
    purpose: params.purpose,
    code_hash,
    expires_at: new Date(Date.now() + TTL_MINUTES * 60_000).toISOString(),
  });
  if (error) throw new Error("otp_issue_failed");

  await deliver(params.phone, code, params.purpose);
  return { devCode: isDevOtp() ? code : null };
}

export type OtpResult = "ok" | "invalid" | "expired" | "too_many";

export async function verifyOtp(
  admin: AdminClient,
  params: { userId: string; phone: string; purpose: OtpPurpose; code: string },
): Promise<OtpResult> {
  const { data: row } = await admin
    .from("phone_verifications")
    .select("id, code_hash, attempts, expires_at")
    .eq("user_id", params.userId)
    .eq("purpose", params.purpose)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) return "expired";
  if (new Date(row.expires_at).getTime() < Date.now()) return "expired";
  if (row.attempts >= MAX_ATTEMPTS) return "too_many";

  const expected = await hashCode(params.phone, params.code.trim());
  if (expected !== row.code_hash) {
    await admin
      .from("phone_verifications")
      .update({ attempts: row.attempts + 1 })
      .eq("id", row.id);
    return "invalid";
  }

  await admin
    .from("phone_verifications")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id);
  return "ok";
}
