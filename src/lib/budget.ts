import Decimal from "decimal.js";
import { money, type MoneyInput } from "@/lib/money";

export type BudgetLineKind = "GASTO" | "COSTO";

export type BudgetSeedRubro = {
  category: string;
  line_kind: BudgetLineKind;
  sort_order: number;
};

/** Rubros seed al crear un presupuesto operativo. */
export const BUDGET_SEED_RUBROS: readonly BudgetSeedRubro[] = [
  { category: "Holding", line_kind: "GASTO", sort_order: 10 },
  { category: "Publicidad", line_kind: "GASTO", sort_order: 20 },
  { category: "Arriendo", line_kind: "GASTO", sort_order: 30 },
  {
    category: "Servicios (energía/gas/agua/internet)",
    line_kind: "GASTO",
    sort_order: 40,
  },
  { category: "Nómina operativa", line_kind: "GASTO", sort_order: 50 },
  { category: "Otros gastos", line_kind: "GASTO", sort_order: 60 },
  { category: "Insumos alimentos", line_kind: "COSTO", sort_order: 110 },
  { category: "Bebidas/licores", line_kind: "COSTO", sort_order: 120 },
  { category: "Empaques", line_kind: "COSTO", sort_order: 130 },
] as const;

export const DEFAULT_VARIABLE_COST_PCT = 35;
export const DEFAULT_CONTRIBUTION_MARGIN_PCT = 65;
export const BUDGET_SCENARIO_OPERATIVO = "OPERATIVO";

/** Granularidad del presupuesto operativo. `period_month` guarda el índice del subperíodo. */
export type BudgetPeriodKind = "YEAR" | "SEMESTER" | "QUARTER" | "MONTH";

export const BUDGET_PERIOD_KINDS: readonly BudgetPeriodKind[] = [
  "YEAR",
  "SEMESTER",
  "QUARTER",
  "MONTH",
] as const;

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

export function isBudgetPeriodKind(value: string): value is BudgetPeriodKind {
  return (BUDGET_PERIOD_KINDS as readonly string[]).includes(value);
}

/** Rango válido de `period_month` según el tipo (null = no aplica). */
export function periodIndexRange(
  kind: BudgetPeriodKind,
): { min: number; max: number } | null {
  if (kind === "YEAR") return null;
  if (kind === "SEMESTER") return { min: 1, max: 2 };
  if (kind === "QUARTER") return { min: 1, max: 4 };
  return { min: 1, max: 12 };
}

export function formatBudgetPeriod(input: {
  period_kind?: string | null;
  period_year: number;
  period_month?: number | null;
}): string {
  const year = input.period_year;
  const kind = isBudgetPeriodKind(input.period_kind ?? "")
    ? input.period_kind
    : input.period_month != null
      ? "MONTH"
      : "YEAR";
  const index = input.period_month ?? null;

  if (kind === "YEAR") return `Año ${year}`;
  if (kind === "SEMESTER") {
    if (index === 1) return `1.er semestre ${year}`;
    if (index === 2) return `2.º semestre ${year}`;
    return `Semestre ${year}`;
  }
  if (kind === "QUARTER") {
    if (index != null && index >= 1 && index <= 4) {
      return `T${index} ${year}`;
    }
    return `Trimestre ${year}`;
  }
  if (index != null && index >= 1 && index <= 12) {
    return `${MONTH_NAMES[index - 1]} ${year}`;
  }
  return String(year);
}

export function budgetPeriodKindLabel(kind: BudgetPeriodKind): string {
  if (kind === "YEAR") return "Año";
  if (kind === "SEMESTER") return "Semestre";
  if (kind === "QUARTER") return "Trimestre";
  return "Mes";
}

export type SalesGoalInput = {
  fixedExpenses: MoneyInput;
  contributionMarginPct: MoneyInput;
  desiredProfit?: MoneyInput;
};

export type SalesGoalResult =
  | {
      ok: true;
      salesGoal: Decimal;
      breakEven: Decimal;
      coveredAmount: Decimal;
      contributionMarginPct: Decimal;
    }
  | {
      ok: false;
      error: string;
    };

/** Margen de contribución % = 100 − costo variable %. */
export function contributionMarginFromVariableCost(
  variableCostPct: MoneyInput,
): Decimal {
  return money(100).minus(money(variableCostPct));
}

/**
 * Meta de ventas ≈ (gastos fijos + utilidad deseada) / (CM% / 100).
 * Break-even usa utilidad 0.
 */
export function computeSalesGoal(input: SalesGoalInput): SalesGoalResult {
  const cm = money(input.contributionMarginPct);
  if (cm.lte(0)) {
    return {
      ok: false,
      error: "El margen de contribución debe ser mayor a 0%.",
    };
  }
  if (cm.gt(100)) {
    return {
      ok: false,
      error: "El margen de contribución no puede superar 100%.",
    };
  }

  const fixed = money(input.fixedExpenses);
  if (fixed.lt(0)) {
    return { ok: false, error: "Los gastos fijos no pueden ser negativos." };
  }

  const profit = money(input.desiredProfit ?? 0);
  if (profit.lt(0)) {
    return {
      ok: false,
      error: "La utilidad deseada no puede ser negativa.",
    };
  }

  const rate = cm.div(100);
  const coveredAmount = fixed.plus(profit);
  const salesGoal = coveredAmount.div(rate);
  const breakEven = fixed.div(rate);

  return {
    ok: true,
    salesGoal,
    breakEven,
    coveredAmount,
    contributionMarginPct: cm,
  };
}
