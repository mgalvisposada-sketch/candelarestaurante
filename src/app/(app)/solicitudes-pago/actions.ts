"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess } from "@/lib/permissions";
import { todayInBogota } from "@/lib/dates";
import { formatCOP, hasFundsFor } from "@/lib/money";
import { ensureCashFloatAccount } from "@/lib/cash-float";
import {
  availableBalanceForAccount,
  type BalanceSnapshotInput,
  type BankTransactionInput,
} from "@/lib/treasury-balance";
import {
  payPaymentRequestSchema,
  rejectPaymentRequestSchema,
} from "@/validations/payment-requests";
import type { ActionResult } from "../empresa/actions";
import { syncPurchaseOrdersAfterPayment } from "../compras/purchase-actions";

type PaymentRequestStatus =
  | "BORRADOR"
  | "EN_REVISION"
  | "APROBADA"
  | "EN_COLA_PAGO"
  | "PAGADA"
  | "RECHAZADA"
  | "ANULADA";

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

function revalidatePaymentPaths() {
  revalidatePath("/solicitudes-pago");
  revalidatePath("/proveedores");
  revalidatePath("/proveedores/cxp");
  revalidatePath("/proveedores/maestro");
  revalidatePath("/gastos");
  revalidatePath("/tesoreria");
  revalidatePath("/tesoreria/pagos");
  revalidatePath("/inicio");
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

async function getWritableRequest(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  requestId: string,
) {
  const { data, error } = await supabase
    .from("payment_requests")
    .select(
      "id, source, status, concept, amount, supplier_id, ap_document_id, expense_id, create_expense, due_date, document_type, document_number, issue_date, notes",
    )
    .eq("id", requestId)
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

/** Alta cerrada: las solicitudes nacen en Compras/CxP o Gastos. */
export async function createInternalPaymentRequestAction(
  _formData: FormData,
): Promise<ActionResult> {
  return {
    ok: false,
    error:
      "Ya no se crean solicitudes aquí. Costos: Compras. Gastos operativos: módulo Gastos.",
  };
}

/** Alta cerrada: las facturas se registran en Compras o Gastos. */
export async function createInvoicePaymentRequestAction(
  _formData: FormData,
): Promise<ActionResult> {
  return {
    ok: false,
    error:
      "Ya no se registran facturas aquí. Costos de insumos: Compras. Opex: Gastos.",
  };
}

export async function approvePaymentRequestAction(
  requestId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "solicitudes-pago.aprobar")) {
    return { ok: false, error: "Sin permiso para aprobar" };
  }

  const supabase = await createClient();
  let req;
  try {
    req = await getWritableRequest(supabase, ctx.organization.id, requestId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" };
  }
  if (!req) return { ok: false, error: "Solicitud no encontrada" };
  if (req.status !== "EN_REVISION" && req.status !== "BORRADOR") {
    return { ok: false, error: "Solo se pueden aprobar solicitudes en revisión" };
  }

  let expenseId = req.expense_id as string | null;

  if (!expenseId && req.create_expense) {
    const { data: expense, error: expenseError } = await supabase
      .from("expenses")
      .insert({
        organization_id: ctx.organization.id,
        expense_date: todayInBogota(),
        supplier_id: req.supplier_id,
        concept: req.concept,
        amount: Number(req.amount),
        tax_amount: 0,
        total_amount: Number(req.amount),
        nature: "UNICO",
        criticality: "ESENCIAL",
        status: "APROBADO",
        created_by: ctx.userId,
        updated_by: ctx.userId,
      })
      .select("id")
      .single();

    if (expenseError) return { ok: false, error: expenseError.message };
    expenseId = expense.id;
  } else if (expenseId) {
    await supabase
      .from("expenses")
      .update({ status: "APROBADO", updated_by: ctx.userId })
      .eq("id", expenseId)
      .eq("organization_id", ctx.organization.id);
  }

  if (req.ap_document_id) {
    await supabase
      .from("accounts_payable_documents")
      .update({
        verification_status: "CONFIRMADO",
        validated_by: ctx.userId,
        validated_at: new Date().toISOString(),
        updated_by: ctx.userId,
      })
      .eq("id", req.ap_document_id)
      .eq("organization_id", ctx.organization.id);
  }

  const { error } = await supabase
    .from("payment_requests")
    .update({
      status: "EN_COLA_PAGO" satisfies PaymentRequestStatus,
      expense_id: expenseId,
      approved_by: ctx.userId,
      approved_at: new Date().toISOString(),
      updated_by: ctx.userId,
    })
    .eq("id", requestId)
    .eq("organization_id", ctx.organization.id);

  if (error) return { ok: false, error: error.message };

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "APPROVE",
    entity: "payment_requests",
    entity_id: requestId,
  });

  revalidatePaymentPaths();
  return { ok: true, id: requestId };
}

