import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { amIAdmin } from "@/lib/admin.functions";
import { AdminOrders } from "./AdminOrders";
import { AdminProducts, ProductForm, emptyProduct } from "./AdminProducts";
import { AdminCategories } from "./AdminCategories";
import { AdminImport } from "./AdminImport";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ShieldAlert } from "lucide-react";

const TABS = [
  { key: "orders", label: "📦 Заказы" },
  { key: "products", label: "🛍 Товары" },
  { key: "new", label: "➕ Добавить товар" },
  { key: "import", label: "📊 Импорт из Excel" },
  { key: "categories", label: "📁 Категории" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function AdminPanel() {
  const [tab, setTab] = useState<TabKey>("orders");
  const check = useServerFn(amIAdmin);
  const access = useQuery({ queryKey: ["admin", "access"], queryFn: () => check(), retry: false });

  if (access.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!access.data?.admin) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <Card className="max-w-md">
          <CardContent className="space-y-3 p-8 text-center">
            <ShieldAlert className="mx-auto size-8 text-destructive" />
            <h1 className="text-lg font-semibold">Доступ запрещён</h1>
            <p className="text-sm text-muted-foreground">
              Эта страница доступна только администратору магазина.
            </p>
            <Button asChild variant="outline">
              <Link to="/">На главную</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Панель администратора</h1>
        <p className="text-sm text-muted-foreground">Техно Форма · управление магазином</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="flex flex-wrap gap-2 lg:flex-col">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-md px-3 py-2 text-left text-sm transition-colors ${
                tab === t.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 hover:bg-accent"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <section className="min-w-0">
          {tab === "orders" ? <AdminOrders /> : null}
          {tab === "products" ? <AdminProducts /> : null}
          {tab === "new" ? (
            <ProductForm value={emptyProduct()} onSaved={() => setTab("products")} />
          ) : null}
          {tab === "import" ? <AdminImport /> : null}
          {tab === "categories" ? <AdminCategories /> : null}
        </section>
      </div>
    </div>
  );
}
