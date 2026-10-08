"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess } from "@/lib/permissions";
import { todayInBogota } from "@/lib/dates";
import {
  acceptInvoiceSchema,
  addSupplierPendingItemSchema,
  approvePurchaseItemSchema,
  createPurchaseRequestSchema,
  purchaseRequestItemSchema,
  receivePurchaseItemSchema,
  rejectPurchaseRequestSchema,
  updatePurchaseRequestItemSchema,
} from "@/validations/purchases";
import {
  suggestedPurchaseQty,
  weightedAverageUnitCost,
} from "@/lib/inventory/cost";
import { roundPurchaseQty } from "@/lib/purchases/qty";
import {
  allocateInvoiceCharges,
  chargesTotal,
  merchandiseSubtotal,
  roundMoney,
  type InvoiceCharge,
} from "@/lib/purchases/invoice-charges";
import type { ActionResult } from "../empresa/actions";

function parseInvoiceChargesFromForm(formData: FormData): InvoiceCharge[] {
  const count = Math.min(
    30,
    Math.max(0, Math.floor(Number(formData.get("charge_count") ?? 0) || 0)),
  );
  const charges: InvoiceCharge[] = [];
  for (let i = 0; i < count; i += 1) {
    const concept = String(formData.get(`charge_${i}_concept`) ?? "").trim();
    const amount = parseNumber(String(formData.get(`charge_${i}_amount`) ?? ""));
    if (amount === null || amount <= 0) continue;
    const kindRaw = String(formData.get(`charge_${i}_kind`) ?? "cargo")
      .trim()
      .toLowerCase();
    const kind = kindRaw === "descuento" ? "descuento" : "cargo";
    const affectsRaw = String(
      formData.get(`charge_${i}_affects_cost`) ?? "1",
    ).trim();
    const affectsCost =
      affectsRaw === "1" || affectsRaw === "true" || affectsRaw === "on";
    charges.push({
      concept:
        concept || (kind === "descuento" ? `Descuento ${i + 1}` : `Cargo ${i + 1}`),
      amount: roundMoney(amount),
      kind,
      affectsCost,
    });
  }
  return charges;
}

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

function revalidateCompras(requestId?: string) {
  revalidatePath("/compras");
  revalidatePath("/compras/solicitudes");
  if (requestId) revalidatePath(`/compras/solicitudes/${requestId}`);
  revalidatePath("/compras/inventario");
  revalidatePath("/compras/sugeridos");
  revalidatePath("/compras/inventario-fisico");
  revalidatePath("/solicitudes-pago");
  revalidatePath("/proveedores");
}

