"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  bulkImportProductsAction,
  createProductAction,
  createProductCategoryAction,
  createProductUnitAction,
  softDeleteProductAction,
  softDeleteProductCategoryAction,
  softDeleteProductUnitAction,
  updateProductAction,
  updateProductMinStockAction,
  updateProductUnitAction,
} from "../../compras/inventory-actions";
import { money } from "@/lib/money";
import { suggestedPurchaseQty } from "@/lib/inventory/cost";
import {
  BULK_PRODUCT_COLUMN_META,
  BULK_PRODUCT_HEADER_REQUIRED,
  buildBulkProductExample,
} from "@/lib/inventory/bulk-paste";

function formatUnitCost(value: number | string) {
  const n = money(value).toDecimalPlaces(4).toNumber();
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(n);
}

export type CategoryRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
};
export type UnitRow = {
  id: string;
  code: string;
  name: string;
};
export type ProductRow = {
  id: string;
  category_id: string;
  unit_id: string;
  sku: string | null;
  name: string;
  unit: string;
  min_stock: number | string;
  current_stock: number | string;
  unit_cost: number | string;
  notes: string | null;
};

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2";

export function CreateCategoryForm() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-[var(--line)] px-4 py-2.5 text-sm"
      >
        Nueva categoría
      </button>
    );
  }
  return (
    <form
      className="space-y-3 rounded-xl border border-[var(--line)] bg-white p-4"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await createProductCategoryAction(fd);
          if (!r.ok) setError(r.error ?? "Error");
          else setOpen(false);
        });
      }}
    >
      <input name="code" placeholder="Código" required className={inputClass} />
      <input name="name" placeholder="Nombre" required className={inputClass} />
      <input name="description" placeholder="Descripción" className={inputClass} />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-[var(--ink)] px-3 py-2 text-sm text-white">
          Guardar
        </button>
        <button type="button" className="text-sm text-[var(--muted)]" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function CreateUnitForm() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-[var(--line)] px-4 py-2.5 text-sm"
      >
        Nueva unidad
      </button>
    );
  }
  return (
    <form
      className="space-y-3 rounded-xl border border-[var(--line)] bg-white p-4"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await createProductUnitAction(fd);
          if (!r.ok) setError(r.error ?? "Error");
          else setOpen(false);
        });
      }}
    >
      <p className="text-sm text-[var(--muted)]">
        Maestro de unidades (ML, L, KG, UND…). Se usa al crear productos.
      </p>
      <input name="code" placeholder="Código (ej. ML)" required className={inputClass} />
      <input name="name" placeholder="Nombre (ej. Mililitro)" required className={inputClass} />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-[var(--ink)] px-3 py-2 text-sm text-white">
          Guardar unidad
        </button>
        <button type="button" className="text-sm text-[var(--muted)]" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function UnitRowItem({ unit }: { unit: UnitRow }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (editing) {
    return (
      <li className="rounded-lg border border-[var(--line)] bg-white p-2">
        <form
          className="space-y-2"
          action={(fd) => {
            setError(null);
            startTransition(async () => {
              const r = await updateProductUnitAction(unit.id, fd);
              if (!r.ok) setError(r.error ?? "Error");
              else setEditing(false);
            });
          }}
        >
          <input
            name="code"
            required
            defaultValue={unit.code}
            className={inputClass}
            aria-label="Código de unidad"
          />
          <input
            name="name"
            required
            defaultValue={unit.name}
            className={inputClass}
            aria-label="Nombre de unidad"
          />
          {error ? <p className="text-xs text-red-700">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-[var(--ink)] px-2.5 py-1 text-xs text-white disabled:opacity-60"
            >
              Guardar
            </button>
            <button
              type="button"
              className="text-xs text-[var(--muted)]"
              onClick={() => {
                setError(null);
                setEditing(false);
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="font-medium">{unit.code}</span>
          <span className="text-[var(--muted)]"> · {unit.name}</span>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            className="text-xs text-[var(--muted)] hover:text-[var(--ink)]"
            onClick={() => {
              setError(null);
              setEditing(true);
            }}
          >
            Editar
          </button>
          <button
            type="button"
            disabled={pending}
            className="text-xs text-red-700 disabled:opacity-60"
            onClick={() => {
              if (!confirm(`¿Eliminar unidad ${unit.code}?`)) return;
              setError(null);
              startTransition(async () => {
                const r = await softDeleteProductUnitAction(unit.id);
                if (!r.ok) setError(r.error ?? "Error");
              });
            }}
          >
            Eliminar
          </button>
        </div>
      </div>
      {error ? <p className="mt-1 text-xs text-red-700">{error}</p> : null}
    </li>
  );
}

export function CreateProductForm({
  categories,
  units,
}: {
  categories: CategoryRow[];
  units: UnitRow[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-[var(--ink)] px-4 py-2.5 text-sm font-medium text-white"
      >
        Nuevo producto
      </button>
    );
  }
  return (
    <form
      className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-5"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await createProductAction(fd);
          if (!r.ok) setError(r.error ?? "Error");
          else setOpen(false);
        });
      }}
    >
      <div className="flex justify-between">
        <h3 className="font-medium">Producto de inventario</h3>
        <button type="button" className="text-sm text-[var(--muted)]" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
      <ProductFields categories={categories} units={units} />
      <p className="text-xs text-[var(--muted)]">
        El costo unitario se recalcula con promedio ponderado al recibir compras nuevas.
      </p>
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      <button type="submit" disabled={pending} className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm text-white">
        {pending ? "Guardando…" : "Guardar producto"}
      </button>
    </form>
  );
}

