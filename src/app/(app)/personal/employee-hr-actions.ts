"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org-context";
import { MAX_EMPLOYEE_DOCUMENT_BYTES } from "@/lib/hr-documents";
import { countBusinessDays } from "@/lib/payroll/vacations";
import { documentMetaSchema } from "@/validations/documents";
import { z } from "zod";
import type { ActionResult } from "../empresa/actions";

function emptyToNull(value: string | null | undefined) {
  if (value === undefined || value === null || String(value).trim() === "")
    return null;
  return String(value).trim();
}

function revalidateEmployee(employeeId: string) {
  revalidatePath("/personal");
  revalidatePath(`/personal/${employeeId}`);
  revalidatePath("/documentos");
}

const vacationSchema = z.object({
  employee_id: z.string().uuid(),
  start_date: z.string().min(1),
  end_date: z.string().min(1),
  business_days: z.string().optional().nullable(),
  status: z
    .enum(["PROGRAMADA", "EN_CURSO", "DISFRUTADA", "CANCELADA"])
    .optional(),
  notes: z.string().optional().nullable(),
});

const prepareUploadSchema = z.object({
  employeeId: z.string().uuid(),
  fileName: z.string().min(1),
  fileSize: z.number().int().positive(),
});

const registerMetaSchema = z.object({
  employeeId: z.string().uuid(),
  name: z.string().min(1),
  document_type: z.string().min(1),
  storagePath: z.string().min(1),
  fileSize: z.number().int().positive(),
  mimeType: z.string().nullable().optional(),
});

/** Prefijo de storage para subir el archivo directo desde el navegador (evita límite de Server Actions). */
export async function prepareEmployeeDocumentUploadAction(input: {
  employeeId: string;
  fileName: string;
  fileSize: number;
}): Promise<ActionResult & { storagePath?: string }> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = prepareUploadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  if (parsed.data.fileSize > MAX_EMPLOYEE_DOCUMENT_BYTES) {
    return { ok: false, error: "El archivo supera 60 MB" };
  }

  const supabase = await createClient();
  const { data: employee, error: empError } = await supabase
    .from("employees")
    .select("id")
    .eq("id", parsed.data.employeeId)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (empError || !employee) {
    return { ok: false, error: empError?.message ?? "Empleado no encontrado" };
  }

  const safeName = parsed.data.fileName.replace(/[^\w.\-]+/g, "_");
  const storagePath = `${ctx.organization.id}/${crypto.randomUUID()}-${safeName}`;
  return { ok: true, storagePath };
}

/** Registra metadatos tras subir el archivo a Storage desde el cliente. */
export async function registerEmployeeDocumentMetaAction(input: {
  employeeId: string;
  name: string;
  document_type: string;
  storagePath: string;
  fileSize: number;
  mimeType?: string | null;
}): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = registerMetaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  if (parsed.data.fileSize > MAX_EMPLOYEE_DOCUMENT_BYTES) {
    return { ok: false, error: "El archivo supera 60 MB" };
  }

  const orgPrefix = `${ctx.organization.id}/`;
  if (!parsed.data.storagePath.startsWith(orgPrefix)) {
    return { ok: false, error: "Ruta de almacenamiento inválida" };
  }

  const meta = documentMetaSchema.safeParse({
    name: parsed.data.name,
    document_type: parsed.data.document_type,
    entity_type: "employee",
    entity_id: parsed.data.employeeId,
  });
  if (!meta.success) {
    return { ok: false, error: meta.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .insert({
      organization_id: ctx.organization.id,
      name: meta.data.name.trim(),
      document_type: emptyToNull(meta.data.document_type),
      file_size: parsed.data.fileSize,
      mime_type: emptyToNull(parsed.data.mimeType),
      storage_path: parsed.data.storagePath,
      entity_type: "employee",
      entity_id: parsed.data.employeeId,
      uploaded_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) {
    await supabase.storage.from("documents").remove([parsed.data.storagePath]);
    return { ok: false, error: error.message };
  }

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "CREATE",
    entity: "documents",
    entity_id: data.id,
  });

  revalidateEmployee(parsed.data.employeeId);
  return { ok: true, id: data.id };
}

export async function softDeleteEmployeeDocumentAction(
  documentId: string,
  employeeId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("documents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", documentId)
    .eq("organization_id", ctx.organization.id)
    .eq("entity_type", "employee")
    .eq("entity_id", employeeId);
  if (error) return { ok: false, error: error.message };
  revalidateEmployee(employeeId);
  return { ok: true, id: documentId };
}

export async function createEmployeeVacationAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = vacationSchema.safeParse({
    employee_id: formData.get("employee_id"),
    start_date: formData.get("start_date"),
    end_date: formData.get("end_date"),
    business_days: formData.get("business_days"),
    status: formData.get("status") || "PROGRAMADA",
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  if (parsed.data.end_date < parsed.data.start_date) {
    return { ok: false, error: "La fecha fin debe ser ≥ inicio" };
  }

  const daysRaw = emptyToNull(parsed.data.business_days);
  const businessDays =
    daysRaw != null && !Number.isNaN(Number(daysRaw))
      ? Number(daysRaw)
      : countBusinessDays(parsed.data.start_date, parsed.data.end_date);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_vacations")
    .insert({
      organization_id: ctx.organization.id,
      employee_id: parsed.data.employee_id,
      start_date: parsed.data.start_date,
      end_date: parsed.data.end_date,
      business_days: businessDays,
      status: parsed.data.status ?? "PROGRAMADA",
      notes: emptyToNull(parsed.data.notes),
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidateEmployee(parsed.data.employee_id);
  return { ok: true, id: data.id };
}

export async function updateEmployeeVacationStatusAction(
  vacationId: string,
  employeeId: string,
  status: "PROGRAMADA" | "EN_CURSO" | "DISFRUTADA" | "CANCELADA",
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("employee_vacations")
    .update({ status, updated_by: ctx.userId })
    .eq("id", vacationId)
    .eq("organization_id", ctx.organization.id);
  if (error) return { ok: false, error: error.message };
  revalidateEmployee(employeeId);
  return { ok: true, id: vacationId };
}

export async function softDeleteEmployeeVacationAction(
  vacationId: string,
  employeeId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("employee_vacations")
    .update({
      deleted_at: new Date().toISOString(),
      status: "CANCELADA",
      updated_by: ctx.userId,
    })
    .eq("id", vacationId)
    .eq("organization_id", ctx.organization.id);
  if (error) return { ok: false, error: error.message };
  revalidateEmployee(employeeId);
  return { ok: true, id: vacationId };
}
