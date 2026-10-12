import { AppHeader } from "@/components/layout/app-header";
import {
  Badge,
  Card,
  EmptyState,
  PageIntro,
  StatCard,
} from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess, requireModuleAccess } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatCOP } from "@/lib/money";
import { formatDateCO, todayInBogota } from "@/lib/dates";
import { bankKindLabel } from "@/lib/treasury";
import {
  availableBalanceForAccount,
  sumAvailableBalances,
  type BalanceSnapshotInput,
  type BankTransactionInput,
} from "@/lib/treasury-balance";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  BankAccountCard,
  CreateBankAccountForm,
  type BalanceSnapshotRow,
  type BankAccountRow,
  type BankTransactionRow,
} from "./treasury-client";
import {
  CashCloseSection,
  type CashDailyCloseRow,
} from "./cash-close-client";

export default async function TesoreriaPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "tesoreria");

  if (!ctx.organization) {
    return (
      <>
        <AppHeader
          title="Tesorería"
          subtitle="Caja diaria, bancos y liquidez"
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

  const cutoff = ctx.organization.administrative_cutoff_date;
  const supabase = await createClient();
  const orgId = ctx.organization.id;
  const today = todayInBogota();

  const canManageAccounts = ctxCanAccess(ctx, "tesoreria.cuentas");
  const canDeclare = ctxCanAccess(ctx, "tesoreria.caja.declarar");
  const canAvalar = ctxCanAccess(ctx, "tesoreria.caja.avalar");
  const canSeeCaja =
    ctxCanAccess(ctx, "tesoreria.caja") || canDeclare || canAvalar;

  const { data: accountRows } = await supabase
    .from("bank_accounts")
    .select(
      "id, bank_name, account_kind, account_type, masked_number, holder_name, is_active, notes",
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
        "id, bank_account_id, transaction_date, description, reference, debit, credit, origin, category, linked_entity_type",
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
    }));
  }

  if (canSeeCaja) {
    const { data: closeRows } = await supabase
      .from("cash_daily_closes")
      .select(
        "id, business_date, status, cash_float, cash_sales, card_sales, transfer_sales, cash_account_id, card_account_id, transfer_account_id, pos_cash_amount, pos_card_amount, pos_transfer_amount, bank_card_amount, cash_credited, card_credited, transfer_credited, rejection_reason, comments, submitted_at, reviewed_at",
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

  const todayClose =
    cashCloses.find((c) => c.business_date === today) ?? null;
  const pendingReview = cashCloses.filter((c) => c.status === "EN_REVISION");
  const history = cashCloses.filter((c) => c.business_date !== today).slice(0, 12);

  const availableByAccount = new Map(
    accounts.map((a) => [
      a.id,
      availableBalanceForAccount({
        accountId: a.id,
        ...balanceOpts,
      }).toFixed(2),
    ]),
  );

  const movementsByAccount = new Map<string, BankTransactionRow[]>();
  for (const tx of movementRows) {
    const list = movementsByAccount.get(tx.bank_account_id) ?? [];
    list.push(tx);
    movementsByAccount.set(tx.bank_account_id, list);
  }

  return (
    <>
      <AppHeader
        title="Tesorería"
        subtitle="Caja diaria, bancos y liquidez operativa"
      />
      <main className="space-y-8 p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageIntro
            title="Control de caja y liquidez"
            description="Declare el cierre diario, avale contra POS/banco y opere egresos solo desde saldos disponibles en cada cuenta."
          />
          {canManageAccounts ? (
            <CreateBankAccountForm defaultCutoff={cutoff} />
          ) : null}
        </div>

        {!cutoff ? (
          <Card>
            <p className="text-sm text-[var(--muted)]">
              Aún no hay fecha de corte en Empresa. Puede operar caja, pero
              conviene definir el corte de empalme para el saldo inicial.
            </p>
            <Link
              href="/empresa"
              className="mt-3 inline-block text-sm font-medium text-[var(--accent)]"
            >
              Ir a Empresa →
            </Link>
          </Card>
        ) : (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-[var(--muted)]">
                Fecha de corte administrativa:{" "}
                <strong className="text-[var(--ink)]">
                  {formatDateCO(cutoff)}
                </strong>
              </p>
              <Link href="/empalme" className="text-sm text-[var(--accent)]">
                Ver empalme →
              </Link>
            </div>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="Liquidez disponible"
            value={formatCOP(totalLiquidity)}
            hint="Corte + ingresos − egresos"
          />
          <StatCard label="Bancos" value={formatCOP(byKind.BANCO)} />
          <StatCard label="Caja" value={formatCOP(byKind.CAJA)} />
          <StatCard label="Pasarelas" value={formatCOP(byKind.PASARELA)} />
          <StatCard label="Otros" value={formatCOP(byKind.OTRO)} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge tone="ok">Confirmados: {confirmed}</Badge>
          <Badge tone="warn">Declarados: {declared}</Badge>
          <Badge tone="danger">
            Pendientes / sin saldo: {Math.max(pending, 0)}
          </Badge>
          <Badge tone="neutral">Cuentas: {accounts.length}</Badge>
          {pendingReview.length > 0 ? (
            <Badge tone="warn">Cierres por avalar: {pendingReview.length}</Badge>
          ) : null}
        </div>

        {canSeeCaja ? (
          <CashCloseSection
            accounts={accounts}
            todayClose={todayClose}
            pendingReview={pendingReview}
            history={history}
            canDeclare={canDeclare}
            canAvalar={canAvalar}
          />
        ) : null}

        <section className="space-y-4">
          <div>
            <h2 className="font-display text-2xl font-semibold">Cuentas</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Maestro de bancos, caja y pasarelas. El disponible refleja el
              saldo de corte más movimientos posteriores.
            </p>
          </div>

          {accounts.length === 0 ? (
            <EmptyState
              title="Sin cuentas registradas"
              description="Agregue bancos, caja o pasarelas para construir la liquidez y destinar los cierres diarios."
            />
          ) : (
            <div className="space-y-4">
              {accounts.map((account) => (
                <BankAccountCard
                  key={account.id}
                  account={account}
                  snapshot={
                    snapshots.find((s) => s.bank_account_id === account.id) ??
                    null
                  }
                  defaultCutoff={cutoff}
                  availableBalance={availableByAccount.get(account.id)}
                  movements={movementsByAccount.get(account.id) ?? []}
                  canManage={canManageAccounts}
                />
              ))}
            </div>
          )}

          {accounts.length > 0 ? (
            <Card>
              <h3 className="font-medium">Resumen por tipo</h3>
              <ul className="mt-3 space-y-1 text-sm text-[var(--muted)]">
                {(["BANCO", "CAJA", "PASARELA", "OTRO"] as const).map((kind) => {
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
                })}
              </ul>
            </Card>
          ) : null}
        </section>
      </main>
    </>
  );
}
