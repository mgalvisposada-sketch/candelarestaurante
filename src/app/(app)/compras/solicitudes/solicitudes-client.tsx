"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { createPurchaseRequestAction } from "../purchase-actions";
import { Badge } from "@/components/ui/primitives";
import { formatDateCO, todayInBogota } from "@/lib/dates";
import { purchaseRequestStatusLabel } from "@/lib/purchases/status-labels";

export type PurchaseRequestListRow = {
  id: string;
  title: string;
  status: string;
  requested_at: string;
  needed_by: string | null;
  location_label: string | null;
  is_urgent?: boolean | null;
  payment_mode?: string | null;
};

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2";

function statusTone(status: string) {
  if (["APROBADA", "PEDIDA", "RECIBIDA", "FACTURA_ACEPTADA"].includes(status))
    return "ok" as const;
  if (["RECHAZADA", "ANULADA"].includes(status)) return "danger" as const;
  return "warn" as const;
}

export function CreatePurchaseRequestForm() {
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
        Nueva solicitud
      </button>
    );
  }

  return (
    <form
      className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-5"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await createPurchaseRequestAction(fd);
          if (!r.ok) setError(r.error ?? "Error");
          else if (r.id) window.location.href = `/compras/solicitudes/${r.id}`;
        });
      }}
    >
      <div className="flex justify-between">
        <h3 className="font-medium">Solicitud de reposición</h3>
        <button type="button" className="text-sm text-[var(--muted)]" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">Título *</span>
          <input
            name="title"
            required
            placeholder="Ej. Reposición cocina semana 14"
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Punto / local</span>
          <input name="location_label" placeholder="Punto principal" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Fecha</span>
          <input type="date" name="requested_at" defaultValue={todayInBogota()} className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Se necesita para</span>
          <input type="date" name="needed_by" className={inputClass} />
        </label>
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input type="checkbox" name="is_urgent" value="true" className="size-4" />
          <span>Urgente (se agotó / hay que reponer ya)</span>
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">Forma de compra</span>
          <select name="payment_mode" defaultValue="CREDITO" className={inputClass}>
            <option value="CREDITO">A crédito (factura al proveedor)</option>
            <option value="EFECTIVO_INMEDIATO">
              Efectivo inmediato (tras autorización)
            </option>
          </select>
          <span className="mt-1 block text-xs text-[var(--muted)]">
            Aunque sea efectivo, primero debe autorizarse. Sin autorización no
            comprar.
          </span>
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">Notas</span>
          <textarea name="notes" rows={2} className={inputClass} />
        </label>
      </div>
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      <button type="submit" disabled={pending} className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm text-white">
        {pending ? "Creando…" : "Crear y agregar productos"}
      </button>
    </form>
  );
}

export function PurchaseRequestList({
  requests,
}: {
  requests: PurchaseRequestListRow[];
}) {
  return (
    <div className="space-y-3">
      {requests.map((r) => (
        <Link
          key={r.id}
          href={`/compras/solicitudes/${r.id}`}
          className="block rounded-xl border border-[var(--line)] bg-white px-4 py-3 transition hover:border-[var(--ink)]"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium">{r.title}</p>
              <p className="text-sm text-[var(--muted)]">
                {formatDateCO(r.requested_at)}
                {r.location_label ? ` · ${r.location_label}` : ""}
                {r.needed_by ? ` · necesaria ${formatDateCO(r.needed_by)}` : ""}
                {r.is_urgent ? " · urgente" : ""}
                {r.payment_mode === "EFECTIVO_INMEDIATO"
                  ? " · efectivo"
                  : ""}
              </p>
            </div>
            <Badge tone={statusTone(r.status)}>
              {purchaseRequestStatusLabel(r.status)}
            </Badge>
          </div>
        </Link>
      ))}
    </div>
  );
}
