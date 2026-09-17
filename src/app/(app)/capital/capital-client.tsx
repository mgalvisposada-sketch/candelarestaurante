"use client";

import { useState, useTransition } from "react";
import {
  createFundingAllocationAction,
  updateFundingAllocationAction,
} from "../prestamos/actions";
import { formatCOP } from "@/lib/money";
import { formatDateCO } from "@/lib/dates";
import { computeFundingBag } from "@/lib/loans";

export type DisbursementWithLoan = {
  id: string;
  loan_id: string;
  disbursement_date: string;
  amount: number | string;
  lender_name: string;
};

export type AllocationRow = {
  id: string;
  loan_disbursement_id: string;
  category: string;
  concept: string | null;
  approved_amount: number | string;
  committed_amount: number | string;
  paid_amount: number | string;
  notes: string | null;
};

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2";

const CATEGORIES = [
  "CxP",
  "Nómina",
  "Impuestos",
  "Capital de trabajo",
  "Tecnología",
  "Infraestructura",
  "Otro",
];

export function CreateAllocationForm({
  disbursements,
}: {
  disbursements: DisbursementWithLoan[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (disbursements.length === 0) return null;
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-[var(--ink)] px-4 py-2.5 text-sm font-medium text-white"
      >
        Asignar bolsa
      </button>
    );
  }

  return (
    <form
      className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-5"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await createFundingAllocationAction(fd);
          if (!r.ok) setError(r.error ?? "Error");
          else setOpen(false);
        });
      }}
    >
      <div className="flex justify-between">
        <h3 className="font-medium">Nueva asignación</h3>
        <button type="button" className="text-sm text-[var(--muted)]" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">Desembolso</span>
          <select name="loan_disbursement_id" required className={inputClass}>
            {disbursements.map((d) => (
              <option key={d.id} value={d.id}>
                {d.lender_name} · {formatDateCO(d.disbursement_date)} · {formatCOP(d.amount)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Categoría</span>
          <select name="category" required className={inputClass}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Concepto</span>
          <input name="concept" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Aprobado</span>
          <input name="approved_amount" required className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Comprometido</span>
          <input name="committed_amount" defaultValue="0" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Pagado</span>
          <input name="paid_amount" defaultValue="0" className={inputClass} />
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">Notas</span>
          <input name="notes" className={inputClass} />
        </label>
      </div>
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm text-white disabled:opacity-60"
      >
        {pending ? "Guardando…" : "Guardar bolsa"}
      </button>
    </form>
  );
}

export function AllocationCard({
  allocation,
  disbursement,
}: {
  allocation: AllocationRow;
  disbursement: DisbursementWithLoan | undefined;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const bag = computeFundingBag({
    approved: allocation.approved_amount,
    committed: allocation.committed_amount,
    paid: allocation.paid_amount,
  });

  return (
    <article className="rounded-xl border border-[var(--line)] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">{allocation.category}</h3>
          <p className="text-sm text-[var(--muted)]">
            {allocation.concept || "Sin concepto"}
            {disbursement
              ? ` · ${disbursement.lender_name} · ${formatDateCO(disbursement.disbursement_date)}`
              : null}
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm"
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? "Cerrar" : "Actualizar"}
        </button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-4 text-sm">
        <div>
          Aprobado: <strong>{formatCOP(bag.aprobado)}</strong>
        </div>
        <div>
          Comprometido: <strong>{formatCOP(bag.comprometido)}</strong>
        </div>
        <div>
          Pagado: <strong>{formatCOP(bag.pagado)}</strong>
        </div>
        <div>
          Disponible: <strong>{formatCOP(bag.disponible)}</strong>
        </div>
      </div>
      {editing ? (
        <form
          className="mt-4 grid gap-3 border-t border-[var(--line)] pt-4 md:grid-cols-2"
          action={(fd) => {
            setError(null);
            startTransition(async () => {
              const r = await updateFundingAllocationAction(allocation.id, fd);
              if (!r.ok) setError(r.error ?? "Error");
              else setEditing(false);
            });
          }}
        >
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Categoría</span>
            <select name="category" defaultValue={allocation.category} className={inputClass}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Concepto</span>
            <input name="concept" defaultValue={allocation.concept ?? ""} className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Aprobado</span>
            <input
              name="approved_amount"
              defaultValue={allocation.approved_amount.toString()}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Comprometido</span>
            <input
              name="committed_amount"
              defaultValue={allocation.committed_amount.toString()}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Pagado</span>
            <input
              name="paid_amount"
              defaultValue={allocation.paid_amount.toString()}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Notas</span>
            <input name="notes" defaultValue={allocation.notes ?? ""} className={inputClass} />
          </label>
          {error ? <p className="text-sm text-red-700 md:col-span-2">{error}</p> : null}
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white md:col-span-2"
          >
            Guardar
          </button>
        </form>
      ) : null}
    </article>
  );
}
