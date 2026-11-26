import { z } from "zod";

export const GESTION_STATUSES = [
  "PENDIENTE",
  "EN_PROGRESO",
  "HECHA",
  "CANCELADA",
] as const;

export const GESTION_PRIORITIES = [
  "BAJA",
  "NORMAL",
  "ALTA",
  "URGENTE",
] as const;

export const createGestionSchema = z.object({
  title: z.string().trim().min(1, "Título obligatorio").max(200),
  description: z.string().trim().max(4000).optional().nullable(),
  priority: z.enum(GESTION_PRIORITIES),
  assigned_to: z.string().uuid("Responsable inválido"),
  due_date: z.string().optional().nullable(),
});

export const updateGestionSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1, "Título obligatorio").max(200),
  description: z.string().trim().max(4000).optional().nullable(),
  priority: z.enum(GESTION_PRIORITIES),
  assigned_to: z.string().uuid("Responsable inválido"),
  due_date: z.string().optional().nullable(),
  status: z.enum(GESTION_STATUSES),
});

export const gestionStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(GESTION_STATUSES),
});

export const gestionIdSchema = z.object({
  id: z.string().uuid(),
});
