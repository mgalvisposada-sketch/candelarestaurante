import { AppHeader } from "@/components/layout/app-header";
import { Card, EmptyState, PageIntro, StatCard } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess, requireModuleAccess } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatCOP, money } from "@/lib/money";
import { ensureCashFloatAccount } from "@/lib/cash-float";
import {
  availableBalanceForAccount,
  type BalanceSnapshotInput,
  type BankTransactionInput,
} from "@/lib/treasury-balance";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  reconstructBilledQty,
} from "@/lib/purchases/payment-invoice-detail";
import { roundMoney } from "@/lib/purchases/invoice-charges";
import { roundPurchaseQty } from "@/lib/purchases/qty";
import {
  PaymentRequestQueues,
  type BankAccountOption,
  type PaymentInvoiceDetail,
  type PaymentRequestRow,
  type SupplierOption,
} from "./payment-requests-client";

export default async function SolicitudesPagoPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "solicitudes-pago");

  if (!ctx.organization) {
    return (
      <>
        <AppHeader title="Solicitudes de pago" subtitle="Aprobación y cola de tesorería" />
        <main className="p-8">
          <Card>
            <p className="font-medium">Primero configura la empresa</p>
            <Link
              href="/empresa"
              className="mt-4 inline-flex rounded-lg bg-[var(--solid)] px-4 py-2 text-sm text-[var(--on-solid)]"
            >
              Ir a Empresa
            </Link>
          </Card>
        </main>
      </>
    );
  }

  const supabase = await createClient();
  try {
    await ensureCashFloatAccount(
      supabase,
      ctx.organization.id,
      ctx.userId,
    );
  } catch {
    /* la lista puede seguir sin Base si falla */
  }

  const [{ data: requestRows }, { data: supplierRows }, { data: bankRows }] =
    await Promise.all([
      supabase
        .from("payment_requests")
        .select(
          "id, source, status, priority, concept, amount, requested_at, due_date, supplier_id, document_number, document_type, notes, rejection_reason, paid_at, payment_reference, payment_proof_document_id",
        )
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .order("requested_at", { ascending: false }),
      supabase
        .from("suppliers")
        .select("id, name")
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("bank_accounts")
        .select(
          "id, bank_name, account_kind, masked_number, is_cash_float, fund_purpose",
        )
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("bank_name"),
    ]);

  const requests = (requestRows ?? []) as PaymentRequestRow[];
  const suppliers = (supplierRows ?? []) as SupplierOption[];
  const bankBase = ([...(bankRows ?? [])] as BankAccountOption[]).sort(
    (a, b) => {
      const rank = (x: BankAccountOption) =>
        x.is_cash_float ? 0 : x.account_kind === "CAJA" ? 1 : 2;
      return rank(a) - rank(b);
    },
  );
  const bankIds = bankBase.map((b) => b.id);
  const orgCutoff = ctx.organization.administrative_cutoff_date;

  let bankAccounts = bankBase;
  if (bankIds.length > 0) {
    let snapQuery = supabase
      .from("bank_balance_snapshots")
      .select(
        "bank_account_id, cutoff_date, opening_balance, verification_status",
      )
      .eq("organization_id", ctx.organization.id)
      .is("deleted_at", null)
      .in("bank_account_id", bankIds);
    if (orgCutoff) {
      snapQuery = snapQuery.eq("cutoff_date", orgCutoff);
    }
    const { data: snapRows } = await snapQuery;
    let snapshots = (snapRows ?? []) as BalanceSnapshotInput[];
    if (snapshots.length === 0) {
      const { data: allSnaps } = await supabase
        .from("bank_balance_snapshots")
        .select(
          "bank_account_id, cutoff_date, opening_balance, verification_status",
        )
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .in("bank_account_id", bankIds)
        .order("cutoff_date", { ascending: false });
      const latest = new Map<string, BalanceSnapshotInput>();
      for (const row of (allSnaps ?? []) as BalanceSnapshotInput[]) {
        if (!latest.has(row.bank_account_id)) {
          latest.set(row.bank_account_id, row);
        }
      }
      snapshots = [...latest.values()];
    }

    const { data: txRows } = await supabase
      .from("bank_transactions")
      .select(
        "bank_account_id, transaction_date, debit, credit, settlement_status",
      )
      .eq("organization_id", ctx.organization.id)
      .is("deleted_at", null)
      .in("bank_account_id", bankIds);

    const transactions = (txRows ?? []) as BankTransactionInput[];
    bankAccounts = bankBase.map((b) => ({
      ...b,
      available_balance: availableBalanceForAccount({
        accountId: b.id,
        snapshots,
        transactions,
        orgCutoff,
      }).toFixed(2),
    }));
  }

  const review = requests.filter(
    (r) => r.status === "EN_REVISION" || r.status === "BORRADOR",
  );
  const payQueue = requests.filter(
    (r) => r.status === "EN_COLA_PAGO" || r.status === "APROBADA",
  );
  const history = requests.filter((r) =>
    ["PAGADA", "RECHAZADA", "ANULADA"].includes(r.status),
  );

  const reviewTotal = review.reduce(
    (acc, r) => acc.plus(money(r.amount)),
    money(0),
  );
  const payTotal = payQueue.reduce(
    (acc, r) => acc.plus(money(r.amount)),
    money(0),
  );

  const canApprove = ctxCanAccess(ctx, "solicitudes-pago.aprobar");
  const canPay = ctxCanAccess(ctx, "solicitudes-pago.pagar");
  const canCorrectPurchaseInvoice =
    canApprove || ctxCanAccess(ctx, "compras.solicitudes.facturar");

  const purchasePayIds = requests
    .filter((r) => r.source === "FACTURA_PROVEEDOR")
    .map((r) => r.id);
  const invoiceDetailByRequestId: Record<string, PaymentInvoiceDetail> = {};

  if (purchasePayIds.length > 0) {
    const { data: invoiceItemRows } = await supabase
      .from("purchase_request_items")
      .select(
        "id, purchase_request_id, product_id, unit, quantity_approved, quantity_requested, quantity_received, unit_cost_estimate, supplier_invoice_label, invoice_payment_request_id",
      )
      .eq("organization_id", ctx.organization.id)
      .is("deleted_at", null)
      .in("invoice_payment_request_id", purchasePayIds);

    const productIds = [
      ...new Set((invoiceItemRows ?? []).map((i) => i.product_id as string)),
    ];
    const purchaseIds = [
      ...new Set(
        (invoiceItemRows ?? []).map((i) => i.purchase_request_id as string),
      ),
    ];
    const [{ data: productRows }, { data: purchaseRows }] = await Promise.all([
      productIds.length
        ? supabase
            .from("products")
            .select("id, name")
            .eq("organization_id", ctx.organization.id)
            .in("id", productIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      purchaseIds.length
        ? supabase
            .from("purchase_requests")
            .select("id, title")
            .eq("organization_id", ctx.organization.id)
            .in("id", purchaseIds)
        : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    ]);
    const productNameById = new Map(
      (productRows ?? []).map((p) => [p.id, p.name]),
    );
    const purchaseTitleById = new Map(
      (purchaseRows ?? []).map((p) => [p.id, p.title]),
    );

    for (const payId of purchasePayIds) {
      const rows = (invoiceItemRows ?? []).filter(
        (i) => i.invoice_payment_request_id === payId,
      );
      if (rows.length === 0) continue;
      const purchaseRequestId = rows[0].purchase_request_id as string;
      const lines = rows.map((item) => {
        const billedQty = reconstructBilledQty({
          quantityApproved: item.quantity_approved,
          quantityRequested: item.quantity_requested,
          quantityReceived: item.quantity_received,
        });
        const unitCost = Number(item.unit_cost_estimate || 0);
        return {
          id: item.id as string,
          productName:
            productNameById.get(item.product_id as string) ??
            (item.product_id as string),
          supplierInvoiceLabel: (item.supplier_invoice_label as string | null) ?? null,
          unit: (item.unit as string) || "",
          quantityOrdered: roundPurchaseQty(
            Number(item.quantity_approved ?? item.quantity_requested ?? 0),
          ),
          quantityReceived: roundPurchaseQty(
            Number(item.quantity_received || 0),
          ),
          billedQty,
          unitCost,
          lineTotal: roundMoney(billedQty * unitCost),
        };
      });
      invoiceDetailByRequestId[payId] = {
        purchaseRequestId,
        purchaseTitle: purchaseTitleById.get(purchaseRequestId) ?? null,
        lines,
      };
    }
  }

  return (
    <>
      <AppHeader
        title="Solicitudes de pago"
        subtitle="Bandeja de tesorería · aprobar y pagar"
      />
      <main className="space-y-6 p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageIntro
            title="Cola de pagos"
            description="Aquí solo se aprueba y se paga. Las solicitudes llegan desde Compras (costos/CxP) o desde Gastos. Al pagar se actualiza el módulo de origen."
          />
          <div className="flex flex-wrap gap-2">
            <Link
              href="/gastos"
              className="rounded-lg border border-[var(--line)] px-4 py-2.5 text-sm font-medium hover:bg-neutral-50"
            >
              Gastos
            </Link>
            <Link
              href="/proveedores/cxp"
              className="rounded-lg border border-[var(--line)] px-4 py-2.5 text-sm font-medium hover:bg-neutral-50"
            >
              CxP
            </Link>
            <Link
              href="/tesoreria"
              className="rounded-lg border border-[var(--line)] px-4 py-2.5 text-sm font-medium hover:bg-neutral-50"
            >
              Tesorería
            </Link>
            <Link
              href="/tesoreria/pagos"
              className="rounded-lg border border-[var(--line)] px-4 py-2.5 text-sm font-medium hover:bg-neutral-50"
            >
              Historial de pagos
            </Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard
            label="Por aprobar"
            value={formatCOP(reviewTotal)}
            hint={`${review.length} ${review.length === 1 ? "solicitud" : "solicitudes"}`}
          />
          <StatCard
            label="Por pagar"
            value={formatCOP(payTotal)}
            hint={`${payQueue.length} ${payQueue.length === 1 ? "solicitud" : "solicitudes"}`}
          />
          <StatCard
            label="Histórico"
            value={String(history.length)}
            hint="Cola local · auditoría en Tesorería → Pagos"
          />
        </div>

        {requests.length === 0 ? (
          <EmptyState
            title="Sin solicitudes de pago"
            description="Acepte facturas en Compras (costos) o regístrelas en Gastos; aparecerán aquí para aprobar y pagar."
          />
        ) : (
          <PaymentRequestQueues
            review={review}
            payQueue={payQueue}
            history={history}
            suppliers={suppliers}
            bankAccounts={bankAccounts}
            invoiceDetailByRequestId={invoiceDetailByRequestId}
            canApprove={canApprove}
            canPay={canPay}
            canCorrectPurchaseInvoice={canCorrectPurchaseInvoice}
          />
        )}
      </main>
    </>
  );
}
