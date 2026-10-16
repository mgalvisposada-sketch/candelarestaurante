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
import type {
  SlipEmployee,
  SlipOrg,
  SlipPaymentRequest,
} from "../payroll-slips-client";
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
        .select(
          "id, full_name, id_number, employment_type, position_title, hire_date, basic_salary, eps, pension_fund, arl, compensation_fund, arl_risk_level",
        )
        .eq("organization_id", ctx.organization.id)
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

  const lineIds = (lines ?? []).map((l) => l.id);
  const paymentRequestsByLineId: Record<string, SlipPaymentRequest> = {};
  if (lineIds.length > 0) {
    const { data: payReqs } = await supabase
      .from("payment_requests")
      .select("id, status, document_number")
      .eq("organization_id", ctx.organization.id)
      .eq("document_type", "COLILLA")
      .in("document_number", lineIds)
      .is("deleted_at", null)
      .in("status", [
        "BORRADOR",
        "EN_REVISION",
        "APROBADA",
        "EN_COLA_PAGO",
        "PAGADA",
      ]);
    for (const pr of payReqs ?? []) {
      if (!pr.document_number) continue;
      paymentRequestsByLineId[pr.document_number] = {
        id: pr.id,
        status: pr.status,
      };
    }
  }

  const employeeRows = (employees ?? []) as Array<{
    id: string;
    full_name: string;
    id_number: string | null;
    employment_type: string | null;
    position_title: string | null;
    hire_date: string | null;
    basic_salary: number | string | null;
    eps: string | null;
    pension_fund: string | null;
    arl: string | null;
    compensation_fund: string | null;
    arl_risk_level: string | null;
  }>;

  const attendanceEmployees = employeeRows
    .filter((e) => !isShiftDayContractor(String(e.employment_type ?? "")))
    .map(
      (e): AttendanceEmployee => ({
        id: e.id,
        full_name: e.full_name,
      }),
    );

  const employeesById: Record<string, SlipEmployee> = {};
  for (const e of employeeRows) {
    employeesById[e.id] = {
      id: e.id,
      full_name: e.full_name,
      id_number: e.id_number,
      position_title: e.position_title,
      hire_date: e.hire_date,
      employment_type: e.employment_type,
      basic_salary: e.basic_salary,
      eps: e.eps,
      pension_fund: e.pension_fund,
      arl: e.arl,
      compensation_fund: e.compensation_fund,
      arl_risk_level: e.arl_risk_level,
    };
  }

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

  const organization: SlipOrg = {
    name:
      ctx.organization.trade_name ||
      ctx.organization.legal_name ||
      "Empresa",
    nit: ctx.organization.nit
      ? `${ctx.organization.nit}${ctx.organization.dv ? `-${ctx.organization.dv}` : ""}`
      : null,
    address: ctx.organization.address,
    municipality: ctx.organization.municipality,
    department: ctx.organization.department,
  };

  return (
    <>
      <div className="no-print print:hidden">
        <AppHeader title="Personal" subtitle="Detalle de liquidación" />
      </div>
      <main className="mx-auto max-w-5xl space-y-6 p-6 md:p-8 print:max-w-none print:p-0">
        <div className="no-print print:hidden">
          <PersonalNav
            permissions={ctx.permissions}
            isSuperAdmin={isSuperAdmin(ctx.role)}
          />
        </div>
        <PeriodDetailClient
          period={period as PeriodRow}
          lines={(lines ?? []) as LineRow[]}
          attendanceEmployees={attendanceEmployees}
          attendanceRows={attendanceRows}
          organization={organization}
          employeesById={employeesById}
          paymentRequestsByLineId={paymentRequestsByLineId}
        />
      </main>
    </>
  );
}
