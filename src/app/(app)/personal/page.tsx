import { AppHeader } from "@/components/layout/app-header";
import { Card, EmptyState, PageIntro, StatCard } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { requireModuleAccess } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatCOP, money } from "@/lib/money";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  CreateEmployeeForm,
  EmployeeCard,
  type ContractRow,
  type EmployeeRow,
} from "./hr-client";

export default async function PersonalPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "personal");
  if (!ctx.organization) {
    return (
      <>
        <AppHeader title="Personal" subtitle="Administrativo" />
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
  const { data: empRows } = await supabase
    .from("employees")
    .select(
      "id, full_name, id_number, position_title, hire_date, employment_type, salary_or_fee, monthly_company_cost, eps, arl, is_active",
    )
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .order("full_name");

  const employees = (empRows ?? []) as EmployeeRow[];
  const ids = employees.map((e) => e.id);
  let contracts: ContractRow[] = [];
  if (ids.length > 0) {
    const { data } = await supabase
      .from("employee_contracts")
      .select("id, employee_id, start_date, end_date, notes")
      .eq("organization_id", ctx.organization.id)
      .is("deleted_at", null)
      .in("employee_id", ids);
    contracts = (data ?? []) as ContractRow[];
  }

  const monthlyCost = employees
    .filter((e) => e.is_active)
    .reduce((acc, e) => acc.plus(money(e.monthly_company_cost ?? 0)), money(0));

  return (
    <>
      <AppHeader
        title="Personal"
        subtitle="Maestro administrativo — no es nómina completa"
      />
      <main className="space-y-6 p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageIntro
            title="Equipo administrativo"
            description="Contratos, costo empresa y alertas de vencimiento. No gestiona liquidaciones ni nómina operativa."
          />
          <CreateEmployeeForm />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <StatCard label="Personas activas" value={String(employees.filter((e) => e.is_active).length)} />
          <StatCard label="Costo mensual empresa" value={formatCOP(monthlyCost)} />
        </div>

        {employees.length === 0 ? (
          <EmptyState
            title="Sin personal registrado"
            description="Agregue personas administrativas y sus contratos con fechas de vencimiento."
          />
        ) : (
          <div className="space-y-4">
            {employees.map((e) => (
              <EmployeeCard
                key={e.id}
                employee={e}
                contracts={contracts.filter((c) => c.employee_id === e.id)}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
