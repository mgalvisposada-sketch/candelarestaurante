"use client";

import { useState, useTransition } from "react";
import {
  createProductAction,
  createProductCategoryAction,
  softDeleteProductAction,
} from "../inventory-actions";

export type CategoryRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
};
export type ProductRow = {
  id: string;
  category_id: string;
  sku: string | null;
  name: string;
  unit: string;
  min_stock: number | string | null;
  current_stock: number | string;
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

export function CreateProductForm({ categories }: { categories: CategoryRow[] }) {
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
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">Categoría *</span>
          <select name="category_id" required className={inputClass}>
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
          <input name="name" required className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">SKU</span>
          <input name="sku" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Unidad</span>
          <input name="unit" defaultValue="UND" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Stock actual</span>
          <input name="current_stock" defaultValue="0" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Stock mínimo</span>
          <input name="min_stock" className={inputClass} />
        </label>
      </div>
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      <button type="submit" disabled={pending} className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm text-white">
        {pending ? "Guardando…" : "Guardar producto"}
      </button>
    </form>
  );
}

export function InventoryLists({
  categories,
  products,
}: {
  categories: CategoryRow[];
  products: ProductRow[];
}) {
  const [pending, startTransition] = useTransition();
  const catMap = new Map(categories.map((c) => [c.id, c]));

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section className="space-y-3">
        <h3 className="font-medium">Categorías</h3>
        {categories.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Sin categorías.</p>
        ) : (
          categories.map((c) => (
            <article key={c.id} className="rounded-xl border border-[var(--line)] bg-white px-4 py-3">
              <p className="font-medium">
                {c.code} — {c.name}
              </p>
              {c.description ? (
                <p className="text-sm text-[var(--muted)]">{c.description}</p>
              ) : null}
            </article>
          ))
        )}
      </section>
      <section className="space-y-3 lg:col-span-2">
        <h3 className="font-medium">Productos</h3>
        {products.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Sin productos.</p>
        ) : (
          products.map((p) => {
            const cat = catMap.get(p.category_id);
            return (
              <article
                key={p.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-[var(--line)] bg-white px-4 py-3"
              >
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-sm text-[var(--muted)]">
                    {cat ? `${cat.code} · ${cat.name}` : "Sin categoría"}
                    {p.sku ? ` · SKU ${p.sku}` : ""} · {p.unit}
                  </p>
                  <p className="text-sm text-[var(--muted)]">
                    Stock: {p.current_stock}
                    {p.min_stock != null ? ` · mín. ${p.min_stock}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  className="text-sm text-red-700"
                  onClick={() => {
                    if (!confirm("¿Desactivar producto?")) return;
                    startTransition(async () => {
                      await softDeleteProductAction(p.id);
                    });
                  }}
                >
                  Desactivar
                </button>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
