"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { voidKitchenProductionAction } from "../../kitchen-actions";

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2";

export function VoidProductionForm({ productionId }: { productionId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-800 hover:bg-red-50"
      >
        Anular producción
      </button>
    );
  }

  return (
    <form
      className="space-y-3 rounded-xl border border-red-200 bg-red-50/40 p-4"
      action={(fd) => {
        setError(null);
        fd.set("production_id", productionId);
        startTransition(async () => {
          const r = await voidKitchenProductionAction(fd);
          if (!r.ok) {
            setError(r.error ?? "Error");
            return;
          }
          setOpen(false);
          router.refresh();
        });
      }}
    >
      <p className="text-sm text-red-900">
        Revierte el stock de entradas y salidas. No anule si el producto ya se
        usó en otra producción o venta y no queda inventario.
      </p>
      <textarea
        name="reason"
        required
        rows={2}
        placeholder="Motivo de anulación"
        className={inputClass}
      />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-red-800 px-3 py-2 text-sm text-white disabled:opacity-60"
        >
          {pending ? "Anulando…" : "Confirmar anulación"}
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
