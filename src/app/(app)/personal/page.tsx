import { AppHeader } from "@/components/layout/app-header";
import { Card, EmptyState, PageIntro, StatCard } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { requirePersonalSubAccess } from "@/lib/permissions";
import { isSuperAdmin } from "@/types/domain";
import { createClient } from "@/lib/supabase/server";
import { formatCOP, money } from "@/lib/money";
import { mapScheduleRow } from "@/lib/payroll";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PersonalNav } from "./personal-nav";
import { CreateEmployeeForm, EmployeeCard, type EmployeeRow } from "./hr-client";

export default async function PersonalPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requirePersonalSubAccess(ctx, "personal.empleados");
  if (!ctx.organization) {
    return (
      <>
        <AppHeader title="Personal" subtitle="Nómina" />
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
  const [{ data: empRows }, { data: scheduleRow }, { data: positions }] =
    await Promise.all([
      supabase
        .from("employees")
        .select(
          "id, full_name, id_number, email, phone, position_title, hire_date, contract_end_date, employment_type, basic_salary, salary_or_fee, monthly_company_cost, eps, arl, ordinary_entry_time, ordinary_exit_time, break_minutes, uses_custom_schedule, is_active",
        )
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .order("full_name"),
      supabase
        .from("payroll_schedules")
        .select(
          "ordinary_entry_time, ordinary_exit_time, break_minutes, works_monday, works_tuesday, works_wednesday, works_thursday, works_friday, works_saturday, works_sunday",
        )
        .eq("organization_id", ctx.organization.id)
        .eq("is_active", true)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase
        .from("job_positions")
        .select("id, name, arl_risk_level")
        .eq("organization_id", ctx.organization.id)
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("name"),
    ]);

  const employees = (empRows ?? []) as EmployeeRow[];
  const candela = scheduleRow ? mapScheduleRow(scheduleRow) : null;
  const active = employees.filter((e) => e.is_active);
  const payrollBase = active.reduce(
    (acc, e) => acc.plus(money(e.basic_salary ?? e.salary_or_fee ?? 0)),
    money(0),
  );
  const customCount = active.filter((e) => e.uses_custom_schedule).length;

  return (
    <>
      <AppHeader
        title="Personal"
        subtitle="Empleados y simulación de nómina quincenal"
      />
      <main className="space-y-6 p-8">
        <PersonalNav
          permissions={ctx.permissions}
          isSuperAdmin={isSuperAdmin(ctx.role)}
        />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageIntro
            title="Empleados"
            description="Maestro de personal con contrato, horario y carpeta para simular la liquidación quincenal ordinaria (sin novedades de turno)."
          />
          <CreateEmployeeForm positions={positions ?? []} />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="Activos" value={String(active.length)} />
          <StatCard
            label="Masa salarial básica / mes"
            value={formatCOP(payrollBase)}
          />
          <StatCard
            label="Horarios personalizados"
            value={String(customCount)}
            hint="Distintos al Horario Candela"
          />
        </div>

        {employees.length === 0 ? (
          <EmptyState
            title="Sin empleados registrados"
            description="Cree el primer empleado. Heredará el Horario Candela definido en Parámetros."
          />
        ) : (
          <div className="grid gap-4">
            {employees.map((e) => (
              <EmployeeCard
                key={e.id}
                employee={e}
                candelaSchedule={candela}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
