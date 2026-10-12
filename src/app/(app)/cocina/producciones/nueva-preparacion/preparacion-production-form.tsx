"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { computeRecipeBatchCost } from "@/lib/kitchen/cost";
import {
  productTracksInventory,
  roundQty,
} from "@/lib/kitchen/density";
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
      tracks_inventory?: boolean | null;
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
  initialProductId,
}: {
  preparaciones: PrepOption[];
  /** Prefill desde “Crear más” en el catálogo. */
  initialProductId?: string;
}) {
  const router = useRouter();
  const withRecipe = preparaciones.filter((p) => p.recipe);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const today = new Date().toISOString().slice(0, 10);

  const preselected =
    initialProductId && withRecipe.some((p) => p.id === initialProductId)
      ? initialProductId
      : (withRecipe[0]?.id ?? "");
  const preselectedPrep = withRecipe.find((p) => p.id === preselected);
  const preselectedName = preselectedPrep?.name;
  const preselectedYield = Number(preselectedPrep?.recipe?.yield_qty || 0);

  const [productId, setProductId] = useState(preselected);
  const [title, setTitle] = useState(
    preselectedName ? `Crear más · ${preselectedName}` : "",
  );
  const [producedAt, setProducedAt] = useState(today);
  const [batches, setBatches] = useState("1");
  const [outputQty, setOutputQty] = useState(
    preselectedYield > 0 ? String(preselectedYield) : "",
  );
  const [yieldVarianceNote, setYieldVarianceNote] = useState("");
  const [notes, setNotes] = useState("");

  const selected = withRecipe.find((p) => p.id === productId) ?? null;
  const recipeYield = Number(selected?.recipe?.yield_qty || 0);
  const batchCount = Number(batches) > 0 ? Number(batches) : 0;
  const resultingQty = Number(outputQty);
  const theoreticalOutput =
    batchCount > 0 && recipeYield > 0
      ? roundQty(recipeYield * batchCount)
      : 0;
  const actualOutput =
    Number.isFinite(resultingQty) && resultingQty > 0
      ? roundQty(resultingQty)
      : 0;
  const yieldDiff =
    theoreticalOutput > 0 && actualOutput > 0
      ? roundQty(actualOutput - theoreticalOutput)
      : 0;
  const hasYieldVariance = theoreticalOutput > 0 && actualOutput > 0 && yieldDiff !== 0;
  const yieldDeltaPct =
    hasYieldVariance && theoreticalOutput > 0
      ? money(yieldDiff).div(theoreticalOutput).times(100).toDecimalPlaces(1).toNumber()
      : 0;

  const preview = useMemo(() => {
    if (
      !selected?.recipe ||
      !(batchCount > 0) ||
      !(resultingQty > 0) ||
      !(recipeYield > 0)
    ) {
      return null;
    }
    return computeRecipeBatchCost({
      recipeLines: selected.recipe.lines.map((l) => ({
        quantity: Number(l.quantity),
        unitCost: Number(l.unit_cost || 0),
      })),
      recipeYieldQty: recipeYield,
      batches: batchCount,
      outputQty: resultingQty,
    });
  }, [selected, batchCount, resultingQty, recipeYield]);

  const stockIssues = useMemo(() => {
    if (!selected?.recipe || !(batchCount > 0)) return [] as string[];
    const issues: string[] = [];
    selected.recipe.lines.forEach((l) => {
      if (!productTracksInventory(l.tracks_inventory)) return;
      const needed = Number(l.quantity) * batchCount;
      const stock = Number(l.current_stock || 0);
      if (!(stock > 0)) {
        issues.push(
          `Sin existencia de ${l.name} (mín. ${needed} ${l.unit} por la receta)`,
        );
        return;
      }
      if (needed > stock) {
        issues.push(
          `${l.name}: la receta pide ${needed} ${l.unit}, solo hay ${stock} ${l.unit}`,
        );
      }
    });
    return issues;
  }, [selected, batchCount]);

  const canSubmit =
    Boolean(selected?.recipe) &&
    batchCount > 0 &&
    resultingQty > 0 &&
    stockIssues.length === 0 &&
    (selected?.recipe?.lines.length ?? 0) > 0 &&
    (!hasYieldVariance || yieldVarianceNote.trim().length >= 3);

  return (
    <form
      className="space-y-6"
      action={(fd) => {
        setError(null);
        if (stockIssues.length > 0) {
          setError(stockIssues[0]);
          return;
        }
        if (!(batchCount > 0)) {
          setError("Indique cuántos batches de la receta cocinó");
          return;
        }
        if (!(resultingQty > 0)) {
          setError("Indique cuánto resultó realmente de la preparación");
          return;
        }
        if (hasYieldVariance && yieldVarianceNote.trim().length < 3) {
          setError(
            "El resultado difiere del rendimiento teórico: escriba una observación",
          );
          return;
        }
        fd.set("title", title || `Batch ${selected?.name ?? ""}`);
        fd.set("produced_at", producedAt);
        fd.set("output_product_id", productId);
        fd.set("batches", String(batchCount));
        fd.set("output_qty", String(resultingQty));
        fd.set("yield_variance_note", yieldVarianceNote.trim());
        fd.set("notes", notes);
        startTransition(async () => {
          const r = await completePreparacionProductionAction(fd);
          if (!r.ok) {
            setError(r.error ?? "Error");
            return;
          }
          router.push(
            r.id ? `/cocina/producciones/${r.id}` : "/cocina/producciones",
          );
          router.refresh();
        });
      }}
    >
      <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--muted)]">
        <p>
          <strong className="text-[var(--ink)]">1 · Batches</strong>
          {" — "}cuántas veces cocina la ficha (define lo que se{" "}
          <em>gasta</em> de cada componente).
        </p>
        <p className="mt-1">
          <strong className="text-[var(--ink)]">2 · Resultado real</strong>
          {" — "}cuánto quedó vs el rendimiento teórico de la ficha. Si difiere,
          debe dejar una observación. El costo/u = costo gastado ÷ resultado
          real.
        </p>
      </section>

      <section className="grid gap-4 rounded-xl border border-[var(--line)] bg-white p-4 md:grid-cols-2">
        <label className="space-y-1 text-sm md:col-span-2">
          <span className="text-[var(--muted)]">
            Crear más de (preparación del catálogo)
          </span>
          <select
            required
            value={productId}
            onChange={(e) => {
              const nextId = e.target.value;
              setProductId(nextId);
              setBatches("1");
              setYieldVarianceNote("");
              const next = withRecipe.find((p) => p.id === nextId);
              const y = Number(next?.recipe?.yield_qty || 0);
              setOutputQty(y > 0 ? String(y) : "");
              if (next) setTitle(`Crear más · ${next.name}`);
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
            Batches de la ficha (teórico{" "}
            {recipeYield || "—"} {selected?.unit ?? ""} c/u)
          </span>
          <input
            type="number"
            step="any"
            min="0"
            required
            value={batches}
            onChange={(e) => {
              const v = e.target.value;
              setBatches(v);
              const n = Number(v);
              if (n > 0 && recipeYield > 0) {
                setOutputQty(String(roundQty(recipeYield * n)));
                setYieldVarianceNote("");
              }
            }}
            className={inputClass}
          />
        </label>
        <div className="space-y-1 text-sm">
          <span className="text-[var(--muted)]">Rendimiento teórico del batch</span>
          <p className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 font-medium tabular-nums">
            {theoreticalOutput > 0
              ? `${theoreticalOutput} ${selected?.unit ?? ""}`
              : "—"}
          </p>
          <span className="block text-xs text-[var(--muted)]">
            Ficha × batches ({recipeYield || "—"} × {batchCount || "—"})
          </span>
        </div>
        <label className="space-y-1 text-sm md:col-span-2">
          <span className="text-[var(--muted)]">
            Cantidad resultante real ({selected?.unit ?? "u"})
          </span>
          <input
            type="number"
            step="any"
            min="0"
            required
            value={outputQty}
            onChange={(e) => setOutputQty(e.target.value)}
            className={inputClass}
            placeholder={
              theoreticalOutput > 0
                ? `Teórico ${theoreticalOutput}`
                : "Lo que quedó tras cocinar"
            }
          />
        </label>

        {hasYieldVariance ? (
          <div className="space-y-2 md:col-span-2">
            <p
              className={
                yieldDiff < 0
                  ? "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
                  : "rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950"
              }
            >
              {yieldDiff < 0 ? (
                <>
                  Alerta: el resultado quedó{" "}
                  <strong>
                    por debajo del teórico ({Math.abs(yieldDiff)}{" "}
                    {selected?.unit} / {Math.abs(yieldDeltaPct)}%)
                  </strong>
                  . Indique por qué en esta fecha rindió menos.
                </>
              ) : (
                <>
                  Alerta: el resultado quedó{" "}
                  <strong>
                    por encima del teórico (+{yieldDiff} {selected?.unit} / +
                    {yieldDeltaPct}%)
                  </strong>
                  . Indique por qué en esta fecha rindió más.
                </>
              )}
            </p>
            <label className="block space-y-1 text-sm">
              <span className="text-[var(--muted)]">
                Observación del desvío (obligatoria)
              </span>
              <textarea
                required
                rows={3}
                value={yieldVarianceNote}
                onChange={(e) => setYieldVarianceNote(e.target.value)}
                className={inputClass}
                placeholder="Ej. cocción más larga, merma por evaporación, porción más concentrada…"
              />
            </label>
          </div>
        ) : null}

        <label className="space-y-1 text-sm md:col-span-2">
          <span className="text-[var(--muted)]">Notas adicionales (opcional)</span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputClass}
          />
        </label>
      </section>

      {selected?.recipe ? (
        <section className="rounded-xl border border-[var(--line)] bg-white p-4">
          <h2 className="font-medium">Consumo de receta · {selected.recipe.name}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            ×{batchCount || 0} batch
            {(batchCount || 0) === 1 ? "" : "es"} · se descuenta del inventario
            aunque el resultado real sea menor
          </p>
          {stockIssues.length > 0 ? (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              No se puede crear más: cada componente debe cubrir la cantidad
              mínima de la receta ({stockIssues[0]}).
            </p>
          ) : null}
          <ul className="mt-3 space-y-2 text-sm">
            {selected.recipe.lines.map((l) => {
              const needed = Number(l.quantity) * (batchCount || 0);
              const tracks = productTracksInventory(l.tracks_inventory);
              const stock = Number(l.current_stock || 0);
              const short = tracks && (!(stock > 0) || needed > stock);
              return (
                <li
                  key={l.component_product_id}
                  className="flex flex-wrap justify-between gap-2 border-b border-[var(--line)] pb-2 last:border-0"
                >
                  <span>
                    {l.name}{" "}
                    <span className="text-[var(--muted)]">
                      ({Number(l.quantity)} {l.unit} / batch)
                      {!tracks ? " · sin inventario" : ""}
                    </span>
                  </span>
                  <span className={short ? "font-medium text-red-700" : ""}>
                    {!tracks
                      ? `Costea ${needed} ${l.unit} (sin stock)`
                      : stock <= 0
                        ? `Sin existencia · pide ${needed} ${l.unit}`
                        : `Consume ${needed} ${l.unit} · hay ${stock}`}
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
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-[var(--muted)]">Costo insumos gastados</dt>
              <dd className="font-medium">{formatCOP(preview.inputTotalCost)}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">
                Resultado / teórico
              </dt>
              <dd className="font-medium">
                {resultingQty} / {preview.theoreticalOutputQty}{" "}
                {selected?.unit}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Merma de cocción</dt>
              <dd className="font-medium">
                {preview.mermaQty} {selected?.unit}
                {preview.mermaPct != null
                  ? ` (${preview.mermaPct.toFixed(1)}%)`
                  : ""}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">
                Costo / {selected?.unit ?? "u"} (con merma)
              </dt>
              <dd className="font-display text-xl font-semibold">
                {formatUnitCost(preview.outputUnitCost)}
              </dd>
            </div>
          </dl>
          {preview.mermaQty > 0 ? (
            <p className="mt-3 text-xs text-[var(--muted)]">
              Teórico ficha{" "}
              {formatUnitCost(
                money(preview.inputTotalCost)
                  .div(preview.theoreticalOutputQty || 1)
                  .toNumber(),
              )}
              /{selected?.unit} → con merma sube a{" "}
              {formatUnitCost(preview.outputUnitCost)}/{selected?.unit}.
            </p>
          ) : null}
        </section>
      ) : null}

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={pending || !withRecipe.length || !canSubmit}
          className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm text-white disabled:opacity-60"
        >
          {pending ? "Produciendo…" : "Crear más"}
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
