"use client";

import { useMemo, useState, useTransition } from "react";
import {
  approveCashDailyCloseAction,
  rejectCashDailyCloseAction,
  saveAndSubmitCashDailyCloseAction,
  submitCashDailyCloseAction,
  upsertCashDailyCloseDraftAction,
} from "./actions";
import { notifyPendingActionsChanged } from "@/components/layout/pending-actions-inbox";
import { Badge } from "@/components/ui/primitives";
import { formatCOP, money } from "@/lib/money";
import { formatDateCO, todayInBogota } from "@/lib/dates";
import { contrastDelta } from "@/lib/treasury-balance";
import { cn } from "@/lib/utils";
import type { BankAccountRow } from "./treasury-client";

export type CashDailyCloseRow = {
  id: string;
  business_date: string;
  status: "BORRADOR" | "EN_REVISION" | "AVALADO" | "RECHAZADO";
  cash_float: number | string;
  cash_sales: number | string;
  card_sales: number | string;
  transfer_sales: number | string;
  cash_account_id: string | null;
  card_account_id: string | null;
  transfer_account_id: string | null;
  pos_cash_amount: number | string | null;
  pos_card_amount: number | string | null;
  pos_transfer_amount: number | string | null;
  bank_card_amount: number | string | null;
  cash_credited: number | string | null;
  card_credited: number | string | null;
  transfer_credited: number | string | null;
  rejection_reason: string | null;
  comments: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
};

function daySalesTotal(close: Pick<
  CashDailyCloseRow,
  "cash_sales" | "card_sales" | "transfer_sales"
>) {
  return money(close.cash_sales)
    .plus(money(close.card_sales))
    .plus(money(close.transfer_sales ?? 0));
}

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2.5 text-base tabular-nums outline-none ring-[var(--accent)] focus:ring-2";

const inputLgClass =
  "w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3.5 text-xl font-semibold tabular-nums tracking-tight outline-none ring-[var(--accent)] focus:ring-2";

function statusLabel(status: CashDailyCloseRow["status"]) {
  const map = {
    BORRADOR: "Borrador",
    EN_REVISION: "Esperando aval",
    AVALADO: "Cerrado y avalado",
    RECHAZADO: "Devuelto al local",
  };
  return map[status];
}

function statusTone(status: CashDailyCloseRow["status"]) {
  if (status === "AVALADO") return "ok" as const;
  if (status === "EN_REVISION") return "warn" as const;
  if (status === "RECHAZADO") return "danger" as const;
  return "neutral" as const;
}

function accountLabel(accounts: BankAccountRow[], id: string | null) {
  if (!id) return "—";
  const a = accounts.find((x) => x.id === id);
  if (!a) return "—";
  return `${a.bank_name}${a.masked_number ? ` · ${a.masked_number}` : ""}`;
}

function parseAmount(raw: string): number {
  const n = Number(String(raw).replace(/,/g, "").trim());
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function MatchChip({
  declared,
  reference,
}: {
  declared: number | string;
  reference: string;
}) {
  if (!reference.trim()) {
    return (
      <span className="text-xs text-[var(--muted)]">Escriba lo del POS</span>
    );
  }
  const delta = contrastDelta(declared, reference);
  if (!delta) return null;
  const n = delta.toNumber();
  if (n === 0) {
    return (
      <span className="inline-flex rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
        Cuadra
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
        Math.abs(n) > 5000
          ? "bg-red-50 text-red-800"
          : "bg-amber-50 text-amber-900",
      )}
    >
      {n > 0 ? "Sobra en local" : "Falta en local"} {formatCOP(Math.abs(n))}
    </span>
  );
}

