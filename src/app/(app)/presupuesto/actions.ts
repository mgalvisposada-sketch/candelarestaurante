"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org-context";
import {
  BUDGET_SCENARIO_OPERATIVO,
  BUDGET_SEED_RUBROS,
  DEFAULT_CONTRIBUTION_MARGIN_PCT,
  DEFAULT_VARIABLE_COST_PCT,
  periodIndexRange,
} from "@/lib/budget";
import {
  budgetAssumptionsSchema,
  budgetLineAmountSchema,
  budgetLineSchema,
  budgetSchema,
} from "@/validations/budget";
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

function parsePct(raw: string | null | undefined) {
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
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
    period_kind: formData.get("period_kind") || "YEAR",
    period_year: formData.get("period_year"),
    period_month: formData.get("period_month"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const year = Number.parseInt(parsed.data.period_year, 10);
  if (Number.isNaN(year) || year < 2000) return { ok: false, error: "Año inválido" };

  const kind = parsed.data.period_kind;
  const range = periodIndexRange(kind);
  const indexRaw = emptyToNull(parsed.data.period_month);
  let periodIndex: number | null = null;

  if (range) {
    if (!indexRaw) {
      return {
        ok: false,
        error:
          kind === "MONTH"
            ? "Mes obligatorio"
            : kind === "QUARTER"
              ? "Trimestre obligatorio"
              : "Semestre obligatorio",
      };
    }
    periodIndex = Number.parseInt(indexRaw, 10);
    if (
      Number.isNaN(periodIndex) ||
      periodIndex < range.min ||
      periodIndex > range.max
    ) {
      return { ok: false, error: "Período inválido" };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("budgets")
    .insert({
      organization_id: ctx.organization.id,
      name: parsed.data.name.trim(),
      scenario: BUDGET_SCENARIO_OPERATIVO,
      period_kind: kind,
      period_year: year,
      period_month: periodIndex,
      notes: emptyToNull(parsed.data.notes),
      variable_cost_pct: DEFAULT_VARIABLE_COST_PCT,
      contribution_margin_pct: DEFAULT_CONTRIBUTION_MARGIN_PCT,
      desired_profit_amount: 0,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  const seedRows = BUDGET_SEED_RUBROS.map((r) => ({
    organization_id: ctx.organization!.id,
    budget_id: data.id,
    category: r.category,
    budgeted_amount: 0,
    line_kind: r.line_kind,
    sort_order: r.sort_order,
  }));

  const { error: linesError } = await supabase
    .from("budget_lines")
    .insert(seedRows);

  if (linesError) return { ok: false, error: linesError.message };

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
    line_kind: formData.get("line_kind") || "GASTO",
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const amount = parseMoney(parsed.data.budgeted_amount);
  if (amount === null || amount < 0) return { ok: false, error: "Monto inválido" };

  const supabase = await createClient();

  const { data: maxRow } = await supabase
    .from("budget_lines")
    .select("sort_order")
    .eq("organization_id", ctx.organization.id)
    .eq("budget_id", parsed.data.budget_id)
    .is("deleted_at", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = (maxRow?.sort_order ?? 200) + 10;

  const { data, error } = await supabase
    .from("budget_lines")
    .insert({
      organization_id: ctx.organization.id,
      budget_id: parsed.data.budget_id,
      category: parsed.data.category.trim(),
      budgeted_amount: amount,
      line_kind: parsed.data.line_kind,
      sort_order: nextOrder,
      notes: emptyToNull(parsed.data.notes),
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/presupuesto");
  return { ok: true, id: data.id };
}

export async function updateBudgetLineAmountAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = budgetLineAmountSchema.safeParse({
    line_id: formData.get("line_id"),
    budgeted_amount: formData.get("budgeted_amount"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const amount = parseMoney(parsed.data.budgeted_amount);
  if (amount === null || amount < 0) return { ok: false, error: "Monto inválido" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("budget_lines")
    .update({
      budgeted_amount: amount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.line_id)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/presupuesto");
  return { ok: true, id: parsed.data.line_id };
}

export async function updateBudgetAssumptionsAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = budgetAssumptionsSchema.safeParse({
    budget_id: formData.get("budget_id"),
    variable_cost_pct: formData.get("variable_cost_pct"),
    contribution_margin_pct: formData.get("contribution_margin_pct"),
    desired_profit_amount: formData.get("desired_profit_amount"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const variableCostPct = parsePct(parsed.data.variable_cost_pct);
  const contributionMarginPct = parsePct(parsed.data.contribution_margin_pct);
  const desiredProfit = parseMoney(parsed.data.desired_profit_amount, 0);

  if (variableCostPct === null || variableCostPct < 0 || variableCostPct >= 100) {
    return { ok: false, error: "Costo variable inválido (0–99.99%)" };
  }
  if (
    contributionMarginPct === null ||
    contributionMarginPct <= 0 ||
    contributionMarginPct > 100
  ) {
    return { ok: false, error: "Margen de contribución inválido (0–100%)" };
  }
  if (desiredProfit === null || desiredProfit < 0) {
    return { ok: false, error: "Utilidad deseada inválida" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("budgets")
    .update({
      variable_cost_pct: variableCostPct,
      contribution_margin_pct: contributionMarginPct,
      desired_profit_amount: desiredProfit,
      updated_by: ctx.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.budget_id)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/presupuesto");
  return { ok: true, id: parsed.data.budget_id };
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
