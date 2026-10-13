"use client";

import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  computeKitchenProductionCost,
  aprovechamientoUnitCost,
} from "@/lib/kitchen/cost";
import { productTracksInventory } from "@/lib/kitchen/density";
import { formatCOP } from "@/lib/money";
import { cn } from "@/lib/utils";
import { completeInsumoProductionAction } from "../../kitchen-actions";

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2";

export type StockProduct = {
  id: string;
  name: string;
  unit: string;
  current_stock: number | string;
  unit_cost: number | string;
  category_name?: string | null;
  tracks_inventory?: boolean | null;
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

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Selector de materia prima con buscador + lista filtrada. */
function InventoryProductPicker({
  products,
  value,
  onChange,
  required,
  excludeIds = [],
}: {
  products: StockProduct[];
  value: string;
  onChange: (productId: string) => void;
  required?: boolean;
  excludeIds?: string[];
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = products.find((p) => p.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = normalizeSearch(query);
    const excluded = new Set(excludeIds.filter((id) => id && id !== value));
    return products
      .filter((p) => !excluded.has(p.id))
      .filter((p) => {
        if (!q) return true;
        const hay = normalizeSearch(
          `${p.name} ${p.category_name ?? ""} ${p.unit}`,
        );
        return hay.includes(q);
      })
      .slice()
      .sort((a, b) => {
        const tracksA = productTracksInventory(a.tracks_inventory);
        const tracksB = productTracksInventory(b.tracks_inventory);
        if (tracksA !== tracksB) return tracksA ? 0 : 1;
        const sa = !tracksA || Number(a.current_stock || 0) > 0 ? 0 : 1;
        const sb = !tracksB || Number(b.current_stock || 0) > 0 ? 0 : 1;
        if (sa !== sb) return sa - sb;
        return a.name.localeCompare(b.name, "es");
      })
      .slice(0, 40);
  }, [products, query, excludeIds, value]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (selected && !open) {
    const tracks = productTracksInventory(selected.tracks_inventory);
    const stock = Number(selected.current_stock || 0);
    const ok = !tracks || stock > 0;
    return (
      <div
        className={cn(
          "flex min-w-[12rem] flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-sm",
          ok
            ? "border-[var(--line)] bg-[var(--surface)]"
            : "border-red-200 bg-red-50/50",
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{selected.name}</p>
          <p
            className={cn(
              "truncate text-xs",
              ok ? "text-[var(--muted)]" : "text-red-700",
            )}
          >
            {selected.category_name ? `${selected.category_name} · ` : ""}
            {!tracks
              ? `Sin inventario · ${selected.unit}`
              : stock > 0
                ? `${stock} ${selected.unit}`
                : `Sin existencia (${selected.unit})`}
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
          placeholder="Buscar materia prima…"
          className={cn(inputClass, "pl-8 pr-8")}
          aria-label="Buscar materia prima"
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
      {required && !value ? (
        <p className="mt-1 text-xs text-[var(--muted)]">
          Elija un producto de la lista
        </p>
      ) : null}
      {open ? (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-[var(--line)] bg-[var(--surface)] py-1 shadow-md">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-[var(--muted)]">
              Sin coincidencias
            </li>
          ) : (
            filtered.map((mp) => {
              const tracks = productTracksInventory(mp.tracks_inventory);
              const stock = Number(mp.current_stock || 0);
              const unavailable = tracks && !(stock > 0);
              return (
                <li key={mp.id}>
                  <button
                    type="button"
                    disabled={unavailable}
                    className={cn(
                      "flex w-full flex-col items-start px-3 py-2 text-left text-sm",
                      unavailable
                        ? "cursor-not-allowed opacity-45"
                        : "hover:bg-[var(--surface)]",
                      mp.id === value && "bg-[var(--surface)]",
                    )}
                    onClick={() => {
                      if (unavailable) return;
                      onChange(mp.id);
                      setQuery("");
                      setOpen(false);
                    }}
                  >
                    <span className="font-medium">{mp.name}</span>
                    <span
                      className={cn(
                        "text-xs",
                        unavailable ? "text-red-700" : "text-[var(--muted)]",
                      )}
                    >
                      {mp.category_name ? `${mp.category_name} · ` : ""}
                      {!tracks
                        ? `sin inventario · ${mp.unit}`
                        : unavailable
                          ? "Sin existencia"
                          : `stock ${stock} ${mp.unit}`}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}

export function InsumoProductionForm({
  materiasPrimas,
  insumos,
  aprovechamientos: aprovechamientoOptions,
  initialOutputProductId,
}: {
  materiasPrimas: StockProduct[];
  insumos: StockProduct[];
  aprovechamientos: StockProduct[];
  initialOutputProductId?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [showAprov, setShowAprov] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const lockedProduct =
    Boolean(initialOutputProductId) &&
    insumos.some((p) => p.id === initialOutputProductId);

  const preselected =
    lockedProduct && initialOutputProductId
      ? initialOutputProductId
      : (insumos[0]?.id ?? "");

  const [producedAt, setProducedAt] = useState(today);
  const [outputProductId, setOutputProductId] = useState(preselected);
  const [outputQty, setOutputQty] = useState("");
  const [inputs, setInputs] = useState<InputRow[]>([
    { key: uid(), product_id: "", quantity: "" },
  ]);
  const [aprov, setAprov] = useState<AprovRow[]>([]);

  const outputProduct = insumos.find((p) => p.id === outputProductId);
  const title = outputProduct
    ? `Crear más · ${outputProduct.name}`
    : "Crear más";

  const mpMap = useMemo(
    () => new Map(materiasPrimas.map((p) => [p.id, p])),
    [materiasPrimas],
  );

  const stockIssues = useMemo(() => {
    const issues: string[] = [];
    for (const row of inputs) {
      if (!row.product_id) continue;
      const p = mpMap.get(row.product_id);
      if (!p) continue;
      if (!productTracksInventory(p.tracks_inventory)) continue;
      const stock = Number(p.current_stock || 0);
      const qty = Number(row.quantity);
      if (!(stock > 0)) {
        issues.push(`Sin existencia de ${p.name}`);
        continue;
      }
      if (Number.isFinite(qty) && qty > 0 && qty > stock) {
        issues.push(
          `${p.name}: pide ${qty} ${p.unit}, solo hay ${stock} ${p.unit}`,
        );
      }
    }
    return issues;
  }, [inputs, mpMap]);

  const hasStockAvailable = useMemo(
    () =>
      materiasPrimas.some(
        (p) =>
          !productTracksInventory(p.tracks_inventory) ||
          Number(p.current_stock || 0) > 0,
      ),
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
    return computeKitchenProductionCost({
      inputs: parsedInputs,
      outputQty: out,
      aprovechamientos: parsedAprov,
    });
  }, [inputs, aprov, outputQty, mpMap]);

  const canSubmit =
    hasStockAvailable &&
    stockIssues.length === 0 &&
    inputs.some((r) => r.product_id && Number(r.quantity) > 0) &&
    Number(outputQty) > 0;

  return (
    <form
      className="mx-auto max-w-xl space-y-5"
      action={(fd) => {
        setError(null);
        if (!hasStockAvailable) {
          setError(
            "No hay materias primas con existencia. Reciba o ajuste inventario primero.",
          );
          return;
        }
        if (stockIssues.length > 0) {
          setError(stockIssues[0]);
          return;
        }
        const validInputs = inputs.filter(
          (r) => r.product_id && Number(r.quantity) > 0,
        );
        if (validInputs.length === 0) {
          setError("Seleccione al menos una materia prima y su cantidad");
          return;
        }
        fd.set("title", title);
        fd.set("produced_at", producedAt);
        fd.set("output_product_id", outputProductId);
        fd.set("output_qty", outputQty);
        fd.set("merma_qty", "");
        fd.set("notes", "");
        fd.set(
          "inputs_json",
          JSON.stringify(
            validInputs.map((r) => ({
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
          router.push("/cocina/insumos");
          router.refresh();
        });
      }}
    >
      {/* Cabecera mínima */}
      <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
              Crear más
            </p>
            {lockedProduct && outputProduct ? (
              <h2 className="mt-1 font-display text-xl font-semibold">
                {outputProduct.name}
              </h2>
            ) : (
              <select
                required
                value={outputProductId}
                onChange={(e) => setOutputProductId(e.target.value)}
                className={`${inputClass} mt-2`}
                aria-label="Insumo"
              >
                {insumos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            {outputProduct ? (
              <p className="mt-1 text-sm text-[var(--muted)]">
                Stock actual {outputProduct.current_stock} {outputProduct.unit}
              </p>
            ) : null}
          </div>
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
        </div>
      </section>

      {/* Consumo */}
      <section className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">Usé de inventario</h3>
          {inputs.length < 3 ? (
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
              + Materia prima
            </button>
          ) : null}
        </div>
        {!hasStockAvailable ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            No hay materias primas con existencia. No se puede crear más hasta
            tener stock en inventario.
          </p>
        ) : null}
        <div className="space-y-2">
          {inputs.map((row, idx) => {
            const p = row.product_id ? mpMap.get(row.product_id) : null;
            const stock = p ? Number(p.current_stock || 0) : 0;
            const qty = Number(row.quantity);
            const overStock =
              p != null &&
              Number.isFinite(qty) &&
              qty > 0 &&
              (stock <= 0 || qty > stock);
            const usedElsewhere = inputs
              .filter((r) => r.key !== row.key)
              .map((r) => r.product_id)
              .filter(Boolean);
            return (
              <div key={row.key} className="space-y-1">
                <div className="flex flex-wrap items-start gap-2">
                  <InventoryProductPicker
                    products={materiasPrimas}
                    value={row.product_id}
                    required={idx === 0}
                    excludeIds={usedElsewhere}
                    onChange={(productId) =>
                      setInputs((prev) =>
                        prev.map((r) =>
                          r.key === row.key
                            ? { ...r, product_id: productId }
                            : r,
                        ),
                      )
                    }
                  />
                  <input
                    type="number"
                    step="any"
                    min="0"
                    max={stock > 0 ? stock : undefined}
                    inputMode="decimal"
                    placeholder={p ? `Cant. ${p.unit}` : "Cantidad"}
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
                    className={cn(
                      inputClass,
                      "w-28",
                      overStock && "border-red-400",
                    )}
                    required={idx === 0}
                  />
                  {inputs.length > 1 ? (
                    <button
                      type="button"
                      className="mt-2 text-sm text-[var(--muted)]"
                      onClick={() =>
                        setInputs((prev) =>
                          prev.filter((r) => r.key !== row.key),
                        )
                      }
                      aria-label="Quitar línea"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
                {overStock && p ? (
                  <p className="text-xs text-red-700">
                    {stock <= 0
                      ? `Sin existencia de ${p.name}`
                      : `Máximo disponible: ${stock} ${p.unit}`}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      {/* Resultado útil */}
      <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
        <label className="space-y-1 text-sm">
          <span className="text-[var(--muted)]">
            Quedó usable ({outputProduct?.unit ?? "u"})
          </span>
          <input
            required
            type="number"
            step="any"
            min="0"
            inputMode="decimal"
            value={outputQty}
            onChange={(e) => setOutputQty(e.target.value)}
            placeholder="Cantidad útil"
            className={inputClass}
          />
        </label>
        {preview && preview.mermaQty > 0 ? (
          <p className="mt-2 text-sm text-[var(--muted)]">
            Merma automática:{" "}
            <strong className="text-[var(--ink)]">{preview.mermaQty}</strong>
            {preview.mermaPct != null
              ? ` (${preview.mermaPct.toFixed(1)}%)`
              : ""}
          </p>
        ) : null}
      </section>

      {/* Aprovechamiento opcional */}
      <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
        {!showAprov && aprov.length === 0 ? (
          <button
            type="button"
            className="text-sm text-[var(--accent)]"
            onClick={() => {
              setShowAprov(true);
              setAprov([
                {
                  key: uid(),
                  product_id: "",
                  quantity: "",
                  allocated_cost: "0",
                },
              ]);
            }}
          >
            + Hubo aprovechamiento
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Aprovechamiento</h3>
              <button
                type="button"
                className="text-xs text-[var(--muted)]"
                onClick={() => {
                  setShowAprov(false);
                  setAprov([]);
                }}
              >
                Quitar
              </button>
            </div>
            {aprov.map((row) => (
              <div key={row.key} className="grid gap-2 sm:grid-cols-3">
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
                  className={`${inputClass} sm:col-span-3`}
                >
                  <option value="">Producto…</option>
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
                  placeholder="Costo $"
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
                {Number(row.quantity) > 0 ? (
                  <p className="text-xs text-[var(--muted)] sm:col-span-3">
                    ≈{" "}
                    {formatUnitCost(
                      aprovechamientoUnitCost(
                        Number(row.quantity),
                        Number(row.allocated_cost || 0),
                      ),
                    )}
                    /u
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      {preview ? (
        <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs text-[var(--muted)]">Nuevo costo / u</p>
              <p className="font-display text-2xl font-semibold">
                {formatUnitCost(preview.outputUnitCost)}
              </p>
            </div>
            <p className="text-sm text-[var(--muted)]">
              Entradas {formatCOP(preview.inputTotalCost)}
              {preview.yieldPct != null
                ? ` · rinde ${preview.yieldPct.toFixed(0)}%`
                : ""}
            </p>
          </div>
        </section>
      ) : null}

      {stockIssues.length > 0 ? (
        <p className="text-sm text-red-700">{stockIssues[0]}</p>
      ) : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={
            pending ||
            !insumos.length ||
            !materiasPrimas.length ||
            !canSubmit
          }
          className="rounded-lg bg-[var(--solid)] px-5 py-2.5 text-sm text-[var(--on-solid)] disabled:opacity-60"
        >
          {pending ? "Guardando…" : "Crear más"}
        </button>
        <button
          type="button"
          className="text-sm text-[var(--muted)]"
          onClick={() => router.push("/cocina/insumos")}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
