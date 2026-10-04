import { z } from "zod";

export const EMPLOYMENT_TYPES = [
  "INDEFINIDO",
  "TERMINO_FIJO",
  "OBRA_LABOR",
  "APRENDIZAJE",
  "PRESTACION_SERVICIOS",
  "POR_TURNO",
  "MEDIO_TIEMPO",
] as const;

export const employeeSchema = z.object({
  full_name: z.string().min(2, "Nombre obligatorio"),
  id_number: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  position_title: z.string().optional().nullable(),
  position_id: z.string().uuid().optional().nullable().or(z.literal("")),
  hire_date: z.string().optional().nullable(),
  contract_end_date: z.string().optional().nullable(),
  employment_type: z.enum(EMPLOYMENT_TYPES),
  basic_salary: z.string().optional().nullable(),
  salary_or_fee: z.string().optional().nullable(),
  monthly_company_cost: z.string().optional().nullable(),
  receives_transport_aid: z
    .enum(["auto", "true", "false"])
    .optional()
    .default("auto"),
  arl_risk_level: z.enum(["I", "II", "III", "IV", "V"]).optional().default("I"),
  eps: z.string().optional().nullable(),
  pension_fund: z.string().optional().nullable(),
  arl: z.string().optional().nullable(),
  compensation_fund: z.string().optional().nullable(),
  ordinary_entry_time: z.string().optional().nullable(),
  ordinary_exit_time: z.string().optional().nullable(),
  break_minutes: z.string().optional().nullable(),
  uses_custom_schedule: z.enum(["true", "false"]).optional(),
  is_active: z.enum(["true", "false"]).optional(),
});

export const employeeContractSchema = z.object({
  employee_id: z.string().uuid(),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const employeeScheduleSchema = z.object({
  employee_id: z.string().uuid(),
  uses_custom_schedule: z.enum(["true", "false"]),
  ordinary_entry_time: z.string().optional().nullable(),
  ordinary_exit_time: z.string().optional().nullable(),
  break_minutes: z.string().optional().nullable(),
});
