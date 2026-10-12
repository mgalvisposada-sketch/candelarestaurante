"use client";

import { useState, useTransition } from "react";
import {
  createBankAccountAction,
  softDeleteBankAccountAction,
  updateBankAccountAction,
  upsertBankBalanceSnapshotAction,
} from "./actions";
import { Badge } from "@/components/ui/primitives";
import { formatCOP } from "@/lib/money";
import { formatDateCO } from "@/lib/dates";
import { bankKindLabel } from "@/lib/treasury";
import type { VerificationStatus } from "@/types/domain";

export type BankAccountRow = {
  id: string;
  bank_name: string;
  account_kind: "BANCO" | "CAJA" | "PASARELA" | "OTRO";
  account_type: string | null;
  masked_number: string | null;
  holder_name: string | null;
  is_active: boolean;
  notes: string | null;
};

export type BalanceSnapshotRow = {
  id: string;
  bank_account_id: string;
  cutoff_date: string;
  opening_balance: number | string;
  verification_status: VerificationStatus;
  comments: string | null;
  source: string | null;
};

export type BankTransactionRow = {
  id: string;
  bank_account_id: string;
  transaction_date: string;
  description: string | null;
  reference: string | null;
  debit: number | string;
  credit: number | string;
  origin: string | null;
  category: string | null;
  linked_entity_type: string | null;
};

function movementLabel(tx: BankTransactionRow): string {
  if (tx.description?.trim()) return tx.description.trim();
  if (tx.category === "INGRESO_CAJA") return "Ingreso cierre caja (efectivo)";
  if (tx.category === "INGRESO_ADQUIRENCIA")
    return "Ingreso cierre caja (adquirencia)";
  if (tx.category === "INGRESO_TRANSFERENCIA")
    return "Ingreso cierre caja (transferencia / QR)";
  if (tx.category === "PAGO") return "Pago de solicitud";
  if (tx.origin === "tesoreria.caja") return "Cierre de caja";
  if (tx.origin === "solicitudes-pago") return "Solicitud de pago";
  return tx.category || tx.origin || "Movimiento";
}

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2";

function verificationTone(status: VerificationStatus) {
  if (status === "CONFIRMADO") return "ok" as const;
  if (status === "DECLARADO") return "warn" as const;
  return "danger" as const;
}

export function CreateBankAccountForm({
  defaultCutoff,
}: {
  defaultCutoff: string | null;
}) {
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
        Agregar cuenta
      </button>
    );
  }

  return (
    <form
      className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-5"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const result = await createBankAccountAction(fd);
          if (!result.ok) setError(result.error ?? "Error");
          else setOpen(false);
        });
      }}
    >
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Nueva cuenta</h3>
        <button
          type="button"
          className="text-sm text-[var(--muted)]"
          onClick={() => setOpen(false)}
        >
          Cancelar
        </button>
      </div>
      <BankAccountFields />
      <div className="grid gap-4 border-t border-[var(--line)] pt-4 md:grid-cols-2">
        <p className="text-sm text-[var(--muted)] md:col-span-2">
          Saldo inicial a la fecha de corte (opcional al crear; editable después).
        </p>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Fecha de corte</span>
          <input
            type="date"
            name="cutoff_date"
            defaultValue={defaultCutoff ?? ""}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Saldo inicial (COP)</span>
          <input name="opening_balance" defaultValue="0" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Verificación</span>
          <select name="verification_status" defaultValue="PENDIENTE" className={inputClass}>
            <option value="PENDIENTE">PENDIENTE</option>
            <option value="DECLARADO">DECLARADO</option>
            <option value="CONFIRMADO">CONFIRMADO</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Fuente / evidencia</span>
          <input
            name="source"
            placeholder="Extracto, captura, declaración…"
            className={inputClass}
          />
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">Comentarios</span>
          <input name="comments" className={inputClass} />
        </label>
      </div>
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Guardando…" : "Guardar cuenta"}
      </button>
    </form>
  );
}

