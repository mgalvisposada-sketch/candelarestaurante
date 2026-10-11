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

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

const NONE_CATEGORY = "__none__";

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
  revalidatePath("/inventario/fisico");
  if (countId) revalidatePath(`/inventario/fisico/${countId}`);
  revalidatePath("/inventario/maestro");
  revalidatePath("/compras/sugeridos");
}

function normalizeCategoryId(categoryId: string | null | undefined) {
  if (!categoryId || categoryId === NONE_CATEGORY) return NONE_CATEGORY;
  return categoryId;
}

async function syncCountHeaderStatus(
  supabase: SupabaseClient,
  countId: string,
  organizationId: string,
  userId: string,
) {
  const { data: items } = await supabase
    .from("physical_inventory_count_items")
    .select("status")
    .eq("count_id", countId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  const statuses = (items ?? []).map((i) => i.status as string);
  let next: "BORRADOR" | "ENVIADO" | "AJUSTADO" | "RECHAZADO" = "BORRADOR";

  if (statuses.some((s) => s === "ENVIADO")) {
    next = "ENVIADO";
  } else if (statuses.length > 0 && statuses.every((s) => s === "AJUSTADO")) {
    next = "AJUSTADO";
  } else if (
    statuses.some((s) => s === "RECHAZADO") &&
    !statuses.some((s) => s === "BORRADOR" || s === "ENVIADO" || s === "AJUSTADO")
  ) {
    next = "RECHAZADO";
  }

  const patch: Record<string, unknown> = {
    status: next,
    updated_by: userId,
  };
  if (next === "ENVIADO") {
    patch.submitted_at = new Date().toISOString();
  }
  if (next === "AJUSTADO" || next === "RECHAZADO") {
    patch.reviewed_at = new Date().toISOString();
    patch.reviewed_by = userId;
  }

  await supabase
    .from("physical_inventory_counts")
    .update(patch)
    .eq("id", countId)
    .eq("organization_id", organizationId);
}

async function productIdsInCategory(
  supabase: SupabaseClient,
  organizationId: string,
  categoryId: string,
) {
  const normalized = normalizeCategoryId(categoryId);
  let query = supabase
    .from("products")
    .select("id")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .eq("is_active", true);

  if (normalized === NONE_CATEGORY) {
    query = query.is("category_id", null);
  } else {
    query = query.eq("category_id", normalized);
  }

  const { data, error } = await query;
  if (error) return { error: error.message, ids: [] as string[] };
  return { error: null as string | null, ids: (data ?? []).map((p) => p.id) };
}

export async function createPhysicalCountAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "inventario.fisico")) {
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
  if (!ctxCanAccess(ctx, "inventario.fisico")) {
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
  if (count.status === "AJUSTADO") {
    return { ok: false, error: "Este conteo ya está cerrado" };
  }

  const { data: product } = await supabase
    .from("products")
    .select("id, category_id")
    .eq("id", parsed.data.product_id)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!product) return { ok: false, error: "Producto no encontrado" };

  const { data: existing } = await supabase
    .from("physical_inventory_count_items")
    .select("id, status")
    .eq("count_id", countId)
    .eq("product_id", product.id)
    .is("deleted_at", null)
    .maybeSingle();

  // Conteo a ciegas: system_qty se congela al enviar la categoría, no al registrar.
  if (existing) {
    if (existing.status !== "BORRADOR") {
      return {
        ok: false,
        error: "Este producto ya fue enviado; no se puede editar",
      };
    }
    const { error } = await supabase
      .from("physical_inventory_count_items")
      .update({
        counted_qty: countedQty,
        notes: emptyToNull(parsed.data.notes),
        rejection_reason: null,
        updated_by: ctx.userId,
      })
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: existing.id };
  }

  // Una sola categoría en borrador a la vez: no iniciar otra hasta enviar.
  const { data: draftRows } = await supabase
    .from("physical_inventory_count_items")
    .select("product_id")
    .eq("count_id", countId)
    .eq("organization_id", ctx.organization.id)
    .eq("status", "BORRADOR")
    .is("deleted_at", null);

  if (draftRows?.length) {
    const draftProductIds = [...new Set(draftRows.map((r) => r.product_id))];
    const { data: draftProducts } = await supabase
      .from("products")
      .select("id, category_id")
      .eq("organization_id", ctx.organization.id)
      .in("id", draftProductIds);

    const activeCats = new Set(
      (draftProducts ?? []).map((p) => normalizeCategoryId(p.category_id)),
    );
    const targetCat = normalizeCategoryId(product.category_id);
    if (activeCats.size > 0 && !activeCats.has(targetCat)) {
      return {
        ok: false,
        error:
          "Termine y envíe la categoría en curso a revisión antes de contar otra",
      };
    }
  }

  const { data, error } = await supabase
    .from("physical_inventory_count_items")
    .insert({
      organization_id: ctx.organization.id,
      count_id: countId,
      product_id: product.id,
      system_qty: 0,
      counted_qty: countedQty,
      status: "BORRADOR",
      notes: emptyToNull(parsed.data.notes),
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}

export async function removePhysicalCountItemAction(
  countId: string,
  itemId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "inventario.fisico")) {
    return { ok: false, error: "Sin permiso" };
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
  if (count.status === "AJUSTADO") {
    return { ok: false, error: "Este conteo ya está cerrado" };
  }

  const { data: item } = await supabase
    .from("physical_inventory_count_items")
    .select("id, status")
    .eq("id", itemId)
    .eq("count_id", countId)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!item) return { ok: false, error: "Ítem no encontrado" };
  if (item.status !== "BORRADOR") {
    return { ok: false, error: "Solo se quitan productos en borrador" };
  }

  const { error } = await supabase
    .from("physical_inventory_count_items")
    .delete()
    .eq("id", itemId)
    .eq("count_id", countId)
    .eq("organization_id", ctx.organization.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: itemId };
}

