"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  createBudgetAction,
  createBudgetLineAction,
  softDeleteBudgetAction,
  updateBudgetAssumptionsAction,
  updateBudgetLineAmountAction,
} from "./actions";
import { Badge, WorkSection } from "@/components/ui/primitives";
import {
  type BudgetPeriodKind,
  budgetPeriodKindLabel,
  computeSalesGoal,
  contributionMarginFromVariableCost,
  formatBudgetPeriod,
} from "@/lib/budget";
import { formatCOP, money } from "@/lib/money";

export type BudgetRow = {
  id: string;
  name: string;
  scenario: string;
  period_kind?: string | null;
  period_year: number;
  period_month: number | null;
  notes: string | null;
  variable_cost_pct: number | string;
  contribution_margin_pct: number | string;
  desired_profit_amount: number | string;
};

export type BudgetLineRow = {
  id: string;
  budget_id: string;
  category: string;
  budgeted_amount: number | string;
  notes: string | null;
  line_kind: string;
  sort_order: number;
};

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] outline-none ring-[var(--accent)] focus:ring-2";

const monthNames = [
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
];

function toNum(value: number | string | null | undefined, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function defaultPeriodName(kind: BudgetPeriodKind, year: number, index: number) {
  return `Operación ${formatBudgetPeriod({
    period_kind: kind,
    period_year: year,
    period_month: kind === "YEAR" ? null : index,
  })}`;
}

export function CreateBudgetForm({ embedded = false }: { embedded?: boolean }) {
  const [open, setOpen] = useState(embedded);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const [periodKind, setPeriodKind] = useState<BudgetPeriodKind>("YEAR");
  const [periodIndex, setPeriodIndex] = useState(month);
  const quarter = Math.ceil(month / 3);
  const semester = month <= 6 ? 1 : 2;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-[var(--solid)] px-4 py-2.5 text-sm font-medium text-[var(--on-solid)]"
      >
        Nuevo presupuesto
      </button>
    );
  }

  const indexForKind =
    periodKind === "MONTH"
      ? periodIndex
      : periodKind === "QUARTER"
        ? Math.min(4, Math.max(1, periodIndex <= 4 ? periodIndex : quarter))
        : periodKind === "SEMESTER"
          ? Math.min(2, Math.max(1, periodIndex <= 2 ? periodIndex : semester))
          : null;

  return (
    <form
      className={
        embedded
          ? "space-y-4"
          : "space-y-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5"
      }
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await createBudgetAction(fd);
          if (!r.ok) setError(r.error ?? "Error");
          else setOpen(false);
        });
      }}
    >
      <div className="flex justify-between gap-3">
        <div>
          <h3 className="font-medium">Nuevo presupuesto operativo</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Elige el período (año, semestre, trimestre o mes). Se crean los rubros
            listos para completar.
          </p>
        </div>
        {!embedded ? (
          <button
            type="button"
            className="text-sm text-[var(--muted)]"
            onClick={() => setOpen(false)}
          >
            Cancelar
          </button>
        ) : null}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">Nombre</span>
          <input
            name="name"
            required
            key={`${periodKind}-${year}-${indexForKind ?? "y"}`}
            defaultValue={defaultPeriodName(
              periodKind,
              year,
              indexForKind ?? month,
            )}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Tipo de período</span>
          <select
            name="period_kind"
            value={periodKind}
            onChange={(e) => {
              const next = e.target.value as BudgetPeriodKind;
              setPeriodKind(next);
              if (next === "MONTH") setPeriodIndex(month);
              else if (next === "QUARTER") setPeriodIndex(quarter);
              else if (next === "SEMESTER") setPeriodIndex(semester);
            }}
            className={inputClass}
          >
            <option value="YEAR">{budgetPeriodKindLabel("YEAR")}</option>
            <option value="SEMESTER">{budgetPeriodKindLabel("SEMESTER")}</option>
            <option value="QUARTER">{budgetPeriodKindLabel("QUARTER")}</option>
            <option value="MONTH">{budgetPeriodKindLabel("MONTH")}</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Año</span>
          <input
            name="period_year"
            defaultValue={String(year)}
            required
            className={inputClass}
          />
        </label>
        {periodKind === "MONTH" ? (
          <label className="block text-sm md:col-span-2">
            <span className="mb-1.5 block text-[var(--muted)]">Mes</span>
            <select
              name="period_month"
              value={String(periodIndex)}
              onChange={(e) => setPeriodIndex(Number(e.target.value))}
              className={inputClass}
            >
              {monthNames.map((label, i) => (
                <option key={label} value={String(i + 1)}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {periodKind === "QUARTER" ? (
          <label className="block text-sm md:col-span-2">
            <span className="mb-1.5 block text-[var(--muted)]">Trimestre</span>
            <select
              name="period_month"
              value={String(Math.min(4, Math.max(1, periodIndex)))}
              onChange={(e) => setPeriodIndex(Number(e.target.value))}
              className={inputClass}
            >
              <option value="1">T1 (ene–mar)</option>
              <option value="2">T2 (abr–jun)</option>
              <option value="3">T3 (jul–sep)</option>
              <option value="4">T4 (oct–dic)</option>
            </select>
          </label>
        ) : null}
        {periodKind === "SEMESTER" ? (
          <label className="block text-sm md:col-span-2">
            <span className="mb-1.5 block text-[var(--muted)]">Semestre</span>
            <select
              name="period_month"
              value={String(Math.min(2, Math.max(1, periodIndex)))}
              onChange={(e) => setPeriodIndex(Number(e.target.value))}
              className={inputClass}
            >
              <option value="1">1.er semestre (ene–jun)</option>
              <option value="2">2.º semestre (jul–dic)</option>
            </select>
          </label>
        ) : null}
        {periodKind === "YEAR" ? (
          <input type="hidden" name="period_month" value="" />
        ) : null}
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">Notas</span>
          <input name="notes" className={inputClass} />
        </label>
      </div>
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--solid)] px-5 py-2.5 text-sm text-[var(--on-solid)]"
      >
        {pending ? "Creando…" : "Crear presupuesto"}
      </button>
    </form>
  );
}

function LineAmountCell({
  line,
}: {
  line: BudgetLineRow;
}) {
  const [value, setValue] = useState(String(toNum(line.budgeted_amount)));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setValue(String(toNum(line.budgeted_amount)));
  }, [line.budgeted_amount]);

  function save(next: string) {
    const current = String(toNum(line.budgeted_amount));
    if (next.trim() === current) return;
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("line_id", line.id);
      fd.set("budgeted_amount", next);
      const r = await updateBudgetLineAmountAction(fd);
      if (!r.ok) {
        setError(r.error ?? "Error");
        setValue(current);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        type="number"
        min={0}
        step="1000"
        value={value}
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => save(value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
        className={`${inputClass} max-w-[9.5rem] text-right tabular-nums`}
        aria-label={`Monto ${line.category}`}
      />
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </div>
  );
}

function RubrosTable({
  title,
  kind,
  lines,
}: {
  title: string;
  kind: "GASTO" | "COSTO";
  lines: BudgetLineRow[];
}) {
  const rows = lines
    .filter((l) => (l.line_kind || "GASTO") === kind)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order || a.category.localeCompare(b.category));

  const total = rows.reduce(
    (acc, l) => acc.plus(money(l.budgeted_amount)),
    money(0),
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-medium">{title}</h4>
        <p className="text-sm text-[var(--muted)]">
          Subtotal{" "}
          <strong className="text-[var(--ink)]">{formatCOP(total)}</strong>
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Sin rubros.</p>
      ) : (
        <ul className="divide-y divide-[var(--line)] rounded-lg border border-[var(--line)]">
          {rows.map((l) => (
            <li
              key={l.id}
              className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
            >
              <span className="text-sm">{l.category}</span>
              <LineAmountCell line={l} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SalesGoalPanel({
  budget,
  fixedExpenses,
}: {
  budget: BudgetRow;
  fixedExpenses: ReturnType<typeof money>;
}) {
  const [variableCost, setVariableCost] = useState(
    toNum(budget.variable_cost_pct, 35),
  );
  const [contributionMargin, setContributionMargin] = useState(
    toNum(budget.contribution_margin_pct, 65),
  );
  const [desiredProfit, setDesiredProfit] = useState(
    toNum(budget.desired_profit_amount, 0),
  );
  const [cmOverride, setCmOverride] = useState(() => {
    const vc = toNum(budget.variable_cost_pct, 35);
    const cm = toNum(budget.contribution_margin_pct, 65);
    return Math.abs(cm - (100 - vc)) > 0.01;
  });
  const [error, setError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setVariableCost(toNum(budget.variable_cost_pct, 35));
    setContributionMargin(toNum(budget.contribution_margin_pct, 65));
    setDesiredProfit(toNum(budget.desired_profit_amount, 0));
    const vc = toNum(budget.variable_cost_pct, 35);
    const cm = toNum(budget.contribution_margin_pct, 65);
    setCmOverride(Math.abs(cm - (100 - vc)) > 0.01);
  }, [
    budget.id,
    budget.variable_cost_pct,
    budget.contribution_margin_pct,
    budget.desired_profit_amount,
  ]);

  const goal = useMemo(
    () =>
      computeSalesGoal({
        fixedExpenses,
        contributionMarginPct: contributionMargin,
        desiredProfit,
      }),
    [fixedExpenses, contributionMargin, desiredProfit],
  );

  function onVariableCostChange(next: number) {
    setVariableCost(next);
    if (!cmOverride) {
      setContributionMargin(
        contributionMarginFromVariableCost(next).toDecimalPlaces(2).toNumber(),
      );
    }
  }

  function onContributionMarginChange(next: number) {
    setCmOverride(true);
    setContributionMargin(next);
  }

  function syncFromVariableCost() {
    setCmOverride(false);
    setContributionMargin(
      contributionMarginFromVariableCost(variableCost)
        .toDecimalPlaces(2)
        .toNumber(),
    );
  }

  function persist() {
    setError(null);
    setSavedHint(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("budget_id", budget.id);
      fd.set("variable_cost_pct", String(variableCost));
      fd.set("contribution_margin_pct", String(contributionMargin));
      fd.set("desired_profit_amount", String(desiredProfit));
      const r = await updateBudgetAssumptionsAction(fd);
      if (!r.ok) setError(r.error ?? "Error");
      else setSavedHint("Supuestos guardados");
    });
  }

  return (
    <div className="space-y-5 rounded-xl border border-[var(--line)] bg-[var(--surface-muted)]/40 p-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
          Aproximando meta
        </p>
        <h4 className="mt-1 font-medium">Margen de contribución → meta en ventas</h4>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Meta ≈ (gastos fijos + utilidad deseada) ÷ margen de contribución. El
          costo variable % propone el CM; puedes ajustarlo a mano para probar
          escenarios.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">
            Costo variable %
          </span>
          <input
            type="range"
            min={0}
            max={90}
            step={0.5}
            value={variableCost}
            onChange={(e) => onVariableCostChange(Number(e.target.value))}
            className="w-full accent-[var(--accent)]"
          />
          <input
            type="number"
            min={0}
            max={99.99}
            step={0.5}
            value={variableCost}
            onChange={(e) => onVariableCostChange(Number(e.target.value))}
            className={`${inputClass} mt-2`}
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1.5 flex items-center justify-between gap-2 text-[var(--muted)]">
            <span>Margen de contribución %</span>
            {cmOverride ? (
              <button
                type="button"
                className="text-xs text-[var(--accent)]"
                onClick={syncFromVariableCost}
              >
                Sincronizar con costo variable
              </button>
            ) : null}
          </span>
          <input
            type="range"
            min={1}
            max={100}
            step={0.5}
            value={contributionMargin}
            onChange={(e) => onContributionMarginChange(Number(e.target.value))}
            className="w-full accent-[var(--accent)]"
          />
          <input
            type="number"
            min={0.01}
            max={100}
            step={0.5}
            value={contributionMargin}
            onChange={(e) => onContributionMarginChange(Number(e.target.value))}
            className={`${inputClass} mt-2`}
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">
            Utilidad deseada (COP)
          </span>
          <input
            type="number"
            min={0}
            step="100000"
            value={desiredProfit}
            onChange={(e) => setDesiredProfit(Number(e.target.value) || 0)}
            className={inputClass}
          />
          <p className="mt-2 text-xs text-[var(--muted)]">
            Gastos fijos cubiertos: {formatCOP(fixedExpenses)}
          </p>
        </label>
      </div>

      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
        {goal.ok ? (
          <>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
              Meta en ventas
            </p>
            <p className="mt-2 font-display text-3xl font-bold tracking-tight">
              {formatCOP(goal.salesGoal)}
            </p>
            <dl className="mt-4 grid gap-2 text-sm text-[var(--muted)] sm:grid-cols-2">
              <div className="flex justify-between gap-3 sm:block">
                <dt>Punto de equilibrio</dt>
                <dd className="font-medium text-[var(--ink)]">
                  {formatCOP(goal.breakEven)}
                </dd>
              </div>
              <div className="flex justify-between gap-3 sm:block">
                <dt>A cubrir (gastos + utilidad)</dt>
                <dd className="font-medium text-[var(--ink)]">
                  {formatCOP(goal.coveredAmount)}
                </dd>
              </div>
            </dl>
          </>
        ) : (
          <p className="text-sm text-red-700">{goal.error}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={persist}
          className="rounded-lg bg-[var(--solid)] px-4 py-2 text-sm text-[var(--on-solid)]"
        >
          {pending ? "Guardando…" : "Guardar supuestos"}
        </button>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        {savedHint ? (
          <p className="text-sm text-[var(--ok)]">{savedHint}</p>
        ) : null}
      </div>
    </div>
  );
}

function AddExtraLineForm({ budgetId }: { budgetId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm"
        onClick={() => setOpen(true)}
      >
        Agregar rubro
      </button>
    );
  }

  return (
    <form
      className="grid gap-3 rounded-lg border border-[var(--line)] p-4 md:grid-cols-3"
      action={(fd) => {
        fd.set("budget_id", budgetId);
        setError(null);
        startTransition(async () => {
          const r = await createBudgetLineAction(fd);
          if (!r.ok) setError(r.error ?? "Error");
          else setOpen(false);
        });
      }}
    >
      <input type="hidden" name="budget_id" value={budgetId} />
      <label className="block text-sm md:col-span-1">
        <span className="mb-1.5 block text-[var(--muted)]">Rubro</span>
        <input name="category" required className={inputClass} />
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-[var(--muted)]">Tipo</span>
        <select name="line_kind" defaultValue="GASTO" className={inputClass}>
          <option value="GASTO">Gasto</option>
          <option value="COSTO">Costo</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-[var(--muted)]">Monto</span>
        <input name="budgeted_amount" required defaultValue="0" className={inputClass} />
      </label>
      {error ? <p className="text-sm text-red-700 md:col-span-3">{error}</p> : null}
      <div className="flex gap-2 md:col-span-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[var(--solid)] px-4 py-2 text-sm text-[var(--on-solid)]"
        >
          {pending ? "Agregando…" : "Agregar"}
        </button>
        <button
          type="button"
          className="rounded-lg px-3 py-2 text-sm text-[var(--muted)]"
          onClick={() => setOpen(false)}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function BudgetCard({
  budget,
  lines,
}: {
  budget: BudgetRow;
  lines: BudgetLineRow[];
}) {
  const [pending, startTransition] = useTransition();

  const gastos = lines.filter((l) => (l.line_kind || "GASTO") === "GASTO");
  const fixedExpenses = gastos.reduce(
    (acc, l) => acc.plus(money(l.budgeted_amount)),
    money(0),
  );
  const costos = lines.filter((l) => l.line_kind === "COSTO");
  const costosTotal = costos.reduce(
    (acc, l) => acc.plus(money(l.budgeted_amount)),
    money(0),
  );

  return (
    <article className="space-y-5 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{budget.name}</h3>
            <Badge tone="accent">Operativo</Badge>
          </div>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {formatBudgetPeriod(budget)} · Gastos fijos {formatCOP(fixedExpenses)}
            {costosTotal.gt(0) ? ` · Costos a monto ${formatCOP(costosTotal)}` : null}
          </p>
          {budget.notes ? (
            <p className="mt-1 text-sm text-[var(--muted)]">{budget.notes}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <AddExtraLineForm budgetId={budget.id} />
          <button
            type="button"
            className="rounded-lg px-3 py-1.5 text-sm text-red-700"
            disabled={pending}
            onClick={() => {
              if (!confirm("¿Eliminar presupuesto?")) return;
              startTransition(async () => {
                await softDeleteBudgetAction(budget.id);
              });
            }}
          >
            Eliminar
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <RubrosTable title="Gastos (fijos operativos)" kind="GASTO" lines={lines} />
        <RubrosTable
          title="Costos (montos fijos / compromisos)"
          kind="COSTO"
          lines={lines}
        />
      </div>

      <SalesGoalPanel budget={budget} fixedExpenses={fixedExpenses} />
    </article>
  );
}

export function BudgetCreateSection() {
  return (
    <WorkSection
      kind="form"
      title="Crear presupuesto"
      description="Presupuesto para operar un año, semestre, trimestre o mes: rubros visibles y meta de ventas por margen de contribución."
      defaultOpen
    >
      <CreateBudgetForm embedded />
    </WorkSection>
  );
}
