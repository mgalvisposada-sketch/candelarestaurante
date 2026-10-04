"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess } from "@/lib/permissions";
import {
  jobPositionSchema,
  noveltySchema,
  payrollPeriodSchema,
} from "@/validations/novelties";
import {
  biweeklyRange,
  liquidatePeriod,
  mapEmployeeSchedule,
  mapLegalParamsRow,
  mapScheduleRow,
  type EmploymentContractType,
  type ArlRiskLevel,
} from "@/lib/payroll";
import type { ActionResult } from "../empresa/actions";

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

  const minutesRaw = emptyToNull(parsed.data.minutes);
  const minutes = minutesRaw != null ? Number(minutesRaw) : null;
  const amount = parseMoney(parsed.data.amount);
  const moneyTypes = ["ANTICIPO", "DESCUENTO_AUTORIZADO", "BONO_OCASIONAL"];
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

  const supabase = await createClient();
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

  revalidateAll(`/personal/liquidacion/${data.id}`);
  return { ok: true, id: data.id };
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

  const [{ data: schedule }, { data: legal }, { data: employees }, { data: bonuses }, { data: novelties }] =
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

  const result = liquidatePeriod({
    year: period.period_year,
    month: period.period_month,
    half: period.period_half as 1 | 2,
    candelaSchedule: candela,
    legal: legalMapped,
    includeGoalBonuses: true,
    employees: (employees ?? []).map((e) => ({
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
    })),
  });

  // Replace lines
  await supabase
    .from("payroll_period_lines")
    .update({ deleted_at: new Date().toISOString() })
    .eq("period_id", periodId)
    .eq("organization_id", orgId)
    .is("deleted_at", null);

  if (result.lines.length > 0) {
    const { error: lErr } = await supabase.from("payroll_period_lines").insert(
      result.lines.map((l) => ({
        organization_id: orgId,
        period_id: periodId,
        employee_id: l.employeeId,
        employee_name: l.employeeName,
        position_title: l.positionTitle,
        novelty_count: l.noveltyCount,
        net_pay: l.netPay,
        employer_cost: l.employerCost,
        earnings_total: l.earningsTotal,
        deductions_total: l.deductionsTotal,
        snapshot: l.simulation as unknown as Record<string, unknown>,
      })),
    );
    if (lErr) return { ok: false, error: lErr.message };
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
