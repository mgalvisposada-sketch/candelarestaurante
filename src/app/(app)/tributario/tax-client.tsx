"use client";

import { useState, useTransition } from "react";
import {
  createTaxObligationAction,
  softDeleteTaxAction,
  updateTaxStatusAction,
} from "./actions";
import { Badge } from "@/components/ui/primitives";
import { formatCOP } from "@/lib/money";
import { formatDateCO } from "@/lib/dates";

export type TaxRow = {
  id: string;
  obligation_type: string;
  period: string | null;
  due_date: string | null;
  declared_amount: number | string | null;
  paid_amount: number | string | null;
  balance_amount: number | string | null;
  status: string;
};

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2";

function tone(s: string) {
  if (s === "PAGADA" || s === "PRESENTADA") return "ok" as const;
  if (s === "VENCIDA") return "danger" as const;
  return "warn" as const;
}

export function CreateTaxForm() {
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
        Nueva obligación
      </button>
    );
  }
  return (
    <form
      className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-5"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await createTaxObligationAction(fd);
          if (!r.ok) setError(r.error ?? "Error");
          else setOpen(false);
        });
      }}
    >
      <div className="flex justify-between">
        <h3 className="font-medium">Obligación tributaria</h3>
        <button type="button" className="text-sm text-[var(--muted)]" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">Tipo</span>
          <input
            name="obligation_type"
            required
            placeholder="IVA, Retención, Renta…"
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Periodo</span>
          <input name="period" placeholder="2026-08" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Vence</span>
          <input type="date" name="due_date" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Declarado</span>
          <input name="declared_amount" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Saldo</span>
          <input name="balance_amount" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Estado</span>
          <select name="status" defaultValue="PENDIENTE" className={inputClass}>
            <option value="PENDIENTE">Pendiente</option>
            <option value="PRESENTADA">Presentada</option>
            <option value="PAGADA">Pagada</option>
            <option value="VENCIDA">Vencida</option>
            <option value="EN_ACUERDO">En acuerdo</option>
            <option value="NO_APLICA">No aplica</option>
          </select>
        </label>
      </div>
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      <button type="submit" disabled={pending} className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm text-white">
        {pending ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}

export function TaxList({ rows }: { rows: TaxRow[] }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <article
          key={r.id}
          className="rounded-xl border border-[var(--line)] bg-white px-4 py-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium">{r.obligation_type}</p>
              <p className="text-sm text-[var(--muted)]">
                {r.period || "Sin periodo"}
                {r.due_date ? ` · vence ${formatDateCO(r.due_date)}` : ""}
                {r.balance_amount != null ? ` · saldo ${formatCOP(r.balance_amount)}` : ""}
              </p>
            </div>
            <Badge tone={tone(r.status)}>{r.status}</Badge>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {r.status === "PENDIENTE" ? (
              <button
                type="button"
                disabled={pending}
                className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm"
                onClick={() =>
                  startTransition(async () => {
                    await updateTaxStatusAction(r.id, "PRESENTADA");
                  })
                }
              >
                Presentada
              </button>
            ) : null}
            {r.status === "PRESENTADA" || r.status === "PENDIENTE" ? (
              <button
                type="button"
                disabled={pending}
                className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm"
                onClick={() =>
                  startTransition(async () => {
                    await updateTaxStatusAction(r.id, "PAGADA");
                  })
                }
              >
                Pagada
              </button>
            ) : null}
            <button
              type="button"
              disabled={pending}
              className="rounded-lg px-3 py-1.5 text-sm text-red-700"
              onClick={() => {
                if (!confirm("¿Eliminar obligación?")) return;
                startTransition(async () => {
                  await softDeleteTaxAction(r.id);
                });
              }}
            >
              Eliminar
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
