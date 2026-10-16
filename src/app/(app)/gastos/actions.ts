"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess } from "@/lib/permissions";
import { todayInBogota } from "@/lib/dates";
import { money } from "@/lib/money";
import {
  biweeklyRange,
  isShiftDayContractor,
} from "@/lib/payroll";
import {
  expenseCategorySchema,
  expenseSchema,
  shiftLiquidationExpenseSchema,
  tipLiquidationExpenseSchema,
} from "@/validations/expenses";
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

/** Solo administración (permiso dedicado o liquidación de personal). */
function canCreateShiftLiquidation(
  ctx: NonNullable<Awaited<ReturnType<typeof getOrgContext>>>,
) {
  return (
    ctxCanAccess(ctx, "gastos.liquidacion-turno") ||
    ctxCanAccess(ctx, "personal.liquidacion")
  );
}

function canCreateTipLiquidation(
  ctx: NonNullable<Awaited<ReturnType<typeof getOrgContext>>>,
) {
  return (
    ctxCanAccess(ctx, "gastos.liquidacion-propina") ||
    ctxCanAccess(ctx, "gastos.registro") ||
    ctxCanAccess(ctx, "gastos") ||
    ctxCanAccess(ctx, "tesoreria")
  );
}

/**
 * Alta rápida de proveedor de gastos desde el formulario de Gastos
 * (sin salir del flujo de captura).
 */
