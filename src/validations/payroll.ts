import { z } from "zod";

const timeStr = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/, "Hora inválida (HH:mm)");

const boolFromForm = z
  .union([z.literal("true"), z.literal("false"), z.literal("on"), z.literal("")])
  .optional()
  .transform((v) => v === "true" || v === "on");

export const payrollScheduleSchema = z.object({
  name: z.string().min(1).default("Horario Candela"),
  ordinary_entry_time: timeStr,
  ordinary_exit_time: timeStr,
  break_minutes: z.coerce.number().int().min(0).max(240),
  works_monday: boolFromForm,
  works_tuesday: boolFromForm,
  works_wednesday: boolFromForm,
  works_thursday: boolFromForm,
  works_friday: boolFromForm,
  works_saturday: boolFromForm,
  works_sunday: boolFromForm,
});

export const payrollLegalParamsSchema = z.object({
  effective_from: z.string().min(1, "Fecha de vigencia obligatoria"),
  notes: z.string().optional().nullable(),
  max_weekly_hours: z.coerce.number().positive(),
  night_start_time: timeStr,
  night_end_time: timeStr,
  surcharge_night_ordinary: z.coerce.number().min(0),
  surcharge_sunday_holiday: z.coerce.number().min(0),
  surcharge_extra_day: z.coerce.number().min(0),
  surcharge_extra_night: z.coerce.number().min(0),
  surcharge_extra_day_sunday: z.coerce.number().min(0),
  surcharge_extra_night_sunday: z.coerce.number().min(0),
  smmlv: z.string().min(1),
  transport_aid: z.string().min(1),
  transport_aid_max_salaries: z.coerce.number().positive(),
  employee_health_pct: z.coerce.number().min(0),
  employee_pension_pct: z.coerce.number().min(0),
  solidarity_pension_threshold_smmlv: z.coerce.number().positive(),
  solidarity_pension_pct: z.coerce.number().min(0),
  apply_solidarity_pension: boolFromForm,
  employer_health_pct: z.coerce.number().min(0),
  employer_pension_pct: z.coerce.number().min(0),
  arl_pct_level_i: z.coerce.number().min(0),
  arl_pct_level_ii: z.coerce.number().min(0),
  arl_pct_level_iii: z.coerce.number().min(0),
  arl_pct_level_iv: z.coerce.number().min(0),
  arl_pct_level_v: z.coerce.number().min(0),
  sena_pct: z.coerce.number().min(0),
  icbf_pct: z.coerce.number().min(0),
  compensation_fund_pct: z.coerce.number().min(0),
  parafiscal_exemption_max_smmlv: z.coerce.number().positive(),
  apply_parafiscales: boolFromForm,
  apply_parafiscal_exemption: boolFromForm,
  provision_prima_pct: z.coerce.number().min(0),
  provision_cesantias_pct: z.coerce.number().min(0),
  provision_interest_cesantias_pct: z.coerce.number().min(0),
  provision_vacaciones_pct: z.coerce.number().min(0),
  round_to_peso: boolFromForm,
});

export const employeeBonusSchema = z.object({
  employee_id: z.string().uuid(),
  bonus_type: z.enum(["FIJA", "POR_META"]),
  name: z.string().min(1, "Nombre obligatorio"),
  amount: z.string().optional().nullable(),
  percent_of_salary: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  is_active: z.enum(["true", "false"]).optional(),
  effective_from: z.string().optional().nullable(),
  effective_to: z.string().optional().nullable(),
});
