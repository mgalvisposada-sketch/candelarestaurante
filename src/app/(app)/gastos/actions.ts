"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org-context";
import { expenseCategorySchema, expenseSchema } from "@/validations/expenses";
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

export async function createExpenseCategoryAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = expenseCategorySchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expense_categories")
    .insert({
      organization_id: ctx.organization.id,
      code: parsed.data.code.trim().toUpperCase(),
      name: parsed.data.name.trim(),
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/gastos");
  return { ok: true, id: data.id };
}

export async function createExpenseAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = expenseSchema.safeParse({
    expense_date: formData.get("expense_date"),
    supplier_id: formData.get("supplier_id"),
    category_id: formData.get("category_id"),
    concept: formData.get("concept"),
    amount: formData.get("amount"),
    tax_amount: formData.get("tax_amount") || "0",
    nature: formData.get("nature") || "UNICO",
    criticality: formData.get("criticality") || "ESENCIAL",
    status: formData.get("status") || "BORRADOR",
    cost_center: formData.get("cost_center"),
    period: formData.get("period"),
    payment_method: formData.get("payment_method"),
    bank_account_id: formData.get("bank_account_id"),
    shared_service: formData.get("shared_service") || "false",
    allocation_percentage: formData.get("allocation_percentage"),
    allocated_amount: formData.get("allocated_amount"),
    allocation_reason: formData.get("allocation_reason"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const amount = parseMoney(parsed.data.amount);
  const tax = parseMoney(parsed.data.tax_amount, 0) ?? 0;
  if (amount === null || amount < 0) return { ok: false, error: "Monto inválido" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expenses")
    .insert({
      organization_id: ctx.organization.id,
      expense_date: parsed.data.expense_date,
      supplier_id: emptyToNull(parsed.data.supplier_id),
      category_id: emptyToNull(parsed.data.category_id),
      concept: parsed.data.concept.trim(),
      amount,
      tax_amount: tax,
      total_amount: amount + tax,
      nature: parsed.data.nature,
      criticality: parsed.data.criticality,
      status: parsed.data.status,
      cost_center: emptyToNull(parsed.data.cost_center),
      period: emptyToNull(parsed.data.period),
      payment_method: emptyToNull(parsed.data.payment_method),
      bank_account_id: emptyToNull(parsed.data.bank_account_id),
      shared_service: parsed.data.shared_service === "true",
      allocation_percentage: parseMoney(parsed.data.allocation_percentage),
      allocated_amount: parseMoney(parsed.data.allocated_amount),
      allocation_reason: emptyToNull(parsed.data.allocation_reason),
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
    entity: "expenses",
    entity_id: data.id,
  });

  revalidatePath("/gastos");
  revalidatePath("/inicio");
  return { ok: true, id: data.id };
}

export async function updateExpenseStatusAction(
  expenseId: string,
  status: "BORRADOR" | "APROBADO" | "PAGADO" | "ANULADO",
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("expenses")
    .update({ status, updated_by: ctx.userId })
    .eq("id", expenseId)
    .eq("organization_id", ctx.organization.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/gastos");
  revalidatePath("/inicio");
  return { ok: true, id: expenseId };
}

export async function softDeleteExpenseAction(
  expenseId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("expenses")
    .update({
      deleted_at: new Date().toISOString(),
      status: "ANULADO",
      updated_by: ctx.userId,
    })
    .eq("id", expenseId)
    .eq("organization_id", ctx.organization.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/gastos");
  return { ok: true, id: expenseId };
}
