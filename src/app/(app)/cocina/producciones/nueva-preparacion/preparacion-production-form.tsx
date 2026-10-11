"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { computeRecipeBatchCost } from "@/lib/kitchen/cost";
import { formatCOP, money } from "@/lib/money";
import { completePreparacionProductionAction } from "../../kitchen-actions";

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2";

export type PrepOption = {
  id: string;
  name: string;
  unit: string;
  current_stock: number | string;
  unit_cost: number | string;
  recipe: {
    id: string;
    name: string;
    yield_qty: number | string;
    lines: Array<{
      component_product_id: string;
      quantity: number | string;
      name: string;
      unit: string;
      unit_cost: number | string;
      current_stock: number | string;
    }>;
  } | null;
};

function formatUnitCost(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(value);
}

export function PreparacionProductionForm({
  preparaciones,
}: {
  preparaciones: PrepOption[];
}) {
  const router = useRouter();
  const withRecipe = preparaciones.filter((p) => p.recipe);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const today = new Date().toISOString().slice(0, 10);

  const [productId, setProductId] = useState(withRecipe[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [producedAt, setProducedAt] = useState(today);
  const [batches, setBatches] = useState("1");
  const [outputQtyOverride, setOutputQtyOverride] = useState("");
  const [notes, setNotes] = useState("");

  const selected = withRecipe.find((p) => p.id === productId) ?? null;
  const recipeYield = Number(selected?.recipe?.yield_qty || 0);
  const batchCount = Number(batches) > 0 ? Number(batches) : 0;
  const defaultOutput = recipeYield * batchCount;
  const outputQty =
    outputQtyOverride.trim() === ""
      ? defaultOutput
      : Number(outputQtyOverride);

  const preview = useMemo(() => {
    if (!selected?.recipe || !(outputQty > 0) || !(recipeYield > 0)) return null;
    return computeRecipeBatchCost({
      recipeLines: selected.recipe.lines.map((l) => ({
        quantity: Number(l.quantity),
        unitCost: Number(l.unit_cost || 0),
      })),
      recipeYieldQty: recipeYield,
      outputQty,
    });
  }, [selected, outputQty, recipeYield]);

  return (
    <form
      className="space-y-6"
      action={(fd) => {
        setError(null);
        fd.set("title", title || `Batch ${selected?.name ?? ""}`);
        fd.set("produced_at", producedAt);
        fd.set("output_product_id", productId);
        fd.set("output_qty", String(outputQty));
        fd.set("notes", notes);
        startTransition(async () => {
          const r = await completePreparacionProductionAction(fd);
          if (!r.ok) {
            setError(r.error ?? "Error");
            return;
          }
          router.push(r.id ? `/cocina/producciones/${r.id}` : "/cocina/producciones");
          router.refresh();
        });
      }}
    >
      <section className="grid gap-4 rounded-xl border border-[var(--line)] bg-white p-4 md:grid-cols-2">
        <label className="space-y-1 text-sm md:col-span-2">
          <span className="text-[var(--muted)]">Preparación</span>
          <select
            required
            value={productId}
            onChange={(e) => {
              setProductId(e.target.value);
              setOutputQtyOverride("");
              setBatches("1");
            }}
            className={inputClass}
          >
            <option value="" disabled>
              Seleccione…
            </option>
            {withRecipe.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · stock {p.current_stock} {p.unit}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm md:col-span-2">
          <span className="text-[var(--muted)]">Título</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={selected ? `Producción ${selected.name}` : "Título"}
            className={inputClass}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-[var(--muted)]">Fecha</span>
          <input
            type="date"
            required
            value={producedAt}
            onChange={(e) => setProducedAt(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-[var(--muted)]">
            Batches (ficha rinde {recipeYield || "—"} {selected?.unit ?? ""})
          </span>
          <input
            type="number"
            step="any"
            min="0"
            value={batches}
            onChange={(e) => {
              setBatches(e.target.value);
              setOutputQtyOverride("");
            }}
            className={inputClass}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-[var(--muted)]">
            Cantidad a producir ({selected?.unit ?? "u"}) — opcional override
          </span>
          <input
            type="number"
            step="any"
            min="0"
            value={outputQtyOverride}
            onChange={(e) => setOutputQtyOverride(e.target.value)}
            placeholder={String(defaultOutput || "")}
            className={inputClass}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-[var(--muted)]">Notas</span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputClass}
          />
        </label>
      </section>

      {selected?.recipe ? (
        <section className="rounded-xl border border-[var(--line)] bg-white p-4">
          <h2 className="font-medium">Receta · {selected.recipe.name}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Factor ×{preview ? preview.scaleFactor.toFixed(3) : "—"} · producir{" "}
            {outputQty || 0} {selected.unit}
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {selected.recipe.lines.map((l, i) => {
              const scaled = preview?.scaledLines[i]?.scaledQuantity ?? 0;
              const stock = Number(l.current_stock || 0);
              const short = scaled > stock;
              return (
                <li
                  key={`${l.component_product_id}-${i}`}
                  className="flex flex-wrap justify-between gap-2 border-b border-[var(--line)] pb-2 last:border-0"
                >
                  <span>
                    {l.name}{" "}
                    <span className="text-[var(--muted)]">
                      ({Number(l.quantity)} {l.unit} en ficha)
                    </span>
                  </span>
                  <span className={short ? "text-red-700" : ""}>
                    Consume {scaled} {l.unit} · hay {stock}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {preview ? (
        <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <h2 className="font-medium">Vista previa de costeo</h2>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-[var(--muted)]">Costo batch</dt>
              <dd className="font-medium">{formatCOP(preview.inputTotalCost)}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Costo / {selected?.unit ?? "u"}</dt>
              <dd className="font-display text-xl font-semibold">
                {formatUnitCost(preview.outputUnitCost)}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Costo teórico ficha</dt>
              <dd className="font-medium">
                {formatUnitCost(
                  money(preview.inputTotalCost)
                    .div(outputQty || 1)
                    .toNumber(),
                )}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={pending || !withRecipe.length || !(outputQty > 0)}
          className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm text-white disabled:opacity-60"
        >
          {pending ? "Produciendo…" : "Completar producción"}
        </button>
        <button
          type="button"
          className="text-sm text-[var(--muted)]"
          onClick={() => router.push("/cocina/producciones")}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
