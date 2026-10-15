"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  bulkImportProductsAction,
  createProductAction,
  createProductCategoryAction,
  createProductUnitAction,
  getProductInventoryMovementsAction,
  indexProductUnitCostsAction,
  softDeleteProductAction,
  softDeleteProductCategoryAction,
  softDeleteProductUnitAction,
  updateProductAction,
  updateProductCategoryAction,
  updateProductMinStockAction,
  updateProductUnitAction,
  updateProductUnitCostAction,
  type ProductInventoryMovementRow,
} from "../../compras/inventory-actions";
import { formatDateTimeCO } from "@/lib/dates";
import { formatCOP, money } from "@/lib/money";
import { indexUnitCost, suggestedPurchaseQty } from "@/lib/inventory/cost";
import { inventoryMovementTypeLabel } from "@/lib/inventory/movement-labels";
import {
  KITCHEN_ITEM_KIND_LABELS,
  type KitchenItemKind,
} from "@/lib/kitchen/cost";
import {
  BULK_PRODUCT_COLUMN_META,
  BULK_PRODUCT_HEADER_REQUIRED,
  buildBulkProductExample,
} from "@/lib/inventory/bulk-paste";
import {
  QuickCreateField,
  QuickCreateSelect,
} from "@/components/ui/quick-create";

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
  /** Si falta (productos viejos), se trata como materia prima. */
  item_kind?: KitchenItemKind | string | null;
  /** false = no se gestiona en inventario (ej. agua de grifo). */
  tracks_inventory?: boolean | null;
};

function productKind(product: ProductRow): KitchenItemKind {
  const kind = product.item_kind;
  if (
    kind === "INSUMO_PREPARACION" ||
    kind === "PREPARACION" ||
    kind === "PRODUCTO_CARTA"
  ) {
    return kind;
  }
  return "MATERIA_PRIMA";
}

function isEditableInInventario(product: ProductRow) {
  return productKind(product) === "MATERIA_PRIMA";
}

