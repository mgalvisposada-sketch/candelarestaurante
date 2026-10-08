"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { createPhysicalCountAction } from "../../compras/physical-inventory-actions";
import { Badge } from "@/components/ui/primitives";
import { formatDateCO, todayInBogota } from "@/lib/dates";

export type CountListRow = {
  id: string;
  title: string;
  status: string;
  counted_at: string;
  location_label: string | null;
};

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2";

function statusTone(status: string) {
  if (status === "AJUSTADO") return "ok" as const;
  if (status === "RECHAZADO") return "danger" as const;
  if (status === "ENVIADO") return "warn" as const;
  return "neutral" as const;
}

export function CreatePhysicalCountForm() {
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
        Nuevo conteo
      </button>
    );
  }

  return (
    <form
      className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-5"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await createPhysicalCountAction(fd);
          if (!r.ok) setError(r.error ?? "Error");
          else if (r.id) window.location.href = `/inventario/fisico/${r.id}`;
        });
      }}
    >
      <div className="flex justify-between">
        <h3 className="font-medium">Inventario físico</h3>
        <button type="button" className="text-sm text-[var(--muted)]" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
      <p className="text-sm text-[var(--muted)]">
        Conteo a ciegas: quien cuenta no ve el stock del sistema. Gestión compara y aplica (o rechaza) el ajuste.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">Título *</span>
          <input name="title" required placeholder="Conteo semanal cocina" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Fecha</span>
          <input type="date" name="counted_at" defaultValue={todayInBogota()} className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Punto / local</span>
          <input name="location_label" className={inputClass} />
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">Notas</span>
          <textarea name="notes" rows={2} className={inputClass} />
        </label>
      </div>
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      <button type="submit" disabled={pending} className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm text-white">
        {pending ? "Creando…" : "Crear y contar"}
      </button>
    </form>
  );
}

export function PhysicalCountList({ counts }: { counts: CountListRow[] }) {
  return (
    <div className="space-y-3">
      {counts.map((c) => (
        <Link
          key={c.id}
          href={`/inventario/fisico/${c.id}`}
          className="block rounded-xl border border-[var(--line)] bg-white px-4 py-3 transition hover:border-[var(--ink)]"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium">{c.title}</p>
              <p className="text-sm text-[var(--muted)]">
                {formatDateCO(c.counted_at)}
                {c.location_label ? ` · ${c.location_label}` : ""}
              </p>
            </div>
            <Badge tone={statusTone(c.status)}>{c.status}</Badge>
          </div>
        </Link>
      ))}
    </div>
  );
}
