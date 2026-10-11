"use client";

import Link from "next/link";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useCallback, useState, useTransition } from "react";
import { formatCOP, money } from "@/lib/money";
import { cn } from "@/lib/utils";
import { FocusProductEffect, productAnchorId } from "../focus-product";
import {
  softDeleteKitchenProductAction,
  updateKitchenProductAction,
} from "../kitchen-actions";

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-2.5 py-1.5 text-sm outline-none ring-[var(--accent)] focus:ring-2";

const iconBtn =
  "inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--line)] text-[var(--ink)] transition-colors hover:bg-[var(--surface)] disabled:opacity-50";

function formatUnitCost(value: number | string) {
  const n = money(value).toDecimalPlaces(4).toNumber();
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(n);
}

export type CategoryOption = { id: string; code: string; name: string };
export type UnitOption = { id: string; code: string; name: string };

export type InsumoListItem = {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  unitId: string;
  categoryId: string;
  categoryName: string;
  currentStock: number;
  minStock: number;
  unitCost: number;
  notes: string | null;
};

export type InsumoCategoryGroup = {
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  items: InsumoListItem[];
};

function categoryIdForProduct(
  groups: InsumoCategoryGroup[],
  productId: string | null | undefined,
) {
  if (!productId) return null;
  for (const g of groups) {
    if (g.items.some((i) => i.id === productId)) return g.categoryId;
  }
  return null;
}