function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function ensureAccountsPayable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  supplierId: string,
  userId: string,
) {
  const { data: existing } = await supabase
    .from("accounts_payable")
    .select("id")
    .eq("organization_id", orgId)
    .eq("supplier_id", supplierId)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await supabase
    .from("accounts_payable")
    .insert({
      organization_id: orgId,
      supplier_id: supplierId,
      priority: "NORMAL",
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function createPurchaseRequestAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "compras.solicitudes.crear")) {
    return { ok: false, error: "Sin permiso para crear solicitudes" };
  }

  const parsed = createPurchaseRequestSchema.safeParse({
    title: formData.get("title"),
    notes: formData.get("notes"),
    location_label: formData.get("location_label"),
    requested_at: formData.get("requested_at") || todayInBogota(),
    needed_by: formData.get("needed_by"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchase_requests")
    .insert({
      organization_id: ctx.organization.id,
      status: "BORRADOR",
      title: parsed.data.title.trim(),
      notes: emptyToNull(parsed.data.notes),
      location_label: emptyToNull(parsed.data.location_label),
      requested_at: parsed.data.requested_at,
      needed_by: emptyToNull(parsed.data.needed_by),
      requested_by: ctx.userId,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidateCompras(data.id);
  return { ok: true, id: data.id };
}

export async function addPurchaseRequestItemAction(
  requestId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "compras.solicitudes.crear")) {
    return { ok: false, error: "Sin permiso" };
  }

  const parsed = purchaseRequestItemSchema.safeParse({
    product_id: formData.get("product_id"),
    quantity_requested: formData.get("quantity_requested"),
    suggested_supplier_id: formData.get("suggested_supplier_id"),
    unit_cost_estimate: formData.get("unit_cost_estimate"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const qty = parseNumber(parsed.data.quantity_requested);
  if (qty === null || qty <= 0) return { ok: false, error: "Cantidad inválida" };

  const supabase = await createClient();
  const { data: request } = await supabase
    .from("purchase_requests")
    .select("id, status")
    .eq("id", requestId)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!request) return { ok: false, error: "Solicitud no encontrada" };
  if (request.status !== "BORRADOR") {
    return { ok: false, error: "Solo se editan borradores" };
  }

  const { data: product } = await supabase
    .from("products")
    .select("id, category_id, unit")
    .eq("id", parsed.data.product_id)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!product) return { ok: false, error: "Producto no encontrado" };

  let suggested = emptyToNull(parsed.data.suggested_supplier_id);
  if (!suggested) {
    const { data: links } = await supabase
      .from("supplier_product_categories")
      .select("supplier_id")
      .eq("organization_id", ctx.organization.id)
      .eq("category_id", product.category_id)
      .eq("is_active", true)
      .is("deleted_at", null)
      .limit(1);
    suggested = links?.[0]?.supplier_id ?? null;
  }

  const { data: existingItem } = await supabase
    .from("purchase_request_items")
    .select("id, quantity_requested")
    .eq("purchase_request_id", requestId)
    .eq("product_id", product.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (existingItem) {
    const { error } = await supabase
      .from("purchase_request_items")
      .update({
        quantity_requested: qty,
        suggested_supplier_id: suggested,
        unit_cost_estimate: parseNumber(parsed.data.unit_cost_estimate),
        notes: emptyToNull(parsed.data.notes),
        updated_by: ctx.userId,
      })
      .eq("id", existingItem.id)
      .eq("organization_id", ctx.organization.id);
    if (error) return { ok: false, error: error.message };
    revalidateCompras(requestId);
    return { ok: true, id: existingItem.id };
  }

  const { count } = await supabase
    .from("purchase_request_items")
    .select("id", { count: "exact", head: true })
    .eq("purchase_request_id", requestId)
    .is("deleted_at", null);

  const { data, error } = await supabase
    .from("purchase_request_items")
    .insert({
      organization_id: ctx.organization.id,
      purchase_request_id: requestId,
      product_id: product.id,
      category_id: product.category_id,
      quantity_requested: qty,
      unit: product.unit,
      suggested_supplier_id: suggested,
      unit_cost_estimate: parseNumber(parsed.data.unit_cost_estimate),
      notes: emptyToNull(parsed.data.notes),
      sort_order: count ?? 0,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidateCompras(requestId);
  return { ok: true, id: data.id };
}

/** Agrega varios productos de una misma categoría a la solicitud. */
export async function addPurchaseRequestItemsByCategoryAction(
  requestId: string,
  formData: FormData,
): Promise<ActionResult & { created?: number }> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "compras.solicitudes.crear")) {
    return { ok: false, error: "Sin permiso" };
  }

  const categoryId = String(formData.get("category_id") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(categoryId)) {
    return { ok: false, error: "Seleccione una categoría" };
  }

  const productIds = formData
    .getAll("product_ids")
    .map((v) => String(v))
    .filter((v) => /^[0-9a-f-]{36}$/i.test(v));
  if (productIds.length === 0) {
    return { ok: false, error: "Seleccione al menos un producto" };
  }

  const supabase = await createClient();
  const { data: request } = await supabase
    .from("purchase_requests")
    .select("id, status")
    .eq("id", requestId)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!request) return { ok: false, error: "Solicitud no encontrada" };
  if (request.status !== "BORRADOR") {
    return { ok: false, error: "Solo se editan borradores" };
  }

  const { data: products } = await supabase
    .from("products")
    .select("id, category_id, unit, unit_cost")
    .eq("organization_id", ctx.organization.id)
    .eq("category_id", categoryId)
    .is("deleted_at", null)
    .eq("is_active", true)
    .in("id", productIds);

  if (!products?.length) {
    return { ok: false, error: "No hay productos válidos en esa categoría" };
  }

  for (const product of products) {
    const suggested = emptyToNull(
      String(formData.get(`supplier_${product.id}`) ?? ""),
    );
    if (!suggested) {
      return {
        ok: false,
        error: "Asigne un proveedor a cada producto seleccionado",
      };
    }
  }

  const { data: existingItems } = await supabase
    .from("purchase_request_items")
    .select("id, product_id")
    .eq("purchase_request_id", requestId)
    .is("deleted_at", null);

  const existingByProduct = new Map(
    (existingItems ?? []).map((i) => [i.product_id, i]),
  );
  let sortOrder = existingItems?.length ?? 0;
  let created = 0;

  for (const product of products) {
    const qty =
      parseNumber(String(formData.get(`qty_${product.id}`) || "")) ?? 1;
    if (qty <= 0) continue;

    const suggested = emptyToNull(
      String(formData.get(`supplier_${product.id}`) ?? ""),
    );
    if (!suggested) {
      return {
        ok: false,
        error: "Asigne un proveedor a cada producto seleccionado",
      };
    }

    const existing = existingByProduct.get(product.id);
    if (existing) {
      const { error } = await supabase
        .from("purchase_request_items")
        .update({
          quantity_requested: qty,
          suggested_supplier_id: suggested,
          unit_cost_estimate: Number(product.unit_cost || 0),
          updated_by: ctx.userId,
        })
        .eq("id", existing.id)
        .eq("organization_id", ctx.organization.id);
      if (error) return { ok: false, error: error.message };
      created += 1;
      continue;
    }

    const { error } = await supabase.from("purchase_request_items").insert({
      organization_id: ctx.organization.id,
      purchase_request_id: requestId,
      product_id: product.id,
      category_id: product.category_id,
      quantity_requested: qty,
      unit: product.unit,
      suggested_supplier_id: suggested,
      unit_cost_estimate: Number(product.unit_cost || 0),
      sort_order: sortOrder,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    });
    if (error) return { ok: false, error: error.message };
    sortOrder += 1;
    created += 1;
  }

  if (created === 0) {
    return { ok: false, error: "No se agregó ningún producto" };
  }

  revalidateCompras(requestId);
  return { ok: true, id: requestId, created };
}

export async function updatePurchaseRequestItemAction(
  requestId: string,
  itemId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "compras.solicitudes.crear")) {
    return { ok: false, error: "Sin permiso" };
  }

  const parsed = updatePurchaseRequestItemSchema.safeParse({
    quantity_requested: formData.get("quantity_requested"),
    suggested_supplier_id: formData.get("suggested_supplier_id"),
    unit_cost_estimate: formData.get("unit_cost_estimate"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const qty = parseNumber(parsed.data.quantity_requested);
  if (qty === null || qty <= 0) return { ok: false, error: "Cantidad inválida" };

  const supabase = await createClient();
  const { data: request } = await supabase
    .from("purchase_requests")
    .select("status")
    .eq("id", requestId)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (!request || request.status !== "BORRADOR") {
    return { ok: false, error: "Solo se editan borradores" };
  }

  const { error } = await supabase
    .from("purchase_request_items")
    .update({
      quantity_requested: qty,
      suggested_supplier_id: emptyToNull(parsed.data.suggested_supplier_id),
      unit_cost_estimate: parseNumber(parsed.data.unit_cost_estimate),
      notes: emptyToNull(parsed.data.notes),
      updated_by: ctx.userId,
    })
    .eq("id", itemId)
    .eq("purchase_request_id", requestId)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null);

  if (error) return { ok: false, error: error.message };
  revalidateCompras(requestId);
  return { ok: true, id: itemId };
}

export async function importSuggestedProductsAction(
  requestId: string,
  formData?: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "compras.solicitudes.crear")) {
    return { ok: false, error: "Sin permiso" };
  }

  const supabase = await createClient();
  const { data: request } = await supabase
    .from("purchase_requests")
    .select("id, status")
    .eq("id", requestId)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!request) return { ok: false, error: "Solicitud no encontrada" };
  if (request.status !== "BORRADOR") {
    return { ok: false, error: "Solo se editan borradores" };
  }

  const selectedIds = formData
    ? formData
        .getAll("product_ids")
        .map((v) => String(v))
        .filter((v) => /^[0-9a-f-]{36}$/i.test(v))
    : [];

  const { data: products } = await supabase
    .from("products")
    .select("id, category_id, unit, current_stock, min_stock, unit_cost")
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .eq("is_active", true);

  const suggested = (products ?? [])
    .map((p) => ({
      ...p,
      qty: suggestedPurchaseQty(Number(p.current_stock), Number(p.min_stock)),
    }))
    .filter((p) => p.qty > 0)
    .filter((p) => selectedIds.length === 0 || selectedIds.includes(p.id));

  if (suggested.length === 0) {
    return {
      ok: false,
      error:
        selectedIds.length > 0
          ? "Seleccione al menos un producto sugerido"
          : "No hay productos bajo stock mínimo para sugerir",
    };
  }

  const { data: existingItems } = await supabase
    .from("purchase_request_items")
    .select("id, product_id, quantity_requested")
    .eq("purchase_request_id", requestId)
    .is("deleted_at", null);

  const existingByProduct = new Map(
    (existingItems ?? []).map((i) => [i.product_id, i]),
  );

  const { data: links } = await supabase
    .from("supplier_product_categories")
    .select("supplier_id, category_id")
    .eq("organization_id", ctx.organization.id)
    .eq("is_active", true)
    .is("deleted_at", null);

  const supplierByCategory = new Map<string, string>();
  for (const link of links ?? []) {
    if (!supplierByCategory.has(link.category_id)) {
      supplierByCategory.set(link.category_id, link.supplier_id);
    }
  }

  let sortOrder = existingItems?.length ?? 0;
  let imported = 0;

  for (const product of suggested) {
    const suggestedSupplier = supplierByCategory.get(product.category_id) ?? null;
    const existing = existingByProduct.get(product.id);
    const qtyOverride = formData
      ? parseNumber(String(formData.get(`qty_${product.id}`) || ""))
      : null;
    const qty = qtyOverride && qtyOverride > 0 ? qtyOverride : product.qty;

    if (existing) {
      const { error } = await supabase
        .from("purchase_request_items")
        .update({
          quantity_requested: qty,
          suggested_supplier_id: suggestedSupplier,
          unit_cost_estimate: Number(product.unit_cost || 0),
          updated_by: ctx.userId,
        })
        .eq("id", existing.id)
        .eq("organization_id", ctx.organization.id);
      if (error) return { ok: false, error: error.message };
      imported += 1;
      continue;
    }

    const { error } = await supabase.from("purchase_request_items").insert({
      organization_id: ctx.organization.id,
      purchase_request_id: requestId,
      product_id: product.id,
      category_id: product.category_id,
      quantity_requested: qty,
      unit: product.unit,
      suggested_supplier_id: suggestedSupplier,
      unit_cost_estimate: Number(product.unit_cost || 0),
      notes: "Importado desde sugeridos",
      sort_order: sortOrder,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    });
    if (error) return { ok: false, error: error.message };
    sortOrder += 1;
    imported += 1;
  }

  if (imported === 0) {
    return { ok: false, error: "No se importó ningún producto" };
  }

  revalidateCompras(requestId);
  return { ok: true, id: requestId };
}

