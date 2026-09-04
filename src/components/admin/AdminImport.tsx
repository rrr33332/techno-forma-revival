import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { adminImportProducts } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload } from "lucide-react";

type PlanRow = {
  line: number;
  key: string;
  name: string;
  action: "create" | "update" | "skip" | "error";
  reason?: string;
};

type Plan = {
  applied: boolean;
  toCreate: number;
  toUpdate: number;
  skipped: number;
  errors: number;
  rows: PlanRow[];
};

const TONE: Record<PlanRow["action"], string> = {
  create: "bg-emerald-100 text-emerald-800",
  update: "bg-sky-100 text-sky-800",
  skip: "bg-muted text-muted-foreground",
  error: "bg-destructive/10 text-destructive",
};

const LABEL: Record<PlanRow["action"], string> = {
  create: "новый",
  update: "обновление",
  skip: "пропуск",
  error: "ошибка",
};

const CHUNK = 100;

export function AdminImport() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [fileName, setFileName] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [parsing, setParsing] = useState(false);
  const [progress, setProgress] = useState(0);
  const run = useServerFn(adminImportProducts);
  const qc = useQueryClient();

  const preview = useMutation({
    // Large catalogs are sent in chunks: one 14 MB request would exceed request limits.
    mutationFn: async (apply: boolean) => {
      const total: Plan = { applied: apply, toCreate: 0, toUpdate: 0, skipped: 0, errors: 0, rows: [] };
      setProgress(0);
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        const r = (await run({ data: { rows: slice, apply } })) as Plan;
        total.toCreate += r.toCreate;
        total.toUpdate += r.toUpdate;
        total.skipped += r.skipped;
        total.errors += r.errors;
        total.rows.push(...r.rows.map((x) => ({ ...x, line: x.line + i })));
        setProgress(Math.min(i + CHUNK, rows.length));
      }
      return total;
    },
    onSuccess: (r) => {
      setPlan(r);
      if (r.applied) {
        toast.success(`Импорт применён: создано ${r.toCreate}, обновлено ${r.toUpdate}`);
        qc.invalidateQueries({ queryKey: ["admin", "products"] });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });


  async function onFile(file: File) {
    setParsing(true);
    setPlan(null);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = (name: string) => {
        const ws = wb.Sheets[name];
        return ws ? XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" }) : [];
      };

      const mainName = wb.SheetNames.includes("Products") ? "Products" : wb.SheetNames[0];
      if (!mainName) throw new Error("Пустой файл");
      const json = sheet(mainName);
      if (!json.length) throw new Error("В файле нет строк");

      // OpenCart-style export: enrich product rows from the companion sheets.
      const galleries = new Map<string, string[]>();
      for (const r of sheet("AdditionalImages")) {
        const id = String(r["product_id"] ?? "").trim();
        const img = String(r["image"] ?? "").trim();
        if (!id || !img) continue;
        galleries.set(id, [...(galleries.get(id) ?? []), img]);
      }
      const slugs = new Map<string, string>();
      for (const r of sheet("ProductSEOKeywords")) {
        const id = String(r["product_id"] ?? "").trim();
        const kw = String(r["keyword(ru-ru)"] ?? r["keyword(uk-ua)"] ?? "").trim();
        if (id && kw && !slugs.has(id)) slugs.set(id, kw);
      }
      const specials = new Map<string, string>();
      for (const r of sheet("Specials")) {
        const id = String(r["product_id"] ?? "").trim();
        const price = String(r["price"] ?? "").trim();
        if (id && price && !specials.has(id)) specials.set(id, price);
      }

      const merged = json.map((r) => {
        const id = String(r["product_id"] ?? "").trim();
        const out: Record<string, unknown> = { ...r };
        const g = galleries.get(id);
        if (g?.length) out["gallery"] = g.join("\n");
        const s = slugs.get(id);
        if (s) out["seo_url"] = s;
        const sp = specials.get(id);
        if (sp) out["special_price"] = sp;
        return out;
      });

      setRows(merged.slice(0, 5000));
      setFileName(file.name);
      toast.success(`Прочитано строк: ${merged.length}`);
    } catch (e) {
      toast.error((e as Error).message);
      setRows([]);
      setFileName("");
    } finally {
      setParsing(false);
    }
  }


  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-6">
          <p className="text-sm text-muted-foreground">
            Загрузите .xlsx / .csv. Товары сопоставляются по external_id → sku → slug. Существующие
            товары никогда не удаляются.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input px-4 py-2 text-sm hover:bg-accent">
              <Upload className="size-4" />
              Выбрать файл
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                }}
              />
            </label>
            {parsing ? <Loader2 className="size-4 animate-spin" /> : null}
            {fileName ? (
              <span className="text-sm">
                {fileName} · строк: <b>{rows.length}</b>
              </span>
            ) : null}
            <Button
              disabled={!rows.length || preview.isPending}
              onClick={() => preview.mutate(false)}
            >
              Предпросмотр
            </Button>
            <Button
              variant="default"
              disabled={!plan || plan.applied || preview.isPending}
              onClick={() => preview.mutate(true)}
            >
              Применить импорт
            </Button>
          </div>
        </CardContent>
      </Card>

      {plan ? (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex flex-wrap gap-4 text-sm">
              <Stat label="Новые" value={plan.toCreate} />
              <Stat label="Обновления" value={plan.toUpdate} />
              <Stat label="Пропущено" value={plan.skipped} />
              <Stat label="Ошибки" value={plan.errors} />
              {plan.applied ? <Badge>Применено</Badge> : <Badge variant="secondary">Черновик</Badge>}
            </div>

            <div className="max-h-[480px] overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/70 text-left">
                  <tr>
                    <th className="p-2">Строка</th>
                    <th className="p-2">Ключ</th>
                    <th className="p-2">Название</th>
                    <th className="p-2">Действие</th>
                    <th className="p-2">Причина</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.rows.map((r) => (
                    <tr key={`${r.line}-${r.key}`} className="border-t">
                      <td className="p-2">{r.line}</td>
                      <td className="p-2 text-muted-foreground">{r.key || "—"}</td>
                      <td className="p-2">{r.name}</td>
                      <td className="p-2">
                        <span className={`rounded px-2 py-0.5 text-xs ${TONE[r.action]}`}>
                          {LABEL[r.action]}
                        </span>
                      </td>
                      <td className="p-2 text-muted-foreground">{r.reason ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
