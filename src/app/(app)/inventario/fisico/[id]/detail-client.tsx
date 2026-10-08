"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  applyPhysicalCountAdjustmentsAction,
  rejectPhysicalCountAction,
  removePhysicalCountItemAction,
  submitPhysicalCountAction,
  upsertPhysicalCountItemAction,
} from "../../../compras/physical-inventory-actions";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export type CountDetail = {
  id: string;
  title: string;
  status: string;
  counted_at: string;
  location_label: string | null;
  notes: string | null;
  rejection_reason: string | null;
};
export type CountItem = {
  id: string;
  product_id: string;
  system_qty?: number | string | null;
  counted_qty: number | string;
  difference_qty?: number | string | null;
  notes: string | null;
  product_name?: string;
  unit?: string;
};
export type CategoryOption = {
  id: string;
  name: string;
  code: string;
};
export type ProductOption = {
  id: string;
  name: string;
  unit: string;
  category_id: string;
};

const inputClass =
  "w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm outline-none ring-[var(--accent)] focus:ring-2";

const STATUS_META: Record<
  string,
  { label: string; tone: "neutral" | "ok" | "warn" | "danger" | "info" }
> = {
  BORRADOR: { label: "Contando", tone: "info" },
  ENVIADO: { label: "En revisión", tone: "warn" },
  AJUSTADO: { label: "Ajustado", tone: "ok" },
  RECHAZADO: { label: "Rechazado", tone: "danger" },
};

type FilterMode = "pending" | "counted" | "all";

