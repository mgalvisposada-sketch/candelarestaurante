"use client";

import { useState, useTransition } from "react";
import { createContractAction, softDeleteContractAction } from "./actions";
import { Badge } from "@/components/ui/primitives";
import { formatCOP } from "@/lib/money";
import { formatDateCO, todayInBogota } from "@/lib/dates";

export type ContractRow = {
  id: string;
  counterparty: string;
  contract_type: string;
  start_date: string | null;
  end_date: string | null;
  auto_renewal: boolean;
  notice_days: number | null;
  cost_amount: number | string | null;
  periodicity: string | null;
  responsible_name: string | null;
  status: string;
  notes: string | null;
};

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2";

function daysUntil(date: string | null) {
  if (!date) return null;
  const today = todayInBogota();
  const t = new Date(`${today}T12:00:00`);
  const d = new Date(`${date}T12:00:00`);
  return Math.round((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24));
}

export function CreateContractForm() {
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
        Nuevo contrato
      </button>
    );
  }
  return (
    <form
      className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-5"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await createContractAction(fd);
          if (!r.ok) setError(r.error ?? "Error");
          else setOpen(false);
        });
      }}
    >
      <div className="flex justify-between">
        <h3 className="font-medium">Contrato</h3>
        <button type="button" className="text-sm text-[var(--muted)]" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">Contraparte</span>
          <input name="counterparty" required className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Tipo</span>
          <input name="contract_type" required placeholder="Arrendamiento, servicio…" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Costo</span>
          <input name="cost_amount" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Inicio</span>
          <input type="date" name="start_date" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Fin</span>
          <input type="date" name="end_date" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Aviso (días)</span>
          <input name="notice_days" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Periodicidad</span>
          <input name="periodicity" placeholder="Mensual…" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Responsable</span>
          <input name="responsible_name" className={inputClass} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="auto_renewal" value="true" />
          Renovación automática
        </label>
      </div>
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      <button type="submit" disabled={pending} className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm text-white">
        {pending ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}

export function ContractList({ contracts }: { contracts: ContractRow[] }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-3">
      {contracts.map((c) => {
        const days = daysUntil(c.end_date);
        const soon = days !== null && days <= (c.notice_days ?? 30);
        return (
          <article
            key={c.id}
            className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-[var(--line)] bg-white px-4 py-3"
          >
            <div>
              <p className="font-medium">{c.counterparty}</p>
              <p className="text-sm text-[var(--muted)]">
                {c.contract_type}
                {c.end_date ? ` · vence ${formatDateCO(c.end_date)}` : ""}
                {c.cost_amount != null ? ` · ${formatCOP(c.cost_amount)}` : ""}
                {c.periodicity ? ` · ${c.periodicity}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={c.status === "ACTIVO" ? "ok" : "neutral"}>{c.status}</Badge>
              {soon ? <Badge tone="warn">Por vencer</Badge> : null}
              <button
                type="button"
                disabled={pending}
                className="rounded-lg px-3 py-1.5 text-sm text-red-700"
                onClick={() => {
                  if (!confirm("¿Archivar contrato?")) return;
                  startTransition(async () => {
                    await softDeleteContractAction(c.id);
                  });
                }}
              >
                Archivar
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
