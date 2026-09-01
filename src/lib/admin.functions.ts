import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type OrderUpdate = Database["public"]["Tables"]["orders"]["Update"];

/**
 * Admin RPC surface. Every function re-checks the administrator role on the
 * server (`requireAdmin`) — hiding a button in the UI is never the boundary.
 * All writes go through the caller's RLS-scoped client, so the database
 * policies are a second, independent gate.
 */

/** Cheap probe used by the UI to decide whether to show the admin menu. */
export const amIAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isAdminUser } = await import("./admin.server");
    return { admin: await isAdminUser(context) };
  });

/* ----------------------------- orders ----------------------------- */

export const adminListOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        q: z.string().trim().max(120).optional(),
        status: z.string().trim().max(30).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("./admin.server");
    await requireAdmin(context);

    let query = context.supabase
      .from("orders")
      .select(
        "id, order_no, created_at, customer_name, phone, email, status, total, delivery, np_city, np_warehouse, np_warehouse_address, tracking_number, salesdrive_order_id, salesdrive_sync_status, comment",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);

    if (data.status) query = query.eq("status", data.status);
    if (data.q) {
      const q = data.q.replace(/[%,]/g, " ");
      query = query.or(
        `customer_name.ilike.%${q}%,phone.ilike.%${q}%,tracking_number.ilike.%${q}%`,
      );
    }

    const { data: orders, error } = await query;
    if (error) throw new Error(error.message);

    const ids = (orders ?? []).map((o) => o.id);
    const { data: items } = ids.length
      ? await context.supabase
          .from("order_items")
          .select("order_id, product_sku, product_name, variant_label, unit_price, quantity")
          .in("order_id", ids)
      : { data: [] as never[] };

    return (orders ?? []).map((o) => ({
      ...o,
      items: (items ?? []).filter((i) => i.order_id === o.id),
    }));
  });

export const adminUpdateOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.string().trim().max(30).optional(),
        tracking_number: z.string().trim().max(60).nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("./admin.server");
    await requireAdmin(context);
    const patch: OrderUpdate = {};
    if (data.status) patch.status = data.status;
    if (data.tracking_number !== undefined) patch.tracking_number = data.tracking_number;
    const { error } = await context.supabase.from("orders").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Re-reads live statuses from the CRM for the newest orders. */
export const adminRefreshOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireAdmin } = await import("./admin.server");
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { refreshAllOrderStatuses } = await import("./salesdrive.server");
    const updated = await refreshAllOrderStatuses(supabaseAdmin, 40);
    return { updated };
  });

/* ---------------------------- categories --------------------------- */

export const adminListCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireAdmin } = await import("./admin.server");
    await requireAdmin(context);
    const { data, error } = await context.supabase
      .from("categories")
      .select("id, slug, name_ru, name_uk, sort_order, is_active, image_path")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminSaveCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid().nullable().optional(),
        slug: z.string().trim().min(2).max(90),
        name_ru: z.string().trim().min(1).max(160),
        name_uk: z.string().trim().min(1).max(160),
        sort_order: z.number().int().min(0).max(9999),
        is_active: z.boolean(),
        image_path: z.string().trim().max(300).nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("./admin.server");
    await requireAdmin(context);
    const row = {
      slug: data.slug,
      name_ru: data.name_ru,
      name_uk: data.name_uk,
      sort_order: data.sort_order,
      is_active: data.is_active,
      image_path: data.image_path ?? null,
    };
    const res = data.id
      ? await context.supabase.from("categories").update(row).eq("id", data.id)
      : await context.supabase.from("categories").insert(row);
    if (res.error) throw new Error(res.error.message);
    return { ok: true as const };
  });

/* ----------------------------- products ---------------------------- */

