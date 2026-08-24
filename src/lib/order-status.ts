import type { Lang } from "./site";

/** Order lifecycle, shared by checkout, the account area and (later) the CRM. */
export const ORDER_STATUSES = [
  "new",
  "confirmed",
  "processing",
  "shipped",
  "done",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

const LABELS: Record<OrderStatus, { ru: string; uk: string }> = {
  new: { ru: "Новый", uk: "Нове" },
  confirmed: { ru: "Подтверждён", uk: "Підтверджено" },
  processing: { ru: "В обработке", uk: "В обробці" },
  shipped: { ru: "Отправлен", uk: "Відправлено" },
  done: { ru: "Выполнен", uk: "Виконано" },
  cancelled: { ru: "Отменён", uk: "Скасовано" },
};

export function orderStatusLabel(status: string, lang: Lang): string {
  const key = (ORDER_STATUSES as readonly string[]).includes(status)
    ? (status as OrderStatus)
    : "new";
  return LABELS[key][lang];
}

export function orderStatusTone(status: string): string {
  switch (status) {
    case "done":
      return "bg-emerald-100 text-emerald-800";
    case "cancelled":
      return "bg-destructive/10 text-destructive";
    case "shipped":
      return "bg-sky-100 text-sky-800";
    case "confirmed":
    case "processing":
      return "bg-amber-100 text-amber-900";
    default:
      return "bg-muted text-foreground";
  }
}