function formatQty(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  if (Number.isNaN(n)) return "0";
  return new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: 3,
  }).format(n);
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function PhysicalCountDetailClient({
  count,
  items,
  products,
  categories,
  canEdit,
  canAdjust,
  showSystemComparison,
}: {
  count: CountDetail;
  items: CountItem[];
  products: ProductOption[];
  categories: CategoryOption[];
  canEdit: boolean;
  canAdjust: boolean;
  showSystemComparison: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterMode>("pending");
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);
  const [draftQty, setDraftQty] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const isDraft = count.status === "BORRADOR";
  const isSubmitted = count.status === "ENVIADO";
  const statusMeta = STATUS_META[count.status] ?? {
    label: count.status,
    tone: "neutral" as const,
  };

  const itemByProduct = useMemo(() => {
    const map = new Map<string, CountItem>();
    for (const item of items) map.set(item.product_id, item);
    return map;
  }, [items]);

  const countedCount = items.length;
  const totalProducts = products.length;
  const progressPct =
    totalProducts === 0 ? 0 : Math.round((countedCount / totalProducts) * 100);

  const categoryById = useMemo(() => {
    const map = new Map(categories.map((c) => [c.id, c]));
    return map;
  }, [categories]);

  const groups = useMemo(() => {
    const q = normalize(query);
    const byCat = new Map<
      string,
      {
        categoryId: string;
        label: string;
        products: ProductOption[];
        counted: number;
      }
    >();

    for (const product of products) {
      const counted = itemByProduct.has(product.id);
      if (filter === "pending" && counted) continue;
      if (filter === "counted" && !counted) continue;
      if (q && !normalize(product.name).includes(q)) continue;

      const cat = categoryById.get(product.category_id);
      const categoryId = product.category_id || "__none__";
      const label = cat?.name ?? "Sin categoría";
      const group = byCat.get(categoryId) ?? {
        categoryId,
        label,
        products: [],
        counted: 0,
      };
      group.products.push(product);
      byCat.set(categoryId, group);
    }

    // Conteos reales por categoría (sobre catálogo completo, no filtro).
    const countedPerCat = new Map<string, { total: number; counted: number }>();
    for (const product of products) {
      const categoryId = product.category_id || "__none__";
      const stats = countedPerCat.get(categoryId) ?? { total: 0, counted: 0 };
      stats.total += 1;
      if (itemByProduct.has(product.id)) stats.counted += 1;
      countedPerCat.set(categoryId, stats);
    }

    return [...byCat.values()]
      .map((g) => {
        const stats = countedPerCat.get(g.categoryId) ?? {
          total: g.products.length,
          counted: 0,
        };
        return { ...g, totalInCategory: stats.total, countedInCategory: stats.counted };
      })
      .sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [products, itemByProduct, categoryById, filter, query]);

  const categoryInit = useRef(false);
  useEffect(() => {
    if (!isDraft) return;
    const nextIncomplete =
      groups.find((g) => g.countedInCategory < g.totalInCategory)?.categoryId ??
      groups[0]?.categoryId ??
      null;

    if (!categoryInit.current && groups.length > 0) {
      categoryInit.current = true;
      setOpenCategoryId(nextIncomplete);
      return;
    }

    // Si la categoría abierta desaparece del filtro (p. ej. quedó completa en Pendientes), pasar a la siguiente.
    setOpenCategoryId((prev) => {
      if (prev == null) return prev;
      if (groups.some((g) => g.categoryId === prev)) return prev;
      return nextIncomplete;
    });
  }, [groups, isDraft]);

  const reviewStats = useMemo(() => {
    if (!showSystemComparison) return null;
    let match = 0;
    let surplus = 0;
    let deficit = 0;
    for (const item of items) {
      const diff = Number(item.difference_qty ?? 0);
      if (diff === 0) match += 1;
      else if (diff > 0) surplus += 1;
      else deficit += 1;
    }
    return { match, surplus, deficit };
  }, [items, showSystemComparison]);

  function qtyValue(productId: string) {
    if (draftQty[productId] !== undefined) return draftQty[productId];
    const item = itemByProduct.get(productId);
    return item ? String(item.counted_qty) : "";
  }

  function saveProduct(product: ProductOption) {
    const raw = qtyValue(product.id).trim();
    if (raw === "") {
      setError("Indique la cantidad contada");
      return;
    }
    setError(null);
    setSavingId(product.id);
    const fd = new FormData();
    fd.set("product_id", product.id);
    fd.set("counted_qty", raw);
    startTransition(async () => {
      const r = await upsertPhysicalCountItemAction(count.id, fd);
      setSavingId(null);
      if (!r.ok) setError(r.error ?? "Error");
      else {
        setDraftQty((prev) => {
          const next = { ...prev };
          delete next[product.id];
          return next;
        });
      }
    });
  }

  return (
    <div className="space-y-6">
      <header className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
        <div
          aria-hidden
          className="h-1 bg-[linear-gradient(90deg,var(--accent),var(--gold))]"
        />
        <div className="flex flex-wrap items-start justify-between gap-4 p-5 md:p-6">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-2xl font-semibold tracking-tight">
                {count.title}
              </h2>
              <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
            </div>
            <p className="text-sm text-[var(--muted)]">
              {count.counted_at}
              {count.location_label ? ` · ${count.location_label}` : ""}
            </p>
            {count.notes ? (
              <p className="max-w-2xl text-sm text-[var(--muted)]">{count.notes}</p>
            ) : null}
            {count.rejection_reason ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                Rechazo: {count.rejection_reason}
              </p>
            ) : null}
          </div>
          <div className="min-w-[160px] rounded-xl bg-white/80 px-4 py-3 shadow-[0_1px_0_rgba(18,18,18,0.04)]">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
              Avance
            </p>
            <p className="font-display text-3xl font-bold tabular-nums">
              {countedCount}
              <span className="text-lg font-medium text-[var(--muted)]">
                /{totalProducts}
              </span>
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--line)]">
              <div
                className="h-full rounded-full bg-[var(--ink)] transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>
      </header>

      {isDraft ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          <p className="font-medium">Auditoría a ciegas por categoría</p>
          <p className="mt-0.5 text-sky-900/80">
            Vea qué falta por categoría. No se muestra el stock del sistema:
            solo registre lo físico.
          </p>
        </div>
      ) : null}

      {isDraft && canEdit ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar producto…"
              className={cn(inputClass, "max-w-sm")}
              autoComplete="off"
            />
            <div className="flex rounded-xl border border-[var(--line)] bg-white p-1 text-sm">
              {(
                [
                  ["pending", "Pendientes"],
                  ["counted", "Contados"],
                  ["all", "Todos"],
                ] as const
              ).map(([value, label]) => (
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
                </button>
              ))}
            </div>
          </div>

          {groups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white px-5 py-10 text-center">
              <p className="font-medium">
                {filter === "pending"
                  ? "Todo contado"
                  : filter === "counted"
                    ? "Aún no hay productos contados"
                    : "Sin productos para mostrar"}
              </p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {filter === "pending"
                  ? "Puede enviar a revisión o revisar contados."
                  : "Cambie el filtro o la búsqueda."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map((group) => {
                const open = openCategoryId === group.categoryId;
                const complete =
                  group.countedInCategory >= group.totalInCategory &&
                  group.totalInCategory > 0;
                return (
                  <div
                    key={group.categoryId}
                    className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setOpenCategoryId(open ? null : group.categoryId)
                      }
                      className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-[var(--surface)]"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{group.label}</p>
                          {complete ? (
                            <Badge tone="ok">Completa</Badge>
                          ) : (
                            <Badge tone="warn">
                              Faltan {group.totalInCategory - group.countedInCategory}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-sm text-[var(--muted)]">
                          {group.countedInCategory}/{group.totalInCategory} contados
                          {filter !== "all"
                            ? ` · mostrando ${group.products.length}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-[var(--line)] sm:block">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              complete ? "bg-emerald-600" : "bg-[var(--ink)]",
                            )}
                            style={{
                              width: `${
                                group.totalInCategory === 0
                                  ? 0
                                  : Math.round(
                                      (group.countedInCategory /
                                        group.totalInCategory) *
                                        100,
                                    )
                              }%`,
                            }}
                          />
                        </div>
                        <span className="text-sm text-[var(--muted)]">
                          {open ? "Ocultar" : "Abrir"}
                        </span>
                      </div>
                    </button>

                    {open ? (
                      <ul className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
                        {group.products.map((product) => {
                          const item = itemByProduct.get(product.id);
                          const counted = Boolean(item);
                          const dirty =
                            draftQty[product.id] !== undefined &&
                            draftQty[product.id] !==
                              (item ? String(item.counted_qty) : "");
                          return (
                            <li
                              key={product.id}
                              className={cn(
                                "grid gap-3 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center",
                                counted ? "bg-emerald-50/40" : "",
                              )}
                            >
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={cn(
                                      "inline-flex h-2 w-2 rounded-full",
                                      counted ? "bg-emerald-600" : "bg-amber-400",
                                    )}
                                    aria-hidden
                                  />
                                  <p className="font-medium">{product.name}</p>
                                  <span className="text-xs text-[var(--muted)]">
                                    {product.unit}
                                  </span>
                                  {counted ? (
                                    <span className="text-xs font-medium text-emerald-800">
                                      Contado
                                    </span>
                                  ) : (
                                    <span className="text-xs text-amber-800">
                                      Pendiente
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <input
                                  inputMode="decimal"
                                  value={qtyValue(product.id)}
                                  onChange={(e) =>
                                    setDraftQty((prev) => ({
                                      ...prev,
                                      [product.id]: e.target.value,
                                    }))
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      saveProduct(product);
                                    }
                                  }}
                                  placeholder="Cantidad"
                                  className={cn(
                                    inputClass,
                                    "w-28 font-display text-lg font-semibold tabular-nums",
                                  )}
                                />
                                <button
                                  type="button"
                                  disabled={
                                    pending ||
                                    qtyValue(product.id).trim() === "" ||
                                    (!dirty && counted)
                                  }
                                  className="rounded-xl bg-[var(--ink)] px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
                                  onClick={() => saveProduct(product)}
                                >
                                  {savingId === product.id
                                    ? "…"
                                    : counted
                                      ? dirty
                                        ? "Actualizar"
                                        : "Guardado"
                                      : "Contar"}
                                </button>
                                {counted && item ? (
                                  <button
                                    type="button"
                                    disabled={pending}
                                    className="rounded-xl px-2.5 py-2 text-xs text-red-700 hover:bg-red-50"
                                    onClick={() => {
                                      if (
                                        !confirm(
                                          "¿Quitar este producto del conteo?",
                                        )
                                      ) {
                                        return;
                                      }
                                      setError(null);
                                      startTransition(async () => {
                                        const r =
                                          await removePhysicalCountItemAction(
                                            count.id,
                                            item.id,
                                          );
                                        if (!r.ok) setError(r.error ?? "Error");
                                      });
                                    }}
                                  >
                                    Quitar
                                  </button>
                                ) : null}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {!isDraft || !canEdit ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-base font-medium">Hoja de conteo</h3>
              <p className="text-sm text-[var(--muted)]">
                {showSystemComparison
                  ? "Comparación sistema vs. físico (revisión)."
                  : "Cantidades registradas en esta auditoría."}
              </p>
            </div>
            {reviewStats ? (
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-800">
                  Igual: {reviewStats.match}
                </span>
                <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-900">
                  Sobra: {reviewStats.surplus}
                </span>
                <span className="rounded-md bg-red-50 px-2 py-1 text-red-800">
                  Falta: {reviewStats.deficit}
                </span>
              </div>
            ) : null}
          </div>

          {items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white px-5 py-10 text-center">
              <p className="font-medium">Sin productos contados</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
              <ul className="divide-y divide-[var(--line)]">
                {items.map((item) => {
                  const diff = Number(item.difference_qty ?? 0);
                  return (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
                    >
                      <div>
                        <p className="font-medium">{item.product_name}</p>
                        {item.notes ? (
                          <p className="text-xs text-[var(--muted)]">{item.notes}</p>
                        ) : null}
                      </div>
                      <div className="text-right tabular-nums">
                        <p className="font-display text-lg font-semibold">
                          {formatQty(item.counted_qty)}{" "}
                          <span className="text-xs font-sans font-normal text-[var(--muted)]">
                            {item.unit}
                          </span>
                        </p>
                        {showSystemComparison ? (
                          <p className="text-xs text-[var(--muted)]">
                            Sistema {formatQty(item.system_qty)} · Dif.{" "}
                            <span
                              className={cn(
                                "font-medium",
                                diff === 0
                                  ? ""
                                  : diff < 0
                                    ? "text-red-700"
                                    : "text-emerald-700",
                              )}
                            >
                              {diff > 0 ? `+${formatQty(diff)}` : formatQty(diff)}
                            </span>
                          </p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      ) : null}

      {isDraft && canEdit ? (
        <div className="sticky bottom-4 z-10 rounded-2xl border border-[var(--line)] bg-white/95 p-4 shadow-lg backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">
                {countedCount === 0
                  ? "Cuente al menos un producto para enviar"
                  : countedCount < totalProducts
                    ? `${totalProducts - countedCount} pendientes · ${countedCount} contados`
                    : "Catálogo completo contado"}
              </p>
              <p className="text-sm text-[var(--muted)]">
                Puede enviar aunque falten productos. Al enviar se congela el
                stock del sistema para la comparación.
              </p>
            </div>
            <button
              type="button"
              disabled={pending || countedCount === 0}
              className="rounded-xl bg-[var(--ink)] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              onClick={() => {
                const missing = totalProducts - countedCount;
                const msg =
                  missing > 0
                    ? `Aún faltan ${missing} productos. ¿Enviar de todos modos? Después no podrá editar.`
                    : "¿Enviar el conteo a revisión? Después no podrá editar las cantidades.";
                if (!confirm(msg)) return;
                startTransition(async () => {
                  setError(null);
                  const r = await submitPhysicalCountAction(count.id);
                  if (!r.ok) setError(r.error ?? "Error");
                });
              }}
            >
              Enviar a revisión
            </button>
          </div>
        </div>
      ) : null}

      {isSubmitted && canAdjust ? (
        <section className="space-y-4 rounded-2xl border border-[var(--line)] bg-white p-5 md:p-6">
          <div>
            <h3 className="text-base font-medium">Revisión Gestión</h3>
            <p className="text-sm text-[var(--muted)]">
              Al aplicar, el stock del sistema se iguala a lo contado y queda
              trazabilidad en movimientos.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              className="rounded-xl bg-[var(--ink)] px-5 py-2.5 text-sm font-medium text-white"
              onClick={() => {
                if (!confirm("¿Aplicar ajustes de inventario al stock del sistema?"))
                  return;
                startTransition(async () => {
                  setError(null);
                  const r = await applyPhysicalCountAdjustmentsAction(count.id);
                  if (!r.ok) setError(r.error ?? "Error");
                });
              }}
            >
              Aplicar ajustes
            </button>
          </div>
          <form
            className="flex flex-wrap items-end gap-2 border-t border-[var(--line)] pt-4"
            action={(fd) => {
              setError(null);
              startTransition(async () => {
                const r = await rejectPhysicalCountAction(count.id, fd);
                if (!r.ok) setError(r.error ?? "Error");
              });
            }}
          >
            <label className="min-w-[240px] flex-1 text-sm">
              <span className="mb-1.5 block text-[var(--muted)]">Motivo de rechazo</span>
              <input
                name="rejection_reason"
                required
                placeholder="Ej. conteo incompleto / revisar de nuevo"
                className={inputClass}
              />
            </label>
            <button
              type="submit"
              disabled={pending}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Rechazar
            </button>
          </form>
        </section>
      ) : null}

      {isSubmitted && !canAdjust ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Enviado. Esperando que Gestión revise y aplique o rechace el ajuste.
        </div>
      ) : null}

      {error ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}
    </div>
  );
}
