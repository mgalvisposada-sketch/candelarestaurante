"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess } from "@/lib/permissions";
import {
  createGestionSchema,
  gestionIdSchema,
  gestionStatusSchema,
  updateGestionSchema,
} from "@/validations/gestiones";
import type { ActionResult } from "../empresa/actions";

function emptyToNull(value: string | null | undefined) {
  if (value === undefined || value === null || String(value).trim() === "")
    return null;
  return String(value).trim();
}

function parseDueDate(raw: string | null | undefined) {
  const v = emptyToNull(raw);
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  return v;
}

async function assertAssigneeInOrg(
  organizationId: string,
  userId: string,
): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_users")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return error.message;
  if (!data) return "El responsable no pertenece a la organización";
  return null;
}

export async function createGestionAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "gestiones.crear")) {
    return { ok: false, error: "Sin permiso para crear gestiones" };
  }

  const parsed = createGestionSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    priority: formData.get("priority") || "NORMAL",
    assigned_to: formData.get("assigned_to"),
    due_date: formData.get("due_date"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const dueDate = parseDueDate(parsed.data.due_date);
  if (dueDate === undefined) {
    return { ok: false, error: "Fecha límite inválida" };
  }

  const assigneeError = await assertAssigneeInOrg(
    ctx.organization.id,
    parsed.data.assigned_to,
  );
  if (assigneeError) return { ok: false, error: assigneeError };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gestiones")
    .insert({
      organization_id: ctx.organization.id,
      title: parsed.data.title.trim(),
      description: emptyToNull(parsed.data.description),
      priority: parsed.data.priority,
      assigned_to: parsed.data.assigned_to,
      due_date: dueDate,
      status: "PENDIENTE",
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
    entity: "gestiones",
    entity_id: data.id,
    new_values: {
      title: parsed.data.title.trim(),
      assigned_to: parsed.data.assigned_to,
      priority: parsed.data.priority,
    },
  });

  revalidatePath("/gestiones");
  return { ok: true, id: data.id };
}

export async function updateGestionAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "gestiones.gestionar")) {
    return { ok: false, error: "Sin permiso para editar gestiones" };
  }

  const parsed = updateGestionSchema.safeParse({
    id: formData.get("id"),
    title: formData.get("title"),
    description: formData.get("description"),
    priority: formData.get("priority") || "NORMAL",
    assigned_to: formData.get("assigned_to"),
    due_date: formData.get("due_date"),
    status: formData.get("status") || "PENDIENTE",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const dueDate = parseDueDate(parsed.data.due_date);
  if (dueDate === undefined) {
    return { ok: false, error: "Fecha límite inválida" };
  }

  const assigneeError = await assertAssigneeInOrg(
    ctx.organization.id,
    parsed.data.assigned_to,
  );
  if (assigneeError) return { ok: false, error: assigneeError };

  const supabase = await createClient();
  const completedAt =
    parsed.data.status === "HECHA" ? new Date().toISOString() : null;

  const { error } = await supabase
    .from("gestiones")
    .update({
      title: parsed.data.title.trim(),
      description: emptyToNull(parsed.data.description),
      priority: parsed.data.priority,
      assigned_to: parsed.data.assigned_to,
      due_date: dueDate,
      status: parsed.data.status,
      completed_at: completedAt,
      updated_by: ctx.userId,
    })
    .eq("id", parsed.data.id)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null);

  if (error) return { ok: false, error: error.message };

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "UPDATE",
    entity: "gestiones",
    entity_id: parsed.data.id,
    new_values: {
      title: parsed.data.title.trim(),
      status: parsed.data.status,
      assigned_to: parsed.data.assigned_to,
    },
  });

  revalidatePath("/gestiones");
  return { ok: true, id: parsed.data.id };
}

export async function setGestionStatusAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "gestiones.gestionar")) {
    return { ok: false, error: "Sin permiso para cambiar el estado" };
  }

  const parsed = gestionStatusSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const supabase = await createClient();
  const completedAt =
    parsed.data.status === "HECHA" ? new Date().toISOString() : null;

  const { error } = await supabase
    .from("gestiones")
    .update({
      status: parsed.data.status,
      completed_at: completedAt,
      updated_by: ctx.userId,
    })
    .eq("id", parsed.data.id)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null);

  if (error) return { ok: false, error: error.message };

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "UPDATE",
    entity: "gestiones",
    entity_id: parsed.data.id,
    new_values: { status: parsed.data.status },
  });

  revalidatePath("/gestiones");
  return { ok: true, id: parsed.data.id };
}

export async function softDeleteGestionAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "gestiones.gestionar")) {
    return { ok: false, error: "Sin permiso para archivar gestiones" };
  }

  const parsed = gestionIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("gestiones")
    .update({
      deleted_at: new Date().toISOString(),
      updated_by: ctx.userId,
    })
    .eq("id", parsed.data.id)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null);

  if (error) return { ok: false, error: error.message };

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "SOFT_DELETE",
    entity: "gestiones",
    entity_id: parsed.data.id,
  });

  revalidatePath("/gestiones");
  return { ok: true, id: parsed.data.id };
}