export async function quickCreateExpenseSupplierAction(
  formData: FormData,
): Promise<ActionResult & { name?: string }> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const can =
    ctxCanAccess(ctx, "proveedores.crear") ||
    ctxCanAccess(ctx, "proveedores") ||
    ctxCanAccess(ctx, "gastos.registro") ||
    ctxCanAccess(ctx, "gastos");
  if (!can) {
    return { ok: false, error: "Sin permiso para crear proveedor de gastos" };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) {
    return { ok: false, error: "El nombre del proveedor es obligatorio" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      organization_id: ctx.organization.id,
      name,
      tax_id: emptyToNull(String(formData.get("tax_id") ?? "")),
      is_active: true,
      is_purchase_supplier: false,
      is_expense_supplier: true,
      purchase_payment_terms: "PREPAGO",
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id, name")
    .single();

  if (error) return { ok: false, error: error.message };

  await supabase.from("accounts_payable").insert({
    organization_id: ctx.organization.id,
    supplier_id: data.id,
    priority: "POR_VALIDAR",
    created_by: ctx.userId,
    updated_by: ctx.userId,
  });

  revalidateExpensePaths();
  revalidatePath("/proveedores");
  revalidatePath("/proveedores/maestro");
  return { ok: true, id: data.id, name: data.name as string };
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
      expense_kind: "OPERATIVO",
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
    new_values: {
      payment_request_source: "GASTO",
      expense_kind: "OPERATIVO",
      total,
    },
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

  const { data: existing, error: loadErr } = await supabase
    .from("expenses")
    .select("id, expense_kind, employee_id, shift_dates, status")
    .eq("id", expenseId)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (loadErr) return { ok: false, error: loadErr.message };
  if (!existing) return { ok: false, error: "Gasto no encontrado" };
  if (existing.status === "PAGADO") {
    return { ok: false, error: "No se puede anular un gasto ya pagado" };
  }

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

  // Liberar días del prestador para poder volver a liquidarlos.
  if (
    existing.expense_kind === "LIQUIDACION_TURNO" &&
    existing.employee_id &&
    Array.isArray(existing.shift_dates) &&
    existing.shift_dates.length > 0
  ) {
    await supabase
      .from("shift_novelties")
      .update({ status: "ANULADA", updated_by: ctx.userId })
      .eq("organization_id", ctx.organization.id)
      .eq("employee_id", existing.employee_id)
      .eq("novelty_type", "TURNO_LABORADO")
      .in("novelty_date", existing.shift_dates as string[])
      .is("deleted_at", null)
      .neq("status", "ANULADA");
  }

  revalidateExpensePaths();
  revalidatePath("/personal/novedades");
  return { ok: true, id: expenseId };
}

/** Solo administración: marca días del prestador, crea el gasto y lo envía a aval/pago. */
export async function createShiftLiquidationExpenseAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!canCreateShiftLiquidation(ctx)) {
    return {
      ok: false,
      error: "Sin permiso para liquidar prestadores por turno",
    };
  }

  const parsed = shiftLiquidationExpenseSchema.safeParse({
    employee_id: formData.get("employee_id"),
    period_year: formData.get("period_year"),
    period_month: formData.get("period_month"),
    period_half: formData.get("period_half"),
    dates: formData.getAll("dates").map(String),
    expense_date: formData.get("expense_date") || todayInBogota(),
    category_id: formData.get("category_id"),
    priority: formData.get("priority") || "NORMAL",
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const half = parsed.data.period_half as 1 | 2;
  const range = biweeklyRange(
    parsed.data.period_year,
    parsed.data.period_month,
    half,
  );
  const selectedDates = [...new Set(parsed.data.dates)].filter(
    (d) => d >= range.startIso && d <= range.endIso,
  );
  if (selectedDates.length === 0) {
    return { ok: false, error: "Marque al menos un día trabajado en la quincena" };
  }

  const orgId = ctx.organization.id;
  const supabase = await createClient();

  const { data: emp, error: empError } = await supabase
    .from("employees")
    .select("id, full_name, employment_type, basic_salary, salary_or_fee")
    .eq("id", parsed.data.employee_id)
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (empError) return { ok: false, error: empError.message };
  if (!emp) return { ok: false, error: "Empleado no encontrado" };
  if (!isShiftDayContractor(String(emp.employment_type ?? ""))) {
    return {
      ok: false,
      error: "Solo aplica a prestadores con contrato por turno",
    };
  }

  const rate = Number(emp.basic_salary ?? emp.salary_or_fee ?? 0);
  if (!rate || Number.isNaN(rate)) {
    return {
      ok: false,
      error: "Configure la tarifa día/turno en el empleado",
    };
  }

  // Días ya liquidados en otro gasto (activo) del mismo prestador.
  const { data: priorExpenses, error: priorErr } = await supabase
    .from("expenses")
    .select("id, shift_dates, period_year, period_month, period_half")
    .eq("organization_id", orgId)
    .eq("employee_id", parsed.data.employee_id)
    .eq("expense_kind", "LIQUIDACION_TURNO")
    .is("deleted_at", null)
    .neq("status", "ANULADO");
  if (priorErr) return { ok: false, error: priorErr.message };

  const alreadyLiquidated = new Set<string>();
  let hasPriorInSamePeriod = false;
  for (const row of priorExpenses ?? []) {
    if (
      row.period_year === parsed.data.period_year &&
      row.period_month === parsed.data.period_month &&
      row.period_half === parsed.data.period_half
    ) {
      hasPriorInSamePeriod = true;
    }
    for (const d of (row.shift_dates as string[] | null) ?? []) {
      alreadyLiquidated.add(String(d));
    }
  }

  const overlap = selectedDates.filter((d) => alreadyLiquidated.has(d));
  if (overlap.length > 0) {
    return {
      ok: false,
      error: `Estos días ya están liquidados: ${overlap.join(", ")}`,
    };
  }

  // Anticipos/bonos/descuentos solo en la primera liquidación de la quincena.
  let advances = money(0);
  let discounts = money(0);
  let bonuses = money(0);
  if (!hasPriorInSamePeriod) {
    const { data: moneyNovelties, error: moneyErr } = await supabase
      .from("shift_novelties")
      .select("novelty_type, amount")
      .eq("organization_id", orgId)
      .eq("employee_id", parsed.data.employee_id)
      .eq("status", "APROBADA")
      .is("deleted_at", null)
      .in("novelty_type", ["ANTICIPO", "DESCUENTO_AUTORIZADO", "BONO_OCASIONAL"])
      .gte("novelty_date", range.startIso)
      .lte("novelty_date", range.endIso);
    if (moneyErr) return { ok: false, error: moneyErr.message };

    for (const n of moneyNovelties ?? []) {
      const amt = money(Number(n.amount ?? 0));
      if (n.novelty_type === "ANTICIPO") advances = advances.plus(amt);
      else if (n.novelty_type === "DESCUENTO_AUTORIZADO") {
        discounts = discounts.plus(amt);
      } else if (n.novelty_type === "BONO_OCASIONAL") {
        bonuses = bonuses.plus(amt);
      }
    }
  }

  const shiftPay = money(rate).times(selectedDates.length);
  let netPay = shiftPay.plus(bonuses).minus(advances).minus(discounts);
  if (netPay.lt(0)) netPay = money(0);
  const net = netPay.toDecimalPlaces(2).toNumber();
  if (net <= 0) {
    return {
      ok: false,
      error: "El neto a pagar queda en $0 (revise anticipos/descuentos)",
    };
  }

  const periodLabel = `${half === 1 ? "1ª" : "2ª"} quincena ${String(parsed.data.period_month).padStart(2, "0")}/${parsed.data.period_year}`;
  const datesLabel = selectedDates
    .map((d) => d.slice(8, 10) + "/" + d.slice(5, 7))
    .join(", ");
  const concept = `Liquidación por turno · ${emp.full_name} · ${periodLabel}`;
  const detailNotes = [
    `días ${datesLabel}`,
    `${selectedDates.length} día(s) × ${rate}`,
    bonuses.gt(0) ? `bonos $${bonuses.toDecimalPlaces(2).toNumber()}` : null,
    advances.gt(0)
      ? `anticipos −$${advances.toDecimalPlaces(2).toNumber()}`
      : null,
    discounts.gt(0)
      ? `descuentos −$${discounts.toDecimalPlaces(2).toNumber()}`
      : null,
    emptyToNull(parsed.data.notes),
  ].filter(Boolean);
  const notes = detailNotes.join(" · ");

  const { data: existingShifts, error: existingErr } = await supabase
    .from("shift_novelties")
    .select("id, novelty_date")
    .eq("organization_id", orgId)
    .eq("employee_id", parsed.data.employee_id)
    .eq("novelty_type", "TURNO_LABORADO")
    .in("novelty_date", selectedDates)
    .is("deleted_at", null)
    .in("status", ["PENDIENTE", "APROBADA"]);
  if (existingErr) return { ok: false, error: existingErr.message };

  const activeByDate = new Set(
    (existingShifts ?? []).map((row) => String(row.novelty_date)),
  );
  const toCreate = selectedDates.filter((d) => !activeByDate.has(d));

  const now = new Date().toISOString();
  if (toCreate.length > 0) {
    const { error: insertShiftErr } = await supabase.from("shift_novelties").insert(
      toCreate.map((novelty_date) => ({
        organization_id: orgId,
        employee_id: parsed.data.employee_id,
        novelty_date,
        novelty_type: "TURNO_LABORADO" as const,
        status: "APROBADA" as const,
        amount: rate,
        is_paid: true,
        notes: "Turno registrado en liquidación por gasto",
        reported_by: ctx.userId,
        reviewed_by: ctx.userId,
        reviewed_at: now,
        created_by: ctx.userId,
        updated_by: ctx.userId,
      })),
    );
    if (insertShiftErr) {
      if (insertShiftErr.code === "23505") {
        return {
          ok: false,
          error: "Uno o más días ya tienen turno registrado para este prestador",
        };
      }
      return { ok: false, error: insertShiftErr.message };
    }
  }

  const { data, error } = await supabase
    .from("expenses")
    .insert({
      organization_id: orgId,
      expense_date: parsed.data.expense_date,
      supplier_id: null,
      category_id: emptyToNull(parsed.data.category_id),
      concept,
      amount: net,
      tax_amount: 0,
      total_amount: net,
      nature: "UNICO",
      criticality: "ESENCIAL",
      status: "APROBADO",
      shared_service: false,
      expense_kind: "LIQUIDACION_TURNO",
      employee_id: parsed.data.employee_id,
      period_year: parsed.data.period_year,
      period_month: parsed.data.period_month,
      period_half: parsed.data.period_half,
      period: periodLabel,
      shift_dates: selectedDates,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: "Conflicto al guardar la liquidación (día o período duplicado)",
      };
    }
    return { ok: false, error: error.message };
  }

  const { error: payError } = await supabase.from("payment_requests").insert({
    organization_id: orgId,
    source: "GASTO",
    status: "EN_REVISION",
    priority: parsed.data.priority ?? "NORMAL",
    concept,
    amount: net,
    requested_at: parsed.data.expense_date,
    due_date: null,
    supplier_id: null,
    expense_id: data.id,
    document_type: "CUENTA_DE_COBRO",
    document_number: null,
    issue_date: parsed.data.expense_date,
    notes,
    requested_by: ctx.userId,
    created_by: ctx.userId,
    updated_by: ctx.userId,
  });
  if (payError) return { ok: false, error: payError.message };

  await supabase.from("audit_logs").insert({
    organization_id: orgId,
    user_id: ctx.userId,
    action: "CREATE",
    entity: "expenses",
    entity_id: data.id,
    new_values: {
      payment_request_source: "GASTO",
      expense_kind: "LIQUIDACION_TURNO",
      employee_id: parsed.data.employee_id,
      dates: selectedDates,
      total: net,
    },
  });

  revalidateExpensePaths();
  revalidatePath("/personal/novedades");
  return { ok: true, id: data.id };
}

