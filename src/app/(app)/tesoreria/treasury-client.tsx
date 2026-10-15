"use client";

import { useState, useTransition, type ReactNode } from "react";
import {
  confirmAcquiringBankSettlementAction,
  createBankAccountAction,
  createTreasuryTransferAction,
  reassignBankTransactionAccountAction,
  softDeleteBankAccountAction,
  updateBankAccountAction,
  updateCashFloatTargetAction,
  upsertBankBalanceSnapshotAction,
} from "./actions";
import { Badge } from "@/components/ui/primitives";
import { formatCOP } from "@/lib/money";
import { formatDateCO, todayInBogota } from "@/lib/dates";
import {
  bankKindLabel,
  findCashFloatAccount,
  fundPurposeLabel,
} from "@/lib/treasury";
import type { VerificationStatus } from "@/types/domain";
import { CollapsiblePanel } from "./treasury-panels";
import { cn } from "@/lib/utils";

export type BankAccountRow = {
  id: string;
  bank_name: string;
  account_kind: "BANCO" | "CAJA" | "PASARELA" | "OTRO";
  fund_purpose?: "VENTAS" | "EMPRESA" | null;
  account_type: string | null;
  masked_number: string | null;
  holder_name: string | null;
  is_active: boolean;
  notes: string | null;
  is_cash_float?: boolean;
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
  settlement_status?: string | null;
  settled_at?: string | null;
  parent_transaction_id?: string | null;
};

function movementLabel(tx: BankTransactionRow): string {
  if (tx.description?.trim()) return tx.description.trim();
  if (tx.category === "INGRESO_CAJA") return "Ingreso cierre caja (efectivo)";
  if (tx.category === "INGRESO_ADQUIRENCIA")
    return "Ingreso cierre caja (adquirencia)";
  if (tx.category === "INGRESO_TRANSFERENCIA")
    return "Ingreso cierre caja (transferencia / QR)";
  if (tx.category === "TRASPASO") return "Traspaso entre cuentas";
  if (tx.category === "PAGO") return "Pago de solicitud";
  if (tx.category === "PRESTAMO_SOCIO") return "Ingreso por préstamo de socio";
  if (tx.origin === "tesoreria.caja") return "Cierre de caja";
  if (tx.origin === "tesoreria.traspaso") return "Traspaso entre cuentas";
  if (tx.origin === "solicitudes-pago") return "Solicitud de pago";
  if (tx.origin === "prestamos") return "Ingreso por préstamo de socio";
  return tx.category || tx.origin || "Movimiento";
}

export function PendingAcquiringSettlementsPanel({
  pending,
  accounts,
  canConfirm,
  defaultBankDate,
}: {
  pending: BankTransactionRow[];
  accounts: BankAccountRow[];
  canConfirm: boolean;
  defaultBankDate: string;
}) {
  const accountName = (id: string) =>
    accounts.find((a) => a.id === id)?.bank_name ?? "Cuenta";
  const total = pending.reduce((acc, tx) => acc + Number(tx.credit || 0), 0);

  if (pending.length === 0) return null;

  return (
    <WorkSectionLike
      title="Adquirencia pendiente de banco"
      description="Avaladas en cierre, pero aún no vistas en el extracto. Confirme cada abono (total o parcial) con la fecha real del banco."
      badge={
        <Badge tone="warn">
          {pending.length} · {formatCOP(total)}
        </Badge>
      }
    >
      <ul className="space-y-3">
        {pending.map((tx) => (
          <PendingAcquiringRow
            key={tx.id}
            tx={tx}
            accountLabel={accountName(tx.bank_account_id)}
            canConfirm={canConfirm}
            defaultBankDate={defaultBankDate}
          />
        ))}
      </ul>
    </WorkSectionLike>
  );
}

/** Contenedor liviano alineado al estilo de WorkSection sin acoplar el layout. */
function WorkSectionLike({
  title,
  description,
  badge,
  children,
}: {
  title: string;
  description: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id="adquirencia-pendiente"
      className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
        </div>
        {badge}
      </div>
      {children}
    </section>
  );
}

