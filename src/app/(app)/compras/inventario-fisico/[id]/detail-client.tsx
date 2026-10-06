"use client";

import { useState, useTransition } from "react";
import {
  applyPhysicalCountAdjustmentsAction,
  rejectPhysicalCountAction,
  submitPhysicalCountAction,
  upsertPhysicalCountItemAction,
} from "../../physical-inventory-actions";
import { Badge } from "@/components/ui/primitives";

export type CountDetail = {
  id: string;
  title: string;
  status: string;
  counted_at: string;
  location_label: string | null;
  notes: string | null;
  rejection_reason: string | null;
};
export type CountItem = {
  id: string;
  product_id: string;
  system_qty: number | string;
  counted_qty: number | string;
  difference_qty: number | string;
  notes: string | null;
  product_name?: string;
  unit?: string;
};
export type ProductOption = {
  id: string;
  name: string;
  unit: string;
  current_stock: number | string;
};

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2";

export function PhysicalCountDetailClient({
  count,
  items,
  products,
  canEdit,
  canAdjust,
}: {
  count: CountDetail;
  items: CountItem[];
  products: ProductOption[];
  canEdit: boolean;
  canAdjust: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isDraft = count.status === "BORRADOR";
  const isSubmitted = count.status === "ENVIADO";

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[var(--line)] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-medium">{count.title}</h2>
            <p className="text-sm text-[var(--muted)]">
              {count.counted_at}
              {count.location_label ? ` · ${count.location_label}` : ""}
            </p>
            {count.notes ? (
              <p className="mt-2 text-sm text-[var(--muted)]">{count.notes}</p>
            ) : null}
            {count.rejection_reason ? (
              <p className="mt-2 text-sm text-red-700">Rechazo: {count.rejection_reason}</p>
            ) : null}
          </div>
          <Badge
            tone={
              count.status === "AJUSTADO"
                ? "ok"
                : count.status === "RECHAZADO"
                  ? "danger"
                  : "warn"
            }
          >
            {count.status}
          </Badge>
        </div>
      </div>

      {isDraft && canEdit ? (
        <form
          className="space-y-3 rounded-xl border border-[var(--line)] bg-white p-4"
          action={(fd) => {
            setError(null);
            startTransition(async () => {
              const r = await upsertPhysicalCountItemAction(count.id, fd);
              if (!r.ok) setError(r.error ?? "Error");
            });
          }}
        >
          <h3 className="font-medium">Registrar conteo</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="block text-sm md:col-span-2">
              <span className="mb-1 block text-[var(--muted)]">Producto</span>
              <select name="product_id" required className={inputClass}>
                <option value="">Seleccione…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (sistema: {p.current_stock} {p.unit})
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--muted)]">Cantidad física</span>
              <input name="counted_qty" required className={inputClass} />
            </label>
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white"
          >
            Guardar ítem
          </button>
        </form>
      ) : null}

      <section className="space-y-3">
        <h3 className="font-medium">Ítems ({items.length})</h3>
        {items.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Sin productos contados.</p>
        ) : (
          items.map((item) => {
            const diff = Number(item.difference_qty);
            return (
              <article
                key={item.id}
                className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
              >
                <p className="font-medium">{item.product_name}</p>
                <p className="text-[var(--muted)]">
                  Sistema: {item.system_qty} {item.unit} · Contado: {item.counted_qty}{" "}
                  {item.unit} · Diferencia:{" "}
                  <strong className={diff === 0 ? "" : diff < 0 ? "text-red-700" : "text-emerald-700"}>
                    {diff > 0 ? `+${diff}` : diff}
                  </strong>
                </p>
              </article>
            );
          })
        )}
      </section>

      {isDraft && canEdit ? (
        <button
          type="button"
          disabled={pending || items.length === 0}
          className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm text-white disabled:opacity-60"
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const r = await submitPhysicalCountAction(count.id);
              if (!r.ok) setError(r.error ?? "Error");
            })
          }
        >
          Enviar a revisión (sin ajustar stock)
        </button>
      ) : null}

      {isSubmitted && canAdjust ? (
        <div className="space-y-3 rounded-xl border border-[var(--line)] bg-white p-5">
          <h3 className="font-medium">Revisión Gestión</h3>
          <p className="text-sm text-[var(--muted)]">
            Al aplicar, el stock del sistema se iguala a lo contado y queda trazabilidad en movimientos.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm text-white"
              onClick={() => {
                if (!confirm("¿Aplicar ajustes de inventario al stock del sistema?")) return;
                startTransition(async () => {
                  setError(null);
                  const r = await applyPhysicalCountAdjustmentsAction(count.id);
                  if (!r.ok) setError(r.error ?? "Error");
                });
              }}
            >
              Aplicar ajustes
            </button>
          </div>
          <form
            className="flex flex-wrap items-end gap-2"
            action={(fd) => {
              setError(null);
              startTransition(async () => {
                const r = await rejectPhysicalCountAction(count.id, fd);
                if (!r.ok) setError(r.error ?? "Error");
              });
            }}
          >
            <input
              name="rejection_reason"
              required
              placeholder="Motivo de rechazo"
              className={`${inputClass} min-w-[240px]`}
            />
            <button type="submit" disabled={pending} className="rounded-lg px-4 py-2 text-sm text-red-700">
              Rechazar
            </button>
          </form>
        </div>
      ) : null}

      {isSubmitted && !canAdjust ? (
        <p className="text-sm text-[var(--muted)]">
          Enviado. Esperando que Gestión revise y aplique o rechace el ajuste.
        </p>
      ) : null}

      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
    </div>
  );
}
