"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  createExpenseAction,
  softDeleteExpenseAction,
} from "./actions";
import { Badge } from "@/components/ui/primitives";
import { formatCOP } from "@/lib/money";
import { formatDateCO, todayInBogota } from "@/lib/dates";

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
        Nueva factura / cuenta de cobro
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
      <div className="flex justify-between gap-3">
        <div>
          <h3 className="font-medium">Gasto operativo</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Arriendo, gas, seguridad u otros que no sean compra de insumos. Genera
            una solicitud de pago; el pago se hace allí.
          </p>
        </div>
        <button type="button" className="shrink-0 text-sm text-[var(--muted)]" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
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
          {suppliers.length === 0 ? (
            <span className="mt-1 block text-xs text-[var(--muted)]">
              No hay proveedores de gastos. Márquelos en Proveedores → maestro
              (“Proveedor de gastos”).
            </span>
          ) : null}
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Tipo documento</span>
          <select name="document_type" defaultValue="FACTURA" className={inputClass}>
            <option value="FACTURA">Factura</option>
            <option value="CUENTA_DE_COBRO">Cuenta de cobro</option>
            <option value="NOTA">Nota</option>
            <option value="OTRO">Otro</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Número</span>
          <input name="document_number" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Fecha *</span>
          <input
            type="date"
            name="expense_date"
            required
            defaultValue={todayInBogota()}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Vencimiento</span>
          <input type="date" name="due_date" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Monto a pagar *</span>
          <input name="amount" required className={inputClass} />
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">Concepto *</span>
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
          <span className="mb-1.5 block text-[var(--muted)]">Prioridad pago</span>
          <select name="priority" defaultValue="NORMAL" className={inputClass}>
            <option value="CRITICA">Crítica</option>
            <option value="ALTA">Alta</option>
            <option value="NORMAL">Normal</option>
            <option value="BAJA">Baja</option>
          </select>
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">Notas</span>
          <textarea name="notes" rows={2} className={inputClass} />
        </label>
      </div>
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      <button type="submit" disabled={pending} className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm text-white">
        {pending ? "Guardando…" : "Guardar y enviar a solicitudes"}
      </button>
    </form>
  );
}

export function ExpenseList({
  expenses,
  categories,
  suppliers,
}: {
  expenses: ExpenseRow[];
  categories: CategoryRow[];
  suppliers: SupplierOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));

  return (
    <div className="space-y-3">
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}
      {expenses.map((e) => (
        <article
          key={e.id}
          className="rounded-xl border border-[var(--line)] bg-white px-4 py-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium">{e.concept}</p>
              <p className="text-sm text-[var(--muted)]">
                {formatDateCO(e.expense_date)}
                {e.supplier_id && supplierMap.get(e.supplier_id)
                  ? ` · ${supplierMap.get(e.supplier_id)}`
                  : ""}
                {" · "}
                {catMap.get(e.category_id ?? "") ?? "Sin categoría"}
              </p>
            </div>
            <div className="text-right">
              <p className="font-medium">{formatCOP(e.total_amount)}</p>
              <Badge tone={statusTone(e.status)}>{e.status}</Badge>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {e.status !== "PAGADO" && e.status !== "ANULADO" ? (
              <Link
                href="/solicitudes-pago"
                className="text-xs font-medium text-[var(--accent)] underline"
              >
                Gestionar pago →
              </Link>
            ) : null}
            {e.status !== "PAGADO" && e.status !== "ANULADO" ? (
              <button
                type="button"
                disabled={pending}
                className="text-xs text-red-700 disabled:opacity-60"
                onClick={() => {
                  if (!confirm("¿Anular este gasto y su solicitud de pago?")) return;
                  setError(null);
                  startTransition(async () => {
                    const r = await softDeleteExpenseAction(e.id);
                    if (!r.ok) setError(r.error ?? "Error");
                  });
                }}
              >
                Anular
              </button>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}
