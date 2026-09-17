"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org-context";
import {
  fundingAllocationSchema,
  loanDisbursementSchema,
  loanPaymentSchema,
  loanSchema,
} from "@/validations/loans";
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

function parseIntOrNull(raw: string | null | undefined) {
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const n = Number.parseInt(String(raw).trim(), 10);
  return Number.isNaN(n) ? null : n;
}

export async function createLoanAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Primero configura la empresa" };

  const parsed = loanSchema.safeParse({
    lender_shareholder_id: formData.get("lender_shareholder_id"),
    lender_name: formData.get("lender_name"),
    contract_date: formData.get("contract_date"),
    approved_principal: formData.get("approved_principal"),
    interest_rate: formData.get("interest_rate"),
    rate_type: formData.get("rate_type") || "",
    term_months: formData.get("term_months"),
    grace_period_months: formData.get("grace_period_months"),
    first_installment_date: formData.get("first_installment_date"),
    amortization_method: formData.get("amortization_method") || "MANUAL",
    status: formData.get("status") || "ACTIVO",
    notes: formData.get("notes"),
    verification_status: formData.get("verification_status") || "PENDIENTE",
    comments: formData.get("comments"),
    source: formData.get("source"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const principal = parseMoney(parsed.data.approved_principal);
  if (principal === null || principal <= 0) {
    return { ok: false, error: "Capital aprobado inválido" };
  }

  const rate = parseMoney(parsed.data.interest_rate);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("loans")
    .insert({
      organization_id: ctx.organization.id,
      lender_shareholder_id: emptyToNull(parsed.data.lender_shareholder_id),
      lender_name: parsed.data.lender_name.trim(),
      contract_date: emptyToNull(parsed.data.contract_date),
      approved_principal: principal,
      interest_rate: rate,
      rate_type: emptyToNull(parsed.data.rate_type) as
        | "MENSUAL"
        | "EFECTIVA_ANUAL"
        | "MANUAL"
        | null,
      term_months: parseIntOrNull(parsed.data.term_months),
      grace_period_months: parseIntOrNull(parsed.data.grace_period_months) ?? 0,
      first_installment_date: emptyToNull(parsed.data.first_installment_date),
      amortization_method: parsed.data.amortization_method,
      status: parsed.data.status,
      notes: emptyToNull(parsed.data.notes),
      verification_status: parsed.data.verification_status,
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

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "CREATE",
    entity: "loans",
    entity_id: data.id,
  });

  revalidatePath("/prestamos");
  revalidatePath("/capital");
  revalidatePath("/inicio");
  return { ok: true, id: data.id };
}

export async function updateLoanAction(
  loanId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = loanSchema.safeParse({
    lender_shareholder_id: formData.get("lender_shareholder_id"),
    lender_name: formData.get("lender_name"),
    contract_date: formData.get("contract_date"),
    approved_principal: formData.get("approved_principal"),
    interest_rate: formData.get("interest_rate"),
    rate_type: formData.get("rate_type") || "",
    term_months: formData.get("term_months"),
    grace_period_months: formData.get("grace_period_months"),
    first_installment_date: formData.get("first_installment_date"),
    amortization_method: formData.get("amortization_method") || "MANUAL",
    status: formData.get("status") || "ACTIVO",
    notes: formData.get("notes"),
    verification_status: formData.get("verification_status") || "PENDIENTE",
    comments: formData.get("comments"),
    source: formData.get("source"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const principal = parseMoney(parsed.data.approved_principal);
  if (principal === null || principal <= 0) {
    return { ok: false, error: "Capital aprobado inválido" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("loans")
    .update({
      lender_shareholder_id: emptyToNull(parsed.data.lender_shareholder_id),
      lender_name: parsed.data.lender_name.trim(),
      contract_date: emptyToNull(parsed.data.contract_date),
      approved_principal: principal,
      interest_rate: parseMoney(parsed.data.interest_rate),
      rate_type: emptyToNull(parsed.data.rate_type) as
        | "MENSUAL"
        | "EFECTIVA_ANUAL"
        | "MANUAL"
        | null,
      term_months: parseIntOrNull(parsed.data.term_months),
      grace_period_months: parseIntOrNull(parsed.data.grace_period_months) ?? 0,
      first_installment_date: emptyToNull(parsed.data.first_installment_date),
      amortization_method: parsed.data.amortization_method,
      status: parsed.data.status,
      notes: emptyToNull(parsed.data.notes),
      verification_status: parsed.data.verification_status,
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
    .eq("id", loanId)
    .eq("organization_id", ctx.organization.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/prestamos");
  revalidatePath("/inicio");
  return { ok: true, id: loanId };
}

export async function createDisbursementAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = loanDisbursementSchema.safeParse({
    loan_id: formData.get("loan_id"),
    disbursement_date: formData.get("disbursement_date"),
    amount: formData.get("amount"),
    bank_account_id: formData.get("bank_account_id"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const amount = parseMoney(parsed.data.amount);
  if (amount === null || amount <= 0) return { ok: false, error: "Monto inválido" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("loan_disbursements")
    .insert({
      organization_id: ctx.organization.id,
      loan_id: parsed.data.loan_id,
      disbursement_date: parsed.data.disbursement_date,
      amount,
      bank_account_id: emptyToNull(parsed.data.bank_account_id),
      notes: emptyToNull(parsed.data.notes),
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "CREATE",
    entity: "loan_disbursements",
    entity_id: data.id,
  });

  revalidatePath("/prestamos");
  revalidatePath("/capital");
  revalidatePath("/inicio");
  return { ok: true, id: data.id };
}

export async function createLoanPaymentAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = loanPaymentSchema.safeParse({
    loan_id: formData.get("loan_id"),
    payment_date: formData.get("payment_date"),
    principal_amount: formData.get("principal_amount") || "0",
    interest_amount: formData.get("interest_amount") || "0",
    bank_account_id: formData.get("bank_account_id"),
    reference: formData.get("reference"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const principal = parseMoney(parsed.data.principal_amount, 0) ?? 0;
  const interest = parseMoney(parsed.data.interest_amount, 0) ?? 0;
  if (principal < 0 || interest < 0 || principal + interest <= 0) {
    return { ok: false, error: "Montos de pago inválidos" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("loan_payments")
    .insert({
      organization_id: ctx.organization.id,
      loan_id: parsed.data.loan_id,
      payment_date: parsed.data.payment_date,
      principal_amount: principal,
      interest_amount: interest,
      total_amount: principal + interest,
      bank_account_id: emptyToNull(parsed.data.bank_account_id),
      reference: emptyToNull(parsed.data.reference),
      notes: emptyToNull(parsed.data.notes),
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "PAYMENT",
    entity: "loans",
    entity_id: parsed.data.loan_id,
    new_values: { principal, interest },
  });

  revalidatePath("/prestamos");
  revalidatePath("/inicio");
  return { ok: true, id: data.id };
}

export async function createFundingAllocationAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = fundingAllocationSchema.safeParse({
    loan_disbursement_id: formData.get("loan_disbursement_id"),
    category: formData.get("category"),
    concept: formData.get("concept"),
    approved_amount: formData.get("approved_amount"),
    committed_amount: formData.get("committed_amount") || "0",
    paid_amount: formData.get("paid_amount") || "0",
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const approved = parseMoney(parsed.data.approved_amount);
  const committed = parseMoney(parsed.data.committed_amount, 0) ?? 0;
  const paid = parseMoney(parsed.data.paid_amount, 0) ?? 0;
  if (approved === null || approved < 0) {
    return { ok: false, error: "Monto aprobado inválido" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("funding_allocations")
    .insert({
      organization_id: ctx.organization.id,
      loan_disbursement_id: parsed.data.loan_disbursement_id,
      category: parsed.data.category.trim(),
      concept: emptyToNull(parsed.data.concept),
      approved_amount: approved,
      committed_amount: committed,
      paid_amount: paid,
      notes: emptyToNull(parsed.data.notes),
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "CREATE",
    entity: "funding_allocations",
    entity_id: data.id,
  });

  revalidatePath("/capital");
  revalidatePath("/prestamos");
  revalidatePath("/inicio");
  return { ok: true, id: data.id };
}

export async function updateFundingAllocationAction(
  allocationId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const approved = parseMoney(String(formData.get("approved_amount") || ""));
  const committed = parseMoney(String(formData.get("committed_amount") || ""), 0) ?? 0;
  const paid = parseMoney(String(formData.get("paid_amount") || ""), 0) ?? 0;
  if (approved === null || approved < 0) {
    return { ok: false, error: "Monto aprobado inválido" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("funding_allocations")
    .update({
      category: String(formData.get("category") || "").trim(),
      concept: emptyToNull(String(formData.get("concept") || "")),
      approved_amount: approved,
      committed_amount: committed,
      paid_amount: paid,
      notes: emptyToNull(String(formData.get("notes") || "")),
      updated_by: ctx.userId,
    })
    .eq("id", allocationId)
    .eq("organization_id", ctx.organization.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/capital");
  revalidatePath("/inicio");
  return { ok: true, id: allocationId };
}

export async function softDeleteLoanAction(
  loanId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("loans")
    .update({
      deleted_at: new Date().toISOString(),
      status: "ANULADO",
      updated_by: ctx.userId,
    })
    .eq("id", loanId)
    .eq("organization_id", ctx.organization.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/prestamos");
  revalidatePath("/capital");
  revalidatePath("/inicio");
  return { ok: true, id: loanId };
}
