import { AppHeader } from "@/components/layout/app-header";
import { Card, EmptyState, PageIntro, StatCard } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { createClient } from "@/lib/supabase/server";
import { formatCOP, money } from "@/lib/money";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  BudgetCard,
  CreateBudgetForm,
  type BudgetLineRow,
  type BudgetRow,
} from "./budget-client";

export default async function PresupuestoPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  if (!ctx.organization) {
    return (
      <>
        <AppHeader title="Presupuesto" subtitle="Tres escenarios" />
        <main className="p-8">
          <Card>
            <p className="font-medium">Primero configura la empresa</p>
            <Link href="/empresa" className="mt-4 inline-flex rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white">
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
    .select("id, name, scenario, period_year, period_month, notes")
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .order("period_year", { ascending: false });

  const budgets = (budgetRows ?? []) as BudgetRow[];
  const ids = budgets.map((b) => b.id);

  let lines: BudgetLineRow[] = [];
  if (ids.length > 0) {
    const { data } = await supabase
      .from("budget_lines")
      .select("id, budget_id, category, budgeted_amount, notes")
      .eq("organization_id", ctx.organization.id)
      .is("deleted_at", null)
      .in("budget_id", ids);
    lines = (data ?? []) as BudgetLineRow[];
  }

  const byScenario = (s: string) =>
    budgets
      .filter((b) => b.scenario === s)
      .reduce((acc, b) => {
        const sum = lines
          .filter((l) => l.budget_id === b.id)
          .reduce((a, l) => a.plus(money(l.budgeted_amount)), money(0));
        return acc.plus(sum);
      }, money(0));

  return (
    <>
      <AppHeader title="Presupuesto" subtitle="Actual · mínimo viable · aprobado" />
      <main className="space-y-6 p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageIntro
            title="Presupuesto administrativo"
            description="Compare tres escenarios y cargue líneas por categoría. El vs ejecutado se alimenta con gastos."
          />
          <CreateBudgetForm />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="Estructura actual" value={formatCOP(byScenario("ACTUAL"))} />
          <StatCard label="Mínimo viable" value={formatCOP(byScenario("MINIMO_VIABLE"))} />
          <StatCard label="Aprobado" value={formatCOP(byScenario("APROBADO"))} />
        </div>

        {budgets.length === 0 ? (
          <EmptyState
            title="Sin presupuestos"
            description="Cree un escenario y agregue líneas de gasto presupuestado."
          />
        ) : (
          <div className="space-y-4">
            {budgets.map((b) => (
              <BudgetCard
                key={b.id}
                budget={b}
                lines={lines.filter((l) => l.budget_id === b.id)}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
