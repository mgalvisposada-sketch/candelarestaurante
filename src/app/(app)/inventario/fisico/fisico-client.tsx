"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { createPhysicalCountAction } from "../../compras/physical-inventory-actions";
import { Badge } from "@/components/ui/primitives";
import { formatDateCO, todayInBogota } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type CountListRow = {
  id: string;
  title: string;
  status: string;
  counted_at: string;
  location_label: string | null;
  notes: string | null;
  submitted_at: string | null;
  counted_by_name: string | null;
  items_count: number;
  with_diff: number;
  match_count: number;
};

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2";

const STATUS_META: Record<
  string,
  { label: string; tone: "neutral" | "ok" | "warn" | "danger" | "info" }
> = {
  BORRADOR: { label: "Contando", tone: "info" },
  ENVIADO: { label: "En revisión", tone: "warn" },
  AJUSTADO: { label: "Ajustado", tone: "ok" },
  RECHAZADO: { label: "Rechazado", tone: "danger" },
};

type ListFilter = "all" | "BORRADOR" | "ENVIADO" | "AJUSTADO" | "RECHAZADO";

export function CreatePhysicalCountForm() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl bg-[var(--ink)] px-4 py-2.5 text-sm font-medium text-white"
      >
        Nuevo conteo
      </button>
    );
  }

  return (
    <form
      className="space-y-4 rounded-2xl border border-[var(--line)] bg-white p-5"
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
        <button
          type="button"
          className="text-sm text-[var(--muted)]"
          onClick={() => setOpen(false)}
        >
          Cancelar
        </button>
      </div>
      <p className="text-sm text-[var(--muted)]">
        Incluye materia prima, insumos y preparaciones. Quien cuenta no ve el
        stock del sistema; al autorizar, el físico reemplaza el stock del
        sistema.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">Título *</span>
          <input
            name="title"
            required
            placeholder="Conteo semanal cocina"
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Fecha</span>
          <input
            type="date"
            name="counted_at"
            defaultValue={todayInBogota()}
            className={inputClass}
          />
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
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-[var(--ink)] px-5 py-2.5 text-sm text-white"
      >
        {pending ? "Creando…" : "Crear y contar"}
      </button>
    </form>
  );
}

function CountMeta({ count }: { count: CountListRow }) {
  return (
    <p className="text-sm text-[var(--muted)]">
      {formatDateCO(count.counted_at)}
      {count.location_label ? ` · ${count.location_label}` : ""}
      {count.counted_by_name ? ` · ${count.counted_by_name}` : ""}
      {count.items_count > 0 ? ` · ${count.items_count} productos` : ""}
    </p>
  );
}

export function PhysicalCountList({
  counts,
  canAdjust,
}: {
  counts: CountListRow[];
  canAdjust: boolean;
}) {
  const [filter, setFilter] = useState<ListFilter>("all");

  const pendingReview = useMemo(
    () => counts.filter((c) => c.status === "ENVIADO").length,
    [counts],
  );

  const filtered = useMemo(() => {
    if (filter === "all") return counts;
    return counts.filter((c) => c.status === filter);
  }, [counts, filter]);

  const filterCounts = useMemo(() => {
    const drafts = counts.filter((c) => c.status === "BORRADOR").length;
    const sent = counts.filter((c) => c.status === "ENVIADO").length;
    const adjusted = counts.filter((c) => c.status === "AJUSTADO").length;
    const rejected = counts.filter((c) => c.status === "RECHAZADO").length;
    return { drafts, sent, adjusted, rejected };
  }, [counts]);

  return (
    <div className="space-y-6">
      {canAdjust && pendingReview > 0 ? (
        <Link
          href="/inventario/revision"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/50 px-5 py-4 transition hover:bg-amber-50"
        >
          <div>
            <p className="font-medium">
              {pendingReview} conteo{pendingReview === 1 ? "" : "s"} por revisar
            </p>
            <p className="mt-0.5 text-sm text-amber-950/70">
              La auditoría (novedades, aplicar o rechazar) está en Revisión
              física.
            </p>
          </div>
          <span className="text-sm font-medium text-[var(--accent)]">
            Ir a revisión →
          </span>
        </Link>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-medium">Conteos</h3>
            <p className="text-sm text-[var(--muted)]">
              Crear, digitar y enviar categorías a revisión.
            </p>
          </div>
          <div className="flex flex-wrap rounded-xl border border-[var(--line)] bg-white p-1 text-sm">
            {(
              [
                ["all", "Todos", filtered.length],
                ["BORRADOR", "Contando", filterCounts.drafts],
                ["ENVIADO", "En revisión", filterCounts.sent],
                ["AJUSTADO", "Ajustados", filterCounts.adjusted],
                ["RECHAZADO", "Rechazados", filterCounts.rejected],
              ] as const
            ).map(([value, label, n]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={cn(
                  "rounded-lg px-3 py-1.5 transition",
                  filter === value
                    ? "bg-[var(--ink)] text-white"
                    : "text-[var(--muted)] hover:text-[var(--ink)]",
                )}
              >
                {label}
                {value !== "all" ? (
                  <span className="ml-1 opacity-70">{n}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white px-5 py-10 text-center text-sm text-[var(--muted)]">
            No hay conteos en este filtro.
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((c) => {
              const meta = STATUS_META[c.status] ?? {
                label: c.status,
                tone: "neutral" as const,
              };
              return (
                <li key={c.id}>
                  <Link
                    href={`/inventario/fisico/${c.id}`}
                    className="block rounded-2xl border border-[var(--line)] bg-white px-4 py-3.5 transition hover:border-[var(--ink)]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{c.title}</p>
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                        </div>
                        <CountMeta count={c} />
                      </div>
                      <span className="text-sm text-[var(--muted)]">Abrir →</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