export async function rejectPaymentRequestAction(
  requestId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "solicitudes-pago.aprobar")) {
    return { ok: false, error: "Sin permiso para rechazar" };
  }

  const parsed = rejectPaymentRequestSchema.safeParse({
    rejection_reason: formData.get("rejection_reason"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  let req;
  try {
    req = await getWritableRequest(supabase, ctx.organization.id, requestId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" };
  }
  if (!req) return { ok: false, error: "Solicitud no encontrada" };
  if (req.status !== "EN_REVISION" && req.status !== "BORRADOR") {
    return { ok: false, error: "Solo se pueden rechazar solicitudes en revisión" };
  }

  const { error } = await supabase
    .from("payment_requests")
    .update({
      status: "RECHAZADA",
      rejection_reason: parsed.data.rejection_reason.trim(),
      approved_by: ctx.userId,
      approved_at: new Date().toISOString(),
      updated_by: ctx.userId,
    })
    .eq("id", requestId)
    .eq("organization_id", ctx.organization.id);

  if (error) return { ok: false, error: error.message };

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "REJECT",
    entity: "payment_requests",
    entity_id: requestId,
    new_values: { rejection_reason: parsed.data.rejection_reason },
  });

  revalidatePaymentPaths();
  return { ok: true, id: requestId };
}

async function availableForAccount(
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

export async function payPaymentRequestAction(
  requestId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "solicitudes-pago.pagar")) {
    return { ok: false, error: "Sin permiso para ejecutar pagos" };
  }

  const parsed = payPaymentRequestSchema.safeParse({
    payment_date: formData.get("payment_date") || todayInBogota(),
    bank_account_id: formData.get("bank_account_id"),
    amount: formData.get("amount"),
    secondary_account_id: formData.get("secondary_account_id"),
    secondary_amount: formData.get("secondary_amount"),
    payment_reference: formData.get("payment_reference"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Datos inválidos",
    };
  }

  const supabase = await createClient();
  const orgId = ctx.organization.id;

  try {
    await ensureCashFloatAccount(supabase, orgId, ctx.userId);
  } catch {
    /* si falla, el pago puede seguir con cuentas existentes */
  }

  let req;
  try {
    req = await getWritableRequest(supabase, orgId, requestId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" };
  }
  if (!req) return { ok: false, error: "Solicitud no encontrada" };
  if (req.status !== "EN_COLA_PAGO" && req.status !== "APROBADA") {
    return { ok: false, error: "La solicitud no está en cola de pago" };
  }

  const requestTotal = Number(req.amount);
  const primaryId = String(parsed.data.bank_account_id ?? "").trim();
  const secondaryId = emptyToNull(parsed.data.secondary_account_id);
  const secondaryAmt = parseMoney(parsed.data.secondary_amount, 0) ?? 0;
  let primaryAmt = parseMoney(parsed.data.amount, requestTotal) ?? requestTotal;

  if (secondaryId && secondaryAmt > 0) {
    primaryAmt = parseMoney(parsed.data.amount, requestTotal - secondaryAmt) ??
      requestTotal - secondaryAmt;
  }

  type Leg = { accountId: string; amount: number };
  const legs: Leg[] = [];
  if (primaryAmt > 0) legs.push({ accountId: primaryId, amount: primaryAmt });
  if (secondaryId && secondaryAmt > 0) {
    legs.push({ accountId: secondaryId, amount: secondaryAmt });
  }

  if (legs.length === 0) {
    return { ok: false, error: "Indique al menos un monto a pagar" };
  }

  const payAmount = legs.reduce((s, l) => s + l.amount, 0);
  if (payAmount <= 0) return { ok: false, error: "Monto de pago inválido" };
  if (Math.abs(payAmount - requestTotal) > 0.009) {
    return {
      ok: false,
      error: `La suma de las partes (${formatCOP(payAmount)}) debe igualar el total de la solicitud (${formatCOP(requestTotal)}).`,
    };
  }

  const accountIds = [...new Set(legs.map((l) => l.accountId))];
  const { data: accountRows } = await supabase
    .from("bank_accounts")
    .select("id, bank_name, is_active, is_cash_float")
    .eq("organization_id", orgId)
    .in("id", accountIds)
    .is("deleted_at", null);

  for (const leg of legs) {
    const acc = (accountRows ?? []).find((a) => a.id === leg.accountId);
    if (!acc?.is_active) {
      return { ok: false, error: "Una de las cuentas no está activa" };
    }
  }

  const orgCutoff = ctx.organization.administrative_cutoff_date;
  for (const leg of legs) {
    const available = await availableForAccount(
      supabase,
      orgId,
      leg.accountId,
      orgCutoff,
    );
    if (!hasFundsFor(available, leg.amount)) {
      const name =
        (accountRows ?? []).find((a) => a.id === leg.accountId)?.bank_name ??
        "la cuenta";
      return {
        ok: false,
        error: `Fondos insuficientes en ${name}. Disponible ${formatCOP(available)}; parte ${formatCOP(leg.amount)}.`,
      };
    }
  }

  const txIds: string[] = [];
  for (const leg of legs) {
    const acc = (accountRows ?? []).find((a) => a.id === leg.accountId);
    const partLabel =
      legs.length > 1
        ? ` · parte ${formatCOP(leg.amount)}${acc?.is_cash_float ? " (base)" : ""}`
        : "";
    const { data: bankTx, error: bankError } = await supabase
      .from("bank_transactions")
      .insert({
        organization_id: orgId,
        bank_account_id: leg.accountId,
        transaction_date: parsed.data.payment_date,
        description: `${req.concept}${partLabel}`,
        reference: emptyToNull(parsed.data.payment_reference),
        debit: leg.amount,
        credit: 0,
        origin: "solicitudes-pago",
        category: "PAGO",
        linked_entity_type: "payment_requests",
        linked_entity_id: requestId,
        created_by: ctx.userId,
        updated_by: ctx.userId,
      })
      .select("id")
      .single();
    if (bankError) return { ok: false, error: bankError.message };
    txIds.push(bankTx.id);

    if (req.ap_document_id) {
      const { error: apPayError } = await supabase
        .from("accounts_payable_payments")
        .insert({
          organization_id: orgId,
          accounts_payable_document_id: req.ap_document_id,
          payment_date: parsed.data.payment_date,
          amount: leg.amount,
          bank_account_id: leg.accountId,
          bank_transaction_id: bankTx.id,
          reference: emptyToNull(parsed.data.payment_reference),
          notes: emptyToNull(parsed.data.notes),
          created_by: ctx.userId,
          updated_by: ctx.userId,
        });
      if (apPayError) return { ok: false, error: apPayError.message };
    }
  }

  if (req.ap_document_id) {
    await refreshDocumentPaid(supabase, orgId, req.ap_document_id);
  }

  const primaryLeg = legs[0]!;
  const primaryTxId = txIds[0]!;
  const splitNote =
    legs.length > 1
      ? `Pago repartido: ${legs
          .map((l) => {
            const n =
              (accountRows ?? []).find((a) => a.id === l.accountId)?.bank_name ??
              l.accountId;
            return `${n} ${formatCOP(l.amount)}`;
          })
          .join(" + ")}`
      : null;

  if (req.expense_id) {
    await supabase
      .from("expenses")
      .update({
        status: "PAGADO",
        bank_account_id: primaryLeg.accountId,
        payment_method: "TRANSFERENCIA",
        updated_by: ctx.userId,
      })
      .eq("id", req.expense_id)
      .eq("organization_id", orgId);
  }

  const notesMerged = [emptyToNull(parsed.data.notes) ?? req.notes, splitNote]
    .filter(Boolean)
    .join(" · ");

  // Comprobante opcional (PDF/imagen) para enviar al proveedor.
  let proofDocumentId: string | null = null;
  const proofFile = formData.get("payment_proof");
  if (proofFile instanceof File && proofFile.size > 0) {
    const maxBytes = 20 * 1024 * 1024;
    if (proofFile.size > maxBytes) {
      return { ok: false, error: "El comprobante supera 20 MB" };
    }
    const safeName = proofFile.name.replace(/[^\w.\-]+/g, "_");
    const storagePath = `${orgId}/payment-proofs/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, proofFile, {
        contentType: proofFile.type || "application/octet-stream",
        upsert: false,
      });
    if (uploadError) return { ok: false, error: uploadError.message };

    const { data: docRow, error: docError } = await supabase
      .from("documents")
      .insert({
        organization_id: orgId,
        name: `Comprobante pago · ${req.concept}`.slice(0, 200),
        document_type: "COMPROBANTE_PAGO",
        file_size: proofFile.size,
        mime_type: proofFile.type || null,
        storage_path: storagePath,
        entity_type: "payment_requests",
        entity_id: requestId,
        uploaded_by: ctx.userId,
      })
      .select("id")
      .single();
    if (docError) {
      await supabase.storage.from("documents").remove([storagePath]);
      return { ok: false, error: docError.message };
    }
    proofDocumentId = docRow.id as string;
  }

  const { error } = await supabase
    .from("payment_requests")
    .update({
      status: "PAGADA",
      bank_account_id: primaryLeg.accountId,
      bank_transaction_id: primaryTxId,
      paid_amount: payAmount,
      paid_at: new Date().toISOString(),
      payment_reference: emptyToNull(parsed.data.payment_reference),
      payment_proof_document_id: proofDocumentId,
      notes: notesMerged || null,
      updated_by: ctx.userId,
    })
    .eq("id", requestId)
    .eq("organization_id", orgId);

  if (error) return { ok: false, error: error.message };

  await supabase.from("audit_logs").insert({
    organization_id: orgId,
    user_id: ctx.userId,
    action: "PAYMENT",
    entity: "payment_requests",
    entity_id: requestId,
    new_values: {
      amount: payAmount,
      legs,
      bank_transaction_ids: txIds,
      payment_proof_document_id: proofDocumentId,
    },
  });

  if (req.source === "FACTURA_PROVEEDOR") {
    try {
      await syncPurchaseOrdersAfterPayment(requestId);
    } catch {
      /* la OC se puede resincronizar al abrir la solicitud */
    }
  }

  revalidatePaymentPaths();
  revalidatePath("/cierre-caja");
  return { ok: true, id: requestId };
}

async function unlockPurchaseItemsFromPaymentRequest(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  userId: string,
  requestId: string,
  apDocumentId: string | null,
) {
  // Libera ítems de compra para poder volver a facturar.
  await supabase
    .from("purchase_request_items")
    .update({
      invoice_ap_document_id: null,
      invoice_payment_request_id: null,
      quantity_invoiced: null,
      updated_by: userId,
    })
    .eq("organization_id", orgId)
    .eq("invoice_payment_request_id", requestId)
    .is("deleted_at", null);

  if (apDocumentId) {
    await supabase
      .from("purchase_request_items")
      .update({
        invoice_ap_document_id: null,
        invoice_payment_request_id: null,
        quantity_invoiced: null,
        updated_by: userId,
      })
      .eq("organization_id", orgId)
      .eq("invoice_ap_document_id", apDocumentId)
      .is("deleted_at", null);
  }
}

async function resolvePurchaseRequestIdForPayment(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  requestId: string,
  notes: string | null,
): Promise<string | null> {
  const { data: item } = await supabase
    .from("purchase_request_items")
    .select("purchase_request_id")
    .eq("organization_id", orgId)
    .eq("invoice_payment_request_id", requestId)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (item?.purchase_request_id) return item.purchase_request_id as string;

  const match = notes?.match(/Desde compra\s+([0-9a-f-]{36})/i);
  return match?.[1] ?? null;
}

/**
 * Anula la solicitud de pago de una factura de compra (sin pagar),
 * elimina la CxP vinculada si no tiene pagos, y libera los ítems
 * para corregir y volver a facturar en Compras.
 */
export async function correctPurchaseInvoicePaymentRequestAction(
  requestId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  const can =
    ctxCanAccess(ctx, "solicitudes-pago.aprobar") ||
    ctxCanAccess(ctx, "compras.solicitudes.facturar");
  if (!can) {
    return {
      ok: false,
      error: "Sin permiso para corregir esta factura",
    };
  }

  const supabase = await createClient();
  const orgId = ctx.organization.id;
  let req;
  try {
    req = await getWritableRequest(supabase, orgId, requestId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" };
  }
  if (!req) return { ok: false, error: "Solicitud no encontrada" };
  if (req.source !== "FACTURA_PROVEEDOR") {
    return {
      ok: false,
      error: "Solo aplica a facturas de compra / CxP",
    };
  }
  if (req.status === "PAGADA") {
    return {
      ok: false,
      error: "Ya está pagada. No se puede corregir desde aquí.",
    };
  }
  if (req.status === "ANULADA") {
    return { ok: false, error: "Esta solicitud ya está anulada" };
  }

  const purchaseRequestId = await resolvePurchaseRequestIdForPayment(
    supabase,
    orgId,
    requestId,
    req.notes,
  );

  if (req.ap_document_id) {
    const { data: doc } = await supabase
      .from("accounts_payable_documents")
      .select("id, paid_amount, deleted_at")
      .eq("id", req.ap_document_id)
      .eq("organization_id", orgId)
      .maybeSingle();

    if (doc && !doc.deleted_at && Number(doc.paid_amount || 0) > 0) {
      return {
        ok: false,
        error:
          "La CxP ya tiene pagos. No se puede corregir hasta revertir esos pagos.",
      };
    }

    if (doc && !doc.deleted_at) {
      const now = new Date().toISOString();
      await supabase
        .from("accounts_payable_payments")
        .update({
          deleted_at: now,
          updated_by: ctx.userId,
        })
        .eq("accounts_payable_document_id", doc.id)
        .eq("organization_id", orgId)
        .is("deleted_at", null);

      const { error: docError } = await supabase
        .from("accounts_payable_documents")
        .update({
          deleted_at: now,
          status: "ANULADA",
          updated_by: ctx.userId,
        })
        .eq("id", doc.id)
        .eq("organization_id", orgId)
        .is("deleted_at", null);
      if (docError) return { ok: false, error: docError.message };
    }
  }

  await unlockPurchaseItemsFromPaymentRequest(
    supabase,
    orgId,
    ctx.userId,
    requestId,
    req.ap_document_id,
  );

  const { error } = await supabase
    .from("payment_requests")
    .update({
      status: "ANULADA",
      deleted_at: new Date().toISOString(),
      updated_by: ctx.userId,
    })
    .eq("id", requestId)
    .eq("organization_id", orgId);

  if (error) return { ok: false, error: error.message };

  await supabase.from("audit_logs").insert({
    organization_id: orgId,
    user_id: ctx.userId,
    action: "UPDATE",
    entity: "payment_requests",
    entity_id: requestId,
    new_values: {
      corrected: true,
      document_number: req.document_number,
      purchase_request_id: purchaseRequestId,
    },
  });

  revalidatePaymentPaths();
  revalidatePath("/compras/solicitudes");
  if (purchaseRequestId) {
    revalidatePath(`/compras/solicitudes/${purchaseRequestId}`);
  }
  return { ok: true, id: purchaseRequestId ?? requestId };
}

export async function softDeletePaymentRequestAction(
  requestId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "solicitudes-pago.aprobar")) {
    return { ok: false, error: "Sin permiso para anular" };
  }

  const supabase = await createClient();
  let req;
  try {
    req = await getWritableRequest(supabase, ctx.organization.id, requestId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" };
  }
  if (!req) return { ok: false, error: "Solicitud no encontrada" };
  if (req.status === "PAGADA") {
    return { ok: false, error: "No se puede anular una solicitud ya pagada" };
  }

  // Facturas de compra: al anular, liberar ítems (si no, no se puede refacturar).
  if (req.source === "FACTURA_PROVEEDOR") {
    return correctPurchaseInvoicePaymentRequestAction(requestId);
  }

  const { error } = await supabase
    .from("payment_requests")
    .update({
      status: "ANULADA",
      deleted_at: new Date().toISOString(),
      updated_by: ctx.userId,
    })
    .eq("id", requestId)
    .eq("organization_id", ctx.organization.id);

  if (error) return { ok: false, error: error.message };
  revalidatePaymentPaths();
  return { ok: true, id: requestId };
}
