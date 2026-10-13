import { AppHeader } from "@/components/layout/app-header";
import {
  Card,
  EmptyState,
  PageIntro,
  StatCard,
  WorkSection,
} from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { requireModuleAccess } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { computeSalesGoal } from "@/lib/budget";
import { formatCOP, money } from "@/lib/money";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  BudgetCard,
  BudgetCreateSection,
  type BudgetLineRow,
  type BudgetRow,
} from "./budget-client";

export default async function PresupuestoPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "presupuesto");
  if (!ctx.organization) {
    return (
      <>
        <AppHeader title="Presupuesto" subtitle="Para operar" />
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
  const { data: budgetRows } = await supabase
    .from("budgets")
    .select(
      "id, name, scenario, period_kind, period_year, period_month, notes, variable_cost_pct, contribution_margin_pct, desired_profit_amount",
    )
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .order("period_year", { ascending: false })
    .order("period_kind", { ascending: true })
    .order("period_month", { ascending: false, nullsFirst: false });

  const budgets = (budgetRows ?? []) as BudgetRow[];
  const ids = budgets.map((b) => b.id);

  let lines: BudgetLineRow[] = [];
  if (ids.length > 0) {
    const { data } = await supabase
      .from("budget_lines")
      .select(
        "id, budget_id, category, budgeted_amount, notes, line_kind, sort_order",
      )
      .eq("organization_id", ctx.organization.id)
      .is("deleted_at", null)
      .in("budget_id", ids)
      .order("sort_order", { ascending: true });
    lines = (data ?? []) as BudgetLineRow[];
  }

  const latest = budgets[0] ?? null;
  const latestGastos = latest
    ? lines
        .filter(
          (l) =>
            l.budget_id === latest.id && (l.line_kind || "GASTO") === "GASTO",
        )
        .reduce((a, l) => a.plus(money(l.budgeted_amount)), money(0))
    : money(0);

  const latestGoal = latest
    ? computeSalesGoal({
        fixedExpenses: latestGastos,
        contributionMarginPct: latest.contribution_margin_pct,
        desiredProfit: latest.desired_profit_amount,
      })
    : null;

  return (
    <>
      <AppHeader
        title="Presupuesto"
        subtitle="Año · semestre · trimestre · mes · meta en ventas"
      />
      <main className="space-y-6 p-8">
        <PageIntro
          title="Presupuesto para operar"
          description="Define el período (año, semestre, trimestre o mes), completa rubros de gastos y costos, y ajusta el margen de contribución para aproximar la meta en ventas."
        />

        {latest ? (
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard
              label="Gastos fijos (último)"
              value={formatCOP(latestGastos)}
              hint={latest.name}
            />
            <StatCard
              label="Margen de contribución"
              value={`${Number(latest.contribution_margin_pct)}%`}
              hint={`Costo variable ${Number(latest.variable_cost_pct)}%`}
            />
            <StatCard
              label="Meta en ventas"
              value={
                latestGoal?.ok
                  ? formatCOP(latestGoal.salesGoal)
                  : "—"
              }
              hint={
                latestGoal?.ok
                  ? `Equilibrio ${formatCOP(latestGoal.breakEven)}`
                  : latestGoal && !latestGoal.ok
                    ? latestGoal.error
                    : undefined
              }
            />
          </div>
        ) : null}

        <BudgetCreateSection />

        {budgets.length === 0 ? (
          <EmptyState
            title="Sin presupuestos"
            description="Crea un presupuesto operativo para el año, semestre, trimestre o mes: verás los rubros listos y podrás aproximar la meta de ventas."
          />
        ) : (
          <WorkSection
            kind="list"
            title="Presupuestos"
            description="Cada uno muestra rubros editables y el panel de aproximación de meta."
            defaultOpen
            badge={
              <span className="text-xs text-[var(--muted)]">
                {budgets.length}
              </span>
            }
          >
            <div className="space-y-4">
              {budgets.map((b) => (
                <BudgetCard
                  key={b.id}
                  budget={b}
                  lines={lines.filter((l) => l.budget_id === b.id)}
                />
              ))}
            </div>
          </WorkSection>
        )}
      </main>
    </>
  );
}
