import { AppHeader } from "@/components/layout/app-header";
import { Badge, Card, PageIntro, StatCard } from "@/components/ui/primitives";
import { formatCOP, money, apDocumentBalance } from "@/lib/money";
import { formatDateCO } from "@/lib/dates";
import { getOrgContext } from "@/lib/org-context";
import { requireModuleAccess } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  sumAvailableBalances,
  type BalanceSnapshotInput,
  type BankTransactionInput,
} from "@/lib/treasury-balance";
import { computeLoanKpis, computeFundingBag } from "@/lib/loans";
import { redirect } from "next/navigation";
import Link from "next/link";

const OPS_LINKS = [
  { href: "/cierre-caja", label: "Cierre de caja", hint: "Ventas del día" },
  { href: "/tesoreria", label: "Tesorería", hint: "Bancos, base y avales" },
  { href: "/compras", label: "Compras", hint: "Pedidos e insumos" },
  { href: "/gastos", label: "Gastos", hint: "Facturas operativas" },
  {
    href: "/solicitudes-pago",
    label: "Solicitudes de pago",
    hint: "Aprobar y pagar",
  },
  { href: "/personal", label: "Personal", hint: "Novedades y liquidación" },
  { href: "/inventario", label: "Inventario", hint: "Maestro y físico" },
  { href: "/proveedores", label: "Proveedores & CxP", hint: "Cuentas por pagar" },
] as const;

