"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/primitives";
import { formatDateCO, formatDateTimeCO } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { CountListRow } from "../fisico/fisico-client";

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

export function PhysicalReviewQueue({ counts }: { counts: CountListRow[] }) {
  if (counts.length === 0) {
    return (
      <section className="overflow-hidden rounded-2xl border border-dashed border-[var(--line)] bg-white">
        <div className="px-5 py-10 text-center">
          <p className="font-medium">Bandeja vacía</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            No hay categorías enviadas esperando autorización.
          </p>
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
            Compare novedades (sistema vs contado) y aplique o rechace por
            categoría.
          </p>
        </div>
      </div>
      <ul className="divide-y divide-amber-200/70">
        {counts.map((c) => {
          const hasDiff = c.with_diff > 0;
          return (
            <li key={c.id}>
              <Link
                href={`/inventario/revision/${c.id}`}
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
                        Novedades {c.with_diff}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-[var(--accent)]">
                      Revisar novedades →
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
