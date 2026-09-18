"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  addShareholderTransactionAction,
  createShareholderAction,
  softDeleteShareholderAction,
  updateShareholderAccountAction,
  updateShareholderAction,
} from "./actions";
import { Badge } from "@/components/ui/primitives";
import { formatCOP } from "@/lib/money";
import { formatDateCO, todayInBogota } from "@/lib/dates";
import {
  computeShareholderAccountBalance,
  shareholderBalanceLabel,
} from "@/lib/shareholders";
import type { VerificationStatus } from "@/types/domain";
import {
  useDebouncedCallback,
  autosaveLabel,
  type AutosaveState,
} from "@/lib/autosave";

export type ShareholderRow = {
  id: string;
  full_name: string;
  id_type: string;
  id_number: string;
  participation_pct: number | string;
  entry_date: string | null;
  registered_capital: number | string;
  notes: string | null;
  status: "ACTIVO" | "INACTIVO";
  verification_status: VerificationStatus;
  comments: string | null;
};

export type ShareholderAccountRow = {
  id: string;
  shareholder_id: string;
  opening_balance: number | string;
  notes: string | null;
};

export type ShareholderTxRow = {
  id: string;
  shareholder_account_id: string;
  transaction_date: string;
  description: string | null;
  debit: number | string;
  credit: number | string;
  nature: string;
};

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2";

function verificationTone(status: VerificationStatus) {
  if (status === "CONFIRMADO") return "ok" as const;
  if (status === "DECLARADO") return "warn" as const;
  return "danger" as const;
}

export function CreateShareholderForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-[var(--ink)] px-4 py-2.5 text-sm font-medium text-white"
      >
        Agregar socio
      </button>
    );
  }

  return (
    <form
      className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-5"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const result = await createShareholderAction(fd);
          if (!result.ok) setError(result.error ?? "Error");
          else setOpen(false);
        });
      }}
    >
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Nuevo socio</h3>
        <button
          type="button"
          className="text-sm text-[var(--muted)]"
          onClick={() => setOpen(false)}
        >
          Cancelar
        </button>
      </div>
      <ShareholderFields />
      <div className="grid gap-4 border-t border-[var(--line)] pt-4 md:grid-cols-2">
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">
            Saldo inicial cuenta socio ↔ sociedad (COP)
          </span>
          <input
            name="opening_balance"
            defaultValue="0"
            className={inputClass}
            placeholder="Positivo = Candela le debe al socio"
          />
          <span className="mt-1 block text-xs text-[var(--muted)]">
            Esto NO es participación accionaria ni un préstamo formal.
          </span>
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">
            Notas de la cuenta
          </span>
          <input name="account_notes" className={inputClass} />
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
        className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Guardando…" : "Guardar socio"}
      </button>
    </form>
  );
}

function ShareholderFields({
  shareholder,
}: {
  shareholder?: ShareholderRow;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <label className="block text-sm md:col-span-2">
        <span className="mb-1.5 block text-[var(--muted)]">Nombre *</span>
        <input
          name="full_name"
          required
          defaultValue={shareholder?.full_name ?? ""}
          className={inputClass}
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-[var(--muted)]">Tipo ID *</span>
        <select
          name="id_type"
          defaultValue={shareholder?.id_type ?? "CC"}
          className={inputClass}
        >
          <option value="CC">CC</option>
          <option value="CE">CE</option>
          <option value="NIT">NIT</option>
          <option value="PASAPORTE">PASAPORTE</option>
          <option value="OTRO">OTRO</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-[var(--muted)]">Identificación *</span>
        <input
          name="id_number"
          required
          defaultValue={shareholder?.id_number ?? ""}
          className={inputClass}
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-[var(--muted)]">Participación % *</span>
        <input
          name="participation_pct"
          required
          defaultValue={
            shareholder ? String(shareholder.participation_pct) : ""
          }
          className={inputClass}
          placeholder="ej. 50"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-[var(--muted)]">Fecha ingreso</span>
        <input
          type="date"
          name="entry_date"
          defaultValue={shareholder?.entry_date ?? ""}
          className={inputClass}
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-[var(--muted)]">
          Capital registrado (COP)
        </span>
        <input
          name="registered_capital"
          defaultValue={
            shareholder ? String(shareholder.registered_capital) : "0"
          }
          className={inputClass}
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-[var(--muted)]">Estado</span>
        <select
          name="status"
          defaultValue={shareholder?.status ?? "ACTIVO"}
          className={inputClass}
        >
          <option value="ACTIVO">ACTIVO</option>
          <option value="INACTIVO">INACTIVO</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-[var(--muted)]">Verificación</span>
        <select
          name="verification_status"
          defaultValue={shareholder?.verification_status ?? "PENDIENTE"}
          className={inputClass}
        >
          <option value="PENDIENTE">PENDIENTE</option>
          <option value="DECLARADO">DECLARADO</option>
          <option value="CONFIRMADO">CONFIRMADO</option>
        </select>
      </label>
      <label className="block text-sm md:col-span-2">
        <span className="mb-1.5 block text-[var(--muted)]">Observaciones</span>
        <textarea
          name="notes"
          rows={2}
          defaultValue={shareholder?.notes ?? ""}
          className={inputClass}
        />
      </label>
      <label className="block text-sm md:col-span-2">
        <span className="mb-1.5 block text-[var(--muted)]">
          Comentarios de verificación
        </span>
        <input
          name="comments"
          defaultValue={shareholder?.comments ?? ""}
          className={inputClass}
        />
      </label>
    </div>
  );
}

