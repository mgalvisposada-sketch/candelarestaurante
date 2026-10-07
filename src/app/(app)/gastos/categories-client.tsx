"use client";

import { useState, useTransition } from "react";
import {
  createExpenseCategoryAction,
  softDeleteExpenseCategoryAction,
  updateExpenseCategoryAction,
} from "./actions";

export type CategoryRow = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
};

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2";

export function CreateExpenseCategoryForm({ canCreate }: { canCreate: boolean }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canCreate) return null;
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-[var(--ink)] px-4 py-2.5 text-sm font-medium text-white"
      >
        Nueva categoría
      </button>
    );
  }

  return (
    <form
      className="space-y-3 rounded-xl border border-[var(--line)] bg-white p-5"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await createExpenseCategoryAction(fd);
          if (!r.ok) setError(r.error ?? "Error");
          else setOpen(false);
        });
      }}
    >
      <div className="flex justify-between gap-3">
        <div>
          <h3 className="font-medium">Categoría de gasto</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Solo para el módulo Gastos. No se mezcla con categorías de Compras.
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 text-sm text-[var(--muted)]"
          onClick={() => setOpen(false)}
        >
          Cancelar
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Código *</span>
          <input name="code" required placeholder="SEG" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Nombre *</span>
          <input
            name="name"
            required
            placeholder="Seguridad"
            className={inputClass}
          />
        </label>
      </div>
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm text-white disabled:opacity-60"
      >
        {pending ? "Guardando…" : "Guardar categoría"}
      </button>
    </form>
  );
}

function CategoryCard({
  category,
  canEdit,
}: {
  category: CategoryRow;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <article className="rounded-xl border border-[var(--line)] bg-white px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">
            {category.code} — {category.name}
          </p>
          <p className="text-sm text-[var(--muted)]">Categoría de gastos operativos</p>
        </div>
      </div>
      {canEdit ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="text-xs font-medium underline"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Cerrar" : "Editar"}
          </button>
          <button
            type="button"
            disabled={pending}
            className="text-xs text-red-700 disabled:opacity-60"
            onClick={() => {
              if (
                !confirm(
                  `¿Eliminar la categoría ${category.code}? Solo se puede si no tiene gastos asociados.`,
                )
              ) {
                return;
              }
              setError(null);
              startTransition(async () => {
                const r = await softDeleteExpenseCategoryAction(category.id);
                if (!r.ok) setError(r.error ?? "Error");
              });
            }}
          >
            Eliminar
          </button>
        </div>
      ) : null}
      {error && !open ? (
        <p className="mt-2 text-xs text-red-700">{error}</p>
      ) : null}
      {open && canEdit ? (
        <form
          className="mt-3 grid gap-3 border-t border-[var(--line)] pt-3 md:grid-cols-2"
          action={(fd) => {
            setError(null);
            startTransition(async () => {
              const r = await updateExpenseCategoryAction(category.id, fd);
              if (!r.ok) setError(r.error ?? "Error");
              else setOpen(false);
            });
          }}
        >
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Código *</span>
            <input
              name="code"
              required
              defaultValue={category.code}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Nombre *</span>
            <input
              name="name"
              required
              defaultValue={category.name}
              className={inputClass}
            />
          </label>
          {error ? (
            <p className="md:col-span-2 text-xs text-red-700">{error}</p>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-[var(--ink)] px-3 py-1.5 text-xs text-white md:col-span-2 disabled:opacity-60"
          >
            Guardar cambios
          </button>
        </form>
      ) : null}
    </article>
  );
}

export function ExpenseCategoryList({
  categories,
  canEdit,
}: {
  categories: CategoryRow[];
  canEdit: boolean;
}) {
  if (categories.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--line)] px-4 py-6 text-sm text-[var(--muted)]">
        Sin categorías. Cree arriendo, gas, seguridad u otras propias de gastos.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {categories.map((c) => (
        <CategoryCard key={c.id} category={c} canEdit={canEdit} />
      ))}
    </div>
  );
}