function PendingAcquiringRow({
  tx,
  accountLabel,
  canConfirm,
  defaultBankDate,
}: {
  tx: BankTransactionRow;
  accountLabel: string;
  canConfirm: boolean;
  defaultBankDate: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const credit = Number(tx.credit || 0);

  return (
    <li className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-[var(--ink)]">{movementLabel(tx)}</p>
          <p className="mt-0.5 text-sm text-[var(--muted)]">
            {accountLabel} · Cierre {formatDateCO(tx.transaction_date)}
            {tx.reference ? ` · ${tx.reference}` : ""}
          </p>
        </div>
        <p className="shrink-0 text-sm font-semibold text-[var(--ink)]">
          {formatCOP(credit)}
        </p>
      </div>
      {canConfirm ? (
        <form
          className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
          action={(fd) => {
            setError(null);
            startTransition(async () => {
              const result = await confirmAcquiringBankSettlementAction(
                tx.id,
                fd,
              );
              if (!result.ok) setError(result.error ?? "No se pudo confirmar");
            });
          }}
        >
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-[var(--muted)]">
              Monto a ingresar
            </span>
            <input
              name="amount"
              required
              defaultValue={String(credit)}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-[var(--muted)]">
              Fecha en extracto
            </span>
            <input
              type="date"
              name="transaction_date"
              required
              defaultValue={defaultBankDate}
              className={inputClass}
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-md bg-[var(--solid)] px-3 py-2 text-xs font-medium text-[var(--on-solid)] disabled:opacity-60 sm:w-auto"
            >
              {pending ? "Guardando…" : "Ingresar al banco"}
            </button>
          </div>
        </form>
      ) : (
        <p className="mt-2 text-xs text-[var(--muted)]">
          Pendiente de liquidación bancaria (sin permiso para confirmar).
        </p>
      )}
      {error ? (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
    </li>
  );
}

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] outline-none ring-[var(--accent)] focus:ring-2";

function verificationTone(status: VerificationStatus) {
  if (status === "CONFIRMADO") return "ok" as const;
  if (status === "DECLARADO") return "warn" as const;
  return "danger" as const;
}

export function CashFloatAndTransferPanel({
  cashFloatTarget,
  accounts,
  availableByAccount,
  canManage,
  defaultCutoff,
}: {
  cashFloatTarget: number | string;
  accounts: BankAccountRow[];
  availableByAccount: Record<string, string>;
  canManage: boolean;
  defaultCutoff: string | null;
}) {
  const active = accounts.filter((a) => a.is_active);
  const floatAcc = findCashFloatAccount(active);
  const target = Number(cashFloatTarget ?? 0);
  const current = floatAcc
    ? Number(availableByAccount[floatAcc.id] ?? 0)
    : 0;
  const gap = Math.max(0, target - current);
  const short = target > 0 && current + 0.009 < target;

  return (
    <div className="space-y-3">
      <CollapsiblePanel
        title="Base / flotante"
        description="Cuenta de efectivo operativo: cambio y gastos autorizados. El cierre reporta el restante y debe cuadrar con este saldo."
        summary={
          <>
            Meta {formatCOP(target)} · Actual{" "}
            <strong className="text-[var(--ink)]">{formatCOP(current)}</strong>
            {short ? ` · Faltan ${formatCOP(gap)}` : ""}
          </>
        }
        defaultOpen={target <= 0 || short || !floatAcc}
        badge={
          target <= 0 ? (
            <Badge tone="warn">Sin meta</Badge>
          ) : short ? (
            <Badge tone="danger">Incompleta</Badge>
          ) : (
            <Badge tone="ok">Al día</Badge>
          )
        }
      >
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-[var(--surface-muted)] px-3 py-2 text-sm">
            <p className="text-xs text-[var(--muted)]">Meta</p>
            <p className="mt-1 font-medium">{formatCOP(target)}</p>
          </div>
          <div className="rounded-lg bg-[var(--surface-muted)] px-3 py-2 text-sm">
            <p className="text-xs text-[var(--muted)]">Saldo actual (cuenta Base)</p>
            <p className="mt-1 font-medium">{formatCOP(current)}</p>
          </div>
          <div
            className={cn(
              "rounded-lg px-3 py-2 text-sm",
              short ? "bg-[var(--gold-soft)]" : "bg-[var(--surface-muted)]",
            )}
          >
            <p className="text-xs text-[var(--muted)]">Para llegar a la meta</p>
            <p className="mt-1 font-medium">{formatCOP(gap)}</p>
          </div>
        </div>
        <p className="mb-4 text-sm text-[var(--muted)]">
          Si se paga un gasto desde Base, el saldo baja. Recargue con un
          traspaso hacia Base desde banco o caja de ventas.
        </p>
        {canManage ? (
          <div className="space-y-4">
            <CashFloatTargetForm defaultValue={target} />
            {floatAcc && current <= 0 && target > 0 ? (
              <RegisterFloatOpeningForm
                accountId={floatAcc.id}
                defaultAmount={target}
                defaultCutoff={defaultCutoff}
              />
            ) : null}
          </div>
        ) : (
          <p className="text-sm">
            Meta {formatCOP(target)} · Actual {formatCOP(current)}
          </p>
        )}
      </CollapsiblePanel>

      {canManage && active.length >= 2 ? (
        <CollapsiblePanel
          title="Traspaso entre cuentas"
          description="Incluye recargar Base (destino = Base / flotante)."
          summary={
            short
              ? `Sugerido: traspasar ${formatCOP(gap)} → Base`
              : "Origen → destino · valida disponible"
          }
          defaultOpen={short}
        >
          <TreasuryTransferForm
            accounts={active}
            availableByAccount={availableByAccount}
            defaultAmount={short ? String(gap) : ""}
            preferFloatDestination
          />
        </CollapsiblePanel>
      ) : null}
    </div>
  );
}

function CashFloatTargetForm({ defaultValue }: { defaultValue: number }) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
      action={(fd) => {
        setError(null);
        setSaved(false);
        startTransition(async () => {
          const result = await updateCashFloatTargetAction(fd);
          if (!result.ok) setError(result.error ?? "Error");
          else setSaved(true);
        });
      }}
    >
      <label className="block text-sm">
        <span className="mb-1.5 block text-[var(--muted)]">
          Meta de base (COP)
        </span>
        <input
          name="cash_float_target"
          required
          inputMode="decimal"
          defaultValue={String(defaultValue || "")}
          placeholder="Ej. 300000"
          className={inputClass}
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--solid)] px-4 py-2.5 text-sm font-medium text-[var(--on-solid)] disabled:opacity-60"
      >
        {pending ? "Guardando…" : "Guardar meta"}
      </button>
      {saved ? (
        <p className="text-xs text-teal-700 sm:col-span-2">
          Meta guardada · se creó/confirmó la cuenta Base
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 sm:col-span-2">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function RegisterFloatOpeningForm({
  accountId,
  defaultAmount,
  defaultCutoff,
}: {
  accountId: string;
  defaultAmount: number;
  defaultCutoff: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-muted)] p-4"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const result = await upsertBankBalanceSnapshotAction(accountId, fd);
          if (!result.ok) setError(result.error ?? "Error");
        });
      }}
    >
      <p className="text-sm font-medium">¿La base ya está en el local?</p>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Registre el saldo inicial de la cuenta Base (no inventa plata: declara
        lo que ya hay físicamente).
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3 sm:items-end">
        <label className="block text-sm">
          <span className="mb-1 block text-[var(--muted)]">Fecha</span>
          <input
            type="date"
            name="cutoff_date"
            required
            defaultValue={defaultCutoff ?? todayInBogota()}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-[var(--muted)]">Monto en local</span>
          <input
            name="opening_balance"
            required
            defaultValue={String(defaultAmount)}
            className={inputClass}
          />
        </label>
        <input type="hidden" name="verification_status" value="CONFIRMADO" />
        <input type="hidden" name="source" value="Base física en local" />
        <input type="hidden" name="comments" value="Saldo inicial de flotante" />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium disabled:opacity-60"
        >
          {pending ? "Registrando…" : "Registrar saldo inicial"}
        </button>
      </div>
      {error ? (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function TreasuryTransferForm({
  accounts,
  availableByAccount,
  defaultAmount = "",
  preferFloatDestination = false,
}: {
  accounts: BankAccountRow[];
  availableByAccount: Record<string, string>;
  defaultAmount?: string;
  preferFloatDestination?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const floatAcc = findCashFloatAccount(accounts);
  const defaultFrom =
    accounts.find((a) => a.account_kind === "BANCO" && !a.is_cash_float)?.id ??
    accounts.find((a) => !a.is_cash_float)?.id ??
    accounts[0]?.id ??
    "";
  const defaultTo =
    preferFloatDestination && floatAcc
      ? floatAcc.id
      : accounts.find((a) => a.account_kind === "CAJA" && !a.is_cash_float)?.id ??
        accounts.find((a) => a.id !== defaultFrom)?.id ??
        "";

  return (
    <form
      className="grid gap-3 md:grid-cols-2"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const result = await createTreasuryTransferAction(fd);
          if (!result.ok) setError(result.error ?? "Error");
        });
      }}
    >
      <label className="block text-sm">
        <span className="mb-1.5 block text-[var(--muted)]">Desde *</span>
        <select
          name="from_account_id"
          required
          defaultValue={defaultFrom}
          className={inputClass}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.is_cash_float ? "Base · " : ""}
              {a.bank_name}
              {availableByAccount[a.id] !== undefined
                ? ` · disp. ${formatCOP(availableByAccount[a.id])}`
                : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-[var(--muted)]">Hacia *</span>
        <select
          name="to_account_id"
          required
          defaultValue={defaultTo}
          className={inputClass}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.is_cash_float ? "Base · " : ""}
              {a.bank_name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-[var(--muted)]">Monto *</span>
        <input
          name="amount"
          required
          inputMode="decimal"
          defaultValue={defaultAmount}
          placeholder="0"
          className={inputClass}
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-[var(--muted)]">Fecha</span>
        <input
          type="date"
          name="transfer_date"
          required
          defaultValue={todayInBogota()}
          className={inputClass}
        />
      </label>
      <label className="block text-sm md:col-span-2">
        <span className="mb-1.5 block text-[var(--muted)]">
          Nota (ej. recomponer base)
        </span>
        <input
          name="notes"
          defaultValue={preferFloatDestination ? "Recomponer base" : ""}
          placeholder="Recomponer base / remesa a banco…"
          className={inputClass}
        />
      </label>
      <input type="hidden" name="reference" value="" />
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 md:col-span-2">
          {error}
        </p>
      ) : null}
      <div className="md:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Traspasando…" : "Ejecutar traspaso"}
        </button>
      </div>
    </form>
  );
}