export async function removePurchaseRequestItemAction(
  requestId: string,
  itemId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "compras.solicitudes.crear")) {
    return { ok: false, error: "Sin permiso" };
  }

  const supabase = await createClient();
  const { data: request } = await supabase
    .from("purchase_requests")
    .select("status")
    .eq("id", requestId)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (!request || request.status !== "BORRADOR") {
    return { ok: false, error: "Solo se editan borradores" };
  }

  const { error } = await supabase
    .from("purchase_request_items")
    .update({
      deleted_at: new Date().toISOString(),
      status: "CANCELADO",
      updated_by: ctx.userId,
    })
    .eq("id", itemId)
    .eq("purchase_request_id", requestId)
    .eq("organization_id", ctx.organization.id);

  if (error) return { ok: false, error: error.message };
  revalidateCompras(requestId);
  return { ok: true, id: itemId };
}

export async function submitPurchaseRequestAction(
  requestId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "compras.solicitudes.crear")) {
    return { ok: false, error: "Sin permiso" };
  }

  const supabase = await createClient();
  const { data: items } = await supabase
    .from("purchase_request_items")
    .select("id")
    .eq("purchase_request_id", requestId)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null);

  if (!items?.length) {
    return { ok: false, error: "Agregue al menos un producto" };
  }

  const { error } = await supabase
    .from("purchase_requests")
    .update({
      status: "ENVIADA",
      submitted_at: new Date().toISOString(),
      updated_by: ctx.userId,
    })
    .eq("id", requestId)
    .eq("organization_id", ctx.organization.id)
    .eq("status", "BORRADOR");

  if (error) return { ok: false, error: error.message };
  revalidateCompras(requestId);
  return { ok: true, id: requestId };
}

