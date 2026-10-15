"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess } from "@/lib/permissions";
import {
  attendanceDaySaveSchema,
  jobPositionSchema,
  noveltySchema,
  payrollPeriodSchema,
  syncShiftDaysSchema,
} from "@/validations/novelties";
import {
  biweeklyRange,
  buildAttendanceSeedRows,
  liquidatePeriod,
  mapEmployeeSchedule,
  mapLegalParamsRow,
  mapScheduleRow,
  timeFromDb,
  validateAttendanceForCalculate,
  type AttendanceDayInput,
  type AttendanceDayKind,
  type EmploymentContractType,
  type ArlRiskLevel,
} from "@/lib/payroll";
import { isShiftDayContractor } from "@/lib/payroll/rates";
import type { ActionResult } from "../empresa/actions";

export type SyncShiftDaysResult = ActionResult & {
  created?: number;
  annulled?: number;
  message?: string;
};

function emptyToNull(value: string | null | undefined) {
  if (value === undefined || value === null || String(value).trim() === "")
    return null;
  return String(value).trim();
}

function parseMoney(raw: string | null | undefined) {
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const n = Number(String(raw).replace(/,/g, "").trim());
  if (Number.isNaN(n)) return null;
  return n;
}

function revalidateAll(extra?: string) {
  revalidatePath("/personal");
  revalidatePath("/personal/novedades");
  revalidatePath("/personal/liquidacion");
  revalidatePath("/personal/parametros");
  if (extra) revalidatePath(extra);
}

// ----- Cargos -----

export async function upsertJobPositionAction(
  formData: FormData,
  positionId?: string | null,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = jobPositionSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
    arl_risk_level: formData.get("arl_risk_level") || "III",
    default_break_minutes: formData.get("default_break_minutes") || 60,
    notes: formData.get("notes"),
    is_active: formData.get("is_active") || "true",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const row = {
    organization_id: ctx.organization.id,
    name: parsed.data.name.trim(),
    code: emptyToNull(parsed.data.code),
    arl_risk_level: parsed.data.arl_risk_level,
    default_break_minutes: parsed.data.default_break_minutes ?? 60,
    notes: emptyToNull(parsed.data.notes),
    is_active: parsed.data.is_active !== "false",
    updated_by: ctx.userId,
  };

  if (positionId) {
    const { error } = await supabase
      .from("job_positions")
      .update(row)
      .eq("id", positionId)
      .eq("organization_id", ctx.organization.id);
    if (error) return { ok: false, error: error.message };
    revalidateAll();
    return { ok: true, id: positionId };
  }

  const { data, error } = await supabase
    .from("job_positions")
    .insert({ ...row, created_by: ctx.userId })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true, id: data.id };
}

export async function softDeleteJobPositionAction(
  positionId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("job_positions")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", positionId)
    .eq("organization_id", ctx.organization.id);
  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true, id: positionId };
}

// ----- Novedades -----