function InsumoRow({
  product,
  categories,
  units,
  canProduce,
  canEdit,
  focused,
}: {
  product: InsumoListItem;
  categories: CategoryOption[];
  units: UnitOption[];
  canProduce: boolean;
  canEdit: boolean;
  focused: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (editing) {
    return (
      <tr
        id={productAnchorId(product.id)}
        className={cn(
          "border-b border-[var(--line)] scroll-mt-24",
          focused && "bg-amber-50 ring-2 ring-inset ring-amber-400",
        )}
      >
        <td colSpan={5} className="px-3 py-3">
          <form
            className="mx-auto max-w-2xl space-y-2.5"
            action={(fd) => {
              setError(null);
              startTransition(async () => {
                const r = await updateKitchenProductAction(product.id, fd);
                if (!r.ok) setError(r.error ?? "Error");
                else setEditing(false);
              });
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Editar · {product.name}</p>
              <div className="flex items-center gap-1">
                <button
                  type="submit"
                  disabled={pending}
                  className={cn(iconBtn, "border-transparent bg-[var(--ink)] text-white hover:bg-[var(--ink)]")}
                  title="Guardar"
                  aria-label="Guardar"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className={iconBtn}
                  title="Cancelar"
                  aria-label="Cancelar"
                  onClick={() => {
                    setError(null);
                    setEditing(false);
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <input
              name="name"
              required
              defaultValue={product.name}
              className={inputClass}
              placeholder="Nombre"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                name="category_id"
                required
                defaultValue={product.categoryId}
                className={inputClass}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
              <select
                name="unit_id"
                required
                defaultValue={product.unitId}
                className={inputClass}
              >
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.code} — {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2 grid-cols-3">
              <input
                name="current_stock"
                type="number"
                step="any"
                min="0"
                required
                defaultValue={String(product.currentStock)}
                className={inputClass}
                placeholder="Stock"
                title="Stock"
              />
              <input
                name="unit_cost"
                type="number"
                step="any"
                min="0"
                required
                defaultValue={String(product.unitCost)}
                className={inputClass}
                placeholder="Costo / u"
                title="Costo / u"
              />
              <input
                name="min_stock"
                type="number"
                step="any"
                min="0"
                defaultValue={String(product.minStock)}
                className={inputClass}
                placeholder="Mín."
                title="Stock mínimo"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                name="sku"
                defaultValue={product.sku ?? ""}
                className={inputClass}
                placeholder="SKU"
              />
              <input
                name="notes"
                defaultValue={product.notes ?? ""}
                className={inputClass}
                placeholder="Notas"
              />
            </div>
            {error ? <p className="text-xs text-red-700">{error}</p> : null}
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr
      id={productAnchorId(product.id)}
      className={cn(
        "border-b border-[var(--line)] last:border-0 scroll-mt-24",
        focused && "bg-amber-50 ring-2 ring-inset ring-amber-400",
      )}
    >
      <td className="px-3 py-2">
        <p className="font-medium leading-tight">{product.name}</p>
        {product.sku ? (
          <p className="text-xs text-[var(--muted)]">{product.sku}</p>
        ) : null}
      </td>
      <td className="px-3 py-2 whitespace-nowrap tabular-nums">
        {product.currentStock}{" "}
        <span className="text-[var(--muted)]">{product.unit}</span>
      </td>
      <td className="px-3 py-2 whitespace-nowrap tabular-nums">
        {formatUnitCost(product.unitCost)}
      </td>
      <td className="px-3 py-2 whitespace-nowrap tabular-nums">
        {formatCOP(money(product.currentStock).times(product.unitCost))}
      </td>
      <td className="px-2 py-2">
        <div className="flex items-center justify-end gap-1">
          {canProduce ? (
            <Link
              href={`/cocina/producciones/nueva?producto=${product.id}`}
              className={cn(iconBtn, "border-transparent bg-[var(--ink)] text-white hover:bg-[var(--ink)]")}
              title="Crear más"
              aria-label={`Crear más ${product.name}`}
            >
              <Plus className="h-4 w-4" />
            </Link>
          ) : null}
          {canEdit ? (
            <>
              <button
                type="button"
                className={iconBtn}
                title="Editar"
                aria-label={`Editar ${product.name}`}
                onClick={() => {
                  setError(null);
                  setEditing(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={pending}
                className={cn(iconBtn, "text-red-700 hover:bg-red-50")}
                title="Desactivar"
                aria-label={`Desactivar ${product.name}`}
                onClick={() => {
                  if (
                    !confirm(
                      `¿Desactivar «${product.name}»? Dejará de aparecer en el catálogo.`,
                    )
                  ) {
                    return;
                  }
                  startTransition(async () => {
                    const r = await softDeleteKitchenProductAction(product.id);
                    if (!r.ok) setError(r.error ?? "Error");
                  });
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          ) : null}
        </div>
        {error ? (
          <p className="mt-1 text-right text-xs text-red-700">{error}</p>
        ) : null}
      </td>
    </tr>
  );
}

export function InsumosCatalogList({
  groups,
  categories,
  units,
  canProduce,
  canEdit,
  focusProductId,
}: {
  groups: InsumoCategoryGroup[];
  categories: CategoryOption[];
  units: UnitOption[];
  canProduce: boolean;
  canEdit: boolean;
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
          insumo{totalItems === 1 ? "" : "s"}
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
          const panelId = `insumo-cat-${group.categoryId}`;
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
                    {group.items.length} insumo
                    {group.items.length === 1 ? "" : "s"}
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
                <div id={panelId} className="overflow-x-auto border-t border-[var(--line)]">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-[var(--line)] bg-[var(--surface)] text-xs uppercase tracking-wide text-[var(--muted)]">
                      <tr>
                        <th className="px-3 py-2.5 font-medium">Nombre</th>
                        <th className="px-3 py-2.5 font-medium">Stock</th>
                        <th className="px-3 py-2.5 font-medium">Costo / u</th>
                        <th className="px-3 py-2.5 font-medium">Valor</th>
                        <th className="px-2 py-2.5 font-medium text-right"> </th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map((p) => (
                        <InsumoRow
                          key={p.id}
                          product={p}
                          categories={categories}
                          units={units}
                          canProduce={canProduce}
                          canEdit={canEdit}
                          focused={focusProductId === p.id}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
