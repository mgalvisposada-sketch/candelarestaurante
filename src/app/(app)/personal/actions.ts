"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org-context";
import {
  employeeContractSchema,
  employeeScheduleSchema,
  employeeSchema,
} from "@/validations/hr";
import {
  employeeBonusSchema,
  payrollLegalParamsSchema,
  payrollScheduleSchema,
} from "@/validations/payroll";
import { isIndefiniteContract } from "@/lib/hr-documents";
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

function formBool(fd: FormData, key: string) {
  const v = fd.get(key);
  return v === "true" || v === "on";
}

function revalidatePersonal(employeeId?: string) {
  revalidatePath("/personal");
  revalidatePath("/personal/parametros");
  if (employeeId) revalidatePath(`/personal/${employeeId}`);
}

async function getActiveCandelaSchedule(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
) {
  const { data } = await supabase
    .from("payroll_schedules")
    .select(
      "ordinary_entry_time, ordinary_exit_time, break_minutes",
    )
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();
  return data;
}

export async function createEmployeeAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = employeeSchema.safeParse({
    full_name: formData.get("full_name"),
    id_number: formData.get("id_number"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    address: formData.get("address"),
    position_title: formData.get("position_title"),
    position_id: formData.get("position_id") || "",
    hire_date: formData.get("hire_date"),
    contract_end_date: formData.get("contract_end_date"),
    employment_type: formData.get("employment_type") || "INDEFINIDO",
    basic_salary: formData.get("basic_salary"),
    salary_or_fee: formData.get("basic_salary") || formData.get("salary_or_fee"),
    monthly_company_cost: formData.get("monthly_company_cost"),
    receives_transport_aid: formData.get("receives_transport_aid") || "auto",
    arl_risk_level: formData.get("arl_risk_level") || "I",
    eps: formData.get("eps"),
    pension_fund: formData.get("pension_fund"),
    arl: formData.get("arl"),
    compensation_fund: formData.get("compensation_fund"),
    is_active: formData.get("is_active") || "true",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const schedule = await getActiveCandelaSchedule(
    supabase,
    ctx.organization.id,
  );
  const basic = parseMoney(parsed.data.basic_salary);
  const transport =
    parsed.data.receives_transport_aid === "auto"
      ? null
      : parsed.data.receives_transport_aid === "true";

  const positionId = emptyToNull(parsed.data.position_id);
  let positionTitle = emptyToNull(parsed.data.position_title);
  let arlLevel = parsed.data.arl_risk_level ?? "I";
  if (positionId) {
    const { data: pos } = await supabase
      .from("job_positions")
      .select("name, arl_risk_level")
      .eq("id", positionId)
      .eq("organization_id", ctx.organization.id)
      .maybeSingle();
    if (pos) {
      positionTitle = positionTitle ?? pos.name;
      arlLevel = pos.arl_risk_level as typeof arlLevel;
    }
  }

  const contractEnd = isIndefiniteContract(parsed.data.employment_type)
    ? null
    : emptyToNull(parsed.data.contract_end_date);

  const { data, error } = await supabase
    .from("employees")
    .insert({
      organization_id: ctx.organization.id,
      full_name: parsed.data.full_name.trim(),
      id_number: emptyToNull(parsed.data.id_number),
      email: emptyToNull(parsed.data.email),
      phone: emptyToNull(parsed.data.phone),
      address: emptyToNull(parsed.data.address),
      position_id: positionId,
      position_title: positionTitle,
      hire_date: emptyToNull(parsed.data.hire_date),
      contract_end_date: contractEnd,
      employment_type: parsed.data.employment_type,
      basic_salary: basic,
      salary_or_fee: basic,
      monthly_company_cost: parseMoney(parsed.data.monthly_company_cost),
      receives_transport_aid: transport,
      arl_risk_level: arlLevel,
      eps: emptyToNull(parsed.data.eps),
      pension_fund: emptyToNull(parsed.data.pension_fund),
      arl: emptyToNull(parsed.data.arl),
      compensation_fund: emptyToNull(parsed.data.compensation_fund),
      ordinary_entry_time: schedule?.ordinary_entry_time ?? "10:00",
      ordinary_exit_time: schedule?.ordinary_exit_time ?? "22:00",
      break_minutes: schedule?.break_minutes ?? 60,
      uses_custom_schedule: false,
      is_active: parsed.data.is_active !== "false",
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "CREATE",
    entity: "employees",
    entity_id: data.id,
  });

  revalidatePersonal(data.id);
  return { ok: true, id: data.id };
}

export async function updateEmployeeAction(
  employeeId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = employeeSchema.safeParse({
    full_name: formData.get("full_name"),
    id_number: formData.get("id_number"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    address: formData.get("address"),
    position_title: formData.get("position_title"),
    position_id: formData.get("position_id") || "",
    hire_date: formData.get("hire_date"),
    contract_end_date: formData.get("contract_end_date"),
    employment_type: formData.get("employment_type") || "INDEFINIDO",
    basic_salary: formData.get("basic_salary"),
    monthly_company_cost: formData.get("monthly_company_cost"),
    receives_transport_aid: formData.get("receives_transport_aid") || "auto",
    arl_risk_level: formData.get("arl_risk_level") || "I",
    eps: formData.get("eps"),
    pension_fund: formData.get("pension_fund"),
    arl: formData.get("arl"),
    compensation_fund: formData.get("compensation_fund"),
    is_active: formData.get("is_active") || "true",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const basic = parseMoney(parsed.data.basic_salary);
  const transport =
    parsed.data.receives_transport_aid === "auto"
      ? null
      : parsed.data.receives_transport_aid === "true";

  const supabase = await createClient();
  const positionId = emptyToNull(parsed.data.position_id);
  let positionTitle = emptyToNull(parsed.data.position_title);
  let arlLevel = parsed.data.arl_risk_level ?? "I";
  if (positionId) {
    const { data: pos } = await supabase
      .from("job_positions")
      .select("name, arl_risk_level")
      .eq("id", positionId)
      .eq("organization_id", ctx.organization.id)
      .maybeSingle();
    if (pos) {
      if (!positionTitle) positionTitle = pos.name;
      arlLevel = pos.arl_risk_level as typeof arlLevel;
    }
  }

  const contractEnd = isIndefiniteContract(parsed.data.employment_type)
    ? null
    : emptyToNull(parsed.data.contract_end_date);

  const { error } = await supabase
    .from("employees")
    .update({
      full_name: parsed.data.full_name.trim(),
      id_number: emptyToNull(parsed.data.id_number),
      email: emptyToNull(parsed.data.email),
      phone: emptyToNull(parsed.data.phone),
      address: emptyToNull(parsed.data.address),
      position_id: positionId,
      position_title: positionTitle,
      hire_date: emptyToNull(parsed.data.hire_date),
      contract_end_date: contractEnd,
      employment_type: parsed.data.employment_type,
      basic_salary: basic,
      salary_or_fee: basic,
      monthly_company_cost: parseMoney(parsed.data.monthly_company_cost),
      receives_transport_aid: transport,
      arl_risk_level: arlLevel,
      eps: emptyToNull(parsed.data.eps),
      pension_fund: emptyToNull(parsed.data.pension_fund),
      arl: emptyToNull(parsed.data.arl),
      compensation_fund: emptyToNull(parsed.data.compensation_fund),
      is_active: parsed.data.is_active !== "false",
      updated_by: ctx.userId,
    })
    .eq("id", employeeId)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null);

  if (error) return { ok: false, error: error.message };
  revalidatePersonal(employeeId);
  return { ok: true, id: employeeId };
}

export async function updateEmployeeScheduleAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = employeeScheduleSchema.safeParse({
    employee_id: formData.get("employee_id"),
    uses_custom_schedule: formData.get("uses_custom_schedule") || "false",
    ordinary_entry_time: formData.get("ordinary_entry_time"),
    ordinary_exit_time: formData.get("ordinary_exit_time"),
    break_minutes: formData.get("break_minutes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const custom = parsed.data.uses_custom_schedule === "true";
  let entry = emptyToNull(parsed.data.ordinary_entry_time);
  let exit = emptyToNull(parsed.data.ordinary_exit_time);
  let breakMin = Number(parsed.data.break_minutes ?? 0);

  if (!custom) {
    const schedule = await getActiveCandelaSchedule(
      supabase,
      ctx.organization.id,
    );
    entry = schedule?.ordinary_entry_time ?? "10:00";
    exit = schedule?.ordinary_exit_time ?? "22:00";
    breakMin = schedule?.break_minutes ?? 60;
  }

  const { error } = await supabase
    .from("employees")
    .update({
      uses_custom_schedule: custom,
      ordinary_entry_time: entry,
      ordinary_exit_time: exit,
      break_minutes: Number.isFinite(breakMin) ? breakMin : 0,
      updated_by: ctx.userId,
    })
    .eq("id", parsed.data.employee_id)
    .eq("organization_id", ctx.organization.id);

  if (error) return { ok: false, error: error.message };
  revalidatePersonal(parsed.data.employee_id);
  return { ok: true, id: parsed.data.employee_id };
}

export async function createEmployeeContractAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = employeeContractSchema.safeParse({
    employee_id: formData.get("employee_id"),
    start_date: formData.get("start_date"),
    end_date: formData.get("end_date"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_contracts")
    .insert({
      organization_id: ctx.organization.id,
      employee_id: parsed.data.employee_id,
      start_date: emptyToNull(parsed.data.start_date),
      end_date: emptyToNull(parsed.data.end_date),
      notes: emptyToNull(parsed.data.notes),
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePersonal(parsed.data.employee_id);
  return { ok: true, id: data.id };
}

export async function softDeleteEmployeeAction(
  employeeId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("employees")
    .update({
      deleted_at: new Date().toISOString(),
      is_active: false,
      updated_by: ctx.userId,
    })
    .eq("id", employeeId)
    .eq("organization_id", ctx.organization.id);
  if (error) return { ok: false, error: error.message };
  revalidatePersonal(employeeId);
  return { ok: true, id: employeeId };
}

export async function createEmployeeBonusAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = employeeBonusSchema.safeParse({
    employee_id: formData.get("employee_id"),
    bonus_type: formData.get("bonus_type") || "FIJA",
    name: formData.get("name"),
    amount: formData.get("amount"),
    percent_of_salary: formData.get("percent_of_salary"),
    description: formData.get("description"),
    is_active: formData.get("is_active") || "true",
    effective_from: formData.get("effective_from"),
    effective_to: formData.get("effective_to"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const amount = parseMoney(parsed.data.amount);
  const pct = parseMoney(parsed.data.percent_of_salary);
  if (amount == null && pct == null) {
    return { ok: false, error: "Indique monto o porcentaje" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_bonuses")
    .insert({
      organization_id: ctx.organization.id,
      employee_id: parsed.data.employee_id,
      bonus_type: parsed.data.bonus_type,
      name: parsed.data.name.trim(),
      amount,
      percent_of_salary: pct,
      description: emptyToNull(parsed.data.description),
      is_active: parsed.data.is_active !== "false",
      effective_from: emptyToNull(parsed.data.effective_from),
      effective_to: emptyToNull(parsed.data.effective_to),
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePersonal(parsed.data.employee_id);
  return { ok: true, id: data.id };
}

export async function softDeleteEmployeeBonusAction(
  bonusId: string,
  employeeId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("employee_bonuses")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", bonusId)
    .eq("organization_id", ctx.organization.id);
  if (error) return { ok: false, error: error.message };
  revalidatePersonal(employeeId);
  return { ok: true, id: bonusId };
}

export async function upsertPayrollScheduleAction(
  formData: FormData,
  scheduleId?: string | null,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = payrollScheduleSchema.safeParse({
    name: formData.get("name") || "Horario Candela",
    ordinary_entry_time: formData.get("ordinary_entry_time"),
    ordinary_exit_time: formData.get("ordinary_exit_time"),
    break_minutes: formData.get("break_minutes"),
    works_monday: formBool(formData, "works_monday") ? "true" : "false",
    works_tuesday: formBool(formData, "works_tuesday") ? "true" : "false",
    works_wednesday: formBool(formData, "works_wednesday") ? "true" : "false",
    works_thursday: formBool(formData, "works_thursday") ? "true" : "false",
    works_friday: formBool(formData, "works_friday") ? "true" : "false",
    works_saturday: formBool(formData, "works_saturday") ? "true" : "false",
    works_sunday: formBool(formData, "works_sunday") ? "true" : "false",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const payload = {
    organization_id: ctx.organization.id,
    name: parsed.data.name,
    is_active: true,
    ordinary_entry_time: parsed.data.ordinary_entry_time.slice(0, 5),
    ordinary_exit_time: parsed.data.ordinary_exit_time.slice(0, 5),
    break_minutes: parsed.data.break_minutes,
    works_monday: parsed.data.works_monday,
    works_tuesday: parsed.data.works_tuesday,
    works_wednesday: parsed.data.works_wednesday,
    works_thursday: parsed.data.works_thursday,
    works_friday: parsed.data.works_friday,
    works_saturday: parsed.data.works_saturday,
    works_sunday: parsed.data.works_sunday,
    updated_by: ctx.userId,
  };

  const supabase = await createClient();
  let id = scheduleId ?? undefined;

  if (id) {
    const { error } = await supabase
      .from("payroll_schedules")
      .update(payload)
      .eq("id", id)
      .eq("organization_id", ctx.organization.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data, error } = await supabase
      .from("payroll_schedules")
      .insert({ ...payload, created_by: ctx.userId })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    id = data.id;
  }

  // Sync non-custom employees to new Candela times
  await supabase
    .from("employees")
    .update({
      ordinary_entry_time: payload.ordinary_entry_time,
      ordinary_exit_time: payload.ordinary_exit_time,
      break_minutes: payload.break_minutes,
      updated_by: ctx.userId,
    })
    .eq("organization_id", ctx.organization.id)
    .eq("uses_custom_schedule", false)
    .is("deleted_at", null);

  revalidatePersonal();
  return { ok: true, id };
}

export async function savePayrollLegalParamsAction(
  formData: FormData,
  currentId?: string | null,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const raw: Record<string, FormDataEntryValue | null> = {};
  for (const [k, v] of formData.entries()) raw[k] = v;

  const parsed = payrollLegalParamsSchema.safeParse({
    ...raw,
    apply_solidarity_pension: formBool(formData, "apply_solidarity_pension")
      ? "true"
      : "false",
    apply_parafiscales: formBool(formData, "apply_parafiscales")
      ? "true"
      : "false",
    apply_parafiscal_exemption: formBool(
      formData,
      "apply_parafiscal_exemption",
    )
      ? "true"
      : "false",
    round_to_peso: formBool(formData, "round_to_peso") ? "true" : "false",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const smmlv = parseMoney(parsed.data.smmlv);
  const transport = parseMoney(parsed.data.transport_aid);
  if (smmlv == null || transport == null) {
    return { ok: false, error: "SMMLV y auxilio de transporte son obligatorios" };
  }

  const supabase = await createClient();
  const d = parsed.data;
  const row = {
    organization_id: ctx.organization.id,
    effective_from: d.effective_from,
    effective_to: null as string | null,
    notes: emptyToNull(d.notes),
    max_weekly_hours: d.max_weekly_hours,
    night_start_time: d.night_start_time.slice(0, 5),
    night_end_time: d.night_end_time.slice(0, 5),
    surcharge_night_ordinary: d.surcharge_night_ordinary,
    surcharge_sunday_holiday: d.surcharge_sunday_holiday,
    surcharge_extra_day: d.surcharge_extra_day,
    surcharge_extra_night: d.surcharge_extra_night,
    surcharge_extra_day_sunday: d.surcharge_extra_day_sunday,
    surcharge_extra_night_sunday: d.surcharge_extra_night_sunday,
    smmlv,
    transport_aid: transport,
    transport_aid_max_salaries: d.transport_aid_max_salaries,
    employee_health_pct: d.employee_health_pct,
    employee_pension_pct: d.employee_pension_pct,
    solidarity_pension_threshold_smmlv: d.solidarity_pension_threshold_smmlv,
    solidarity_pension_pct: d.solidarity_pension_pct,
    apply_solidarity_pension: d.apply_solidarity_pension,
    employer_health_pct: d.employer_health_pct,
    employer_pension_pct: d.employer_pension_pct,
    arl_pct_level_i: d.arl_pct_level_i,
    arl_pct_level_ii: d.arl_pct_level_ii,
    arl_pct_level_iii: d.arl_pct_level_iii,
    arl_pct_level_iv: d.arl_pct_level_iv,
    arl_pct_level_v: d.arl_pct_level_v,
    sena_pct: d.sena_pct,
    icbf_pct: d.icbf_pct,
    compensation_fund_pct: d.compensation_fund_pct,
    parafiscal_exemption_max_smmlv: d.parafiscal_exemption_max_smmlv,
    apply_parafiscales: d.apply_parafiscales,
    apply_parafiscal_exemption: d.apply_parafiscal_exemption,
    provision_prima_pct: d.provision_prima_pct,
    provision_cesantias_pct: d.provision_cesantias_pct,
    provision_interest_cesantias_pct: d.provision_interest_cesantias_pct,
    provision_vacaciones_pct: d.provision_vacaciones_pct,
    round_to_peso: d.round_to_peso,
    updated_by: ctx.userId,
  };

  // Cerrar vigencia anterior e insertar nueva
  if (currentId) {
    const dayBefore = new Date(`${d.effective_from}T12:00:00`);
    dayBefore.setDate(dayBefore.getDate() - 1);
    const end = dayBefore.toISOString().slice(0, 10);
    await supabase
      .from("payroll_legal_params")
      .update({ effective_to: end, updated_by: ctx.userId })
      .eq("id", currentId)
      .eq("organization_id", ctx.organization.id)
      .is("effective_to", null);
  }

  const { data, error } = await supabase
    .from("payroll_legal_params")
    .insert({ ...row, created_by: ctx.userId })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePersonal();
  return { ok: true, id: data.id };
}
