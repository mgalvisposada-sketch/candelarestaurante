"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org-context";
import {
  shareholderAccountSchema,
  shareholderSchema,
  shareholderTransactionSchema,
} from "@/validations/shareholders";
import type { ActionResult } from "../empresa/actions";

function emptyToNull(value: string | null | undefined) {
  if (value === undefined || value === null || value.trim() === "") return null;
  return value.trim();
}

function parseMoney(raw: string | null | undefined, fallback = 0): number | null {
  if (raw === undefined || raw === null || raw.trim() === "") return fallback;
  const n = Number(raw.replace(/,/g, "").trim());
  if (Number.isNaN(n)) return null;
  return n;
}

function parsePct(raw: string): number | null {
  const n = Number(raw.replace(/,/g, "").trim());
  if (Number.isNaN(n) || n < 0) return null;
  return n;
}

export async function createShareholderAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Primero configura la empresa" };

  const parsed = shareholderSchema.safeParse({
    full_name: formData.get("full_name"),
    id_type: formData.get("id_type"),
    id_number: formData.get("id_number"),
    participation_pct: formData.get("participation_pct"),
    entry_date: formData.get("entry_date"),
    registered_capital: formData.get("registered_capital"),
    notes: formData.get("notes"),
    status: formData.get("status") || "ACTIVO",
    verification_status: formData.get("verification_status") || "PENDIENTE",
    comments: formData.get("comments"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const pct = parsePct(parsed.data.participation_pct);
  const capital = parseMoney(parsed.data.registered_capital, 0);
  if (pct === null) return { ok: false, error: "Participación inválida" };
  if (capital === null) return { ok: false, error: "Capital registrado inválido" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shareholders")
    .insert({
      organization_id: ctx.organization.id,
      full_name: parsed.data.full_name.trim(),
      id_type: parsed.data.id_type,
      id_number: parsed.data.id_number.trim(),
      participation_pct: pct,
      entry_date: emptyToNull(parsed.data.entry_date),
      registered_capital: capital,
      notes: emptyToNull(parsed.data.notes),
      status: parsed.data.status,
      verification_status: parsed.data.verification_status,
      comments: emptyToNull(parsed.data.comments),
      validated_by:
        parsed.data.verification_status === "CONFIRMADO" ? ctx.userId : null,
      validated_at:
        parsed.data.verification_status === "CONFIRMADO"
          ? new Date().toISOString()
          : null,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  const opening = parseMoney(String(formData.get("opening_balance") || "0"), 0);
  if (opening === null) return { ok: false, error: "Saldo inicial de cuenta inválido" };

  const { error: accountError } = await supabase.from("shareholder_accounts").insert({
    organization_id: ctx.organization.id,
    shareholder_id: data.id,
    opening_balance: opening,
    notes: emptyToNull(String(formData.get("account_notes") || "")),
    created_by: ctx.userId,
    updated_by: ctx.userId,
  });
  if (accountError) return { ok: false, error: accountError.message };

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "CREATE",
    entity: "shareholders",
    entity_id: data.id,
    new_values: parsed.data,
  });

  revalidatePath("/socios");
  return { ok: true, id: data.id };
}

export async function updateShareholderAction(
  shareholderId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = shareholderSchema.safeParse({
    full_name: formData.get("full_name"),
    id_type: formData.get("id_type"),
    id_number: formData.get("id_number"),
    participation_pct: formData.get("participation_pct"),
    entry_date: formData.get("entry_date"),
    registered_capital: formData.get("registered_capital"),
    notes: formData.get("notes"),
    status: formData.get("status") || "ACTIVO",
    verification_status: formData.get("verification_status") || "PENDIENTE",
    comments: formData.get("comments"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const pct = parsePct(parsed.data.participation_pct);
  const capital = parseMoney(parsed.data.registered_capital, 0);
  if (pct === null) return { ok: false, error: "Participación inválida" };
  if (capital === null) return { ok: false, error: "Capital registrado inválido" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("shareholders")
    .update({
      full_name: parsed.data.full_name.trim(),
      id_type: parsed.data.id_type,
      id_number: parsed.data.id_number.trim(),
      participation_pct: pct,
      entry_date: emptyToNull(parsed.data.entry_date),
      registered_capital: capital,
      notes: emptyToNull(parsed.data.notes),
      status: parsed.data.status,
      verification_status: parsed.data.verification_status,
      comments: emptyToNull(parsed.data.comments),
      validated_by:
        parsed.data.verification_status === "CONFIRMADO" ? ctx.userId : null,
      validated_at:
        parsed.data.verification_status === "CONFIRMADO"
          ? new Date().toISOString()
          : null,
      updated_by: ctx.userId,
    })
    .eq("id", shareholderId)
    .eq("organization_id", ctx.organization.id);

  if (error) return { ok: false, error: error.message };

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action:
      parsed.data.verification_status === "CONFIRMADO" ? "VALIDATE" : "UPDATE",
    entity: "shareholders",
    entity_id: shareholderId,
    new_values: parsed.data,
  });

  revalidatePath("/socios");
  return { ok: true, id: shareholderId };
}

export async function softDeleteShareholderAction(
  shareholderId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const supabase = await createClient();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("shareholders")
    .update({ deleted_at: now, updated_by: ctx.userId, status: "INACTIVO" })
    .eq("id", shareholderId)
    .eq("organization_id", ctx.organization.id);

  if (error) return { ok: false, error: error.message };

  await supabase
    .from("shareholder_accounts")
    .update({ deleted_at: now, updated_by: ctx.userId })
    .eq("shareholder_id", shareholderId)
    .eq("organization_id", ctx.organization.id);

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "SOFT_DELETE",
    entity: "shareholders",
    entity_id: shareholderId,
  });

  revalidatePath("/socios");
  return { ok: true, id: shareholderId };
}

export async function updateShareholderAccountAction(
  accountId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = shareholderAccountSchema.safeParse({
    opening_balance: formData.get("opening_balance"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const opening = parseMoney(parsed.data.opening_balance);
  if (opening === null) return { ok: false, error: "Saldo inicial inválido" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("shareholder_accounts")
    .update({
      opening_balance: opening,
      notes: emptyToNull(parsed.data.notes),
      updated_by: ctx.userId,
    })
    .eq("id", accountId)
    .eq("organization_id", ctx.organization.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/socios");
  return { ok: true, id: accountId };
}

export async function addShareholderTransactionAction(
  accountId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = shareholderTransactionSchema.safeParse({
    transaction_date: formData.get("transaction_date"),
    description: formData.get("description"),
    side: formData.get("side"),
    amount: formData.get("amount"),
    nature: formData.get("nature") || "OTRO",
    reference: formData.get("reference"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const amount = parseMoney(parsed.data.amount);
  if (amount === null || amount <= 0) {
    return { ok: false, error: "Monto inválido" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("shareholder_transactions").insert({
    organization_id: ctx.organization.id,
    shareholder_account_id: accountId,
    transaction_date: parsed.data.transaction_date,
    description: emptyToNull(parsed.data.description),
    debit: parsed.data.side === "debit" ? amount : 0,
    credit: parsed.data.side === "credit" ? amount : 0,
    nature: parsed.data.nature,
    reference: emptyToNull(parsed.data.reference),
    created_by: ctx.userId,
    updated_by: ctx.userId,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/socios");
  return { ok: true };
}
