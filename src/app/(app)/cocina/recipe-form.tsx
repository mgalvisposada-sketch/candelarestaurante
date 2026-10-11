"use client";

import { Search, X } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { cn } from "@/lib/utils";
import { upsertKitchenRecipeAction } from "./kitchen-actions";

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2";

export type RecipeComponentOption = {
  id: string;
  name: string;
  unit: string;
  item_kind: string;
  unit_cost: number | string;
};

type Line = {
  key: string;
  component_product_id: string;
  quantity: string;
};

const KIND_LABEL: Record<string, string> = {
  MATERIA_PRIMA: "Materia prima",
  INSUMO_PREPARACION: "Insumo",
  PREPARACION: "Preparación",
  PRODUCTO_CARTA: "Carta",
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function kindLabel(kind: string) {
  return KIND_LABEL[kind] ?? kind;
}

/** Selector de componente con buscador + lista filtrada. */
function ComponentPicker({
  components,
  value,
  onChange,
  excludeIds = [],
}: {
  components: RecipeComponentOption[];
  value: string;
  onChange: (productId: string) => void;
  excludeIds?: string[];
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = components.find((c) => c.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = normalizeSearch(query);
    const excluded = new Set(excludeIds.filter((id) => id && id !== value));
    return components
      .filter((c) => !excluded.has(c.id))
      .filter((c) => {
        if (!q) return true;
        const hay = normalizeSearch(
          `${c.name} ${kindLabel(c.item_kind)} ${c.item_kind} ${c.unit}`,
        );
        return hay.includes(q);
      })
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
      .slice(0, 40);
  }, [components, query, excludeIds, value]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (selected && !open) {
    return (
      <div className="flex min-w-[12rem] flex-1 items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{selected.name}</p>
          <p className="truncate text-xs text-[var(--muted)]">
            {kindLabel(selected.item_kind)} · {selected.unit}
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 text-xs text-[var(--accent)]"
          onClick={() => {
            setQuery("");
            setOpen(true);
          }}
        >
          Cambiar
        </button>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative min-w-[12rem] flex-1">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
        <input
          type="search"
          value={query}
          autoFocus={open || !selected}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          placeholder="Buscar componente…"
          className={cn(inputClass, "pl-8 pr-8")}
          aria-label="Buscar componente"
          autoComplete="off"
        />
        {query ? (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted)]"
            onClick={() => setQuery("")}
            aria-label="Limpiar búsqueda"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      {!value ? (
        <p className="mt-1 text-xs text-[var(--muted)]">
          Escriba para filtrar materia prima o insumo
        </p>
      ) : null}
      {open ? (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-[var(--line)] bg-white py-1 shadow-md">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-[var(--muted)]">
              Sin coincidencias
            </li>
          ) : (
            filtered.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-[var(--surface)]",
                    c.id === value && "bg-[var(--surface)]",
                  )}
                  onClick={() => {
                    onChange(c.id);
                    setQuery("");
                    setOpen(false);
                  }}
                >
                  <span className="font-medium">{c.name}</span>
                  <span className="text-xs text-[var(--muted)]">
                    {kindLabel(c.item_kind)} · {c.unit}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

export function KitchenRecipeForm({
  productId,
  productName,
  defaultYield = "1",
  components,
  existingName,
}: {
  productId: string;
  productName: string;
  defaultYield?: string;
  components: RecipeComponentOption[];
  existingName?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(existingName || `Receta ${productName}`);
  const [yieldQty, setYieldQty] = useState(defaultYield);
  const [lines, setLines] = useState<Line[]>([
    { key: uid(), component_product_id: "", quantity: "" },
  ]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-[var(--line)] px-2.5 py-1 text-xs"
      >
        {existingName ? "Actualizar receta" : "Definir receta"}
      </button>
    );
  }

  return (
    <form
      className="mt-3 space-y-3 rounded-lg border border-[var(--line)] bg-white p-3"
      action={(fd) => {
        setError(null);
        fd.set("product_id", productId);
        fd.set("name", name);
        fd.set("yield_qty", yieldQty);
        fd.set(
          "lines_json",
          JSON.stringify(
            lines
              .filter((l) => l.component_product_id && Number(l.quantity) > 0)
              .map((l) => ({
                component_product_id: l.component_product_id,
                quantity: l.quantity,
              })),
          ),
        );
        startTransition(async () => {
          const r = await upsertKitchenRecipeAction(fd);
          if (!r.ok) setError(r.error ?? "Error");
          else setOpen(false);
        });
      }}
    >
      <p className="text-sm font-medium">Receta · {productName}</p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        className={inputClass}
        placeholder="Nombre de receta"
      />
      <input
        type="number"
        step="any"
        min="0"
        value={yieldQty}
        onChange={(e) => setYieldQty(e.target.value)}
        required
        className={inputClass}
        placeholder="Rendimiento (qty producida)"
      />
      <div className="space-y-2">
        {lines.map((line) => {
          const excludeIds = lines
            .filter((l) => l.key !== line.key)
            .map((l) => l.component_product_id)
            .filter(Boolean);
          return (
            <div
              key={line.key}
              className="grid gap-2 sm:grid-cols-[1fr_120px_auto] sm:items-start"
            >
              <ComponentPicker
                components={components}
                value={line.component_product_id}
                excludeIds={excludeIds}
                onChange={(productIdNext) =>
                  setLines((prev) =>
                    prev.map((l) =>
                      l.key === line.key
                        ? { ...l, component_product_id: productIdNext }
                        : l,
                    ),
                  )
                }
              />
              <input
                type="number"
                step="any"
                min="0"
                value={line.quantity}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((l) =>
                      l.key === line.key
                        ? { ...l, quantity: e.target.value }
                        : l,
                    ),
                  )
                }
                className={inputClass}
                placeholder="Cantidad"
              />
              <button
                type="button"
                className="text-xs text-[var(--muted)] sm:pt-2.5"
                onClick={() =>
                  setLines((prev) =>
                    prev.length === 1
                      ? prev
                      : prev.filter((l) => l.key !== line.key),
                  )
                }
              >
                Quitar
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className="text-sm text-[var(--accent)]"
          onClick={() =>
            setLines((prev) => [
              ...prev,
              { key: uid(), component_product_id: "", quantity: "" },
            ])
          }
        >
          + Componente
        </button>
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[var(--ink)] px-3 py-2 text-sm text-white disabled:opacity-60"
        >
          Guardar receta
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
