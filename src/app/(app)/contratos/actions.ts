"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org-context";
import {
  contractSchema,
  sstRecordSchema,
  taxObligationSchema,
} from "@/validations/compliance";
import type { ActionResult } from "../empresa/actions";

function emptyToNull(value: string | null | undefined) {
  if (value === undefined || value === null || String(value).trim() === "")
    return null;
  return String(value).trim();
}

function parseMoney(raw: string | null | undefined) {
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const n = Number(String(raw).replace(/,/g, "").trim());
  if (Number.isNaN(n)) return null;
  return n;
}

function parseIntOrNull(raw: string | null | undefined) {
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const n = Number.parseInt(String(raw).trim(), 10);
  return Number.isNaN(n) ? null : n;
}

export async function createContractAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = contractSchema.safeParse({
    counterparty: formData.get("counterparty"),
    contract_type: formData.get("contract_type"),
    start_date: formData.get("start_date"),
    end_date: formData.get("end_date"),
    auto_renewal: formData.get("auto_renewal") || "false",
    notice_days: formData.get("notice_days"),
    cost_amount: formData.get("cost_amount"),
    periodicity: formData.get("periodicity"),
    responsible_name: formData.get("responsible_name"),
    status: formData.get("status") || "ACTIVO",
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contracts")
    .insert({
      organization_id: ctx.organization.id,
      counterparty: parsed.data.counterparty.trim(),
      contract_type: parsed.data.contract_type.trim(),
      start_date: emptyToNull(parsed.data.start_date),
      end_date: emptyToNull(parsed.data.end_date),
      auto_renewal: parsed.data.auto_renewal === "true",
      notice_days: parseIntOrNull(parsed.data.notice_days),
      cost_amount: parseMoney(parsed.data.cost_amount),
      periodicity: emptyToNull(parsed.data.periodicity),
      responsible_name: emptyToNull(parsed.data.responsible_name),
      status: emptyToNull(parsed.data.status) || "ACTIVO",
      notes: emptyToNull(parsed.data.notes),
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
    entity: "contracts",
    entity_id: data.id,
  });

  revalidatePath("/contratos");
  return { ok: true, id: data.id };
}

export async function softDeleteContractAction(
  contractId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("contracts")
    .update({
      deleted_at: new Date().toISOString(),
      status: "INACTIVO",
      updated_by: ctx.userId,
    })
    .eq("id", contractId)
    .eq("organization_id", ctx.organization.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/contratos");
  return { ok: true, id: contractId };
}

export async function createTaxObligationAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = taxObligationSchema.safeParse({
    obligation_type: formData.get("obligation_type"),
    period: formData.get("period"),
    due_date: formData.get("due_date"),
    filed_date: formData.get("filed_date"),
    paid_date: formData.get("paid_date"),
    declared_amount: formData.get("declared_amount"),
    paid_amount: formData.get("paid_amount"),
    balance_amount: formData.get("balance_amount"),
    status: formData.get("status") || "PENDIENTE",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tax_obligations")
    .insert({
      organization_id: ctx.organization.id,
      obligation_type: parsed.data.obligation_type.trim(),
      period: emptyToNull(parsed.data.period),
      due_date: emptyToNull(parsed.data.due_date),
      filed_date: emptyToNull(parsed.data.filed_date),
      paid_date: emptyToNull(parsed.data.paid_date),
      declared_amount: parseMoney(parsed.data.declared_amount),
      paid_amount: parseMoney(parsed.data.paid_amount),
      balance_amount: parseMoney(parsed.data.balance_amount),
      status: parsed.data.status,
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
    entity: "tax_obligations",
    entity_id: data.id,
  });

  revalidatePath("/tributario");
  return { ok: true, id: data.id };
}

export async function updateTaxStatusAction(
  id: string,
  status:
    | "PENDIENTE"
    | "PRESENTADA"
    | "PAGADA"
    | "VENCIDA"
    | "EN_ACUERDO"
    | "NO_APLICA",
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("tax_obligations")
    .update({ status, updated_by: ctx.userId })
    .eq("id", id)
    .eq("organization_id", ctx.organization.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/tributario");
  return { ok: true, id };
}

export async function softDeleteTaxAction(id: string): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("tax_obligations")
    .update({
      deleted_at: new Date().toISOString(),
      updated_by: ctx.userId,
    })
    .eq("id", id)
    .eq("organization_id", ctx.organization.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/tributario");
  return { ok: true, id };
}

export async function upsertSstRecordAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = sstRecordSchema.safeParse({
    has_sg_sst: formData.get("has_sg_sst"),
    responsible_name: formData.get("responsible_name"),
    provider_name: formData.get("provider_name"),
    monthly_cost: formData.get("monthly_cost"),
    annual_cost: formData.get("annual_cost"),
    arl: formData.get("arl"),
    documentation_status: formData.get("documentation_status"),
    last_review_date: formData.get("last_review_date"),
    next_review_date: formData.get("next_review_date"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("sst_records")
    .select("id")
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const payload = {
    has_sg_sst: emptyToNull(parsed.data.has_sg_sst),
    responsible_name: emptyToNull(parsed.data.responsible_name),
    provider_name: emptyToNull(parsed.data.provider_name),
    monthly_cost: parseMoney(parsed.data.monthly_cost),
    annual_cost: parseMoney(parsed.data.annual_cost),
    arl: emptyToNull(parsed.data.arl),
    documentation_status: emptyToNull(parsed.data.documentation_status),
    last_review_date: emptyToNull(parsed.data.last_review_date),
    next_review_date: emptyToNull(parsed.data.next_review_date),
    notes: emptyToNull(parsed.data.notes),
  };

  if (existing) {
    const { error } = await supabase
      .from("sst_records")
      .update(payload)
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/sst");
    return { ok: true, id: existing.id };
  }

  const { data, error } = await supabase
    .from("sst_records")
    .insert({
      organization_id: ctx.organization.id,
      ...payload,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/sst");
  return { ok: true, id: data.id };
}
