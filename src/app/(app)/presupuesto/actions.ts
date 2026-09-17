"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org-context";
import { budgetLineSchema, budgetSchema } from "@/validations/budget";
import type { ActionResult } from "../empresa/actions";

function emptyToNull(value: string | null | undefined) {
  if (value === undefined || value === null || String(value).trim() === "")
    return null;
  return String(value).trim();
}

function parseMoney(raw: string | null | undefined, fallback?: number) {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return fallback === undefined ? null : fallback;
  }
  const n = Number(String(raw).replace(/,/g, "").trim());
  if (Number.isNaN(n)) return null;
  return n;
}

export async function createBudgetAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = budgetSchema.safeParse({
    name: formData.get("name"),
    scenario: formData.get("scenario"),
    period_year: formData.get("period_year"),
    period_month: formData.get("period_month"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const year = Number.parseInt(parsed.data.period_year, 10);
  if (Number.isNaN(year) || year < 2000) return { ok: false, error: "Año inválido" };
  const monthRaw = emptyToNull(parsed.data.period_month);
  const month = monthRaw ? Number.parseInt(monthRaw, 10) : null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("budgets")
    .insert({
      organization_id: ctx.organization.id,
      name: parsed.data.name.trim(),
      scenario: parsed.data.scenario,
      period_year: year,
      period_month: month,
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
    entity: "budgets",
    entity_id: data.id,
  });

  revalidatePath("/presupuesto");
  return { ok: true, id: data.id };
}

export async function createBudgetLineAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = budgetLineSchema.safeParse({
    budget_id: formData.get("budget_id"),
    category: formData.get("category"),
    budgeted_amount: formData.get("budgeted_amount"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const amount = parseMoney(parsed.data.budgeted_amount);
  if (amount === null || amount < 0) return { ok: false, error: "Monto inválido" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("budget_lines")
    .insert({
      organization_id: ctx.organization.id,
      budget_id: parsed.data.budget_id,
      category: parsed.data.category.trim(),
      budgeted_amount: amount,
      notes: emptyToNull(parsed.data.notes),
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/presupuesto");
  return { ok: true, id: data.id };
}

export async function softDeleteBudgetAction(
  budgetId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("budgets")
    .update({
      deleted_at: new Date().toISOString(),
      updated_by: ctx.userId,
    })
    .eq("id", budgetId)
    .eq("organization_id", ctx.organization.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/presupuesto");
  return { ok: true, id: budgetId };
}
