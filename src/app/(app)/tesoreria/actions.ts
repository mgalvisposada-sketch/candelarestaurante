"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess } from "@/lib/permissions";
import { todayInBogota } from "@/lib/dates";
import { ensureCashFloatAccount } from "@/lib/cash-float";
import { resolveCashCloseDestinations } from "@/lib/treasury";
import {
  availableBalanceForAccount,
  type BalanceSnapshotInput,
  type BankTransactionInput,
} from "@/lib/treasury-balance";
import { formatCOP, hasFundsFor } from "@/lib/money";
import {
  bankAccountSchema,
  bankBalanceSnapshotSchema,
  reassignBankTransactionAccountSchema,
} from "@/validations/treasury";
import {
  cashDailyCloseApproveSchema,
  cashDailyCloseDraftSchema,
  cashDailyCloseRejectSchema,
  cashFloatTargetSchema,
  treasuryTransferSchema,
} from "@/validations/cash-daily-close";
import type { ActionResult } from "../empresa/actions";

function emptyToNull(value: string | null | undefined) {
  if (value === undefined || value === null || value.trim() === "") return null;
  return value.trim();
}

function parseMoney(raw: string | null | undefined): number | null {
  if (raw === undefined || raw === null || raw.trim() === "") return null;
  const n = Number(raw.replace(/,/g, "").trim());
  if (Number.isNaN(n)) return null;
  return n;
}

function revalidateTreasuryPaths() {
  revalidatePath("/tesoreria");
  revalidatePath("/cierre-caja");
  revalidatePath("/inicio");
  revalidatePath("/solicitudes-pago");
  revalidatePath("/checklist-inicial");
  revalidatePath("/empalme");
}

function canDeclareCashClose(ctx: NonNullable<Awaited<ReturnType<typeof getOrgContext>>>) {
  return (
    ctxCanAccess(ctx, "cierre-caja.declarar") ||
    ctxCanAccess(ctx, "tesoreria.caja.declarar")
  );
}

/** Garantiza la cuenta Base/flotante de la org. */
export async function ensureCashFloatAccountAction(): Promise<
  ActionResult & { accountId?: string }
> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (
    !ctxCanAccess(ctx, "tesoreria.cuentas") &&
    !canDeclareCashClose(ctx) &&
    !ctxCanAccess(ctx, "tesoreria.caja")
  ) {
    return { ok: false, error: "Sin permiso" };
  }

  try {
    const supabase = await createClient();
    const accountId = await ensureCashFloatAccount(
      supabase,
      ctx.organization.id,
      ctx.userId,
    );
    revalidateTreasuryPaths();
    return { ok: true, id: accountId, accountId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" };
  }
}

type CashCloseStatus = "BORRADOR" | "EN_REVISION" | "AVALADO" | "RECHAZADO";

async function loadCashClose(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  closeId: string,
) {
  const { data, error } = await supabase
    .from("cash_daily_closes")
    .select(
      "id, business_date, status, cash_float, cash_sales, card_sales, card_debit_sales, card_credit_sales, transfer_sales, cash_account_id, card_account_id, transfer_account_id, cash_credited, card_credited, transfer_credited",
    )
    .eq("id", closeId)
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as {
    id: string;
    business_date: string;
    status: CashCloseStatus;
    cash_float: number;
    cash_sales: number;
    card_sales: number;
    card_debit_sales: number;
    card_credit_sales: number;
    transfer_sales: number;
    cash_account_id: string | null;
    card_account_id: string | null;
    transfer_account_id: string | null;
    cash_credited: number | null;
    card_credited: number | null;
    transfer_credited: number | null;
  } | null;
}

