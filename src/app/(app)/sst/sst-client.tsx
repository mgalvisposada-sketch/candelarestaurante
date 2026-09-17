"use client";

import { useState, useTransition } from "react";
import { upsertSstRecordAction } from "./actions";

export type SstRow = {
  id: string;
  has_sg_sst: string | null;
  responsible_name: string | null;
  provider_name: string | null;
  monthly_cost: number | string | null;
  annual_cost: number | string | null;
  arl: string | null;
  documentation_status: string | null;
  last_review_date: string | null;
  next_review_date: string | null;
  notes: string | null;
};

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2";

export function SstForm({ record }: { record: SstRow | null }) {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-5"
      action={(fd) => {
        setError(null);
        setOk(false);
        startTransition(async () => {
          const r = await upsertSstRecordAction(fd);
          if (!r.ok) setError(r.error ?? "Error");
          else setOk(true);
        });
      }}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">¿Tiene SG-SST?</span>
          <select name="has_sg_sst" defaultValue={record?.has_sg_sst ?? ""} className={inputClass}>
            <option value="">—</option>
            <option value="SI">Sí</option>
            <option value="NO">No</option>
            <option value="EN_PROCESO">En proceso</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Estado documental</span>
          <input
            name="documentation_status"
            defaultValue={record?.documentation_status ?? ""}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Responsable</span>
          <input
            name="responsible_name"
            defaultValue={record?.responsible_name ?? ""}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Proveedor SST</span>
          <input
            name="provider_name"
            defaultValue={record?.provider_name ?? ""}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">ARL</span>
          <input name="arl" defaultValue={record?.arl ?? ""} className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Costo mensual</span>
          <input
            name="monthly_cost"
            defaultValue={record?.monthly_cost?.toString() ?? ""}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Costo anual</span>
          <input
            name="annual_cost"
            defaultValue={record?.annual_cost?.toString() ?? ""}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Última revisión</span>
          <input
            type="date"
            name="last_review_date"
            defaultValue={record?.last_review_date ?? ""}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Próxima revisión</span>
          <input
            type="date"
            name="next_review_date"
            defaultValue={record?.next_review_date ?? ""}
            className={inputClass}
          />
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">Notas</span>
          <textarea name="notes" rows={3} defaultValue={record?.notes ?? ""} className={inputClass} />
        </label>
      </div>
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      {ok ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Guardado</p> : null}
      <button type="submit" disabled={pending} className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm text-white">
        {pending ? "Guardando…" : "Guardar SST"}
      </button>
    </form>
  );
}
