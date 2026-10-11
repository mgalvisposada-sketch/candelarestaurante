"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Card } from "@/components/ui/primitives";
import { formatCOP } from "@/lib/money";
import { cn } from "@/lib/utils";
import { FocusProductEffect, productAnchorId } from "../focus-product";
import {
  KitchenRecipeForm,
  type RecipeComponentOption,
} from "../recipe-form";

function formatUnitCost(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(value);
}

export type PreparacionListItem = {
  id: string;
  name: string;
  unit: string;
  currentStock: number | string;
  inventoryUnitCost: number;
  theoreticalUnitCost: number | null;
  theoreticalBatchCost: number | null;
  yieldQty: number | null;
  recipeName: string | null;
  recipeLines: { quantity: number; unit: string; name: string }[];
  hasRecipe: boolean;
};

export type PreparacionCategoryGroup = {
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  items: PreparacionListItem[];
};

function categoryIdForProduct(
  groups: PreparacionCategoryGroup[],
  productId: string | null | undefined,
) {
  if (!productId) return null;
  for (const g of groups) {
    if (g.items.some((i) => i.id === productId)) return g.categoryId;
  }
  return null;
}

export function PreparacionesByCategoryList({
  groups,
  canProduce,
  components,
  focusProductId,
}: {
  groups: PreparacionCategoryGroup[];
  canProduce: boolean;
  components: RecipeComponentOption[];
  focusProductId?: string | null;
}) {
  const initialCat = categoryIdForProduct(groups, focusProductId);
  const [openIds, setOpenIds] = useState<Set<string>>(
    () => new Set(initialCat ? [initialCat] : []),
  );

  const onFocus = useCallback(
    (productId: string) => {
      const catId = categoryIdForProduct(groups, productId);
      if (!catId) return;
      setOpenIds((prev) => {
        if (prev.has(catId)) return prev;
        const next = new Set(prev);
        next.add(catId);
        return next;
      });
    },
    [groups],
  );

  const allOpen =
    groups.length > 0 && groups.every((g) => openIds.has(g.categoryId));

  function toggle(categoryId: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  function setAll(open: boolean) {
    setOpenIds(open ? new Set(groups.map((g) => g.categoryId)) : new Set());
  }

  const totalItems = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="space-y-4">
      <FocusProductEffect productId={focusProductId} onFocus={onFocus} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          {groups.length} categoría{groups.length === 1 ? "" : "s"} · {totalItems}{" "}
          preparación{totalItems === 1 ? "" : "es"}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-md border border-[var(--line)] px-2.5 py-1 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
            onClick={() => setAll(true)}
            disabled={allOpen}
          >
            Expandir todo
          </button>
          <button
            type="button"
            className="rounded-md border border-[var(--line)] px-2.5 py-1 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
            onClick={() => setAll(false)}
            disabled={openIds.size === 0}
          >
            Colapsar todo
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {groups.map((group) => {
          const open = openIds.has(group.categoryId);
          const panelId = `prep-cat-${group.categoryId}`;
          return (
            <section
              key={group.categoryId}
              className="overflow-hidden rounded-xl border border-[var(--line)] bg-white"
            >
              <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => toggle(group.categoryId)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface)]"
              >
                <div className="min-w-0">
                  <h2 className="font-display text-base font-semibold">
                    <span className="text-[var(--muted)]">
                      {group.categoryCode}
                    </span>
                    <span className="mx-2 text-[var(--muted)]">·</span>
                    {group.categoryName}
                  </h2>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {group.items.length} preparación
                    {group.items.length === 1 ? "" : "es"}
                    {open ? "" : " · clic para ver"}
                  </p>
                </div>
                <span
                  className={cn(
                    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] text-sm text-[var(--muted)] transition-transform",
                    open && "rotate-180",
                  )}
                  aria-hidden
                >
                  ▾
                </span>
              </button>

              {open ? (
                <div
                  id={panelId}
                  className="space-y-3 border-t border-[var(--line)] bg-[var(--surface)]/40 px-3 py-3 sm:px-4"
                >
                  {group.items.map((p) => {
                    const focused = focusProductId === p.id;
                    return (
                      <Card
                        key={p.id}
                        id={productAnchorId(p.id)}
                        className={cn(
                          "scroll-mt-24",
                          focused && "ring-2 ring-amber-400 bg-amber-50",
                        )}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h3 className="font-medium">{p.name}</h3>
                            <p className="text-sm text-[var(--muted)]">
                              Stock {p.currentStock} {p.unit}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                              {p.theoreticalUnitCost != null ? (
                                <span>
                                  Teórico{" "}
                                  <strong>
                                    {formatUnitCost(p.theoreticalUnitCost)}
                                  </strong>{" "}
                                  / {p.unit}
                                </span>
                              ) : (
                                <span className="text-[var(--muted)]">
                                  Sin receta
                                </span>
                              )}
                              <span>
                                Inventario{" "}
                                <strong>
                                  {formatUnitCost(p.inventoryUnitCost)}
                                </strong>{" "}
                                / {p.unit}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col items-start gap-2 sm:items-end">
                            <KitchenRecipeForm
                              productId={p.id}
                              productName={p.name}
                              defaultYield={String(p.yieldQty ?? 1)}
                              existingName={p.recipeName}
                              components={components.filter(
                                (c) => c.id !== p.id,
                              )}
                            />
                            {canProduce ? (
                              p.hasRecipe ? (
                                <Link
                                  href={`/cocina/producciones/nueva-preparacion?producto=${p.id}`}
                                  className="rounded-md bg-[var(--ink)] px-2.5 py-1 text-xs text-white"
                                >
                                  Crear más
                                </Link>
                              ) : (
                                <span
                                  className="rounded-md border border-dashed border-[var(--line)] px-2.5 py-1 text-xs text-[var(--muted)]"
                                  title="Defina la receta primero"
                                >
                                  Crear más (falta receta)
                                </span>
                              )
                            ) : null}
                          </div>
                        </div>
                        {p.hasRecipe ? (
                          <ul className="mt-3 space-y-1 text-sm text-[var(--muted)]">
                            {p.recipeLines.map((l, i) => (
                              <li key={`${p.id}-${i}`}>
                                {l.quantity} {l.unit} · {l.name}
                              </li>
                            ))}
                            <li className="pt-1 text-[var(--ink)]">
                              Costo batch teórico ≈{" "}
                              {formatCOP(p.theoreticalBatchCost ?? 0)} para{" "}
                              {p.yieldQty ?? 1} {p.unit}
                            </li>
                          </ul>
                        ) : null}
                      </Card>
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