export async function approvePurchaseRequestAction(
  requestId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "compras.solicitudes.aprobar")) {
    return { ok: false, error: "Sin permiso para aprobar compras" };
  }

  const supabase = await createClient();
  const { data: request } = await supabase
    .from("purchase_requests")
    .select("id, status")
    .eq("id", requestId)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!request) return { ok: false, error: "Solicitud no encontrada" };
  if (request.status !== "ENVIADA") {
    return { ok: false, error: "Solo se aprueban solicitudes enviadas" };
  }

  const { data: items } = await supabase
    .from("purchase_request_items")
    .select("id, suggested_supplier_id, quantity_requested, category_id")
    .eq("purchase_request_id", requestId)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null);

  if (!items?.length) return { ok: false, error: "Sin ítems" };

  const supplierIds = [
    ...new Set(
      items
        .map((i) => i.suggested_supplier_id)
        .filter((id): id is string => !!id),
    ),
  ];

  const { data: suppliers } = supplierIds.length
    ? await supabase
        .from("suppliers")
        .select("id, lead_time_days")
        .in("id", supplierIds)
    : { data: [] as { id: string; lead_time_days: number | null }[] };

  const { data: links } = await supabase
    .from("supplier_product_categories")
    .select("supplier_id, category_id, lead_time_days")
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .eq("is_active", true);

  const supplierLead = new Map(
    (suppliers ?? []).map((s) => [s.id, s.lead_time_days]),
  );
  const today = todayInBogota();

  for (const item of items) {
    const prefix = `item_${item.id}_`;
    const parsed = approvePurchaseItemSchema.safeParse({
      item_id: item.id,
      approved_supplier_id:
        formData.get(`${prefix}approved_supplier_id`) ||
        item.suggested_supplier_id,
      quantity_approved:
        formData.get(`${prefix}quantity_approved`) ||
        String(item.quantity_requested),
      expected_delivery_date: formData.get(`${prefix}expected_delivery_date`),
      unit_cost_estimate: formData.get(`${prefix}unit_cost_estimate`),
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Ítem inválido",
      };
    }

    const qty = parseNumber(parsed.data.quantity_approved);
    if (qty === null || qty < 0) return { ok: false, error: "Cantidad aprobada inválida" };

    let expected = emptyToNull(parsed.data.expected_delivery_date);
    if (!expected) {
      const linkLead = (links ?? []).find(
        (l) =>
          l.supplier_id === parsed.data.approved_supplier_id &&
          l.category_id === item.category_id,
      )?.lead_time_days;
      const days =
        linkLead ?? supplierLead.get(parsed.data.approved_supplier_id) ?? 3;
      expected = addDays(today, Number(days));
    }

    const { error } = await supabase
      .from("purchase_request_items")
      .update({
        approved_supplier_id: parsed.data.approved_supplier_id,
        quantity_approved: qty,
        expected_delivery_date: expected,
        unit_cost_estimate: parseNumber(parsed.data.unit_cost_estimate),
        status: "APROBADO",
        updated_by: ctx.userId,
      })
      .eq("id", item.id)
      .eq("organization_id", ctx.organization.id);

    if (error) return { ok: false, error: error.message };
  }

  const { error } = await supabase
    .from("purchase_requests")
    .update({
      status: "PEDIDA",
      approved_at: new Date().toISOString(),
      ordered_at: new Date().toISOString(),
      approved_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .eq("id", requestId)
    .eq("organization_id", ctx.organization.id);

  if (error) return { ok: false, error: error.message };

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "APPROVE",
    entity: "purchase_requests",
    entity_id: requestId,
  });

  revalidateCompras(requestId);
  return { ok: true, id: requestId };
}

