import { AppHeader } from "@/components/layout/app-header";
import {
  Badge,
  Card,
  EmptyState,
  PageIntro,
  StatCard,
} from "@/components/ui/primitives";
import { WorkSection, WorkStack } from "@/components/ui/work-section";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess, requireModuleAccess } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatCOP } from "@/lib/money";
import { formatDateCO, todayInBogota } from "@/lib/dates";
import { ensureCashFloatAccount } from "@/lib/cash-float";
import { bankKindLabel } from "@/lib/treasury";
import {
  availableBalanceForAccount,
  sumAvailableBalances,
  type BalanceSnapshotInput,
  type BankTransactionInput,
} from "@/lib/treasury-balance";
import { isSuperAdmin } from "@/types/domain";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  BankAccountCard,
  CashFloatAndTransferPanel,
  CreateBankAccountForm,
  PendingAcquiringSettlementsPanel,
  type BalanceSnapshotRow,
  type BankAccountRow,
  type BankTransactionRow,
} from "./treasury-client";
import {
  CashCloseSection,
  type CashDailyCloseRow,
} from "./cash-close-client";
import { TesoreriaNav } from "./tesoreria-nav";

export default async function TesoreriaPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "tesoreria");

  const canManageLiquidity =
    ctxCanAccess(ctx, "tesoreria.cuentas") ||
    ctxCanAccess(ctx, "tesoreria.saldos") ||
    ctxCanAccess(ctx, "tesoreria.caja") ||
    ctxCanAccess(ctx, "tesoreria.caja.avalar");
  const canSeePayments =
    ctxCanAccess(ctx, "tesoreria.pagos") ||
    ctxCanAccess(ctx, "solicitudes-pago.pagar");
  if (!canManageLiquidity && canSeePayments) {
    redirect("/tesoreria/pagos");
  }

  if (!ctx.organization) {
    return (
      <>
        <AppHeader
          title="Tesorería"
          subtitle="Bancos, liquidez y aval de cierres"
        />
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

  const cutoff = ctx.organization.administrative_cutoff_date;
  const supabase = await createClient();
  const orgId = ctx.organization.id;
  const today = todayInBogota();

  const canManageAccounts = ctxCanAccess(ctx, "tesoreria.cuentas");
  const canAvalar = ctxCanAccess(ctx, "tesoreria.caja.avalar");
  const canConfirmAcquiring = canAvalar || canManageAccounts;
  const canSeeCaja =
    ctxCanAccess(ctx, "tesoreria.caja") || canAvalar;

  try {
    await ensureCashFloatAccount(supabase, orgId, ctx.userId);
  } catch {
    /* sigue sin Base si falla */
  }

  const { data: accountRows } = await supabase
    .from("bank_accounts")
    .select(
      "id, bank_name, account_kind, fund_purpose, account_type, masked_number, holder_name, is_active, notes, is_cash_float",
    )
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  const accounts = (accountRows ?? []) as BankAccountRow[];
  const accountIds = accounts.map((a) => a.id);
  const activeIds = accounts.filter((a) => a.is_active).map((a) => a.id);

  let snapshots: BalanceSnapshotRow[] = [];
  let transactions: BankTransactionInput[] = [];
  let movementRows: BankTransactionRow[] = [];
  let cashCloses: CashDailyCloseRow[] = [];

  if (accountIds.length > 0) {
    let query = supabase
      .from("bank_balance_snapshots")
      .select(
        "id, bank_account_id, cutoff_date, opening_balance, verification_status, comments, source",
      )
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .in("bank_account_id", accountIds);

    if (cutoff) {
      query = query.eq("cutoff_date", cutoff);
    }

    const { data: snapRows } = await query;
    snapshots = (snapRows ?? []) as BalanceSnapshotRow[];

    if (snapshots.length === 0) {
      const { data: allSnaps } = await supabase
        .from("bank_balance_snapshots")
        .select(
          "id, bank_account_id, cutoff_date, opening_balance, verification_status, comments, source",
        )
        .eq("organization_id", orgId)
        .is("deleted_at", null)
        .in("bank_account_id", accountIds)
        .order("cutoff_date", { ascending: false });

      const latestByAccount = new Map<string, BalanceSnapshotRow>();
      for (const row of (allSnaps ?? []) as BalanceSnapshotRow[]) {
        if (!latestByAccount.has(row.bank_account_id)) {
          latestByAccount.set(row.bank_account_id, row);
        }
      }
      snapshots = [...latestByAccount.values()];
    }

    const { data: txRows } = await supabase
      .from("bank_transactions")
      .select(
        "id, bank_account_id, transaction_date, description, reference, debit, credit, origin, category, linked_entity_type, settlement_status, settled_at, parent_transaction_id",
      )
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .in("bank_account_id", accountIds)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false });

    movementRows = (txRows ?? []) as BankTransactionRow[];
    transactions = movementRows.map((t) => ({
      bank_account_id: t.bank_account_id,
      transaction_date: t.transaction_date,
      debit: t.debit,
      credit: t.credit,
      settlement_status: t.settlement_status,
    }));
  }

  if (canSeeCaja) {
    const { data: closeRows } = await supabase
      .from("cash_daily_closes")
      .select(
        "id, business_date, status, cash_float, cash_sales, card_sales, card_debit_sales, card_credit_sales, transfer_sales, cash_account_id, card_account_id, transfer_account_id, pos_cash_amount, pos_card_amount, pos_transfer_amount, bank_card_amount, cash_credited, card_credited, transfer_credited, rejection_reason, comments, submitted_at, reviewed_at",
      )
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .order("business_date", { ascending: false })
      .limit(30);

    cashCloses = (closeRows ?? []) as CashDailyCloseRow[];
  }

  const snapInputs = snapshots as BalanceSnapshotInput[];
  const balanceOpts = {
    snapshots: snapInputs,
    transactions,
    orgCutoff: cutoff,
  };

  const totalLiquidity = sumAvailableBalances(activeIds, balanceOpts).toFixed(2);

  const byKind = {
    BANCO: sumKind("BANCO"),
    CAJA: sumKind("CAJA"),
    PASARELA: sumKind("PASARELA"),
    OTRO: sumKind("OTRO"),
  };

  function sumKind(kind: BankAccountRow["account_kind"]): string {
    const ids = accounts
      .filter((a) => a.is_active && a.account_kind === kind)
      .map((a) => a.id);
    return sumAvailableBalances(ids, balanceOpts).toFixed(2);
  }

  const confirmed = snapshots.filter(
    (s) => s.verification_status === "CONFIRMADO",
  ).length;
  const declared = snapshots.filter(
    (s) => s.verification_status === "DECLARADO",
  ).length;
  const pending =
    accounts.length -
    snapshots.length +
    snapshots.filter((s) => s.verification_status === "PENDIENTE").length;

  const pendingReview = cashCloses.filter((c) => c.status === "EN_REVISION");
  const history = cashCloses
    .filter((c) => c.business_date !== today)
    .slice(0, 12);
  const cashFloatTarget = Number(ctx.organization.cash_float_target ?? 0);

  const availableByAccount = new Map(
    accounts.map((a) => [
      a.id,
      availableBalanceForAccount({
        accountId: a.id,
        ...balanceOpts,
      }).toFixed(2),
    ]),
  );
  const floatAccount = accounts.find((a) => a.is_cash_float && a.is_active);
  const cashFloatCurrent = floatAccount
    ? Number(availableByAccount.get(floatAccount.id) ?? 0)
    : 0;

  const movementsByAccount = new Map<string, BankTransactionRow[]>();
  for (const tx of movementRows) {
    const list = movementsByAccount.get(tx.bank_account_id) ?? [];
    list.push(tx);
    movementsByAccount.set(tx.bank_account_id, list);
  }

  const pendingAcquiring = movementRows
    .filter(
      (tx) =>
        tx.category === "INGRESO_ADQUIRENCIA" &&
        tx.settlement_status === "PENDIENTE_BANCO" &&
        Number(tx.credit || 0) > 0,
    )
    .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
  const pendingAcquiringTotal = pendingAcquiring.reduce(
    (acc, tx) => acc + Number(tx.credit || 0),
    0,
  );

  return (
    <>
      <AppHeader
        title="Tesorería"
        subtitle="Bancos, liquidez y aval de cierres"
      />
      <main className="space-y-6 p-8">
        <TesoreriaNav
          permissions={ctx.permissions}
          isSuperAdmin={isSuperAdmin(ctx.role)}
        />

        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageIntro
            title="Liquidez y cuentas"
            description="Avalar cierres, definir la base y mover plata entre cuentas. El local reporta en Cierre de caja."
          />
          <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
            {cutoff ? (
              <span>
                Inicio operativo{" "}
                <Link href="/empresa" className="font-medium text-[var(--accent)]">
                  {formatDateCO(cutoff)}
                </Link>
              </span>
            ) : (
              <Link href="/empresa" className="font-medium text-[var(--accent)]">
                Definir inicio operativo en Empresa →
              </Link>
            )}
            <Link
              href="/tesoreria/pagos"
              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm font-medium text-[var(--ink)] hover:bg-neutral-50"
            >
              Historial de pagos
            </Link>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="Liquidez disponible"
            value={formatCOP(totalLiquidity)}
            hint="Corte + ingresos − egresos"
          />
          <StatCard label="Bancos" value={formatCOP(byKind.BANCO)} />
          <StatCard
            label="Caja (disponible)"
            value={formatCOP(byKind.CAJA)}
            hint="Ventas efectivo acreditadas"
          />
          <StatCard
            label="Base (actual / meta)"
            value={`${formatCOP(cashFloatCurrent)} / ${formatCOP(cashFloatTarget)}`}
            hint={
              cashFloatCurrent + 0.009 < cashFloatTarget
                ? `Faltan ${formatCOP(cashFloatTarget - cashFloatCurrent)}`
                : "Flotante operativo"
            }
          />
          <StatCard
            label="Pasarelas / otros"
            value={formatCOP(
              (Number(byKind.PASARELA) + Number(byKind.OTRO)).toFixed(2),
            )}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {pendingReview.length > 0 ? (
            <Badge tone="warn">
              Cierres por avalar: {pendingReview.length}
            </Badge>
          ) : null}
          {pendingAcquiring.length > 0 ? (
            <Badge tone="warn">
              Adquirencia por ingresar: {pendingAcquiring.length} ·{" "}
              {formatCOP(pendingAcquiringTotal)}
            </Badge>
          ) : null}
          <Badge tone="ok">Confirmados: {confirmed}</Badge>
          <Badge tone="warn">Declarados: {declared}</Badge>
          {Math.max(pending, 0) > 0 ? (
            <Badge tone="danger">
              Pendientes / sin saldo: {Math.max(pending, 0)}
            </Badge>
          ) : null}
          <Badge tone="neutral">Cuentas: {accounts.length}</Badge>
        </div>

        {canSeeCaja ? (
          <CashCloseSection
            accounts={accounts}
            todayClose={null}
            pendingReview={canAvalar ? pendingReview : []}
            history={history}
            canDeclare={false}
            canAvalar={canAvalar}
            cashFloatTarget={cashFloatTarget}
            cashFloatCurrent={cashFloatCurrent}
          />
        ) : null}

        <PendingAcquiringSettlementsPanel
          pending={pendingAcquiring}
          accounts={accounts}
          canConfirm={canConfirmAcquiring}
          defaultBankDate={today}
        />

        <section className="space-y-4">
          <div>
            <h2 className="font-display text-2xl font-semibold">Cuentas</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Defina la base del local y use traspasos para recomponerla. Toque
              una cuenta para el detalle.
            </p>
          </div>

          <WorkStack>
            {canManageAccounts ? (
              <WorkSection
                kind="form"
                title="Nueva cuenta"
                description="Banco, caja o pasarela con saldo inicial opcional."
                defaultOpen={accounts.length === 0}
              >
                <CreateBankAccountForm defaultCutoff={cutoff} embedded />
              </WorkSection>
            ) : null}

            <CashFloatAndTransferPanel
              cashFloatTarget={cashFloatTarget}
              accounts={accounts}
              availableByAccount={Object.fromEntries(availableByAccount)}
              canManage={canManageAccounts}
              defaultCutoff={cutoff}
            />

            <WorkSection
              kind="list"
              title="Cuentas registradas"
              badge={<Badge tone="neutral">{accounts.length}</Badge>}
              summary={
                accounts.length === 0
                  ? "Sin cuentas"
                  : `${accounts.length} cuentas activas`
              }
              defaultOpen
            >
              {accounts.length === 0 ? (
                <EmptyState
                  title="Sin cuentas registradas"
                  description="Agregue bancos, caja o pasarelas para construir la liquidez y destinar los cierres diarios."
                />
              ) : (
                <div className="space-y-3">
                  {accounts.map((account) => (
                    <BankAccountCard
                      key={account.id}
                      account={account}
                      snapshot={
                        snapshots.find(
                          (s) => s.bank_account_id === account.id,
                        ) ?? null
                      }
                      defaultCutoff={cutoff}
                      availableBalance={availableByAccount.get(account.id)}
                      movements={movementsByAccount.get(account.id) ?? []}
                      accounts={accounts}
                      canManage={canManageAccounts}
                      cashFloatAtLocal={
                        account.is_cash_float ? cashFloatTarget : null
                      }
                      cashFloatDate={null}
                    />
                  ))}
                </div>
              )}
            </WorkSection>

            {accounts.length > 0 ? (
              <WorkSection
                kind="tools"
                title="Resumen por tipo"
                defaultOpen={false}
              >
                <ul className="space-y-1 text-sm text-[var(--muted)]">
                  {(["BANCO", "CAJA", "PASARELA", "OTRO"] as const).map(
                    (kind) => {
                      const count = accounts.filter(
                        (a) => a.account_kind === kind,
                      ).length;
                      if (count === 0) return null;
                      return (
                        <li key={kind} className="flex justify-between gap-3">
                          <span>
                            {bankKindLabel(kind)} ({count})
                          </span>
                          <span className="font-medium text-[var(--ink)]">
                            {formatCOP(byKind[kind])}
                          </span>
                        </li>
                      );
                    },
                  )}
                </ul>
              </WorkSection>
            ) : null}
          </WorkStack>
        </section>
      </main>
    </>
  );
}