/** Envía a revisión los ítems en borrador de una categoría. */
export async function submitPhysicalCountCategoryAction(
  countId: string,
  categoryId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "inventario.fisico")) {
    return { ok: false, error: "Sin permiso" };
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
  if (count.status === "AJUSTADO") {
    return { ok: false, error: "Este conteo ya está cerrado" };
  }

  const { error: catError, ids: productIds } = await productIdsInCategory(
    supabase,
    ctx.organization.id,
    categoryId,
  );
  if (catError) return { ok: false, error: catError };
  if (!productIds.length) {
    return { ok: false, error: "No hay productos en esta categoría" };
  }

  const { data: items } = await supabase
    .from("physical_inventory_count_items")
    .select("id, product_id, status")
    .eq("count_id", countId)
    .eq("organization_id", ctx.organization.id)
    .in("product_id", productIds)
    .eq("status", "BORRADOR")
    .is("deleted_at", null);

  if (!items?.length) {
    return {
      ok: false,
      error: "Cuente al menos un producto de la categoría antes de enviar",
    };
  }

  const itemProductIds = [...new Set(items.map((i) => i.product_id))];
  const { data: products } = await supabase
    .from("products")
    .select("id, current_stock")
    .eq("organization_id", ctx.organization.id)
    .in("id", itemProductIds)
    .is("deleted_at", null);

  const stockByProduct = new Map(
    (products ?? []).map((p) => [p.id, Number(p.current_stock || 0)]),
  );
  const now = new Date().toISOString();

  for (const item of items) {
    const systemQty = stockByProduct.get(item.product_id) ?? 0;
    const { error: snapError } = await supabase
      .from("physical_inventory_count_items")
      .update({
        system_qty: systemQty,
        status: "ENVIADO",
        submitted_at: now,
        rejection_reason: null,
        updated_by: ctx.userId,
      })
      .eq("id", item.id)
      .eq("organization_id", ctx.organization.id)
      .eq("status", "BORRADOR");
    if (snapError) return { ok: false, error: snapError.message };
  }

  await syncCountHeaderStatus(
    supabase,
    countId,
    ctx.organization.id,
    ctx.userId,
  );
  revalidatePhysical(countId);
  return { ok: true, id: countId };
}