export async function rejectPurchaseRequestAction(
  requestId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "compras.solicitudes.aprobar")) {
    return { ok: false, error: "Sin permiso" };
  }

  const parsed = rejectPurchaseRequestSchema.safeParse({
    rejection_reason: formData.get("rejection_reason"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("purchase_requests")
    .update({
      status: "RECHAZADA",
      rejection_reason: parsed.data.rejection_reason.trim(),
      approved_by: ctx.userId,
      approved_at: new Date().toISOString(),
      updated_by: ctx.userId,
    })
    .eq("id", requestId)
    .eq("organization_id", ctx.organization.id)
    .eq("status", "ENVIADA");

  if (error) return { ok: false, error: error.message };
  revalidateCompras(requestId);
  return { ok: true, id: requestId };
}

function isPurchaseItemClosed(item: {
  status: string;
  quantity_approved: number | string | null;
  quantity_requested: number | string;
  quantity_received: number | string;
}) {
  if (item.status === "CANCELADO" || item.status === "RECIBIDO") return true;
  const target = roundPurchaseQty(
    Number(item.quantity_approved ?? item.quantity_requested),
  );
  const received = roundPurchaseQty(Number(item.quantity_received || 0));
  return received >= target;
}

export async function receivePurchaseItemsAction(
  requestId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "compras.solicitudes.recibir")) {
    return { ok: false, error: "Sin permiso para recibir" };
  }

  const supabase = await createClient();
  const { data: request } = await supabase
    .from("purchase_requests")
    .select("id, status, payment_request_id")
    .eq("id", requestId)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();

  if (!request) return { ok: false, error: "Solicitud no encontrada" };
  // FACTURA_ACEPTADA también: puede quedar remanente pendiente tras facturar lo parcial.
  if (!["PEDIDA", "RECIBIDA_PARCIAL", "FACTURA_ACEPTADA"].includes(request.status)) {
    return { ok: false, error: "La solicitud no está pendiente de recepción" };
  }

  const { data: items } = await supabase
    .from("purchase_request_items")
    .select(
      "id, product_id, quantity_approved, quantity_requested, quantity_received, unit_cost_estimate, status, notes",
    )
    .eq("purchase_request_id", requestId)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null);

  if (!items?.length) return { ok: false, error: "Sin ítems" };

  let touched = 0;

  for (const item of items) {
    if (isPurchaseItemClosed(item)) continue;

    const disposition = String(
      formData.get(`item_${item.id}_disposition`) ?? "pendiente",
    ).trim();

    if (disposition === "pendiente" || disposition === "") continue;

    if (disposition === "no_llegara") {
      const reason = emptyToNull(
        String(formData.get(`item_${item.id}_close_reason`) ?? ""),
      );
      const previous = Number(item.quantity_received || 0);
      const noteParts = [
        item.notes,
        reason
          ? `Cierre faltante: ${reason}`
          : "Cierre faltante: no llegará el resto",
      ].filter(Boolean);

      const { error } = await supabase
        .from("purchase_request_items")
        .update({
          status: "CANCELADO",
          notes: noteParts.join(" · "),
          updated_by: ctx.userId,
        })
        .eq("id", item.id)
        .eq("organization_id", ctx.organization.id);
      if (error) return { ok: false, error: error.message };
      touched += 1;
      // Si ya había recepción parcial, el stock ya se movió; no se toca.
      void previous;
      continue;
    }

    if (disposition !== "llego") {
      return { ok: false, error: "Disposición de ítem inválida" };
    }

    const raw = formData.get(`item_${item.id}_quantity_received`);
    const parsed = receivePurchaseItemSchema.safeParse({
      item_id: item.id,
      quantity_received: String(raw ?? ""),
      unit_cost: formData.get(`item_${item.id}_unit_cost`),
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Cantidad inválida" };
    }

    const receivedNow = parseNumber(parsed.data.quantity_received);
    if (receivedNow === null || receivedNow <= 0) {
      return {
        ok: false,
        error: "Indique una cantidad recibida mayor a 0, o marque pendiente / no llegará",
      };
    }

    const previous = roundPurchaseQty(Number(item.quantity_received || 0));
    const totalReceived = roundPurchaseQty(previous + receivedNow);
    const target = roundPurchaseQty(
      Number(item.quantity_approved ?? item.quantity_requested),
    );
    const status =
      totalReceived >= target ? "RECIBIDO" : "RECIBIDO_PARCIAL";

    const incomingCost = parseNumber(parsed.data.unit_cost);
    if (incomingCost === null || incomingCost <= 0) {
      return {
        ok: false,
        error:
          "Indique el costo total de cada entrega (mayor a 0). No se puede recibir sin valor.",
      };
    }

    const { error } = await supabase
      .from("purchase_request_items")
      .update({
        quantity_received: totalReceived,
        status,
        unit_cost_estimate: incomingCost,
        updated_by: ctx.userId,
      })
      .eq("id", item.id)
      .eq("organization_id", ctx.organization.id);
    if (error) return { ok: false, error: error.message };
    touched += 1;

    const { data: product } = await supabase
      .from("products")
      .select("current_stock, unit_cost")
      .eq("id", item.product_id)
      .eq("organization_id", ctx.organization.id)
      .maybeSingle();
    if (product) {
      const stockBefore = Number(product.current_stock || 0);
      const costBefore = Number(product.unit_cost || 0);
      const costIn = incomingCost;
      const stockAfter = stockBefore + receivedNow;
      const costAfter = weightedAverageUnitCost(
        stockBefore,
        costBefore,
        receivedNow,
        costIn,
      );

      await supabase
        .from("products")
        .update({
          current_stock: stockAfter,
          unit_cost: costAfter,
          updated_by: ctx.userId,
        })
        .eq("id", item.product_id);

      await supabase.from("inventory_movements").insert({
        organization_id: ctx.organization.id,
        product_id: item.product_id,
        movement_type: "COMPRA",
        quantity: receivedNow,
        unit_cost: costIn,
        stock_before: stockBefore,
        stock_after: stockAfter,
        unit_cost_before: costBefore,
        unit_cost_after: costAfter,
        reference_type: "purchase_request_items",
        reference_id: item.id,
        notes: `Recepción solicitud ${requestId}`,
        created_by: ctx.userId,
      });
    }
  }

  if (touched === 0) {
    return {
      ok: false,
      error: "Marque al menos un ítem como «Llegó» o «No llegará»",
    };
  }

  const { data: refreshed } = await supabase
    .from("purchase_request_items")
    .select("quantity_approved, quantity_requested, quantity_received, status")
    .eq("purchase_request_id", requestId)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null);

  const allClosed = (refreshed ?? []).every((i) => isPurchaseItemClosed(i));
  const anyReceived = (refreshed ?? []).some(
    (i) => Number(i.quantity_received || 0) > 0,
  );
  const alreadyInvoiced = Boolean(request.payment_request_id);

  const nextStatus = allClosed
    ? alreadyInvoiced
      ? "FACTURA_ACEPTADA"
      : "RECIBIDA"
    : anyReceived
      ? "RECIBIDA_PARCIAL"
      : request.status;

  await supabase
    .from("purchase_requests")
    .update({
      status: nextStatus,
      received_at: allClosed ? new Date().toISOString() : null,
      updated_by: ctx.userId,
    })
    .eq("id", requestId)
    .eq("organization_id", ctx.organization.id);

  revalidateCompras(requestId);
  return { ok: true, id: requestId };
}

