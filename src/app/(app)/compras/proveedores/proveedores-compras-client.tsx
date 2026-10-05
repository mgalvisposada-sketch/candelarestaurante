"use client";

import { useState, useTransition } from "react";
import {
  linkSupplierCategoryAction,
  unlinkSupplierCategoryAction,
  updateSupplierLeadTimeAction,
} from "../supplier-category-actions";

export type SupplierRow = {
  id: string;
  name: string;
  category: string | null;
  lead_time_days: number | null;
  is_active: boolean;
  is_purchase_supplier?: boolean;
};
export type CategoryOption = { id: string; code: string; name: string };
export type LinkRow = {
  id: string;
  supplier_id: string;
  category_id: string;
  lead_time_days: number | null;
  notes: string | null;
};

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2";

export function LinkCategoryForm({
  suppliers,
  categories,
}: {
  suppliers: SupplierRow[];
  categories: CategoryOption[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="grid gap-3 rounded-xl border border-[var(--line)] bg-white p-4 md:grid-cols-4"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await linkSupplierCategoryAction(fd);
          if (!r.ok) setError(r.error ?? "Error");
        });
      }}
    >
      <label className="block text-sm md:col-span-2">
        <span className="mb-1 block text-[var(--muted)]">Proveedor</span>
        <select name="supplier_id" required className={inputClass}>
          <option value="">Seleccione…</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--muted)]">Categoría</span>
        <select name="category_id" required className={inputClass}>
          <option value="">Seleccione…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} — {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--muted)]">Días entrega</span>
        <input name="lead_time_days" type="number" min={0} className={inputClass} />
      </label>
      {error ? <p className="md:col-span-4 text-sm text-red-700">{error}</p> : null}
      <div className="md:col-span-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white disabled:opacity-60"
        >
          {pending ? "Guardando…" : "Vincular categoría"}
        </button>
      </div>
    </form>
  );
}

export function SupplierPurchaseCards({
  suppliers,
  categories,
  links,
}: {
  suppliers: SupplierRow[];
  categories: CategoryOption[];
  links: LinkRow[];
}) {
  const [pending, startTransition] = useTransition();
  const catMap = new Map(categories.map((c) => [c.id, c]));

  return (
    <div className="space-y-4">
      {suppliers.map((s) => {
        const supplierLinks = links.filter((l) => l.supplier_id === s.id);
        return (
          <article key={s.id} className="rounded-xl border border-[var(--line)] bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{s.name}</p>
                <p className="text-sm text-[var(--muted)]">
                  {s.category ? `Tipo: ${s.category}` : "Sin tipo administrativo"}
                  {" · "}
                  Lead time general: {s.lead_time_days ?? "—"} días
                </p>
              </div>
              <form
                className="flex items-end gap-2"
                action={(fd) => {
                  startTransition(async () => {
                    await updateSupplierLeadTimeAction(s.id, fd);
                  });
                }}
              >
                <label className="block text-sm">
                  <span className="mb-1 block text-[var(--muted)]">Días entrega</span>
                  <input
                    name="lead_time_days"
                    type="number"
                    min={0}
                    defaultValue={s.lead_time_days ?? ""}
                    className={`${inputClass} w-28`}
                  />
                </label>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
                >
                  Guardar
                </button>
              </form>
            </div>
            <div className="mt-3 space-y-2">
              <p className="text-sm font-medium">Categorías que comercializa</p>
              {supplierLinks.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">Ninguna vinculada.</p>
              ) : (
                supplierLinks.map((l) => {
                  const cat = catMap.get(l.category_id);
                  return (
                    <div
                      key={l.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
                    >
                      <span>
                        {cat ? `${cat.code} — ${cat.name}` : l.category_id}
                        {l.lead_time_days != null ? ` · ${l.lead_time_days} días` : ""}
                      </span>
                      <button
                        type="button"
                        disabled={pending}
                        className="text-red-700"
                        onClick={() =>
                          startTransition(async () => {
                            await unlinkSupplierCategoryAction(l.id);
                          })
                        }
                      >
                        Quitar
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