export function BulkImportProductsForm({
  categories,
  units,
}: {
  categories: CategoryRow[];
  units: UnitRow[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<{ line: number; message: string }[]>(
    [],
  );
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const example = buildBulkProductExample(units);
  const sampleRow = example.rows[0];

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setError(null);
          setRowErrors([]);
          setSuccess(null);
          setOpen(true);
        }}
        className="rounded-lg border border-[var(--line)] px-4 py-2.5 text-sm"
        disabled={categories.length === 0 || units.length === 0}
        title={
          categories.length === 0 || units.length === 0
            ? "Cree al menos una categoría y una unidad antes"
            : undefined
        }
      >
        Carga masiva
      </button>
    );
  }

  return (
    <form
      className="basis-full space-y-4 rounded-xl border border-[var(--line)] bg-white p-5"
      action={(fd) => {
        setError(null);
        setRowErrors([]);
        setSuccess(null);
        startTransition(async () => {
          const r = await bulkImportProductsAction(fd);
          if (!r.ok) {
            setError(r.error ?? "Error");
            setRowErrors(r.errors ?? []);
            return;
          }
          const partial =
            r.errors && r.errors.length > 0
              ? ` · ${r.errors.length} fila(s) con error`
              : "";
          setSuccess(`Se crearon ${r.created ?? 0} producto(s)${partial}.`);
          setRowErrors(r.errors ?? []);
          if (!r.errors?.length) setOpen(false);
        });
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">Carga masiva por categoría</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Pegue filas desde Excel o un texto. Todos los productos quedan en la
            categoría elegida y deben usar unidades del maestro.
          </p>
        </div>
        <button
          type="button"
          className="text-sm text-[var(--muted)]"
          onClick={() => setOpen(false)}
        >
          Cerrar
        </button>
      </div>

      <div className="space-y-3 rounded-lg border border-[var(--line)] bg-neutral-50 px-4 py-4 text-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-medium">Cómo debe verse cada fila</p>
            <p className="mt-1 text-[var(--muted)]">
              Una fila = un producto. Separe columnas con{" "}
              <strong className="font-medium text-[var(--ink)]">;</strong> o pegue
              directo desde Excel (tabulador). Bastan{" "}
              <strong className="font-medium text-[var(--ink)]">
                nombre, unidad, stock mínimo y costo
              </strong>
              . El costo acepta formato moneda (
              <code className="text-[var(--ink)]">$ 10,466</code>). SKU y notas
              son opcionales.
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-sm"
            disabled={example.rows.length === 0}
            onClick={() => {
              const el = document.getElementById(
                "bulk-paste-textarea",
              ) as HTMLTextAreaElement | null;
              if (!el) return;
              el.value = example.pasteText;
              el.focus();
            }}
          >
            Usar ejemplo
          </button>
        </div>

        <div className="rounded-lg border border-[var(--line)] bg-white px-3 py-3">
          <p className="text-xs font-medium text-[var(--ink)]">
            En la columna unidad use el código, no el nombre
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {units.map((u) => (
              <li
                key={u.id}
                className="rounded-md border border-[var(--line)] bg-neutral-50 px-2.5 py-1 text-xs"
              >
                <span className="font-semibold text-[var(--ink)]">{u.code}</span>
                <span className="text-[var(--muted)]"> = {u.name}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="overflow-x-auto rounded-lg border border-[var(--line)] bg-white">
          <table className="min-w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--line)] bg-neutral-50">
                {BULK_PRODUCT_COLUMN_META.filter((col) => col.required).map(
                  (col) => (
                    <th
                      key={col.key}
                      className="whitespace-nowrap px-3 py-2.5 font-medium text-[var(--ink)]"
                    >
                      <span className="block">{col.label}</span>
                      <span className="mt-0.5 block font-normal text-amber-800">
                        Obligatorio
                      </span>
                    </th>
                  ),
                )}
                {BULK_PRODUCT_COLUMN_META.filter((col) => !col.required).map(
                  (col) => (
                    <th
                      key={col.key}
                      className="whitespace-nowrap px-3 py-2.5 font-medium text-[var(--muted)]"
                    >
                      <span className="block">{col.label}</span>
                      <span className="mt-0.5 block font-normal">Opcional</span>
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {example.rows.map((row, idx) => (
                <tr
                  key={idx}
                  className="border-b border-[var(--line)] last:border-b-0"
                >
                  {BULK_PRODUCT_COLUMN_META.map((col, cellIdx) => {
                    const cell = row[cellIdx] ?? "";
                    const isUnitCol = cellIdx === 1;
                    const isOptionalEmpty = !col.required && !cell;
                    return (
                      <td
                        key={col.key}
                        className={
                          isUnitCol
                            ? "whitespace-nowrap px-3 py-2 font-semibold text-[var(--ink)]"
                            : "whitespace-nowrap px-3 py-2 text-[var(--ink)]"
                        }
                      >
                        {isOptionalEmpty ? (
                          <span className="text-[var(--muted)]">—</span>
                        ) : (
                          cell || <span className="text-[var(--muted)]">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {sampleRow ? (
          <p className="text-xs text-[var(--muted)]">
            Formato mínimo (sin SKU ni notas):
            <code className="mt-1 block overflow-x-auto rounded-md border border-[var(--line)] bg-white px-3 py-2 font-mono text-[11px] leading-relaxed text-[var(--ink)]">
              {BULK_PRODUCT_HEADER_REQUIRED}
              <br />
              {sampleRow.slice(0, 4).join(";")}
            </code>
          </p>
        ) : null}
      </div>

      <label className="block text-sm">
        <span className="mb-1.5 block text-[var(--muted)]">Categoría destino *</span>
        <select name="category_id" required defaultValue="" className={inputClass}>
          <option value="">Seleccione…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} — {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="mb-1.5 block text-[var(--muted)]">
          Pegue aquí los productos (una fila por producto) *
        </span>
        <textarea
          id="bulk-paste-textarea"
          name="paste"
          required
          rows={8}
          spellCheck={false}
          placeholder={
            sampleRow
              ? `Ejemplo (SKU y notas no son necesarios):\n${BULK_PRODUCT_HEADER_REQUIRED}\n${sampleRow.slice(0, 4).join(";")}`
              : "Pegue aquí…"
          }
          className={`${inputClass} font-mono text-xs leading-relaxed`}
        />
      </label>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}
      {success ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {success}
        </p>
      ) : null}
      {rowErrors.length > 0 ? (
        <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {rowErrors.map((e) => (
            <li key={`${e.line}-${e.message}`}>
              {e.line > 0 ? `Fila ${e.line}: ` : ""}
              {e.message}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm text-white disabled:opacity-60"
        >
          {pending ? "Importando…" : "Importar productos"}
        </button>
        <button
          type="button"
          className="text-sm text-[var(--muted)]"
          onClick={() => setOpen(false)}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function ProductFields({
  categories,
  units,
  product,
}: {
  categories: CategoryRow[];
  units: UnitRow[];
  product?: ProductRow;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label className="block text-sm md:col-span-2">
        <span className="mb-1.5 block text-[var(--muted)]">Categoría *</span>
        <select
          name="category_id"
          required
          defaultValue={product?.category_id ?? ""}
          className={inputClass}
        >
          <option value="">Seleccione…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} — {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm md:col-span-2">
        <span className="mb-1.5 block text-[var(--muted)]">Nombre *</span>
        <input
          name="name"
          required
          defaultValue={product?.name ?? ""}
          className={inputClass}
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-[var(--muted)]">SKU</span>
        <input name="sku" defaultValue={product?.sku ?? ""} className={inputClass} />
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-[var(--muted)]">Unidad *</span>
        <select
          name="unit_id"
          required
          defaultValue={product?.unit_id ?? ""}
          className={inputClass}
        >
          <option value="">Seleccione…</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.code} — {u.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-[var(--muted)]">Stock actual</span>
        <input
          name="current_stock"
          defaultValue={String(product?.current_stock ?? "0")}
          className={inputClass}
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-[var(--muted)]">Stock mínimo *</span>
        <input
          name="min_stock"
          required
          defaultValue={product != null ? String(product.min_stock) : ""}
          className={inputClass}
        />
      </label>
      <label className="block text-sm md:col-span-2">
        <span className="mb-1.5 block text-[var(--muted)]">Costo unitario *</span>
        <input
          name="unit_cost"
          required
          defaultValue={product != null ? String(product.unit_cost) : ""}
          className={inputClass}
        />
      </label>
      <label className="block text-sm md:col-span-2">
        <span className="mb-1.5 block text-[var(--muted)]">Notas</span>
        <textarea
          name="notes"
          rows={2}
          defaultValue={product?.notes ?? ""}
          className={inputClass}
        />
      </label>
    </div>
  );
}

function ProductCard({
  product,
  categories,
  units,
  canEditMinStock,
}: {
  product: ProductRow;
  categories: CategoryRow[];
  units: UnitRow[];
  canEditMinStock: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editingMin, setEditingMin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const stock = Number(product.current_stock);
  const suggest = suggestedPurchaseQty(stock, Number(product.min_stock));
  const underMin = suggest > 0;
  const zeroStock = !Number.isNaN(stock) && stock <= 0;

  return (
    <article className="border-t border-[var(--line)] bg-white px-4 py-3 first:border-t-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{product.name}</p>
          <p className="text-sm text-[var(--muted)]">
            {product.sku ? `SKU ${product.sku} · ` : ""}
            {product.unit}
            {" · "}
            <span
              className={
                zeroStock
                  ? "font-medium text-red-700"
                  : underMin
                    ? "font-medium text-amber-800"
                    : undefined
              }
            >
              stock {product.current_stock}
            </span>
            {" / mín. "}
            {product.min_stock}
            {" · "}
            {formatUnitCost(product.unit_cost)}/u
            {underMin ? ` · sugerido comprar ${suggest}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEditMinStock ? (
            <button
              type="button"
              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm"
              onClick={() => {
                setError(null);
                setEditing(false);
                setEditingMin((v) => !v);
              }}
            >
              {editingMin ? "Cerrar mín." : "Stock mín."}
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm"
            onClick={() => {
              setError(null);
              setEditingMin(false);
              setEditing((v) => !v);
            }}
          >
            {editing ? "Cerrar" : "Editar"}
          </button>
          <button
            type="button"
            disabled={pending}
            className="text-sm text-red-700"
            onClick={() => {
              if (!confirm("¿Desactivar producto?")) return;
              startTransition(async () => {
                await softDeleteProductAction(product.id);
              });
            }}
          >
            Desactivar
          </button>
        </div>
      </div>

      {editingMin && canEditMinStock ? (
        <form
          className="mt-3 flex flex-wrap items-end gap-2 border-t border-[var(--line)] pt-3"
          action={(fd) => {
            setError(null);
            startTransition(async () => {
              const r = await updateProductMinStockAction(product.id, fd);
              if (!r.ok) setError(r.error ?? "Error");
              else setEditingMin(false);
            });
          }}
        >
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--muted)]">Stock mínimo</span>
            <input
              name="min_stock"
              required
              autoFocus
              defaultValue={String(product.min_stock)}
              className={`${inputClass} w-32`}
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-[var(--ink)] px-3 py-2 text-sm text-white disabled:opacity-60"
          >
            {pending ? "Guardando…" : "Guardar"}
          </button>
          {error ? <p className="w-full text-sm text-red-700">{error}</p> : null}
        </form>
      ) : null}

      {editing ? (
        <form
          className="mt-4 space-y-3 border-t border-[var(--line)] pt-4"
          action={(fd) => {
            setError(null);
            startTransition(async () => {
              const r = await updateProductAction(product.id, fd);
              if (!r.ok) setError(r.error ?? "Error");
              else setEditing(false);
            });
          }}
        >
          <ProductFields categories={categories} units={units} product={product} />
          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {pending ? "Guardando…" : "Guardar cambios"}
          </button>
        </form>
      ) : null}
    </article>
  );
}

function CategoryGroup({
  category,
  products,
  categories,
  units,
  canEditMinStock,
  defaultOpen,
}: {
  category: CategoryRow | null;
  products: ProductRow[];
  categories: CategoryRow[];
  units: UnitRow[];
  canEditMinStock: boolean;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);
  const underMinCount = products.filter(
    (p) =>
      suggestedPurchaseQty(Number(p.current_stock), Number(p.min_stock)) > 0,
  ).length;
  const title = category
    ? `${category.code} — ${category.name}`
    : "Sin categoría";
  const description = category?.description ?? null;

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">
      <div className="flex items-start gap-2 border-l-4 border-l-[var(--ink)] bg-neutral-50 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-start justify-between gap-3 text-left"
          aria-expanded={open}
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium">{title}</h3>
              <span className="rounded-md bg-white px-2 py-0.5 text-xs text-[var(--muted)] ring-1 ring-[var(--line)]">
                {products.length}{" "}
                {products.length === 1 ? "producto" : "productos"}
              </span>
              {underMinCount > 0 ? (
                <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs text-amber-900 ring-1 ring-amber-200">
                  {underMinCount} bajo mínimo
                </span>
              ) : null}
            </div>
            {description ? (
              <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
            ) : null}
            {error ? (
              <p className="mt-1 text-xs text-red-700">{error}</p>
            ) : null}
          </div>
          <span className="mt-0.5 shrink-0 text-sm text-[var(--muted)]">
            {open ? "Ocultar" : "Ver"}
          </span>
        </button>
        {category ? (
          <button
            type="button"
            disabled={pending}
            className="mt-0.5 shrink-0 text-xs text-red-700 disabled:opacity-60"
            onClick={() => {
              if (
                !confirm(
                  `¿Eliminar categoría ${category.code}? Solo si no tiene productos.`,
                )
              ) {
                return;
              }
              setError(null);
              startTransition(async () => {
                const r = await softDeleteProductCategoryAction(category.id);
                if (!r.ok) setError(r.error ?? "Error");
              });
            }}
          >
            Eliminar
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="border-t border-[var(--line)] border-l-4 border-l-[var(--line)]">
          {products.length === 0 ? (
            <p className="px-4 py-4 text-sm text-[var(--muted)]">
              Sin productos en esta categoría.
            </p>
          ) : (
            products.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                categories={categories}
                units={units}
                canEditMinStock={canEditMinStock}
              />
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}

export function InventoryLists({
  categories,
  units,
  products,
  canEditMinStock,
}: {
  categories: CategoryRow[];
  units: UnitRow[];
  products: ProductRow[];
  canEditMinStock: boolean;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const filteredProducts = useMemo(() => {
    if (!searching) return products;
    return products.filter((p) => {
      const cat = categoryById.get(p.category_id);
      const haystack = [
        p.name,
        p.sku ?? "",
        p.unit,
        cat?.code ?? "",
        cat?.name ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [products, searching, q, categoryById]);

  const groups = useMemo(() => {
    const byCategory = new Map<string, ProductRow[]>();
    for (const c of categories) byCategory.set(c.id, []);
    const orphan: ProductRow[] = [];

    for (const p of filteredProducts) {
      const list = byCategory.get(p.category_id);
      if (list) list.push(p);
      else orphan.push(p);
    }

    const all = [
      ...categories.map((c) => ({
        key: c.id,
        category: c as CategoryRow | null,
        products: byCategory.get(c.id) ?? [],
      })),
      ...(orphan.length > 0
        ? [{ key: "__orphan__", category: null as CategoryRow | null, products: orphan }]
        : []),
    ];

    if (!searching) return all;
    return all.filter((g) => g.products.length > 0);
  }, [categories, filteredProducts, searching]);

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-[var(--muted)]">Unidades</h3>
          {units.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Cree ML, L, KG, UND…</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {units.map((u) => (
                <UnitRowItem key={u.id} unit={u} />
              ))}
            </ul>
          )}
        </section>
        <section className="space-y-1">
          <h3 className="text-sm font-medium text-[var(--muted)]">Resumen</h3>
          <p className="text-sm">
            {categories.length}{" "}
            {categories.length === 1 ? "categoría" : "categorías"}
            {" · "}
            {searching ? (
              <>
                {filteredProducts.length} de {products.length} productos
              </>
            ) : (
              <>
                {products.length}{" "}
                {products.length === 1 ? "producto" : "productos"}
              </>
            )}
          </p>
        </section>
      </aside>

      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-medium">Inventario por categoría</h3>
            <p className="text-sm text-[var(--muted)]">
              Los productos viven dentro de su categoría
            </p>
          </div>
          <label className="block min-w-[220px] flex-1 text-sm sm:max-w-sm">
            <span className="mb-1 block text-[var(--muted)]">Buscar inventario</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nombre, SKU, categoría o unidad…"
              className={inputClass}
            />
          </label>
        </div>
        {groups.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            {searching
              ? `No hay productos que coincidan con «${query.trim()}».`
              : "Cree una categoría para empezar a agrupar productos."}
          </p>
        ) : (
          groups.map((g) => (
            <CategoryGroup
              key={g.key}
              category={g.category}
              products={g.products}
              categories={categories}
              units={units}
              canEditMinStock={canEditMinStock}
              defaultOpen={searching && g.products.length > 0}
            />
          ))
        )}
      </div>
    </div>
  );
}