export async function createNoveltyAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "personal.novedades")) {
    return { ok: false, error: "Sin permiso para reportar novedades" };
  }

  const parsed = noveltySchema.safeParse({
    employee_id: formData.get("employee_id"),
    novelty_date: formData.get("novelty_date"),
    novelty_type: formData.get("novelty_type"),
    minutes: formData.get("minutes"),
    amount: formData.get("amount"),
    start_time: formData.get("start_time"),
    end_time: formData.get("end_time"),
    notes: formData.get("notes"),
    support_note: formData.get("support_note"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  if (parsed.data.novelty_type === "TURNO_LABORADO") {
    return {
      ok: false,
      error:
        "Los días de prestadores por turno se liquidan en Gastos → liquidación por turno",
    };
  }
  if (
    parsed.data.novelty_type === "HORA_EXTRA" ||
    parsed.data.novelty_type === "LLEGADA_TARDE" ||
    parsed.data.novelty_type === "SALIDA_TEMPRANA" ||
    parsed.data.novelty_type === "AUSENCIA"
  ) {
    return {
      ok: false,
      error:
        "Horas, extras y ausencias de nómina se capturan en Liquidación → planilla de asistencia",
    };
  }

  const minutesRaw = emptyToNull(parsed.data.minutes);
  const minutes = minutesRaw != null ? Number(minutesRaw) : null;
  const amount = parseMoney(parsed.data.amount);
  const moneyTypes = ["ANTICIPO", "DESCUENTO_AUTORIZADO", "BONO_OCASIONAL"];

  const supabase = await createClient();

  if (moneyTypes.includes(parsed.data.novelty_type) && amount == null) {
    return { ok: false, error: "Indique el monto" };
  }
  if (
    !moneyTypes.includes(parsed.data.novelty_type) &&
    parsed.data.novelty_type !== "PERMISO_REMUNERADO" &&
    (minutes == null || !Number.isFinite(minutes) || minutes <= 0) &&
    !emptyToNull(parsed.data.start_time)
  ) {
    return { ok: false, error: "Indique minutos u horario" };
  }

  const { data, error } = await supabase
    .from("shift_novelties")
    .insert({
      organization_id: ctx.organization.id,
      employee_id: parsed.data.employee_id,
      novelty_date: parsed.data.novelty_date,
      novelty_type: parsed.data.novelty_type,
      status: "PENDIENTE",
      minutes: minutes != null && Number.isFinite(minutes) ? minutes : null,
      amount,
      start_time: emptyToNull(parsed.data.start_time),
      end_time: emptyToNull(parsed.data.end_time),
      is_paid: parsed.data.novelty_type === "PERMISO_REMUNERADO",
      notes: emptyToNull(parsed.data.notes),
      support_note: emptyToNull(parsed.data.support_note),
      reported_by: ctx.userId,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true, id: data.id };
}

export async function syncShiftDaysAction(input: {
  employee_id: string;
  period_year: number;
  period_month: number;
  period_half: 1 | 2;
  dates: string[];
}): Promise<SyncShiftDaysResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "personal.novedades")) {
    return { ok: false, error: "Sin permiso para reportar novedades" };
  }

  const parsed = syncShiftDaysSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const half = parsed.data.period_half as 1 | 2;
  const range = biweeklyRange(
    parsed.data.period_year,
    parsed.data.period_month,
    half,
  );
  const selectedDates = [...new Set(parsed.data.dates)].filter(
    (d) => d >= range.startIso && d <= range.endIso,
  );

  const supabase = await createClient();
  const { data: emp, error: empError } = await supabase
    .from("employees")
    .select("id, basic_salary, salary_or_fee, employment_type")
    .eq("id", parsed.data.employee_id)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (empError) return { ok: false, error: empError.message };
  if (!emp) return { ok: false, error: "Empleado no encontrado" };
  if (!isShiftDayContractor(String(emp.employment_type ?? ""))) {
    return {
      ok: false,
      error: "Solo aplica a prestadores por turno / día",
    };
  }

  const rate = Number(emp.basic_salary ?? emp.salary_or_fee ?? 0);
  if (!rate || Number.isNaN(rate)) {
    return {
      ok: false,
      error: "Configure la tarifa día/turno en el empleado",
    };
  }

  const { data: existing, error: existingError } = await supabase
    .from("shift_novelties")
    .select("id, novelty_date, status")
    .eq("organization_id", ctx.organization.id)
    .eq("employee_id", parsed.data.employee_id)
    .eq("novelty_type", "TURNO_LABORADO")
    .gte("novelty_date", range.startIso)
    .lte("novelty_date", range.endIso)
    .is("deleted_at", null)
    .in("status", ["PENDIENTE", "APROBADA"]);

  if (existingError) return { ok: false, error: existingError.message };

  const activeByDate = new Map<string, { id: string; status: string }>();
  for (const row of existing ?? []) {
    const date = String(row.novelty_date);
    if (!activeByDate.has(date)) {
      activeByDate.set(date, { id: row.id as string, status: String(row.status) });
    }
  }

  const selectedSet = new Set(selectedDates);
  const toCreate = selectedDates.filter((d) => !activeByDate.has(d));
  const toAnnul = [...activeByDate.entries()]
    .filter(([date]) => !selectedSet.has(date))
    .map(([, row]) => row.id);

  if (toCreate.length === 0 && toAnnul.length === 0) {
    return {
      ok: true,
      created: 0,
      annulled: 0,
      message: "Sin cambios en los turnos de la quincena",
    };
  }

  const now = new Date().toISOString();

  if (toCreate.length > 0) {
    const { error: insertError } = await supabase.from("shift_novelties").insert(
      toCreate.map((novelty_date) => ({
        organization_id: ctx.organization!.id,
        employee_id: parsed.data.employee_id,
        novelty_date,
        novelty_type: "TURNO_LABORADO" as const,
        status: "APROBADA" as const,
        amount: rate,
        is_paid: true,
        notes: "Turno registrado por calendario quincenal",
        reported_by: ctx.userId,
        reviewed_by: ctx.userId,
        reviewed_at: now,
        created_by: ctx.userId,
        updated_by: ctx.userId,
      })),
    );
    if (insertError) return { ok: false, error: insertError.message };
  }

  if (toAnnul.length > 0) {
    const { error: annulError } = await supabase
      .from("shift_novelties")
      .update({
        status: "ANULADA",
        updated_by: ctx.userId,
      })
      .eq("organization_id", ctx.organization.id)
      .in("id", toAnnul);
    if (annulError) return { ok: false, error: annulError.message };
  }

  revalidateAll();
  const parts: string[] = [];
  if (toCreate.length > 0) {
    parts.push(
      `${toCreate.length} turno${toCreate.length === 1 ? "" : "s"} registrado${toCreate.length === 1 ? "" : "s"}`,
    );
  }
  if (toAnnul.length > 0) {
    parts.push(
      `${toAnnul.length} anulado${toAnnul.length === 1 ? "" : "s"}`,
    );
  }
  return {
    ok: true,
    created: toCreate.length,
    annulled: toAnnul.length,
    message: parts.join(" · "),
  };
}

