import { z } from "zod";

export const employeeSchema = z.object({
  full_name: z.string().min(2, "Nombre obligatorio"),
  id_number: z.string().optional().nullable(),
  position_title: z.string().optional().nullable(),
  hire_date: z.string().optional().nullable(),
  employment_type: z.enum(["LABORAL", "PRESTACION_SERVICIOS", "TEMPORAL", "OTRO"]),
  salary_or_fee: z.string().optional().nullable(),
  monthly_company_cost: z.string().optional().nullable(),
  eps: z.string().optional().nullable(),
  pension_fund: z.string().optional().nullable(),
  arl: z.string().optional().nullable(),
  compensation_fund: z.string().optional().nullable(),
  is_active: z.enum(["true", "false"]).optional(),
});

export const employeeContractSchema = z.object({
  employee_id: z.string().uuid(),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});
