"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  removePhysicalCountItemAction,
  submitPhysicalCountCategoryAction,
  upsertPhysicalCountItemAction,
} from "../../../compras/physical-inventory-actions";
import {
  draftCategoryOccupants,
  normalizePhysicalCategoryId,
} from "@/lib/inventory/physical-count";
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
  status?: string;
  rejection_reason?: string | null;
  category_id?: string | null;
  item_kind?: string;
  item_kind_label?: string;
  created_by?: string | null;
  created_by_name?: string | null;
  created_at?: string | null;
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
  item_kind?: string;
  item_kind_label?: string;
};

const NONE_CATEGORY = "__none__";
const OCCUPANCY_REFRESH_MS = 20_000;

const inputClass =
  "w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-base outline-none ring-[var(--accent)] focus:ring-2 sm:text-sm";

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

function catKey(categoryId: string | null | undefined) {
  return normalizePhysicalCategoryId(categoryId);
}

function itemEditable(status: string | undefined) {
  return !status || status === "BORRADOR";
}

function canEditItemDraft(
  item: CountItem | null | undefined,
  currentUserId: string,
  canAdjust: boolean,
) {
  if (!item || !itemEditable(item.status)) return false;
  if (canAdjust) return true;
  if (!item.created_by) return true;
  return item.created_by === currentUserId;
}

