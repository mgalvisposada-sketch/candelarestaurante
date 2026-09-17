"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org-context";
import {
  DEFAULT_HANDOVER_ITEMS,
  isRetiredHandoverItem,
  slugifyItemKey,
} from "@/lib/handover-catalog";
import {
  buildHandoverItemMetadata,
  parseHandoverBreakdownLines,
  sumHandoverBreakdownLines,
} from "@/lib/handover";
import {
  handoverItemMetadataSchema,
  handoverItemSchema,
  handoverSessionSchema,
} from "@/validations/organization";
import type { ActionResult } from "../empresa/actions";
import { z } from "zod";

const createItemSchema = z.object({
  domain: z.string().min(1, "Dominio obligatorio"),
  label: z.string().min(2, "Etiqueta obligatoria"),
  amount: z.string().optional().nullable(),
  verification_status: z.enum(["CONFIRMADO", "DECLARADO", "PENDIENTE"]),
  comments: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  metadata_json: z.string().optional().nullable(),
});

function parseAmount(raw: string | null | undefined): number | null {
  const amountRaw = raw?.trim();
  if (!amountRaw) return null;
  const amount = Number(amountRaw.replace(/,/g, ""));
  if (Number.isNaN(amount)) return NaN;
  return amount;
}

function resolveAmountAndMetadata(raw: {
  amount?: string | null | undefined;
  metadata_json?: string | null | undefined;
}):
  | { ok: true; amount: number | null; metadata: { lines: ReturnType<typeof parseHandoverBreakdownLines> } }
  | { ok: false; error: string } {
  const lines = parseHandoverBreakdownLines(raw.metadata_json);
  const metadataParsed = handoverItemMetadataSchema.safeParse(
    buildHandoverItemMetadata(lines),
  );
  if (!metadataParsed.success) {
    return {
      ok: false,
      error: metadataParsed.error.issues[0]?.message ?? "Desglose inválido",
    };
  }

  const linesSum = sumHandoverBreakdownLines(metadataParsed.data.lines);
  if (linesSum != null) {
    return {
      ok: true,
      amount: linesSum,
      metadata: metadataParsed.data,
    };
  }

  const amount = parseAmount(raw.amount);
  if (Number.isNaN(amount)) return { ok: false, error: "Monto inválido" };
  return {
    ok: true,
    amount,
    metadata: metadataParsed.data,
  };
}

