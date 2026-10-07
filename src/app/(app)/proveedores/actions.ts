"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext, type OrgContext } from "@/lib/org-context";
import { ctxCanAccess } from "@/lib/permissions";
import {
  apDocumentSchema,
  supplierSchema,
} from "@/validations/suppliers";
import type { ActionResult } from "../empresa/actions";

function mapApPriorityToPaymentRequest(
  priority: "CRITICA" | "ALTA" | "NORMAL" | "NEGOCIABLE" | "POR_VALIDAR",
): "CRITICA" | "ALTA" | "NORMAL" | "BAJA" {
  if (priority === "CRITICA" || priority === "ALTA" || priority === "NORMAL") {
    return priority;
  }
  if (priority === "NEGOCIABLE") return "BAJA";
  return "NORMAL";
}

type OrgCtx = OrgContext & {
  organization: NonNullable<OrgContext["organization"]>;
};

async function requireProveedoresPerm(
  permissionKey: string,
): Promise<{ ok: true; ctx: OrgCtx } | { ok: false; error: string }> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) {
    return { ok: false, error: "Sin organización" };
  }
  if (!ctxCanAccess(ctx, permissionKey)) {
    return { ok: false, error: "No tienes permiso para esta acción" };
  }
  return { ok: true, ctx: ctx as OrgCtx };
}

function emptyToNull(value: string | null | undefined) {
  if (value === undefined || value === null || String(value).trim() === "")
    return null;
  return String(value).trim();
}

function parseMoney(raw: string | null | undefined, fallback?: number) {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return fallback === undefined ? null : fallback;
  }
  const n = Number(String(raw).replace(/,/g, "").trim());
  if (Number.isNaN(n)) return null;
  return n;
}

async function ensureAccountsPayable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  supplierId: string,
  userId: string,
  priority?: string,
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
      priority: priority || "POR_VALIDAR",
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data.id as string;
}

async function refreshDocumentPaid(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  documentId: string,
) {
  const { data: payments } = await supabase
    .from("accounts_payable_payments")
    .select("amount")
    .eq("accounts_payable_document_id", documentId)
    .eq("organization_id", orgId)
    .is("deleted_at", null);

  const paid = (payments ?? []).reduce(
    (acc, p) => acc + Number(p.amount || 0),
    0,
  );

  const { data: doc } = await supabase
    .from("accounts_payable_documents")
    .select("original_amount")
    .eq("id", documentId)
    .single();

  const original = Number(doc?.original_amount || 0);
  let status: "ABIERTA" | "PARCIAL" | "PAGADA" = "ABIERTA";
  if (paid <= 0) status = "ABIERTA";
  else if (paid >= original) status = "PAGADA";
  else status = "PARCIAL";

  await supabase
    .from("accounts_payable_documents")
    .update({ paid_amount: paid, status })
    .eq("id", documentId)
    .eq("organization_id", orgId);
}

function parseCategoryIds(formData: FormData): string[] {
  return formData
    .getAll("category_ids")
    .map((v) => String(v).trim())
    .filter((v) => /^[0-9a-f-]{36}$/i.test(v));
}

async function syncSupplierCategories(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  supplierId: string,
  userId: string,
  categoryIds: string[],
): Promise<{ ok: true; label: string | null } | { ok: false; error: string }> {
  const uniqueIds = [...new Set(categoryIds)];

  let label: string | null = null;
  if (uniqueIds.length > 0) {
    const { data: cats, error: catError } = await supabase
      .from("product_categories")
      .select("id, name")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .in("id", uniqueIds);
    if (catError) return { ok: false, error: catError.message };
    if ((cats ?? []).length !== uniqueIds.length) {
      return { ok: false, error: "Una o más categorías no son válidas" };
    }
    label = (cats ?? [])
      .map((c) => c.name)
      .sort((a, b) => a.localeCompare(b, "es"))
      .join(", ");
  }

  const { data: existing } = await supabase
    .from("supplier_product_categories")
    .select("id, category_id, deleted_at")
    .eq("organization_id", orgId)
    .eq("supplier_id", supplierId);

  const selected = new Set(uniqueIds);
  const now = new Date().toISOString();

  for (const row of existing ?? []) {
    if (!selected.has(row.category_id)) {
      if (!row.deleted_at) {
        const { error } = await supabase
          .from("supplier_product_categories")
          .update({
            deleted_at: now,
            is_active: false,
            updated_by: userId,
          })
          .eq("id", row.id)
          .eq("organization_id", orgId);
        if (error) return { ok: false, error: error.message };
      }
      continue;
    }

    const { error } = await supabase
      .from("supplier_product_categories")
      .update({
        deleted_at: null,
        is_active: true,
        updated_by: userId,
      })
      .eq("id", row.id)
      .eq("organization_id", orgId);
    if (error) return { ok: false, error: error.message };
    selected.delete(row.category_id);
  }

  for (const categoryId of selected) {
    const { error } = await supabase.from("supplier_product_categories").insert({
      organization_id: orgId,
      supplier_id: supplierId,
      category_id: categoryId,
      is_active: true,
      created_by: userId,
      updated_by: userId,
    });
    if (error) return { ok: false, error: error.message };
  }

  return { ok: true, label };
}

