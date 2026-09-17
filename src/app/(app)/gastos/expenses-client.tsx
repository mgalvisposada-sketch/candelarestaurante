"use client";

import { useState, useTransition } from "react";
import {
  createExpenseAction,
  createExpenseCategoryAction,
  softDeleteExpenseAction,
  updateExpenseStatusAction,
} from "./actions";
import { Badge } from "@/components/ui/primitives";
import { formatCOP } from "@/lib/money";
import { formatDateCO } from "@/lib/dates";

export type CategoryRow = { id: string; code: string; name: string };
export type SupplierOption = { id: string; name: string };
export type ExpenseRow = {
  id: string;
  expense_date: string;
  concept: string;
  amount: number | string;
  tax_amount: number | string;
  total_amount: number | string;
  nature: string;
  criticality: string;
  status: string;
  category_id: string | null;
  supplier_id: string | null;
  shared_service: boolean;
};

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2";

function statusTone(s: string) {
  if (s === "PAGADO" || s === "APROBADO") return "ok" as const;
  if (s === "ANULADO") return "danger" as const;
  return "warn" as const;
}

export function CreateCategoryForm() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-[var(--line)] px-4 py-2.5 text-sm"
      >
        Categoría
      </button>
    );
  }
  return (
    <form
      className="space-y-3 rounded-xl border border-[var(--line)] bg-white p-4"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await createExpenseCategoryAction(fd);
          if (!r.ok) setError(r.error ?? "Error");
          else setOpen(false);
        });
      }}
    >
      <input name="code" placeholder="Código" required className={inputClass} />
      <input name="name" placeholder="Nombre" required className={inputClass} />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-[var(--ink)] px-3 py-2 text-sm text-white">
          Guardar
        </button>
        <button type="button" className="text-sm text-[var(--muted)]" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function CreateExpenseForm({
  categories,
  suppliers,
}: {
  categories: CategoryRow[];
  suppliers: SupplierOption[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-[var(--ink)] px-4 py-2.5 text-sm font-medium text-white"
      >
        Nuevo gasto
      </button>
    );
  }
  return (
    <form
      className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-5"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await createExpenseAction(fd);
          if (!r.ok) setError(r.error ?? "Error");
          else setOpen(false);
        });
      }}
    >
      <div className="flex justify-between">
        <h3 className="font-medium">Nuevo gasto</h3>
        <button type="button" className="text-sm text-[var(--muted)]" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Fecha</span>
          <input type="date" name="expense_date" required className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Monto</span>
          <input name="amount" required className={inputClass} />
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">Concepto</span>
          <input name="concept" required className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Categoría</span>
          <select name="category_id" className={inputClass}>
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Proveedor</span>
          <select name="supplier_id" className={inputClass}>
            <option value="">—</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Naturaleza</span>
          <select name="nature" defaultValue="UNICO" className={inputClass}>
            <option value="FIJO">Fijo</option>
            <option value="VARIABLE">Variable</option>
            <option value="UNICO">Único</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Criticidad</span>
          <select name="criticality" defaultValue="ESENCIAL" className={inputClass}>
            <option value="ESENCIAL">Esencial</option>
            <option value="REDUCIBLE">Reducible</option>
            <option value="DISCRECIONAL">Discrecional</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Estado</span>
          <select name="status" defaultValue="BORRADOR" className={inputClass}>
            <option value="BORRADOR">Borrador</option>
            <option value="APROBADO">Aprobado</option>
            <option value="PAGADO">Pagado</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Impuesto</span>
          <input name="tax_amount" defaultValue="0" className={inputClass} />
        </label>
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input type="checkbox" name="shared_service" value="true" />
          Costo compartido (asignable a Candela)
        </label>
      </div>
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      <button type="submit" disabled={pending} className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm text-white">
        {pending ? "Guardando…" : "Guardar gasto"}
      </button>
    </form>
  );
}

export function ExpenseList({
  expenses,
  categories,
}: {
  expenses: ExpenseRow[];
  categories: CategoryRow[];
}) {
  const [pending, startTransition] = useTransition();
  const catMap = new Map(categories.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-3">
      {expenses.map((e) => (
        <article
          key={e.id}
          className="rounded-xl border border-[var(--line)] bg-white px-4 py-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium">{e.concept}</p>
              <p className="text-sm text-[var(--muted)]">
                {formatDateCO(e.expense_date)} · {catMap.get(e.category_id ?? "") ?? "Sin categoría"} ·{" "}
                {e.nature} · {e.criticality}
                {e.shared_service ? " · compartido" : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="font-medium">{formatCOP(e.total_amount)}</p>
              <Badge tone={statusTone(e.status)}>{e.status}</Badge>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {e.status === "BORRADOR" ? (
              <button
                type="button"
                disabled={pending}
                className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm"
                onClick={() =>
                  startTransition(async () => {
                    await updateExpenseStatusAction(e.id, "APROBADO");
                  })
                }
              >
                Aprobar
              </button>
            ) : null}
            {e.status === "APROBADO" ? (
              <button
                type="button"
                disabled={pending}
                className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm"
                onClick={() =>
                  startTransition(async () => {
                    await updateExpenseStatusAction(e.id, "PAGADO");
                  })
                }
              >
                Marcar pagado
              </button>
            ) : null}
            <button
              type="button"
              disabled={pending}
              className="rounded-lg px-3 py-1.5 text-sm text-red-700"
              onClick={() => {
                if (!confirm("¿Anular gasto?")) return;
                startTransition(async () => {
                  await softDeleteExpenseAction(e.id);
                });
              }}
            >
              Anular
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
