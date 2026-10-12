"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  applyPhysicalCountAdjustmentsAction,
  applyPhysicalCountCategoryAction,
  correctPhysicalCountItemAction,
  rejectPhysicalCountCategoryAction,
} from "../../../compras/physical-inventory-actions";
import {
  normalizePhysicalCategoryId,
  PHYSICAL_COUNT_NONE_CATEGORY,
} from "@/lib/inventory/physical-count";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export type ReviewCount = {
  id: string;
  title: string;
  status: string;
  counted_at: string;
  location_label: string | null;
  notes: string | null;
};

export type ReviewItem = {
  id: string;
  product_id: string;
  product_name: string;
  unit: string;
  category_id: string | null;
  category_name: string;
  item_kind_label: string;
  system_qty: number | string;
  counted_qty: number | string;
  difference_qty: number | string;
  created_by_name: string | null;
};

type ViewMode = "novedades" | "all";

const inputClass =
  "w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm outline-none ring-[var(--accent)] focus:ring-2";

function formatQty(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  if (Number.isNaN(n)) return "0";
  return new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: 3,
  }).format(n);
}

function catKey(categoryId: string | null | undefined) {
  return normalizePhysicalCategoryId(categoryId);
}

export function PhysicalReviewDetailClient({
  count,
  items,
}: {
  count: ReviewCount;
  items: ReviewItem[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [view, setView] = useState<ViewMode>("novedades");
  const [query, setQuery] = useState("");
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);
  const [categoryInit, setCategoryInit] = useState(false);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [localItems, setLocalItems] = useState(items);
  const [draftQty, setDraftQty] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  const groups = useMemo(() => {
    const q = query
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

    const byCat = new Map<
      string,
      {
        categoryId: string;
        label: string;
        items: ReviewItem[];
        novedades: number;
      }
    >();

    for (const item of localItems) {
      const diff = Number(item.difference_qty ?? 0);
      if (view === "novedades" && diff === 0) continue;
      if (
        q &&
        !item.product_name
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .includes(q)
      ) {
        continue;
      }

      const categoryId = catKey(item.category_id);
      const group = byCat.get(categoryId) ?? {
        categoryId,
        label:
          categoryId === PHYSICAL_COUNT_NONE_CATEGORY
            ? "Sin categoría"
            : item.category_name,
        items: [],
        novedades: 0,
      };
      group.items.push(item);
      if (diff !== 0) group.novedades += 1;
      byCat.set(categoryId, group);
    }

    // Si filtra solo novedades, igual mostrar categorías con ítems ENVIADO
    // que solo tienen iguales (para poder aplicar/rechazar la categoría).
    if (view === "novedades" && !q) {
      const categoriesInReview = new Set(
        localItems.map((i) => catKey(i.category_id)),
      );
      for (const categoryId of categoriesInReview) {
        if (byCat.has(categoryId)) continue;
        const catItems = localItems.filter(
          (i) => catKey(i.category_id) === categoryId,
        );
        if (!catItems.length) continue;
        byCat.set(categoryId, {
          categoryId,
          label:
            categoryId === PHYSICAL_COUNT_NONE_CATEGORY
              ? "Sin categoría"
              : catItems[0]!.category_name,
          items: [],
          novedades: 0,
        });
      }
    }

    return [...byCat.values()]
      .map((g) => ({
        ...g,
        items: [...g.items].sort((a, b) => {
          const da = Math.abs(Number(a.difference_qty ?? 0));
          const db = Math.abs(Number(b.difference_qty ?? 0));
          if (da !== db) return db - da;
          return a.product_name.localeCompare(b.product_name, "es");
        }),
        totalInCategory: localItems.filter(
          (i) => catKey(i.category_id) === g.categoryId,
        ).length,
      }))
      .sort((a, b) => {
        if (a.novedades !== b.novedades) return b.novedades - a.novedades;
        return a.label.localeCompare(b.label, "es");
      });
  }, [localItems, query, view]);

  const totalNovedades = localItems.filter(
    (i) => Number(i.difference_qty ?? 0) !== 0,
  ).length;

  function qtyValue(item: ReviewItem) {
    return draftQty[item.id] ?? String(item.counted_qty);
  }

  function saveCorrection(item: ReviewItem) {
    const raw = qtyValue(item).trim();
    const next = Number(raw.replace(/,/g, ""));
    if (raw === "" || Number.isNaN(next) || next < 0) {
      setError("Cantidad contada inválida");
      return;
    }
    if (next === Number(item.counted_qty)) {
      setDraftQty((prev) => {
        const copy = { ...prev };
        delete copy[item.id];
        return copy;
      });
      return;
    }

    setSavingId(item.id);
    setError(null);
    const fd = new FormData();
    fd.set("item_id", item.id);
    fd.set("counted_qty", String(next));
    startTransition(async () => {
      const r = await correctPhysicalCountItemAction(count.id, fd);
      setSavingId(null);
      if (!r.ok) {
        setError(r.error ?? "Error al corregir");
        return;
      }
      const system = Number(item.system_qty ?? 0);
      setLocalItems((prev) =>
        prev.map((row) =>
          row.id === item.id
            ? {
                ...row,
                counted_qty: next,
                difference_qty: next - system,
              }
            : row,
        ),
      );
      setDraftQty((prev) => {
        const copy = { ...prev };
        delete copy[item.id];
        return copy;
      });
      router.refresh();
    });
  }

  useEffect(() => {
    if (categoryInit || groups.length === 0) return;
    setOpenCategoryId(
      groups.find((g) => g.novedades > 0)?.categoryId ??
        groups[0]?.categoryId ??
        null,
    );
    setCategoryInit(true);
  }, [categoryInit, groups]);

  if (localItems.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white px-5 py-10 text-center">
          <p className="font-medium">Nada por revisar en este conteo</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            No hay categorías enviadas esperando autorización.
          </p>
          <Link
            href="/inventario/revision"
            className="mt-4 inline-flex text-sm text-[var(--accent)] hover:underline"
          >
            ← Volver a la bandeja
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <header className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
        <div
          aria-hidden
          className="h-1 bg-[linear-gradient(90deg,var(--accent),var(--gold))]"
        />
        <div className="flex flex-col gap-4 p-4 sm:p-5 md:flex-row md:items-start md:justify-between md:p-6">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
                {count.title}
              </h2>
              <Badge tone="warn">En revisión</Badge>
            </div>
            <p className="text-sm text-[var(--muted)]">
              {count.counted_at}
              {count.location_label ? ` · ${count.location_label}` : ""}
            </p>
            {count.notes ? (
              <p className="max-w-2xl text-sm text-[var(--muted)]">{count.notes}</p>
            ) : null}
            <p className="text-sm text-[var(--muted)]">
              Puede corregir cantidades mal digitadas (p. ej. gramos cuando la
              unidad es kilos) antes de aplicar. Al aplicar, el stock queda en
              lo contado. Rechazar devuelve la categoría a conteo.
            </p>
          </div>
          <div className="w-full space-y-3 rounded-xl bg-white/80 px-4 py-3 shadow-[0_1px_0_rgba(18,18,18,0.04)] md:min-w-[200px] md:w-auto">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
                En revisión
              </p>
              <p className="font-display text-2xl font-bold tabular-nums">
                {localItems.length}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {totalNovedades} novedad{totalNovedades === 1 ? "" : "es"} ·{" "}
                {localItems.length - totalNovedades} iguales
              </p>
            </div>
            <button
              type="button"
              disabled={pending}
              className="min-h-11 w-full rounded-xl bg-[var(--ink)] px-4 text-sm font-medium text-white disabled:opacity-50"
              onClick={() => {
                if (
                  !confirm(
                    `¿Aplicar todos los ajustes de “${count.title}” (${localItems.length} productos) al stock?`,
                  )
                ) {
                  return;
                }
                startTransition(async () => {
                  setError(null);
                  const r = await applyPhysicalCountAdjustmentsAction(count.id);
                  if (!r.ok) setError(r.error ?? "Error");
                  else router.refresh();
                });
              }}
            >
              Aplicar todo
            </button>
          </div>
        </div>
      </header>

      <div className="sticky top-[3.25rem] z-20 -mx-4 space-y-2 border-b border-[var(--line)] bg-[var(--bg)]/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
        <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar producto…"
            className={cn(inputClass, "w-full md:max-w-sm")}
            autoComplete="off"
            enterKeyHint="search"
          />
          <div className="grid grid-cols-2 rounded-xl border border-[var(--line)] bg-white p-1 text-sm md:inline-flex md:w-auto">
            {(
              [
                ["novedades", "Solo novedades"],
                ["all", "Todos"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setView(value)}
                className={cn(
                  "min-h-10 rounded-lg px-3 py-2 transition md:min-h-0 md:py-1.5",
                  view === value
                    ? "bg-[var(--ink)] text-white"
                    : "text-[var(--muted)] hover:text-[var(--ink)]",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <div className="space-y-3">
        {groups.map((group) => {
          const open = openCategoryId === group.categoryId;
          const visibleCount =
            view === "novedades" && !query
              ? group.novedades
              : group.items.length;

          return (
            <div
              key={group.categoryId}
              className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white"
            >
              <button
                type="button"
                className="flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-[var(--surface)]/60"
                onClick={() =>
                  setOpenCategoryId(open ? null : group.categoryId)
                }
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{group.label}</p>
                    <Badge tone="warn">
                      {group.totalInCategory} en revisión
                    </Badge>
                    {group.novedades > 0 ? (
                      <Badge tone="accent">
                        {group.novedades} novedad
                        {group.novedades === 1 ? "" : "es"}
                      </Badge>
                    ) : (
                      <Badge tone="ok">Sin novedades</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-[var(--muted)]">
                    {visibleCount} en vista
                    {view === "novedades" && group.novedades === 0
                      ? " · puede aplicar aunque todo coincida"
                      : ""}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 text-xs text-[var(--muted)] transition-transform",
                    open && "rotate-180",
                  )}
                  aria-hidden
                >
                  ▼
                </span>
              </button>

              {open ? (
                <div className="border-t border-[var(--line)]">
                  {view === "novedades" &&
                  group.totalInCategory > group.items.length &&
                  group.items.length > 0 ? (
                    <p className="border-b border-[var(--line)] px-4 py-2 text-xs text-[var(--muted)]">
                      Mostrando {group.items.length} novedad
                      {group.items.length === 1 ? "" : "es"};{" "}
                      {group.totalInCategory - group.items.length} sin
                      diferencia se aplican igual.
                    </p>
                  ) : null}

                  {group.items.length > 0 ? (
                    <ul className="divide-y divide-[var(--line)]">
                      {group.items.map((item) => {
                        const diff = Number(item.difference_qty ?? 0);
                        const isNovedad = diff !== 0;
                        const draft = qtyValue(item);
                        const dirty =
                          draft.trim() !== "" &&
                          Number(draft.replace(/,/g, "")) !==
                            Number(item.counted_qty);
                        return (
                          <li
                            key={item.id}
                            className={cn(
                              "space-y-3 px-4 py-3.5 sm:grid sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4 sm:space-y-0",
                              isNovedad ? "bg-amber-50/40" : "",
                            )}
                          >
                            <div className="min-w-0">
                              <p className="font-medium leading-snug">
                                {item.product_name}
                              </p>
                              <p className="mt-0.5 text-xs text-[var(--muted)]">
                                {item.item_kind_label ? (
                                  <span className="mr-2 font-medium text-[var(--ink)]">
                                    {item.item_kind_label}
                                  </span>
                                ) : null}
                                <span className="font-semibold text-[var(--ink)]">
                                  {item.unit}
                                </span>
                                {item.created_by_name ? (
                                  <span className="ml-2">
                                    · {item.created_by_name}
                                  </span>
                                ) : null}
                                {isNovedad ? (
                                  <span className="ml-2 font-medium text-amber-800">
                                    Novedad
                                  </span>
                                ) : (
                                  <span className="ml-2 font-medium text-emerald-800">
                                    Igual
                                  </span>
                                )}
                              </p>
                              <p className="mt-1 text-xs text-[var(--muted)]">
                                Sistema {formatQty(item.system_qty)} → Contado{" "}
                                {formatQty(item.counted_qty)} · Dif.{" "}
                                <span
                                  className={cn(
                                    "font-medium",
                                    diff < 0
                                      ? "text-red-700"
                                      : diff > 0
                                        ? "text-emerald-700"
                                        : "",
                                  )}
                                >
                                  {diff > 0
                                    ? `+${formatQty(diff)}`
                                    : formatQty(diff)}
                                </span>
                              </p>
                            </div>
                            <div className="flex items-stretch gap-2">
                              <div className="min-w-0 flex-1 sm:w-36 sm:flex-none">
                                <div className="flex items-center gap-1.5">
                                  <input
                                    inputMode="decimal"
                                    value={draft}
                                    onChange={(e) =>
                                      setDraftQty((prev) => ({
                                        ...prev,
                                        [item.id]: e.target.value,
                                      }))
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        saveCorrection(item);
                                      }
                                    }}
                                    aria-label={`Cantidad contada de ${item.product_name} en ${item.unit}`}
                                    className={cn(
                                      inputClass,
                                      "min-h-12 font-display text-xl font-semibold tabular-nums",
                                    )}
                                  />
                                  <span className="shrink-0 text-xs font-semibold text-[var(--muted)]">
                                    {item.unit}
                                  </span>
                                </div>
                                <p className="mt-1 text-[10px] text-[var(--muted)]">
                                  Corregir si digitó en otra unidad
                                </p>
                              </div>
                              <button
                                type="button"
                                disabled={
                                  savingId === item.id ||
                                  pending ||
                                  draft.trim() === "" ||
                                  !dirty
                                }
                                className="min-h-12 shrink-0 rounded-xl bg-[var(--ink)] px-3 text-sm font-medium text-white disabled:opacity-40"
                                onClick={() => saveCorrection(item)}
                              >
                                {savingId === item.id
                                  ? "…"
                                  : dirty
                                    ? "Guardar"
                                    : "Ok"}
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="px-4 py-6 text-center text-sm text-[var(--muted)]">
                      Sin novedades en esta categoría. Puede aplicar o rechazar
                      igual.
                    </p>
                  )}

                  <div className="space-y-3 border-t border-[var(--line)] bg-amber-50/50 p-3 sm:p-4">
                    <div>
                      <p className="text-sm font-medium">
                        Autorizar · {group.label}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {group.totalInCategory} productos. Al aplicar, el stock
                        se iguala a lo contado.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={pending}
                      className="min-h-12 w-full rounded-xl bg-[var(--ink)] px-4 text-sm font-medium text-white disabled:opacity-50 sm:w-auto"
                      onClick={() => {
                        if (
                          !confirm(
                            `¿Aplicar ajustes de “${group.label}” al stock del sistema?`,
                          )
                        ) {
                          return;
                        }
                        startTransition(async () => {
                          setError(null);
                          const r = await applyPhysicalCountCategoryAction(
                            count.id,
                            group.categoryId,
                          );
                          if (!r.ok) setError(r.error ?? "Error");
                          else router.refresh();
                        });
                      }}
                    >
                      Aplicar “{group.label}”
                    </button>
                    <form
                      className="flex flex-col gap-2 border-t border-amber-200/80 pt-3 sm:flex-row sm:items-end"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const reason =
                          rejectReason[group.categoryId]?.trim() ?? "";
                        if (!reason) {
                          setError("Indique el motivo de rechazo");
                          return;
                        }
                        const fd = new FormData();
                        fd.set("rejection_reason", reason);
                        startTransition(async () => {
                          setError(null);
                          const r = await rejectPhysicalCountCategoryAction(
                            count.id,
                            group.categoryId,
                            fd,
                          );
                          if (!r.ok) setError(r.error ?? "Error");
                          else {
                            setRejectReason((prev) => {
                              const next = { ...prev };
                              delete next[group.categoryId];
                              return next;
                            });
                            router.refresh();
                          }
                        });
                      }}
                    >
                      <label className="w-full flex-1 text-sm">
                        <span className="mb-1.5 block text-[var(--muted)]">
                          Motivo de rechazo
                        </span>
                        <input
                          value={rejectReason[group.categoryId] ?? ""}
                          onChange={(e) =>
                            setRejectReason((prev) => ({
                              ...prev,
                              [group.categoryId]: e.target.value,
                            }))
                          }
                          required
                          placeholder={`Ej. reconteo de ${group.label}`}
                          className={inputClass}
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={pending}
                        className="min-h-12 rounded-xl px-4 text-sm font-medium text-red-700 hover:bg-red-50 sm:min-h-0 sm:py-2.5"
                      >
                        Rechazar categoría
                      </button>
                    </form>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