export function CreateBankAccountForm({
  defaultCutoff,
  embedded = false,
}: {
  defaultCutoff: string | null;
  embedded?: boolean;
}) {
  const [open, setOpen] = useState(embedded);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-[var(--solid)] px-4 py-2.5 text-sm font-medium text-[var(--on-solid)]"
      >
        Agregar cuenta
      </button>
    );
  }

  return (
    <form
      className={
        embedded
          ? "space-y-4"
          : "space-y-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5"
      }
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const result = await createBankAccountAction(fd);
          if (!result.ok) setError(result.error ?? "Error");
          else if (!embedded) setOpen(false);
        });
      }}
    >
      {!embedded ? (
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
      ) : null}
      <BankAccountFields />
      <div className="grid gap-4 border-t border-[var(--line)] pt-4 md:grid-cols-2">
        <p className="text-sm text-[var(--muted)] md:col-span-2">
          Saldo inicial a la fecha de inicio operativo (opcional al crear;
          editable después).
        </p>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Fecha</span>
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
        className="rounded-lg bg-[var(--solid)] px-5 py-2.5 text-sm font-medium text-[var(--on-solid)] disabled:opacity-60"
      >
        {pending ? "Guardando…" : "Guardar cuenta"}
      </button>
    </form>
  );
}

