import { z } from "zod";

export const APP_ROLES = [
  "SUPER_ADMIN",
  "GESTION",
  "SOCIO",
  "CONTADOR",
  "LECTURA",
] as const;

const passwordSchema = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres");

export const createSystemUserSchema = z.object({
  email: z.string().email("Correo inválido"),
  full_name: z.string().min(2, "Nombre requerido").max(200),
  role: z.enum(APP_ROLES),
  password: passwordSchema,
  is_active: z.enum(["true", "false"]).optional().default("true"),
});

export const updateSystemUserSchema = z.object({
  membership_id: z.string().uuid(),
  user_id: z.string().uuid(),
  email: z.string().email("Correo inválido"),
  full_name: z.string().min(2, "Nombre requerido").max(200),
  role: z.enum(APP_ROLES),
  password: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== "" ? v : undefined))
    .pipe(passwordSchema.optional()),
  is_active: z.enum(["true", "false"]),
});
