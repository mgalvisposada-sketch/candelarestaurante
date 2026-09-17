"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org-context";
import {
  apDocumentSchema,
  apPaymentSchema,
  supplierSchema,
} from "@/validations/suppliers";
import type { ActionResult } from "../empresa/actions";

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

export async function createSupplierAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Primero configura la empresa" };

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
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
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
      category: emptyToNull(parsed.data.category),
      bank_account_info: emptyToNull(parsed.data.bank_account_info),
      notes: emptyToNull(parsed.data.notes),
      is_active: parsed.data.is_active !== "false",
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

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
  });

  revalidatePath("/proveedores");
  revalidatePath("/inicio");
  return { ok: true, id: data.id };
}

export async function updateSupplierAction(
  supplierId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

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
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .update({
      name: parsed.data.name.trim(),
      tax_id: emptyToNull(parsed.data.tax_id),
      contact_name: emptyToNull(parsed.data.contact_name),
      phone: emptyToNull(parsed.data.phone),
      email: emptyToNull(parsed.data.email),
      category: emptyToNull(parsed.data.category),
      bank_account_info: emptyToNull(parsed.data.bank_account_info),
      notes: emptyToNull(parsed.data.notes),
      is_active: parsed.data.is_active !== "false",
      updated_by: ctx.userId,
    })
    .eq("id", supplierId)
    .eq("organization_id", ctx.organization.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/proveedores");
  return { ok: true, id: supplierId };
}

export async function createApDocumentAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

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
  const paid = parseMoney(parsed.data.paid_amount, 0);
  if (original === null || original < 0) return { ok: false, error: "Valor inválido" };
  if (paid === null || paid < 0 || paid > original) {
    return { ok: false, error: "Valor pagado inválido" };
  }

  const supabase = await createClient();
  let apId: string;
  try {
    apId = await ensureAccountsPayable(
      supabase,
      ctx.organization.id,
      parsed.data.supplier_id,
      ctx.userId,
      parsed.data.priority,
    );
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error CxP" };
  }

  let status: "ABIERTA" | "PARCIAL" | "PAGADA" = "ABIERTA";
  if (paid >= original && original > 0) status = "PAGADA";
  else if (paid > 0) status = "PARCIAL";

  const { data, error } = await supabase
    .from("accounts_payable_documents")
    .insert({
      organization_id: ctx.organization.id,
      accounts_payable_id: apId,
      supplier_id: parsed.data.supplier_id,
      document_type: parsed.data.document_type,
      document_number: emptyToNull(parsed.data.document_number),
      issue_date: emptyToNull(parsed.data.issue_date),
      due_date: emptyToNull(parsed.data.due_date),
      concept: emptyToNull(parsed.data.concept),
      original_amount: original,
      paid_amount: paid,
      status,
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
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  await supabase
    .from("accounts_payable")
    .update({
      priority: parsed.data.priority,
      verification_status: parsed.data.verification_status,
      updated_by: ctx.userId,
    })
    .eq("id", apId);

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "CREATE",
    entity: "accounts_payable_documents",
    entity_id: data.id,
  });

  revalidatePath("/proveedores");
  revalidatePath("/inicio");
  return { ok: true, id: data.id };
}

export async function updateApDocumentAction(
  documentId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

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

  await refreshDocumentPaid(supabase, ctx.organization.id, documentId);
  revalidatePath("/proveedores");
  revalidatePath("/inicio");
  return { ok: true, id: documentId };
}

export async function registerApPaymentAction(
  documentId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = apPaymentSchema.safeParse({
    payment_date: formData.get("payment_date"),
    amount: formData.get("amount"),
    reference: formData.get("reference"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const amount = parseMoney(parsed.data.amount);
  if (amount === null || amount <= 0) return { ok: false, error: "Monto inválido" };

  const supabase = await createClient();
  const { error } = await supabase.from("accounts_payable_payments").insert({
    organization_id: ctx.organization.id,
    accounts_payable_document_id: documentId,
    payment_date: parsed.data.payment_date,
    amount,
    reference: emptyToNull(parsed.data.reference),
    notes: emptyToNull(parsed.data.notes),
    created_by: ctx.userId,
    updated_by: ctx.userId,
  });
  if (error) return { ok: false, error: error.message };

  await refreshDocumentPaid(supabase, ctx.organization.id, documentId);

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "PAYMENT",
    entity: "accounts_payable_documents",
    entity_id: documentId,
    new_values: { amount, payment_date: parsed.data.payment_date },
  });

  revalidatePath("/proveedores");
  revalidatePath("/inicio");
  return { ok: true };
}

export async function softDeleteSupplierAction(
  supplierId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
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
  return { ok: true, id: supplierId };
}
