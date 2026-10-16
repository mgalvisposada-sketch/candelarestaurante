/**
 * One-off: corrige planilla 1ª quincena oct-2026 vs Excel + 15-oct,
 * reabre periodo y recalcula con compensación de faltantes.
 */
import { createClient } from "@supabase/supabase-js";
import {
  liquidatePeriod,
  validateAttendanceForCalculate,
  type AttendanceDayInput,
  type AttendanceDayKind,
  type ArlRiskLevel,
  type EmploymentContractType,
} from "../src/lib/payroll";
import {
  mapEmployeeSchedule,
  mapLegalParamsRow,
  mapScheduleRow,
  timeFromDb,
} from "../src/lib/payroll/mappers";
import { isShiftDayContractor } from "../src/lib/payroll/rates";

const PERIOD_ID = "708cee94-90ce-4130-8e42-4eca88a09a0b";
const ORG_ID = "d511866b-e189-41c4-924c-fc67a138390b";
const JOSE = "817e9f54-d19b-45d6-824f-2bf2771be94f";
const CHASE = "56f29cdd-d63e-4e07-9779-2c3b64c39b5c";
const SEBA = "5c5c5c98-890b-442b-9838-3056c080332e";

/** Horarios Excel (break 30). 15-oct no está en Excel: se conserva laborado. */
const CHASE_EXCEL: Record<
  string,
  { entry: string; exit: string; breakMinutes: number }
