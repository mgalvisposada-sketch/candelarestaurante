import { AppHeader } from "@/components/layout/app-header";
import {
  Badge,
  Card,
  EmptyState,
  PageIntro,
  StatCard,
} from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { createClient } from "@/lib/supabase/server";
import { formatCOP } from "@/lib/money";
import { formatDateCO } from "@/lib/dates";
import { bankKindLabel, sumOpeningBalances } from "@/lib/treasury";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  BankAccountCard,
  CreateBankAccountForm,
  type BalanceSnapshotRow,
  type BankAccountRow,
} from "./treasury-client";

export default async function TesoreriaPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");

  if (!ctx.organization) {
    return (
      <>
        <AppHeader
          title="Tesorería"
          subtitle="Bancos, caja, pasarelas y saldos iniciales"
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

  const { data: accountRows } = await supabase
    .from("bank_accounts")
    .select(
      "id, bank_name, account_kind, account_type, masked_number, holder_name, is_active, notes",
    )
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  const accounts = (accountRows ?? []) as BankAccountRow[];
  const accountIds = accounts.map((a) => a.id);

  let snapshots: BalanceSnapshotRow[] = [];
  if (accountIds.length > 0) {
    let query = supabase
      .from("bank_balance_snapshots")
      .select(
        "id, bank_account_id, cutoff_date, opening_balance, verification_status, comments, source",
      )
      .eq("organization_id", ctx.organization.id)
      .is("deleted_at", null)
      .in("bank_account_id", accountIds);

    if (cutoff) {
      query = query.eq("cutoff_date", cutoff);
    }

    const { data: snapRows } = await query;
    snapshots = (snapRows ?? []) as BalanceSnapshotRow[];

    // Si no hay cutoff org o no hay snaps a esa fecha, tomar el más reciente por cuenta
    if (snapshots.length === 0) {
      const { data: allSnaps } = await supabase
        .from("bank_balance_snapshots")
        .select(
          "id, bank_account_id, cutoff_date, opening_balance, verification_status, comments, source",
        )
        .eq("organization_id", ctx.organization.id)
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
  }

  const totalLiquidity = sumOpeningBalances(
    snapshots.map((s) => s.opening_balance),
  );
  const confirmed = snapshots.filter(
    (s) => s.verification_status === "CONFIRMADO",
  ).length;
  const declared = snapshots.filter(
    (s) => s.verification_status === "DECLARADO",
  ).length;
  const pending =
    accounts.length - snapshots.length +
    snapshots.filter((s) => s.verification_status === "PENDIENTE").length;

  const byKind = {
    BANCO: moneySum(
      snapshots.filter((s) => {
        const acc = accounts.find((a) => a.id === s.bank_account_id);
        return acc?.account_kind === "BANCO";
      }),
    ),
    CAJA: moneySum(
      snapshots.filter((s) => {
        const acc = accounts.find((a) => a.id === s.bank_account_id);
        return acc?.account_kind === "CAJA";
      }),
    ),
    PASARELA: moneySum(
      snapshots.filter((s) => {
        const acc = accounts.find((a) => a.id === s.bank_account_id);
        return acc?.account_kind === "PASARELA";
      }),
    ),
    OTRO: moneySum(
      snapshots.filter((s) => {
        const acc = accounts.find((a) => a.id === s.bank_account_id);
        return acc?.account_kind === "OTRO";
      }),
    ),
  };

  return (
    <>
      <AppHeader
        title="Tesorería"
        subtitle="Bancos, caja, pasarelas y saldos iniciales"
      />
      <main className="space-y-6 p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageIntro
            title="Cuentas y saldos a la fecha de corte"
            description="Registre cuentas con número enmascarado y el saldo inicial (opening_balance) con fuente/evidencia. Los movimientos y conciliación CSV/XLSX llegan en MVP 2."
          />
          <CreateBankAccountForm defaultCutoff={cutoff} />
        </div>

        {!cutoff ? (
          <Card>
            <p className="text-sm text-[var(--muted)]">
              Aún no hay fecha de corte en Empresa. Puedes registrar cuentas, pero
              conviene definir el corte primero.
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
            label="Liquidez total"
            value={formatCOP(totalLiquidity)}
            hint="Suma de saldos de corte"
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
        </div>

        {accounts.length === 0 ? (
          <EmptyState
            title="Sin cuentas registradas"
            description="Agregue bancos, caja, pasarelas u otros saldos para construir la liquidez inicial del empalme."
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
              />
            ))}
          </div>
        )}

        {accounts.length > 0 ? (
          <Card>
            <h3 className="font-medium">Resumen por tipo</h3>
            <ul className="mt-3 space-y-1 text-sm text-[var(--muted)]">
              {(["BANCO", "CAJA", "PASARELA", "OTRO"] as const).map((kind) => {
                const count = accounts.filter((a) => a.account_kind === kind).length;
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
      </main>
    </>
  );
}

function moneySum(rows: BalanceSnapshotRow[]): string {
  return sumOpeningBalances(rows.map((r) => r.opening_balance));
}
