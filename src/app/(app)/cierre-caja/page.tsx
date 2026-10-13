import { AppHeader } from "@/components/layout/app-header";
import { Card, PageIntro } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess, requireModuleAccess } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { todayInBogota } from "@/lib/dates";
import {
  availableBalanceForAccount,
  type BalanceSnapshotInput,
  type BankTransactionInput,
} from "@/lib/treasury-balance";
import { findCashFloatAccount } from "@/lib/treasury";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  CashCloseSection,
  type CashDailyCloseRow,
} from "../tesoreria/cash-close-client";
import type { BankAccountRow } from "../tesoreria/treasury-client";

export default async function CierreCajaPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "cierre-caja");

  if (!ctx.organization) {
    return (
      <>
        <AppHeader
          title="Cierre de caja"
          subtitle="Reporte diario del local"
        />
        <main className="p-8">
          <Card>
            <p className="font-medium">Primero configura la empresa</p>
            <Link
              href="/empresa"
              className="mt-4 inline-flex rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white"
            >
              Ir a Empresa
            </Link>
          </Card>
        </main>
      </>
    );
  }

  const supabase = await createClient();
  const orgId = ctx.organization.id;
  const today = todayInBogota();
  const cutoff = ctx.organization.administrative_cutoff_date;
  const canDeclare =
    ctxCanAccess(ctx, "cierre-caja.declarar") ||
    ctxCanAccess(ctx, "tesoreria.caja.declarar");
  const cashFloatTarget = Number(ctx.organization.cash_float_target ?? 0);

  const { data: accountRows } = await supabase
    .from("bank_accounts")
    .select(
      "id, bank_name, account_kind, account_type, masked_number, holder_name, is_active, notes, is_cash_float",
    )
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  const accounts = (accountRows ?? []) as BankAccountRow[];
  const accountIds = accounts.map((a) => a.id);

  let cashFloatCurrent = 0;
  const floatAcc = findCashFloatAccount(accounts);
  if (floatAcc && accountIds.length > 0) {
    let snapQuery = supabase
      .from("bank_balance_snapshots")
      .select(
        "bank_account_id, cutoff_date, opening_balance, verification_status",
      )
      .eq("organization_id", orgId)
      .eq("bank_account_id", floatAcc.id)
      .is("deleted_at", null);
    if (cutoff) snapQuery = snapQuery.eq("cutoff_date", cutoff);
    const { data: snapRows } = await snapQuery;
    let snapshots = (snapRows ?? []) as BalanceSnapshotInput[];
    if (snapshots.length === 0) {
      const { data: latest } = await supabase
        .from("bank_balance_snapshots")
        .select(
          "bank_account_id, cutoff_date, opening_balance, verification_status",
        )
        .eq("organization_id", orgId)
        .eq("bank_account_id", floatAcc.id)
        .is("deleted_at", null)
        .order("cutoff_date", { ascending: false })
        .limit(1);
      snapshots = (latest ?? []) as BalanceSnapshotInput[];
    }
    const { data: txRows } = await supabase
      .from("bank_transactions")
      .select("bank_account_id, transaction_date, debit, credit")
      .eq("organization_id", orgId)
      .eq("bank_account_id", floatAcc.id)
      .is("deleted_at", null);
    cashFloatCurrent = availableBalanceForAccount({
      accountId: floatAcc.id,
      snapshots,
      transactions: (txRows ?? []) as BankTransactionInput[],
      orgCutoff: cutoff,
    }).toNumber();
  }

  const { data: closeRows } = await supabase
    .from("cash_daily_closes")
    .select(
      "id, business_date, status, cash_float, cash_sales, card_sales, card_debit_sales, card_credit_sales, transfer_sales, cash_account_id, card_account_id, transfer_account_id, pos_cash_amount, pos_card_amount, pos_transfer_amount, bank_card_amount, cash_credited, card_credited, transfer_credited, rejection_reason, comments, submitted_at, reviewed_at",
    )
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .order("business_date", { ascending: false })
    .limit(30);

  const cashCloses = (closeRows ?? []) as CashDailyCloseRow[];
  const todayClose =
    cashCloses.find((c) => c.business_date === today) ?? null;
  const history = cashCloses
    .filter((c) => c.business_date !== today)
    .slice(0, 12);

  return (
    <>
      <AppHeader
        title="Cierre de caja"
        subtitle="Reporte del turno · efectivo, datáfono y QR"
      />
      <main className="space-y-6 p-8">
        <PageIntro
          title="¿Cómo quedó el día en el local?"
          description="Reporte ventas en efectivo y el restante de base (debe cuadrar con Tesorería). Gerencia avala en Tesorería."
        />

        <CashCloseSection
          accounts={accounts}
          todayClose={todayClose}
          pendingReview={[]}
          history={history}
          canDeclare={canDeclare}
          canAvalar={false}
          cashFloatTarget={cashFloatTarget}
          cashFloatCurrent={cashFloatCurrent}
        />
      </main>
    </>
  );
}
