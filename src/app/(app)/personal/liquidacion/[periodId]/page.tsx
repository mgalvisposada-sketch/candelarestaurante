import { AppHeader } from "@/components/layout/app-header";
import { Card } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { requirePersonalSubAccess } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { isShiftDayContractor } from "@/lib/payroll/rates";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { isSuperAdmin } from "@/types/domain";
import { PersonalNav } from "../../personal-nav";
import {
  PeriodDetailClient,
  type LineRow,
  type PeriodRow,
} from "../liquidacion-client";
import type {
  AttendanceEmployee,
  AttendanceRow,
} from "../attendance-grid-client";
import type { AttendanceDayKind } from "@/lib/payroll";

export default async function LiquidacionDetailPage({
  params,
}: {
  params: Promise<{ periodId: string }>;
}) {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requirePersonalSubAccess(ctx, "personal.liquidacion");
  if (!ctx.organization) {
    return (
      <>
        <AppHeader title="Personal" subtitle="Liquidación" />
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

  const { periodId } = await params;
  const supabase = await createClient();
  const [{ data: period }, { data: lines }, { data: employees }, { data: attendance }] =
    await Promise.all([
      supabase
        .from("payroll_periods")
        .select(
          "id, period_year, period_month, period_half, period_start, period_end, status, calculated_at, emitted_at",
        )
        .eq("id", periodId)
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase
        .from("payroll_period_lines")
        .select(
          "id, employee_id, employee_name, position_title, novelty_count, net_pay, employer_cost, earnings_total, deductions_total, snapshot",
        )
        .eq("period_id", periodId)
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .order("employee_name"),
      supabase
        .from("employees")
        .select("id, full_name, employment_type")
        .eq("organization_id", ctx.organization.id)
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("full_name"),
      supabase
        .from("payroll_attendance_days")
        .select(
          "id, employee_id, work_date, day_kind, entry_time, exit_time, break_minutes, notes",
        )
        .eq("period_id", periodId)
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .order("work_date"),
    ]);

  if (!period) notFound();

  const attendanceEmployees = ((employees ?? []) as Array<{
    id: string;
    full_name: string;
    employment_type: string | null;
  }>)
    .filter((e) => !isShiftDayContractor(String(e.employment_type ?? "")))
    .map(
      (e): AttendanceEmployee => ({
        id: e.id,
        full_name: e.full_name,
      }),
    );

  const attendanceRows: AttendanceRow[] = (attendance ?? []).map((r) => ({
    id: r.id,
    employee_id: r.employee_id,
    work_date: String(r.work_date),
    day_kind: r.day_kind as AttendanceDayKind,
    entry_time: r.entry_time,
    exit_time: r.exit_time,
    break_minutes: Number(r.break_minutes ?? 0),
    notes: r.notes,
  }));

  return (
    <>
      <AppHeader title="Personal" subtitle="Detalle de liquidación" />
      <main className="space-y-6 p-8">
        <PersonalNav
          permissions={ctx.permissions}
          isSuperAdmin={isSuperAdmin(ctx.role)}
        />
        <PeriodDetailClient
          period={period as PeriodRow}
          lines={(lines ?? []) as LineRow[]}
          attendanceEmployees={attendanceEmployees}
          attendanceRows={attendanceRows}
        />
      </main>
    </>
  );
}
