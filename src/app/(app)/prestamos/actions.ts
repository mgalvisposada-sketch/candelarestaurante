"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess } from "@/lib/permissions";
import {
  fundingAllocationSchema,
  loanDisbursementSchema,
  loanPaymentSchema,
  loanSchema,
  partnerLoanSchema,
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

function revalidateLoanPaths() {
  revalidatePath("/prestamos");
  revalidatePath("/capital");
  revalidatePath("/tesoreria");
  revalidatePath("/inicio");
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function resolveActiveBankAccount(
  supabase: SupabaseClient,
  orgId: string,
  bankAccountId: string,
) {
  const { data, error } = await supabase
    .from("bank_accounts")
    .select("id, bank_name, is_active")
    .eq("id", bankAccountId)
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { error: error.message as string };
  if (!data?.is_active) {
    return { error: "La cuenta de tesorería no existe o está inactiva" };
  }
  return { account: data };
}

async function createLoanTreasuryCredit(opts: {
  supabase: SupabaseClient;
  orgId: string;
  userId: string;
  bankAccountId: string;
  disbursementId: string;
  loanId: string;
  lenderName: string;
  disbursementDate: string;
  amount: number;
  notes: string | null;
}) {
  const noteBit = opts.notes ? ` · ${opts.notes}` : "";
  const { data, error } = await opts.supabase
    .from("bank_transactions")
    .insert({
      organization_id: opts.orgId,
      bank_account_id: opts.bankAccountId,
      transaction_date: opts.disbursementDate,
      description: `Préstamo socio · ${opts.lenderName}${noteBit}`,
      reference: `prestamo-${opts.loanId.slice(0, 8)}`,
      debit: 0,
      credit: opts.amount,
      origin: "prestamos",
      category: "PRESTAMO_SOCIO",
      linked_entity_type: "loan_disbursements",
      linked_entity_id: opts.disbursementId,
      created_by: opts.userId,
      updated_by: opts.userId,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { transactionId: data.id as string };
}

export async function createLoanAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Primero configura la empresa" };
  if (!ctxCanAccess(ctx, "prestamos.contratos") && !ctxCanAccess(ctx, "prestamos")) {
    return { ok: false, error: "Sin permiso para crear préstamos" };
  }

  const parsed = partnerLoanSchema.safeParse({
    lender_shareholder_id: formData.get("lender_shareholder_id"),
    lender_name: formData.get("lender_name"),
    loan_date: formData.get("loan_date"),
    amount: formData.get("amount"),
    bank_account_id: formData.get("bank_account_id"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const amount = parseMoney(parsed.data.amount);
  if (amount === null || amount <= 0) {
    return { ok: false, error: "Monto inválido" };
  }

  const supabase = await createClient();
  const orgId = ctx.organization.id;
  const shareholderId = emptyToNull(parsed.data.lender_shareholder_id);
  let lenderName = emptyToNull(parsed.data.lender_name);

  if (shareholderId) {
    const { data: sh } = await supabase
      .from("shareholders")
      .select("full_name")
      .eq("id", shareholderId)
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!sh) return { ok: false, error: "Socio no encontrado" };
    lenderName = sh.full_name;
  }

  if (!lenderName || lenderName.length < 2) {
    return { ok: false, error: "Indique el socio que prestó" };
  }

  const resolved = await resolveActiveBankAccount(
    supabase,
    orgId,
    parsed.data.bank_account_id,
  );
  if ("error" in resolved && resolved.error) {
    return { ok: false, error: resolved.error };
  }

  const notes = emptyToNull(parsed.data.notes);

  const { data, error } = await supabase
    .from("loans")
    .insert({
      organization_id: orgId,
      lender_shareholder_id: shareholderId,
      lender_name: lenderName,
      contract_date: parsed.data.loan_date,
      approved_principal: amount,
      interest_rate: null,
      rate_type: null,
      term_months: null,
      grace_period_months: 0,
      first_installment_date: null,
      amortization_method: "SIN_INTERES",
      status: "ACTIVO",
      notes,
      verification_status: "CONFIRMADO",
      comments: null,
      source: "prestamo_socio",
      validated_by: ctx.userId,
      validated_at: new Date().toISOString(),
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  const { data: disb, error: disbError } = await supabase
    .from("loan_disbursements")
    .insert({
      organization_id: orgId,
      loan_id: data.id,
      disbursement_date: parsed.data.loan_date,
      amount,
      bank_account_id: parsed.data.bank_account_id,
      notes,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (disbError) {
    revalidateLoanPaths();
    return {
      ok: false,
      error: `Préstamo creado, pero falló el registro del ingreso: ${disbError.message}`,
      id: data.id,
    };
  }

  const tx = await createLoanTreasuryCredit({
    supabase,
    orgId,
    userId: ctx.userId,
    bankAccountId: parsed.data.bank_account_id,
    disbursementId: disb.id,
    loanId: data.id,
    lenderName,
    disbursementDate: parsed.data.loan_date,
    amount,
    notes,
  });

  if ("error" in tx && tx.error) {
    revalidateLoanPaths();
    return {
      ok: false,
      error: `Préstamo guardado, pero no se cargó en tesorería: ${tx.error}`,
      id: data.id,
    };
  }

  if ("transactionId" in tx && tx.transactionId) {
    await supabase
      .from("loan_disbursements")
      .update({
        bank_transaction_id: tx.transactionId,
        updated_by: ctx.userId,
      })
      .eq("id", disb.id)
      .eq("organization_id", orgId);
  }

  await supabase.from("audit_logs").insert({
    organization_id: orgId,
    user_id: ctx.userId,
    action: "CREATE",
    entity: "loans",
    entity_id: data.id,
    new_values: {
      amount,
      bank_account_id: parsed.data.bank_account_id,
      bank_transaction_id:
        "transactionId" in tx ? tx.transactionId : null,
    },
  });

  revalidateLoanPaths();
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
  revalidateLoanPaths();
  return { ok: true, id: loanId };
}

export async function createDisbursementAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (
    !ctxCanAccess(ctx, "prestamos.movimientos") &&
    !ctxCanAccess(ctx, "prestamos")
  ) {
    return { ok: false, error: "Sin permiso para registrar desembolsos" };
  }

  const parsed = loanDisbursementSchema.safeParse({
    loan_id: formData.get("loan_id"),
    disbursement_date: formData.get("disbursement_date"),
    amount: formData.get("amount"),
    bank_account_id: formData.get("bank_account_id"),
    notes: formData.get("notes"),
    post_to_treasury: formData.get("post_to_treasury") || "1",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const amount = parseMoney(parsed.data.amount);
  if (amount === null || amount <= 0) return { ok: false, error: "Monto inválido" };

  const supabase = await createClient();
  const orgId = ctx.organization.id;
  const bankAccountId = parsed.data.bank_account_id;

  const resolved = await resolveActiveBankAccount(supabase, orgId, bankAccountId);
  if ("error" in resolved && resolved.error) {
    return { ok: false, error: resolved.error };
  }

  const { data: loan, error: loanError } = await supabase
    .from("loans")
    .select("id, lender_name, approved_principal, status")
    .eq("id", parsed.data.loan_id)
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (loanError) return { ok: false, error: loanError.message };
  if (!loan) return { ok: false, error: "Préstamo no encontrado" };
  if (loan.status === "ANULADO") {
    return { ok: false, error: "No se puede desembolsar un préstamo anulado" };
  }

  const { data: existingDisbs } = await supabase
    .from("loan_disbursements")
    .select("amount")
    .eq("loan_id", loan.id)
    .eq("organization_id", orgId)
    .is("deleted_at", null);
  const already = (existingDisbs ?? []).reduce(
    (sum, row) => sum + Number(row.amount || 0),
    0,
  );
  if (already + amount > Number(loan.approved_principal) + 0.009) {
    return {
      ok: false,
      error: "El total desembolsado superaría el capital aprobado",
    };
  }

  const { data, error } = await supabase
    .from("loan_disbursements")
    .insert({
      organization_id: orgId,
      loan_id: parsed.data.loan_id,
      disbursement_date: parsed.data.disbursement_date,
      amount,
      bank_account_id: bankAccountId,
      notes: emptyToNull(parsed.data.notes),
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  const shouldPost = parsed.data.post_to_treasury !== "0";
  let bankTransactionId: string | null = null;
  if (shouldPost) {
    const tx = await createLoanTreasuryCredit({
      supabase,
      orgId,
      userId: ctx.userId,
      bankAccountId,
      disbursementId: data.id,
      loanId: loan.id,
      lenderName: loan.lender_name,
      disbursementDate: parsed.data.disbursement_date,
      amount,
      notes: emptyToNull(parsed.data.notes),
    });
    if ("error" in tx && tx.error) {
      revalidateLoanPaths();
      return {
        ok: false,
        error: `Desembolso guardado, pero falló el ingreso en tesorería: ${tx.error}`,
        id: data.id,
      };
    }
    if ("transactionId" in tx && tx.transactionId) {
      bankTransactionId = tx.transactionId;
      await supabase
        .from("loan_disbursements")
        .update({
          bank_transaction_id: bankTransactionId,
          updated_by: ctx.userId,
        })
        .eq("id", data.id)
        .eq("organization_id", orgId);
    }
  }

  await supabase.from("audit_logs").insert({
    organization_id: orgId,
    user_id: ctx.userId,
    action: "CREATE",
    entity: "loan_disbursements",
    entity_id: data.id,
    new_values: {
      bank_account_id: bankAccountId,
      bank_transaction_id: bankTransactionId,
      amount,
    },
  });

  revalidateLoanPaths();
  return { ok: true, id: data.id };
}

/** Registra en tesorería el ingreso de un desembolso que aún no tiene movimiento. */
export async function postDisbursementToTreasuryAction(
  disbursementId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (
    !ctxCanAccess(ctx, "prestamos.movimientos") &&
    !ctxCanAccess(ctx, "prestamos")
  ) {
    return { ok: false, error: "Sin permiso para registrar ingresos" };
  }

  const supabase = await createClient();
  const orgId = ctx.organization.id;

  const { data: disb, error } = await supabase
    .from("loan_disbursements")
    .select(
      "id, loan_id, disbursement_date, amount, bank_account_id, bank_transaction_id, notes, loans(lender_name, status)",
    )
    .eq("id", disbursementId)
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!disb) return { ok: false, error: "Desembolso no encontrado" };
  if (disb.bank_transaction_id) {
    return { ok: false, error: "Este desembolso ya tiene ingreso en tesorería" };
  }
  if (!disb.bank_account_id) {
    return {
      ok: false,
      error: "Defina primero la cuenta de tesorería del desembolso",
    };
  }

  const loan = disb.loans as unknown as {
    lender_name: string;
    status: string;
  } | null;
  if (loan?.status === "ANULADO") {
    return { ok: false, error: "El préstamo está anulado" };
  }

  const resolved = await resolveActiveBankAccount(
    supabase,
    orgId,
    disb.bank_account_id,
  );
  if ("error" in resolved && resolved.error) {
    return { ok: false, error: resolved.error };
  }

  const tx = await createLoanTreasuryCredit({
    supabase,
    orgId,
    userId: ctx.userId,
    bankAccountId: disb.bank_account_id,
    disbursementId: disb.id,
    loanId: disb.loan_id,
    lenderName: loan?.lender_name ?? "Socio",
    disbursementDate: disb.disbursement_date,
    amount: Number(disb.amount),
    notes: disb.notes,
  });
  if ("error" in tx && tx.error) return { ok: false, error: tx.error };
  if (!("transactionId" in tx) || !tx.transactionId) {
    return { ok: false, error: "No se pudo crear el movimiento" };
  }

  const { error: updError } = await supabase
    .from("loan_disbursements")
    .update({
      bank_transaction_id: tx.transactionId,
      updated_by: ctx.userId,
    })
    .eq("id", disb.id)
    .eq("organization_id", orgId);
  if (updError) return { ok: false, error: updError.message };

  await supabase.from("audit_logs").insert({
    organization_id: orgId,
    user_id: ctx.userId,
    action: "UPDATE",
    entity: "loan_disbursements",
    entity_id: disb.id,
    new_values: { bank_transaction_id: tx.transactionId },
  });

  revalidateLoanPaths();
  return { ok: true, id: disb.id };
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

  revalidateLoanPaths();
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

  revalidateLoanPaths();
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
  revalidateLoanPaths();
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
  revalidateLoanPaths();
  return { ok: true, id: loanId };
}
