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
  PaymentRequestQueues,
  type BankAccountOption,
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
          "id, source, status, priority, concept, amount, requested_at, due_date, supplier_id, document_number, document_type, notes, rejection_reason, paid_at, payment_reference",
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
      .select("bank_account_id, transaction_date, debit, credit")
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
            canApprove={canApprove}
            canPay={canPay}
          />
        )}
      </main>
    </>
  );
}