/** Envía todas las categorías con ítems en borrador (atajo). */
export async function submitPhysicalCountAction(
  countId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "inventario.fisico")) {
    return { ok: false, error: "Sin permiso" };
  }

  const supabase = await createClient();
  const { data: items } = await supabase
    .from("physical_inventory_count_items")
    .select("id, product_id")
    .eq("count_id", countId)
    .eq("organization_id", ctx.organization.id)
    .eq("status", "BORRADOR")
    .is("deleted_at", null);

  if (!items?.length) {
    return { ok: false, error: "Agregue al menos un producto contado en borrador" };
  }

  const productIds = [...new Set(items.map((i) => i.product_id))];
  const { data: products } = await supabase
    .from("products")
    .select("id, current_stock")
    .eq("organization_id", ctx.organization.id)
    .in("id", productIds)
    .is("deleted_at", null);

  const stockByProduct = new Map(
    (products ?? []).map((p) => [p.id, Number(p.current_stock || 0)]),
  );
  const now = new Date().toISOString();

  for (const item of items) {
    const systemQty = stockByProduct.get(item.product_id) ?? 0;
    const { error: snapError } = await supabase
      .from("physical_inventory_count_items")
      .update({
        system_qty: systemQty,
        status: "ENVIADO",
        submitted_at: now,
        rejection_reason: null,
        updated_by: ctx.userId,
      })
      .eq("id", item.id)
      .eq("organization_id", ctx.organization.id)
      .eq("status", "BORRADOR");
    if (snapError) return { ok: false, error: snapError.message };
  }

  await syncCountHeaderStatus(
    supabase,
    countId,
    ctx.organization.id,
    ctx.userId,
  );
  revalidatePhysical(countId);
  return { ok: true, id: countId };
}

export async function rejectPhysicalCountCategoryAction(
  countId: string,
  categoryId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "inventario.fisico.ajustar")) {
    return { ok: false, error: "Sin permiso para rechazar/ajustar" };
  }

  const parsed = rejectPhysicalCountSchema.safeParse({
    rejection_reason: formData.get("rejection_reason"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const { error: catError, ids: productIds } = await productIdsInCategory(
    supabase,
    ctx.organization.id,
    categoryId,
  );
  if (catError) return { ok: false, error: catError };
  if (!productIds.length) return { ok: false, error: "Categoría sin productos" };

  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("physical_inventory_count_items")
    .update({
      status: "BORRADOR",
      rejection_reason: parsed.data.rejection_reason.trim(),
      reviewed_at: now,
      submitted_at: null,
      updated_by: ctx.userId,
    })
    .eq("count_id", countId)
    .eq("organization_id", ctx.organization.id)
    .in("product_id", productIds)
    .eq("status", "ENVIADO")
    .is("deleted_at", null)
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!updated?.length) {
    return { ok: false, error: "No hay ítems en revisión en esta categoría" };
  }

  await syncCountHeaderStatus(
    supabase,
    countId,
    ctx.organization.id,
    ctx.userId,
  );
  revalidatePhysical(countId);
  return { ok: true, id: countId };
}

export async function rejectPhysicalCountAction(
  countId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "inventario.fisico.ajustar")) {
    return { ok: false, error: "Sin permiso para rechazar/ajustar" };
  }

  const parsed = rejectPhysicalCountSchema.safeParse({
    rejection_reason: formData.get("rejection_reason"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("physical_inventory_count_items")
    .update({
      status: "BORRADOR",
      rejection_reason: parsed.data.rejection_reason.trim(),
      reviewed_at: now,
      submitted_at: null,
      updated_by: ctx.userId,
    })
    .eq("count_id", countId)
    .eq("organization_id", ctx.organization.id)
    .eq("status", "ENVIADO")
    .is("deleted_at", null)
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!updated?.length) {
    return { ok: false, error: "No hay ítems en revisión para rechazar" };
  }

  await supabase
    .from("physical_inventory_counts")
    .update({
      rejection_reason: parsed.data.rejection_reason.trim(),
      updated_by: ctx.userId,
    })
    .eq("id", countId)
    .eq("organization_id", ctx.organization.id);

  await syncCountHeaderStatus(
    supabase,
    countId,
    ctx.organization.id,
    ctx.userId,
  );
  revalidatePhysical(countId);
  return { ok: true, id: countId };
}

/** Aplica ajustes de una categoría enviada. Solo Gestión. */
export async function applyPhysicalCountCategoryAction(
  countId: string,
  categoryId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "inventario.fisico.ajustar")) {
    return { ok: false, error: "Sin permiso para ajustar inventario" };
  }

  const supabase = await createClient();
  const { data: count } = await supabase
    .from("physical_inventory_counts")
    .select("id")
    .eq("id", countId)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (!count) return { ok: false, error: "Conteo no encontrado" };

  const { error: catError, ids: productIds } = await productIdsInCategory(
    supabase,
    ctx.organization.id,
    categoryId,
  );
  if (catError) return { ok: false, error: catError };
  if (!productIds.length) return { ok: false, error: "Categoría sin productos" };

  const { data: items } = await supabase
    .from("physical_inventory_count_items")
    .select("id, product_id, system_qty, counted_qty")
    .eq("count_id", countId)
    .eq("organization_id", ctx.organization.id)
    .in("product_id", productIds)
    .eq("status", "ENVIADO")
    .is("deleted_at", null);

  if (!items?.length) {
    return { ok: false, error: "No hay ítems en revisión en esta categoría" };
  }

  const applyError = await applyItemsToStock(
    supabase,
    ctx.organization.id,
    ctx.userId,
    countId,
    items,
  );
  if (applyError) return { ok: false, error: applyError };

  await syncCountHeaderStatus(
    supabase,
    countId,
    ctx.organization.id,
    ctx.userId,
  );

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "ADJUST",
    entity: "physical_inventory_counts",
    entity_id: countId,
    new_values: { category_id: normalizeCategoryId(categoryId) },
  });

  revalidatePhysical(countId);
  return { ok: true, id: countId };
}