export const adminListProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        q: z.string().trim().max(120).optional(),
        categoryId: z.string().uuid().nullable().optional(),
        page: z.number().int().min(0).max(500).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("./admin.server");
    await requireAdmin(context);

    const page = data.page ?? 0;
    const size = 40;
    let query = context.supabase
      .from("products")
      .select(
        "id, sku, external_id, slug, name_ru, name_uk, price, old_price, special_price, is_active, in_stock, image_path, category_id, sort_order",
        { count: "exact" },
      )
      .order("sort_order", { ascending: true })
      .range(page * size, page * size + size - 1);

    if (data.categoryId) query = query.eq("category_id", data.categoryId);
    if (data.q) {
      const q = data.q.replace(/[%,]/g, " ");
      query = query.or(`name_ru.ilike.%${q}%,name_uk.ilike.%${q}%,sku.ilike.%${q}%,slug.ilike.%${q}%`);
    }

    const { data: rows, error, count } = await query;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], count: count ?? 0, page, size };
  });

export const adminGetProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("./admin.server");
    await requireAdmin(context);
    const { data: row, error } = await context.supabase
      .from("products")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

const productSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  category_id: z.string().uuid(),
  slug: z.string().trim().min(2).max(180),
  sku: z.string().trim().max(80).nullable(),
  name_ru: z.string().trim().min(1).max(240),
  name_uk: z.string().trim().min(1).max(240),
  description_ru: z.string().trim().max(20000).nullable(),
  description_uk: z.string().trim().max(20000).nullable(),
  price: z.number().nonnegative().max(10_000_000).nullable(),
  old_price: z.number().nonnegative().max(10_000_000).nullable(),
  special_price: z.number().nonnegative().max(10_000_000).nullable(),
  image_path: z.string().trim().max(400),
  gallery: z.array(z.string().trim().max(400)).max(30),
  specs_ru: z.array(z.string().trim().max(300)).max(60),
  specs_uk: z.array(z.string().trim().max(300)).max(60),
  is_active: z.boolean(),
  in_stock: z.boolean(),
  sort_order: z.number().int().min(0).max(99999),
  meta_title_ru: z.string().trim().max(300).nullable(),
  meta_title_uk: z.string().trim().max(300).nullable(),
  meta_desc_ru: z.string().trim().max(600).nullable(),
  meta_desc_uk: z.string().trim().max(600).nullable(),
});

export const adminSaveProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => productSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("./admin.server");
    await requireAdmin(context);

    const { id, ...rest } = data;
    const row = { ...rest, gallery: rest.gallery as unknown as never };
    const res = id
      ? await context.supabase.from("products").update(row).eq("id", id).select("id").single()
      : await context.supabase.from("products").insert(row).select("id").single();
    if (res.error) throw new Error(res.error.message);
    return { ok: true as const, id: res.data.id };
  });

/* --------------------------- excel import -------------------------- */

const importSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(5000),
  apply: z.boolean(),
});

/**
 * Two-phase Excel import: `apply:false` returns the plan only, `apply:true`
 * performs it. Nothing is ever deleted and existing products are matched by
 * external_id / SKU / slug, so a repeated import updates instead of cloning.
 */