function cocinaHrefForProduct(product: ProductRow) {
  const kind = productKind(product);
  if (kind === "INSUMO_PREPARACION") {
    return `/cocina/insumos?producto=${product.id}`;
  }
  if (kind === "PREPARACION") {
    return `/cocina/preparaciones?producto=${product.id}`;
  }
  if (kind === "PRODUCTO_CARTA") {
    return `/cocina/carta?producto=${product.id}`;
  }
  return "/cocina";
}

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
        <button type="submit" disabled={pending} className="rounded-lg bg-[var(--solid)] px-3 py-2 text-sm text-[var(--on-solid)]">
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
        <button type="submit" disabled={pending} className="rounded-lg bg-[var(--solid)] px-3 py-2 text-sm text-[var(--on-solid)]">
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
              className="rounded-md bg-[var(--solid)] px-2.5 py-1 text-xs text-[var(--on-solid)] disabled:opacity-60"
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
        className="rounded-lg bg-[var(--solid)] px-4 py-2.5 text-sm font-medium text-[var(--on-solid)]"
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
      <button type="submit" disabled={pending} className="rounded-lg bg-[var(--solid)] px-5 py-2.5 text-sm text-[var(--on-solid)]">
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
          className="rounded-lg bg-[var(--solid)] px-5 py-2.5 text-sm text-[var(--on-solid)] disabled:opacity-60"
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
  categories: initialCategories,
  units: initialUnits,
  product,
}: {
  categories: CategoryRow[];
  units: UnitRow[];
  product?: ProductRow;
}) {
  const [categories, setCategories] = useState(initialCategories);
  const [units, setUnits] = useState(initialUnits);
  const [categoryId, setCategoryId] = useState(product?.category_id ?? "");
  const [unitId, setUnitId] = useState(product?.unit_id ?? "");

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <QuickCreateSelect
        className="md:col-span-2"
        name="category_id"
        label="Categoría"
        required
        value={categoryId}
        onChange={setCategoryId}
        options={categories.map((c) => ({
          id: c.id,
          label: `${c.code} — ${c.name}`,
        }))}
        placeholder="Seleccione…"
        createLabel="Nueva categoría"
        createTitle="Alta rápida de categoría"
        onCreate={async (fd) => {
          const r = await createProductCategoryAction(fd);
          if (!r.ok || !r.id) {
            return { ok: false, error: r.error ?? "No se pudo crear" };
          }
          const code = String(fd.get("code") ?? "").trim().toUpperCase();
          const name = String(fd.get("name") ?? "").trim();
          const label = `${code} — ${name}`;
          setCategories((prev) =>
            prev.some((c) => c.id === r.id)
              ? prev
              : [...prev, { id: r.id!, code, name, description: null }],
          );
          return { ok: true, id: r.id, label };
        }}
      >
        <QuickCreateField name="code" label="Código" required placeholder="VERD" />
        <QuickCreateField name="name" label="Nombre" required placeholder="Verduras" />
      </QuickCreateSelect>
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
      <QuickCreateSelect
        name="unit_id"
        label="Unidad"
        required
        value={unitId}
        onChange={setUnitId}
        options={units.map((u) => ({
          id: u.id,
          label: `${u.code} — ${u.name}`,
        }))}
        placeholder="Seleccione…"
        createLabel="Nueva unidad"
        createTitle="Alta rápida de unidad"
        onCreate={async (fd) => {
          const r = await createProductUnitAction(fd);
          if (!r.ok || !r.id) {
            return { ok: false, error: r.error ?? "No se pudo crear" };
          }
          const code = String(fd.get("code") ?? "").trim().toUpperCase();
          const name = String(fd.get("name") ?? "").trim();
          const label = `${code} — ${name}`;
          setUnits((prev) =>
            prev.some((u) => u.id === r.id)
              ? prev
              : [...prev, { id: r.id!, code, name }],
          );
          return { ok: true, id: r.id, label };
        }}
      >
        <QuickCreateField name="code" label="Código" required placeholder="KG" />
        <QuickCreateField name="name" label="Nombre" required placeholder="Kilogramo" />
      </QuickCreateSelect>
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

function formatQtyDelta(value: number | string, unit: string) {
  const n = Number(value);
  if (!Number.isFinite(n)) return `— ${unit}`;
  const sign = n > 0 ? "+" : "";
  return `${sign}${n} ${unit}`;
}

function ProductMovementsPanel({
  productId,
  unit,
  open,
}: {
  productId: string;
  unit: string;
  open: boolean;
}) {
  const [rows, setRows] = useState<ProductInventoryMovementRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setRows(null);
    setError(null);
    startTransition(async () => {
      const r = await getProductInventoryMovementsAction(productId, 50);
      if (!r.ok) {
        setError(r.error ?? "No se pudo cargar el historial");
        setRows([]);
        return;
      }
      setRows(r.movements);
    });
  }, [open, productId]);

  if (!open) return null;

  return (
    <div className="mt-3 border-t border-[var(--line)] pt-3">
      <p className="text-sm font-medium">Historial de movimientos</p>
      <p className="mt-0.5 text-xs text-[var(--muted)]">
        Últimos 50 movimientos (compras, ajustes, cocina…). Más reciente primero.
      </p>
      {pending && rows === null ? (
        <p className="mt-2 text-sm text-[var(--muted)]">Cargando…</p>
      ) : null}
      {error ? (
        <p className="mt-2 text-sm text-red-700">{error}</p>
      ) : null}
      {rows && rows.length === 0 && !pending ? (
        <p className="mt-2 text-sm text-[var(--muted)]">
          Sin movimientos registrados para este producto.
        </p>
      ) : null}
      {rows && rows.length > 0 ? (
        <div className="mt-2 overflow-x-auto rounded-lg border border-[var(--line)]">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="bg-neutral-50 text-xs text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">Fecha</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                <th className="px-3 py-2 text-right font-medium">Stock</th>
                <th className="px-3 py-2 text-right font-medium">Costo</th>
                <th className="px-3 py-2 font-medium">Nota</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const qty = Number(m.quantity);
                const qtyClass =
                  qty > 0
                    ? "text-emerald-800"
                    : qty < 0
                      ? "text-red-800"
                      : undefined;
                return (
                  <tr
                    key={m.id}
                    className="border-t border-[var(--line)] align-top"
                  >
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[var(--muted)]">
                      {formatDateTimeCO(m.created_at)}
                    </td>
                    <td className="px-3 py-2">
                      {inventoryMovementTypeLabel(m.movement_type)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums font-medium ${qtyClass ?? ""}`}
                    >
                      {formatQtyDelta(m.quantity, unit)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--muted)]">
                      {m.stock_before != null && m.stock_after != null
                        ? `${m.stock_before} → ${m.stock_after}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--muted)]">
                      {m.unit_cost != null && Number(m.unit_cost) > 0
                        ? formatCOP(m.unit_cost)
                        : "—"}
                    </td>
                    <td className="max-w-[14rem] px-3 py-2 text-xs text-[var(--muted)]">
                      {m.notes || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function ProductCard({
  product,
  categories,
  units,
  canEditMinStock,
  focused = false,
}: {
  product: ProductRow;
  categories: CategoryRow[];
  units: UnitRow[];
  canEditMinStock: boolean;
  focused?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editingMin, setEditingMin] = useState(false);
  const [editingCost, setEditingCost] = useState(false);
  const [showMovements, setShowMovements] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const editable = isEditableInInventario(product);
  const kind = productKind(product);
  const stock = Number(product.current_stock);
  const suggest = editable
    ? suggestedPurchaseQty(stock, Number(product.min_stock))
    : 0;
  const underMin = suggest > 0;
  const zeroStock = !Number.isNaN(stock) && stock <= 0;

  function closeQuickPanels() {
    setEditingMin(false);
    setEditingCost(false);
  }

  return (
    <article
      id={`producto-${product.id}`}
      className={
        focused
          ? "scroll-mt-24 border-t border-[var(--line)] bg-amber-50 px-4 py-3 ring-2 ring-inset ring-amber-400 first:border-t-0"
          : editable
            ? "scroll-mt-24 border-t border-[var(--line)] bg-white px-4 py-3 first:border-t-0"
            : "scroll-mt-24 border-t border-[var(--line)] bg-neutral-50/80 px-4 py-3 first:border-t-0"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{product.name}</p>
            {!editable ? (
              <span className="rounded-md bg-white px-2 py-0.5 text-xs text-[var(--muted)] ring-1 ring-[var(--line)]">
                {KITCHEN_ITEM_KIND_LABELS[kind]} · solo lectura
              </span>
            ) : null}
          </div>
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
            {editable ? (
              <>
                {" / mín. "}
                {product.min_stock}
              </>
            ) : null}
            {" · "}
            {formatUnitCost(product.unit_cost)}/u
            {underMin ? ` · sugerido comprar ${suggest}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-sm"
            onClick={() => {
              setError(null);
              setShowMovements((v) => !v);
            }}
          >
            {showMovements ? "Cerrar historial" : "Historial"}
          </button>
          {editable ? (
            <>
              <button
                type="button"
                className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm"
                onClick={() => {
                  setError(null);
                  setEditing(false);
                  setEditingMin(false);
                  setShowMovements(false);
                  setEditingCost((v) => !v);
                }}
              >
                {editingCost ? "Cerrar costo" : "Costo"}
              </button>
              {canEditMinStock ? (
                <button
                  type="button"
                  className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm"
                  onClick={() => {
                    setError(null);
                    setEditing(false);
                    setEditingCost(false);
                    setShowMovements(false);
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
                  closeQuickPanels();
                  setShowMovements(false);
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
            </>
          ) : (
            <Link
              href={cocinaHrefForProduct(product)}
              className="rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-sm"
            >
              Ir a Cocina
            </Link>
          )}
        </div>
      </div>

      <ProductMovementsPanel
        productId={product.id}
        unit={product.unit}
        open={showMovements}
      />

      {editable && editingCost ? (
        <form
          className="mt-3 flex flex-wrap items-end gap-2 border-t border-[var(--line)] pt-3"
          action={(fd) => {
            setError(null);
            startTransition(async () => {
              const r = await updateProductUnitCostAction(product.id, fd);
              if (!r.ok) setError(r.error ?? "Error");
              else setEditingCost(false);
            });
          }}
        >
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--muted)]">Costo unitario</span>
            <input
              name="unit_cost"
              required
              autoFocus
              defaultValue={String(product.unit_cost)}
              className={`${inputClass} w-40`}
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-[var(--solid)] px-3 py-2 text-sm text-[var(--on-solid)] disabled:opacity-60"
          >
            {pending ? "Guardando…" : "Guardar"}
          </button>
          {error ? <p className="w-full text-sm text-red-700">{error}</p> : null}
        </form>
      ) : null}

      {editable && editingMin && canEditMinStock ? (
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
            className="rounded-lg bg-[var(--solid)] px-3 py-2 text-sm text-[var(--on-solid)] disabled:opacity-60"
          >
            {pending ? "Guardando…" : "Guardar"}
          </button>
          {error ? <p className="w-full text-sm text-red-700">{error}</p> : null}
        </form>
      ) : null}

      {editable && editing ? (
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
            className="rounded-lg bg-[var(--solid)] px-4 py-2 text-sm text-[var(--on-solid)] disabled:opacity-60"
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
  focusProductId,
}: {
  category: CategoryRow | null;
  products: ProductRow[];
  categories: CategoryRow[];
  units: UnitRow[];
  canEditMinStock: boolean;
  defaultOpen: boolean;
  focusProductId?: string | null;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);
  useEffect(() => {
    if (
      focusProductId &&
      products.some((p) => p.id === focusProductId)
    ) {
      setOpen(true);
    }
  }, [focusProductId, products]);
  const underMinCount = products.filter(
    (p) =>
      isEditableInInventario(p) &&
      suggestedPurchaseQty(Number(p.current_stock), Number(p.min_stock)) > 0,
  ).length;
  const cocinaCount = products.filter((p) => !isEditableInInventario(p)).length;
  const title = category
    ? `${category.code} — ${category.name}`
    : "Sin categoría";
  const description = category?.description ?? null;

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">
      <div className="border-l-4 border-l-[var(--ink)] bg-neutral-50 px-4 py-3">
        {editing && category ? (
          <form
            className="space-y-2"
            action={(fd) => {
              setError(null);
              startTransition(async () => {
                const r = await updateProductCategoryAction(category.id, fd);
                if (!r.ok) setError(r.error ?? "Error");
                else setEditing(false);
              });
            }}
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-[var(--muted)]">Código</span>
                <input
                  name="code"
                  required
                  defaultValue={category.code}
                  className={inputClass}
                  aria-label="Código de categoría"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-[var(--muted)]">Nombre</span>
                <input
                  name="name"
                  required
                  autoFocus
                  defaultValue={category.name}
                  className={inputClass}
                  aria-label="Nombre de categoría"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block text-[var(--muted)]">Descripción</span>
                <input
                  name="description"
                  defaultValue={category.description ?? ""}
                  className={inputClass}
                  aria-label="Descripción de categoría"
                />
              </label>
            </div>
            {error ? <p className="text-xs text-red-700">{error}</p> : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-[var(--solid)] px-2.5 py-1 text-xs text-[var(--on-solid)] disabled:opacity-60"
              >
                {pending ? "Guardando…" : "Guardar"}
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
        ) : (
          <div className="flex items-start gap-2">
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
                  {cocinaCount > 0 ? (
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700 ring-1 ring-slate-200">
                      {cocinaCount} cocina (solo lectura)
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
              <div className="mt-0.5 flex shrink-0 gap-2">
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
              </div>
            ) : null}
          </div>
        )}
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
                focused={focusProductId === p.id}
              />
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}

function IndexCostsPanel({
  categories,
  products,
  filteredProducts,
  searching,
}: {
  categories: CategoryRow[];
  products: ProductRow[];
  filteredProducts: ProductRow[];
  searching: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [percent, setPercent] = useState("5");
  const [scope, setScope] = useState<"visible" | "category" | "all">(
    searching ? "visible" : "all",
  );
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (searching) setScope("visible");
  }, [searching]);

  useEffect(() => {
    if (!categoryId && categories[0]?.id) setCategoryId(categories[0].id);
  }, [categories, categoryId]);

  const pct = Number(String(percent).replace(/,/g, "").trim());
  const pctValid = Number.isFinite(pct) && pct !== 0;

  const targetProducts = useMemo(() => {
    const onlyPurchasable = (list: ProductRow[]) =>
      list.filter((p) => isEditableInInventario(p));
    if (scope === "visible") return onlyPurchasable(filteredProducts);
    if (scope === "category") {
      return onlyPurchasable(
        products.filter((p) => p.category_id === categoryId),
      );
    }
    return onlyPurchasable(products);
  }, [scope, filteredProducts, products, categoryId]);

  const sample = useMemo(() => {
    if (!pctValid || targetProducts.length === 0) return null;
    const first = targetProducts[0];
    const before = Number(first.unit_cost || 0);
    return {
      name: first.name,
      before,
      after: indexUnitCost(before, pct),
    };
  }, [pctValid, pct, targetProducts]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setError(null);
          setMessage(null);
          setOpen(true);
        }}
        className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
      >
        Indexar costos
      </button>
    );
  }

  return (
    <div className="w-full space-y-3 rounded-xl border border-[var(--line)] bg-white p-4 sm:max-w-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-medium">Indexar costos al mercado</h4>
          <p className="text-sm text-[var(--muted)]">
            Ajusta el costo unitario por porcentaje (ej. +5 o −3).
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

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-[var(--muted)]">Variación %</span>
          <input
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            inputMode="decimal"
            placeholder="5"
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-[var(--muted)]">Aplicar a</span>
          <select
            value={scope}
            onChange={(e) =>
              setScope(e.target.value as "visible" | "category" | "all")
            }
            className={inputClass}
          >
            <option value="visible">
              Productos visibles ({filteredProducts.length})
            </option>
            <option value="category">Una categoría</option>
            <option value="all">Todo el inventario ({products.length})</option>
          </select>
        </label>
        {scope === "category" ? (
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-[var(--muted)]">Categoría</span>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={inputClass}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <p className="text-sm text-[var(--muted)]">
        Se actualizarán {targetProducts.length}{" "}
        {targetProducts.length === 1 ? "producto" : "productos"}
        {sample ? (
          <>
            . Ejemplo: {sample.name} {formatUnitCost(sample.before)} →{" "}
            {formatUnitCost(sample.after)}
          </>
        ) : null}
        .
      </p>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-800">{message}</p> : null}

      <button
        type="button"
        disabled={pending || !pctValid || targetProducts.length === 0}
        className="rounded-lg bg-[var(--solid)] px-4 py-2 text-sm text-[var(--on-solid)] disabled:opacity-60"
        onClick={() => {
          setError(null);
          setMessage(null);
          if (!pctValid) {
            setError("Indique un porcentaje distinto de 0");
            return;
          }
          const sign = pct > 0 ? "+" : "";
          if (
            !confirm(
              `¿Aplicar ${sign}${pct}% a ${targetProducts.length} producto(s)?`,
            )
          ) {
            return;
          }
          const fd = new FormData();
          fd.set("percent", String(pct));
          if (scope === "all") {
            fd.set("scope", "all");
          } else if (scope === "category") {
            fd.set("scope", "category");
            fd.set("category_id", categoryId);
          } else {
            fd.set("scope", "ids");
            fd.set("product_ids", targetProducts.map((p) => p.id).join(","));
          }
          startTransition(async () => {
            const r = await indexProductUnitCostsAction(fd);
            if (!r.ok) setError(r.error ?? "Error");
            else setMessage(`Costos actualizados: ${r.updated ?? 0}`);
          });
        }}
      >
        {pending ? "Indexando…" : "Aplicar indexación"}
      </button>
    </div>
  );
}

export function InventoryLists({
  categories,
  units,
  products,
  canEditMinStock,
  focusProductId,
}: {
  categories: CategoryRow[];
  units: UnitRow[];
  products: ProductRow[];
  canEditMinStock: boolean;
  focusProductId?: string | null;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  useEffect(() => {
    if (!focusProductId) return;
    const timer = window.setTimeout(() => {
      const el = document.getElementById(`producto-${focusProductId}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [focusProductId]);

  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const filteredProducts = useMemo(() => {
    if (!searching) return products;
    return products.filter((p) => {
      const cat = categoryById.get(p.category_id);
      const kind = productKind(p);
      const haystack = [
        p.name,
        p.sku ?? "",
        p.unit,
        cat?.code ?? "",
        cat?.name ?? "",
        KITCHEN_ITEM_KIND_LABELS[kind],
        kind === "MATERIA_PRIMA" ? "materia prima compras" : "cocina",
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
              Materias primas editables · ítems de Cocina visibles en solo lectura
            </p>
          </div>
          <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
            <IndexCostsPanel
              categories={categories}
              products={products}
              filteredProducts={filteredProducts}
              searching={searching}
            />
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
              defaultOpen={
                (searching && g.products.length > 0) ||
                Boolean(
                  focusProductId &&
                    g.products.some((p) => p.id === focusProductId),
                )
              }
              focusProductId={focusProductId}
            />
          ))
        )}
      </div>
    </div>
  );
}
