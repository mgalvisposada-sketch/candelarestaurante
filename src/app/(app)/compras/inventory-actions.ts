"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess } from "@/lib/permissions";
import { productCategorySchema, productSchema } from "@/validations/purchases";
import type { ActionResult } from "../empresa/actions";

function emptyToNull(value: string | null | undefined) {
  if (value === undefined || value === null || String(value).trim() === "")
    return null;
  return String(value).trim();
}

function parseNumber(raw: string | null | undefined, fallback?: number) {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return fallback === undefined ? null : fallback;
  }
  const n = Number(String(raw).replace(/,/g, "").trim());
  if (Number.isNaN(n)) return null;
  return n;
}

export async function createProductCategoryAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "compras.inventario")) {
    return { ok: false, error: "Sin permiso" };
  }

  const parsed = productCategorySchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_categories")
    .insert({
      organization_id: ctx.organization.id,
      code: parsed.data.code.trim().toUpperCase(),
      name: parsed.data.name.trim(),
      description: emptyToNull(parsed.data.description),
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/compras/inventario");
  revalidatePath("/compras/proveedores");
  return { ok: true, id: data.id };
}

export async function createProductAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "compras.inventario")) {
    return { ok: false, error: "Sin permiso" };
  }

  const parsed = productSchema.safeParse({
    category_id: formData.get("category_id"),
    sku: formData.get("sku"),
    name: formData.get("name"),
    unit: formData.get("unit") || "UND",
    min_stock: formData.get("min_stock"),
    current_stock: formData.get("current_stock"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const current = parseNumber(parsed.data.current_stock, 0);
  const minStock = parseNumber(parsed.data.min_stock);
  if (current === null || current < 0) return { ok: false, error: "Stock inválido" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .insert({
      organization_id: ctx.organization.id,
      category_id: parsed.data.category_id,
      sku: emptyToNull(parsed.data.sku),
      name: parsed.data.name.trim(),
      unit: parsed.data.unit.trim().toUpperCase(),
      min_stock: minStock,
      current_stock: current,
      notes: emptyToNull(parsed.data.notes),
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/compras/inventario");
  revalidatePath("/compras/solicitudes");
  return { ok: true, id: data.id };
}

export async function softDeleteProductAction(
  productId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "compras.inventario")) {
    return { ok: false, error: "Sin permiso" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({
      deleted_at: new Date().toISOString(),
      is_active: false,
      updated_by: ctx.userId,
    })
    .eq("id", productId)
    .eq("organization_id", ctx.organization.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/compras/inventario");
  return { ok: true, id: productId };
}