export const adminImportProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => importSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { requireAdmin, normalizeRow, parseNumber, parseList, parseBool, slugify } =
      await import("./admin.server");
    await requireAdmin(context);

    const { data: cats } = await context.supabase
      .from("categories")
      .select("id, slug, name_ru, name_uk");
    const catBy = new Map<string, string>();
    for (const c of cats ?? []) {
      catBy.set(c.slug.toLowerCase(), c.id);
      catBy.set(c.name_ru.toLowerCase(), c.id);
      catBy.set(c.name_uk.toLowerCase(), c.id);
      catBy.set(c.id, c.id);
    }

    const { data: existing } = await context.supabase
      .from("products")
      .select("id, sku, external_id, slug")
      .limit(5000);
    const byExternal = new Map<string, string>();
    const bySku = new Map<string, string>();
    const bySlug = new Map<string, string>();
    for (const p of existing ?? []) {
      if (p.external_id) byExternal.set(String(p.external_id).toLowerCase(), p.id);
      if (p.sku) bySku.set(String(p.sku).toLowerCase(), p.id);
      bySlug.set(p.slug.toLowerCase(), p.id);
    }

    type PlanRow = {
      line: number;
      key: string;
      name: string;
      action: "create" | "update" | "skip" | "error";
      reason?: string;
    };
    const plan: PlanRow[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < data.rows.length; i++) {
      const raw = normalizeRow(data.rows[i] as Record<string, string>);
      const line = i + 2;
      const name = raw["name_ru"] ?? raw["name_uk"] ?? "";
      const key = raw["external_id"] ?? raw["sku"] ?? raw["seo_url"] ?? name;

      if (!name) {
        errors++;
        plan.push({ line, key, name, action: "error", reason: "нет названия" });
        continue;
      }

      const matchId =
        (raw["external_id"] && byExternal.get(raw["external_id"].toLowerCase())) ||
        (raw["sku"] && bySku.get(raw["sku"].toLowerCase())) ||
        (raw["seo_url"] && bySlug.get(raw["seo_url"].toLowerCase())) ||
        null;

      const catKey = (raw["category"] ?? "").toLowerCase();
      const categoryId = catKey ? (catBy.get(catKey) ?? null) : null;

      if (!matchId && !categoryId) {
        skipped++;
        plan.push({ line, key, name, action: "skip", reason: "категория не найдена" });
        continue;
      }

      const patch: Record<string, unknown> = {};
      const put = (k: string, v: unknown) => {
        if (v !== null && v !== undefined) patch[k] = v;
      };
      put("name_ru", raw["name_ru"] ?? raw["name_uk"]);
      put("name_uk", raw["name_uk"] ?? raw["name_ru"]);
      put("description_ru", raw["description_ru"]);
      put("description_uk", raw["description_uk"]);
      put("sku", raw["sku"]);
      put("external_id", raw["external_id"]);
      put("price", parseNumber(raw["price"]));
      put("old_price", parseNumber(raw["old_price"]));
      put("special_price", parseNumber(raw["special_price"]));
      const qty = parseNumber(raw["quantity"]);
      if (qty !== null) {
        patch["quantity"] = Math.max(0, Math.round(qty));
        patch["in_stock"] = qty > 0;
      }
      if (raw["image_path"]) patch["image_path"] = raw["image_path"];
      if (raw["gallery"]) patch["gallery"] = parseList(raw["gallery"]);
      if (raw["specs_ru"]) patch["specs_ru"] = parseList(raw["specs_ru"]);
      if (raw["specs_uk"]) patch["specs_uk"] = parseList(raw["specs_uk"]);
      put("meta_title_ru", raw["meta_title_ru"]);
      put("meta_title_uk", raw["meta_title_uk"]);
      put("meta_desc_ru", raw["meta_desc_ru"]);
      put("meta_desc_uk", raw["meta_desc_uk"]);
      const active = parseBool(raw["is_active"]);
      if (active !== null) patch["is_active"] = active;
      if (categoryId) patch["category_id"] = categoryId;
      patch["synced_at"] = new Date().toISOString();

      if (matchId) {
        updated++;
        plan.push({ line, key, name, action: "update" });
        if (data.apply) {
          const { error } = await context.supabase
            .from("products")
            .update(patch as never)
            .eq("id", matchId);
          if (error) {
            updated--;
            errors++;
            plan[plan.length - 1] = { line, key, name, action: "error", reason: error.message };
          }
        }
      } else {
        const slug = (raw["seo_url"] ?? slugify(name)) || slugify(key || String(line));
        created++;
        plan.push({ line, key, name, action: "create" });
        if (data.apply) {
          const insert = {
            ...patch,
            slug: bySlug.has(slug.toLowerCase()) ? `${slug}_${line}` : slug,
            category_id: categoryId,
            image_path: raw["image_path"] ?? "",
            name_ru: patch["name_ru"] ?? name,
            name_uk: patch["name_uk"] ?? name,
          };
          const { error } = await context.supabase.from("products").insert(insert as never);
          if (error) {
            created--;
            errors++;
            plan[plan.length - 1] = { line, key, name, action: "error", reason: error.message };
          } else {
            bySlug.set(slug.toLowerCase(), "new");
          }
        }
      }
    }

    return {
      applied: data.apply,
      toCreate: created,
      toUpdate: updated,
      skipped,
      errors,
      rows: plan.slice(0, 300),
    };
  });
