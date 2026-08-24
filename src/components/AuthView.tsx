import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import {
  confirmRegistration,
  registerAccount,
  requestPasswordReset,
  resendRegistrationCode,
  resetPasswordWithCode,
} from "@/lib/auth.functions";
import { signInWithEmail } from "@/lib/use-auth";
import { checkPassword, isValidPhone } from "@/lib/phone";
import { href, type Lang } from "@/lib/site";

type Mode = "login" | "register" | "forgot";

const TXT = {
  login: { ru: "Вход", uk: "Вхід" },
  register: { ru: "Создать аккаунт", uk: "Створити акаунт" },
  forgot: { ru: "Забыли пароль?", uk: "Забули пароль?" },
  nickname: { ru: "Ник (имя в аккаунте)", uk: "Нік (ім'я в акаунті)" },
  email: { ru: "E-mail", uk: "E-mail" },
  phone: { ru: "Телефон", uk: "Телефон" },
  password: { ru: "Пароль", uk: "Пароль" },
  newPassword: { ru: "Новый пароль", uk: "Новий пароль" },
  code: { ru: "Код из письма", uk: "Код із листа" },
  submitLogin: { ru: "Войти", uk: "Увійти" },
  submitRegister: { ru: "Зарегистрироваться", uk: "Зареєструватися" },
  submitCode: { ru: "Подтвердить e-mail", uk: "Підтвердити e-mail" },
  resend: { ru: "Отправить код ещё раз", uk: "Надіслати код ще раз" },
  sendCode: { ru: "Получить код", uk: "Отримати код" },
  save: { ru: "Сохранить пароль", uk: "Зберегти пароль" },
  forgotLink: { ru: "Забыли пароль?", uk: "Забули пароль?" },
  backToLogin: { ru: "Вернуться ко входу", uk: "Повернутися до входу" },
  codeSent: {
    ru: "Мы отправили код подтверждения на вашу почту. Проверьте папку «Спам».",
    uk: "Ми надіслали код підтвердження на вашу пошту. Перевірте теку «Спам».",
  },
  devCode: { ru: "Тестовый код", uk: "Тестовий код" },
  badEmail: { ru: "Введите корректный e-mail", uk: "Введіть коректний e-mail" },
  badPhone: { ru: "Введите корректный номер телефона", uk: "Введіть коректний номер телефону" },
  badNickname: { ru: "Ник: от 2 до 40 символов", uk: "Нік: від 2 до 40 символів" },
  badPassword: {
    ru: "Пароль: минимум 8 символов, буквы и цифры",
    uk: "Пароль: щонайменше 8 символів, літери та цифри",
  },
  badCreds: { ru: "Неверный e-mail или пароль", uk: "Невірний e-mail або пароль" },
  emailTaken: { ru: "Такой e-mail уже зарегистрирован", uk: "Такий e-mail вже зареєстрований" },
  nicknameTaken: { ru: "Такой ник уже занят", uk: "Такий нік вже зайнятий" },
  phoneTaken: { ru: "Такой номер уже зарегистрирован", uk: "Такий номер вже зареєстрований" },
  badCode: { ru: "Неверный или устаревший код", uk: "Невірний або застарілий код" },
  generic: {
    ru: "Что-то пошло не так. Попробуйте ещё раз.",
    uk: "Щось пішло не так. Спробуйте ще раз.",
  },
  resetOk: { ru: "Пароль обновлён. Войдите заново.", uk: "Пароль оновлено. Увійдіть знову." },
  hint: {
    ru: "Вход по e-mail. Телефон нужен для оформления заказов.",
    uk: "Вхід за e-mail. Телефон потрібен для оформлення замовлень.",
  },
  wait: { ru: "Повторно через", uk: "Повторно через" },
} as const;

const input =
  "w-full rounded-lg border border-input bg-background px-3 py-3 text-base outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-ring/25 sm:text-sm";

const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

