"use client";

import { useState, useTransition } from "react";
import {
  BULK_PRODUCT_COLUMN_META,
  BULK_PRODUCT_HEADER_REQUIRED,
  buildBulkKitchenProductExample,
} from "@/lib/inventory/bulk-paste";
import {
  bulkImportKitchenProductsAction,
  createKitchenProductAction,
} from "./kitchen-actions";
import {
  createProductCategoryAction,
  createProductUnitAction,
} from "../compras/inventory-actions";
import {
  QuickCreateField,
  QuickCreateSelect,
} from "@/components/ui/quick-create";

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] outline-none ring-[var(--accent)] focus:ring-2";

export type CategoryOption = { id: string; code: string; name: string };
export type UnitOption = { id: string; code: string; name: string };

type KitchenBulkItemKind =
  | "INSUMO_PREPARACION"
  | "PREPARACION"
  | "PRODUCTO_CARTA";

const ITEM_KIND_LABEL: Record<KitchenBulkItemKind, string> = {
  INSUMO_PREPARACION: "insumos preparación",
  PREPARACION: "preparaciones",
  PRODUCTO_CARTA: "productos de carta",
};

export function CreateKitchenProductForm({
  itemKind,
  label,
  categories: initialCategories,
  units: initialUnits,
}: {
  itemKind: KitchenBulkItemKind;
  label: string;
  categories: CategoryOption[];
  units: UnitOption[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [categories, setCategories] = useState(initialCategories);
  const [units, setUnits] = useState(initialUnits);
  const [categoryId, setCategoryId] = useState("");
  const [unitId, setUnitId] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-[var(--solid)] px-4 py-2.5 text-sm text-[var(--on-solid)]"
      >
        {label}
      </button>
    );
  }

  return (
    <form
      className="w-full max-w-md space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await createKitchenProductAction(fd);
          if (!r.ok) setError(r.error ?? "Error");
          else setOpen(false);
        });
      }}
    >
      <input type="hidden" name="item_kind" value={itemKind} />
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-[var(--muted)]">
        Solo para productos que aún no existen en el catálogo. Para fabricar más
        de uno que ya existe, use <strong>Crear más</strong> en la fila.
      </p>
      <input name="name" required placeholder="Nombre" className={inputClass} />
      <QuickCreateSelect
        name="category_id"
        label="Categoría"
        required
        value={categoryId}
        onChange={setCategoryId}
        options={categories.map((c) => ({
          id: c.id,
          label: `${c.code} — ${c.name}`,
        }))}
        createLabel="Nueva categoría"
        createTitle="Alta rápida de categoría"
        onCreate={async (fd) => {
          const r = await createProductCategoryAction(fd);
          if (!r.ok || !r.id) {
            return { ok: false, error: r.error ?? "No se pudo crear" };
          }
          const code = String(fd.get("code") ?? "").trim().toUpperCase();
          const name = String(fd.get("name") ?? "").trim();
          const labelText = `${code} — ${name}`;
          setCategories((prev) =>
            prev.some((c) => c.id === r.id)
              ? prev
              : [...prev, { id: r.id!, code, name }],
          );
          return { ok: true, id: r.id, label: labelText };
        }}
      >
        <QuickCreateField name="code" label="Código" required />
        <QuickCreateField name="name" label="Nombre" required />
      </QuickCreateSelect>
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
        createLabel="Nueva unidad"
        createTitle="Alta rápida de unidad"
        onCreate={async (fd) => {
          const r = await createProductUnitAction(fd);
          if (!r.ok || !r.id) {
            return { ok: false, error: r.error ?? "No se pudo crear" };
          }
          const code = String(fd.get("code") ?? "").trim().toUpperCase();
          const name = String(fd.get("name") ?? "").trim();
          const labelText = `${code} — ${name}`;
          setUnits((prev) =>
            prev.some((u) => u.id === r.id)
              ? prev
              : [...prev, { id: r.id!, code, name }],
          );
          return { ok: true, id: r.id, label: labelText };
        }}
      >
        <QuickCreateField name="code" label="Código" required />
        <QuickCreateField name="name" label="Nombre" required />
      </QuickCreateSelect>
      <input name="sku" placeholder="SKU (opcional)" className={inputClass} />
      <div className="grid grid-cols-2 gap-2">
        <input
          name="current_stock"
          type="number"
          step="any"
          min="0"
          defaultValue="0"
          placeholder="Stock apertura"
          className={inputClass}
          title="Solo si ya hay existencias físicas al dar de alta"
        />
        <input
          name="unit_cost"
          type="number"
          step="any"
          min="0"
          defaultValue="0"
          placeholder="Costo / u"
          className={inputClass}
          title="Costo unitario de apertura"
        />
      </div>
      <input
        name="min_stock"
        type="number"
        step="any"
        min="0"
        defaultValue="0"
        placeholder="Stock mínimo"
        className={inputClass}
      />
      <p className="text-xs text-[var(--muted)]">
        Stock/costo aquí = apertura (día uno). El día a día se hace con{" "}
        <strong>Crear más</strong>
        {itemKind === "INSUMO_PREPARACION"
          ? " (materia prima → merma / aprovechamiento)."
          : " (consume la receta)."}
      </p>
      <input name="notes" placeholder="Notas" className={inputClass} />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || categories.length === 0 || units.length === 0}
          className="rounded-lg bg-[var(--solid)] px-3 py-2 text-sm text-[var(--on-solid)] disabled:opacity-60"
        >
          Guardar
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