/** Liquidación de propinas: monto desde caja/tesorería + días cubiertos (sin repetir). */
export async function createTipLiquidationExpenseAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!canCreateTipLiquidation(ctx)) {
    return { ok: false, error: "Sin permiso para liquidar propinas" };
  }

  const parsed = tipLiquidationExpenseSchema.safeParse({
    dates: formData.getAll("dates").map(String),
    expense_date: formData.get("expense_date") || todayInBogota(),
    amount: formData.get("amount"),
    category_id: formData.get("category_id"),
    priority: formData.get("priority") || "NORMAL",
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const selectedDates = [...new Set(parsed.data.dates)].sort();
  if (selectedDates.length === 0) {
    return { ok: false, error: "Marque al menos un día de propina" };
  }

  const amount = parseMoney(parsed.data.amount);
  if (amount === null || amount <= 0) {
    return { ok: false, error: "Monto inválido" };
  }

  const orgId = ctx.organization.id;
  const supabase = await createClient();

  const { data: priorTips, error: priorErr } = await supabase
    .from("expenses")
    .select("id, shift_dates")
    .eq("organization_id", orgId)
    .eq("expense_kind", "LIQUIDACION_PROPINA")
    .is("deleted_at", null)
    .neq("status", "ANULADO");
  if (priorErr) return { ok: false, error: priorErr.message };

  const alreadyCovered = new Set<string>();
  for (const row of priorTips ?? []) {
    for (const d of (row.shift_dates as string[] | null) ?? []) {
      alreadyCovered.add(String(d));
    }
  }
  const overlap = selectedDates.filter((d) => alreadyCovered.has(d));
  if (overlap.length > 0) {
    return {
      ok: false,
      error: `Estos días ya están en otra liquidación de propina: ${overlap.join(", ")}`,
    };
  }

  const datesLabel = selectedDates
    .map((d) => d.slice(8, 10) + "/" + d.slice(5, 7))
    .join(", ");
  const concept = `Liquidación de propina · ${selectedDates.length} día(s)`;
  const notes = [
    `días ${datesLabel}`,
    emptyToNull(parsed.data.notes),
  ]
    .filter(Boolean)
    .join(" · ");

  const { data, error } = await supabase
    .from("expenses")
    .insert({
      organization_id: orgId,
      expense_date: parsed.data.expense_date,
      supplier_id: null,
      category_id: emptyToNull(parsed.data.category_id),
      concept,
      amount,
      tax_amount: 0,
      total_amount: amount,
      nature: "UNICO",
      criticality: "ESENCIAL",
      status: "APROBADO",
      shared_service: false,
      expense_kind: "LIQUIDACION_PROPINA",
      shift_dates: selectedDates,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  const { error: payError } = await supabase.from("payment_requests").insert({
    organization_id: orgId,
    source: "GASTO",
    status: "EN_REVISION",
    priority: parsed.data.priority ?? "NORMAL",
    concept,
    amount,
    requested_at: parsed.data.expense_date,
    due_date: null,
    supplier_id: null,
    expense_id: data.id,
    document_type: "CUENTA_DE_COBRO",
    document_number: null,
    issue_date: parsed.data.expense_date,
    notes,
    requested_by: ctx.userId,
    created_by: ctx.userId,
    updated_by: ctx.userId,
  });
  if (payError) return { ok: false, error: payError.message };

  await supabase.from("audit_logs").insert({
    organization_id: orgId,
    user_id: ctx.userId,
    action: "CREATE",
    entity: "expenses",
    entity_id: data.id,
    new_values: {
      payment_request_source: "GASTO",
      expense_kind: "LIQUIDACION_PROPINA",
      dates: selectedDates,
      total: amount,
    },
  });

  revalidateExpensePaths();
  return { ok: true, id: data.id };
}
