"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export type CocinaSearchHit = {
  id: string;
  kind:
    | "MATERIA_PRIMA"
    | "INSUMO_PREPARACION"
    | "PREPARACION"
    | "PRODUCTO_CARTA"
    | "PRODUCCION";
  name: string;
  subtitle?: string | null;
  href: string;
  meta?: string | null;
};

const KIND_LABEL: Record<CocinaSearchHit["kind"], string> = {
  MATERIA_PRIMA: "Materia prima",
  INSUMO_PREPARACION: "Insumo",
  PREPARACION: "Preparación",
  PRODUCTO_CARTA: "Carta",
  PRODUCCION: "Batch",
};

const KIND_HREF_FALLBACK: Record<CocinaSearchHit["kind"], string> = {
  MATERIA_PRIMA: "/inventario/maestro",
  INSUMO_PREPARACION: "/cocina/insumos",
  PREPARACION: "/cocina/preparaciones",
  PRODUCTO_CARTA: "/cocina/carta",
  PRODUCCION: "/cocina/producciones",
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function CocinaSearch({ hits }: { hits: CocinaSearchHit[] }) {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const q = normalize(deferred);

  const results = useMemo(() => {
    if (!q) return [];
    const scored: Array<{ hit: CocinaSearchHit; score: number }> = [];
    for (const hit of hits) {
      const name = normalize(hit.name);
      const sub = normalize(hit.subtitle ?? "");
      const meta = normalize(hit.meta ?? "");
      const kind = normalize(KIND_LABEL[hit.kind]);
      const haystack = `${name} ${sub} ${meta} ${kind}`;
      if (!haystack.includes(q)) continue;
      let score = 0;
      if (name.startsWith(q)) score += 100;
      else if (name.includes(q)) score += 60;
      if (sub.includes(q)) score += 20;
      if (meta.includes(q)) score += 10;
      if (kind.includes(q)) score += 5;
      scored.push({ hit, score });
    }
    scored.sort((a, b) => b.score - a.score || a.hit.name.localeCompare(b.hit.name, "es"));
    return scored.slice(0, 40).map((s) => s.hit);
  }, [hits, q]);

  const byKind = useMemo(() => {
    const map = new Map<CocinaSearchHit["kind"], CocinaSearchHit[]>();
    for (const hit of results) {
      const list = map.get(hit.kind) ?? [];
      list.push(hit);
      map.set(hit.kind, list);
    }
    return map;
  }, [results]);

  const order: CocinaSearchHit["kind"][] = [
    "MATERIA_PRIMA",
    "INSUMO_PREPARACION",
    "PREPARACION",
    "PRODUCTO_CARTA",
    "PRODUCCION",
  ];

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-white p-4 sm:p-5">
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
          Buscar en cocina
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Materia prima, insumo, preparación, carta o batch…"
          autoComplete="off"
          enterKeyHint="search"
          className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-base outline-none ring-[var(--accent)] focus:bg-white focus:ring-2 sm:text-sm"
        />
      </label>
      <p className="mt-2 text-xs text-[var(--muted)]">
        Busca en todo el catálogo de la cascada y en el historial de batches.
      </p>

      {q ? (
        <div className="mt-4 space-y-4">
          {results.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--line)] px-4 py-6 text-center text-sm text-[var(--muted)]">
              Nada coincide con «{query.trim()}».
            </p>
          ) : (
            <>
              <p className="text-sm text-[var(--muted)]">
                {results.length} resultado{results.length === 1 ? "" : "s"}
              </p>
              {order.map((kind) => {
                const group = byKind.get(kind);
                if (!group?.length) return null;
                return (
                  <div key={kind}>
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                        {KIND_LABEL[kind]}
                      </h3>
                      <Link
                        href={KIND_HREF_FALLBACK[kind]}
                        className="text-xs text-[var(--muted)] underline-offset-2 hover:underline"
                      >
                        Ver todos
                      </Link>
                    </div>
                    <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-[var(--line)]">
                      {group.map((hit) => (
                        <li key={`${hit.kind}-${hit.id}`}>
                          <Link
                            href={hit.href}
                            className={cn(
                              "flex flex-wrap items-center justify-between gap-2 px-4 py-3 transition-colors",
                              "hover:bg-[var(--surface)]",
                            )}
                          >
                            <div className="min-w-0">
                              <p className="font-medium leading-snug">{hit.name}</p>
                              {hit.subtitle ? (
                                <p className="mt-0.5 text-xs text-[var(--muted)]">
                                  {hit.subtitle}
                                </p>
                              ) : null}
                            </div>
                            {hit.meta ? (
                              <span className="shrink-0 text-xs tabular-nums text-[var(--muted)]">
                                {hit.meta}
                              </span>
                            ) : null}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