export async function createHandoverSessionAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) {
    return { ok: false, error: "Primero configura la empresa" };
  }

  const parsed = handoverSessionSchema.safeParse({
    cutoff_date: formData.get("cutoff_date"),
    delivered_by_name: formData.get("delivered_by_name"),
    received_by_name: formData.get("received_by_name"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const supabase = await createClient();
  const { data: session, error } = await supabase
    .from("handover_sessions")
    .insert({
      organization_id: ctx.organization.id,
      cutoff_date: parsed.data.cutoff_date,
      delivered_by_name: parsed.data.delivered_by_name || null,
      received_by_name: parsed.data.received_by_name || null,
      notes: parsed.data.notes || null,
      status: "EN_PROGRESO",
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  const items = DEFAULT_HANDOVER_ITEMS.map((item) => ({
    organization_id: ctx.organization!.id,
    handover_session_id: session.id,
    domain: item.domain,
    item_key: item.item_key,
    label: item.label,
    verification_status: "PENDIENTE" as const,
    comments: null,
    created_by: ctx.userId,
    updated_by: ctx.userId,
  }));

  const { error: itemsError } = await supabase
    .from("handover_items")
    .insert(items);
  if (itemsError) return { ok: false, error: itemsError.message };

  if (
    !ctx.organization.administrative_cutoff_date ||
    ctx.organization.administrative_cutoff_date !== parsed.data.cutoff_date
  ) {
    await supabase
      .from("organizations")
      .update({
        administrative_cutoff_date: parsed.data.cutoff_date,
        updated_by: ctx.userId,
      })
      .eq("id", ctx.organization.id);
  }

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "CREATE",
    entity: "handover_sessions",
    entity_id: session.id,
  });

  revalidatePath("/empalme");
  revalidatePath("/empresa");
  return { ok: true, id: session.id };
}

export async function updateHandoverSessionAction(
  sessionId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = handoverSessionSchema.safeParse({
    cutoff_date: formData.get("cutoff_date"),
    delivered_by_name: formData.get("delivered_by_name"),
    received_by_name: formData.get("received_by_name"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("handover_sessions")
    .select("status")
    .eq("id", sessionId)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();

  if (!existing) return { ok: false, error: "Sesión no encontrada" };
  if (existing.status === "CERRADO") {
    return { ok: false, error: "El empalme cerrado no se puede editar" };
  }

  const { error } = await supabase
    .from("handover_sessions")
    .update({
      cutoff_date: parsed.data.cutoff_date,
      delivered_by_name: parsed.data.delivered_by_name || null,
      received_by_name: parsed.data.received_by_name || null,
      notes: parsed.data.notes || null,
      updated_by: ctx.userId,
    })
    .eq("id", sessionId)
    .eq("organization_id", ctx.organization.id);

  if (error) return { ok: false, error: error.message };

  await supabase
    .from("organizations")
    .update({
      administrative_cutoff_date: parsed.data.cutoff_date,
      updated_by: ctx.userId,
    })
    .eq("id", ctx.organization.id);

  revalidatePath("/empalme");
  revalidatePath("/empresa");
  return { ok: true, id: sessionId };
}

export async function updateHandoverItemAction(
  itemId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = handoverItemSchema.safeParse({
    domain: formData.get("domain") || "otros",
    item_key: formData.get("item_key") || "item",
    label: formData.get("label") || "Ítem",
    amount: formData.get("amount"),
    verification_status: formData.get("verification_status"),
    comments: formData.get("comments"),
    source: formData.get("source"),
    metadata_json: formData.get("metadata_json"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const resolved = resolveAmountAndMetadata(parsed.data);
  if (!resolved.ok) return { ok: false, error: resolved.error };

  const status = parsed.data.verification_status;
  const supabase = await createClient();
  const { error } = await supabase
    .from("handover_items")
    .update({
      label: parsed.data.label.trim(),
      domain: parsed.data.domain,
      amount: resolved.amount,
      metadata: resolved.metadata,
      verification_status: status,
      comments: parsed.data.comments || null,
      source: parsed.data.source || null,
      validated_by: status === "CONFIRMADO" ? ctx.userId : null,
      validated_at: status === "CONFIRMADO" ? new Date().toISOString() : null,
      updated_by: ctx.userId,
    })
    .eq("id", itemId)
    .eq("organization_id", ctx.organization.id);

  if (error) return { ok: false, error: error.message };

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: status === "CONFIRMADO" ? "VALIDATE" : "UPDATE",
    entity: "handover_items",
    entity_id: itemId,
    new_values: parsed.data,
  });

  revalidatePath("/empalme");
  return { ok: true, id: itemId };
}

export async function createHandoverItemAction(
  sessionId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = createItemSchema.safeParse({
    domain: formData.get("domain"),
    label: formData.get("label"),
    amount: formData.get("amount"),
    verification_status: formData.get("verification_status") || "PENDIENTE",
    comments: formData.get("comments"),
    source: formData.get("source"),
    metadata_json: formData.get("metadata_json"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const resolved = resolveAmountAndMetadata(parsed.data);
  if (!resolved.ok) return { ok: false, error: resolved.error };

  const supabase = await createClient();
  const { data: session } = await supabase
    .from("handover_sessions")
    .select("id, status")
    .eq("id", sessionId)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();

  if (!session) return { ok: false, error: "Sesión no encontrada" };
  if (session.status === "CERRADO") {
    return { ok: false, error: "No se pueden agregar ítems a un empalme cerrado" };
  }

  const itemKey = `custom_${slugifyItemKey(parsed.data.label)}_${Date.now()}`;
  const { data, error } = await supabase
    .from("handover_items")
    .insert({
      organization_id: ctx.organization.id,
      handover_session_id: sessionId,
      domain: parsed.data.domain,
      item_key: itemKey,
      label: parsed.data.label.trim(),
      amount: resolved.amount,
      metadata: resolved.metadata,
      verification_status: parsed.data.verification_status,
      comments: parsed.data.comments || null,
      source: parsed.data.source || null,
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
    entity: "handover_items",
    entity_id: data.id,
    new_values: parsed.data,
  });

  revalidatePath("/empalme");
  return { ok: true, id: data.id };
}

export async function softDeleteHandoverItemAction(
  itemId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("handover_items")
    .update({
      deleted_at: new Date().toISOString(),
      updated_by: ctx.userId,
    })
    .eq("id", itemId)
    .eq("organization_id", ctx.organization.id);

  if (error) return { ok: false, error: error.message };

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "SOFT_DELETE",
    entity: "handover_items",
    entity_id: itemId,
  });

  revalidatePath("/empalme");
  return { ok: true, id: itemId };
}

/** Completa ítems del catálogo que falten en una sesión ya creada (sin borrar los actuales). */
export async function seedMissingHandoverDefaultsAction(
  sessionId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const supabase = await createClient();
  const { data: session } = await supabase
    .from("handover_sessions")
    .select("id, status")
    .eq("id", sessionId)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();

  if (!session) return { ok: false, error: "Sesión no encontrada" };
  if (session.status === "CERRADO") {
    return { ok: false, error: "Empalme cerrado" };
  }

  const { data: existing } = await supabase
    .from("handover_items")
    .select("item_key")
    .eq("handover_session_id", sessionId)
    .is("deleted_at", null);

  const existingKeys = new Set((existing ?? []).map((i) => i.item_key));
  const missing = DEFAULT_HANDOVER_ITEMS.filter(
    (item) => !existingKeys.has(item.item_key),
  );

  if (missing.length === 0) {
    return { ok: true, id: sessionId };
  }

  const { error } = await supabase.from("handover_items").insert(
    missing.map((item) => ({
      organization_id: ctx.organization!.id,
      handover_session_id: sessionId,
      domain: item.domain,
      item_key: item.item_key,
      label: item.label,
      verification_status: "PENDIENTE" as const,
      comments: null,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })),
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/empalme");
  return { ok: true, id: sessionId };
}

/** Quita preguntas viejas/duplicadas que confunden (ej. Activos administrativos). */
export async function cleanupObsoleteHandoverItemsAction(
  sessionId: string,
): Promise<ActionResult & { removed?: number }> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const supabase = await createClient();
  const { data: session } = await supabase
    .from("handover_sessions")
    .select("id, status")
    .eq("id", sessionId)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();

  if (!session) return { ok: false, error: "Sesión no encontrada" };
  if (session.status === "CERRADO") {
    return { ok: false, error: "Empalme cerrado" };
  }

  const { data: rows } = await supabase
    .from("handover_items")
    .select("id, item_key, label")
    .eq("handover_session_id", sessionId)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null);

  const ids = (rows ?? [])
    .filter((row) =>
      isRetiredHandoverItem({
        item_key: row.item_key,
        label: row.label,
      }),
    )
    .map((r) => r.id);

  if (ids.length === 0) {
    return { ok: true, id: sessionId, removed: 0 };
  }

  const { data: deleted, error } = await supabase
    .from("handover_items")
    .update({
      deleted_at: new Date().toISOString(),
      updated_by: ctx.userId,
    })
    .in("id", ids)
    .eq("organization_id", ctx.organization.id)
    .select("id");

  if (error) return { ok: false, error: error.message };

  revalidatePath("/empalme");
  return { ok: true, id: sessionId, removed: deleted?.length ?? ids.length };
}

export async function closeHandoverAction(
  sessionId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const notes = String(formData.get("closing_notes") || "") || null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("close_handover_session", {
    p_session_id: sessionId,
    p_closing_notes: notes,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/empalme");
  revalidatePath("/inicio");
  return { ok: true, id: (data as { id: string }).id };
}