export function ShareholderCard({
  shareholder,
  account,
  transactions,
}: {
  shareholder: ShareholderRow;
  account: ShareholderAccountRow | null;
  transactions: ShareholderTxRow[];
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autosave, setAutosave] = useState<AutosaveState>("idle");
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const readyRef = useRef(false);

  const scheduleAutosave = useDebouncedCallback(() => {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    setAutosave("saving");
    setError(null);
    startTransition(async () => {
      const result = await updateShareholderAction(shareholder.id, fd);
      if (!result.ok) {
        setError(result.error ?? "Error");
        setAutosave("error");
      } else {
        setAutosave("saved");
      }
    });
  }, 800);

  useEffect(() => {
    if (editing) readyRef.current = true;
  }, [editing]);

  function onFieldChange() {
    if (!readyRef.current) return;
    setAutosave("dirty");
    scheduleAutosave();
  }

  const balance = account
    ? computeShareholderAccountBalance({
        openingBalance: account.opening_balance,
        debits: transactions.map((t) => t.debit),
        credits: transactions.map((t) => t.credit),
      })
    : null;
  const balanceMeta = balance
    ? shareholderBalanceLabel(balance)
    : { label: "Sin cuenta" as const, tone: "neutral" as const };

  return (
    <div className="rounded-xl border border-[var(--line)] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-xl font-semibold">
            {shareholder.full_name}
          </h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {shareholder.id_type} {shareholder.id_number}
            {shareholder.entry_date
              ? ` · Ingreso ${formatDateCO(shareholder.entry_date)}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="accent">{Number(shareholder.participation_pct)}%</Badge>
          <Badge tone={verificationTone(shareholder.verification_status)}>
            {shareholder.verification_status}
          </Badge>
          <Badge tone={shareholder.status === "ACTIVO" ? "ok" : "neutral"}>
            {shareholder.status}
          </Badge>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <div className="text-xs text-[var(--muted)]">Capital registrado</div>
          <div className="mt-1 font-medium">
            {formatCOP(shareholder.registered_capital)}
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <div className="text-xs text-[var(--muted)]">Cuenta socio ↔ sociedad</div>
          <div className="mt-1 font-medium">
            {balance ? formatCOP(balance.abs()) : "—"}
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <div className="text-xs text-[var(--muted)]">Posición</div>
          <div className="mt-1">
            <Badge tone={balanceMeta.tone}>{balanceMeta.label}</Badge>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs font-medium"
        >
          {editing ? "Cerrar edición" : "Editar socio"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm("¿Desactivar / eliminar este socio?")) return;
            startTransition(async () => {
              const result = await softDeleteShareholderAction(shareholder.id);
              if (!result.ok) setError(result.error ?? "Error");
            });
          }}
          className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700"
        >
          Desactivar
        </button>
      </div>

      {editing ? (
        <form
          ref={formRef}
          className="mt-4 space-y-4 border-t border-[var(--line)] pt-4"
          onChange={onFieldChange}
          action={(fd) => {
            setError(null);
            startTransition(async () => {
              const result = await updateShareholderAction(shareholder.id, fd);
              if (!result.ok) setError(result.error ?? "Error");
              else setAutosave("saved");
            });
          }}
        >
          <ShareholderFields shareholder={shareholder} />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              {pending ? "Guardando…" : "Guardar ahora"}
            </button>
            {autosaveLabel(autosave) ? (
              <span className="text-xs text-[var(--muted)]">
                {autosaveLabel(autosave)}
              </span>
            ) : (
              <span className="text-xs text-[var(--muted)]">
                Autoguarda al editar · puedes corregir después
              </span>
            )}
          </div>
        </form>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm text-red-700">{error}</p>
      ) : null}

      {account ? (
        <div className="mt-5 space-y-4 border-t border-[var(--line)] pt-4">
          <h4 className="text-sm font-medium">Cuenta socio ↔ sociedad</h4>
          <form
            className="grid gap-3 md:grid-cols-3"
            action={(fd) => {
              setError(null);
              startTransition(async () => {
                const result = await updateShareholderAccountAction(
                  account.id,
                  fd,
                );
                if (!result.ok) setError(result.error ?? "Error");
              });
            }}
          >
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--muted)]">
                Saldo inicial
              </span>
              <input
                name="opening_balance"
                defaultValue={String(account.opening_balance)}
                className={inputClass}
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="mb-1 block text-[var(--muted)]">Notas</span>
              <input
                name="notes"
                defaultValue={account.notes ?? ""}
                className={inputClass}
              />
            </label>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md border border-[var(--line)] px-3 py-2 text-xs font-medium md:col-span-3"
            >
              Actualizar saldo inicial
            </button>
          </form>

          <form
            className="grid gap-3 rounded-lg bg-slate-50 p-3 md:grid-cols-2"
            action={(fd) => {
              setError(null);
              startTransition(async () => {
                const result = await addShareholderTransactionAction(
                  account.id,
                  fd,
                );
                if (!result.ok) setError(result.error ?? "Error");
              });
            }}
          >
            <p className="text-xs text-[var(--muted)] md:col-span-2">
              Movimiento de cuenta (no es préstamo formal). Crédito = aumenta lo
              que Candela debe; Débito = lo reduce.
            </p>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--muted)]">Fecha</span>
              <input
                type="date"
                name="transaction_date"
                required
                defaultValue={todayInBogota()}
                className={inputClass}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--muted)]">Monto</span>
              <input name="amount" required className={inputClass} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--muted)]">Tipo</span>
              <select name="side" defaultValue="credit" className={inputClass}>
                <option value="credit">Crédito (Candela debe más)</option>
                <option value="debit">Débito (Candela debe menos)</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--muted)]">Naturaleza</span>
              <select name="nature" defaultValue="OTRO" className={inputClass}>
                <option value="OTRO">OTRO</option>
                <option value="ANTICIPO">ANTICIPO</option>
                <option value="CAPITAL">CAPITAL</option>
                <option value="PRESTAMO">PRESTAMO (solo marca; usar módulo Préstamos)</option>
              </select>
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="mb-1 block text-[var(--muted)]">Descripción</span>
              <input name="description" className={inputClass} />
            </label>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-[var(--ink)] px-3 py-2 text-xs font-medium text-white md:col-span-2 disabled:opacity-60"
            >
              Registrar movimiento
            </button>
          </form>

          {transactions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase text-[var(--muted)]">
                  <tr>
                    <th className="py-2 pr-3">Fecha</th>
                    <th className="py-2 pr-3">Descripción</th>
                    <th className="py-2 pr-3">Débito</th>
                    <th className="py-2 pr-3">Crédito</th>
                    <th className="py-2">Naturaleza</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="border-t border-[var(--line)]">
                      <td className="py-2 pr-3">
                        {formatDateCO(tx.transaction_date)}
                      </td>
                      <td className="py-2 pr-3">{tx.description || "—"}</td>
                      <td className="py-2 pr-3">
                        {Number(tx.debit) > 0 ? formatCOP(tx.debit) : "—"}
                      </td>
                      <td className="py-2 pr-3">
                        {Number(tx.credit) > 0 ? formatCOP(tx.credit) : "—"}
                      </td>
                      <td className="py-2">{tx.nature}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
    </div>
  );
}