export function CashCloseSection({
  accounts,
  todayClose,
  pendingReview,
  history,
  canDeclare,
  canAvalar,
}: {
  accounts: BankAccountRow[];
  todayClose: CashDailyCloseRow | null;
  pendingReview: CashDailyCloseRow[];
  history: CashDailyCloseRow[];
  canDeclare: boolean;
  canAvalar: boolean;
}) {
  const cajaAccounts = accounts.filter(
    (a) => a.is_active && (a.account_kind === "CAJA" || a.account_kind === "OTRO"),
  );
  const bankAccounts = accounts.filter(
    (a) =>
      a.is_active &&
      (a.account_kind === "BANCO" ||
        a.account_kind === "PASARELA" ||
        a.account_kind === "OTRO"),
  );
  const allActive = accounts.filter((a) => a.is_active);

  const editable =
    canDeclare &&
    (!todayClose ||
      todayClose.status === "BORRADOR" ||
      todayClose.status === "RECHAZADO");

  return (
    <section id="caja" className="scroll-mt-24 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold">
            Cierre de caja del local
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
            El local solo reporta el flujo del día: cuánto efectivo quedó/vendió,
            cuánto fue por datáfono y cuánto por transferencia/QR. Gerencia o
            tesorería valida contra el POS; al avalar, cada monto entra solo a
            su cuenta (caja → caja, banco → banco).
          </p>
        </div>
        <FlowSteps />
      </div>

      {canDeclare && editable ? (
        <DeclareForm
          accounts={allActive}
          cajaAccounts={cajaAccounts.length > 0 ? cajaAccounts : allActive}
          bankAccounts={bankAccounts.length > 0 ? bankAccounts : allActive}
          todayClose={todayClose}
        />
      ) : null}

      {todayClose &&
      !editable &&
      !(canAvalar && todayClose.status === "EN_REVISION") ? (
        <TodayStatusCard
          close={todayClose}
          accounts={accounts}
          canDeclare={canDeclare}
        />
      ) : null}

      {canAvalar && pendingReview.length > 0 ? (
        <div className="space-y-4">
          <div>
            <h3 className="font-display text-xl font-semibold">
              Avalar cierres del local
            </h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Compare lo que reportó el local con el POS y el banco (datáfono y
              QR). Si cuadra (o acepta la diferencia), acredite a las cuentas.
            </p>
          </div>
          {pendingReview.map((close) => (
            <ReviewCard key={close.id} close={close} accounts={accounts} />
          ))}
        </div>
      ) : null}

      {history.length > 0 ? (
        <div className="rounded-xl border border-[var(--line)] bg-white p-5">
          <h3 className="font-medium">Últimos cierres</h3>
          <ul className="mt-4 space-y-3">
            {history.map((close) => {
              const total = daySalesTotal(close);
              return (
                <li
                  key={close.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--line)] px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-[var(--ink)]">
                      {formatDateCO(close.business_date)}
                    </p>
                    <p className="mt-0.5 text-sm text-[var(--muted)]">
                      Efectivo {formatCOP(close.cash_sales)} · Datáfono{" "}
                      {formatCOP(close.card_sales)} · QR/Transf.{" "}
                      {formatCOP(close.transfer_sales ?? 0)} · Total{" "}
                      <span className="font-medium text-[var(--ink)]">
                        {formatCOP(total)}
                      </span>
                    </p>
                  </div>
                  <Badge tone={statusTone(close.status)}>
                    {statusLabel(close.status)}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {!canDeclare && !canAvalar && history.length === 0 && !todayClose ? (
        <p className="text-sm text-[var(--muted)]">
          No hay cierres de caja para mostrar.
        </p>
      ) : null}
    </section>
  );
}

function FlowSteps() {
  const steps = [
    { n: "1", label: "Local reporta flujo" },
    { n: "2", label: "Gerencia/tesorería avala" },
    { n: "3", label: "Se carga a cada cuenta" },
  ];
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs">
      {steps.map((s, i) => (
        <li key={s.n} className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--ink)] text-[10px] font-semibold text-white">
            {s.n}
          </span>
          <span className="text-[var(--muted)]">{s.label}</span>
          {i < steps.length - 1 ? (
            <span className="text-[var(--line)]" aria-hidden>
              →
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function TodayStatusCard({
  close,
  accounts,
  canDeclare,
}: {
  close: CashDailyCloseRow;
  accounts: BankAccountRow[];
  canDeclare: boolean;
}) {
  const total = daySalesTotal(close);
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] bg-slate-50/80 px-5 py-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
            Turno / día
          </p>
          <h3 className="font-display text-xl font-semibold">
            {formatDateCO(close.business_date)}
          </h3>
        </div>
        <Badge tone={statusTone(close.status)}>
          {statusLabel(close.status)}
        </Badge>
      </div>
      <div className="grid gap-0 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile
          label="Base que quedó"
          value={formatCOP(close.cash_float)}
          hint="No se acredita; se queda en caja"
        />
        <SummaryTile
          label="Ventas en efectivo"
          value={formatCOP(close.cash_sales)}
          hint={accountLabel(accounts, close.cash_account_id)}
        />
        <SummaryTile
          label="Datáfono"
          value={formatCOP(close.card_sales)}
          hint={accountLabel(accounts, close.card_account_id)}
        />
        <SummaryTile
          label="Transferencia / QR"
          value={formatCOP(close.transfer_sales ?? 0)}
          hint={accountLabel(accounts, close.transfer_account_id)}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] px-5 py-4">
        <div>
          <p className="text-xs text-[var(--muted)]">Total reportado del día</p>
          <p className="font-display text-2xl font-semibold">
            {formatCOP(total)}
          </p>
        </div>
        {close.status === "AVALADO" ? (
          <p className="text-sm text-emerald-800">
            Acreditado: efectivo {formatCOP(close.cash_credited ?? 0)} ·
            datáfono {formatCOP(close.card_credited ?? 0)} · QR{" "}
            {formatCOP(close.transfer_credited ?? 0)}
          </p>
        ) : null}
        {close.status === "BORRADOR" && canDeclare ? (
          <SubmitDraftButton closeId={close.id} />
        ) : null}
      </div>
      {close.rejection_reason ? (
        <div className="border-t border-red-100 bg-red-50 px-5 py-3 text-sm text-red-800">
          <strong>Devuelto:</strong> {close.rejection_reason}
        </div>
      ) : null}
      {close.comments ? (
        <div className="border-t border-[var(--line)] px-5 py-3 text-sm text-[var(--muted)]">
          Nota: {close.comments}
        </div>
      ) : null}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="border-b border-[var(--line)] px-5 py-4 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tracking-tight">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p> : null}
    </div>
  );
}

function DeclareForm({
  accounts,
  cajaAccounts,
  bankAccounts,
  todayClose,
}: {
  accounts: BankAccountRow[];
  cajaAccounts: BankAccountRow[];
  bankAccounts: BankAccountRow[];
  todayClose: CashDailyCloseRow | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [floatRaw, setFloatRaw] = useState(
    todayClose ? String(todayClose.cash_float) : "",
  );
  const [cashRaw, setCashRaw] = useState(
    todayClose ? String(todayClose.cash_sales) : "",
  );
  const [cardRaw, setCardRaw] = useState(
    todayClose ? String(todayClose.card_sales) : "",
  );
  const [transferRaw, setTransferRaw] = useState(
    todayClose ? String(todayClose.transfer_sales ?? 0) : "",
  );

  const floatAmt = parseAmount(floatRaw);
  const cashAmt = parseAmount(cashRaw);
  const cardAmt = parseAmount(cardRaw);
  const transferAmt = parseAmount(transferRaw);
  const dayTotal = cashAmt + cardAmt + transferAmt;
  const expectedInDrawer = floatAmt + cashAmt;

  const cashDest =
    cajaAccounts[0] ?? accounts.find((a) => a.account_kind === "CAJA") ?? null;
  const bankDest =
    bankAccounts.find((a) => a.account_kind === "BANCO") ??
    bankAccounts[0] ??
    null;

  if (!cashDest || !bankDest) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--line)] bg-white p-6 text-sm text-[var(--muted)]">
        Para cerrar el día hace falta tener creadas en Tesorería una cuenta{" "}
        <strong>Caja</strong> (efectivo) y una <strong>Banco</strong>{" "}
        (datáfono / QR). El local no elige cuentas: al avalar, cada medio se
        carga solo a la suya.
      </div>
    );
  }

  return (
    <form
      className="overflow-hidden rounded-xl border border-[var(--line)] bg-white shadow-[0_1px_0_rgba(18,18,18,0.04)]"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const result = await saveAndSubmitCashDailyCloseAction(fd);
          if (!result.ok) setError(result.error ?? "Error");
          else notifyPendingActionsChanged();
        });
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] bg-[linear-gradient(180deg,#fff,color-mix(in_srgb,var(--accent)_4%,white))] px-5 py-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
            Flujo de caja del día
          </p>
          <h3 className="font-display text-xl font-semibold">
            ¿Cómo quedó la caja hoy?
          </h3>
        </div>
        {todayClose ? (
          <Badge tone={statusTone(todayClose.status)}>
            {statusLabel(todayClose.status)}
          </Badge>
        ) : (
          <Badge tone="info">Pendiente de enviar</Badge>
        )}
      </div>

      {todayClose?.rejection_reason ? (
        <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-800">
          Gerencia devolvió el cierre: {todayClose.rejection_reason}. Corrija y
          vuelva a enviar.
        </div>
      ) : null}

      <div className="space-y-8 p-5 md:p-6">
        {/* 1. Fecha */}
        <div className="flex flex-wrap items-end gap-4">
          <label className="block min-w-[200px] text-sm">
            <span className="mb-1.5 block font-medium text-[var(--ink)]">
              Día del cierre
            </span>
            <input
              type="date"
              name="business_date"
              required
              defaultValue={todayClose?.business_date ?? todayInBogota()}
              className={inputClass}
            />
          </label>
          <p className="pb-2 text-sm text-[var(--muted)]">
            Use la fecha del turno operativo (no la de mañana si cierra de
            madrugada).
          </p>
        </div>

        {/* 2. Base */}
        <fieldset className="space-y-3">
          <legend className="flex items-baseline gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--ink)] text-xs font-semibold text-white">
              1
            </span>
            <span className="font-display text-lg font-semibold">
              Base que debe quedar en caja
            </span>
          </legend>
          <p className="ml-9 text-sm text-[var(--muted)]">
            Es el flotante para el próximo turno (cambio). No es venta: no se
            carga a tesorería.
          </p>
          <div className="ml-9 max-w-sm">
            <label className="block text-sm">
              <span className="mb-1.5 block text-[var(--muted)]">
                Base (COP)
              </span>
              <input
                name="cash_float"
                required
                inputMode="decimal"
                placeholder="Ej. 300000"
                value={floatRaw}
                onChange={(e) => setFloatRaw(e.target.value)}
                className={inputLgClass}
              />
              <span className="mt-1.5 block text-sm text-[var(--muted)]">
                {floatRaw.trim() ? formatCOP(floatAmt) : "Cuente el cambio fijo"}
              </span>
            </label>
          </div>
        </fieldset>

        {/* 3. Ventas */}
        <fieldset className="space-y-4">
          <legend className="flex items-baseline gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--ink)] text-xs font-semibold text-white">
              2
            </span>
            <span className="font-display text-lg font-semibold">
              Cómo se movió la plata
            </span>
          </legend>
          <p className="ml-9 text-sm text-[var(--muted)]">
            Solo diga los montos del flujo. No elige cuentas: efectivo va a
            caja, datáfono y QR van al banco cuando gerencia avale.
          </p>
          <div className="ml-9 grid gap-4 md:grid-cols-3">
            <label className="block rounded-xl border border-[var(--line)] bg-slate-50/50 p-4 text-sm">
              <span className="mb-1 block font-medium text-[var(--ink)]">
                Efectivo de ventas
              </span>
              <span className="mb-3 block text-xs text-[var(--muted)]">
                Contado en caja menos la base
              </span>
              <input
                name="cash_sales"
                required
                inputMode="decimal"
                placeholder="0"
                value={cashRaw}
                onChange={(e) => setCashRaw(e.target.value)}
                className={inputLgClass}
              />
              <span className="mt-2 block text-sm font-medium text-[var(--ink)]">
                {cashRaw.trim() !== "" ? formatCOP(cashAmt) : "—"}
              </span>
            </label>
            <label className="block rounded-xl border border-[var(--line)] bg-slate-50/50 p-4 text-sm">
              <span className="mb-1 block font-medium text-[var(--ink)]">
                Datáfono / adquirencia
              </span>
              <span className="mb-3 block text-xs text-[var(--muted)]">
                Total tarjeta del terminal
              </span>
              <input
                name="card_sales"
                required
                inputMode="decimal"
                placeholder="0"
                value={cardRaw}
                onChange={(e) => setCardRaw(e.target.value)}
                className={inputLgClass}
              />
              <span className="mt-2 block text-sm font-medium text-[var(--ink)]">
                {cardRaw.trim() !== "" ? formatCOP(cardAmt) : "—"}
              </span>
            </label>
            <label className="block rounded-xl border border-[var(--line)] bg-slate-50/50 p-4 text-sm">
              <span className="mb-1 block font-medium text-[var(--ink)]">
                Transferencia / QR
              </span>
              <span className="mb-3 block text-xs text-[var(--muted)]">
                Nequi, Bre-B, transferencia
              </span>
              <input
                name="transfer_sales"
                required
                inputMode="decimal"
                placeholder="0"
                value={transferRaw}
                onChange={(e) => setTransferRaw(e.target.value)}
                className={inputLgClass}
              />
              <span className="mt-2 block text-sm font-medium text-[var(--ink)]">
                {transferRaw.trim() !== "" ? formatCOP(transferAmt) : "—"}
              </span>
            </label>
          </div>
        </fieldset>

        {/* Live board */}
        <div className="ml-0 grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--ink)] px-4 py-4 text-white sm:grid-cols-3 md:ml-9">
          <div>
            <p className="text-xs text-white/60">Total ventas del día</p>
            <p className="mt-1 font-display text-2xl font-semibold">
              {formatCOP(dayTotal)}
            </p>
            <p className="mt-1 text-xs text-white/50">
              Efectivo + datáfono + QR
            </p>
          </div>
          <div>
            <p className="text-xs text-white/60">Debe haber en caja física</p>
            <p className="mt-1 font-display text-2xl font-semibold">
              {formatCOP(expectedInDrawer)}
            </p>
            <p className="mt-1 text-xs text-white/50">Base + efectivo ventas</p>
          </div>
          <div>
            <p className="text-xs text-white/60">Al avalar se carga</p>
            <p className="mt-1 font-display text-2xl font-semibold">
              {formatCOP(dayTotal)}
            </p>
            <p className="mt-1 text-xs text-white/50">
              Efectivo a caja · resto a banco
            </p>
          </div>
        </div>

        {/* 3. Qué pasa después (informativo) */}
        <fieldset className="space-y-3">
          <legend className="flex items-baseline gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--ink)] text-xs font-semibold text-white">
              3
            </span>
            <span className="font-display text-lg font-semibold">
              Después del aval (automático)
            </span>
          </legend>
          <p className="ml-9 text-sm text-[var(--muted)]">
            Usted no elige nada aquí. Cuando gerencia o tesorería avale, el
            sistema carga cada medio a su cuenta:
          </p>
          <ul className="ml-9 grid gap-2 md:grid-cols-3">
            <li className="rounded-xl border border-[var(--line)] bg-slate-50/70 px-4 py-3 text-sm">
              <p className="font-medium text-[var(--ink)]">Efectivo</p>
              <p className="mt-1 text-[var(--muted)]">
                → {cashDest.bank_name}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {formatCOP(cashAmt)}
              </p>
            </li>
            <li className="rounded-xl border border-[var(--line)] bg-slate-50/70 px-4 py-3 text-sm">
              <p className="font-medium text-[var(--ink)]">Datáfono</p>
              <p className="mt-1 text-[var(--muted)]">
                → {bankDest.bank_name}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {formatCOP(cardAmt)}
              </p>
            </li>
            <li className="rounded-xl border border-[var(--line)] bg-slate-50/70 px-4 py-3 text-sm">
              <p className="font-medium text-[var(--ink)]">Transferencia / QR</p>
              <p className="mt-1 text-[var(--muted)]">
                → {bankDest.bank_name}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {formatCOP(transferAmt)}
              </p>
            </li>
          </ul>
        </fieldset>

        <label className="block text-sm md:ml-9">
          <span className="mb-1.5 block text-[var(--muted)]">
            Nota del turno (opcional)
          </span>
          <input
            name="comments"
            defaultValue={todayClose?.comments ?? ""}
            placeholder="Ej. faltó $20.000 en propinas, cierre tarde…"
            className={inputClass}
          />
        </label>

        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 md:ml-9">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 border-t border-[var(--line)] pt-5 sm:flex-row sm:items-center sm:justify-between md:ml-9">
          <button
            type="button"
            disabled={pending}
            className="rounded-lg border border-[var(--line)] px-4 py-2.5 text-sm font-medium disabled:opacity-60"
            onClick={(e) => {
              const form = (e.target as HTMLElement).closest("form");
              if (!form) return;
              setError(null);
              startTransition(async () => {
                const fd = new FormData(form);
                const result = await upsertCashDailyCloseDraftAction(fd);
                if (!result.ok) setError(result.error ?? "Error");
              });
            }}
          >
            Guardar sin enviar
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Enviando…" : "Enviar a gerencia para aval"}
          </button>
        </div>
        {dayTotal <= 0 ? (
          <p className="text-xs text-amber-800 md:ml-9">
            Está enviando un día en $0 de ventas. Úselo solo si el local no
            operó; si no, revise el conteo.
          </p>
        ) : null}
      </div>
    </form>
  );
}

function SubmitDraftButton({ closeId }: { closeId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await submitCashDailyCloseAction(closeId);
            if (!result.ok) setError(result.error ?? "Error");
            else notifyPendingActionsChanged();
          });
        }}
      >
        {pending ? "Enviando…" : "Enviar a gerencia"}
      </button>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}