export function PhysicalCountDetailClient({
  count,
  items,
  products,
  categories,
  currentUserId,
  canEdit,
  canAdjust,
}: {
  count: CountDetail;
  items: CountItem[];
  products: ProductOption[];
  categories: CategoryOption[];
  currentUserId: string;
  canEdit: boolean;
  canAdjust: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterMode>("pending");
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);
  const [draftQty, setDraftQty] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [localItems, setLocalItems] = useState(items);

  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  // Otros usuarios liberan/ocupan categorías; refrescar sin recargar a mano.
  useEffect(() => {
    if (count.status === "AJUSTADO") return;
    const id = window.setInterval(() => {
      router.refresh();
    }, OCCUPANCY_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [count.status, router]);

  const isClosed = count.status === "AJUSTADO";
  const statusMeta = STATUS_META[count.status] ?? {
    label: count.status,
    tone: "neutral" as const,
  };

  const itemByProduct = useMemo(() => {
    const map = new Map<string, CountItem>();
    for (const item of localItems) map.set(item.product_id, item);
    return map;
  }, [localItems]);

  const countedCount = localItems.length;
  const myDraftCount = localItems.filter(
    (i) =>
      itemEditable(i.status) &&
      canEditItemDraft(i, currentUserId, canAdjust),
  ).length;
  const draftCount = localItems.filter((i) => itemEditable(i.status)).length;
  const reviewCount = localItems.filter((i) => i.status === "ENVIADO").length;
  const adjustedCount = localItems.filter((i) => i.status === "AJUSTADO").length;
  const totalProducts = products.length;
  const progressPct =
    totalProducts === 0 ? 0 : Math.round((countedCount / totalProducts) * 100);

  const categoryById = useMemo(() => {
    const map = new Map(categories.map((c) => [c.id, c]));
    return map;
  }, [categories]);

  const productById = useMemo(() => {
    const map = new Map(products.map((p) => [p.id, p]));
    return map;
  }, [products]);

  const nameByUserId = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of localItems) {
      if (item.created_by && item.created_by_name) {
        map.set(item.created_by, item.created_by_name);
      }
    }
    return map;
  }, [localItems]);

  const categoryOccupants = useMemo(() => {
    const drafts = localItems.filter((item) => itemEditable(item.status));
    const productCategoryById = new Map<string, string | null | undefined>();
    for (const product of products) {
      productCategoryById.set(product.id, product.category_id);
    }
    for (const item of drafts) {
      if (!productCategoryById.has(item.product_id)) {
        productCategoryById.set(item.product_id, item.category_id);
      }
    }
    return draftCategoryOccupants(drafts, productCategoryById);
  }, [localItems, products]);

  /** Mi categoría en borrador: solo esa puedo contar hasta enviarla. */
  const focusCategoryId = useMemo(() => {
    for (const [categoryId, occupant] of categoryOccupants) {
      if (occupant.userId === currentUserId) return categoryId;
    }
    return null;
  }, [categoryOccupants, currentUserId]);

  const focusCategoryLabel = useMemo(() => {
    if (!focusCategoryId) return null;
    if (focusCategoryId === NONE_CATEGORY) return "Sin categoría";
    return categoryById.get(focusCategoryId)?.name ?? "categoría en curso";
  }, [focusCategoryId, categoryById]);

  const occupiedByOthers = useMemo(() => {
    const map = new Map<string, { userId: string; name: string }>();
    for (const [categoryId, occupant] of categoryOccupants) {
      if (occupant.userId === currentUserId) continue;
      map.set(categoryId, {
        userId: occupant.userId,
        name: nameByUserId.get(occupant.userId) ?? "Otro usuario",
      });
    }
    return map;
  }, [categoryOccupants, currentUserId, nameByUserId]);

  const groups = useMemo(() => {
    const q = normalize(query);

    const statsPerCat = new Map<
      string,
      {
        total: number;
        counted: number;
        draft: number;
        myDraft: number;
        review: number;
        adjusted: number;
        label: string;
      }
    >();

    for (const product of products) {
      const categoryId = catKey(product.category_id);
      const cat = categoryById.get(product.category_id);
      const stats = statsPerCat.get(categoryId) ?? {
        total: 0,
        counted: 0,
        draft: 0,
        myDraft: 0,
        review: 0,
        adjusted: 0,
        label: cat?.name ?? "Sin categoría",
      };
      stats.total += 1;
      const item = itemByProduct.get(product.id);
      if (item) {
        stats.counted += 1;
        if (itemEditable(item.status)) {
          stats.draft += 1;
          if (canEditItemDraft(item, currentUserId, canAdjust)) {
            stats.myDraft += 1;
          }
        } else if (item.status === "ENVIADO") stats.review += 1;
        else if (item.status === "AJUSTADO") stats.adjusted += 1;
      }
      statsPerCat.set(categoryId, stats);
    }

    const byCat = new Map<
      string,
      {
        categoryId: string;
        label: string;
        products: ProductOption[];
      }
    >();

    for (const product of products) {
      const item = itemByProduct.get(product.id);
      const counted = Boolean(item);

      if (filter === "pending" && counted) continue;
      if (filter === "counted" && !counted) continue;
      if (q && !normalize(product.name).includes(q)) continue;

      const categoryId = catKey(product.category_id);
      const stats = statsPerCat.get(categoryId);
      const group = byCat.get(categoryId) ?? {
        categoryId,
        label: stats?.label ?? "Sin categoría",
        products: [],
      };
      group.products.push(product);
      byCat.set(categoryId, group);
    }

    // Con filtro Pendientes: si ya contó todo lo digitable pero hay borradores
    // por enviar (o hay revisión), la categoría debe seguir visible con esos
    // productos — no solo el encabezado vacío ("0 en vista").
    if (filter === "pending" && !q) {
      for (const [categoryId, stats] of statsPerCat) {
        if (byCat.has(categoryId)) continue;
        if (stats.draft === 0 && stats.review === 0) continue;
        byCat.set(categoryId, {
          categoryId,
          label: stats.label,
          products: products.filter((p) => {
            if (catKey(p.category_id) !== categoryId) return false;
            const item = itemByProduct.get(p.id);
            if (!item) return false;
            return (
              itemEditable(item.status) || item.status === "ENVIADO"
            );
          }),
        });
      }
    }

    return [...byCat.values()]
      .map((g) => {
        const stats = statsPerCat.get(g.categoryId) ?? {
          total: g.products.length,
          counted: 0,
          draft: 0,
          myDraft: 0,
          review: 0,
          adjusted: 0,
          label: g.label,
        };
        // En revisión de gestión: novedades (dif ≠ 0) primero.
        const sortedProducts =
          canAdjust && stats.review > 0
            ? [...g.products].sort((a, b) => {
                const ia = itemByProduct.get(a.id);
                const ib = itemByProduct.get(b.id);
                const da = Math.abs(Number(ia?.difference_qty ?? 0));
                const db = Math.abs(Number(ib?.difference_qty ?? 0));
                if (da !== db) return db - da;
                return a.name.localeCompare(b.name, "es");
              })
            : g.products;
        return {
          ...g,
          products: sortedProducts,
          totalInCategory: stats.total,
          countedInCategory: stats.counted,
          draftInCategory: stats.draft,
          myDraftInCategory: stats.myDraft,
          reviewInCategory: stats.review,
          adjustedInCategory: stats.adjusted,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [
    products,
    itemByProduct,
    categoryById,
    filter,
    query,
    currentUserId,
    canAdjust,
  ]);

  const categoryInit = useRef(false);
  useEffect(() => {
    if (isClosed) return;

    // Con categoría en borrador, forzar foco ahí.
    if (focusCategoryId) {
      setOpenCategoryId(focusCategoryId);
      categoryInit.current = true;
      return;
    }

    const nextIncomplete =
      groups.find((g) => g.countedInCategory < g.totalInCategory)?.categoryId ??
      groups.find((g) => g.draftInCategory > 0)?.categoryId ??
      groups[0]?.categoryId ??
      null;

    if (!categoryInit.current && groups.length > 0) {
      categoryInit.current = true;
      setOpenCategoryId(nextIncomplete);
      return;
    }

    setOpenCategoryId((prev) => {
      if (prev == null) return prev;
      if (groups.some((g) => g.categoryId === prev)) return prev;
      return nextIncomplete;
    });
  }, [groups, isClosed, focusCategoryId]);

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
    const countedQty = Number(String(raw).replace(/,/g, "").trim());
    if (Number.isNaN(countedQty) || countedQty < 0) {
      setError("Cantidad contada inválida");
      return;
    }

    const previous = itemByProduct.get(product.id) ?? null;
    if (previous && !itemEditable(previous.status)) {
      setError("Este producto ya fue enviado; no se puede editar");
      return;
    }

    const productCat = catKey(product.category_id);
    const otherOccupant = occupiedByOthers.get(productCat);
    if (otherOccupant && !previous && !canAdjust) {
      setError(
        `“${otherOccupant.name}” está contando esta categoría. Elija otra desocupada.`,
      );
      return;
    }
    if (focusCategoryId && productCat !== focusCategoryId && !previous) {
      setError(
        `Termine y envíe “${focusCategoryLabel}” a revisión antes de contar otra categoría`,
      );
      return;
    }
    if (previous && !canEditItemDraft(previous, currentUserId, canAdjust)) {
      setError("Este producto lo está contando otro usuario");
      return;
    }

    setError(null);
    const optimisticId = previous?.id ?? `tmp-${product.id}`;
    setLocalItems((prev) => {
      if (previous) {
        return prev.map((item) =>
          item.product_id === product.id
            ? {
                ...item,
                counted_qty: countedQty,
                status: "BORRADOR",
                rejection_reason: null,
                created_by: item.created_by ?? currentUserId,
              }
            : item,
        );
      }
      return [
        ...prev,
        {
          id: optimisticId,
          product_id: product.id,
          counted_qty: countedQty,
          notes: null,
          product_name: product.name,
          unit: product.unit,
          status: "BORRADOR",
          category_id: product.category_id,
          created_by: currentUserId,
          created_at: new Date().toISOString(),
        },
      ];
    });
    setDraftQty((prev) => {
      const next = { ...prev };
      delete next[product.id];
      return next;
    });

    const fd = new FormData();
    fd.set("product_id", product.id);
    fd.set("counted_qty", raw);

    setSavingId(product.id);
    void (async () => {
      try {
        const r = await upsertPhysicalCountItemAction(count.id, fd);
        if (!r.ok) {
          setError(r.error ?? "Error");
          setLocalItems((prev) => {
            if (previous) {
              return prev.map((item) =>
                item.product_id === product.id ? previous : item,
              );
            }
            return prev.filter((item) => item.product_id !== product.id);
          });
          setDraftQty((prev) => ({ ...prev, [product.id]: raw }));
          return;
        }
        if (r.id && r.id !== optimisticId) {
          setLocalItems((prev) =>
            prev.map((item) =>
              item.product_id === product.id ? { ...item, id: r.id! } : item,
            ),
          );
        }
      } finally {
        setSavingId((current) => (current === product.id ? null : current));
      }
    })();
  }

  function submitCategory(group: {
    categoryId: string;
    label: string;
    draftInCategory: number;
    myDraftInCategory: number;
    totalInCategory: number;
    countedInCategory: number;
  }) {
    if (group.myDraftInCategory === 0) {
      setError("Cuente al menos un producto de la categoría antes de enviar");
      return;
    }
    const missing = group.totalInCategory - group.countedInCategory;
    if (missing > 0) {
      setError(
        `Faltan ${missing} producto${missing === 1 ? "" : "s"} por contar en “${group.label}”. Debe registrar todos (0 vale) antes de enviar a revisión.`,
      );
      return;
    }
    if (
      !confirm(
        `¿Enviar “${group.label}” (${group.myDraftInCategory} productos) a revisión? Después no podrá editar las cantidades.`,
      )
    ) {
      return;
    }

    startTransition(async () => {
      setError(null);
      const r = await submitPhysicalCountCategoryAction(
        count.id,
        group.categoryId,
      );
      if (!r.ok) setError(r.error ?? "Error");
    });
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
              <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
            </div>
            <p className="text-sm text-[var(--muted)]">
              {count.counted_at}
              {count.location_label ? ` · ${count.location_label}` : ""}
            </p>
            {count.notes ? (
              <p className="max-w-2xl text-sm text-[var(--muted)]">{count.notes}</p>
            ) : null}
            <p className="text-sm text-[var(--muted)]">
              Incluye materia prima, insumos y preparaciones. Cuente a ciegas
              por categoría y envíe a revisión. La auditoría se hace en Revisión
              física.
            </p>
          </div>
          <div className="w-full rounded-xl bg-white/80 px-4 py-3 shadow-[0_1px_0_rgba(18,18,18,0.04)] md:min-w-[180px] md:w-auto">
            <div className="flex items-end justify-between gap-3 md:block">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
                  Avance
                </p>
                <p className="font-display text-2xl font-bold tabular-nums sm:text-3xl">
                  {countedCount}
                  <span className="text-base font-medium text-[var(--muted)] sm:text-lg">
                    /{totalProducts}
                  </span>
                </p>
              </div>
              <p className="pb-1 text-sm font-medium tabular-nums text-[var(--muted)] md:hidden">
                {progressPct}%
              </p>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--line)]">
              <div
                className="h-full rounded-full bg-[var(--ink)] transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">
              {draftCount} por enviar · {reviewCount} en revisión ·{" "}
              {adjustedCount} ajustados
            </p>
          </div>
        </div>
      </header>

      {!isClosed && canAdjust && reviewCount > 0 ? (
        <Link
          href={`/inventario/revision/${count.id}`}
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/50 px-4 py-3.5 transition hover:bg-amber-50"
        >
          <div>
            <p className="font-medium">
              {reviewCount} producto{reviewCount === 1 ? "" : "s"} en revisión
            </p>
            <p className="mt-0.5 text-sm text-amber-950/70">
              Vea novedades y autorice el ajuste en Revisión física.
            </p>
          </div>
          <span className="text-sm font-medium text-[var(--accent)]">
            Ir a revisión →
          </span>
        </Link>
      ) : null}

      {!isClosed && canEdit ? (
        <section className="space-y-3 md:space-y-4">
          {focusCategoryId && focusCategoryLabel ? (
            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
              <p className="font-medium">
                Usted cuenta “{focusCategoryLabel}”
              </p>
              <p className="mt-0.5 text-sky-900/80">
                Envíela a revisión para tomar otra. Los demás pueden contar
                categorías desocupadas en paralelo.
              </p>
            </div>
          ) : occupiedByOthers.size > 0 ? (
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm">
              <p className="font-medium">Inventario en equipo</p>
              <p className="mt-0.5 text-[var(--muted)]">
                Hay categorías ocupadas por otros. Elija una libre para empezar.
              </p>
            </div>
          ) : null}

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
                      "min-h-10 rounded-lg px-2 py-2 transition md:min-h-0 md:px-3 md:py-1.5",
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
          </div>

          {groups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white px-5 py-10 text-center">
              <p className="font-medium">
                {filter === "pending"
                  ? "No hay pendientes de digitar"
                  : filter === "counted"
                    ? "Aún no hay productos contados"
                    : "Sin productos para mostrar"}
              </p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {filter === "pending"
                  ? "Revise Contados para enviar una categoría, o siga en Todos."
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
                const allSentOrAdjusted =
                  group.draftInCategory === 0 &&
                  group.countedInCategory > 0 &&
                  group.countedInCategory ===
                    group.reviewInCategory + group.adjustedInCategory;
                const isFocus = focusCategoryId === group.categoryId;
                const otherOccupant = occupiedByOthers.get(group.categoryId);
                const lockedByOther = Boolean(otherOccupant) && !canAdjust;
                const lockedByMyFocus = Boolean(
                  focusCategoryId && !isFocus && !otherOccupant,
                );
                // Se puede mirar una ocupada; no se puede digitar ahí.
                // Con mi categoría en curso, las libres quedan a la espera del envío.
                const canOpenWhileLocked =
                  Boolean(otherOccupant) ||
                  (canAdjust && group.reviewInCategory > 0);

                return (
                  <div
                    key={group.categoryId}
                    className={cn(
                      "overflow-hidden rounded-2xl border border-[var(--line)] bg-white",
                      lockedByMyFocus && !canOpenWhileLocked && "opacity-60",
                      lockedByOther && "border-amber-200",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (lockedByMyFocus && !canOpenWhileLocked) {
                          setError(
                            `Envíe “${focusCategoryLabel}” a revisión para pasar a otra categoría`,
                          );
                          return;
                        }
                        setError(null);
                        setOpenCategoryId(open ? null : group.categoryId);
                      }}
                      className="flex w-full items-center justify-between gap-3 px-3 py-3.5 text-left transition hover:bg-[var(--surface)] sm:px-4"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{group.label}</p>
                          {isFocus ? (
                            <Badge tone="info">Su turno</Badge>
                          ) : null}
                          {otherOccupant ? (
                            <Badge tone="warn">
                              Ocupada · {otherOccupant.name}
                            </Badge>
                          ) : null}
                          {lockedByMyFocus && !canOpenWhileLocked ? (
                            <Badge tone="neutral">Espere su envío</Badge>
                          ) : null}
                          {group.reviewInCategory > 0 ? (
                            <Badge tone="warn">
                              {group.reviewInCategory} en revisión
                            </Badge>
                          ) : null}
                          {group.adjustedInCategory > 0 ? (
                            <Badge tone="ok">
                              {group.adjustedInCategory} ajustados
                            </Badge>
                          ) : null}
                          {complete && group.draftInCategory > 0 ? (
                            <Badge tone="info">Lista para enviar</Badge>
                          ) : null}
                          {!complete ? (
                            <Badge tone="warn">
                              Faltan{" "}
                              {group.totalInCategory - group.countedInCategory}
                            </Badge>
                          ) : null}
                          {allSentOrAdjusted &&
                          group.reviewInCategory === 0 &&
                          complete ? (
                            <Badge tone="ok">Completa</Badge>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-sm text-[var(--muted)]">
                          {group.countedInCategory}/{group.totalInCategory}{" "}
                          contados
                          {group.draftInCategory > 0
                            ? ` · ${group.draftInCategory} por enviar`
                            : ""}
                          {filter !== "all"
                            ? ` · ${group.products.length} en vista`
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
                        <ul className="divide-y divide-[var(--line)]">
                          {group.products.map((product) => {
                            const item = itemByProduct.get(product.id);
                            const counted = Boolean(item);
                            const statusEditable =
                              !item || itemEditable(item.status);
                            const ownsDraft =
                              !item ||
                              canEditItemDraft(item, currentUserId, canAdjust);
                            const editable =
                              statusEditable &&
                              ownsDraft &&
                              (!lockedByOther || Boolean(item));
                            const dirty =
                              draftQty[product.id] !== undefined &&
                              draftQty[product.id] !==
                                (item ? String(item.counted_qty) : "");
                            const showCompare =
                              canAdjust &&
                              item &&
                              (item.status === "ENVIADO" ||
                                item.status === "AJUSTADO");

                            return (
                              <li
                                key={product.id}
                                className={cn(
                                  "space-y-3 px-3 py-3.5 sm:grid sm:grid-cols-[1fr_auto] sm:items-center sm:gap-3 sm:space-y-0 sm:px-4",
                                  item?.status === "AJUSTADO"
                                    ? "bg-emerald-50/50"
                                    : item?.status === "ENVIADO"
                                      ? "bg-amber-50/40"
                                      : counted
                                        ? "bg-emerald-50/40"
                                        : "",
                                )}
                              >
                                <div className="min-w-0">
                                  <div className="flex items-start gap-2">
                                    <span
                                      className={cn(
                                        "mt-1.5 inline-flex h-2.5 w-2.5 shrink-0 rounded-full",
                                        item?.status === "AJUSTADO"
                                          ? "bg-emerald-600"
                                          : item?.status === "ENVIADO"
                                            ? "bg-amber-500"
                                            : counted
                                              ? "bg-emerald-600"
                                              : "bg-amber-400",
                                      )}
                                      aria-hidden
                                    />
                                    <div className="min-w-0">
                                      <p className="font-medium leading-snug">
                                        {product.name}
                                      </p>
                                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                                        {product.item_kind_label ? (
                                          <span className="mr-2 font-medium text-[var(--ink)]">
                                            {product.item_kind_label}
                                          </span>
                                        ) : null}
                                        {product.unit}
                                        {item?.status === "ENVIADO" ? (
                                          <span className="ml-2 font-medium text-amber-800">
                                            En revisión
                                          </span>
                                        ) : item?.status === "AJUSTADO" ? (
                                          <span className="ml-2 font-medium text-emerald-800">
                                            Ajustado
                                          </span>
                                        ) : counted ? (
                                          <span className="ml-2 font-medium text-emerald-800">
                                            Contado
                                            {item?.created_by &&
                                            item.created_by !== currentUserId &&
                                            item.created_by_name
                                              ? ` · ${item.created_by_name}`
                                              : ""}
                                          </span>
                                        ) : lockedByOther ? (
                                          <span className="ml-2 text-[var(--muted)]">
                                            Ocupada por {otherOccupant?.name}
                                          </span>
                                        ) : (
                                          <span className="ml-2 text-amber-800">
                                            Pendiente
                                          </span>
                                        )}
                                      </p>
                                      {item?.rejection_reason ? (
                                        <p className="mt-1 text-xs text-red-700">
                                          Rechazo: {item.rejection_reason}
                                        </p>
                                      ) : null}
                                      {showCompare ? (
                                        <p className="mt-1 text-xs text-[var(--muted)]">
                                          Sistema {formatQty(item.system_qty)} →
                                          Contado {formatQty(item.counted_qty)} ·
                                          Dif.{" "}
                                          <span
                                            className={cn(
                                              "font-medium",
                                              Number(item.difference_qty) < 0
                                                ? "text-red-700"
                                                : Number(item.difference_qty) > 0
                                                  ? "text-emerald-700"
                                                  : "",
                                            )}
                                          >
                                            {Number(item.difference_qty) > 0
                                              ? `+${formatQty(item.difference_qty)}`
                                              : formatQty(item.difference_qty)}
                                          </span>
                                          {Number(item.difference_qty) !== 0 ? (
                                            <span className="ml-1.5 font-medium text-amber-800">
                                              Novedad
                                            </span>
                                          ) : null}
                                        </p>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>

                                {editable ? (
                                  <div className="flex items-stretch gap-2">
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
                                      placeholder="Cant."
                                      aria-label={`Cantidad de ${product.name}`}
                                      className={cn(
                                        inputClass,
                                        "min-h-12 flex-1 font-display text-xl font-semibold tabular-nums sm:w-28 sm:flex-none sm:text-lg",
                                      )}
                                    />
                                    <button
                                      type="button"
                                      disabled={
                                        savingId === product.id ||
                                        qtyValue(product.id).trim() === "" ||
                                        (!dirty && counted)
                                      }
                                      className="min-h-12 min-w-[5.5rem] rounded-xl bg-[var(--ink)] px-4 text-sm font-medium text-white disabled:opacity-40 sm:min-w-0"
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
                                        disabled={savingId === product.id}
                                        className="min-h-12 rounded-xl px-3 text-sm text-red-700 hover:bg-red-50"
                                        onClick={() => {
                                          if (
                                            !confirm(
                                              "¿Quitar este producto del conteo?",
                                            )
                                          ) {
                                            return;
                                          }
                                          setError(null);
                                          const removed = item;
                                          setLocalItems((prev) =>
                                            prev.filter(
                                              (row) =>
                                                row.id !== item.id &&
                                                row.product_id !==
                                                  item.product_id,
                                            ),
                                          );
                                          setDraftQty((prev) => {
                                            const next = { ...prev };
                                            delete next[item.product_id];
                                            return next;
                                          });
                                          void (async () => {
                                            const r =
                                              await removePhysicalCountItemAction(
                                                count.id,
                                                item.id,
                                              );
                                            if (!r.ok) {
                                              setError(r.error ?? "Error");
                                              setLocalItems((prev) => [
                                                ...prev,
                                                removed,
                                              ]);
                                            }
                                          })();
                                        }}
                                      >
                                        Quitar
                                      </button>
                                    ) : null}
                                  </div>
                                ) : (
                                  <div className="text-right tabular-nums">
                                    <p className="font-display text-xl font-semibold">
                                      {item
                                        ? formatQty(item.counted_qty)
                                        : "—"}
                                    </p>
                                    {statusEditable &&
                                    !ownsDraft &&
                                    item?.created_by_name ? (
                                      <p className="text-xs text-[var(--muted)]">
                                        {item.created_by_name}
                                      </p>
                                    ) : null}
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ul>

                        {group.myDraftInCategory > 0 && canEdit ? (
                          <div className="border-t border-[var(--line)] bg-[var(--surface)]/80 p-3 sm:p-4">
                            {group.countedInCategory < group.totalInCategory ? (
                              <>
                                <button
                                  type="button"
                                  disabled
                                  className="min-h-12 w-full rounded-xl bg-[var(--ink)] px-4 text-sm font-medium text-white disabled:opacity-40"
                                >
                                  Enviar “{group.label}” a revisión
                                </button>
                                <p className="mt-2 text-center text-xs text-amber-800">
                                  Faltan{" "}
                                  {group.totalInCategory -
                                    group.countedInCategory}{" "}
                                  producto
                                  {group.totalInCategory -
                                    group.countedInCategory ===
                                  1
                                    ? ""
                                    : "s"}
                                  . Cuente todos (0 vale) para poder enviar.
                                </p>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  disabled={pending}
                                  className="min-h-12 w-full rounded-xl bg-[var(--ink)] px-4 text-sm font-medium text-white disabled:opacity-50"
                                  onClick={() => submitCategory(group)}
                                >
                                  Enviar “{group.label}” a revisión (
                                  {group.myDraftInCategory})
                                </button>
                                <p className="mt-2 text-center text-xs text-[var(--muted)]">
                                  Congela el stock del sistema solo para esta
                                  categoría. Otros pueden seguir en las suyas.
                                </p>
                              </>
                            )}
                          </div>
                        ) : otherOccupant && group.draftInCategory > 0 ? (
                          <div className="border-t border-[var(--line)] bg-amber-50/60 px-3 py-3 text-center text-xs text-amber-950 sm:px-4">
                            {otherOccupant.name} debe enviar esta categoría a
                            revisión.
                          </div>
                        ) : null}

                        {group.reviewInCategory > 0 ? (
                          <div className="border-t border-[var(--line)] bg-amber-50 px-4 py-3 text-sm text-amber-950">
                            {canAdjust ? (
                              <>
                                “{group.label}” en revisión.{" "}
                                <Link
                                  href={`/inventario/revision/${count.id}`}
                                  className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
                                >
                                  Autorizar en Revisión física
                                </Link>
                              </>
                            ) : (
                              <>
                                “{group.label}” enviado. Esperando revisión de
                                Gestión.
                              </>
                            )}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {isClosed ? (
        <section className="space-y-3">
          <div>
            <h3 className="text-base font-medium">Conteo cerrado</h3>
            <p className="text-sm text-[var(--muted)]">
              Todas las categorías enviadas quedaron ajustadas.
            </p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
            <ul className="divide-y divide-[var(--line)]">
              {localItems.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <p className="font-medium">{item.product_name}</p>
                  <div className="text-right tabular-nums">
                    <p className="font-display text-lg font-semibold">
                      {formatQty(item.counted_qty)}{" "}
                      <span className="text-xs font-sans font-normal text-[var(--muted)]">
                        {item.unit}
                      </span>
                    </p>
                    {canAdjust ? (
                      <p className="text-xs text-[var(--muted)]">
                        Sistema {formatQty(item.system_qty)} · Dif.{" "}
                        {Number(item.difference_qty) > 0
                          ? `+${formatQty(item.difference_qty)}`
                          : formatQty(item.difference_qty)}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {!isClosed && canEdit ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--line)] bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(18,18,18,0.08)] backdrop-blur md:sticky md:bottom-4 md:inset-x-auto md:rounded-2xl md:border md:p-4 md:shadow-lg">
          <div className="mx-auto max-w-3xl">
            <p className="text-sm font-medium md:text-base">
              {focusCategoryLabel && myDraftCount > 0
                ? `“${focusCategoryLabel}”: ${myDraftCount} por enviar`
                : countedCount === 0
                  ? "Abra una categoría libre y empiece a contar"
                  : occupiedByOthers.size > 0
                    ? `${occupiedByOthers.size} categoría${occupiedByOthers.size === 1 ? "" : "s"} ocupada${occupiedByOthers.size === 1 ? "" : "s"} · elija una libre`
                    : reviewCount > 0
                      ? `${reviewCount} en revisión · elija la siguiente categoría`
                      : "Sin borradores por enviar"}
            </p>
            <p className="mt-0.5 text-xs text-[var(--muted)] md:text-sm">
              {focusCategoryLabel
                ? `Envíe “${focusCategoryLabel}” para poder tomar otra.`
                : "Varios pueden contar a la vez: una categoría por persona."}
            </p>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}
    </div>
  );
}