export default async function InicioPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "inicio");

  let liquidity = "0.00";
  let cxpTotal = money(0);
  let loanDebt = money(0);
  let capitalAvailable = money(0);
  let monthlyExpense = money(0);
  let openCashCloses = 0;

  if (ctx.organization) {
    const supabase = await createClient();
    const orgId = ctx.organization.id;
    const cutoff = ctx.organization.administrative_cutoff_date;

    const { data: activeAccounts } = await supabase
      .from("bank_accounts")
      .select("id")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .eq("is_active", true);

    const activeIds = (activeAccounts ?? []).map((a) => a.id as string);
    if (activeIds.length > 0) {
      let snapQuery = supabase
        .from("bank_balance_snapshots")
        .select(
          "opening_balance, bank_account_id, cutoff_date, verification_status",
        )
        .eq("organization_id", orgId)
        .is("deleted_at", null)
        .in("bank_account_id", activeIds);

      if (cutoff) {
        snapQuery = snapQuery.eq("cutoff_date", cutoff);
      }

      const { data: snaps } = await snapQuery;
      let snapshots = (snaps ?? []) as BalanceSnapshotInput[];

      if (snapshots.length === 0) {
        const { data: allSnaps } = await supabase
          .from("bank_balance_snapshots")
          .select(
            "opening_balance, bank_account_id, cutoff_date, verification_status",
          )
          .eq("organization_id", orgId)
          .is("deleted_at", null)
          .in("bank_account_id", activeIds)
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
        .eq("organization_id", orgId)
        .is("deleted_at", null)
        .in("bank_account_id", activeIds);

      liquidity = sumAvailableBalances(activeIds, {
        snapshots,
        transactions: (txRows ?? []) as BankTransactionInput[],
        orgCutoff: cutoff,
      }).toFixed(2);
    }

    const { data: apDocs } = await supabase
      .from("accounts_payable_documents")
      .select("original_amount, paid_amount, status")
      .eq("organization_id", orgId)
      .is("deleted_at", null);
    for (const d of apDocs ?? []) {
      if (d.status === "ANULADA") continue;
      cxpTotal = cxpTotal.plus(
        apDocumentBalance(d.original_amount, d.paid_amount),
      );
    }

    const { data: loans } = await supabase
      .from("loans")
      .select("id, approved_principal, status")
      .eq("organization_id", orgId)
      .is("deleted_at", null);
    const activeLoans = (loans ?? []).filter((l) => l.status !== "ANULADO");
    const loanIds = activeLoans.map((l) => l.id);
    if (loanIds.length > 0) {
      const [{ data: disbs }, { data: pays }] = await Promise.all([
        supabase
          .from("loan_disbursements")
          .select("loan_id, amount")
          .eq("organization_id", orgId)
          .is("deleted_at", null)
          .in("loan_id", loanIds),
        supabase
          .from("loan_payments")
          .select("loan_id, principal_amount, interest_amount")
          .eq("organization_id", orgId)
          .is("deleted_at", null)
          .in("loan_id", loanIds),
      ]);
      for (const loan of activeLoans) {
        const kpis = computeLoanKpis({
          approvedPrincipal: loan.approved_principal,
          disbursements: (disbs ?? [])
            .filter((d) => d.loan_id === loan.id)
            .map((d) => d.amount),
          principalPaid: (pays ?? [])
            .filter((p) => p.loan_id === loan.id)
            .map((p) => p.principal_amount),
          interestAccrued: 0,
          interestPaid: (pays ?? [])
            .filter((p) => p.loan_id === loan.id)
            .map((p) => p.interest_amount),
        });
        loanDebt = loanDebt.plus(kpis.saldoCapital);
      }
    }

    const { data: allocations } = await supabase
      .from("funding_allocations")
      .select("approved_amount, committed_amount, paid_amount")
      .eq("organization_id", orgId)
      .is("deleted_at", null);
    for (const a of allocations ?? []) {
      const bag = computeFundingBag({
        approved: a.approved_amount,
        committed: a.committed_amount,
        paid: a.paid_amount,
      });
      capitalAvailable = capitalAvailable.plus(bag.disponible);
    }

    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const monthStart = `${y}-${m}-01`;
    const { data: expenses } = await supabase
      .from("expenses")
      .select("total_amount, status")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .gte("expense_date", monthStart)
      .neq("status", "ANULADO");
    monthlyExpense = (expenses ?? []).reduce(
      (acc, e) => acc.plus(money(e.total_amount)),
      money(0),
    );

    const { count } = await supabase
      .from("cash_daily_closes")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .eq("status", "EN_REVISION");
    openCashCloses = count ?? 0;
  }

  return (
    <>
      <AppHeader
        title="Inicio"
        subtitle="Operación del día — caja, liquidez y costos"
      />
      <main className="space-y-6 p-8">
        <PageIntro
          title={
            ctx.organization
              ? ctx.organization.trade_name || ctx.organization.legal_name
              : "Candela Admin"
          }
          description={
            ctx.organization
              ? `Inicio operativo: ${formatDateCO(ctx.organization.administrative_cutoff_date)} · Rol: ${ctx.role}`
              : "Configura la empresa para empezar a operar caja, tesorería y costos. Filipo cubre el POS; aquí va el día a día administrativo."
          }
        />

        {!ctx.organization ? (
          <Card>
            <p className="font-medium">Aún no hay empresa configurada</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Crea la organización, define la fecha de inicio operativo y registra
              saldos iniciales en Tesorería.
            </p>
            <Link
              href="/empresa"
              className="mt-4 inline-flex rounded-lg bg-[var(--solid)] px-4 py-2 text-sm text-[var(--on-solid)]"
            >
              Configurar empresa
            </Link>
          </Card>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="Liquidez"
            value={formatCOP(liquidity)}
            hint="Disponible: saldo inicial + ingresos − egresos"
          />
          <StatCard label="CxP" value={formatCOP(cxpTotal)} hint="Saldo proveedores" />
          <StatCard
            label="Deuda con socios"
            value={formatCOP(loanDebt)}
            hint="Préstamos activos"
          />
          <StatCard
            label="Gasto del mes"
            value={formatCOP(monthlyExpense)}
            hint="Gastos no anulados"
          />
          <StatCard
            label="Capital disponible"
            value={formatCOP(capitalAvailable)}
            hint="Bolsas sin comprometer"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-medium">Hoy en operación</h3>
              {openCashCloses > 0 ? (
                <Badge tone="warn">{openCashCloses} cierre(s) por avalar</Badge>
              ) : (
                <Badge tone="ok">Sin cierres pendientes</Badge>
              )}
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {OPS_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="flex flex-col rounded-lg border border-[var(--line)] px-3 py-2.5 transition hover:border-[var(--accent)]/40 hover:bg-[var(--bg)]"
                  >
                    <span className="text-sm font-medium text-[var(--accent)]">
                      {link.label}
                    </span>
                    <span className="text-xs text-[var(--muted)]">{link.hint}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <h3 className="mb-3 font-medium">Filipo (POS)</h3>
            <p className="text-sm leading-relaxed text-[var(--muted)]">
              Por ahora Filipo solo cubre punto de venta. Ventas, comandas y ticket
              viven allá; en Candela operas caja, tesorería, compras, inventario,
              cocina, gastos y personal.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              Cuando haya integración, los agregados de ventas se mostrarán aquí
              en solo lectura.
            </p>
            <Link
              href="/empresa"
              className="mt-4 inline-block text-sm font-medium text-[var(--accent)]"
            >
              Datos de empresa →
            </Link>
          </Card>
        </div>
      </main>
    </>
  );
}