export function BulkImportKitchenProductsForm({
  itemKind,
  categories: initialCategories,
  units,
}: {
  itemKind: KitchenBulkItemKind;
  categories: CategoryOption[];
  units: UnitOption[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<{ line: number; message: string }[]>(
    [],
  );
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [categories, setCategories] = useState(initialCategories);
  const [categoryId, setCategoryId] = useState("");
  const example = buildBulkKitchenProductExample(units);
  const sampleRow = example.rows[0];
  const textareaId = `kitchen-bulk-paste-${itemKind}`;
  const kindLabel = ITEM_KIND_LABEL[itemKind];

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
            ? "Cree al menos una categoría y una unidad en Inventario antes"
            : undefined
        }
      >
        Carga masiva
      </button>
    );
  }

  return (
    <form
      className="basis-full space-y-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5"
      action={(fd) => {
        setError(null);
        setRowErrors([]);
        setSuccess(null);
        startTransition(async () => {
          const r = await bulkImportKitchenProductsAction(fd);
          if (!r.ok) {
            setError(r.error ?? "Error");
            setRowErrors(r.errors ?? []);
            return;
          }
          const partial =
            r.errors && r.errors.length > 0
              ? ` · ${r.errors.length} fila(s) con error`
              : "";
          setSuccess(`Se crearon ${r.created ?? 0} ${kindLabel}${partial}.`);
          setRowErrors(r.errors ?? []);
          if (!r.errors?.length) setOpen(false);
        });
      }}
    >
      <input type="hidden" name="item_kind" value={itemKind} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">Carga masiva al catálogo · {kindLabel}</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Alta de productos nuevos (apertura). No fabrica batches: para eso use{" "}
            <strong>Crear más</strong> sobre un ítem ya existente.
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
              Una fila = un ítem. Separe con{" "}
              <strong className="font-medium text-[var(--ink)]">;</strong> o pegue
              desde Excel. Incluya{" "}
              <strong className="font-medium text-[var(--ink)]">
                stock actual y costo unitario
              </strong>{" "}
              para dejar el inventario listo desde el día uno.
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm"
            disabled={example.rows.length === 0}
            onClick={() => {
              const el = document.getElementById(
                textareaId,
              ) as HTMLTextAreaElement | null;
              if (!el) return;
              el.value = example.pasteText;
              el.focus();
            }}
          >
            Usar ejemplo
          </button>
        </div>

        <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-3">
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

        <div className="overflow-x-auto rounded-lg border border-[var(--line)] bg-[var(--surface)]">
          <table className="min-w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--line)] bg-neutral-50">
                {BULK_PRODUCT_COLUMN_META.map((col) => (
                  <th
                    key={col.key}
                    className={
                      col.required || col.key === "stock_actual"
                        ? "whitespace-nowrap px-3 py-2.5 font-medium text-[var(--ink)]"
                        : "whitespace-nowrap px-3 py-2.5 font-medium text-[var(--muted)]"
                    }
                  >
                    <span className="block">{col.label}</span>
                    <span
                      className={
                        col.required || col.key === "stock_actual"
                          ? "mt-0.5 block font-normal text-amber-800"
                          : "mt-0.5 block font-normal"
                      }
                    >
                      {col.required || col.key === "stock_actual"
                        ? col.key === "stock_actual"
                          ? "Recomendado"
                          : "Obligatorio"
                        : "Opcional"}
                    </span>
                  </th>
                ))}
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
            Formato con stock (apertura):
            <code className="mt-1 block overflow-x-auto rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 font-mono text-[11px] leading-relaxed text-[var(--ink)]">
              {BULK_PRODUCT_HEADER_REQUIRED};stock_actual
              <br />
              {sampleRow.join(";")}
            </code>
          </p>
        ) : null}
      </div>

      <QuickCreateSelect
        name="category_id"
        label="Categoría destino"
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
          const labelText = `${code} — ${name}`;
          setCategories((prev) =>
            prev.some((c) => c.id === r.id)
              ? prev
              : [...prev, { id: r.id!, code, name }],
          );
          return { ok: true, id: r.id, label: labelText };
        }}
      >
        <QuickCreateField name="code" label="Código" required />
        <QuickCreateField name="name" label="Nombre" required />
      </QuickCreateSelect>

      <label className="block text-sm">
        <span className="mb-1.5 block text-[var(--muted)]">
          Pegue aquí los {kindLabel} (una fila por ítem) *
        </span>
        <textarea
          id={textareaId}
          name="paste"
          required
          rows={8}
          spellCheck={false}
          placeholder={
            sampleRow
              ? `Ejemplo:\n${BULK_PRODUCT_HEADER_REQUIRED};stock_actual\n${sampleRow.join(";")}`
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
          {pending ? "Importando…" : `Importar ${kindLabel}`}
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
