"use client";

import { useState, useTransition } from "react";
import {
  createBudgetAction,
  createBudgetLineAction,
  softDeleteBudgetAction,
} from "./actions";
import { Badge } from "@/components/ui/primitives";
import { formatCOP, money } from "@/lib/money";

export type BudgetRow = {
  id: string;
  name: string;
  scenario: string;
  period_year: number;
  period_month: number | null;
  notes: string | null;
};

export type BudgetLineRow = {
  id: string;
  budget_id: string;
  category: string;
  budgeted_amount: number | string;
  notes: string | null;
};

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2";

function scenarioLabel(s: string) {
  if (s === "ACTUAL") return "Estructura actual";
  if (s === "MINIMO_VIABLE") return "Mínimo viable";
  return "Aprobado";
}

function scenarioTone(s: string) {
  if (s === "APROBADO") return "ok" as const;
  if (s === "MINIMO_VIABLE") return "warn" as const;
  return "neutral" as const;
}

export function CreateBudgetForm() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const year = new Date().getFullYear();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-[var(--ink)] px-4 py-2.5 text-sm font-medium text-white"
      >
        Nuevo presupuesto
      </button>
    );
  }

  return (
    <form
      className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-5"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await createBudgetAction(fd);
          if (!r.ok) setError(r.error ?? "Error");
          else setOpen(false);
        });
      }}
    >
      <div className="flex justify-between">
        <h3 className="font-medium">Nuevo presupuesto</h3>
        <button type="button" className="text-sm text-[var(--muted)]" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">Nombre</span>
          <input name="name" required className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Escenario</span>
          <select name="scenario" defaultValue="ACTUAL" className={inputClass}>
            <option value="ACTUAL">Estructura actual</option>
            <option value="MINIMO_VIABLE">Mínimo viable</option>
            <option value="APROBADO">Aprobado</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Año</span>
          <input name="period_year" defaultValue={String(year)} required className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Mes (opcional)</span>
          <input name="period_month" type="number" min={1} max={12} className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Notas</span>
          <input name="notes" className={inputClass} />
        </label>
      </div>
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      <button type="submit" disabled={pending} className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm text-white">
        {pending ? "Guardando…" : "Crear"}
      </button>
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
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const total = lines.reduce((acc, l) => acc.plus(money(l.budgeted_amount)), money(0));

  return (
    <article className="rounded-xl border border-[var(--line)] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">{budget.name}</h3>
          <p className="text-sm text-[var(--muted)]">
            {budget.period_year}
            {budget.period_month ? `-${String(budget.period_month).padStart(2, "0")}` : ""} · Total{" "}
            {formatCOP(total)}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge tone={scenarioTone(budget.scenario)}>{scenarioLabel(budget.scenario)}</Badge>
          <button
            type="button"
            className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm"
            onClick={() => setAdding((v) => !v)}
          >
            Línea
          </button>
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

      {lines.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm text-[var(--muted)]">
          {lines.map((l) => (
            <li key={l.id} className="flex justify-between gap-4">
              <span>{l.category}</span>
              <strong className="text-[var(--ink)]">{formatCOP(l.budgeted_amount)}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-[var(--muted)]">Sin líneas aún.</p>
      )}

      {adding ? (
        <form
          className="mt-4 grid gap-3 border-t border-[var(--line)] pt-4 md:grid-cols-2"
          action={(fd) => {
            fd.set("budget_id", budget.id);
            setError(null);
            startTransition(async () => {
              const r = await createBudgetLineAction(fd);
              if (!r.ok) setError(r.error ?? "Error");
              else setAdding(false);
            });
          }}
        >
          <input type="hidden" name="budget_id" value={budget.id} />
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Categoría</span>
            <input name="category" required className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Monto</span>
            <input name="budgeted_amount" required className={inputClass} />
          </label>
          {error ? <p className="text-sm text-red-700 md:col-span-2">{error}</p> : null}
          <button type="submit" disabled={pending} className="rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white md:col-span-2">
            Agregar línea
          </button>
        </form>
      ) : null}
    </article>
  );
}
