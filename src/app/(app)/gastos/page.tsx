import { AppHeader } from "@/components/layout/app-header";
import { Card, EmptyState, PageIntro, StatCard } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { requireModuleAccess } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatCOP, money } from "@/lib/money";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  CreateCategoryForm,
  CreateExpenseForm,
  ExpenseList,
  type CategoryRow,
  type ExpenseRow,
  type SupplierOption,
} from "./expenses-client";

export default async function GastosPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "gastos");
  if (!ctx.organization) {
    return (
      <>
        <AppHeader title="Gastos" subtitle="Gastos administrativos" />
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
  const [{ data: catRows }, { data: expRows }, { data: supRows }] = await Promise.all([
    supabase
      .from("expense_categories")
      .select("id, code, name")
      .eq("organization_id", ctx.organization.id)
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("expenses")
      .select(
        "id, expense_date, concept, amount, tax_amount, total_amount, nature, criticality, status, category_id, supplier_id, shared_service",
      )
      .eq("organization_id", ctx.organization.id)
      .is("deleted_at", null)
      .order("expense_date", { ascending: false }),
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("organization_id", ctx.organization.id)
      .is("deleted_at", null)
      .order("name"),
  ]);

  const categories = (catRows ?? []) as CategoryRow[];
  const expenses = (expRows ?? []) as ExpenseRow[];
  const suppliers = (supRows ?? []) as SupplierOption[];

  const paid = expenses
    .filter((e) => e.status === "PAGADO")
    .reduce((acc, e) => acc.plus(money(e.total_amount)), money(0));
  const approved = expenses
    .filter((e) => e.status === "APROBADO")
    .reduce((acc, e) => acc.plus(money(e.total_amount)), money(0));

  return (
    <>
      <AppHeader title="Gastos" subtitle="Administrativos — fijos, variables y únicos" />
      <main className="space-y-6 p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageIntro
            title="Gastos administrativos"
            description="Clasifique por naturaleza y criticidad. Los costos compartidos quedan trazables para asignación a Candela."
          />
          <div className="flex flex-wrap gap-2">
            <CreateCategoryForm />
            <CreateExpenseForm categories={categories} suppliers={suppliers} />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="Pagados" value={formatCOP(paid)} />
          <StatCard label="Aprobados pendientes" value={formatCOP(approved)} />
          <StatCard label="Registros" value={String(expenses.length)} />
        </div>

        {expenses.length === 0 ? (
          <EmptyState
            title="Sin gastos"
            description="Cree categorías y registre gastos con estado, naturaleza y criticidad."
          />
        ) : (
          <ExpenseList expenses={expenses} categories={categories} />
        )}
      </main>
    </>
  );
}
