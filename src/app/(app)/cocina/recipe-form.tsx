"use client";

import { useState, useTransition } from "react";
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

function uid() {
  return Math.random().toString(36).slice(2, 10);
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
        {lines.map((line) => (
          <div key={line.key} className="grid gap-2 sm:grid-cols-[1fr_120px_auto]">
            <select
              value={line.component_product_id}
              onChange={(e) =>
                setLines((prev) =>
                  prev.map((l) =>
                    l.key === line.key
                      ? { ...l, component_product_id: e.target.value }
                      : l,
                  ),
                )
              }
              className={inputClass}
            >
              <option value="">Componente…</option>
              {components.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.item_kind}) · {c.unit}
                </option>
              ))}
            </select>
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
              className="text-xs text-[var(--muted)]"
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
        ))}
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