/**
 * Agrega un producto al pedido de un proveedor en recepción.
 * Queda pendiente (APROBADO), igual que los demás; se recibe después.
 */
export async function addSupplierPendingItemAction(
  requestId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "compras.solicitudes.recibir.extras")) {
    return {
      ok: false,
      error: "Sin permiso para agregar productos al pedido en recepción",
    };
  }

  const parsed = addSupplierPendingItemSchema.safeParse({
    product_id: formData.get("product_id"),
    supplier_id: formData.get("supplier_id"),
    quantity: formData.get("quantity") ?? formData.get("quantity_received"),
    unit_cost_estimate:
      formData.get("unit_cost_estimate") ?? formData.get("unit_cost"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const qty = parseNumber(parsed.data.quantity);
  if (qty === null || qty <= 0) return { ok: false, error: "Cantidad inválida" };

  const supabase = await createClient();
  const { data: request } = await supabase
    .from("purchase_requests")
    .select("id, status")
    .eq("id", requestId)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();

  if (!request) return { ok: false, error: "Solicitud no encontrada" };
  if (
    !["PEDIDA", "RECIBIDA", "RECIBIDA_PARCIAL", "FACTURA_ACEPTADA"].includes(
      request.status,
    )
  ) {
    return {
      ok: false,
      error: "Solo se pueden agregar productos cuando el pedido ya está en recepción",
    };
  }

  const { data: product } = await supabase
    .from("products")
    .select("id, category_id, unit, unit_cost, name")
    .eq("id", parsed.data.product_id)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!product) return { ok: false, error: "Producto no encontrado" };

  const { data: supplier } = await supabase
    .from("suppliers")
    .select("id")
    .eq("id", parsed.data.supplier_id)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .eq("is_purchase_supplier", true)
    .maybeSingle();
  if (!supplier) return { ok: false, error: "Proveedor de insumos inválido" };

  const { data: categoryLink } = await supabase
    .from("supplier_product_categories")
    .select("id")
    .eq("organization_id", ctx.organization.id)
    .eq("supplier_id", parsed.data.supplier_id)
    .eq("category_id", product.category_id)
    .is("deleted_at", null)
    .eq("is_active", true)
    .maybeSingle();
  if (!categoryLink) {
    return {
      ok: false,
      error:
        "Este producto es de una categoría que el proveedor no tiene asignada. Asigne la categoría en Proveedores o elija otro producto.",
    };
  }

  const unitCostIn =
    parseNumber(parsed.data.unit_cost_estimate) ??
    Number(product.unit_cost || 0);
  const note =
    emptyToNull(parsed.data.notes) ||
    "Agregado al pedido en recepción (no estaba en el original)";

  const { data: existingItems } = await supabase
    .from("purchase_request_items")
    .select(
      "id, quantity_approved, quantity_requested, quantity_received, unit_cost_estimate, status, notes, approved_supplier_id, suggested_supplier_id, invoice_payment_request_id",
    )
    .eq("purchase_request_id", requestId)
    .eq("organization_id", ctx.organization.id)
    .eq("product_id", product.id)
    .is("deleted_at", null);

  const openSameSupplier = (existingItems ?? []).find((i) => {
    const sid = i.approved_supplier_id ?? i.suggested_supplier_id;
    if (sid !== parsed.data.supplier_id || i.invoice_payment_request_id) {
      return false;
    }
    return !isPurchaseItemClosed(i);
  });

  let itemId: string;

  if (openSameSupplier) {
    const ordered = Number(
      openSameSupplier.quantity_approved ??
        openSameSupplier.quantity_requested ??
        0,
    );
    const nextQty = ordered + qty;
    const noteParts = [openSameSupplier.notes, note].filter(Boolean);
    const { error } = await supabase
      .from("purchase_request_items")
      .update({
        quantity_requested: Math.max(
          Number(openSameSupplier.quantity_requested || 0),
          nextQty,
        ),
        quantity_approved: nextQty,
        unit_cost_estimate: unitCostIn || openSameSupplier.unit_cost_estimate,
        approved_supplier_id: parsed.data.supplier_id,
        notes: noteParts.join(" · "),
        updated_by: ctx.userId,
      })
      .eq("id", openSameSupplier.id)
      .eq("organization_id", ctx.organization.id);
    if (error) return { ok: false, error: error.message };
    itemId = openSameSupplier.id;
  } else {
    const { data: maxSort } = await supabase
      .from("purchase_request_items")
      .select("sort_order")
      .eq("purchase_request_id", requestId)
      .eq("organization_id", ctx.organization.id)
      .is("deleted_at", null)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: created, error } = await supabase
      .from("purchase_request_items")
      .insert({
        organization_id: ctx.organization.id,
        purchase_request_id: requestId,
        product_id: product.id,
        category_id: product.category_id,
        quantity_requested: qty,
        quantity_approved: qty,
        quantity_received: 0,
        unit: product.unit,
        suggested_supplier_id: parsed.data.supplier_id,
        approved_supplier_id: parsed.data.supplier_id,
        unit_cost_estimate: unitCostIn || null,
        status: "APROBADO",
        notes: note,
        sort_order: (maxSort?.sort_order ?? 0) + 1,
        created_by: ctx.userId,
        updated_by: ctx.userId,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    itemId = created.id;
  }

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "ADD_PENDING_ITEM",
    entity: "purchase_requests",
    entity_id: requestId,
    new_values: {
      item_id: itemId,
      product_id: product.id,
      supplier_id: parsed.data.supplier_id,
      quantity: qty,
    },
  });

  revalidateCompras(requestId);
  return { ok: true, id: itemId };
}

