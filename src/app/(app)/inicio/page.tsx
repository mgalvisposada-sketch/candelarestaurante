import { AppHeader } from "@/components/layout/app-header";
import { Badge, Card, PageIntro, StatCard } from "@/components/ui/primitives";
import { formatCOP, money, apDocumentBalance } from "@/lib/money";
import { formatDateCO } from "@/lib/dates";
import { getOrgContext } from "@/lib/org-context";
import { requireModuleAccess } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { summarizeHandoverQuality } from "@/lib/handover";
import { sumOpeningBalances } from "@/lib/treasury";
import { computeLoanKpis, computeFundingBag } from "@/lib/loans";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function InicioPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "inicio");

  let quality = {
    pctConfirmed: 0,
    pctDeclared: 0,
    pctPending: 0,
  };
  let handoverStatus: string | null = null;
  let liquidity = "0.00";
  let cxpTotal = money(0);
  let loanDebt = money(0);
  let capitalAvailable = money(0);
  let monthlyExpense = money(0);

  if (ctx.organization) {
    const supabase = await createClient();
    const orgId = ctx.organization.id;

    const { data: session } = await supabase
      .from("handover_sessions")
      .select("id, status")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (session) {
      handoverStatus = session.status;
      const { data: items } = await supabase
        .from("handover_items")
        .select("verification_status")
        .eq("handover_session_id", session.id)
        .is("deleted_at", null);
      quality = summarizeHandoverQuality(
        (items ?? []).map((i) => ({
          status: i.verification_status as
            | "CONFIRMADO"
            | "DECLARADO"
            | "PENDIENTE",
        })),
      );
    }

    const cutoff = ctx.organization.administrative_cutoff_date;
    let snapQuery = supabase
      .from("bank_balance_snapshots")
      .select("opening_balance, bank_account_id, cutoff_date")
      .eq("organization_id", orgId)
      .is("deleted_at", null);

    if (cutoff) {
      snapQuery = snapQuery.eq("cutoff_date", cutoff);
    }

    const { data: snaps } = await snapQuery;
    if (snaps && snaps.length > 0) {
      liquidity = sumOpeningBalances(snaps.map((s) => s.opening_balance));
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
  }

  return (
    <>
      <AppHeader
        title="Inicio"
        subtitle="Panel administrativo — línea base y control financiero"
      />
      <main className="space-y-6 p-8">
        <PageIntro
          title={
            ctx.organization
              ? ctx.organization.trade_name || ctx.organization.legal_name
              : "Situación administrativa"
          }
          description={
            ctx.organization
              ? `Corte: ${formatDateCO(ctx.organization.administrative_cutoff_date)} · Rol: ${ctx.role}`
              : "Candela Admin responde qué tiene y qué debe la empresa. Configura primero la organización en Empresa."
          }
        />

        {!ctx.organization ? (
          <Card>
            <p className="font-medium">Aún no hay empresa configurada</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Crea la organización para iniciar el empalme y la línea base.
            </p>
            <Link
              href="/empresa"
              className="mt-4 inline-flex rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white"
            >
              Configurar empresa
            </Link>
          </Card>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="Liquidez"
            value={formatCOP(liquidity)}
            hint="Bancos + caja + pasarelas"
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
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-medium">Calidad del empalme</h3>
              <Badge tone={handoverStatus === "CERRADO" ? "ok" : "warn"}>
                {handoverStatus ?? "Sin sesión"}
              </Badge>
            </div>
            <div className="space-y-2 text-sm text-[var(--muted)]">
              <p>Confirmado: {quality.pctConfirmed}%</p>
              <p>Declarado: {quality.pctDeclared}%</p>
              <p>Pendiente: {quality.pctPending}%</p>
            </div>
            <Link
              href="/empalme"
              className="mt-4 inline-block text-sm font-medium text-[var(--accent)]"
            >
              Ir al empalme →
            </Link>
          </Card>
          <Card>
            <h3 className="mb-3 font-medium">Módulos listos</h3>
            <ul className="space-y-2 text-sm text-[var(--muted)]">
              <li>
                <Link href="/proveedores" className="text-[var(--accent)]">
                  Proveedores & CxP
                </Link>
              </li>
              <li>
                <Link href="/prestamos" className="text-[var(--accent)]">
                  Préstamos
                </Link>{" "}
                ·{" "}
                <Link href="/capital" className="text-[var(--accent)]">
                  Capital
                </Link>
              </li>
              <li>
                <Link href="/gastos" className="text-[var(--accent)]">
                  Gastos
                </Link>{" "}
                ·{" "}
                <Link href="/presupuesto" className="text-[var(--accent)]">
                  Presupuesto
                </Link>
              </li>
              <li>
                <Link href="/personal" className="text-[var(--accent)]">
                  Personal
                </Link>{" "}
                ·{" "}
                <Link href="/contratos" className="text-[var(--accent)]">
                  Contratos
                </Link>{" "}
                ·{" "}
                <Link href="/tributario" className="text-[var(--accent)]">
                  Tributario
                </Link>{" "}
                ·{" "}
                <Link href="/sst" className="text-[var(--accent)]">
                  SST
                </Link>
              </li>
            </ul>
          </Card>
          <Card>
            <h3 className="mb-3 font-medium">Frontera FILIPO</h3>
            <p className="text-sm leading-relaxed text-[var(--muted)]">
              Ventas, Food Cost e inventarios operativos no se muestran aquí.
              Cuando exista integración, aparecerán en una sección READ ONLY
              claramente identificada.
            </p>
          </Card>
        </div>
      </main>
    </>
  );
}