function BankAccountFields({ account }: { account?: BankAccountRow }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <label className="block text-sm md:col-span-2">
        <span className="mb-1.5 block text-[var(--muted)]">Nombre *</span>
        <input
          name="bank_name"
          required
          defaultValue={account?.bank_name ?? ""}
          placeholder="Bancolombia, Caja general, Wompi…"
          className={inputClass}
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-[var(--muted)]">Tipo *</span>
        <select
          name="account_kind"
          defaultValue={account?.account_kind ?? "BANCO"}
          className={inputClass}
        >
          <option value="BANCO">BANCO</option>
          <option value="CAJA">CAJA</option>
          <option value="PASARELA">PASARELA</option>
          <option value="OTRO">OTRO</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-[var(--muted)]">Tipo de cuenta</span>
        <input
          name="account_type"
          defaultValue={account?.account_type ?? ""}
          placeholder="Ahorros / Corriente"
          className={inputClass}
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-[var(--muted)]">Número enmascarado</span>
        <input
          name="masked_number"
          defaultValue={account?.masked_number ?? ""}
          placeholder="****1234"
          className={inputClass}
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-[var(--muted)]">Titular</span>
        <input
          name="holder_name"
          defaultValue={account?.holder_name ?? ""}
          className={inputClass}
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-[var(--muted)]">Estado</span>
        <select
          name="is_active"
          defaultValue={account?.is_active === false ? "false" : "true"}
          className={inputClass}
        >
          <option value="true">Activa</option>
          <option value="false">Inactiva</option>
        </select>
      </label>
      <label className="block text-sm md:col-span-2">
        <span className="mb-1.5 block text-[var(--muted)]">Observaciones</span>
        <textarea
          name="notes"
          rows={2}
          defaultValue={account?.notes ?? ""}
          className={inputClass}
        />
      </label>
    </div>
  );
}