/** @deprecated alias — usar addSupplierPendingItemAction */
export async function addReceivedExtraItemAction(
  requestId: string,
  formData: FormData,
): Promise<ActionResult> {
  return addSupplierPendingItemAction(requestId, formData);
}

export async function acceptPurchaseInvoiceAction(
  requestId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  const canFacturar =
    ctxCanAccess(ctx, "compras.solicitudes.facturar") ||
    ctxCanAccess(ctx, "compras.solicitudes.aprobar") ||
    ctxCanAccess(ctx, "compras.solicitudes.recibir");
  if (!canFacturar) {
    return { ok: false, error: "Sin permiso para aceptar factura" };
  }

  const parsed = acceptInvoiceSchema.safeParse({
    supplier_id: formData.get("supplier_id"),
    amount: formData.get("amount"),
    document_number: formData.get("document_number"),
    document_type: formData.get("document_type") || "FACTURA",
    issue_date: formData.get("issue_date") || todayInBogota(),
    due_date: formData.get("due_date"),
    concept: formData.get("concept"),
    priority: formData.get("priority") || "NORMAL",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supplierId = parsed.data.supplier_id;
  const payPriority = parsed.data.priority || "NORMAL";
  const apPriority =
    payPriority === "BAJA"
      ? ("NEGOCIABLE" as const)
      : (payPriority as "CRITICA" | "ALTA" | "NORMAL");

  const supabase = await createClient();
  const { data: request } = await supabase
    .from("purchase_requests")
    .select("id, status, title")
    .eq("id", requestId)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();

  if (!request) return { ok: false, error: "Solicitud no encontrada" };
  if (
    !["PEDIDA", "RECIBIDA", "RECIBIDA_PARCIAL", "FACTURA_ACEPTADA"].includes(
      request.status,
    )
  ) {
    return { ok: false, error: "La solicitud no admite factura en este estado" };
  }

  const { data: itemRows } = await supabase
    .from("purchase_request_items")
    .select(
      "id, product_id, quantity_approved, quantity_requested, quantity_received, unit_cost_estimate, status, approved_supplier_id, suggested_supplier_id, invoice_payment_request_id",
    )
    .eq("purchase_request_id", requestId)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null);

  const supplierItems = (itemRows ?? []).filter((i) => {
    const sid = i.approved_supplier_id ?? i.suggested_supplier_id;
    return sid === supplierId;
  });
  if (supplierItems.length === 0) {
    return { ok: false, error: "Ese proveedor no tiene ítems en esta solicitud" };
  }

  const toInvoice = supplierItems.filter(
    (i) =>
      Number(i.quantity_received || 0) > 0 && !i.invoice_payment_request_id,
  );
  if (toInvoice.length === 0) {
    return {
      ok: false,
      error:
        "No hay mercancía recibida sin facturar para este proveedor. Primero registre la recepción de sus ítems.",
    };
  }

  const charges = parseInvoiceChargesFromForm(formData);
  const billableLines = toInvoice.map((i) => ({
    itemId: i.id,
    productId: i.product_id,
    receivedQty: roundPurchaseQty(Number(i.quantity_received || 0)),
    unitCost: Number(i.unit_cost_estimate || 0),
  }));
  const merchandise = merchandiseSubtotal(billableLines);
  const extras = chargesTotal(charges);
  const computedTotal = roundMoney(merchandise + extras);
  const amountIn = parseNumber(parsed.data.amount);
  // Prioriza el total calculado (mercancía + cargos); el monto del form es respaldo.
  if (computedTotal <= 0) {
    return {
      ok: false,
      error:
        "El total de la factura debe ser mayor a 0. Revise descuentos vs mercancía.",
    };
  }
  const amount =
    computedTotal > 0
      ? computedTotal
      : amountIn != null && amountIn > 0
        ? roundMoney(amountIn)
        : null;
  if (amount === null || amount <= 0) return { ok: false, error: "Monto inválido" };

  const allocations = allocateInvoiceCharges(billableLines, charges);

  let apId: string;
  try {
    apId = await ensureAccountsPayable(
      supabase,
      ctx.organization.id,
      supplierId,
      ctx.userId,
    );
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error CxP" };
  }

  const chargeSummary =
    charges.length > 0
      ? charges
          .map((c) => {
            const sign = c.kind === "descuento" ? "−" : "+";
            const tag = c.kind === "descuento" ? "descuento" : "cargo";
            return `${tag} ${c.concept}: ${sign}${c.amount}${
              c.affectsCost ? " (→ costo)" : ""
            }`;
          })
          .join("; ")
      : null;

  const concept =
    emptyToNull(parsed.data.concept) ||
    `Compra: ${request.title} · proveedor`;

  const { data: doc, error: docError } = await supabase
    .from("accounts_payable_documents")
    .insert({
      organization_id: ctx.organization.id,
      accounts_payable_id: apId,
      supplier_id: supplierId,
      document_type: parsed.data.document_type || "FACTURA",
      document_number: emptyToNull(parsed.data.document_number),
      issue_date: emptyToNull(parsed.data.issue_date),
      due_date: emptyToNull(parsed.data.due_date),
      concept,
      original_amount: amount,
      paid_amount: 0,
      status: "ABIERTA",
      priority: apPriority,
      verification_status: "CONFIRMADO",
      source: "compras",
      validated_by: ctx.userId,
      validated_at: new Date().toISOString(),
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (docError) return { ok: false, error: docError.message };

  const payNotes = [
    `Desde compra ${requestId} · proveedor ${supplierId}`,
    `Mercancía ${merchandise}`,
    chargeSummary ? `Ajustes: ${chargeSummary}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const { data: payReq, error: payError } = await supabase
    .from("payment_requests")
    .insert({
      organization_id: ctx.organization.id,
      source: "FACTURA_PROVEEDOR",
      status: "EN_COLA_PAGO",
      priority: payPriority,
      concept,
      amount,
      requested_at: todayInBogota(),
      due_date: emptyToNull(parsed.data.due_date),
      supplier_id: supplierId,
      ap_document_id: doc.id,
      document_type: parsed.data.document_type || "FACTURA",
      document_number: emptyToNull(parsed.data.document_number),
      issue_date: emptyToNull(parsed.data.issue_date),
      notes: payNotes,
      requested_by: ctx.userId,
      approved_by: ctx.userId,
      approved_at: new Date().toISOString(),
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (payError) return { ok: false, error: payError.message };

  // Costo aterrizado (cargos + / descuentos −): actualiza ítem y promedio del producto.
  for (const alloc of allocations) {
    if (alloc.allocatedExtra === 0) continue;

    await supabase
      .from("purchase_request_items")
      .update({
        unit_cost_estimate: alloc.landedUnitCost,
        updated_by: ctx.userId,
      })
      .eq("id", alloc.itemId)
      .eq("organization_id", ctx.organization.id);

    const { data: product } = await supabase
      .from("products")
      .select("id, current_stock, unit_cost")
      .eq("id", alloc.productId)
      .eq("organization_id", ctx.organization.id)
      .maybeSingle();
    if (!product) continue;

    const stock = Number(product.current_stock || 0);
    const costBefore = Number(product.unit_cost || 0);
    const rawAfter =
      stock > 0
        ? (stock * costBefore + alloc.allocatedExtra) / stock
        : alloc.landedUnitCost;
    const costAfter = Math.max(0, rawAfter);

    await supabase
      .from("products")
      .update({
        unit_cost: costAfter,
        updated_by: ctx.userId,
      })
      .eq("id", product.id)
      .eq("organization_id", ctx.organization.id);
  }

  const stampIds = toInvoice.map((i) => i.id);
  const { error: stampError } = await supabase
    .from("purchase_request_items")
    .update({
      invoice_payment_request_id: payReq.id,
      invoice_ap_document_id: doc.id,
      updated_by: ctx.userId,
    })
    .eq("organization_id", ctx.organization.id)
    .in("id", stampIds);
  if (stampError) return { ok: false, error: stampError.message };

  const { data: refreshed } = await supabase
    .from("purchase_request_items")
    .select(
      "quantity_approved, quantity_requested, quantity_received, status, invoice_payment_request_id",
    )
    .eq("purchase_request_id", requestId)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null);

  const allClosed = (refreshed ?? []).every((i) => isPurchaseItemClosed(i));
  const anyUninvoicedReceived = (refreshed ?? []).some(
    (i) =>
      Number(i.quantity_received || 0) > 0 && !i.invoice_payment_request_id,
  );
  const anyReceived = (refreshed ?? []).some(
    (i) => Number(i.quantity_received || 0) > 0,
  );

  const nextStatus =
    allClosed && !anyUninvoicedReceived
      ? "FACTURA_ACEPTADA"
      : anyReceived
        ? "RECIBIDA_PARCIAL"
        : request.status;

  const { error } = await supabase
    .from("purchase_requests")
    .update({
      status: nextStatus,
      invoice_accepted_at: new Date().toISOString(),
      ap_document_id: doc.id,
      payment_request_id: payReq.id,
      updated_by: ctx.userId,
    })
    .eq("id", requestId)
    .eq("organization_id", ctx.organization.id);

  if (error) return { ok: false, error: error.message };

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "INVOICE_ACCEPT",
    entity: "purchase_requests",
    entity_id: requestId,
    new_values: {
      ap_document_id: doc.id,
      payment_request_id: payReq.id,
      supplier_id: supplierId,
      item_ids: stampIds,
      amount,
      merchandise,
      charges,
      allocations: allocations.map((a) => ({
        item_id: a.itemId,
        product_id: a.productId,
        allocated_extra: a.allocatedExtra,
        landed_unit_cost: a.landedUnitCost,
      })),
      closed: allClosed && !anyUninvoicedReceived,
    },
  });

  revalidateCompras(requestId);
  return { ok: true, id: requestId };
}