export async function reviewNoveltyAction(
  noveltyId: string,
  decision: "APROBADA" | "RECHAZADA",
  reviewNotes?: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "personal.novedades.aprobar")) {
    return { ok: false, error: "Sin permiso para aprobar novedades" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("shift_novelties")
    .update({
      status: decision,
      reviewed_by: ctx.userId,
      reviewed_at: new Date().toISOString(),
      review_notes: emptyToNull(reviewNotes),
      updated_by: ctx.userId,
    })
    .eq("id", noveltyId)
    .eq("organization_id", ctx.organization.id)
    .in("status", ["PENDIENTE", "BORRADOR"]);
  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true, id: noveltyId };
}

export async function annulNoveltyAction(
  noveltyId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("shift_novelties")
    .update({
      status: "ANULADA",
      updated_by: ctx.userId,
    })
    .eq("id", noveltyId)
    .eq("organization_id", ctx.organization.id);
  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true, id: noveltyId };
}

// ----- Liquidación -----

export async function createPayrollPeriodAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = payrollPeriodSchema.safeParse({
    period_year: formData.get("period_year"),
    period_month: formData.get("period_month"),
    period_half: formData.get("period_half"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const half = parsed.data.period_half as 1 | 2;
  const range = biweeklyRange(
    parsed.data.period_year,
    parsed.data.period_month,
    half,
  );

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payroll_periods")
    .insert({
      organization_id: ctx.organization.id,
      period_year: parsed.data.period_year,
      period_month: parsed.data.period_month,
      period_half: half,
      period_start: range.startIso,
      period_end: range.endIso,
      status: "BORRADOR",
      notes: emptyToNull(parsed.data.notes),
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Ya existe una liquidación para esa quincena" };
    }
    return { ok: false, error: error.message };
  }

  await seedPayrollAttendanceInternal(
    supabase,
    ctx.organization.id,
    ctx.userId,
    data.id,
    parsed.data.period_year,
    parsed.data.period_month,
    half,
  );

  revalidateAll(`/personal/liquidacion/${data.id}`);
  return { ok: true, id: data.id };
}

type Sb = Awaited<ReturnType<typeof createClient>>;

async function seedPayrollAttendanceInternal(
  supabase: Sb,
  orgId: string,
  userId: string,
  periodId: string,
  year: number,
  month: number,
  half: 1 | 2,
  options?: { overwriteEmployeeId?: string | null },
): Promise<ActionResult & { inserted?: number }> {
  const [{ data: schedule }, { data: employees }, { data: existing }] =
    await Promise.all([
      supabase
        .from("payroll_schedules")
        .select(
          "ordinary_entry_time, ordinary_exit_time, break_minutes, works_monday, works_tuesday, works_wednesday, works_thursday, works_friday, works_saturday, works_sunday",
        )
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase
        .from("employees")
        .select(
          "id, employment_type, ordinary_entry_time, ordinary_exit_time, break_minutes, uses_custom_schedule",
        )
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .is("deleted_at", null),
      supabase
        .from("payroll_attendance_days")
        .select("id, employee_id, work_date")
        .eq("organization_id", orgId)
        .eq("period_id", periodId)
        .is("deleted_at", null),
    ]);

  if (!schedule) {
    return { ok: false, error: "Configure Horario Candela antes de precargar" };
  }

  const candela = mapScheduleRow(schedule);
  const payrollEmps = (employees ?? []).filter(
    (e) => !isShiftDayContractor(String(e.employment_type ?? "")),
  );
  if (payrollEmps.length === 0) {
    return { ok: false, error: "No hay empleados de nómina activos" };
  }

  const overwriteId = options?.overwriteEmployeeId ?? null;
  if (overwriteId) {
    const now = new Date().toISOString();
    const { error: softErr } = await supabase
      .from("payroll_attendance_days")
      .update({ deleted_at: now, updated_by: userId })
      .eq("organization_id", orgId)
      .eq("period_id", periodId)
      .eq("employee_id", overwriteId)
      .is("deleted_at", null);
    if (softErr) return { ok: false, error: softErr.message };
  }

  const existingKeys = new Set(
    (overwriteId
      ? []
      : (existing ?? []).map((r) => `${r.employee_id}|${r.work_date}`)
    ),
  );

  const toInsert: Array<Record<string, unknown>> = [];
  for (const emp of payrollEmps) {
    if (overwriteId && emp.id !== overwriteId) continue;
    const empSchedule = mapEmployeeSchedule({
      ordinary_entry_time: emp.ordinary_entry_time,
      ordinary_exit_time: emp.ordinary_exit_time,
      break_minutes: emp.break_minutes,
      uses_custom_schedule: emp.uses_custom_schedule,
      fallback: candela,
    });
    const rows = buildAttendanceSeedRows({
      year,
      month,
      half,
      employeeId: emp.id,
      employee: empSchedule,
      candela,
    });
    for (const row of rows) {
      const key = `${row.employeeId}|${row.workDate}`;
      if (existingKeys.has(key)) continue;
      toInsert.push({
        organization_id: orgId,
        period_id: periodId,
        employee_id: row.employeeId,
        work_date: row.workDate,
        day_kind: row.dayKind,
        entry_time: row.entryTime,
        exit_time: row.exitTime,
        break_minutes: row.breakMinutes,
        notes: row.notes,
        created_by: userId,
        updated_by: userId,
      });
    }
  }

  if (toInsert.length === 0) {
    return { ok: true, inserted: 0 };
  }

  const { error: insErr } = await supabase
    .from("payroll_attendance_days")
    .insert(toInsert);
  if (insErr) return { ok: false, error: insErr.message };
  return { ok: true, inserted: toInsert.length };
}

export async function seedPayrollAttendanceAction(
  periodId: string,
): Promise<ActionResult & { inserted?: number }> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "personal.liquidacion")) {
    return { ok: false, error: "Sin permiso de liquidación" };
  }
  const supabase = await createClient();
  const { data: period, error } = await supabase
    .from("payroll_periods")
    .select("id, period_year, period_month, period_half, status")
    .eq("id", periodId)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !period) {
    return { ok: false, error: error?.message ?? "Periodo no encontrado" };
  }
  if (period.status === "EMITIDA" || period.status === "CERRADA") {
    return { ok: false, error: "La liquidación emitida no admite cambios" };
  }

  const result = await seedPayrollAttendanceInternal(
    supabase,
    ctx.organization.id,
    ctx.userId,
    periodId,
    period.period_year,
    period.period_month,
    period.period_half as 1 | 2,
  );
  if (result.ok) revalidateAll(`/personal/liquidacion/${periodId}`);
  return result;
}

