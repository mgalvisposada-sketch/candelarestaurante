"use client";

import { useState, useTransition } from "react";
import { createKitchenProductAction } from "./kitchen-actions";

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2";

export type CategoryOption = { id: string; code: string; name: string };
export type UnitOption = { id: string; code: string; name: string };

export function CreateKitchenProductForm({
  itemKind,
  label,
  categories,
  units,
}: {
  itemKind: "INSUMO_PREPARACION" | "PREPARACION" | "PRODUCTO_CARTA";
  label: string;
  categories: CategoryOption[];
  units: UnitOption[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-[var(--ink)] px-4 py-2.5 text-sm text-white"
      >
        {label}
      </button>
    );
  }

  return (
    <form
      className="w-full max-w-md space-y-3 rounded-xl border border-[var(--line)] bg-white p-4"
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
      <input name="name" required placeholder="Nombre" className={inputClass} />
      <select name="category_id" required className={inputClass} defaultValue="">
        <option value="" disabled>
          Categoría
        </option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.code} — {c.name}
          </option>
        ))}
      </select>
      <select name="unit_id" required className={inputClass} defaultValue="">
        <option value="" disabled>
          Unidad
        </option>
        {units.map((u) => (
          <option key={u.id} value={u.id}>
            {u.code} — {u.name}
          </option>
        ))}
      </select>
      <input name="sku" placeholder="SKU (opcional)" className={inputClass} />
      <input
        name="min_stock"
        type="number"
        step="any"
        min="0"
        defaultValue="0"
        placeholder="Stock mínimo"
        className={inputClass}
      />
      <input name="notes" placeholder="Notas" className={inputClass} />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || categories.length === 0 || units.length === 0}
          className="rounded-lg bg-[var(--ink)] px-3 py-2 text-sm text-white disabled:opacity-60"
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
