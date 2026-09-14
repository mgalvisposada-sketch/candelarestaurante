"use client";

import { useState, useTransition } from "react";
import {
  closeHandoverAction,
  createHandoverSessionAction,
  updateHandoverItemAction,
} from "./actions";
import { Badge } from "@/components/ui/primitives";
import { formatCOP } from "@/lib/money";
import { formatDateCO } from "@/lib/dates";
import type { VerificationStatus } from "@/types/domain";

export type HandoverSession = {
  id: string;
  cutoff_date: string;
  status: string;
  delivered_by_name: string | null;
  received_by_name: string | null;
  notes: string | null;
  closing_notes: string | null;
  pct_confirmed: number | null;
  pct_declared: number | null;
  pct_pending: number | null;
  closed_at: string | null;
};

export type HandoverItem = {
  id: string;
  domain: string;
  item_key: string;
  label: string;
  amount: number | string | null;
  verification_status: VerificationStatus;
  comments: string | null;
  source: string | null;
};

function statusTone(status: VerificationStatus) {
  if (status === "CONFIRMADO") return "ok" as const;
  if (status === "DECLARADO") return "warn" as const;
  return "danger" as const;
}

export function CreateHandoverForm({
  defaultCutoff,
}: {
  defaultCutoff: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-4"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const result = await createHandoverSessionAction(fd);
          if (!result.ok) setError(result.error ?? "Error");
        });
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Fecha de corte *</span>
          <input
            type="date"
            name="cutoff_date"
            required
            defaultValue={defaultCutoff ?? ""}
            className="w-full rounded-lg border border-[var(--line)] px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Quién entrega</span>
          <input
            name="delivered_by_name"
            className="w-full rounded-lg border border-[var(--line)] px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Quién recibe</span>
          <input
            name="received_by_name"
            className="w-full rounded-lg border border-[var(--line)] px-3 py-2"
          />
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">Observaciones</span>
          <textarea
            name="notes"
            rows={3}
            className="w-full rounded-lg border border-[var(--line)] px-3 py-2"
          />
        </label>
      </div>
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
      >
        {pending ? "Creando…" : "Iniciar empalme"}
      </button>
    </form>
  );
}

export function HandoverItemRow({
  item,
  readOnly,
}: {
  item: HandoverItem;
  readOnly: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <tr className="border-t border-[var(--line)] align-top">
      <td className="px-3 py-3 text-sm">
        <div className="font-medium">{item.label}</div>
        <div className="text-xs text-[var(--muted)]">{item.domain}</div>
      </td>
      <td className="px-3 py-3">
        {readOnly ? (
          <span className="text-sm">
            {item.amount != null ? formatCOP(item.amount) : "—"}
          </span>
        ) : (
          <input
            form={`item-${item.id}`}
            name="amount"
            defaultValue={item.amount != null ? String(item.amount) : ""}
            placeholder="0"
            className="w-36 rounded-md border border-[var(--line)] px-2 py-1.5 text-sm"
          />
        )}
      </td>
      <td className="px-3 py-3">
        {readOnly ? (
          <Badge tone={statusTone(item.verification_status)}>
            {item.verification_status}
          </Badge>
        ) : (
          <select
            form={`item-${item.id}`}
            name="verification_status"
            defaultValue={item.verification_status}
            className="rounded-md border border-[var(--line)] px-2 py-1.5 text-sm"
          >
            <option value="PENDIENTE">PENDIENTE</option>
            <option value="DECLARADO">DECLARADO</option>
            <option value="CONFIRMADO">CONFIRMADO</option>
          </select>
        )}
      </td>
      <td className="px-3 py-3">
        {readOnly ? (
          <span className="text-sm text-[var(--muted)]">
            {item.comments || "—"}
          </span>
        ) : (
          <input
            form={`item-${item.id}`}
            name="comments"
            defaultValue={item.comments ?? ""}
            placeholder="Comentario"
            className="w-full min-w-40 rounded-md border border-[var(--line)] px-2 py-1.5 text-sm"
          />
        )}
        <input type="hidden" form={`item-${item.id}`} name="domain" value={item.domain} />
        <input type="hidden" form={`item-${item.id}`} name="item_key" value={item.item_key} />
        <input type="hidden" form={`item-${item.id}`} name="label" value={item.label} />
        <input type="hidden" form={`item-${item.id}`} name="source" value={item.source ?? ""} />
      </td>
      <td className="px-3 py-3">
        {!readOnly ? (
          <form
            id={`item-${item.id}`}
            action={(fd) => {
              setError(null);
              setSaved(false);
              startTransition(async () => {
                const result = await updateHandoverItemAction(item.id, fd);
                if (!result.ok) setError(result.error ?? "Error");
                else setSaved(true);
              });
            }}
          >
            <button
              type="submit"
              disabled={pending}
              className="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-60"
            >
              {pending ? "…" : "Guardar"}
            </button>
            {saved ? (
              <span className="ml-2 text-xs text-teal-700">OK</span>
            ) : null}
            {error ? (
              <div className="mt-1 text-xs text-red-700">{error}</div>
            ) : null}
          </form>
        ) : (
          <span className="text-xs text-[var(--muted)]">Cerrado</span>
        )}
      </td>
    </tr>
  );
}

export function CloseHandoverForm({
  session,
  pendingCount,
}: {
  session: HandoverSession;
  pendingCount: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (session.status === "CERRADO") {
    return (
      <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-4 text-sm text-teal-900">
        Empalme cerrado el {formatDateCO(session.closed_at)}. Snapshot
        inmutable generado. Los cambios posteriores deben registrarse como
        ajustes.
      </div>
    );
  }

  return (
    <form
      className="space-y-3 rounded-xl border border-[var(--line)] bg-white p-4"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const result = await closeHandoverAction(session.id, fd);
          if (!result.ok) setError(result.error ?? "Error al cerrar");
        });
      }}
    >
      <p className="text-sm text-[var(--muted)]">
        El cierre <strong>no se bloquea</strong> por ítems pendientes
        {pendingCount > 0 ? ` (hay ${pendingCount} pendientes)` : ""}. Se
        guardará el % de calidad y un snapshot inmutable.
      </p>
      <textarea
        name="closing_notes"
        rows={3}
        placeholder="Observaciones de cierre"
        className="w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
      />
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Cerrando…" : "Cerrar empalme y crear snapshot"}
      </button>
    </form>
  );
}