export async function resetEmployeeAttendanceAction(
  periodId: string,
  employeeId: string,
): Promise<ActionResult & { inserted?: number }> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "personal.liquidacion")) {
    return { ok: false, error: "Sin permiso de liquidación" };
  }
  const supabase = await createClient();
  const { data: period, error } = await supabase
    .from("payroll_periods")
    .select("id, period_year, period_month, period_half, status")
    .eq("id", periodId)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !period) {
    return { ok: false, error: error?.message ?? "Periodo no encontrado" };
  }
  if (period.status === "EMITIDA" || period.status === "CERRADA") {
    return { ok: false, error: "La liquidación emitida no admite cambios" };
  }

  const result = await seedPayrollAttendanceInternal(
    supabase,
    ctx.organization.id,
    ctx.userId,
    periodId,
    period.period_year,
    period.period_month,
    period.period_half as 1 | 2,
    { overwriteEmployeeId: employeeId },
  );
  if (result.ok) revalidateAll(`/personal/liquidacion/${periodId}`);
  return result;
}

export async function saveAttendanceDayAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "personal.liquidacion")) {
    return { ok: false, error: "Sin permiso de liquidación" };
  }

  const parsed = attendanceDaySaveSchema.safeParse({
    period_id: formData.get("period_id"),
    employee_id: formData.get("employee_id"),
    work_date: formData.get("work_date"),
    day_kind: formData.get("day_kind"),
    entry_time: formData.get("entry_time"),
    exit_time: formData.get("exit_time"),
    break_minutes: formData.get("break_minutes") ?? 0,
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const kind = parsed.data.day_kind;
  const rest = kind === "DESCANSO" || kind === "FESTIVO";
  const entryRaw = emptyToNull(parsed.data.entry_time ?? null);
  const exitRaw = emptyToNull(parsed.data.exit_time ?? null);
  const entry_time = rest ? null : entryRaw ? timeFromDb(entryRaw) : null;
  const exit_time = rest ? null : exitRaw ? timeFromDb(exitRaw) : null;
  const break_minutes = rest ? 0 : parsed.data.break_minutes;

  const supabase = await createClient();
  const { data: period } = await supabase
    .from("payroll_periods")
    .select("id, status")
    .eq("id", parsed.data.period_id)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!period) return { ok: false, error: "Periodo no encontrado" };
  if (period.status === "EMITIDA" || period.status === "CERRADA") {
    return { ok: false, error: "La liquidación emitida no admite cambios" };
  }

  const { data: existing } = await supabase
    .from("payroll_attendance_days")
    .select("id")
    .eq("organization_id", ctx.organization.id)
    .eq("period_id", parsed.data.period_id)
    .eq("employee_id", parsed.data.employee_id)
    .eq("work_date", parsed.data.work_date)
    .is("deleted_at", null)
    .maybeSingle();

  const payload = {
    day_kind: kind,
    entry_time,
    exit_time,
    break_minutes,
    notes: emptyToNull(parsed.data.notes),
    updated_by: ctx.userId,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error } = await supabase
      .from("payroll_attendance_days")
      .update(payload)
      .eq("id", existing.id)
      .eq("organization_id", ctx.organization.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("payroll_attendance_days").insert({
      organization_id: ctx.organization.id,
      period_id: parsed.data.period_id,
      employee_id: parsed.data.employee_id,
      work_date: parsed.data.work_date,
      ...payload,
      created_by: ctx.userId,
    });
    if (error) return { ok: false, error: error.message };
  }

  revalidateAll(`/personal/liquidacion/${parsed.data.period_id}`);
  return { ok: true };
}

