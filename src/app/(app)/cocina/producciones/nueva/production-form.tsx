"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  computeKitchenProductionCost,
  aprovechamientoUnitCost,
} from "@/lib/kitchen/cost";
import { formatCOP, money } from "@/lib/money";
import { completeInsumoProductionAction } from "../../kitchen-actions";

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2";

export type StockProduct = {
  id: string;
  name: string;
  unit: string;
  current_stock: number | string;
  unit_cost: number | string;
  category_name?: string | null;
};

type InputRow = { key: string; product_id: string; quantity: string };
type AprovRow = {
  key: string;
  product_id: string;
  quantity: string;
  allocated_cost: string;
};

function formatUnitCost(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(value);
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export type InsumoRecipeSeed = {
  name: string;
  yieldQty: number;
  lines: Array<{ product_id: string; quantity: number }>;
};

export function InsumoProductionForm({
  materiasPrimas,
  insumos,
  aprovechamientos: aprovechamientoOptions,
  initialOutputProductId,
  initialRecipe,
}: {
  materiasPrimas: StockProduct[];
  insumos: StockProduct[];
  aprovechamientos: StockProduct[];
  /** Prefill desde “Crear más” en el catálogo. */
  initialOutputProductId?: string;
  /** Si el insumo tiene receta, precarga consumos escalables. */
  initialRecipe?: InsumoRecipeSeed | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const today = new Date().toISOString().slice(0, 10);
  const preselected =
    initialOutputProductId &&
    insumos.some((p) => p.id === initialOutputProductId)
      ? initialOutputProductId
      : (insumos[0]?.id ?? "");
  const selectedInsumo = insumos.find((p) => p.id === preselected);
  const [title, setTitle] = useState(
    selectedInsumo ? `Crear más · ${selectedInsumo.name}` : "",
  );
  const [producedAt, setProducedAt] = useState(today);
  const [outputProductId, setOutputProductId] = useState(preselected);
  const [outputQty, setOutputQty] = useState(
    initialRecipe?.yieldQty && initialRecipe.yieldQty > 0
      ? String(initialRecipe.yieldQty)
      : "",
  );
  const [mermaQty, setMermaQty] = useState("");
  const [notes, setNotes] = useState("");
  const [inputs, setInputs] = useState<InputRow[]>(() => {
    if (initialRecipe?.lines?.length) {
      return initialRecipe.lines.map((l) => ({
        key: uid(),
        product_id: l.product_id,
        quantity: String(l.quantity),
      }));
    }
    return [{ key: uid(), product_id: "", quantity: "" }];
  });
  const [aprov, setAprov] = useState<AprovRow[]>([]);

  const mpMap = useMemo(
    () => new Map(materiasPrimas.map((p) => [p.id, p])),
    [materiasPrimas],
  );

  const preview = useMemo(() => {
    const parsedInputs = inputs
      .filter((r) => r.product_id && Number(r.quantity) > 0)
      .map((r) => {
        const p = mpMap.get(r.product_id);
        return {
          quantity: Number(r.quantity),
          unitCost: Number(p?.unit_cost || 0),
        };
      });
    const parsedAprov = aprov
      .filter((r) => r.product_id && Number(r.quantity) > 0)
      .map((r) => ({
        quantity: Number(r.quantity),
        allocatedCost: Number(r.allocated_cost || 0),
      }));
    const out = Number(outputQty);
    if (!parsedInputs.length || !(out > 0)) return null;
    const mermaManual =
      mermaQty.trim() === "" ? undefined : Number(mermaQty);
    return computeKitchenProductionCost({
      inputs: parsedInputs,
      outputQty: out,
      aprovechamientos: parsedAprov,
      mermaQty:
        mermaManual !== undefined && Number.isFinite(mermaManual)
          ? mermaManual
          : undefined,
    });
  }, [inputs, aprov, outputQty, mermaQty, mpMap]);

  const outputProduct = insumos.find((p) => p.id === outputProductId);

  return (
    <form
      className="space-y-6"
      action={(fd) => {
        setError(null);
        fd.set("title", title);
        fd.set("produced_at", producedAt);
        fd.set("output_product_id", outputProductId);
        fd.set("output_qty", outputQty);
        fd.set("merma_qty", mermaQty);
        fd.set("notes", notes);
        fd.set(
          "inputs_json",
          JSON.stringify(
            inputs
              .filter((r) => r.product_id && Number(r.quantity) > 0)
              .map((r) => ({
                product_id: r.product_id,
                quantity: Number(r.quantity),
              })),
          ),
        );
        fd.set(
          "aprovechamientos_json",
          JSON.stringify(
            aprov
              .filter((r) => r.product_id && Number(r.quantity) > 0)
              .map((r) => ({
                product_id: r.product_id,
                quantity: Number(r.quantity),
                allocated_cost: Number(r.allocated_cost || 0),
              })),
          ),
        );
        startTransition(async () => {
          const r = await completeInsumoProductionAction(fd);
          if (!r.ok) {
            setError(r.error ?? "Error");
            return;
          }
          router.push("/cocina/producciones");
          router.refresh();
        });
      }}
    >
      <section className="grid gap-4 rounded-xl border border-[var(--line)] bg-white p-4 md:grid-cols-2">
        {initialRecipe ? (
          <p className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--muted)] md:col-span-2">
            Receta <strong className="text-[var(--ink)]">{initialRecipe.name}</strong>{" "}
            precargada (rinde {initialRecipe.yieldQty}). Ajuste cantidades y
            declare merma si aplica.
          </p>
        ) : null}
        <label className="space-y-1 text-sm md:col-span-2">
          <span className="text-[var(--muted)]">Título</span>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej. Crear más cebolla limpia — lote mañana"
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
            Crear más de (insumo del catálogo)
          </span>
          <select
            required
            value={outputProductId}
            onChange={(e) => setOutputProductId(e.target.value)}
            className={inputClass}
          >
            <option value="" disabled>
              Seleccione insumo
            </option>
            {insumos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · stock {p.current_stock} {p.unit}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="space-y-3 rounded-xl border border-[var(--line)] bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-medium">Materias primas a consumir (receta)</h2>
          <button
            type="button"
            className="text-sm text-[var(--accent)]"
            onClick={() =>
              setInputs((prev) => [
                ...prev,
                { key: uid(), product_id: "", quantity: "" },
              ])
            }
          >
            + Agregar
          </button>
        </div>
        <div className="space-y-3">
          {inputs.map((row, idx) => {
            const p = row.product_id ? mpMap.get(row.product_id) : null;
            return (
              <div
                key={row.key}
                className="grid gap-2 rounded-lg border border-[var(--line)] p-3 md:grid-cols-[1fr_140px_auto]"
              >
                <select
                  value={row.product_id}
                  onChange={(e) =>
                    setInputs((prev) =>
                      prev.map((r) =>
                        r.key === row.key
                          ? { ...r, product_id: e.target.value }
                          : r,
                      ),
                    )
                  }
                  className={inputClass}
                  required={idx === 0}
                >
                  <option value="">Materia prima…</option>
                  {materiasPrimas.map((mp) => (
                    <option key={mp.id} value={mp.id}>
                      {mp.name} · {mp.current_stock} {mp.unit} ·{" "}
                      {formatUnitCost(Number(mp.unit_cost || 0))}/{mp.unit}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder={`Cantidad ${p?.unit ?? ""}`}
                  value={row.quantity}
                  onChange={(e) =>
                    setInputs((prev) =>
                      prev.map((r) =>
                        r.key === row.key
                          ? { ...r, quantity: e.target.value }
                          : r,
                      ),
                    )
                  }
                  className={inputClass}
                />
                <button
                  type="button"
                  className="text-sm text-[var(--muted)]"
                  onClick={() =>
                    setInputs((prev) =>
                      prev.length === 1
                        ? prev
                        : prev.filter((r) => r.key !== row.key),
                    )
                  }
                >
                  Quitar
                </button>
                {p ? (
                  <p className="text-xs text-[var(--muted)] md:col-span-3">
                    Costo línea ≈{" "}
                    {formatCOP(
                      money(row.quantity || 0).times(Number(p.unit_cost || 0)),
                    )}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 rounded-xl border border-[var(--line)] bg-white p-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-[var(--muted)]">
            Cantidad útil del insumo ({outputProduct?.unit ?? "u"})
          </span>
          <input
            required
            type="number"
            step="any"
            min="0"
            value={outputQty}
            onChange={(e) => setOutputQty(e.target.value)}
            placeholder="Ej. 1500"
            className={inputClass}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-[var(--muted)]">
            Merma (opcional; si vacío se calcula)
          </span>
          <input
            type="number"
            step="any"
            min="0"
            value={mermaQty}
            onChange={(e) => setMermaQty(e.target.value)}
            placeholder="Auto"
            className={inputClass}
          />
        </label>
        <label className="space-y-1 text-sm md:col-span-2">
          <span className="text-[var(--muted)]">Notas</span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputClass}
          />
        </label>
      </section>

      <section className="space-y-3 rounded-xl border border-[var(--line)] bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-medium">Aprovechamientos</h2>
            <p className="text-xs text-[var(--muted)]">
              Opcional. Ej. tallos → fondo. Asigne un costo para bajar el del
              insumo principal.
            </p>
          </div>
          <button
            type="button"
            className="text-sm text-[var(--accent)]"
            onClick={() =>
              setAprov((prev) => [
                ...prev,
                {
                  key: uid(),
                  product_id: "",
                  quantity: "",
                  allocated_cost: "0",
                },
              ])
            }
          >
            + Aprovechamiento
          </button>
        </div>
        {aprov.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Sin aprovechamientos.</p>
        ) : (
          <div className="space-y-3">
            {aprov.map((row) => (
              <div
                key={row.key}
                className="grid gap-2 rounded-lg border border-[var(--line)] p-3 md:grid-cols-[1fr_120px_140px_auto]"
              >
                <select
                  value={row.product_id}
                  onChange={(e) =>
                    setAprov((prev) =>
                      prev.map((r) =>
                        r.key === row.key
                          ? { ...r, product_id: e.target.value }
                          : r,
                      ),
                    )
                  }
                  className={inputClass}
                >
                  <option value="">Insumo / preparación…</option>
                  {aprovechamientoOptions
                    .filter((p) => p.id !== outputProductId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="Cantidad"
                  value={row.quantity}
                  onChange={(e) =>
                    setAprov((prev) =>
                      prev.map((r) =>
                        r.key === row.key
                          ? { ...r, quantity: e.target.value }
                          : r,
                      ),
                    )
                  }
                  className={inputClass}
                />
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="Costo asignado"
                  value={row.allocated_cost}
                  onChange={(e) =>
                    setAprov((prev) =>
                      prev.map((r) =>
                        r.key === row.key
                          ? { ...r, allocated_cost: e.target.value }
                          : r,
                      ),
                    )
                  }
                  className={inputClass}
                />
                <button
                  type="button"
                  className="text-sm text-[var(--muted)]"
                  onClick={() =>
                    setAprov((prev) => prev.filter((r) => r.key !== row.key))
                  }
                >
                  Quitar
                </button>
                {Number(row.quantity) > 0 ? (
                  <p className="text-xs text-[var(--muted)] md:col-span-4">
                    Costo/u aprovechamiento ≈{" "}
                    {formatUnitCost(
                      aprovechamientoUnitCost(
                        Number(row.quantity),
                        Number(row.allocated_cost || 0),
                      ),
                    )}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      {preview ? (
        <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <h2 className="font-medium">Vista previa de costeo</h2>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-[var(--muted)]">Costo entradas</dt>
              <dd className="font-medium">{formatCOP(preview.inputTotalCost)}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Merma</dt>
              <dd className="font-medium">
                {preview.mermaQty}
                {preview.mermaPct != null
                  ? ` (${preview.mermaPct.toFixed(1)}%)`
                  : ""}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Rendimiento</dt>
              <dd className="font-medium">
                {preview.yieldPct != null
                  ? `${preview.yieldPct.toFixed(1)}%`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">
                Nuevo costo / {outputProduct?.unit ?? "u"}
              </dt>
              <dd className="font-display text-xl font-semibold">
                {formatUnitCost(preview.outputUnitCost)}
              </dd>
            </div>
          </dl>
          {preview.aprovechamientoTotalCost > 0 ? (
            <p className="mt-2 text-xs text-[var(--muted)]">
              Aprovechamientos llevan {formatCOP(preview.aprovechamientoTotalCost)}{" "}
              del costo; el principal queda en{" "}
              {formatCOP(preview.outputTotalCost)}.
            </p>
          ) : null}
        </section>
      ) : null}

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={pending || !insumos.length || !materiasPrimas.length}
          className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm text-white disabled:opacity-60"
        >
          {pending ? "Guardando…" : "Completar producción"}
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