export async function createBankAccountAction(
  formData: FormData,
): Promise<ActionResult & { name?: string }> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) {
    return { ok: false, error: "Primero configura la empresa" };
  }

  const parsed = bankAccountSchema.safeParse({
    bank_name: formData.get("bank_name"),
    account_kind: formData.get("account_kind"),
    fund_purpose: formData.get("fund_purpose") || "VENTAS",
    account_type: formData.get("account_type"),
    masked_number: formData.get("masked_number"),
    holder_name: formData.get("holder_name"),
    is_active: formData.get("is_active") || "true",
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bank_accounts")
    .insert({
      organization_id: ctx.organization.id,
      bank_name: parsed.data.bank_name.trim(),
      account_kind: parsed.data.account_kind,
      fund_purpose: parsed.data.fund_purpose,
      account_type: emptyToNull(parsed.data.account_type),
      masked_number: emptyToNull(parsed.data.masked_number),
      holder_name: emptyToNull(parsed.data.holder_name),
      currency: "COP",
      is_active: parsed.data.is_active !== "false",
      notes: emptyToNull(parsed.data.notes),
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  // Saldo inicial opcional al crear
  const cutoff =
    emptyToNull(String(formData.get("cutoff_date") || "")) ||
    ctx.organization.administrative_cutoff_date;
  const openingRaw = String(formData.get("opening_balance") || "");
  if (cutoff && openingRaw.trim() !== "") {
    const opening = parseMoney(openingRaw);
    if (opening === null) {
      return { ok: false, error: "Saldo inicial inválido" };
    }
    const status =
      (String(formData.get("verification_status") || "PENDIENTE") as
        | "CONFIRMADO"
        | "DECLARADO"
        | "PENDIENTE") || "PENDIENTE";

    const { error: snapError } = await supabase
      .from("bank_balance_snapshots")
      .insert({
        organization_id: ctx.organization.id,
        bank_account_id: data.id,
        cutoff_date: cutoff,
        opening_balance: opening,
        verification_status: status,
        comments: emptyToNull(String(formData.get("comments") || "")),
        source: emptyToNull(String(formData.get("source") || "")),
        validated_by: status === "CONFIRMADO" ? ctx.userId : null,
        validated_at:
          status === "CONFIRMADO" ? new Date().toISOString() : null,
        created_by: ctx.userId,
        updated_by: ctx.userId,
      });
    if (snapError) return { ok: false, error: snapError.message };
  }

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "CREATE",
    entity: "bank_accounts",
    entity_id: data.id,
    new_values: parsed.data,
  });

  revalidatePath("/tesoreria");
  revalidatePath("/checklist-inicial");
  revalidatePath("/empalme");
  revalidatePath("/inicio");
  revalidatePath("/prestamos");
  revalidatePath("/solicitudes-pago");
  return { ok: true, id: data.id, name: parsed.data.bank_name.trim() };
}

/** Alta rápida desde formularios (préstamos, pagos): nombre + tipo. */
export async function quickCreateBankAccountAction(
  formData: FormData,
): Promise<ActionResult & { name?: string }> {
  if (!formData.get("fund_purpose")) {
    formData.set("fund_purpose", "EMPRESA");
  }
  if (!formData.get("is_active")) {
    formData.set("is_active", "true");
  }
  return createBankAccountAction(formData);
}

export async function updateBankAccountAction(
  accountId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = bankAccountSchema.safeParse({
    bank_name: formData.get("bank_name"),
    account_kind: formData.get("account_kind"),
    fund_purpose: formData.get("fund_purpose") || "VENTAS",
    account_type: formData.get("account_type"),
    masked_number: formData.get("masked_number"),
    holder_name: formData.get("holder_name"),
    is_active: formData.get("is_active") || "true",
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const supabase = await createClient();
  const { data: existingAcc } = await supabase
    .from("bank_accounts")
    .select("is_cash_float")
    .eq("id", accountId)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();

  /** La Base/flotante siempre es de ventas. */
  const fundPurpose = existingAcc?.is_cash_float
    ? "VENTAS"
    : parsed.data.fund_purpose;

  const { error } = await supabase
    .from("bank_accounts")
    .update({
      bank_name: parsed.data.bank_name.trim(),
      account_kind: parsed.data.account_kind,
      fund_purpose: fundPurpose,
      account_type: emptyToNull(parsed.data.account_type),
      masked_number: emptyToNull(parsed.data.masked_number),
      holder_name: emptyToNull(parsed.data.holder_name),
      is_active: parsed.data.is_active !== "false",
      notes: emptyToNull(parsed.data.notes),
      updated_by: ctx.userId,
    })
    .eq("id", accountId)
    .eq("organization_id", ctx.organization.id);

  if (error) return { ok: false, error: error.message };

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "UPDATE",
    entity: "bank_accounts",
    entity_id: accountId,
    new_values: parsed.data,
  });

  revalidatePath("/tesoreria");
  return { ok: true, id: accountId };
}

export async function softDeleteBankAccountAction(
  accountId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("bank_accounts")
    .update({
      deleted_at: now,
      is_active: false,
      updated_by: ctx.userId,
    })
    .eq("id", accountId)
    .eq("organization_id", ctx.organization.id);

  if (error) return { ok: false, error: error.message };

  await supabase
    .from("bank_balance_snapshots")
    .update({ deleted_at: now, updated_by: ctx.userId })
    .eq("bank_account_id", accountId)
    .eq("organization_id", ctx.organization.id);

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "SOFT_DELETE",
    entity: "bank_accounts",
    entity_id: accountId,
  });

  revalidatePath("/tesoreria");
  revalidatePath("/inicio");
  return { ok: true, id: accountId };
}