export async function calculatePayrollPeriodAction(
  periodId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  const orgId = ctx.organization.id;
  const supabase = await createClient();

  const { data: period, error: pErr } = await supabase
    .from("payroll_periods")
    .select("*")
    .eq("id", periodId)
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (pErr || !period) return { ok: false, error: pErr?.message ?? "Periodo no encontrado" };
  if (period.status === "EMITIDA" || period.status === "CERRADA") {
    return { ok: false, error: "La liquidación emitida no se puede recalcular" };
  }

  const [
    { data: schedule },
    { data: legal },
    { data: employees },
    { data: bonuses },
    { data: novelties },
    { data: attendanceRows },
  ] = await Promise.all([
      supabase
        .from("payroll_schedules")
        .select(
          "ordinary_entry_time, ordinary_exit_time, break_minutes, works_monday, works_tuesday, works_wednesday, works_thursday, works_friday, works_saturday, works_sunday",
        )
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase
        .from("payroll_legal_params")
        .select("*")
        .eq("organization_id", orgId)
        .is("deleted_at", null)
        .is("effective_to", null)
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("employees")
        .select(
          "id, full_name, position_title, employment_type, basic_salary, salary_or_fee, receives_transport_aid, arl_risk_level, ordinary_entry_time, ordinary_exit_time, break_minutes, uses_custom_schedule",
        )
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .is("deleted_at", null),
      supabase
        .from("employee_bonuses")
        .select(
          "employee_id, bonus_type, name, amount, percent_of_salary, is_active",
        )
        .eq("organization_id", orgId)
        .is("deleted_at", null)
        .eq("is_active", true),
      supabase
        .from("shift_novelties")
        .select(
          "id, employee_id, novelty_type, novelty_date, minutes, amount, start_time, end_time",
        )
        .eq("organization_id", orgId)
        .eq("status", "APROBADA")
        .is("deleted_at", null)
        .gte("novelty_date", period.period_start)
        .lte("novelty_date", period.period_end),
      supabase
        .from("payroll_attendance_days")
        .select(
          "id, employee_id, work_date, day_kind, entry_time, exit_time, break_minutes, notes",
        )
        .eq("organization_id", orgId)
        .eq("period_id", periodId)
        .is("deleted_at", null),
    ]);

  if (!schedule || !legal) {
    return { ok: false, error: "Configure Horario Candela y parámetros legales" };
  }

  const candela = mapScheduleRow(schedule);
  const legalMapped = mapLegalParamsRow(legal as Record<string, unknown>);
  const bonusByEmp = new Map<string, typeof bonuses>();
  for (const b of bonuses ?? []) {
    const list = bonusByEmp.get(b.employee_id) ?? [];
    list.push(b);
    bonusByEmp.set(b.employee_id, list);
  }
  const novByEmp = new Map<string, typeof novelties>();
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

  if (attByEmp.size === 0) {
    return {
      ok: false,
      error:
        "Sin planilla de asistencia. Pulse «Precargar planilla» antes de calcular.",
    };
  }

  for (const e of payrollEmployees) {
    const days = attByEmp.get(e.id) ?? [];
    const check = validateAttendanceForCalculate(days);
    if (!check.ok) {
      return {
        ok: false,
        error: `${e.full_name}: ${check.error}`,
      };
    }
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
        novelty_type: n.novelty_type as import("@/lib/payroll").ShiftNoveltyType,
        novelty_date: n.novelty_date,
        minutes: n.minutes,
        amount: n.amount != null ? Number(n.amount) : null,
        start_time: n.start_time,
        end_time: n.end_time,
      })),
      attendanceDays: attByEmp.get(e.id) ?? [],
    })),
  });

  // Replace lines without ON CONFLICT: absolute UNIQUE and partial unique
  // indexes behave differently; update-or-insert works with both.
  const nowIso = new Date().toISOString();
  const { data: existingLines, error: existingErr } = await supabase
    .from("payroll_period_lines")
    .select("id, employee_id, deleted_at")
    .eq("period_id", periodId)
    .eq("organization_id", orgId);
  if (existingErr) return { ok: false, error: existingErr.message };

  const existingByEmployee = new Map<
    string,
    { id: string; employee_id: string; deleted_at: string | null }
  >();
  for (const row of existingLines ?? []) {
    const prev = existingByEmployee.get(row.employee_id);
    // Prefer active row if several exist after soft-delete + reinsert.
    if (!prev || (prev.deleted_at && !row.deleted_at)) {
      existingByEmployee.set(row.employee_id, row);
    }
  }

  const keepEmployeeIds = new Set(result.lines.map((l) => l.employeeId));
  const toInsert: Array<Record<string, unknown>> = [];

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
      const { error: updErr } = await supabase
        .from("payroll_period_lines")
        .update(payload)
        .eq("id", existing.id)
        .eq("organization_id", orgId);
      if (updErr) return { ok: false, error: updErr.message };
    } else {
      toInsert.push({
        organization_id: orgId,
        period_id: periodId,
        employee_id: l.employeeId,
        ...payload,
      });
    }
  }

  if (toInsert.length > 0) {
    const { error: lErr } = await supabase
      .from("payroll_period_lines")
      .insert(toInsert);
    if (lErr) return { ok: false, error: lErr.message };
  }

  const staleIds = (existingLines ?? [])
    .filter((r) => !keepEmployeeIds.has(r.employee_id) && r.deleted_at == null)
    .map((r) => r.id);
  if (staleIds.length > 0) {
    const { error: softDelErr } = await supabase
      .from("payroll_period_lines")
      .update({ deleted_at: nowIso })
      .eq("organization_id", orgId)
      .in("id", staleIds);
    if (softDelErr) return { ok: false, error: softDelErr.message };
  }

  const { error: uErr } = await supabase
    .from("payroll_periods")
    .update({
      status: "CALCULADA",
      calculated_at: new Date().toISOString(),
      updated_by: ctx.userId,
      notes: period.notes,
    })
    .eq("id", periodId)
    .eq("organization_id", orgId);
  if (uErr) return { ok: false, error: uErr.message };

  revalidateAll(`/personal/liquidacion/${periodId}`);
  return { ok: true, id: periodId };
}

export async function emitPayrollPeriodAction(
  periodId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  const supabase = await createClient();

  const { data: period } = await supabase
    .from("payroll_periods")
    .select("status")
    .eq("id", periodId)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (!period) return { ok: false, error: "Periodo no encontrado" };
  if (period.status !== "CALCULADA") {
    return { ok: false, error: "Calcule la liquidación antes de emitirla" };
  }

  const { error } = await supabase
    .from("payroll_periods")
    .update({
      status: "EMITIDA",
      emitted_at: new Date().toISOString(),
      emitted_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .eq("id", periodId)
    .eq("organization_id", ctx.organization.id);
  if (error) return { ok: false, error: error.message };

  revalidateAll(`/personal/liquidacion/${periodId}`);
  return { ok: true, id: periodId };
}
