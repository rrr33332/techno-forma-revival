/** Branded HTML letters for Техно Форма (inline styles: email clients ignore CSS files). */

const BRAND = "#0f172a";
const ACCENT = "#c2410c";

function shell(title: string, inner: string): string {
  return `<!doctype html>
<html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:24px 12px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:${BRAND};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4e4e7;">
    <tr><td style="background:${BRAND};padding:22px 28px;">
      <div style="font-size:20px;font-weight:bold;color:#ffffff;letter-spacing:.5px;">ТЕХНО ФОРМА</div>
      <div style="font-size:12px;color:#cbd5e1;margin-top:4px;">Форми для бетонних виробів</div>
    </td></tr>
    <tr><td style="padding:28px;">${inner}</td></tr>
    <tr><td style="padding:18px 28px;background:#fafafa;border-top:1px solid #efefef;font-size:12px;color:#71717a;">
      technoforma.com.ua · info@technoforma.com.ua<br>
      Якщо ви не робили цей запит — просто проігноруйте лист.
    </td></tr>
  </table>
</body></html>`;
}

function codeBlock(code: string): string {
  return `<div style="margin:22px 0;text-align:center;">
    <div style="display:inline-block;padding:14px 28px;border:2px dashed ${ACCENT};border-radius:12px;font-size:32px;letter-spacing:10px;font-weight:bold;color:${ACCENT};">${code}</div>
    <div style="margin-top:10px;font-size:12px;color:#71717a;">Код діє 10 хвилин</div>
  </div>`;
}

export function registrationEmail(code: string, name: string) {
  const hello = name ? `Вітаємо, ${name}!` : "Вітаємо!";
  return {
    subject: `Код підтвердження: ${code} — Техно Форма`,
    text: `${hello}\n\nВаш код підтвердження реєстрації: ${code}\nКод діє 10 хвилин.\n\nТехно Форма`,
    html: shell(
      "Підтвердження реєстрації",
      `<h1 style="margin:0 0 10px;font-size:20px;">${hello}</h1>
       <p style="margin:0;font-size:15px;line-height:1.6;color:#3f3f46;">Щоб завершити реєстрацію на сайті Техно Форма, введіть цей код підтвердження:</p>
       ${codeBlock(code)}
       <p style="margin:0;font-size:13px;color:#71717a;">Нікому не повідомляйте цей код.</p>`,
    ),
  };
}

export function passwordResetEmail(code: string, name: string) {
  const hello = name ? `Вітаємо, ${name}!` : "Вітаємо!";
  return {
    subject: `Відновлення пароля: ${code} — Техно Форма`,
    text: `${hello}\n\nКод для відновлення пароля: ${code}\nКод діє 10 хвилин.\n\nТехно Форма`,
    html: shell(
      "Відновлення пароля",
      `<h1 style="margin:0 0 10px;font-size:20px;">${hello}</h1>
       <p style="margin:0;font-size:15px;line-height:1.6;color:#3f3f46;">Ви запросили відновлення пароля. Введіть цей код на сайті, щоб задати новий пароль:</p>
       ${codeBlock(code)}
       <p style="margin:0;font-size:13px;color:#71717a;">Якщо це були не ви — змініть пароль або зверніться до нас.</p>`,
    ),
  };
}