export async function updateCashFloatTargetAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "tesoreria.cuentas")) {
    return { ok: false, error: "Sin permiso para definir la base" };
  }

  const parsed = cashFloatTargetSchema.safeParse({
    cash_float_target: formData.get("cash_float_target"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }
  const target = parseMoney(parsed.data.cash_float_target);
  if (target === null) return { ok: false, error: "Base inválida" };

  const supabase = await createClient();
  try {
    await ensureCashFloatAccount(
      supabase,
      ctx.organization.id,
      ctx.userId,
    );
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" };
  }

  const { error } = await supabase
    .from("organizations")
    .update({
      cash_float_target: target,
      updated_by: ctx.userId,
    })
    .eq("id", ctx.organization.id)
    .is("deleted_at", null);

  if (error) return { ok: false, error: error.message };

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "UPDATE",
    entity: "organizations",
    entity_id: ctx.organization.id,
    new_values: { cash_float_target: target },
  });

  revalidateTreasuryPaths();
  revalidatePath("/empresa");
  return { ok: true, id: ctx.organization.id };
}

/**
 * Traspaso entre cuentas de tesorería (ej. banco → caja para recomponer base).
 * Crea egreso en origen + ingreso en destino.
 */
export async function createTreasuryTransferAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "tesoreria.cuentas")) {
    return { ok: false, error: "Sin permiso para traspasos" };
  }

  const parsed = treasuryTransferSchema.safeParse({
    from_account_id: formData.get("from_account_id"),
    to_account_id: formData.get("to_account_id"),
    amount: formData.get("amount"),
    transfer_date: formData.get("transfer_date") || todayInBogota(),
    reference: formData.get("reference"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const amount = parseMoney(parsed.data.amount);
  if (amount === null || amount <= 0) {
    return { ok: false, error: "Monto de traspaso inválido" };
  }

  const supabase = await createClient();
  const orgId = ctx.organization.id;
  const fromId = parsed.data.from_account_id;
  const toId = parsed.data.to_account_id;

  const { data: accounts, error: accError } = await supabase
    .from("bank_accounts")
    .select("id, bank_name, is_active")
    .eq("organization_id", orgId)
    .in("id", [fromId, toId])
    .is("deleted_at", null);

  if (accError) return { ok: false, error: accError.message };
  const fromAcc = (accounts ?? []).find((a) => a.id === fromId);
  const toAcc = (accounts ?? []).find((a) => a.id === toId);
  if (!fromAcc?.is_active || !toAcc?.is_active) {
    return { ok: false, error: "Ambas cuentas deben estar activas" };
  }

  const orgCutoff = ctx.organization.administrative_cutoff_date;
  let snapQuery = supabase
    .from("bank_balance_snapshots")
    .select(
      "bank_account_id, cutoff_date, opening_balance, verification_status",
    )
    .eq("organization_id", orgId)
    .eq("bank_account_id", fromId)
    .is("deleted_at", null);
  if (orgCutoff) snapQuery = snapQuery.eq("cutoff_date", orgCutoff);
  const { data: snapRows } = await snapQuery;
  let snapshots = (snapRows ?? []) as BalanceSnapshotInput[];
  if (snapshots.length === 0) {
    const { data: latestSnaps } = await supabase
      .from("bank_balance_snapshots")
      .select(
        "bank_account_id, cutoff_date, opening_balance, verification_status",
      )
      .eq("organization_id", orgId)
      .eq("bank_account_id", fromId)
      .is("deleted_at", null)
      .order("cutoff_date", { ascending: false })
      .limit(1);
    snapshots = (latestSnaps ?? []) as BalanceSnapshotInput[];
  }

  const { data: txRows } = await supabase
    .from("bank_transactions")
    .select("bank_account_id, transaction_date, debit, credit")
    .eq("organization_id", orgId)
    .eq("bank_account_id", fromId)
    .is("deleted_at", null);

  const available = availableBalanceForAccount({
    accountId: fromId,
    snapshots,
    transactions: (txRows ?? []) as BankTransactionInput[],
    orgCutoff,
  });
  if (!hasFundsFor(available, amount)) {
    return {
      ok: false,
      error: `Fondos insuficientes en ${fromAcc.bank_name}. Disponible ${formatCOP(available)}; traspaso ${formatCOP(amount)}.`,
    };
  }

  const ref =
    emptyToNull(parsed.data.reference) ??
    `traspaso-${parsed.data.transfer_date}`;
  const noteBit = emptyToNull(parsed.data.notes);
  const descOut = `Traspaso a ${toAcc.bank_name}${noteBit ? ` · ${noteBit}` : ""}`;
  const descIn = `Traspaso desde ${fromAcc.bank_name}${noteBit ? ` · ${noteBit}` : ""}`;

  const { data: outTx, error: outError } = await supabase
    .from("bank_transactions")
    .insert({
      organization_id: orgId,
      bank_account_id: fromId,
      transaction_date: parsed.data.transfer_date,
      description: descOut,
      reference: ref,
      debit: amount,
      credit: 0,
      origin: "tesoreria.traspaso",
      category: "TRASPASO",
      linked_entity_type: "bank_accounts",
      linked_entity_id: toId,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();
  if (outError) return { ok: false, error: outError.message };

  const { data: inTx, error: inError } = await supabase
    .from("bank_transactions")
    .insert({
      organization_id: orgId,
      bank_account_id: toId,
      transaction_date: parsed.data.transfer_date,
      description: descIn,
      reference: ref,
      debit: 0,
      credit: amount,
      origin: "tesoreria.traspaso",
      category: "TRASPASO",
      linked_entity_type: "bank_transactions",
      linked_entity_id: outTx.id,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (inError) {
    await supabase
      .from("bank_transactions")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", outTx.id);
    return { ok: false, error: inError.message };
  }

  await supabase.from("audit_logs").insert({
    organization_id: orgId,
    user_id: ctx.userId,
    action: "CREATE",
    entity: "bank_transactions",
    entity_id: outTx.id,
    new_values: {
      kind: "TRASPASO",
      from_account_id: fromId,
      to_account_id: toId,
      amount,
      in_transaction_id: inTx.id,
    },
  });

  revalidateTreasuryPaths();
  return { ok: true, id: outTx.id };
}

export async function upsertBankBalanceSnapshotAction(
  accountId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = bankBalanceSnapshotSchema.safeParse({
    cutoff_date: formData.get("cutoff_date"),
    opening_balance: formData.get("opening_balance"),
    verification_status: formData.get("verification_status") || "PENDIENTE",
    comments: formData.get("comments"),
    source: formData.get("source"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const opening = parseMoney(parsed.data.opening_balance);
  if (opening === null) return { ok: false, error: "Saldo inválido" };

  const supabase = await createClient();
  const status = parsed.data.verification_status;

  const { data: existing } = await supabase
    .from("bank_balance_snapshots")
    .select("id")
    .eq("bank_account_id", accountId)
    .eq("cutoff_date", parsed.data.cutoff_date)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("bank_balance_snapshots")
      .update({
        opening_balance: opening,
        verification_status: status,
        comments: emptyToNull(parsed.data.comments),
        source: emptyToNull(parsed.data.source),
        validated_by: status === "CONFIRMADO" ? ctx.userId : null,
        validated_at:
          status === "CONFIRMADO" ? new Date().toISOString() : null,
        updated_by: ctx.userId,
      })
      .eq("id", existing.id)
      .eq("organization_id", ctx.organization.id);

    if (error) return { ok: false, error: error.message };

    await supabase.from("audit_logs").insert({
      organization_id: ctx.organization.id,
      user_id: ctx.userId,
      action: status === "CONFIRMADO" ? "VALIDATE" : "UPDATE",
      entity: "bank_balance_snapshots",
      entity_id: existing.id,
      new_values: parsed.data,
    });

    revalidatePath("/tesoreria");
    revalidatePath("/inicio");
    revalidatePath("/checklist-inicial");
    revalidatePath("/empalme");
    return { ok: true, id: existing.id };
  }

  const { data, error } = await supabase
    .from("bank_balance_snapshots")
    .insert({
      organization_id: ctx.organization.id,
      bank_account_id: accountId,
      cutoff_date: parsed.data.cutoff_date,
      opening_balance: opening,
      verification_status: status,
      comments: emptyToNull(parsed.data.comments),
      source: emptyToNull(parsed.data.source),
      validated_by: status === "CONFIRMADO" ? ctx.userId : null,
      validated_at: status === "CONFIRMADO" ? new Date().toISOString() : null,
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
    entity: "bank_balance_snapshots",
    entity_id: data.id,
    new_values: parsed.data,
  });

  revalidatePath("/tesoreria");
  revalidatePath("/inicio");
  revalidatePath("/checklist-inicial");
  revalidatePath("/empalme");
  return { ok: true, id: data.id };
}

export async function upsertCashDailyCloseDraftAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!canDeclareCashClose(ctx)) {
    return { ok: false, error: "Sin permiso para declarar cierre de caja" };
  }

  const parsed = cashDailyCloseDraftSchema.safeParse({
    business_date: formData.get("business_date") || todayInBogota(),
    cash_float: formData.get("cash_float"),
    cash_sales: formData.get("cash_sales"),
    card_debit_sales: formData.get("card_debit_sales") || "0",
    card_credit_sales: formData.get("card_credit_sales") || "0",
    transfer_sales: formData.get("transfer_sales") || "0",
    card_account_id: formData.get("card_account_id"),
    transfer_account_id: formData.get("transfer_account_id"),
    comments: formData.get("comments"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  /** Restante de base contado en el local (puede diferir del target si hubo gastos). */
  const cashFloat = parseMoney(parsed.data.cash_float);
  const cashSales = parseMoney(parsed.data.cash_sales);
  const cardDebit = parseMoney(parsed.data.card_debit_sales);
  const cardCredit = parseMoney(parsed.data.card_credit_sales);
  const transferSales = parseMoney(parsed.data.transfer_sales);
  if (
    cashFloat === null ||
    cashSales === null ||
    cardDebit === null ||
    cardCredit === null ||
    transferSales === null
  ) {
    return { ok: false, error: "Montos inválidos" };
  }
  const cardSales = cardDebit + cardCredit;

  const supabase = await createClient();
  const orgId = ctx.organization.id;

  try {
    await ensureCashFloatAccount(supabase, orgId, ctx.userId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" };
  }

  const { data: accounts, error: accError } = await supabase
    .from("bank_accounts")
    .select("id, account_kind, is_active, is_cash_float, fund_purpose")
    .eq("organization_id", orgId)
    .is("deleted_at", null);

  if (accError) return { ok: false, error: accError.message };

  const destinations = resolveCashCloseDestinations(accounts ?? [], {
    cardAccountId: emptyToNull(parsed.data.card_account_id),
    transferAccountId: emptyToNull(parsed.data.transfer_account_id),
  });
  if (!destinations.cashAccountId) {
    return {
      ok: false,
      error:
        "Falta una cuenta de tipo Caja en Tesorería para el efectivo del local",
    };
  }
  if (!destinations.cardAccountId || !destinations.transferAccountId) {
    return {
      ok: false,
      error:
        "Falta una cuenta Banco o Pasarela donde aterrice la adquirencia / transferencias",
    };
  }
  const cashAccountId = destinations.cashAccountId;
  const cardAccountId = destinations.cardAccountId;
  const transferAccountId = destinations.transferAccountId;

  const { data: existing } = await supabase
    .from("cash_daily_closes")
    .select("id, status")
    .eq("organization_id", orgId)
    .eq("business_date", parsed.data.business_date)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing) {
    const status = existing.status as CashCloseStatus;
    if (status === "AVALADO" || status === "EN_REVISION") {
      return {
        ok: false,
        error:
          status === "AVALADO"
            ? "El cierre de ese día ya fue avalado"
            : "El cierre ya está en revisión; no se puede editar",
      };
    }

    const { error } = await supabase
      .from("cash_daily_closes")
      .update({
        cash_float: cashFloat,
        cash_sales: cashSales,
        card_debit_sales: cardDebit,
        card_credit_sales: cardCredit,
        card_sales: cardSales,
        transfer_sales: transferSales,
        cash_account_id: cashAccountId,
        card_account_id: cardAccountId,
        transfer_account_id: transferAccountId,
        comments: emptyToNull(parsed.data.comments),
        status: "BORRADOR",
        rejection_reason: null,
        updated_by: ctx.userId,
      })
      .eq("id", existing.id)
      .eq("organization_id", orgId);

    if (error) return { ok: false, error: error.message };

    await supabase.from("audit_logs").insert({
      organization_id: orgId,
      user_id: ctx.userId,
      action: "UPDATE",
      entity: "cash_daily_closes",
      entity_id: existing.id,
      new_values: parsed.data,
    });

    revalidateTreasuryPaths();
    return { ok: true, id: existing.id };
  }

  const { data, error } = await supabase
    .from("cash_daily_closes")
    .insert({
      organization_id: orgId,
      business_date: parsed.data.business_date,
      status: "BORRADOR",
      cash_float: cashFloat,
      cash_sales: cashSales,
      card_debit_sales: cardDebit,
      card_credit_sales: cardCredit,
      card_sales: cardSales,
      transfer_sales: transferSales,
      cash_account_id: cashAccountId,
      card_account_id: cardAccountId,
      transfer_account_id: transferAccountId,
      comments: emptyToNull(parsed.data.comments),
      source: "MANUAL",
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  await supabase.from("audit_logs").insert({
    organization_id: orgId,
    user_id: ctx.userId,
    action: "CREATE",
    entity: "cash_daily_closes",
    entity_id: data.id,
    new_values: parsed.data,
  });

  revalidateTreasuryPaths();
  return { ok: true, id: data.id };
}

export async function submitCashDailyCloseAction(
  closeId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!canDeclareCashClose(ctx)) {
    return { ok: false, error: "Sin permiso para enviar cierre de caja" };
  }

  const supabase = await createClient();
  let close;
  try {
    close = await loadCashClose(supabase, ctx.organization.id, closeId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" };
  }
  if (!close) return { ok: false, error: "Cierre no encontrado" };
  if (close.status !== "BORRADOR" && close.status !== "RECHAZADO") {
    return { ok: false, error: "Solo se pueden enviar borradores o rechazados" };
  }
  if (!close.cash_account_id || !close.card_account_id) {
    return { ok: false, error: "Defina las cuentas destino antes de enviar" };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("cash_daily_closes")
    .update({
      status: "EN_REVISION",
      submitted_by: ctx.userId,
      submitted_at: now,
      rejection_reason: null,
      transfer_account_id:
        close.transfer_account_id ?? close.card_account_id,
      updated_by: ctx.userId,
    })
    .eq("id", closeId)
    .eq("organization_id", ctx.organization.id);

  if (error) return { ok: false, error: error.message };

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "SUBMIT",
    entity: "cash_daily_closes",
    entity_id: closeId,
  });

  revalidateTreasuryPaths();
  return { ok: true, id: closeId };
}

/** Guarda borrador y lo envía a revisión en un paso. */
export async function saveAndSubmitCashDailyCloseAction(
  formData: FormData,
): Promise<ActionResult> {
  const draft = await upsertCashDailyCloseDraftAction(formData);
  if (!draft.ok || !draft.id) return draft;
  return submitCashDailyCloseAction(draft.id);
}

export async function approveCashDailyCloseAction(
  closeId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "tesoreria.caja.avalar")) {
    return { ok: false, error: "Sin permiso para avalar cierre de caja" };
  }

  const parsed = cashDailyCloseApproveSchema.safeParse({
    pos_cash_amount: formData.get("pos_cash_amount"),
    pos_card_amount: formData.get("pos_card_amount"),
    pos_transfer_amount: formData.get("pos_transfer_amount"),
    bank_card_amount: formData.get("bank_card_amount"),
    cash_credited: formData.get("cash_credited"),
    card_credited: formData.get("card_credited"),
    transfer_credited: formData.get("transfer_credited"),
    comments: formData.get("comments"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const supabase = await createClient();
  const orgId = ctx.organization.id;
  let close;
  try {
    close = await loadCashClose(supabase, orgId, closeId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" };
  }
  if (!close) return { ok: false, error: "Cierre no encontrado" };
  if (close.status !== "EN_REVISION") {
    return { ok: false, error: "Solo se pueden avalar cierres en revisión" };
  }
  if (!close.cash_account_id || !close.card_account_id) {
    return { ok: false, error: "Faltan cuentas destino" };
  }

  const transferAccountId =
    close.transfer_account_id ?? close.card_account_id;

  const cashCredited =
    parseMoney(parsed.data.cash_credited ?? "") ?? Number(close.cash_sales);
  const cardCredited =
    parseMoney(parsed.data.card_credited ?? "") ?? Number(close.card_sales);
  const transferCredited =
    parseMoney(parsed.data.transfer_credited ?? "") ??
    Number(close.transfer_sales ?? 0);

  const posCash = parseMoney(parsed.data.pos_cash_amount ?? "");
  const posCard = parseMoney(parsed.data.pos_card_amount ?? "");
  const posTransfer = parseMoney(parsed.data.pos_transfer_amount ?? "");
  const bankCard = parseMoney(parsed.data.bank_card_amount ?? "");

  const { data: existingTxs } = await supabase
    .from("bank_transactions")
    .select("id")
    .eq("organization_id", orgId)
    .eq("linked_entity_type", "cash_daily_close")
    .eq("linked_entity_id", closeId)
    .is("deleted_at", null)
    .limit(1);

  if (!existingTxs?.length) {
    const txRows: Array<Record<string, unknown>> = [];
    if (cashCredited > 0) {
      txRows.push({
        organization_id: orgId,
        bank_account_id: close.cash_account_id,
        transaction_date: close.business_date,
        description: `Cierre caja efectivo ${close.business_date}`,
        reference: `caja-${close.business_date}`,
        debit: 0,
        credit: cashCredited,
        origin: "tesoreria.caja",
        category: "INGRESO_CAJA",
        linked_entity_type: "cash_daily_close",
        linked_entity_id: closeId,
        created_by: ctx.userId,
        updated_by: ctx.userId,
      });
    }
    if (cardCredited > 0) {
      txRows.push({
        organization_id: orgId,
        bank_account_id: close.card_account_id,
        transaction_date: close.business_date,
        description: `Cierre caja adquirencia ${close.business_date}`,
        reference: `adquirencia-${close.business_date}`,
        debit: 0,
        credit: cardCredited,
        origin: "tesoreria.caja",
        category: "INGRESO_ADQUIRENCIA",
        linked_entity_type: "cash_daily_close",
        linked_entity_id: closeId,
        created_by: ctx.userId,
        updated_by: ctx.userId,
      });
    }
    if (transferCredited > 0) {
      txRows.push({
        organization_id: orgId,
        bank_account_id: transferAccountId,
        transaction_date: close.business_date,
        description: `Cierre caja transferencias/QR ${close.business_date}`,
        reference: `transfer-${close.business_date}`,
        debit: 0,
        credit: transferCredited,
        origin: "tesoreria.caja",
        category: "INGRESO_TRANSFERENCIA",
        linked_entity_type: "cash_daily_close",
        linked_entity_id: closeId,
        created_by: ctx.userId,
        updated_by: ctx.userId,
      });
    }
    if (txRows.length > 0) {
      const { error: txError } = await supabase
        .from("bank_transactions")
        .insert(txRows);
      if (txError) return { ok: false, error: txError.message };
    }
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("cash_daily_closes")
    .update({
      status: "AVALADO",
      pos_cash_amount: posCash,
      pos_card_amount: posCard,
      pos_transfer_amount: posTransfer,
      bank_card_amount: bankCard,
      cash_credited: cashCredited,
      card_credited: cardCredited,
      transfer_credited: transferCredited,
      comments: emptyToNull(parsed.data.comments) ?? undefined,
      reviewed_by: ctx.userId,
      reviewed_at: now,
      updated_by: ctx.userId,
    })
    .eq("id", closeId)
    .eq("organization_id", orgId);

  if (error) return { ok: false, error: error.message };

  await supabase.from("audit_logs").insert({
    organization_id: orgId,
    user_id: ctx.userId,
    action: "APPROVE",
    entity: "cash_daily_closes",
    entity_id: closeId,
    new_values: {
      cash_credited: cashCredited,
      card_credited: cardCredited,
      transfer_credited: transferCredited,
      pos_cash_amount: posCash,
      pos_card_amount: posCard,
      pos_transfer_amount: posTransfer,
      bank_card_amount: bankCard,
    },
  });

  revalidateTreasuryPaths();
  return { ok: true, id: closeId };
}

export async function rejectCashDailyCloseAction(
  closeId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "tesoreria.caja.avalar")) {
    return { ok: false, error: "Sin permiso para rechazar cierre de caja" };
  }

  const parsed = cashDailyCloseRejectSchema.safeParse({
    rejection_reason: formData.get("rejection_reason"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const supabase = await createClient();
  let close;
  try {
    close = await loadCashClose(supabase, ctx.organization.id, closeId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" };
  }
  if (!close) return { ok: false, error: "Cierre no encontrado" };
  if (close.status !== "EN_REVISION") {
    return { ok: false, error: "Solo se pueden rechazar cierres en revisión" };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("cash_daily_closes")
    .update({
      status: "RECHAZADO",
      rejection_reason: parsed.data.rejection_reason.trim(),
      reviewed_by: ctx.userId,
      reviewed_at: now,
      updated_by: ctx.userId,
    })
    .eq("id", closeId)
    .eq("organization_id", ctx.organization.id);

  if (error) return { ok: false, error: error.message };

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "REJECT",
    entity: "cash_daily_closes",
    entity_id: closeId,
    new_values: { rejection_reason: parsed.data.rejection_reason },
  });

  revalidateTreasuryPaths();
  return { ok: true, id: closeId };
}

async function availableBalanceOnAccount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  accountId: string,
  orgCutoff: string | null,
) {
  let snapQuery = supabase
    .from("bank_balance_snapshots")
    .select(
      "bank_account_id, cutoff_date, opening_balance, verification_status",
    )
    .eq("organization_id", orgId)
    .eq("bank_account_id", accountId)
    .is("deleted_at", null);
  if (orgCutoff) snapQuery = snapQuery.eq("cutoff_date", orgCutoff);
  const { data: snapRows } = await snapQuery;
  let snapshots = (snapRows ?? []) as BalanceSnapshotInput[];
  if (snapshots.length === 0) {
    const { data: latestSnaps } = await supabase
      .from("bank_balance_snapshots")
      .select(
        "bank_account_id, cutoff_date, opening_balance, verification_status",
      )
      .eq("organization_id", orgId)
      .eq("bank_account_id", accountId)
      .is("deleted_at", null)
      .order("cutoff_date", { ascending: false })
      .limit(1);
    snapshots = (latestSnaps ?? []) as BalanceSnapshotInput[];
  }

  const { data: txRows } = await supabase
    .from("bank_transactions")
    .select("bank_account_id, transaction_date, debit, credit")
    .eq("organization_id", orgId)
    .eq("bank_account_id", accountId)
    .is("deleted_at", null);

  return availableBalanceForAccount({
    accountId,
    snapshots,
    transactions: (txRows ?? []) as BankTransactionInput[],
    orgCutoff,
  });
}

/**
 * Corrige la cuenta de un movimiento (p. ej. un pago cargado a la cuenta equivocada).
 * No aplica a traspasos entre cuentas (tienen dos piernas).
 */
export async function reassignBankTransactionAccountAction(
  transactionId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "tesoreria.cuentas")) {
    return { ok: false, error: "Sin permiso para corregir movimientos" };
  }

  const parsed = reassignBankTransactionAccountSchema.safeParse({
    bank_account_id: formData.get("bank_account_id"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const newAccountId = parsed.data.bank_account_id;
  const supabase = await createClient();
  const orgId = ctx.organization.id;

  const { data: tx, error: txError } = await supabase
    .from("bank_transactions")
    .select(
      "id, bank_account_id, transaction_date, debit, credit, origin, category, linked_entity_type, linked_entity_id, description, reference",
    )
    .eq("id", transactionId)
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();

  if (txError) return { ok: false, error: txError.message };
  if (!tx) return { ok: false, error: "Movimiento no encontrado" };

  if (tx.category === "TRASPASO" || tx.origin === "tesoreria.traspaso") {
    return {
      ok: false,
      error:
        "Los traspasos no se editan aquí: haga un traspaso inverso o cree uno nuevo.",
    };
  }

  if (tx.bank_account_id === newAccountId) {
    return { ok: true, id: transactionId };
  }

  const { data: newAccount, error: accError } = await supabase
    .from("bank_accounts")
    .select("id, bank_name, is_active")
    .eq("id", newAccountId)
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();

  if (accError) return { ok: false, error: accError.message };
  if (!newAccount?.is_active) {
    return { ok: false, error: "La cuenta destino no está activa" };
  }

  const debit = Number(tx.debit || 0);
  if (debit > 0) {
    const available = await availableBalanceOnAccount(
      supabase,
      orgId,
      newAccountId,
      ctx.organization.administrative_cutoff_date,
    );
    if (!hasFundsFor(available, debit)) {
      return {
        ok: false,
        error: `Fondos insuficientes en ${newAccount.bank_name}. Disponible ${formatCOP(available)}; egreso ${formatCOP(debit)}.`,
      };
    }
  }

  const { error: updateError } = await supabase
    .from("bank_transactions")
    .update({
      bank_account_id: newAccountId,
      updated_by: ctx.userId,
    })
    .eq("id", transactionId)
    .eq("organization_id", orgId);

  if (updateError) return { ok: false, error: updateError.message };

  if (tx.linked_entity_type === "payment_requests" && tx.linked_entity_id) {
    await supabase
      .from("payment_requests")
      .update({
        bank_account_id: newAccountId,
        updated_by: ctx.userId,
      })
      .eq("id", tx.linked_entity_id)
      .eq("organization_id", orgId)
      .eq("bank_transaction_id", transactionId);

    const { data: payReq } = await supabase
      .from("payment_requests")
      .select("expense_id")
      .eq("id", tx.linked_entity_id)
      .eq("organization_id", orgId)
      .maybeSingle();

    if (payReq?.expense_id) {
      await supabase
        .from("expenses")
        .update({
          bank_account_id: newAccountId,
          updated_by: ctx.userId,
        })
        .eq("id", payReq.expense_id)
        .eq("organization_id", orgId);
    }
  }

  await supabase
    .from("accounts_payable_payments")
    .update({
      bank_account_id: newAccountId,
      updated_by: ctx.userId,
    })
    .eq("bank_transaction_id", transactionId)
    .eq("organization_id", orgId);

  if (tx.linked_entity_type === "cash_daily_close" && tx.linked_entity_id) {
    const closePatch: Record<string, string> = { updated_by: ctx.userId };
    if (tx.category === "INGRESO_CAJA") {
      closePatch.cash_account_id = newAccountId;
    } else if (tx.category === "INGRESO_ADQUIRENCIA") {
      closePatch.card_account_id = newAccountId;
    } else if (tx.category === "INGRESO_TRANSFERENCIA") {
      closePatch.transfer_account_id = newAccountId;
    }
    if (Object.keys(closePatch).length > 1) {
      await supabase
        .from("cash_daily_closes")
        .update(closePatch)
        .eq("id", tx.linked_entity_id)
        .eq("organization_id", orgId);
    }
  }

  await supabase.from("audit_logs").insert({
    organization_id: orgId,
    user_id: ctx.userId,
    action: "UPDATE",
    entity: "bank_transactions",
    entity_id: transactionId,
    old_values: { bank_account_id: tx.bank_account_id },
    new_values: {
      bank_account_id: newAccountId,
      kind: "REASSIGN_ACCOUNT",
      description: tx.description,
      debit,
      credit: Number(tx.credit || 0),
    },
  });

  revalidateTreasuryPaths();
  return { ok: true, id: transactionId };
}
