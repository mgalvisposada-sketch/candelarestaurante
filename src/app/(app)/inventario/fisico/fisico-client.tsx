"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { createPhysicalCountAction } from "../../compras/physical-inventory-actions";
import { Badge } from "@/components/ui/primitives";
import { formatDateCO, formatDateTimeCO, todayInBogota } from "@/lib/dates";
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
  ENVIADO: { label: "Por revisar", tone: "warn" },
  AJUSTADO: { label: "Ajustado", tone: "ok" },
  RECHAZADO: { label: "Rechazado", tone: "danger" },
};

type ListFilter = "all" | "BORRADOR" | "AJUSTADO" | "RECHAZADO";

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
        Conteo a ciegas: quien cuenta no ve el stock del sistema. Gestión compara
        y aplica (o rechaza) el ajuste.
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

export function ReviewQueue({
  counts,
  canAdjust,
}: {
  counts: CountListRow[];
  canAdjust: boolean;
}) {
  if (counts.length === 0) {
    return (
      <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
        <div className="border-b border-[var(--line)] px-5 py-4">
          <h3 className="font-medium">Por revisar</h3>
          <p className="text-sm text-[var(--muted)]">
            {canAdjust
              ? "No hay conteos esperando autorización."
              : "Cuando envíe un conteo, aparecerá aquí hasta que Gestión lo revise."}
          </p>
        </div>
        <div className="px-5 py-8 text-center text-sm text-[var(--muted)]">
          Bandeja vacía
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/40">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-amber-200/80 px-5 py-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">Por revisar</h3>
            <Badge tone="warn">{counts.length}</Badge>
          </div>
          <p className="mt-0.5 text-sm text-amber-950/70">
            {canAdjust
              ? "Compare diferencias y aplique o rechace el ajuste al stock."
              : "Enviados a Gestión. Puede abrirlos para consultar el avance."}
          </p>
        </div>
      </div>
      <ul className="divide-y divide-amber-200/70">
        {counts.map((c) => {
          const hasDiff = c.with_diff > 0;
          return (
            <li key={c.id}>
              <Link
                href={`/inventario/fisico/${c.id}`}
                className="block bg-white/70 px-5 py-4 transition hover:bg-white"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{c.title}</p>
                      <Badge tone="warn">Por revisar</Badge>
                    </div>
                    <CountMeta count={c} />
                    {c.submitted_at ? (
                      <p className="text-xs text-[var(--muted)]">
                        Enviado {formatDateTimeCO(c.submitted_at)}
                      </p>
                    ) : null}
                    {c.notes ? (
                      <p className="line-clamp-1 text-xs text-[var(--muted)]">
                        {c.notes}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-2 text-right">
                    <div className="flex flex-wrap justify-end gap-1.5 text-xs">
                      <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-800">
                        Igual {c.match_count}
                      </span>
                      <span
                        className={cn(
                          "rounded-md px-2 py-1",
                          hasDiff
                            ? "bg-amber-100 text-amber-950"
                            : "bg-neutral-100 text-neutral-600",
                        )}
                      >
                        Con dif. {c.with_diff}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-[var(--accent)]">
                      {canAdjust ? "Revisar y autorizar →" : "Ver detalle →"}
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
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

  const pending = useMemo(
    () => counts.filter((c) => c.status === "ENVIADO"),
    [counts],
  );

  const rest = useMemo(() => {
    const base = counts.filter((c) => c.status !== "ENVIADO");
    if (filter === "all") return base;
    return base.filter((c) => c.status === filter);
  }, [counts, filter]);

  const filterCounts = useMemo(() => {
    const drafts = counts.filter((c) => c.status === "BORRADOR").length;
    const adjusted = counts.filter((c) => c.status === "AJUSTADO").length;
    const rejected = counts.filter((c) => c.status === "RECHAZADO").length;
    return { drafts, adjusted, rejected };
  }, [counts]);

  return (
    <div className="space-y-6">
      <ReviewQueue counts={pending} canAdjust={canAdjust} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-medium">Historial y borradores</h3>
            <p className="text-sm text-[var(--muted)]">
              Conteos en curso, ajustados o rechazados.
            </p>
          </div>
          <div className="flex flex-wrap rounded-xl border border-[var(--line)] bg-white p-1 text-sm">
            {(
              [
                ["all", "Todos", rest.length],
                ["BORRADOR", "Contando", filterCounts.drafts],
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

        {rest.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white px-5 py-10 text-center text-sm text-[var(--muted)]">
            No hay conteos en este filtro.
          </div>
        ) : (
          <ul className="space-y-2">
            {rest.map((c) => {
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
