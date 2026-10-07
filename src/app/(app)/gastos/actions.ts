"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess } from "@/lib/permissions";
import { todayInBogota } from "@/lib/dates";
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

function revalidateExpensePaths() {
  revalidatePath("/gastos");
  revalidatePath("/gastos/categorias");
  revalidatePath("/solicitudes-pago");
  revalidatePath("/inicio");
}

function canManageExpenseCategories(
  ctx: NonNullable<Awaited<ReturnType<typeof getOrgContext>>>,
) {
  return (
    ctxCanAccess(ctx, "gastos.categorias") ||
    ctxCanAccess(ctx, "gastos") ||
    ctxCanAccess(ctx, "gastos.registro")
  );
}

export async function createExpenseCategoryAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!canManageExpenseCategories(ctx)) {
    return { ok: false, error: "Sin permiso para gestionar categorías de gastos" };
  }

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
      is_active: true,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidateExpensePaths();
  return { ok: true, id: data.id };
}

export async function updateExpenseCategoryAction(
  categoryId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!canManageExpenseCategories(ctx)) {
    return { ok: false, error: "Sin permiso para gestionar categorías de gastos" };
  }

  const parsed = expenseCategorySchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("expense_categories")
    .update({
      code: parsed.data.code.trim().toUpperCase(),
      name: parsed.data.name.trim(),
      is_active: true,
    })
    .eq("id", categoryId)
    .eq("organization_id", ctx.organization.id);

  if (error) return { ok: false, error: error.message };
  revalidateExpensePaths();
  return { ok: true, id: categoryId };
}

export async function softDeleteExpenseCategoryAction(
  categoryId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!canManageExpenseCategories(ctx)) {
    return { ok: false, error: "Sin permiso para gestionar categorías de gastos" };
  }

  const supabase = await createClient();

  const { count, error: countError } = await supabase
    .from("expenses")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", ctx.organization.id)
    .eq("category_id", categoryId)
    .is("deleted_at", null);

  if (countError) return { ok: false, error: countError.message };
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `No se puede eliminar: hay ${count} gasto(s) usando esta categoría. Anule o reclasifique esos gastos primero.`,
    };
  }

  // Sin usos: borrado real para que desaparezca del maestro.
  const { error } = await supabase
    .from("expense_categories")
    .delete()
    .eq("id", categoryId)
    .eq("organization_id", ctx.organization.id);

  if (error) return { ok: false, error: error.message };
  revalidateExpensePaths();
  return { ok: true, id: categoryId };
}

export async function createExpenseAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = expenseSchema.safeParse({
    expense_date: formData.get("expense_date") || todayInBogota(),
    supplier_id: formData.get("supplier_id"),
    category_id: formData.get("category_id"),
    concept: formData.get("concept"),
    amount: formData.get("amount"),
    tax_amount: "0",
    nature: "UNICO",
    criticality: "ESENCIAL",
    status: "APROBADO",
    shared_service: "false",
    document_type: formData.get("document_type") || "FACTURA",
    document_number: formData.get("document_number"),
    due_date: formData.get("due_date"),
    priority: formData.get("priority") || "NORMAL",
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const amount = parseMoney(parsed.data.amount);
  const tax = parseMoney(parsed.data.tax_amount, 0) ?? 0;
  if (amount === null || amount <= 0) return { ok: false, error: "Monto inválido" };

  const total = amount + tax;
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
      total_amount: total,
      nature: "UNICO",
      criticality: "ESENCIAL",
      status: "APROBADO",
      shared_service: false,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  const { error: payError } = await supabase.from("payment_requests").insert({
    organization_id: ctx.organization.id,
    source: "GASTO",
    status: "EN_REVISION",
    priority: parsed.data.priority,
    concept: parsed.data.concept.trim(),
    amount: total,
    requested_at: parsed.data.expense_date,
    due_date: emptyToNull(parsed.data.due_date),
    supplier_id: emptyToNull(parsed.data.supplier_id),
    expense_id: data.id,
    document_type: emptyToNull(parsed.data.document_type) || "FACTURA",
    document_number: emptyToNull(parsed.data.document_number),
    issue_date: parsed.data.expense_date,
    notes: emptyToNull(parsed.data.notes),
    requested_by: ctx.userId,
    created_by: ctx.userId,
    updated_by: ctx.userId,
  });
  if (payError) return { ok: false, error: payError.message };

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "CREATE",
    entity: "expenses",
    entity_id: data.id,
    new_values: { payment_request_source: "GASTO", total },
  });

  revalidateExpensePaths();
  return { ok: true, id: data.id };
}

export async function updateExpenseStatusAction(
  expenseId: string,
  status: "BORRADOR" | "APROBADO" | "PAGADO" | "ANULADO",
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  if (status === "PAGADO") {
    return {
      ok: false,
      error:
        "El pago se registra en Solicitudes de pago. Al pagar allí se marca este gasto como pagado.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("expenses")
    .update({ status, updated_by: ctx.userId })
    .eq("id", expenseId)
    .eq("organization_id", ctx.organization.id);

  if (error) return { ok: false, error: error.message };
  revalidateExpensePaths();
  return { ok: true, id: expenseId };
}

export async function softDeleteExpenseAction(
  expenseId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("expenses")
    .update({
      deleted_at: now,
      status: "ANULADO",
      updated_by: ctx.userId,
    })
    .eq("id", expenseId)
    .eq("organization_id", ctx.organization.id);
  if (error) return { ok: false, error: error.message };

  await supabase
    .from("payment_requests")
    .update({
      status: "ANULADA",
      updated_by: ctx.userId,
    })
    .eq("expense_id", expenseId)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .neq("status", "PAGADA")
    .neq("status", "ANULADA");

  revalidateExpensePaths();
  return { ok: true, id: expenseId };
}
