import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import {
  confirmRegistration,
  registerAccount,
  requestPasswordReset,
  resendRegistrationCode,
  resetPasswordWithCode,
} from "@/lib/auth.functions";
import { signInWithPhone } from "@/lib/use-auth";
import { checkPassword, isValidPhone } from "@/lib/phone";
import { href, type Lang } from "@/lib/site";

type Mode = "login" | "register" | "forgot";

const TXT = {
  login: { ru: "Вход", uk: "Вхід" },
  register: { ru: "Создать аккаунт", uk: "Створити акаунт" },
  forgot: { ru: "Забыли пароль?", uk: "Забули пароль?" },
  firstName: { ru: "Имя", uk: "Ім'я" },
  lastName: { ru: "Фамилия", uk: "Прізвище" },
  phone: { ru: "Телефон", uk: "Телефон" },
  password: { ru: "Пароль", uk: "Пароль" },
  newPassword: { ru: "Новый пароль", uk: "Новий пароль" },
  code: { ru: "Код из SMS", uk: "Код із SMS" },
  submitLogin: { ru: "Войти", uk: "Увійти" },
  submitRegister: { ru: "Зарегистрироваться", uk: "Зареєструватися" },
  submitCode: { ru: "Подтвердить номер", uk: "Підтвердити номер" },
  resend: { ru: "Отправить код ещё раз", uk: "Надіслати код ще раз" },
  sendCode: { ru: "Получить код", uk: "Отримати код" },
  save: { ru: "Сохранить пароль", uk: "Зберегти пароль" },
  toRegister: { ru: "Нет аккаунта? Создать", uk: "Немає акаунта? Створити" },
  toLogin: { ru: "Уже есть аккаунт? Войти", uk: "Вже маєте акаунт? Увійти" },
  codeSent: {
    ru: "Мы отправили код подтверждения на ваш номер.",
    uk: "Ми надіслали код підтвердження на ваш номер.",
  },
  devCode: { ru: "Тестовый код", uk: "Тестовий код" },
  badPhone: { ru: "Введите корректный номер телефона", uk: "Введіть коректний номер телефону" },
  badPassword: {
    ru: "Пароль: минимум 8 символов, буквы и цифры",
    uk: "Пароль: щонайменше 8 символів, літери та цифри",
  },
  badCreds: { ru: "Неверный телефон или пароль", uk: "Невірний телефон або пароль" },
  phoneTaken: { ru: "Такой номер уже зарегистрирован", uk: "Такий номер вже зареєстрований" },
  badCode: { ru: "Неверный или устаревший код", uk: "Невірний або застарілий код" },
  generic: { ru: "Что-то пошло не так. Попробуйте ещё раз.", uk: "Щось пішло не так. Спробуйте ще раз." },
  resetOk: { ru: "Пароль обновлён. Войдите заново.", uk: "Пароль оновлено. Увійдіть знову." },
  hint: {
    ru: "Телефон — основной идентификатор, e-mail не нужен.",
    uk: "Телефон — основний ідентифікатор, e-mail не потрібен.",
  },
} as const;

const input =
  "w-full rounded-lg border border-input bg-background px-3 py-3 text-base outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-ring/25 sm:text-sm";

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

  const [f, setF] = useState({
    firstName: "",
    lastName: "",
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

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isValidPhone(f.phone)) return setError(T("badPhone"));
    setBusy(true);
    try {
      const { error: err } = await signInWithPhone(f.phone, f.password);
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
    if (!isValidPhone(f.phone)) return setError(T("badPhone"));
    if (!checkPassword(f.password).ok) return setError(T("badPassword"));
    setBusy(true);
    try {
      const res = await doRegister({
        data: {
          firstName: f.firstName,
          lastName: f.lastName,
          phone: f.phone,
          password: f.password,
        },
      });
      if (!res.ok) setError(T(res.error === "phone_taken" ? "phoneTaken" : "generic"));
      else {
        setStep("code");
        setNotice(T("codeSent"));
        setDevCode(res.devCode ?? null);
      }
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
      const res = await doConfirm({ data: { phone: f.phone, code: f.code } });
      if (!res.ok) setError(T("badCode"));
      else {
        const { error: err } = await signInWithPhone(f.phone, f.password);
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
    if (!isValidPhone(f.phone)) return setError(T("badPhone"));
    setBusy(true);
    try {
      const res = await doForgot({ data: { phone: f.phone } });
      setStep("code");
      setNotice(T("codeSent"));
      setDevCode(res.devCode ?? null);
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
        data: { phone: f.phone, code: f.code, password: f.password },
      });
      if (!res.ok) setError(T("badCode"));
      else {
        const { error: err } = await signInWithPhone(f.phone, f.password);
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
    setBusy(true);
    try {
      const res =
        mode === "register"
          ? await doResend({ data: { phone: f.phone } })
          : await doForgot({ data: { phone: f.phone } });
      setDevCode(res.devCode ?? null);
      setNotice(T("codeSent"));
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
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                required
                className={input}
                placeholder={T("firstName")}
                value={f.firstName}
                maxLength={60}
                onChange={(e) => set("firstName", e.target.value)}
              />
              <input
                required
                className={input}
                placeholder={T("lastName")}
                value={f.lastName}
                maxLength={60}
                onChange={(e) => set("lastName", e.target.value)}
              />
            </div>
          )}

          {step === "form" && (
            <input
              required
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              className={input}
              placeholder="+380 50 235 33 00"
              value={f.phone}
              maxLength={30}
              onChange={(e) => set("phone", e.target.value)}
            />
          )}

          {step === "code" && (
            <input
              required
              inputMode="numeric"
              className={input}
              placeholder={T("code")}
              value={f.code}
              maxLength={8}
              onChange={(e) => set("code", e.target.value)}
            />
          )}

          {(mode !== "forgot" || step === "code") && (
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

          {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
          {devCode && (
            <p className="rounded-sm bg-muted px-3 py-2 text-sm">
              {T("devCode")}: <strong>{devCode}</strong>
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-sm bg-accent px-5 py-3 text-sm font-bold text-accent-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-60"
          >
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {mode === "login"
              ? T("submitLogin")
              : mode === "register"
                ? step === "form"
                  ? T("submitRegister")
                  : T("submitCode")
                : step === "form"
                  ? T("sendCode")
                  : T("save")}
          </button>

          {step === "code" && (
            <button
              type="button"
              onClick={resend}
              disabled={busy}
              className="w-full text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              {T("resend")}
            </button>
          )}
        </form>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-sm">
          {mode === "login" ? (
            <button
              type="button"
              onClick={() => switchMode("forgot")}
              className="text-muted-foreground underline-offset-4 hover:underline"
            >
              {T("forgot")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => switchMode("login")}
              className="text-muted-foreground underline-offset-4 hover:underline"
            >
              {T("toLogin")}
            </button>
          )}
          <Link to={href("/products.php", lang)} className="text-muted-foreground underline-offset-4 hover:underline">
            {lang === "uk" ? "До каталогу" : "В каталог"}
          </Link>
        </div>
      </div>
    </div>
  );
}
