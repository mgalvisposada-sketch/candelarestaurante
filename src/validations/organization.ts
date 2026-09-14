import { z } from "zod";

export const organizationSchema = z.object({
  legal_name: z.string().min(2, "La razón social es obligatoria"),
  trade_name: z.string().optional().nullable(),
  nit: z.string().optional().nullable(),
  dv: z
    .string()
    .max(1)
    .optional()
    .nullable()
    .or(z.literal("")),
  company_type: z.string().optional().nullable(),
  incorporation_date: z.string().optional().nullable(),
  commercial_registration: z.string().optional().nullable(),
  primary_ciiu: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  municipality: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  corporate_email: z
    .string()
    .email("Email inválido")
    .optional()
    .nullable()
    .or(z.literal("")),
  phone: z.string().optional().nullable(),
  legal_representative: z.string().optional().nullable(),
  administrative_cutoff_date: z.string().optional().nullable(),
});

export type OrganizationInput = z.infer<typeof organizationSchema>;

export const handoverSessionSchema = z.object({
  cutoff_date: z.string().min(1, "La fecha de corte es obligatoria"),
  delivered_by_name: z.string().optional().nullable(),
  received_by_name: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const handoverItemSchema = z.object({
  domain: z.string().min(1),
  item_key: z.string().min(1),
  label: z.string().min(1),
  amount: z.string().optional().nullable(),
  verification_status: z.enum(["CONFIRMADO", "DECLARADO", "PENDIENTE"]),
  comments: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
});

export type HandoverItemInput = z.infer<typeof handoverItemSchema>;