function revalidateSupplierPaths() {
  revalidatePath("/proveedores");
  revalidatePath("/proveedores/cxp");
  revalidatePath("/proveedores/maestro");
  revalidatePath("/compras/proveedores");
  revalidatePath("/compras/solicitudes");
  revalidatePath("/inicio");
}

export async function createSupplierAction(
  formData: FormData,
): Promise<ActionResult> {
  const gate = await requireProveedoresPerm("proveedores.crear");
  if (!gate.ok) return { ok: false, error: gate.error };
  const { ctx } = gate;

  const parsed = supplierSchema.safeParse({
    name: formData.get("name"),
    tax_id: formData.get("tax_id"),
    contact_name: formData.get("contact_name"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    category: formData.get("category"),
    bank_account_info: formData.get("bank_account_info"),
    notes: formData.get("notes"),
    is_active: formData.get("is_active") || "true",
    is_purchase_supplier: formData.get("is_purchase_supplier") || "false",
    is_expense_supplier: formData.get("is_expense_supplier") || "false",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const isPurchaseSupplier = parsed.data.is_purchase_supplier === "true";
  const isExpenseSupplier = parsed.data.is_expense_supplier === "true";
  const categoryIds = isPurchaseSupplier ? parseCategoryIds(formData) : [];
  if (isPurchaseSupplier && categoryIds.length === 0) {
    return {
      ok: false,
      error: "Un proveedor de insumos debe tener al menos una categoría",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      organization_id: ctx.organization.id,
      name: parsed.data.name.trim(),
      tax_id: emptyToNull(parsed.data.tax_id),
      contact_name: emptyToNull(parsed.data.contact_name),
      phone: emptyToNull(parsed.data.phone),
      email: emptyToNull(parsed.data.email),
      category: null,
      bank_account_info: emptyToNull(parsed.data.bank_account_info),
      notes: emptyToNull(parsed.data.notes),
      is_active: parsed.data.is_active !== "false",
      is_purchase_supplier: isPurchaseSupplier,
      is_expense_supplier: isExpenseSupplier,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  const synced = await syncSupplierCategories(
    supabase,
    ctx.organization.id,
    data.id,
    ctx.userId,
    categoryIds,
  );
  if (!synced.ok) return { ok: false, error: synced.error };

  await supabase
    .from("suppliers")
    .update({
      category: isPurchaseSupplier ? synced.label : null,
      updated_by: ctx.userId,
    })
    .eq("id", data.id)
    .eq("organization_id", ctx.organization.id);

  await ensureAccountsPayable(
    supabase,
    ctx.organization.id,
    data.id,
    ctx.userId,
  );

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "CREATE",
    entity: "suppliers",
    entity_id: data.id,
    new_values: { category_ids: categoryIds },
  });

  revalidateSupplierPaths();
  return { ok: true, id: data.id };
}

export async function updateSupplierAction(
  supplierId: string,
  formData: FormData,
): Promise<ActionResult> {
  const gate = await requireProveedoresPerm("proveedores.editar");
  if (!gate.ok) return { ok: false, error: gate.error };
  const { ctx } = gate;

  const parsed = supplierSchema.safeParse({
    name: formData.get("name"),
    tax_id: formData.get("tax_id"),
    contact_name: formData.get("contact_name"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    category: formData.get("category"),
    bank_account_info: formData.get("bank_account_info"),
    notes: formData.get("notes"),
    is_active: formData.get("is_active") || "true",
    is_purchase_supplier: formData.get("is_purchase_supplier") || "false",
    is_expense_supplier: formData.get("is_expense_supplier") || "false",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const isPurchaseSupplier = parsed.data.is_purchase_supplier === "true";
  const isExpenseSupplier = parsed.data.is_expense_supplier === "true";
  const categoryIds = isPurchaseSupplier ? parseCategoryIds(formData) : [];
  if (isPurchaseSupplier && categoryIds.length === 0) {
    return {
      ok: false,
      error: "Un proveedor de insumos debe tener al menos una categoría",
    };
  }

  const supabase = await createClient();
  const synced = await syncSupplierCategories(
    supabase,
    ctx.organization.id,
    supplierId,
    ctx.userId,
    categoryIds,
  );
  if (!synced.ok) return { ok: false, error: synced.error };

  const { error } = await supabase
    .from("suppliers")
    .update({
      name: parsed.data.name.trim(),
      tax_id: emptyToNull(parsed.data.tax_id),
      contact_name: emptyToNull(parsed.data.contact_name),
      phone: emptyToNull(parsed.data.phone),
      email: emptyToNull(parsed.data.email),
      category: isPurchaseSupplier ? synced.label : null,
      bank_account_info: emptyToNull(parsed.data.bank_account_info),
      notes: emptyToNull(parsed.data.notes),
      is_active: parsed.data.is_active !== "false",
      is_purchase_supplier: isPurchaseSupplier,
      is_expense_supplier: isExpenseSupplier,
      updated_by: ctx.userId,
    })
    .eq("id", supplierId)
    .eq("organization_id", ctx.organization.id);

  if (error) return { ok: false, error: error.message };
  revalidateSupplierPaths();
  return { ok: true, id: supplierId };
}

/** Alta cerrada: CxP solo recibe facturas desde Compras. */
export async function createApDocumentAction(
  _formData: FormData,
): Promise<ActionResult> {
  return {
    ok: false,
    error:
      "Ya no se cargan facturas a mano en CxP. Costos de insumos: acepte factura en Compras. Gastos (arriendo, gas, etc.): regístrelos en Gastos.",
  };
}

export async function updateApDocumentAction(
  documentId: string,
  formData: FormData,
): Promise<ActionResult> {
  const gate = await requireProveedoresPerm("proveedores.cxp.editar");
  if (!gate.ok) return { ok: false, error: gate.error };
  const { ctx } = gate;

  const parsed = apDocumentSchema.safeParse({
    supplier_id: formData.get("supplier_id"),
    document_type: formData.get("document_type"),
    document_number: formData.get("document_number"),
    issue_date: formData.get("issue_date"),
    due_date: formData.get("due_date"),
    concept: formData.get("concept"),
    original_amount: formData.get("original_amount"),
    paid_amount: formData.get("paid_amount") || "0",
    priority: formData.get("priority") || "POR_VALIDAR",
    verification_status: formData.get("verification_status") || "PENDIENTE",
    observation: formData.get("observation"),
    comments: formData.get("comments"),
    source: formData.get("source"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const original = parseMoney(parsed.data.original_amount);
  if (original === null || original < 0) return { ok: false, error: "Valor inválido" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("accounts_payable_documents")
    .update({
      document_type: parsed.data.document_type,
      document_number: emptyToNull(parsed.data.document_number),
      issue_date: emptyToNull(parsed.data.issue_date),
      due_date: emptyToNull(parsed.data.due_date),
      concept: emptyToNull(parsed.data.concept),
      original_amount: original,
      priority: parsed.data.priority,
      verification_status: parsed.data.verification_status,
      observation: emptyToNull(parsed.data.observation),
      comments: emptyToNull(parsed.data.comments),
      source: emptyToNull(parsed.data.source),
      validated_by:
        parsed.data.verification_status === "CONFIRMADO" ? ctx.userId : null,
      validated_at:
        parsed.data.verification_status === "CONFIRMADO"
          ? new Date().toISOString()
          : null,
      updated_by: ctx.userId,
    })
    .eq("id", documentId)
    .eq("organization_id", ctx.organization.id);

  if (error) return { ok: false, error: error.message };

  // Si confirman la factura, la solicitud vinculada pasa a cola de pago.
  if (parsed.data.verification_status === "CONFIRMADO") {
    await supabase
      .from("payment_requests")
      .update({
        status: "EN_COLA_PAGO",
        priority: mapApPriorityToPaymentRequest(parsed.data.priority),
        concept:
          emptyToNull(parsed.data.concept) ||
          `${parsed.data.document_type} ${emptyToNull(parsed.data.document_number) || ""}`.trim(),
        amount: original,
        due_date: emptyToNull(parsed.data.due_date),
        document_type: parsed.data.document_type,
        document_number: emptyToNull(parsed.data.document_number),
        issue_date: emptyToNull(parsed.data.issue_date),
        approved_by: ctx.userId,
        approved_at: new Date().toISOString(),
        updated_by: ctx.userId,
      })
      .eq("ap_document_id", documentId)
      .eq("organization_id", ctx.organization.id)
      .is("deleted_at", null)
      .in("status", ["BORRADOR", "EN_REVISION", "APROBADA"]);
  } else {
    await supabase
      .from("payment_requests")
      .update({
        priority: mapApPriorityToPaymentRequest(parsed.data.priority),
        concept:
          emptyToNull(parsed.data.concept) ||
          `${parsed.data.document_type} ${emptyToNull(parsed.data.document_number) || ""}`.trim(),
        amount: original,
        due_date: emptyToNull(parsed.data.due_date),
        document_type: parsed.data.document_type,
        document_number: emptyToNull(parsed.data.document_number),
        issue_date: emptyToNull(parsed.data.issue_date),
        updated_by: ctx.userId,
      })
      .eq("ap_document_id", documentId)
      .eq("organization_id", ctx.organization.id)
      .is("deleted_at", null)
      .neq("status", "PAGADA")
      .neq("status", "ANULADA");
  }

  await refreshDocumentPaid(supabase, ctx.organization.id, documentId);
  revalidatePath("/proveedores");
  revalidatePath("/proveedores/cxp");
  revalidatePath("/proveedores/maestro");
  revalidatePath("/solicitudes-pago");
  revalidatePath("/inicio");
  return { ok: true, id: documentId };
}

/** Pagos solo desde Solicitudes de pago; CxP solo refleja el saldo. */
export async function registerApPaymentAction(
  _documentId: string,
  _formData: FormData,
): Promise<ActionResult> {
  return {
    ok: false,
    error:
      "Los pagos se registran en Solicitudes de pago. Al pagar allí se actualiza el saldo de esta CxP.",
  };
}

export async function softDeleteApDocumentAction(
  documentId: string,
): Promise<ActionResult> {
  const gate = await requireProveedoresPerm("proveedores.cxp.editar");
  if (!gate.ok) return { ok: false, error: gate.error };
  const { ctx } = gate;
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("accounts_payable_documents")
    .select("id, paid_amount, status, document_number, concept")
    .eq("id", documentId)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!doc) return { ok: false, error: "Documento no encontrado" };
  if (Number(doc.paid_amount || 0) > 0) {
    return {
      ok: false,
      error:
        "No se puede eliminar: ya tiene pagos registrados. Revierta los pagos o anule el documento desde edición si aplica.",
    };
  }

  const now = new Date().toISOString();

  await supabase
    .from("accounts_payable_payments")
    .update({
      deleted_at: now,
      updated_by: ctx.userId,
    })
    .eq("accounts_payable_document_id", documentId)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null);

  await supabase
    .from("payment_requests")
    .update({
      status: "ANULADA",
      updated_by: ctx.userId,
    })
    .eq("ap_document_id", documentId)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .neq("status", "PAGADA")
    .neq("status", "ANULADA");

  // Si vino de una compra, liberar el ítem para poder facturar de nuevo.
  await supabase
    .from("purchase_request_items")
    .update({
      invoice_ap_document_id: null,
      invoice_payment_request_id: null,
      updated_by: ctx.userId,
    })
    .eq("organization_id", ctx.organization.id)
    .eq("invoice_ap_document_id", documentId)
    .is("deleted_at", null);

  const { error } = await supabase
    .from("accounts_payable_documents")
    .update({
      deleted_at: now,
      status: "ANULADA",
      updated_by: ctx.userId,
    })
    .eq("id", documentId)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null);

  if (error) return { ok: false, error: error.message };

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "DELETE",
    entity: "accounts_payable_documents",
    entity_id: documentId,
    new_values: {
      document_number: doc.document_number,
      concept: doc.concept,
    },
  });

  revalidatePath("/proveedores");
  revalidatePath("/proveedores/cxp");
  revalidatePath("/proveedores/maestro");
  revalidatePath("/solicitudes-pago");
  revalidatePath("/compras/solicitudes");
  revalidatePath("/inicio");
  return { ok: true, id: documentId };
}

export async function softDeleteSupplierAction(
  supplierId: string,
): Promise<ActionResult> {
  const gate = await requireProveedoresPerm("proveedores.editar");
  if (!gate.ok) return { ok: false, error: gate.error };
  const { ctx } = gate;
  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .update({
      deleted_at: new Date().toISOString(),
      is_active: false,
      updated_by: ctx.userId,
    })
    .eq("id", supplierId)
    .eq("organization_id", ctx.organization.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/proveedores");
  revalidatePath("/proveedores/cxp");
  revalidatePath("/proveedores/maestro");
  return { ok: true, id: supplierId };
}