> = {
  "2026-10-01": { entry: "16:00", exit: "00:00", breakMinutes: 30 },
  "2026-10-02": { entry: "16:00", exit: "00:00", breakMinutes: 30 },
  "2026-10-03": { entry: "16:00", exit: "00:00", breakMinutes: 30 },
  "2026-10-04": { entry: "16:00", exit: "23:00", breakMinutes: 30 },
  "2026-10-06": { entry: "15:00", exit: "23:00", breakMinutes: 30 },
  "2026-10-07": { entry: "15:00", exit: "23:30", breakMinutes: 30 },
  "2026-10-08": { entry: "15:00", exit: "23:30", breakMinutes: 30 },
  "2026-10-09": { entry: "15:00", exit: "23:30", breakMinutes: 30 },
  "2026-10-10": { entry: "15:00", exit: "23:30", breakMinutes: 30 },
  "2026-10-11": { entry: "16:15", exit: "23:30", breakMinutes: 30 },
  "2026-10-13": { entry: "15:00", exit: "23:30", breakMinutes: 30 },
  "2026-10-14": { entry: "15:00", exit: "23:30", breakMinutes: 30 },
  "2026-10-15": { entry: "15:00", exit: "23:00", breakMinutes: 30 },
};

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltan env Supabase");
  const sb = createClient(url, key);

  // 1) Reabrir
  const { error: reopenErr } = await sb
    .from("payroll_periods")
    .update({
      status: "CALCULADA",
      emitted_at: null,
      emitted_by: null,
    })
    .eq("id", PERIOD_ID)
    .eq("organization_id", ORG_ID);
  if (reopenErr) throw new Error(`Reabrir: ${reopenErr.message}`);
  console.log("Periodo reabierto → CALCULADA");

  // 2) Cargar asistencia
  const { data: attRows, error: attErr } = await sb
    .from("payroll_attendance_days")
    .select(
      "id, employee_id, work_date, day_kind, entry_time, exit_time, break_minutes",
    )
    .eq("period_id", PERIOD_ID)
    .eq("organization_id", ORG_ID)
    .is("deleted_at", null);
  if (attErr) throw new Error(attErr.message);

  let updates = 0;
  for (const row of attRows ?? []) {
    const date = String(row.work_date);
    const patch: Record<string, unknown> = {};

    if (row.employee_id === SEBA && date === "2026-10-03") {
      patch.exit_time = "00:00:00";
    }
    if (row.employee_id === JOSE && date === "2026-10-09") {
      patch.entry_time = "18:00:00";
    }
    if (row.employee_id === CHASE && CHASE_EXCEL[date]) {
      const x = CHASE_EXCEL[date];
      patch.entry_time = `${x.entry}:00`;
      patch.exit_time = `${x.exit}:00`;
      patch.break_minutes = x.breakMinutes;
    }

    if (Object.keys(patch).length === 0) continue;
    const { error } = await sb
      .from("payroll_attendance_days")
      .update(patch)
      .eq("id", row.id)
      .eq("organization_id", ORG_ID);
    if (error) throw new Error(`Update ${date}: ${error.message}`);
    updates += 1;
    console.log("OK", row.employee_id.slice(0, 8), date, patch);
  }
  console.log(`Planilla: ${updates} filas corregidas`);

  // 3) Recalcular (misma lógica que calculatePayrollPeriodAction)
  const [
    { data: period },
    { data: schedule },
    { data: legal },
    { data: employees },
    { data: bonuses },
    { data: novelties },
    { data: attendanceRows },
  ] = await Promise.all([
    sb.from("payroll_periods").select("*").eq("id", PERIOD_ID).maybeSingle(),
    sb
      .from("payroll_schedules")
      .select(
        "ordinary_entry_time, ordinary_exit_time, break_minutes, works_monday, works_tuesday, works_wednesday, works_thursday, works_friday, works_saturday, works_sunday",
      )
      .eq("organization_id", ORG_ID)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle(),
    sb
      .from("payroll_legal_params")
      .select("*")
      .eq("organization_id", ORG_ID)
      .is("deleted_at", null)
      .is("effective_to", null)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb
      .from("employees")
      .select(
        "id, full_name, position_title, employment_type, basic_salary, salary_or_fee, receives_transport_aid, arl_risk_level, ordinary_entry_time, ordinary_exit_time, break_minutes, uses_custom_schedule",
      )
      .eq("organization_id", ORG_ID)
      .eq("is_active", true)
      .is("deleted_at", null),
    sb
      .from("employee_bonuses")
      .select(
        "employee_id, bonus_type, name, amount, percent_of_salary, is_active",
      )
      .eq("organization_id", ORG_ID)
      .is("deleted_at", null)
      .eq("is_active", true),
    sb
      .from("shift_novelties")
      .select(
        "id, employee_id, novelty_type, novelty_date, minutes, amount, start_time, end_time",
      )
      .eq("organization_id", ORG_ID)
      .eq("status", "APROBADA")
      .is("deleted_at", null)
      .gte("novelty_date", "2026-10-01")
      .lte("novelty_date", "2026-10-15"),
    sb
      .from("payroll_attendance_days")
      .select(
        "id, employee_id, work_date, day_kind, entry_time, exit_time, break_minutes, notes",
      )
      .eq("organization_id", ORG_ID)
      .eq("period_id", PERIOD_ID)
      .is("deleted_at", null),
  ]);

  if (!period || !schedule || !legal) {
    throw new Error("Falta periodo/horario/legal");
  }

  const candela = mapScheduleRow(schedule);
  const legalMapped = mapLegalParamsRow(legal as Record<string, unknown>);

  const bonusByEmp = new Map<string, NonNullable<typeof bonuses>>();
  for (const b of bonuses ?? []) {
    const list = bonusByEmp.get(b.employee_id) ?? [];
    list.push(b);
    bonusByEmp.set(b.employee_id, list);
  }
  const novByEmp = new Map<string, NonNullable<typeof novelties>>();
  for (const n of novelties ?? []) {
    const list = novByEmp.get(n.employee_id) ?? [];
    list.push(n);
    novByEmp.set(n.employee_id, list);
  }
  const attByEmp = new Map<string, AttendanceDayInput[]>();
  for (const row of attendanceRows ?? []) {
    const mapped: AttendanceDayInput = {
      id: row.id,
      employeeId: row.employee_id,
      workDate: String(row.work_date),
      dayKind: row.day_kind as AttendanceDayKind,
      entryTime: row.entry_time ? timeFromDb(row.entry_time) : null,
      exitTime: row.exit_time ? timeFromDb(row.exit_time) : null,
      breakMinutes: Number(row.break_minutes ?? 0),
      notes: row.notes,
    };
    const list = attByEmp.get(row.employee_id) ?? [];
    list.push(mapped);
    attByEmp.set(row.employee_id, list);
  }

  const payrollEmployees = (employees ?? []).filter(
    (e) => !isShiftDayContractor(String(e.employment_type ?? "")),
  );

  for (const e of payrollEmployees) {
    const days = attByEmp.get(e.id) ?? [];
    const check = validateAttendanceForCalculate(days);
    if (!check.ok) throw new Error(`${e.full_name}: ${check.error}`);
  }

  const result = liquidatePeriod({
    year: period.period_year,
    month: period.period_month,
    half: period.period_half as 1 | 2,
    candelaSchedule: candela,
    legal: legalMapped,
    includeGoalBonuses: true,
    employees: payrollEmployees.map((e) => ({
      employeeId: e.id,
      fullName: e.full_name,
      positionTitle: e.position_title,
      basicSalary: Number(e.basic_salary ?? e.salary_or_fee ?? 0),
      employmentType: e.employment_type as EmploymentContractType,
      receivesTransportAid: e.receives_transport_aid,
      arlRiskLevel: (e.arl_risk_level ?? "I") as ArlRiskLevel,
      schedule: mapEmployeeSchedule({
        ordinary_entry_time: e.ordinary_entry_time,
        ordinary_exit_time: e.ordinary_exit_time,
        break_minutes: e.break_minutes,
        uses_custom_schedule: e.uses_custom_schedule,
        fallback: candela,
      }),
      bonuses: (bonusByEmp.get(e.id) ?? []).map((b) => ({
        bonus_type: b.bonus_type as "FIJA" | "POR_META",
        name: b.name,
        amount: b.amount != null ? Number(b.amount) : null,
        percent_of_salary:
          b.percent_of_salary != null ? Number(b.percent_of_salary) : null,
        is_active: b.is_active,
      })),
      novelties: (novByEmp.get(e.id) ?? []).map((n) => ({
        id: n.id,
        novelty_type: n.novelty_type as import("../src/lib/payroll").ShiftNoveltyType,
        novelty_date: n.novelty_date,
        minutes: n.minutes,
        amount: n.amount != null ? Number(n.amount) : null,
        start_time: n.start_time,
        end_time: n.end_time,
      })),
      attendanceDays: attByEmp.get(e.id) ?? [],
    })),
  });

  const nowIso = new Date().toISOString();
  const { data: existingLines, error: existingErr } = await sb
    .from("payroll_period_lines")
    .select("id, employee_id, deleted_at")
    .eq("period_id", PERIOD_ID)
    .eq("organization_id", ORG_ID);
  if (existingErr) throw new Error(existingErr.message);

  const existingByEmployee = new Map<
    string,
    { id: string; employee_id: string; deleted_at: string | null }
  >();
  for (const row of existingLines ?? []) {
    const prev = existingByEmployee.get(row.employee_id);
    if (!prev || (prev.deleted_at && !row.deleted_at)) {
      existingByEmployee.set(row.employee_id, row);
    }
  }

  for (const l of result.lines) {
    const payload = {
      employee_name: l.employeeName,
      position_title: l.positionTitle,
      novelty_count: l.noveltyCount,
      net_pay: l.netPay,
      employer_cost: l.employerCost,
      earnings_total: l.earningsTotal,
      deductions_total: l.deductionsTotal,
      snapshot: l.simulation as unknown as Record<string, unknown>,
      deleted_at: null,
      updated_at: nowIso,
    };
    const existing = existingByEmployee.get(l.employeeId);
    if (existing) {
      const { error: updErr } = await sb
        .from("payroll_period_lines")
        .update(payload)
        .eq("id", existing.id)
        .eq("organization_id", ORG_ID);
      if (updErr) throw new Error(updErr.message);
    } else {
      const { error: insErr } = await sb.from("payroll_period_lines").insert({
        organization_id: ORG_ID,
        period_id: PERIOD_ID,
        employee_id: l.employeeId,
        ...payload,
      });
      if (insErr) throw new Error(insErr.message);
    }
    console.log(
      "\n====",
      l.employeeName,
      "====\n",
      JSON.stringify(
        {
          net_pay: l.netPay,
          earnings: l.earningsTotal,
          deductions: l.deductionsTotal,
          overtime: l.simulation.earnings.overtime,
          night: l.simulation.earnings.nightSurcharge,
          sunday: l.simulation.earnings.sundaySurcharge,
          unpaid: l.simulation.earnings.unpaidTimeDiscount,
          fixedBonus: l.simulation.earnings.fixedBonuses,
          otMin: l.simulation.novelties.overtimeMinutes,
          unpaidMin: l.simulation.novelties.unpaidMinutes,
          notes: l.simulation.notes,
        },
        null,
        2,
      ),
    );
  }

  const { error: uErr } = await sb
    .from("payroll_periods")
    .update({
      status: "CALCULADA",
      calculated_at: nowIso,
    })
    .eq("id", PERIOD_ID)
    .eq("organization_id", ORG_ID);
  if (uErr) throw new Error(uErr.message);

  console.log("\nTOTALES", result.totals);
  console.log("Listo. Periodo en CALCULADA (sin re-emitir).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
