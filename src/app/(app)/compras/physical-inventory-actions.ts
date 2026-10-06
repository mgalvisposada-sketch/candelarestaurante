"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess } from "@/lib/permissions";
import { todayInBogota } from "@/lib/dates";
import {
  createPhysicalCountSchema,
  physicalCountItemSchema,
  rejectPhysicalCountSchema,
} from "@/validations/purchases";
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

function revalidatePhysical(countId?: string) {
  revalidatePath("/compras/inventario-fisico");
  if (countId) revalidatePath(`/compras/inventario-fisico/${countId}`);
  revalidatePath("/compras/inventario");
  revalidatePath("/compras/sugeridos");
}

export async function createPhysicalCountAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "compras.inventario-fisico")) {
    return { ok: false, error: "Sin permiso" };
  }

  const parsed = createPhysicalCountSchema.safeParse({
    title: formData.get("title"),
    counted_at: formData.get("counted_at") || todayInBogota(),
    location_label: formData.get("location_label"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("physical_inventory_counts")
    .insert({
      organization_id: ctx.organization.id,
      title: parsed.data.title.trim(),
      status: "BORRADOR",
      counted_at: parsed.data.counted_at,
      location_label: emptyToNull(parsed.data.location_label),
      notes: emptyToNull(parsed.data.notes),
      counted_by: ctx.userId,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePhysical(data.id);
  return { ok: true, id: data.id };
}

export async function upsertPhysicalCountItemAction(
  countId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "compras.inventario-fisico")) {
    return { ok: false, error: "Sin permiso" };
  }

  const parsed = physicalCountItemSchema.safeParse({
    product_id: formData.get("product_id"),
    counted_qty: formData.get("counted_qty"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const countedQty = parseNumber(parsed.data.counted_qty);
  if (countedQty === null || countedQty < 0) {
    return { ok: false, error: "Cantidad contada inválida" };
  }

  const supabase = await createClient();
  const { data: count } = await supabase
    .from("physical_inventory_counts")
    .select("id, status")
    .eq("id", countId)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!count) return { ok: false, error: "Conteo no encontrado" };
  if (count.status !== "BORRADOR") {
    return { ok: false, error: "Solo se editan conteos en borrador" };
  }

  const { data: product } = await supabase
    .from("products")
    .select("id, current_stock")
    .eq("id", parsed.data.product_id)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!product) return { ok: false, error: "Producto no encontrado" };

  const { data: existing } = await supabase
    .from("physical_inventory_count_items")
    .select("id")
    .eq("count_id", countId)
    .eq("product_id", product.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("physical_inventory_count_items")
      .update({
        system_qty: Number(product.current_stock || 0),
        counted_qty: countedQty,
        notes: emptyToNull(parsed.data.notes),
        updated_by: ctx.userId,
      })
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
    revalidatePhysical(countId);
    return { ok: true, id: existing.id };
  }

  const { data, error } = await supabase
    .from("physical_inventory_count_items")
    .insert({
      organization_id: ctx.organization.id,
      count_id: countId,
      product_id: product.id,
      system_qty: Number(product.current_stock || 0),
      counted_qty: countedQty,
      notes: emptyToNull(parsed.data.notes),
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePhysical(countId);
  return { ok: true, id: data.id };
}

export async function submitPhysicalCountAction(
  countId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "compras.inventario-fisico")) {
    return { ok: false, error: "Sin permiso" };
  }

  const supabase = await createClient();
  const { count } = await supabase
    .from("physical_inventory_count_items")
    .select("id", { count: "exact", head: true })
    .eq("count_id", countId)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null);

  if (!count || count < 1) {
    return { ok: false, error: "Agregue al menos un producto contado" };
  }

  const { error } = await supabase
    .from("physical_inventory_counts")
    .update({
      status: "ENVIADO",
      submitted_at: new Date().toISOString(),
      updated_by: ctx.userId,
    })
    .eq("id", countId)
    .eq("organization_id", ctx.organization.id)
    .eq("status", "BORRADOR");

  if (error) return { ok: false, error: error.message };
  revalidatePhysical(countId);
  return { ok: true, id: countId };
}

export async function rejectPhysicalCountAction(
  countId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "compras.inventario-fisico.ajustar")) {
    return { ok: false, error: "Sin permiso para rechazar/ajustar" };
  }

  const parsed = rejectPhysicalCountSchema.safeParse({
    rejection_reason: formData.get("rejection_reason"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("physical_inventory_counts")
    .update({
      status: "RECHAZADO",
      rejection_reason: parsed.data.rejection_reason.trim(),
      reviewed_at: new Date().toISOString(),
      reviewed_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .eq("id", countId)
    .eq("organization_id", ctx.organization.id)
    .eq("status", "ENVIADO");

  if (error) return { ok: false, error: error.message };
  revalidatePhysical(countId);
  return { ok: true, id: countId };
}

/** Aplica diferencias al stock. Solo Gestión. El admin del punto no puede. */
export async function applyPhysicalCountAdjustmentsAction(
  countId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "compras.inventario-fisico.ajustar")) {
    return { ok: false, error: "Sin permiso para ajustar inventario" };
  }

  const supabase = await createClient();
  const { data: count } = await supabase
    .from("physical_inventory_counts")
    .select("id, status")
    .eq("id", countId)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();

  if (!count) return { ok: false, error: "Conteo no encontrado" };
  if (count.status !== "ENVIADO") {
    return { ok: false, error: "Solo se ajustan conteos enviados" };
  }

  const { data: items } = await supabase
    .from("physical_inventory_count_items")
    .select("id, product_id, system_qty, counted_qty")
    .eq("count_id", countId)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null);

  if (!items?.length) return { ok: false, error: "Sin ítems" };

  for (const item of items) {
    const { data: product } = await supabase
      .from("products")
      .select("id, current_stock, unit_cost")
      .eq("id", item.product_id)
      .eq("organization_id", ctx.organization.id)
      .maybeSingle();
    if (!product) continue;

    const stockBefore = Number(product.current_stock || 0);
    const counted = Number(item.counted_qty);
    const diff = counted - stockBefore;
    if (diff === 0) continue;

    const { error: updError } = await supabase
      .from("products")
      .update({
        current_stock: counted,
        updated_by: ctx.userId,
      })
      .eq("id", product.id)
      .eq("organization_id", ctx.organization.id);
    if (updError) return { ok: false, error: updError.message };

    const { error: movError } = await supabase.from("inventory_movements").insert({
      organization_id: ctx.organization.id,
      product_id: product.id,
      movement_type: "AJUSTE_FISICO",
      quantity: diff,
      unit_cost: Number(product.unit_cost || 0),
      stock_before: stockBefore,
      stock_after: counted,
      unit_cost_before: Number(product.unit_cost || 0),
      unit_cost_after: Number(product.unit_cost || 0),
      reference_type: "physical_inventory_counts",
      reference_id: countId,
      notes: `Ajuste por inventario físico (sistema ${item.system_qty} → contado ${counted})`,
      created_by: ctx.userId,
    });
    if (movError) return { ok: false, error: movError.message };
  }

  const { error } = await supabase
    .from("physical_inventory_counts")
    .update({
      status: "AJUSTADO",
      reviewed_at: new Date().toISOString(),
      reviewed_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .eq("id", countId)
    .eq("organization_id", ctx.organization.id);

  if (error) return { ok: false, error: error.message };

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "ADJUST",
    entity: "physical_inventory_counts",
    entity_id: countId,
  });

  revalidatePhysical(countId);
  return { ok: true, id: countId };
}
