import { AppHeader } from "@/components/layout/app-header";
import { Card } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { requirePersonalSubAccess } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  mapLegalParamsRow,
  mapScheduleRow,
} from "@/lib/payroll";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { isSuperAdmin } from "@/types/domain";
import { PersonalNav } from "../personal-nav";
import {
  EmployeeFolderClient,
  type BonusRow,
  type FolderEmployee,
} from "./employee-folder-client";
import type { EmployeeDocRow, VacationRow } from "./employee-hr-panel";

export default async function EmployeeFolderPage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requirePersonalSubAccess(ctx, "personal.empleados");
  if (!ctx.organization) {
    return (
      <>
        <AppHeader title="Personal" subtitle="Empleado" />
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

  const { employeeId } = await params;
  const supabase = await createClient();

  const [
    { data: emp },
    { data: bonuses },
    { data: schedule },
    { data: legal },
    { data: positions },
    { data: documents },
    { data: vacations },
  ] = await Promise.all([
    supabase
      .from("employees")
      .select(
        "id, full_name, id_number, email, phone, address, position_id, position_title, hire_date, contract_end_date, employment_type, basic_salary, salary_or_fee, monthly_company_cost, receives_transport_aid, arl_risk_level, eps, pension_fund, arl, compensation_fund, ordinary_entry_time, ordinary_exit_time, break_minutes, uses_custom_schedule, is_active",
      )
      .eq("id", employeeId)
      .eq("organization_id", ctx.organization.id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("employee_bonuses")
      .select(
        "id, bonus_type, name, amount, percent_of_salary, description, is_active",
      )
      .eq("employee_id", employeeId)
      .eq("organization_id", ctx.organization.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
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
      .from("payroll_legal_params")
      .select("*")
      .eq("organization_id", ctx.organization.id)
      .is("deleted_at", null)
      .is("effective_to", null)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("job_positions")
      .select("id, name, arl_risk_level")
      .eq("organization_id", ctx.organization.id)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("documents")
      .select("id, name, document_type, file_size, created_at")
      .eq("organization_id", ctx.organization.id)
      .eq("entity_type", "employee")
      .eq("entity_id", employeeId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("employee_vacations")
      .select("id, start_date, end_date, business_days, status, notes")
      .eq("organization_id", ctx.organization.id)
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .order("start_date", { ascending: false }),
  ]);

  if (!emp) notFound();
  if (!schedule || !legal) {
    return (
      <>
        <AppHeader title="Personal" subtitle="Carpeta de empleado" />
        <main className="space-y-6 p-8">
          <PersonalNav
            permissions={ctx.permissions}
            isSuperAdmin={isSuperAdmin(ctx.role)}
          />
          <Card>
            <p className="font-medium">Faltan parámetros de nómina</p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Configure Horario Candela y parámetros ordinarios antes de simular.
            </p>
            <Link
              href="/personal/parametros"
              className="mt-4 inline-flex rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white"
            >
              Ir a Parámetros
            </Link>
          </Card>
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader title="Personal" subtitle="Carpeta de empleado" />
      <main className="space-y-6 p-8">
        <PersonalNav
          permissions={ctx.permissions}
          isSuperAdmin={isSuperAdmin(ctx.role)}
        />
        <EmployeeFolderClient
          employee={emp as FolderEmployee}
          bonuses={(bonuses ?? []) as BonusRow[]}
          candelaSchedule={mapScheduleRow(schedule)}
          legal={mapLegalParamsRow(legal as Record<string, unknown>)}
          positions={positions ?? []}
          documents={(documents ?? []) as EmployeeDocRow[]}
          vacations={(vacations ?? []) as VacationRow[]}
        />
      </main>
    </>
  );
}