export function BankAccountCard({
  account,
  snapshot,
  defaultCutoff,
  availableBalance,
  movements = [],
  canManage = true,
}: {
  account: BankAccountRow;
  snapshot: BalanceSnapshotRow | null;
  defaultCutoff: string | null;
  availableBalance?: number | string;
  movements?: BankTransactionRow[];
  canManage?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [showMovements, setShowMovements] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-xl border border-[var(--line)] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-xl font-semibold">{account.bank_name}</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {bankKindLabel(account.account_kind)}
            {account.account_type ? ` · ${account.account_type}` : ""}
            {account.masked_number ? ` · ${account.masked_number}` : ""}
          </p>
          {account.holder_name ? (
            <p className="text-sm text-[var(--muted)]">Titular: {account.holder_name}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={account.is_active ? "ok" : "neutral"}>
            {account.is_active ? "Activa" : "Inactiva"}
          </Badge>
          {snapshot ? (
            <Badge tone={verificationTone(snapshot.verification_status)}>
              {snapshot.verification_status}
            </Badge>
          ) : (
            <Badge tone="danger">Sin saldo de corte</Badge>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm md:col-span-1">
          <div className="text-xs text-[var(--muted)]">Disponible</div>
          <div className="mt-1 font-medium">
            {availableBalance !== undefined
              ? formatCOP(availableBalance)
              : snapshot
                ? formatCOP(snapshot.opening_balance)
                : "—"}
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <div className="text-xs text-[var(--muted)]">Saldo a corte</div>
          <div className="mt-1 font-medium">
            {snapshot ? formatCOP(snapshot.opening_balance) : "—"}
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <div className="text-xs text-[var(--muted)]">Fecha de corte</div>
          <div className="mt-1 font-medium">
            {snapshot ? formatDateCO(snapshot.cutoff_date) : formatDateCO(defaultCutoff)}
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <div className="text-xs text-[var(--muted)]">Fuente</div>
          <div className="mt-1 font-medium">{snapshot?.source || "—"}</div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setShowMovements((v) => !v)}
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs font-medium"
        >
          {showMovements
            ? "Ocultar movimientos"
            : `Movimientos (${movements.length})`}
        </button>
        {canManage ? (
          <>
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs font-medium"
            >
              {editing ? "Cerrar edición" : "Editar cuenta / saldo"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!confirm("¿Desactivar esta cuenta?")) return;
                startTransition(async () => {
                  const result = await softDeleteBankAccountAction(account.id);
                  if (!result.ok) setError(result.error ?? "Error");
                });
              }}
              className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700"
            >
              Desactivar
            </button>
          </>
        ) : null}
      </div>

      {showMovements ? (
        <AccountMovementsList movements={movements} />
      ) : null}

      {canManage && editing ? (
        <div className="mt-4 space-y-5 border-t border-[var(--line)] pt-4">
          <form
            className="space-y-3"
            action={(fd) => {
              setError(null);
              setSaved(false);
              startTransition(async () => {
                const result = await updateBankAccountAction(account.id, fd);
                if (!result.ok) setError(result.error ?? "Error");
                else setSaved(true);
              });
            }}
          >
            <h4 className="text-sm font-medium">Datos de la cuenta</h4>
            <BankAccountFields account={account} />
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-[var(--ink)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
            >
              Guardar cuenta
            </button>
          </form>

          <form
            className="space-y-3 rounded-lg bg-slate-50 p-3"
            action={(fd) => {
              setError(null);
              setSaved(false);
              startTransition(async () => {
                const result = await upsertBankBalanceSnapshotAction(
                  account.id,
                  fd,
                );
                if (!result.ok) setError(result.error ?? "Error");
                else setSaved(true);
              });
            }}
          >
            <h4 className="text-sm font-medium">Saldo inicial (empalme)</h4>
            <p className="text-xs text-[var(--muted)]">
              opening_balance a la fecha de corte. La carga de PDF de evidencia
              se conectará con Documentos; por ahora registre la fuente.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-[var(--muted)]">Fecha de corte *</span>
                <input
                  type="date"
                  name="cutoff_date"
                  required
                  defaultValue={
                    snapshot?.cutoff_date ?? defaultCutoff ?? ""
                  }
                  className={inputClass}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-[var(--muted)]">Saldo (COP) *</span>
                <input
                  name="opening_balance"
                  required
                  defaultValue={
                    snapshot ? String(snapshot.opening_balance) : "0"
                  }
                  className={inputClass}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-[var(--muted)]">Verificación</span>
                <select
                  name="verification_status"
                  defaultValue={snapshot?.verification_status ?? "PENDIENTE"}
                  className={inputClass}
                >
                  <option value="PENDIENTE">PENDIENTE</option>
                  <option value="DECLARADO">DECLARADO</option>
                  <option value="CONFIRMADO">CONFIRMADO</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-[var(--muted)]">Fuente / evidencia</span>
                <input
                  name="source"
                  defaultValue={snapshot?.source ?? ""}
                  className={inputClass}
                />
              </label>
              <label className="block text-sm md:col-span-2">
                <span className="mb-1 block text-[var(--muted)]">Comentarios</span>
                <textarea
                  name="comments"
                  rows={2}
                  defaultValue={snapshot?.comments ?? ""}
                  className={inputClass}
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
            >
              Guardar saldo de corte
            </button>
          </form>
        </div>
      ) : null}

      {saved ? (
        <p className="mt-3 text-xs text-teal-700">Cambios guardados</p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function AccountMovementsList({
  movements,
  limit = 20,
}: {
  movements: BankTransactionRow[];
  limit?: number;
}) {
  const rows = movements.slice(0, limit);
  if (rows.length === 0) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-[var(--line)] px-3 py-4 text-sm text-[var(--muted)]">
        Sin movimientos posteriores al saldo de corte.
      </div>
    );
  }

  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--line)]">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
          <tr>
            <th className="px-3 py-2 font-medium">Fecha</th>
            <th className="px-3 py-2 font-medium">Concepto</th>
            <th className="px-3 py-2 font-medium">Ref.</th>
            <th className="px-3 py-2 text-right font-medium">Ingreso</th>
            <th className="px-3 py-2 text-right font-medium">Egreso</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--line)]">
          {rows.map((tx) => {
            const credit = Number(tx.credit || 0);
            const debit = Number(tx.debit || 0);
            return (
              <tr key={tx.id}>
                <td className="whitespace-nowrap px-3 py-2 text-[var(--muted)]">
                  {formatDateCO(tx.transaction_date)}
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium text-[var(--ink)]">
                    {movementLabel(tx)}
                  </div>
                  {tx.origin ? (
                    <div className="text-xs text-[var(--muted)]">{tx.origin}</div>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-[var(--muted)]">
                  {tx.reference || "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-teal-700">
                  {credit > 0 ? formatCOP(credit) : "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-red-700">
                  {debit > 0 ? formatCOP(debit) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {movements.length > limit ? (
        <p className="border-t border-[var(--line)] px-3 py-2 text-xs text-[var(--muted)]">
          Mostrando los {limit} más recientes de {movements.length}.
        </p>
      ) : null}
    </div>
  );
}
