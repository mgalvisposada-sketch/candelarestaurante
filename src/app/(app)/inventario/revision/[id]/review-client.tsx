"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  applyPhysicalCountAdjustmentsAction,
  applyPhysicalCountCategoryAction,
  applyPhysicalCountItemsAction,
  correctPhysicalCountItemAction,
  rejectPhysicalCountCategoryAction,
} from "../../../compras/physical-inventory-actions";
import {
  normalizePhysicalCategoryId,
  PHYSICAL_COUNT_NONE_CATEGORY,
} from "@/lib/inventory/physical-count";
import { notifyPendingActionsChanged } from "@/components/layout/pending-actions-inbox";
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

type ViewMode = "novedades" | "followup" | "all";

const inputClass =
  "w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm outline-none ring-[var(--accent)] focus:ring-2";

function followUpStorageKey(countId: string) {
  return `candela:inv-review-followup:${countId}`;
}

function readFollowUpIds(countId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(followUpStorageKey(countId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

function writeFollowUpIds(countId: string, ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      followUpStorageKey(countId),
      JSON.stringify([...ids]),
    );
  } catch {
    // Silencioso: el seguimiento es auxiliar.
  }
}

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

function sortReviewItems(items: ReviewItem[]) {
  return [...items].sort((a, b) => {
    const da = Math.abs(Number(a.difference_qty ?? 0));
    const db = Math.abs(Number(b.difference_qty ?? 0));
    if (da !== db) return db - da;
    return a.product_name.localeCompare(b.product_name, "es");
  });
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [followUpIds, setFollowUpIds] = useState<Set<string>>(new Set());
  const [followUpReady, setFollowUpReady] = useState(false);

  useEffect(() => {
    const stored = readFollowUpIds(count.id);
    const valid = new Set(items.map((i) => i.id));
    const next = new Set<string>();
    for (const id of stored) if (valid.has(id)) next.add(id);
    setFollowUpIds(next);
    writeFollowUpIds(count.id, next);
    setFollowUpReady(true);
  }, [count.id, items]);

  useEffect(() => {
    setLocalItems(items);
    setSelectedIds((prev) => {
      const valid = new Set(items.map((i) => i.id));
      const next = new Set<string>();
      for (const id of prev) if (valid.has(id)) next.add(id);
      return next;
    });
  }, [items]);

  function persistFollowUp(next: Set<string>) {
    setFollowUpIds(next);
    writeFollowUpIds(count.id, next);
  }

  function toggleSelected(itemId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function setSelection(ids: string[], on: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function toggleFollowUp(itemId: string) {
    const next = new Set(followUpIds);
    if (next.has(itemId)) next.delete(itemId);
    else next.add(itemId);
    persistFollowUp(next);
  }

  function clearFollowUp(ids: Iterable<string>) {
    const next = new Set(followUpIds);
    let changed = false;
    for (const id of ids) {
      if (next.delete(id)) changed = true;
    }
    if (changed) persistFollowUp(next);
  }

  function applyItems(
    itemIds: string[],
    label: string,
    options?: { markRemainingFrom?: string[] },
  ) {
    if (!itemIds.length) {
      setError("Seleccione al menos un producto");
      return;
    }
    if (
      !confirm(
        `¿Aplicar ${itemIds.length} producto${itemIds.length === 1 ? "" : "s"} (${label}) al stock?`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      setError(null);
      const r = await applyPhysicalCountItemsAction(count.id, itemIds);
      if (!r.ok) {
        setError(r.error ?? "Error");
        return;
      }
      const applied = new Set(itemIds);
      const remainingVisible = (options?.markRemainingFrom ?? []).filter(
        (id) => !applied.has(id),
      );
      setLocalItems((prev) => prev.filter((row) => !applied.has(row.id)));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of itemIds) next.delete(id);
        return next;
      });
      setDraftQty((prev) => {
        const next = { ...prev };
        for (const id of itemIds) delete next[id];
        return next;
      });
      if (remainingVisible.length > 0) {
        const next = new Set(followUpIds);
        for (const id of applied) next.delete(id);
        for (const id of remainingVisible) next.add(id);
        persistFollowUp(next);
        setView("followup");
      } else {
        clearFollowUp(applied);
      }
      notifyPendingActionsChanged();
      router.refresh();
    });
  }

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
        followUp: number;
      }
    >();

    for (const item of localItems) {
      const diff = Number(item.difference_qty ?? 0);
      const isFollowUp = followUpIds.has(item.id);
      if (view === "novedades" && diff === 0) continue;
      if (view === "followup" && !isFollowUp) continue;
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
        followUp: 0,
      };
      group.items.push(item);
      if (diff !== 0) group.novedades += 1;
      if (isFollowUp) group.followUp += 1;
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
          followUp: catItems.filter((i) => followUpIds.has(i.id)).length,
        });
      }
    }

    return [...byCat.values()]
      .map((g) => {
        const categoryItems = localItems.filter(
          (i) => catKey(i.category_id) === g.categoryId,
        );
        const followUpItems = sortReviewItems(
          g.items.filter((i) => followUpIds.has(i.id)),
        );
        const novedadItems = sortReviewItems(
          g.items.filter(
            (i) =>
              !followUpIds.has(i.id) && Number(i.difference_qty ?? 0) !== 0,
          ),
        );
        const equalItems = sortReviewItems(
          g.items.filter(
            (i) =>
              !followUpIds.has(i.id) && Number(i.difference_qty ?? 0) === 0,
          ),
        );
        return {
          ...g,
          items:
            view === "all"
              ? [...followUpItems, ...novedadItems, ...equalItems]
              : sortReviewItems(g.items),
          sections:
            view === "all"
              ? [
                  {
                    key: "followup",
                    label: "Para seguimiento",
                    items: followUpItems,
                  },
                  {
                    key: "novedades",
                    label: "Con novedades",
                    items: novedadItems,
                  },
                  {
                    key: "iguales",
                    label: "Sin diferencia",
                    items: equalItems,
                  },
                ].filter((s) => s.items.length > 0)
              : [{ key: "all", label: null as string | null, items: sortReviewItems(g.items) }],
          totalInCategory: categoryItems.length,
          followUpInCategory: categoryItems.filter((i) =>
            followUpIds.has(i.id),
          ).length,
        };
      })
      .sort((a, b) => {
        if (a.followUpInCategory !== b.followUpInCategory) {
          return b.followUpInCategory - a.followUpInCategory;
        }
        if (a.novedades !== b.novedades) return b.novedades - a.novedades;
        return a.label.localeCompare(b.label, "es");
      });
  }, [followUpIds, localItems, query, view]);

  const totalNovedades = localItems.filter(
    (i) => Number(i.difference_qty ?? 0) !== 0,
  ).length;
  const totalFollowUp = localItems.filter((i) => followUpIds.has(i.id)).length;

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
                  else {
                    persistFollowUp(new Set());
                    notifyPendingActionsChanged();
                    router.refresh();
                  }
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
          <div className="grid grid-cols-3 rounded-xl border border-[var(--line)] bg-white p-1 text-sm md:inline-flex md:w-auto">
            {(
              [
                ["novedades", "Novedades"],
                ["followup", `Seguimiento${totalFollowUp > 0 ? ` (${totalFollowUp})` : ""}`],
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
        {view === "followup" && followUpReady && totalFollowUp === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white px-5 py-8 text-center">
            <p className="font-medium">Nada en seguimiento</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Marque productos con “Revisar luego”, o aplique una selección
              parcial: los no autorizados de esa vista quedan marcados solos.
            </p>
            <button
              type="button"
              onClick={() => setView("all")}
              className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--line)] px-4 text-sm font-medium hover:bg-[var(--surface)]"
            >
              Ir a Todos
            </button>
          </div>
        ) : null}
        {groups.map((group) => {
          const open = openCategoryId === group.categoryId;
          const visibleCount = group.items.length;

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
                    {group.followUpInCategory > 0 ? (
                      <Badge tone="accent">
                        {group.followUpInCategory} seguimiento
                      </Badge>
                    ) : null}
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
                      : view === "followup" && visibleCount === 0
                        ? " · marque productos con “Revisar luego”"
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
                    <>
                      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-4 py-2.5 text-xs">
                        <button
                          type="button"
                          className="rounded-lg px-2 py-1 font-medium text-[var(--ink)] hover:bg-[var(--surface)]"
                          onClick={() =>
                            setSelection(
                              group.items.map((i) => i.id),
                              true,
                            )
                          }
                        >
                          Seleccionar vista
                        </button>
                        {group.novedades > 0 ? (
                          <button
                            type="button"
                            className="rounded-lg px-2 py-1 font-medium text-amber-900 hover:bg-amber-50"
                            onClick={() =>
                              setSelection(
                                group.items
                                  .filter(
                                    (i) =>
                                      Number(i.difference_qty ?? 0) !== 0,
                                  )
                                  .map((i) => i.id),
                                true,
                              )
                            }
                          >
                            Solo novedades
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="rounded-lg px-2 py-1 text-[var(--muted)] hover:bg-[var(--surface)]"
                          onClick={() =>
                            setSelection(
                              group.items.map((i) => i.id),
                              false,
                            )
                          }
                        >
                          Limpiar
                        </button>
                        {(() => {
                          const selectedInGroup = group.items.filter((i) =>
                            selectedIds.has(i.id),
                          ).length;
                          if (selectedInGroup === 0) return null;
                          return (
                            <button
                              type="button"
                              disabled={pending}
                              className="ml-auto rounded-lg bg-[var(--ink)] px-3 py-1.5 font-medium text-white disabled:opacity-50"
                              onClick={() =>
                                applyItems(
                                  group.items
                                    .filter((i) => selectedIds.has(i.id))
                                    .map((i) => i.id),
                                  `selección · ${group.label}`,
                                  {
                                    markRemainingFrom: group.items.map(
                                      (i) => i.id,
                                    ),
                                  },
                                )
                              }
                            >
                              Aplicar {selectedInGroup} seleccionados
                            </button>
                          );
                        })()}
                      </div>
                      {group.sections.map((section) => (
                        <div key={section.key}>
                          {section.label ? (
                            <p className="border-b border-[var(--line)] bg-[var(--surface)]/70 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                              {section.label}
                              <span className="ml-1.5 font-normal normal-case tracking-normal">
                                ({section.items.length})
                              </span>
                            </p>
                          ) : null}
                          <ul className="divide-y divide-[var(--line)]">
                            {section.items.map((item) => {
                              const diff = Number(item.difference_qty ?? 0);
                              const isNovedad = diff !== 0;
                              const isFollowUp = followUpIds.has(item.id);
                              const draft = qtyValue(item);
                              const dirty =
                                draft.trim() !== "" &&
                                Number(draft.replace(/,/g, "")) !==
                                  Number(item.counted_qty);
                              const checked = selectedIds.has(item.id);
                              return (
                                <li
                                  key={item.id}
                                  className={cn(
                                    "space-y-3 px-4 py-3.5 sm:grid sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-3 sm:space-y-0",
                                    isFollowUp
                                      ? "bg-[var(--accent)]/8"
                                      : isNovedad
                                        ? "bg-amber-50/40"
                                        : "",
                                  )}
                                >
                                  <label className="flex items-center gap-2 sm:block">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleSelected(item.id)}
                                      className="size-4 rounded border-[var(--line)]"
                                      aria-label={`Seleccionar ${item.product_name}`}
                                    />
                                    <span className="text-xs text-[var(--muted)] sm:hidden">
                                      Seleccionar
                                    </span>
                                  </label>
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
                                      {isFollowUp ? (
                                        <span className="ml-2 font-medium text-[var(--accent)]">
                                          Seguimiento
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
                                      Sistema {formatQty(item.system_qty)} →
                                      Contado {formatQty(item.counted_qty)} · Dif.{" "}
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
                                  <div className="flex flex-wrap items-stretch gap-2 sm:justify-end">
                                    <button
                                      type="button"
                                      onClick={() => toggleFollowUp(item.id)}
                                      className={cn(
                                        "min-h-11 shrink-0 rounded-xl border px-3 text-sm font-medium",
                                        isFollowUp
                                          ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                                          : "border-[var(--line)] text-[var(--muted)] hover:text-[var(--ink)]",
                                      )}
                                    >
                                      {isFollowUp ? "En seguimiento" : "Revisar luego"}
                                    </button>
                                    <div className="min-w-0 flex-1 sm:w-32 sm:flex-none">
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
                                            "min-h-11 font-display text-lg font-semibold tabular-nums",
                                          )}
                                        />
                                        <span className="shrink-0 text-xs font-semibold text-[var(--muted)]">
                                          {item.unit}
                                        </span>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      disabled={
                                        savingId === item.id ||
                                        pending ||
                                        draft.trim() === "" ||
                                        !dirty
                                      }
                                      className="min-h-11 shrink-0 rounded-xl border border-[var(--line)] px-3 text-sm font-medium disabled:opacity-40"
                                      onClick={() => saveCorrection(item)}
                                    >
                                      {savingId === item.id
                                        ? "…"
                                        : dirty
                                          ? "Guardar"
                                          : "Ok"}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={pending || dirty}
                                      title={
                                        dirty
                                          ? "Guarde la corrección antes de aplicar"
                                          : undefined
                                      }
                                      className="min-h-11 shrink-0 rounded-xl bg-[var(--ink)] px-3 text-sm font-medium text-white disabled:opacity-40"
                                      onClick={() =>
                                        applyItems(
                                          [item.id],
                                          item.product_name,
                                        )
                                      }
                                    >
                                      Aplicar
                                    </button>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div className="space-y-3 px-4 py-6 text-center">
                      <p className="text-sm text-[var(--muted)]">
                        {view === "novedades" && group.totalInCategory > 0
                          ? `Los ${group.totalInCategory} producto${group.totalInCategory === 1 ? "" : "s"} en revisión coinciden con el sistema, por eso no aparecen en “Novedades”.`
                          : view === "followup"
                            ? followUpReady
                              ? "No hay productos marcados para seguimiento en esta categoría."
                              : "Cargando seguimiento…"
                            : "Sin productos visibles en esta categoría."}
                      </p>
                      {view === "novedades" && group.totalInCategory > 0 ? (
                        <button
                          type="button"
                          onClick={() => setView("all")}
                          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--line)] bg-white px-4 text-sm font-medium hover:bg-[var(--surface)]"
                        >
                          Ver los {group.totalInCategory} en Todos
                        </button>
                      ) : null}
                      {view === "followup" ? (
                        <button
                          type="button"
                          onClick={() => setView("all")}
                          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--line)] bg-white px-4 text-sm font-medium hover:bg-[var(--surface)]"
                        >
                          Ir a Todos y marcar “Revisar luego”
                        </button>
                      ) : null}
                      <p className="text-xs text-[var(--muted)]">
                        Puede aplicar o rechazar la categoría igual.
                      </p>
                    </div>
                  )}

                  <div className="space-y-3 border-t border-[var(--line)] bg-amber-50/50 p-3 sm:p-4">
                    <div>
                      <p className="text-sm font-medium">
                        Autorizar · {group.label}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        Individual o selección arriba; aquí el lote completo de
                        la categoría ({group.totalInCategory} productos).
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      {group.novedades > 0 ? (
                        <button
                          type="button"
                          disabled={pending}
                          className="min-h-12 rounded-xl border border-[var(--ink)] bg-white px-4 text-sm font-medium disabled:opacity-50 sm:w-auto"
                          onClick={() => {
                            const novedadIds = localItems
                              .filter(
                                (i) =>
                                  catKey(i.category_id) ===
                                    group.categoryId &&
                                  Number(i.difference_qty ?? 0) !== 0,
                              )
                              .map((i) => i.id);
                            applyItems(
                              novedadIds,
                              `novedades · ${group.label}`,
                            );
                          }}
                        >
                          Aplicar {group.novedades} novedad
                          {group.novedades === 1 ? "" : "es"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={pending}
                        className="min-h-12 rounded-xl bg-[var(--ink)] px-4 text-sm font-medium text-white disabled:opacity-50 sm:w-auto"
                        onClick={() => {
                          if (
                            !confirm(
                              `¿Aplicar ajustes de “${group.label}” (todos los ${group.totalInCategory} en revisión) al stock?`,
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
                            else {
                              const cleared = new Set(
                                localItems
                                  .filter(
                                    (i) =>
                                      catKey(i.category_id) ===
                                      group.categoryId,
                                  )
                                  .map((i) => i.id),
                              );
                              setLocalItems((prev) =>
                                prev.filter((i) => !cleared.has(i.id)),
                              );
                              setSelectedIds((prev) => {
                                const next = new Set(prev);
                                for (const id of cleared) next.delete(id);
                                return next;
                              });
                              clearFollowUp(cleared);
                              notifyPendingActionsChanged();
                              router.refresh();
                            }
                          });
                        }}
                      >
                        Aplicar toda “{group.label}”
                      </button>
                    </div>
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
                            const cleared = localItems
                              .filter(
                                (i) =>
                                  catKey(i.category_id) === group.categoryId,
                              )
                              .map((i) => i.id);
                            setRejectReason((prev) => {
                              const next = { ...prev };
                              delete next[group.categoryId];
                              return next;
                            });
                            clearFollowUp(cleared);
                            notifyPendingActionsChanged();
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