export function AuthView({ lang }: { lang: Lang }) {
  const T = (k: keyof typeof TXT) => TXT[k][lang];
  const navigate = useNavigate();

  const doRegister = useServerFn(registerAccount);
  const doConfirm = useServerFn(confirmRegistration);
  const doResend = useServerFn(resendRegistrationCode);
  const doForgot = useServerFn(requestPasswordReset);
  const doReset = useServerFn(resetPasswordWithCode);

  const [mode, setMode] = useState<Mode>("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [step, setStep] = useState<"form" | "code">("form");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const [f, setF] = useState({
    nickname: "",
    email: "",
    phone: "",
    password: "",
    code: "",
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const switchMode = (next: Mode) => {
    setMode(next);
    setStep("form");
    setError(null);
    setNotice(null);
    setDevCode(null);
  };

  const goAccount = () => navigate({ to: href("/account", lang) });

  const afterSend = (code: string | null) => {
    setStep("code");
    setNotice(T("codeSent"));
    setDevCode(code);
    setCooldown(60);
  };

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!emailOk(f.email)) return setError(T("badEmail"));
    setBusy(true);
    try {
      const { error: err } = await signInWithEmail(f.email, f.password);
      if (err) setError(T("badCreds"));
      else goAccount();
    } catch {
      setError(T("generic"));
    } finally {
      setBusy(false);
    }
  };

  const submitRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (f.nickname.trim().length < 2) return setError(T("badNickname"));
    if (!emailOk(f.email)) return setError(T("badEmail"));
    if (!isValidPhone(f.phone)) return setError(T("badPhone"));
    if (!checkPassword(f.password).ok) return setError(T("badPassword"));
    setBusy(true);
    try {
      const res = await doRegister({
        data: {
          nickname: f.nickname,
          email: f.email,
          phone: f.phone,
          password: f.password,
        },
      });
      if (!res.ok) {
        setError(
          T(
            res.error === "email_taken"
              ? "emailTaken"
              : res.error === "nickname_taken"
                ? "nicknameTaken"
                : res.error === "phone_taken"
                  ? "phoneTaken"
                  : "generic",
          ),
        );
      } else afterSend(res.devCode ?? null);
    } catch {
      setError(T("generic"));
    } finally {
      setBusy(false);
    }
  };

  const submitConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await doConfirm({ data: { email: f.email, code: f.code } });
      if (!res.ok) setError(T("badCode"));
      else {
        const { error: err } = await signInWithEmail(f.email, f.password);
        if (err) switchMode("login");
        else goAccount();
      }
    } catch {
      setError(T("generic"));
    } finally {
      setBusy(false);
    }
  };

  const submitForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!emailOk(f.email)) return setError(T("badEmail"));
    setBusy(true);
    try {
      const res = await doForgot({ data: { email: f.email } });
      afterSend(res.devCode ?? null);
    } catch {
      setError(T("generic"));
    } finally {
      setBusy(false);
    }
  };

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!checkPassword(f.password).ok) return setError(T("badPassword"));
    setBusy(true);
    try {
      const res = await doReset({
        data: { email: f.email, code: f.code, password: f.password },
      });
      if (!res.ok) setError(T("badCode"));
      else {
        const { error: err } = await signInWithEmail(f.email, f.password);
        if (err) {
          switchMode("login");
          setNotice(T("resetOk"));
        } else goAccount();
      }
    } catch {
      setError(T("generic"));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res =
        mode === "register"
          ? await doResend({ data: { email: f.email } })
          : await doForgot({ data: { email: f.email } });
      afterSend(res.devCode ?? null);
    } catch {
      setError(T("generic"));
    } finally {
      setBusy(false);
    }
  };

  const tab = (m: Mode, label: string) => (
    <button
      key={m}
      type="button"
      onClick={() => switchMode(m)}
      className={`flex-1 rounded-sm px-3 py-2.5 text-sm font-semibold transition-colors ${
        mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
      }`}
    >
      {label}
    </button>
  );

  const onSubmit =
    mode === "login"
      ? submitLogin
      : mode === "register"
        ? step === "form"
          ? submitRegister
          : submitConfirm
        : step === "form"
          ? submitForgot
          : submitReset;

  const submitLabel =
    mode === "login"
      ? T("submitLogin")
      : mode === "register"
        ? step === "form"
          ? T("submitRegister")
          : T("submitCode")
        : step === "form"
          ? T("sendCode")
          : T("save");

  return (
    <div className="container-page py-10 sm:py-14">
      <div className="mx-auto w-full max-w-md rounded-md border border-border bg-card p-5 shadow-plate sm:p-7">
        <div className="mb-5 flex gap-1 rounded-md bg-muted/60 p-1">
          {tab("login", T("login"))}
          {tab("register", T("register"))}
        </div>

        <h1 className="font-display text-xl font-bold">
          {mode === "forgot" ? T("forgot") : mode === "login" ? T("login") : T("register")}
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">{T("hint")}</p>

        <form onSubmit={onSubmit} className="mt-5 space-y-3">
          {mode === "register" && step === "form" && (
            <input
              required
              className={input}
              placeholder={T("nickname")}
              value={f.nickname}
              maxLength={40}
              onChange={(e) => set("nickname", e.target.value)}
            />
          )}

          {step === "form" && (
            <input
              required
              type="email"
              autoComplete="email"
              className={input}
              placeholder={T("email")}
              value={f.email}
              maxLength={255}
              onChange={(e) => set("email", e.target.value)}
            />
          )}

          {mode === "register" && step === "form" && (
            <input
              required
              type="tel"
              autoComplete="tel"
              className={input}
              placeholder="+380 50 235 33 00"
              value={f.phone}
              maxLength={30}
              onChange={(e) => set("phone", e.target.value)}
            />
          )}

          {((mode !== "forgot" && step === "form") || (mode === "forgot" && step === "code")) && (
            <input
              required
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className={input}
              placeholder={mode === "forgot" ? T("newPassword") : T("password")}
              value={f.password}
              maxLength={72}
              onChange={(e) => set("password", e.target.value)}
            />
          )}

          {step === "code" && (
            <input
              required
              inputMode="numeric"
              className={`${input} tracking-[0.4em] text-center text-lg`}
              placeholder={T("code")}
              value={f.code}
              maxLength={6}
              onChange={(e) => set("code", e.target.value.replace(/\D/g, ""))}
            />
          )}

          {notice && (
            <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{notice}</p>
          )}
          {devCode && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {T("devCode")}: <b>{devCode}</b>
            </p>
          )}
          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitLabel}
          </button>

          {step === "code" && (
            <button
              type="button"
              onClick={resend}
              disabled={busy || cooldown > 0}
              className="w-full rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-60"
            >
              {cooldown > 0 ? `${T("wait")} ${cooldown} c` : T("resend")}
            </button>
          )}

          {mode === "login" && (
            <button
              type="button"
              onClick={() => switchMode("forgot")}
              className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              {T("forgotLink")}
            </button>
          )}
          {mode === "forgot" && (
            <button
              type="button"
              onClick={() => switchMode("login")}
              className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              {T("backToLogin")}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
