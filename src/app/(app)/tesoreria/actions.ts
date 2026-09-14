"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org-context";
import {
  bankAccountSchema,
  bankBalanceSnapshotSchema,
} from "@/validations/treasury";
import type { ActionResult } from "../empresa/actions";

function emptyToNull(value: string | null | undefined) {
  if (value === undefined || value === null || value.trim() === "") return null;
  return value.trim();
}

function parseMoney(raw: string | null | undefined): number | null {
  if (raw === undefined || raw === null || raw.trim() === "") return null;
  const n = Number(raw.replace(/,/g, "").trim());
  if (Number.isNaN(n)) return null;
  return n;
}

export async function createBankAccountAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) {
    return { ok: false, error: "Primero configura la empresa" };
  }

  const parsed = bankAccountSchema.safeParse({
    bank_name: formData.get("bank_name"),
    account_kind: formData.get("account_kind"),
    account_type: formData.get("account_type"),
    masked_number: formData.get("masked_number"),
    holder_name: formData.get("holder_name"),
    is_active: formData.get("is_active") || "true",
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bank_accounts")
    .insert({
      organization_id: ctx.organization.id,
      bank_name: parsed.data.bank_name.trim(),
      account_kind: parsed.data.account_kind,
      account_type: emptyToNull(parsed.data.account_type),
      masked_number: emptyToNull(parsed.data.masked_number),
      holder_name: emptyToNull(parsed.data.holder_name),
      currency: "COP",
      is_active: parsed.data.is_active !== "false",
      notes: emptyToNull(parsed.data.notes),
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  // Saldo inicial opcional al crear
  const cutoff =
    emptyToNull(String(formData.get("cutoff_date") || "")) ||
    ctx.organization.administrative_cutoff_date;
  const openingRaw = String(formData.get("opening_balance") || "");
  if (cutoff && openingRaw.trim() !== "") {
    const opening = parseMoney(openingRaw);
    if (opening === null) {
      return { ok: false, error: "Saldo inicial inválido" };
    }
    const status =
      (String(formData.get("verification_status") || "PENDIENTE") as
        | "CONFIRMADO"
        | "DECLARADO"
        | "PENDIENTE") || "PENDIENTE";

    const { error: snapError } = await supabase
      .from("bank_balance_snapshots")
      .insert({
        organization_id: ctx.organization.id,
        bank_account_id: data.id,
        cutoff_date: cutoff,
        opening_balance: opening,
        verification_status: status,
        comments: emptyToNull(String(formData.get("comments") || "")),
        source: emptyToNull(String(formData.get("source") || "")),
        validated_by: status === "CONFIRMADO" ? ctx.userId : null,
        validated_at:
          status === "CONFIRMADO" ? new Date().toISOString() : null,
        created_by: ctx.userId,
        updated_by: ctx.userId,
      });
    if (snapError) return { ok: false, error: snapError.message };
  }

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "CREATE",
    entity: "bank_accounts",
    entity_id: data.id,
    new_values: parsed.data,
  });

  revalidatePath("/tesoreria");
  revalidatePath("/empalme");
  revalidatePath("/inicio");
  return { ok: true, id: data.id };
}

export async function updateBankAccountAction(
  accountId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = bankAccountSchema.safeParse({
    bank_name: formData.get("bank_name"),
    account_kind: formData.get("account_kind"),
    account_type: formData.get("account_type"),
    masked_number: formData.get("masked_number"),
    holder_name: formData.get("holder_name"),
    is_active: formData.get("is_active") || "true",
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("bank_accounts")
    .update({
      bank_name: parsed.data.bank_name.trim(),
      account_kind: parsed.data.account_kind,
      account_type: emptyToNull(parsed.data.account_type),
      masked_number: emptyToNull(parsed.data.masked_number),
      holder_name: emptyToNull(parsed.data.holder_name),
      is_active: parsed.data.is_active !== "false",
      notes: emptyToNull(parsed.data.notes),
      updated_by: ctx.userId,
    })
    .eq("id", accountId)
    .eq("organization_id", ctx.organization.id);

  if (error) return { ok: false, error: error.message };

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "UPDATE",
    entity: "bank_accounts",
    entity_id: accountId,
    new_values: parsed.data,
  });

  revalidatePath("/tesoreria");
  return { ok: true, id: accountId };
}

export async function softDeleteBankAccountAction(
  accountId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("bank_accounts")
    .update({
      deleted_at: now,
      is_active: false,
      updated_by: ctx.userId,
    })
    .eq("id", accountId)
    .eq("organization_id", ctx.organization.id);

  if (error) return { ok: false, error: error.message };

  await supabase
    .from("bank_balance_snapshots")
    .update({ deleted_at: now, updated_by: ctx.userId })
    .eq("bank_account_id", accountId)
    .eq("organization_id", ctx.organization.id);

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "SOFT_DELETE",
    entity: "bank_accounts",
    entity_id: accountId,
  });

  revalidatePath("/tesoreria");
  revalidatePath("/inicio");
  return { ok: true, id: accountId };
}

export async function upsertBankBalanceSnapshotAction(
  accountId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = bankBalanceSnapshotSchema.safeParse({
    cutoff_date: formData.get("cutoff_date"),
    opening_balance: formData.get("opening_balance"),
    verification_status: formData.get("verification_status") || "PENDIENTE",
    comments: formData.get("comments"),
    source: formData.get("source"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const opening = parseMoney(parsed.data.opening_balance);
  if (opening === null) return { ok: false, error: "Saldo inválido" };

  const supabase = await createClient();
  const status = parsed.data.verification_status;

  const { data: existing } = await supabase
    .from("bank_balance_snapshots")
    .select("id")
    .eq("bank_account_id", accountId)
    .eq("cutoff_date", parsed.data.cutoff_date)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("bank_balance_snapshots")
      .update({
        opening_balance: opening,
        verification_status: status,
        comments: emptyToNull(parsed.data.comments),
        source: emptyToNull(parsed.data.source),
        validated_by: status === "CONFIRMADO" ? ctx.userId : null,
        validated_at:
          status === "CONFIRMADO" ? new Date().toISOString() : null,
        updated_by: ctx.userId,
      })
      .eq("id", existing.id)
      .eq("organization_id", ctx.organization.id);

    if (error) return { ok: false, error: error.message };

    await supabase.from("audit_logs").insert({
      organization_id: ctx.organization.id,
      user_id: ctx.userId,
      action: status === "CONFIRMADO" ? "VALIDATE" : "UPDATE",
      entity: "bank_balance_snapshots",
      entity_id: existing.id,
      new_values: parsed.data,
    });

    revalidatePath("/tesoreria");
    revalidatePath("/inicio");
    revalidatePath("/empalme");
    return { ok: true, id: existing.id };
  }

  const { data, error } = await supabase
    .from("bank_balance_snapshots")
    .insert({
      organization_id: ctx.organization.id,
      bank_account_id: accountId,
      cutoff_date: parsed.data.cutoff_date,
      opening_balance: opening,
      verification_status: status,
      comments: emptyToNull(parsed.data.comments),
      source: emptyToNull(parsed.data.source),
      validated_by: status === "CONFIRMADO" ? ctx.userId : null,
      validated_at: status === "CONFIRMADO" ? new Date().toISOString() : null,
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
    entity: "bank_balance_snapshots",
    entity_id: data.id,
    new_values: parsed.data,
  });

  revalidatePath("/tesoreria");
  revalidatePath("/inicio");
  revalidatePath("/empalme");
  return { ok: true, id: data.id };
}