/** Aplica diferencias al stock de todos los ítems ENVIADO. Solo Gestión. */
export async function applyPhysicalCountAdjustmentsAction(
  countId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "inventario.fisico.ajustar")) {
    return { ok: false, error: "Sin permiso para ajustar inventario" };
  }

  const supabase = await createClient();
  const { data: count } = await supabase
    .from("physical_inventory_counts")
    .select("id")
    .eq("id", countId)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (!count) return { ok: false, error: "Conteo no encontrado" };

  const { data: items } = await supabase
    .from("physical_inventory_count_items")
    .select("id, product_id, system_qty, counted_qty")
    .eq("count_id", countId)
    .eq("organization_id", ctx.organization.id)
    .eq("status", "ENVIADO")
    .is("deleted_at", null);

  if (!items?.length) return { ok: false, error: "Sin ítems en revisión" };

  const applyError = await applyItemsToStock(
    supabase,
    ctx.organization.id,
    ctx.userId,
    countId,
    items,
  );
  if (applyError) return { ok: false, error: applyError };

  await syncCountHeaderStatus(
    supabase,
    countId,
    ctx.organization.id,
    ctx.userId,
  );

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

async function applyItemsToStock(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string,
  countId: string,
  items: Array<{
    id: string;
    product_id: string;
    system_qty: number | string;
    counted_qty: number | string;
  }>,
): Promise<string | null> {
  const now = new Date().toISOString();

  for (const item of items) {
    const { data: product } = await supabase
      .from("products")
      .select("id, current_stock, unit_cost")
      .eq("id", item.product_id)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!product) continue;

    const stockBefore = Number(product.current_stock || 0);
    const counted = Number(item.counted_qty);
    const diff = counted - stockBefore;

    if (diff !== 0) {
      const { error: updError } = await supabase
        .from("products")
        .update({
          current_stock: counted,
          updated_by: userId,
        })
        .eq("id", product.id)
        .eq("organization_id", organizationId);
      if (updError) return updError.message;

      const { error: movError } = await supabase.from("inventory_movements").insert({
        organization_id: organizationId,
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
        created_by: userId,
      });
      if (movError) return movError.message;
    }

    const { error: itemError } = await supabase
      .from("physical_inventory_count_items")
      .update({
        status: "AJUSTADO",
        reviewed_at: now,
        updated_by: userId,
      })
      .eq("id", item.id)
      .eq("organization_id", organizationId)
      .eq("status", "ENVIADO");
    if (itemError) return itemError.message;
  }

  return null;
}