function ReviewCard({
  close,
  accounts,
}: {
  close: CashDailyCloseRow;
  accounts: BankAccountRow[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [posCash, setPosCash] = useState("");
  const [posCard, setPosCard] = useState("");
  const [posTransfer, setPosTransfer] = useState("");
  const [bankCard, setBankCard] = useState("");
  const [cashCredited, setCashCredited] = useState(String(close.cash_sales));
  const [cardCredited, setCardCredited] = useState(String(close.card_sales));
  const [transferCredited, setTransferCredited] = useState(
    String(close.transfer_sales ?? 0),
  );
  const [showReject, setShowReject] = useState(false);

  const dayTotal = useMemo(() => daySalesTotal(close), [close]);

  return (
    <div className="overflow-hidden rounded-xl border border-amber-200/80 bg-white shadow-[0_1px_0_rgba(18,18,18,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-100 bg-amber-50/70 px-5 py-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-amber-900/70">
            Pendiente de su aval
          </p>
          <h4 className="font-display text-xl font-semibold">
            {formatDateCO(close.business_date)}
          </h4>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Local reportó {formatCOP(dayTotal)} · Base{" "}
            {formatCOP(close.cash_float)}
          </p>
        </div>
        <Badge tone="warn">Esperando aval</Badge>
      </div>

      <div className="grid gap-0 border-b border-[var(--line)] sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile
          label="Efectivo (local)"
          value={formatCOP(close.cash_sales)}
          hint={accountLabel(accounts, close.cash_account_id)}
        />
        <SummaryTile
          label="Datáfono (local)"
          value={formatCOP(close.card_sales)}
          hint={accountLabel(accounts, close.card_account_id)}
        />
        <SummaryTile
          label="QR / transferencia"
          value={formatCOP(close.transfer_sales ?? 0)}
          hint={accountLabel(accounts, close.transfer_account_id)}
        />
        <SummaryTile
          label="Base en caja"
          value={formatCOP(close.cash_float)}
          hint="Control; no se acredita"
        />
      </div>

      <form
        className="space-y-5 p-5"
        action={(fd) => {
          setError(null);
          startTransition(async () => {
            const result = await approveCashDailyCloseAction(close.id, fd);
            if (!result.ok) setError(result.error ?? "Error");
            else notifyPendingActionsChanged();
          });
        }}
      >
        <div>
          <h5 className="font-medium">Contraste con POS y banco</h5>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Abra el reporte del POS y el extracto / liquidación del datáfono.
            Puede avalar aunque no cuadre; la diferencia queda registrada.
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2.5 font-medium">Medio</th>
                <th className="px-3 py-2.5 font-medium">Local</th>
                <th className="px-3 py-2.5 font-medium">Su contraste</th>
                <th className="px-3 py-2.5 font-medium">Resultado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              <tr>
                <td className="px-3 py-3 font-medium">Efectivo vs POS</td>
                <td className="px-3 py-3 tabular-nums">
                  {formatCOP(close.cash_sales)}
                </td>
                <td className="px-3 py-3">
                  <input
                    name="pos_cash_amount"
                    value={posCash}
                    onChange={(e) => setPosCash(e.target.value)}
                    placeholder="Monto POS"
                    inputMode="decimal"
                    className={inputClass}
                  />
                </td>
                <td className="px-3 py-3">
                  <MatchChip declared={close.cash_sales} reference={posCash} />
                </td>
              </tr>
              <tr>
                <td className="px-3 py-3 font-medium">Tarjeta vs POS</td>
                <td className="px-3 py-3 tabular-nums">
                  {formatCOP(close.card_sales)}
                </td>
                <td className="px-3 py-3">
                  <input
                    name="pos_card_amount"
                    value={posCard}
                    onChange={(e) => setPosCard(e.target.value)}
                    placeholder="Monto POS"
                    inputMode="decimal"
                    className={inputClass}
                  />
                </td>
                <td className="px-3 py-3">
                  <MatchChip declared={close.card_sales} reference={posCard} />
                </td>
              </tr>
              <tr>
                <td className="px-3 py-3 font-medium">QR / transf. vs POS</td>
                <td className="px-3 py-3 tabular-nums">
                  {formatCOP(close.transfer_sales ?? 0)}
                </td>
                <td className="px-3 py-3">
                  <input
                    name="pos_transfer_amount"
                    value={posTransfer}
                    onChange={(e) => setPosTransfer(e.target.value)}
                    placeholder="Monto POS"
                    inputMode="decimal"
                    className={inputClass}
                  />
                </td>
                <td className="px-3 py-3">
                  <MatchChip
                    declared={close.transfer_sales ?? 0}
                    reference={posTransfer}
                  />
                </td>
              </tr>
              <tr>
                <td className="px-3 py-3 font-medium">
                  Datáfono vs banco
                </td>
                <td className="px-3 py-3 tabular-nums">
                  {formatCOP(close.card_sales)}
                </td>
                <td className="px-3 py-3">
                  <input
                    name="bank_card_amount"
                    value={bankCard}
                    onChange={(e) => setBankCard(e.target.value)}
                    placeholder="Liquidación / extracto"
                    inputMode="decimal"
                    className={inputClass}
                  />
                </td>
                <td className="px-3 py-3">
                  <MatchChip declared={close.card_sales} reference={bankCard} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">
              Acreditar efectivo
            </span>
            <span className="mb-2 block text-xs text-[var(--muted)]">
              Por defecto = declarado
            </span>
            <input
              name="cash_credited"
              value={cashCredited}
              onChange={(e) => setCashCredited(e.target.value)}
              inputMode="decimal"
              className={inputLgClass}
            />
            <span className="mt-1 block text-sm text-[var(--muted)]">
              {formatCOP(parseAmount(cashCredited))}
            </span>
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">
              Acreditar datáfono
            </span>
            <span className="mb-2 block text-xs text-[var(--muted)]">
              Ajuste si liquidó distinto
            </span>
            <input
              name="card_credited"
              value={cardCredited}
              onChange={(e) => setCardCredited(e.target.value)}
              inputMode="decimal"
              className={inputLgClass}
            />
            <span className="mt-1 block text-sm text-[var(--muted)]">
              {formatCOP(parseAmount(cardCredited))}
            </span>
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">
              Acreditar QR / transf.
            </span>
            <span className="mb-2 block text-xs text-[var(--muted)]">
              Lo que cayó en banco
            </span>
            <input
              name="transfer_credited"
              value={transferCredited}
              onChange={(e) => setTransferCredited(e.target.value)}
              inputMode="decimal"
              className={inputLgClass}
            />
            <span className="mt-1 block text-sm text-[var(--muted)]">
              {formatCOP(parseAmount(transferCredited))}
            </span>
          </label>
        </div>

        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">
            Nota del aval (opcional)
          </span>
          <input
            name="comments"
            defaultValue={close.comments ?? ""}
            placeholder="Ej. aceptado con diferencia de propinas"
            className={inputClass}
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-[var(--ink)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending
              ? "Acreditando…"
              : `Avalar y cargar ${formatCOP(parseAmount(cashCredited) + parseAmount(cardCredited) + parseAmount(transferCredited))} a tesorería`}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setShowReject((v) => !v)}
            className="rounded-lg border border-red-200 px-4 py-3 text-sm font-medium text-red-700"
          >
            Devolver al local
          </button>
        </div>
      </form>

      {showReject ? (
        <form
          className="space-y-3 border-t border-red-100 bg-red-50/50 px-5 py-4"
          action={(fd) => {
            setError(null);
            startTransition(async () => {
              const result = await rejectCashDailyCloseAction(close.id, fd);
              if (!result.ok) setError(result.error ?? "Error");
              else notifyPendingActionsChanged();
            });
          }}
        >
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-red-900">
              Motivo para el local
            </span>
            <input
              name="rejection_reason"
              required
              minLength={3}
              placeholder="Ej. el POS muestra menos efectivo; recontar"
              className={inputClass}
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-red-700 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
          >
            Confirmar devolución
          </button>
        </form>
      ) : null}

      {error ? (
        <p className="border-t border-red-100 bg-red-50 px-5 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}
    </div>
  );
}
