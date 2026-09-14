"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org-context";
import {
  handoverItemSchema,
  handoverSessionSchema,
} from "@/validations/organization";
import type { ActionResult } from "../empresa/actions";

const DEFAULT_HANDOVER_ITEMS = [
  {
    domain: "tesoreria",
    item_key: "liquidez",
    label: "Liquidez inicial (bancos + caja)",
  },
  {
    domain: "cxc",
    item_key: "cuentas_por_cobrar",
    label: "Cuentas por cobrar",
  },
  {
    domain: "inventario",
    item_key: "inventario_apertura",
    label: "Inventario inicial (resumen)",
  },
  { domain: "activos", item_key: "activos", label: "Activos administrativos" },
  {
    domain: "cxp",
    item_key: "cuentas_por_pagar",
    label: "Cuentas por pagar",
  },
  {
    domain: "prestamos",
    item_key: "deuda_socios",
    label: "Deuda con socios",
  },
  {
    domain: "tributario",
    item_key: "obligaciones_tributarias",
    label: "Obligaciones tributarias",
  },
  {
    domain: "personal",
    item_key: "costo_personal",
    label: "Costo mensual de personal",
  },
] as const;

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
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
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

export async function updateHandoverItemAction(
  itemId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = handoverItemSchema.safeParse({
    domain: formData.get("domain") || "general",
    item_key: formData.get("item_key") || "item",
    label: formData.get("label") || "Ítem",
    amount: formData.get("amount"),
    verification_status: formData.get("verification_status"),
    comments: formData.get("comments"),
    source: formData.get("source"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const amountRaw = parsed.data.amount?.trim();
  const amount =
    amountRaw && amountRaw !== ""
      ? Number(amountRaw.replace(/,/g, ""))
      : null;

  if (amountRaw && Number.isNaN(amount)) {
    return { ok: false, error: "Monto inválido" };
  }

  const status = parsed.data.verification_status;
  const { error } = await supabase
    .from("handover_items")
    .update({
      amount,
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
