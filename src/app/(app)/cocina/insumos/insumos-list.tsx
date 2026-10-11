"use client";

import Link from "next/link";
import { useCallback } from "react";
import { formatCOP, money } from "@/lib/money";
import { cn } from "@/lib/utils";
import { FocusProductEffect, productAnchorId } from "../focus-product";
import {
  KitchenRecipeForm,
  type RecipeComponentOption,
} from "../recipe-form";

function formatUnitCost(value: number | string) {
  const n = money(value).toDecimalPlaces(4).toNumber();
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(n);
}

export type InsumoListItem = {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  categoryName: string;
  currentStock: number;
  unitCost: number;
  hasRecipe: boolean;
  recipeName: string | null;
  yieldQty: number | null;
  recipeLines: { quantity: number; unit: string; name: string }[];
};

export function InsumosCatalogList({
  items,
  canProduce,
  canRecipe,
  components,
  focusProductId,
}: {
  items: InsumoListItem[];
  canProduce: boolean;
  canRecipe: boolean;
  components: RecipeComponentOption[];
  focusProductId?: string | null;
}) {
  const onFocus = useCallback(() => {}, []);

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-white">
      <FocusProductEffect productId={focusProductId} onFocus={onFocus} />
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-[var(--line)] bg-[var(--surface)] text-xs uppercase tracking-wide text-[var(--muted)]">
          <tr>
            <th className="px-4 py-3 font-medium">Nombre</th>
            <th className="px-4 py-3 font-medium">Categoría</th>
            <th className="px-4 py-3 font-medium">Stock</th>
            <th className="px-4 py-3 font-medium">Costo / u</th>
            <th className="px-4 py-3 font-medium">Valor</th>
            <th className="px-4 py-3 font-medium">Receta / crear más</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => {
            const focused = focusProductId === p.id;
            return (
              <tr
                key={p.id}
                id={productAnchorId(p.id)}
                className={cn(
                  "border-b border-[var(--line)] align-top last:border-0 scroll-mt-24",
                  focused && "bg-amber-50 ring-2 ring-inset ring-amber-400",
                )}
              >
                <td className="px-4 py-3">
                  <p className="font-medium">{p.name}</p>
                  {p.sku ? (
                    <p className="text-xs text-[var(--muted)]">{p.sku}</p>
                  ) : null}
                  {p.hasRecipe ? (
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Receta: {p.recipeName}
                      {p.recipeLines.length > 0 ? (
                        <span className="mt-0.5 block">
                          {p.recipeLines
                            .map((l) => `${l.quantity} ${l.unit} ${l.name}`)
                            .join(" · ")}
                        </span>
                      ) : null}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-amber-800">Sin receta</p>
                  )}
                </td>
                <td className="px-4 py-3 text-[var(--muted)]">{p.categoryName}</td>
                <td className="px-4 py-3">
                  {p.currentStock} {p.unit}
                </td>
                <td className="px-4 py-3">{formatUnitCost(p.unitCost)}</td>
                <td className="px-4 py-3">
                  {formatCOP(money(p.currentStock).times(p.unitCost))}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col items-start gap-2">
                    {canRecipe ? (
                      <KitchenRecipeForm
                        productId={p.id}
                        productName={p.name}
                        defaultYield={String(p.yieldQty ?? 1)}
                        existingName={p.recipeName}
                        components={components}
                      />
                    ) : null}
                    {canProduce ? (
                      p.hasRecipe ? (
                        <Link
                          href={`/cocina/producciones/nueva?producto=${p.id}`}
                          className="rounded-md bg-[var(--ink)] px-2.5 py-1 text-xs text-white"
                        >
                          Crear más
                        </Link>
                      ) : (
                        <span
                          className="rounded-md border border-dashed border-[var(--line)] px-2.5 py-1 text-xs text-[var(--muted)]"
                          title="Defina la receta (materias primas) primero"
                        >
                          Crear más (falta receta)
                        </span>
                      )
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