function BankAccountFields({ account }: { account?: BankAccountRow }) {
  const isFloat = Boolean(account?.is_cash_float);
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
      <label className="block text-sm md:col-span-2">
        <span className="mb-1.5 block text-[var(--muted)]">
          Uso de la cuenta *
        </span>
        {isFloat ? (
          <>
            <input type="hidden" name="fund_purpose" value="VENTAS" />
            <p className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] px-3 py-2 text-sm">
              <strong>Ventas</strong> — la Base/flotante siempre es operativa
              del local.
            </p>
          </>
        ) : (
          <select
            name="fund_purpose"
            required
            defaultValue={account?.fund_purpose ?? "VENTAS"}
            className={inputClass}
          >
            <option value="VENTAS">
              Ventas — entra al cierre de caja (efectivo, datáfono, QR)
            </option>
            <option value="EMPRESA">
              Empresa — préstamos, inyecciones y recursos ajenos a ventas
            </option>
          </select>
        )}
        <span className="mt-1.5 block text-xs text-[var(--muted)]">
          Solo las de ventas reciben el aterrizaje del cierre. Las de empresa
          manejan plata que no viene de la operación del día.
        </span>
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
  accounts = [],
  canManage = true,
  cashFloatAtLocal = null,
  cashFloatDate = null,
}: {
  account: BankAccountRow;
  snapshot: BalanceSnapshotRow | null;
  defaultCutoff: string | null;
  availableBalance?: number | string;
  movements?: BankTransactionRow[];
  accounts?: BankAccountRow[];
  canManage?: boolean;
  cashFloatAtLocal?: number | null;
  cashFloatDate?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showMovements, setShowMovements] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const availableLabel =
    availableBalance !== undefined
      ? formatCOP(availableBalance)
      : snapshot
        ? formatCOP(snapshot.opening_balance)
        : "—";
  const showFloat =
    Boolean(account.is_cash_float) &&
    cashFloatAtLocal != null &&
    Number.isFinite(cashFloatAtLocal);

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-[var(--surface-muted)]"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-lg font-semibold">
              {account.bank_name}
            </h3>
            <Badge tone={account.is_active ? "ok" : "neutral"}>
              {account.is_active ? "Activa" : "Inactiva"}
            </Badge>
            <Badge
              tone={
                (account.fund_purpose ?? "VENTAS") === "EMPRESA"
                  ? "neutral"
                  : "info"
              }
            >
              {fundPurposeLabel(account.fund_purpose)}
            </Badge>
            {snapshot ? (
              <Badge tone={verificationTone(snapshot.verification_status)}>
                {snapshot.verification_status}
              </Badge>
            ) : (
              <Badge tone="danger">Sin corte</Badge>
            )}
          </div>
          <p className="mt-0.5 text-sm text-[var(--muted)]">
            {bankKindLabel(account.account_kind, {
              isCashFloat: Boolean(account.is_cash_float),
            })}
            {account.masked_number ? ` · ${account.masked_number}` : ""}
            {" · Disp. "}
            <span className="font-medium text-[var(--ink)]">
              {availableLabel}
            </span>
            {showFloat ? (
              <>
                {" · Meta "}
                <span className="font-medium text-[var(--ink)]">
                  {formatCOP(cashFloatAtLocal)}
                </span>
              </>
            ) : null}
            {!expanded ? ` · ${movements.length} mov.` : ""}
          </p>
        </div>
        <span className="shrink-0 text-xs font-medium text-[var(--muted)]">
          {expanded ? "Cerrar" : "Abrir"}
        </span>
      </button>

      {expanded ? (
        <div className="space-y-4 border-t border-[var(--line)] px-4 py-4">
          {account.holder_name ? (
            <p className="text-sm text-[var(--muted)]">
              Titular: {account.holder_name}
            </p>
          ) : null}

          <div
            className={
              showFloat
                ? "grid gap-3 md:grid-cols-5"
                : "grid gap-3 md:grid-cols-4"
            }
          >
            <div className="rounded-lg bg-[var(--surface-muted)] px-3 py-2 text-sm">
              <div className="text-xs text-[var(--muted)]">Disponible</div>
              <div className="mt-1 font-medium">{availableLabel}</div>
            </div>
            {showFloat ? (
              <div className="rounded-lg bg-[var(--gold-soft)] px-3 py-2 text-sm">
                <div className="text-xs text-[var(--warn)]">Base en el local</div>
                <div className="mt-1 font-medium text-[var(--warn)]">
                  {formatCOP(cashFloatAtLocal)}
                </div>
                <div className="mt-0.5 text-[10px] text-[var(--warn)]">
                  {cashFloatDate
                    ? `Cierre ${formatDateCO(cashFloatDate)}`
                    : "Oficial · se recompone con traspasos"}
                </div>
              </div>
            ) : null}
            <div className="rounded-lg bg-[var(--surface-muted)] px-3 py-2 text-sm">
              <div className="text-xs text-[var(--muted)]">Saldo a corte</div>
              <div className="mt-1 font-medium">
                {snapshot ? formatCOP(snapshot.opening_balance) : "—"}
              </div>
            </div>
            <div className="rounded-lg bg-[var(--surface-muted)] px-3 py-2 text-sm">
              <div className="text-xs text-[var(--muted)]">Fecha saldo inicial</div>
              <div className="mt-1 font-medium">
                {snapshot
                  ? formatDateCO(snapshot.cutoff_date)
                  : formatDateCO(defaultCutoff)}
              </div>
            </div>
            <div className="rounded-lg bg-[var(--surface-muted)] px-3 py-2 text-sm">
              <div className="text-xs text-[var(--muted)]">Fuente</div>
              <div className="mt-1 font-medium">{snapshot?.source || "—"}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
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
                      const result = await softDeleteBankAccountAction(
                        account.id,
                      );
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
            <AccountMovementsList
              movements={movements}
              accounts={accounts}
              canManage={canManage}
            />
          ) : null}

          {canManage && editing ? (
            <div className="space-y-5 border-t border-[var(--line)] pt-4">
              <form
                className="space-y-3"
                action={(fd) => {
                  setError(null);
                  setSaved(false);
                  startTransition(async () => {
                    const result = await updateBankAccountAction(
                      account.id,
                      fd,
                    );
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
                  className="rounded-md bg-[var(--solid)] px-3 py-1.5 text-xs font-medium text-[var(--on-solid)] disabled:opacity-60"
                >
                  Guardar cuenta
                </button>
              </form>

              <form
                className="space-y-3 rounded-lg bg-[var(--surface-muted)] p-3"
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
                <h4 className="text-sm font-medium">Saldo inicial</h4>
                <p className="text-xs text-[var(--muted)]">
                  Saldo a la fecha de inicio operativo. La evidencia PDF se
                  conectará con Documentos.
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block text-sm">
                    <span className="mb-1 block text-[var(--muted)]">
                      Fecha *
                    </span>
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
                    <span className="mb-1 block text-[var(--muted)]">
                      Saldo (COP) *
                    </span>
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
                    <span className="mb-1 block text-[var(--muted)]">
                      Verificación
                    </span>
                    <select
                      name="verification_status"
                      defaultValue={
                        snapshot?.verification_status ?? "PENDIENTE"
                      }
                      className={inputClass}
                    >
                      <option value="PENDIENTE">PENDIENTE</option>
                      <option value="DECLARADO">DECLARADO</option>
                      <option value="CONFIRMADO">CONFIRMADO</option>
                    </select>
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block text-[var(--muted)]">
                      Fuente / evidencia
                    </span>
                    <input
                      name="source"
                      defaultValue={snapshot?.source ?? ""}
                      className={inputClass}
                    />
                  </label>
                  <label className="block text-sm md:col-span-2">
                    <span className="mb-1 block text-[var(--muted)]">
                      Comentarios
                    </span>
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
            <p className="text-xs text-teal-700">Cambios guardados</p>
          ) : null}
          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function AccountMovementsList({
  movements,
  accounts = [],
  canManage = false,
  limit = 20,
}: {
  movements: BankTransactionRow[];
  accounts?: BankAccountRow[];
  canManage?: boolean;
  limit?: number;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const rows = movements.slice(0, limit);
  const activeAccounts = accounts.filter((a) => a.is_active);

  if (rows.length === 0) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-[var(--line)] px-3 py-4 text-sm text-[var(--muted)]">
        Sin movimientos posteriores al saldo de corte.
      </div>
    );
  }

  const canReassign = canManage && activeAccounts.length > 1;

  return (
    <div className="mt-4 space-y-2">
      <div className="overflow-x-auto rounded-lg border border-[var(--line)]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--surface-muted)] text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium">Concepto</th>
              <th className="px-3 py-2 font-medium">Ref.</th>
              <th className="px-3 py-2 text-right font-medium">Ingreso</th>
              <th className="px-3 py-2 text-right font-medium">Egreso</th>
              {canReassign ? (
                <th className="px-3 py-2 text-right font-medium"> </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {rows.map((tx) => {
              const credit = Number(tx.credit || 0);
              const debit = Number(tx.debit || 0);
              const isTransfer =
                tx.category === "TRASPASO" || tx.origin === "tesoreria.traspaso";
              const isEditing = editingId === tx.id;
              const isPendingBank = tx.settlement_status === "PENDIENTE_BANCO";
              const isSettledBank = tx.settlement_status === "INGRESADO";
              return (
                <tr
                  key={tx.id}
                  className={cn(
                    isEditing && "bg-[var(--surface-muted)]",
                    isPendingBank && "opacity-70",
                  )}
                >
                  <td className="whitespace-nowrap px-3 py-2 align-top text-[var(--muted)]">
                    {formatDateCO(tx.transaction_date)}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-[var(--ink)]">
                        {movementLabel(tx)}
                      </span>
                      {isPendingBank ? (
                        <Badge tone="warn">Pendiente banco</Badge>
                      ) : null}
                      {isSettledBank ? (
                        <Badge tone="ok">Ingresado</Badge>
                      ) : null}
                    </div>
                    {tx.origin ? (
                      <div className="text-xs text-[var(--muted)]">
                        {tx.origin}
                        {isPendingBank ? " · no suma al disponible" : ""}
                      </div>
                    ) : isPendingBank ? (
                      <div className="text-xs text-[var(--muted)]">
                        No suma al disponible
                      </div>
                    ) : null}
                    {isEditing ? (
                      <form
                        className="mt-2 flex flex-wrap items-end gap-2"
                        action={(fd) => {
                          setError(null);
                          startTransition(async () => {
                            const result =
                              await reassignBankTransactionAccountAction(
                                tx.id,
                                fd,
                              );
                            if (!result.ok) {
                              setError(result.error ?? "No se pudo corregir");
                              return;
                            }
                            setEditingId(null);
                          });
                        }}
                      >
                        <label className="min-w-[12rem] flex-1 text-xs">
                          <span className="mb-1 block text-[var(--muted)]">
                            Mover a cuenta
                          </span>
                          <select
                            name="bank_account_id"
                            required
                            defaultValue=""
                            className={inputClass}
                          >
                            <option value="" disabled>
                              Elija la cuenta correcta
                            </option>
                            {activeAccounts
                              .filter((a) => a.id !== tx.bank_account_id)
                              .map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.bank_name}
                                  {a.masked_number
                                    ? ` · ${a.masked_number}`
                                    : ""}
                                </option>
                              ))}
                          </select>
                        </label>
                        <button
                          type="submit"
                          disabled={pending}
                          className="rounded-md bg-[var(--solid)] px-3 py-2 text-xs font-medium text-[var(--on-solid)] disabled:opacity-60"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            setEditingId(null);
                            setError(null);
                          }}
                          className="rounded-md border border-[var(--line)] px-3 py-2 text-xs font-medium"
                        >
                          Cancelar
                        </button>
                      </form>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 align-top text-[var(--muted)]">
                    {tx.reference || "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 align-top text-right text-teal-700">
                    {credit > 0 ? formatCOP(credit) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 align-top text-right text-red-700">
                    {debit > 0 ? formatCOP(debit) : "—"}
                  </td>
                  {canReassign ? (
                    <td className="whitespace-nowrap px-3 py-2 align-top text-right">
                      {isTransfer ? (
                        <span className="text-xs text-[var(--muted)]">—</span>
                      ) : isEditing ? null : (
                        <button
                          type="button"
                          onClick={() => {
                            setError(null);
                            setEditingId(tx.id);
                          }}
                          className="text-xs font-medium text-[var(--accent)] hover:underline"
                        >
                          Cambiar cuenta
                        </button>
                      )}
                    </td>
                  ) : null}
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
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {canReassign ? (
        <p className="text-xs text-[var(--muted)]">
          Si cargó un pago a la cuenta equivocada, use «Cambiar cuenta». Los
          saldos se recalculan al guardar.
        </p>
      ) : null}
    </div>
  );
}
