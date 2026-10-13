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
import { CollapsiblePanel, FormStep } from "./treasury-panels";

export type CashDailyCloseRow = {
  id: string;
  business_date: string;
  status: "BORRADOR" | "EN_REVISION" | "AVALADO" | "RECHAZADO";
  cash_float: number | string;
  cash_sales: number | string;
  card_sales: number | string;
  card_debit_sales?: number | string | null;
  card_credit_sales?: number | string | null;
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

function acquiringTotal(close: Pick<
  CashDailyCloseRow,
  "card_sales" | "card_debit_sales" | "card_credit_sales"
>) {
  const debit = Number(close.card_debit_sales ?? 0);
  const credit = Number(close.card_credit_sales ?? 0);
  if (debit > 0 || credit > 0) return money(debit).plus(credit);
  return money(close.card_sales ?? 0);
}

function daySalesTotal(close: Pick<
  CashDailyCloseRow,
  "cash_sales" | "card_sales" | "card_debit_sales" | "card_credit_sales" | "transfer_sales"
>) {
  return money(close.cash_sales)
    .plus(acquiringTotal(close))
    .plus(money(close.transfer_sales ?? 0));
}

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-base tabular-nums text-[var(--ink)] outline-none ring-[var(--accent)] focus:ring-2";

const inputLgClass =
  "w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3.5 text-xl font-semibold tabular-nums tracking-tight text-[var(--ink)] outline-none ring-[var(--accent)] focus:ring-2";

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
      <span className="inline-flex rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-xs font-medium text-[var(--ok)]">
        Cuadra
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
        Math.abs(n) > 5000
          ? "bg-[var(--accent-soft)] text-[var(--danger)]"
          : "bg-[var(--gold-soft)] text-[var(--warn)]",
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
  cashFloatTarget = 0,
  cashFloatCurrent = 0,
}: {
  accounts: BankAccountRow[];
  todayClose: CashDailyCloseRow | null;
  pendingReview: CashDailyCloseRow[];
  history: CashDailyCloseRow[];
  canDeclare: boolean;
  canAvalar: boolean;
  cashFloatTarget?: number | string;
  /** Saldo vivo de la cuenta Base (después de gastos/traspasos). */
  cashFloatCurrent?: number | string;
}) {
  const isSales = (a: BankAccountRow) =>
    (a.fund_purpose ?? "VENTAS") === "VENTAS";
  const cajaAccounts = accounts.filter(
    (a) =>
      a.is_active &&
      isSales(a) &&
      !a.is_cash_float &&
      (a.account_kind === "CAJA" || a.account_kind === "OTRO"),
  );
  const bankAccounts = accounts.filter(
    (a) =>
      a.is_active &&
      isSales(a) &&
      !a.is_cash_float &&
      (a.account_kind === "BANCO" ||
        a.account_kind === "PASARELA" ||
        a.account_kind === "OTRO"),
  );
  const allActive = accounts.filter((a) => a.is_active && isSales(a));

  const editable =
    canDeclare &&
    (!todayClose ||
      todayClose.status === "BORRADOR" ||
      todayClose.status === "RECHAZADO");

  const isLocalDesk = canDeclare && !canAvalar;
  const isReviewDesk = canAvalar && !canDeclare;

  return (
    <section id="caja" className="scroll-mt-24 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold">
            {isReviewDesk
              ? "Aval de cierres"
              : "Cierre de caja del local"}
          </h2>
          <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
            {isReviewDesk
              ? "Contraste vs POS y acreditación a cuentas. El local reporta en Cierre de caja."
              : "Reporte ventas en efectivo y el restante de base. El restante debe cuadrar con el saldo de Base en Tesorería."}
          </p>
        </div>
        {isLocalDesk ? <FlowSteps /> : null}
      </div>

      {canAvalar && pendingReview.length > 0 ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-display text-lg font-semibold">
              Avalar ({pendingReview.length})
            </h3>
            <p className="text-sm text-[var(--muted)]">
              Contraste vs POS; comisiones del banco van después como gasto.
            </p>
          </div>
          {pendingReview.map((close) => (
            <ReviewCard key={close.id} close={close} accounts={accounts} />
          ))}
        </div>
      ) : null}

      {canDeclare && editable ? (
        <DeclareForm
          accounts={allActive}
          cajaAccounts={cajaAccounts.length > 0 ? cajaAccounts : allActive.filter((a) => !a.is_cash_float)}
          bankAccounts={bankAccounts.length > 0 ? bankAccounts : allActive.filter((a) => !a.is_cash_float)}
          todayClose={todayClose}
          cashFloatTarget={cashFloatTarget}
          cashFloatCurrent={cashFloatCurrent}
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

      {history.length > 0 ? (
        <CollapsiblePanel
          title="Últimos cierres"
          summary={`${history.length} días recientes`}
          defaultOpen={false}
        >
          <ul className="space-y-3">
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
                      Efectivo {formatCOP(close.cash_sales)} · Adq.{" "}
                      {formatCOP(acquiringTotal(close))} · QR{" "}
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
        </CollapsiblePanel>
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
    { n: "1", label: "Usted reporta el día" },
    { n: "2", label: "Gerencia avala en Tesorería" },
    { n: "3", label: "Se acreditan las cuentas" },
  ];
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs">
      {steps.map((s, i) => (
        <li key={s.n} className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--solid)] text-[10px] font-semibold text-[var(--on-solid)]">
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
    <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--surface-muted)] px-5 py-4">
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
          label="Restante de base"
          value={formatCOP(close.cash_float)}
          hint="Contado en el local al cierre"
        />
        <SummaryTile
          label="Ventas efectivo"
          value={formatCOP(close.cash_sales)}
          hint={accountLabel(accounts, close.cash_account_id)}
        />
        <SummaryTile
          label="Adquirencia (banco)"
          value={formatCOP(acquiringTotal(close))}
          hint={`D ${formatCOP(close.card_debit_sales ?? 0)} · C ${formatCOP(close.card_credit_sales ?? close.card_sales)} · ${accountLabel(accounts, close.card_account_id)}`}
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
          <p className="text-sm text-[var(--ok)]">
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
        <div className="border-t border-[var(--line)] bg-[var(--accent-soft)] px-5 py-3 text-sm text-[var(--danger)]">
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
  cashFloatTarget,
  cashFloatCurrent,
}: {
  accounts: BankAccountRow[];
  cajaAccounts: BankAccountRow[];
  bankAccounts: BankAccountRow[];
  todayClose: CashDailyCloseRow | null;
  cashFloatTarget: number | string;
  cashFloatCurrent: number | string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const targetAmt = Number(cashFloatTarget ?? 0);
  const systemFloat = Number(cashFloatCurrent ?? 0);
  const [floatRaw, setFloatRaw] = useState(
    todayClose
      ? String(todayClose.cash_float)
      : systemFloat > 0
        ? String(systemFloat)
        : "",
  );
  const [cashRaw, setCashRaw] = useState(
    todayClose ? String(todayClose.cash_sales) : "",
  );
  const [debitRaw, setDebitRaw] = useState(
    todayClose ? String(todayClose.card_debit_sales ?? 0) : "",
  );
  const [creditRaw, setCreditRaw] = useState(
    todayClose
      ? String(
          todayClose.card_credit_sales ??
            (Number(todayClose.card_debit_sales ?? 0) > 0
              ? 0
              : todayClose.card_sales),
        )
      : "",
  );
  const [transferRaw, setTransferRaw] = useState(
    todayClose ? String(todayClose.transfer_sales ?? 0) : "",
  );
  const [cardBankId, setCardBankId] = useState(
    todayClose?.card_account_id ??
      bankAccounts.find((a) => a.account_kind === "BANCO")?.id ??
      bankAccounts[0]?.id ??
      "",
  );
  const [transferBankId, setTransferBankId] = useState(
    todayClose?.transfer_account_id ??
      todayClose?.card_account_id ??
      bankAccounts.find((a) => a.account_kind === "BANCO")?.id ??
      bankAccounts[0]?.id ??
      "",
  );
  const [openStep, setOpenStep] = useState<1 | 2 | 3>(1);
  const [notesOpen, setNotesOpen] = useState(Boolean(todayClose?.comments));

  const floatAmt = parseAmount(floatRaw);
  const cashAmt = parseAmount(cashRaw);
  const debitAmt = parseAmount(debitRaw);
  const creditAmt = parseAmount(creditRaw);
  const cardAmt = debitAmt + creditAmt;
  const transferAmt = parseAmount(transferRaw);
  const bankAmt = cardAmt + transferAmt;
  const dayTotal = cashAmt + bankAmt;
  const expectedInDrawer = floatAmt + cashAmt;
  const floatDelta = floatRaw.trim()
    ? floatAmt - systemFloat
    : null;

  const cashDest =
    cajaAccounts[0] ?? accounts.find((a) => a.account_kind === "CAJA") ?? null;
  const cardBank =
    bankAccounts.find((a) => a.id === cardBankId) ?? bankAccounts[0] ?? null;
  const transferBank =
    bankAccounts.find((a) => a.id === transferBankId) ?? cardBank;
  const multiBank = bankAccounts.length > 1;

  if (!cashDest || !cardBank) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface)] p-6 text-sm text-[var(--muted)]">
        Para cerrar el día necesita en Tesorería una cuenta{" "}
        <strong>Caja</strong> (efectivo físico) y al menos una{" "}
        <strong>Banco</strong> (donde aterriza adquirencia y transferencias).
      </div>
    );
  }

  return (
    <form
      className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow-soft)]"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const result = await saveAndSubmitCashDailyCloseAction(fd);
          if (!result.ok) setError(result.error ?? "Error");
          else notifyPendingActionsChanged();
        });
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] bg-[linear-gradient(180deg,var(--surface),color-mix(in_srgb,var(--accent)_10%,var(--surface)))] px-5 py-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
            Flujo de caja del día
          </p>
          <h3 className="font-display text-xl font-semibold text-[var(--ink)]">
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
        <div className="border-b border-[var(--line)] bg-[var(--accent-soft)] px-5 py-3 text-sm text-[var(--danger)]">
          Gerencia devolvió el cierre: {todayClose.rejection_reason}. Corrija y
          vuelva a enviar.
        </div>
      ) : null}

      <div className="space-y-3 p-4 md:p-5">
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-4 py-3">
          <label className="block min-w-[180px] flex-1 text-sm">
            <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
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
          <p className="pb-2 text-xs text-[var(--muted)] sm:max-w-xs">
            Fecha del turno operativo.
          </p>
        </div>

        <FormStep
          step={1}
          title="Efectivo: ventas + restante de base"
          hint={`Ventas → ${cashDest.bank_name}. Restante de base debe cuadrar con Tesorería (${formatCOP(systemFloat)}).`}
          open={openStep === 1}
          onOpen={() => setOpenStep(1)}
          done={cashRaw.trim() !== "" && floatRaw.trim() !== ""}
          summary={
            cashRaw.trim() || floatRaw.trim()
              ? `Ventas ${formatCOP(cashAmt)} · Base restante ${formatCOP(floatAmt)}`
              : `Meta ${formatCOP(targetAmt)} · En sistema ${formatCOP(systemFloat)}`
          }
        >
          <div className="mb-4 rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-4 py-3 text-sm">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
              Referencia Tesorería
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Meta {formatCOP(targetAmt)} · Saldo actual de Base{" "}
              <strong className="text-[var(--ink)]">
                {formatCOP(systemFloat)}
              </strong>
              {systemFloat + 0.009 < targetAmt ? (
                <span className="text-[var(--warn)]">
                  {" "}
                  (faltan {formatCOP(targetAmt - systemFloat)} por recargar)
                </span>
              ) : null}
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 text-sm text-[var(--ink)]">
              <span className="mb-1 block font-medium text-[var(--ink)]">
                Restante de base (contado)
              </span>
              <span className="mb-3 block text-xs text-[var(--muted)]">
                Lo que quedó del flotante tras gastos del día
              </span>
              <input
                name="cash_float"
                required
                inputMode="decimal"
                placeholder="0"
                value={floatRaw}
                onChange={(e) => setFloatRaw(e.target.value)}
                className={inputLgClass}
              />
              <span className="mt-2 block text-sm font-medium">
                {floatRaw.trim() !== "" ? formatCOP(floatAmt) : "—"}
              </span>
              {floatDelta !== null ? (
                <span className="mt-2 block">
                  {Math.abs(floatDelta) < 0.01 ? (
                    <span className="inline-flex rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-xs font-medium text-[var(--ok)]">
                      Cuadra con Tesorería
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
                        Math.abs(floatDelta) > 5000
                          ? "bg-[var(--accent-soft)] text-[var(--danger)]"
                          : "bg-[var(--gold-soft)] text-[var(--warn)]",
                      )}
                    >
                      {floatDelta > 0 ? "Sobra vs sistema" : "Falta vs sistema"}{" "}
                      {formatCOP(Math.abs(floatDelta))}
                    </span>
                  )}
                </span>
              ) : null}
            </label>
            <label className="block rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 text-sm text-[var(--ink)]">
              <span className="mb-1 block font-medium text-[var(--ink)]">Ventas en efectivo</span>
              <span className="mb-3 block text-xs text-[var(--muted)]">
                Contado del cajón menos el restante de base
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
              <span className="mt-2 block text-sm font-medium">
                {cashRaw.trim() !== "" ? formatCOP(cashAmt) : "—"}
              </span>
            </label>
          </div>
          <p className="mt-3 text-sm text-[var(--muted)]">
            Total contado en cajón:{" "}
            <strong className="text-[var(--ink)]">
              {formatCOP(expectedInDrawer)}
            </strong>{" "}
            (restante base + ventas)
          </p>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => setOpenStep(2)}
              className="rounded-lg bg-[var(--solid)] px-4 py-2 text-sm font-medium text-[var(--on-solid)]"
            >
              Siguiente: banco →
            </button>
          </div>
        </FormStep>

        <FormStep
          step={2}
          title="Plata que aterriza en banco"
          hint="Adquirencia del datáfono y transferencias/QR. No es efectivo en caja."
          open={openStep === 2}
          onOpen={() => setOpenStep(2)}
          done={debitRaw.trim() !== "" || creditRaw.trim() !== "" || transferRaw.trim() !== ""}
          summary={
            cardAmt > 0 || transferAmt > 0
              ? `Adq. ${formatCOP(cardAmt)} · QR ${formatCOP(transferAmt)}`
              : "Datáfono + transferencia / QR"
          }
        >
          <div className="space-y-3">
            <div className="space-y-3 rounded-xl border border-[var(--line)] p-4">
              <div>
                <p className="font-medium">Adquirencia (datáfono)</p>
                <p className="text-xs text-[var(--muted)]">
                  Separe débito y crédito del cierre del terminal
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1.5 block text-[var(--muted)]">
                    Tarjeta débito
                  </span>
                  <input
                    name="card_debit_sales"
                    required
                    inputMode="decimal"
                    placeholder="0"
                    value={debitRaw}
                    onChange={(e) => setDebitRaw(e.target.value)}
                    className={inputLgClass}
                  />
                  <span className="mt-1 block text-sm text-[var(--muted)]">
                    {debitRaw.trim() !== "" ? formatCOP(debitAmt) : "—"}
                  </span>
                </label>
                <label className="block text-sm">
                  <span className="mb-1.5 block text-[var(--muted)]">
                    Tarjeta crédito
                  </span>
                  <input
                    name="card_credit_sales"
                    required
                    inputMode="decimal"
                    placeholder="0"
                    value={creditRaw}
                    onChange={(e) => setCreditRaw(e.target.value)}
                    className={inputLgClass}
                  />
                  <span className="mt-1 block text-sm text-[var(--muted)]">
                    {creditRaw.trim() !== "" ? formatCOP(creditAmt) : "—"}
                  </span>
                </label>
              </div>
              <p className="text-sm text-[var(--muted)]">
                Total adquirencia:{" "}
                <strong className="text-[var(--ink)]">
                  {formatCOP(cardAmt)}
                </strong>
              </p>
              {multiBank ? (
                <label className="block text-sm">
                  <span className="mb-1.5 block text-[var(--muted)]">
                    Banco donde liquida esta adquirencia
                  </span>
                  <select
                    name="card_account_id"
                    required
                    value={cardBankId}
                    onChange={(e) => setCardBankId(e.target.value)}
                    className={inputClass}
                  >
                    {bankAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.bank_name}
                        {a.masked_number ? ` · ${a.masked_number}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <input
                  type="hidden"
                  name="card_account_id"
                  value={cardBank.id}
                />
              )}
            </div>

            <div className="space-y-3 rounded-xl border border-[var(--line)] p-4">
              <div>
                <p className="font-medium">Transferencia / QR</p>
                <p className="text-xs text-[var(--muted)]">
                  Nequi, Bre-B, transferencia a la cuenta del restaurante
                </p>
              </div>
              <label className="block max-w-md text-sm">
                <span className="mb-1.5 block text-[var(--muted)]">Monto</span>
                <input
                  name="transfer_sales"
                  required
                  inputMode="decimal"
                  placeholder="0"
                  value={transferRaw}
                  onChange={(e) => setTransferRaw(e.target.value)}
                  className={inputLgClass}
                />
                <span className="mt-1 block text-sm text-[var(--muted)]">
                  {transferRaw.trim() !== "" ? formatCOP(transferAmt) : "—"}
                </span>
              </label>
              {multiBank ? (
                <label className="block text-sm">
                  <span className="mb-1.5 block text-[var(--muted)]">
                    Banco donde aterrizan esas transferencias
                  </span>
                  <select
                    name="transfer_account_id"
                    required
                    value={transferBankId}
                    onChange={(e) => setTransferBankId(e.target.value)}
                    className={inputClass}
                  >
                    {bankAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.bank_name}
                        {a.masked_number ? ` · ${a.masked_number}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <input
                  type="hidden"
                  name="transfer_account_id"
                  value={transferBank?.id ?? cardBank.id}
                />
              )}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap justify-between gap-2">
            <button
              type="button"
              onClick={() => setOpenStep(1)}
              className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-medium"
            >
              ← Efectivo
            </button>
            <button
              type="button"
              onClick={() => setOpenStep(3)}
              className="rounded-lg bg-[var(--solid)] px-4 py-2 text-sm font-medium text-[var(--on-solid)]"
            >
              Siguiente: revisar →
            </button>
          </div>
        </FormStep>

        <FormStep
          step={3}
          title="Revisar aterrizaje"
          hint="Al avalar, esto es lo que surte cada cuenta."
          open={openStep === 3}
          onOpen={() => setOpenStep(3)}
          done={dayTotal > 0}
          summary={`Total día ${formatCOP(dayTotal)} · Caja ${cashDest.bank_name}`}
        >
          <div className="grid gap-3 rounded-xl bg-[var(--solid)] px-4 py-4 text-[var(--on-solid)] sm:grid-cols-3">
            <div>
              <p className="text-xs text-white/60">En caja física</p>
              <p className="mt-1 font-display text-2xl font-semibold">
                {formatCOP(expectedInDrawer)}
              </p>
              <p className="mt-1 text-xs text-white/50">Base + ventas efectivo</p>
            </div>
            <div>
              <p className="text-xs text-white/60">Aterriza en banco</p>
              <p className="mt-1 font-display text-2xl font-semibold">
                {formatCOP(bankAmt)}
              </p>
              <p className="mt-1 text-xs text-white/50">
                Adquirencia + transferencias
              </p>
            </div>
            <div>
              <p className="text-xs text-white/60">Total flujo del día</p>
              <p className="mt-1 font-display text-2xl font-semibold">
                {formatCOP(dayTotal)}
              </p>
              <p className="mt-1 text-xs text-white/50">Efectivo + banco</p>
            </div>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
                Bolsa 1 · Efectivo
              </p>
              <p className="mt-1 font-display text-xl font-semibold">
                {formatCOP(cashAmt)}
              </p>
              <p className="mt-1 text-sm">
                Surte → <strong>{cashDest.bank_name}</strong>
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Restante de base ({formatCOP(floatAmt)}) no se acredita; ya
                vive en la cuenta Base.
              </p>
            </div>
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
                Bolsa 2 · Banco
              </p>
              <p className="mt-1 font-display text-xl font-semibold">
                {formatCOP(bankAmt)}
              </p>
              <ul className="mt-1 space-y-1 text-sm">
                <li>
                  Adq. {formatCOP(cardAmt)} →{" "}
                  <strong>{cardBank.bank_name}</strong>
                </li>
                <li>
                  QR {formatCOP(transferAmt)} →{" "}
                  <strong>
                    {transferBank?.bank_name ?? cardBank.bank_name}
                  </strong>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-4 flex justify-start">
            <button
              type="button"
              onClick={() => setOpenStep(2)}
              className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-medium"
            >
              ← Banco
            </button>
          </div>
        </FormStep>

        <div className="rounded-xl border border-[var(--line)]">
          <button
            type="button"
            aria-expanded={notesOpen}
            onClick={() => setNotesOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm"
          >
            <span className="text-[var(--muted)]">
              Nota del turno {notesOpen ? "" : "(opcional)"}
            </span>
            <span className="text-xs text-[var(--muted)]">
              {notesOpen ? "Ocultar" : "Agregar"}
            </span>
          </button>
          <div
            className={cn(
              "border-t border-[var(--line)] px-4 py-3",
              !notesOpen && "hidden",
            )}
          >
            <input
              name="comments"
              defaultValue={todayClose?.comments ?? ""}
              placeholder="Ej. faltó $20.000 en propinas, cierre tarde…"
              className={inputClass}
            />
          </div>
        </div>

        {error ? (
          <p className="rounded-lg bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--danger)]">
            {error}
          </p>
        ) : null}

        <div className="sticky bottom-3 z-10 flex flex-col-reverse gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)]/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 px-1 text-sm text-[var(--muted)]">
            Total a reportar{" "}
            <strong className="text-[var(--ink)]">{formatCOP(dayTotal)}</strong>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
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
              className="rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--on-solid)] disabled:opacity-60"
            >
              {pending ? "Enviando…" : "Enviar a gerencia para aval"}
            </button>
          </div>
        </div>
        {dayTotal <= 0 ? (
          <p className="text-xs text-[var(--warn)]">
            Día en $0 de ventas: solo si el local no operó.
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
        className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--on-solid)] disabled:opacity-60"
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
      {error ? <p className="mt-2 text-sm text-[var(--danger)]">{error}</p> : null}
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
  const [cashCredited, setCashCredited] = useState(String(close.cash_sales));
  const [cardCredited, setCardCredited] = useState(
    String(acquiringTotal(close).toNumber()),
  );
  const [transferCredited, setTransferCredited] = useState(
    String(close.transfer_sales ?? 0),
  );
  const [showReject, setShowReject] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const dayTotal = useMemo(() => daySalesTotal(close), [close]);
  const creditTotal =
    parseAmount(cashCredited) +
    parseAmount(cardCredited) +
    parseAmount(transferCredited);

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--warn)]/40 bg-[var(--surface)] shadow-[0_1px_0_rgba(18,18,18,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--gold-soft)] px-5 py-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--warn)]">
            Pendiente de su aval
          </p>
          <h4 className="font-display text-xl font-semibold">
            {formatDateCO(close.business_date)}
          </h4>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Local reportó {formatCOP(dayTotal)} · Restante base{" "}
            {formatCOP(close.cash_float)}
          </p>
        </div>
        <Badge tone="warn">Esperando aval</Badge>
      </div>

      <div className="border-b border-[var(--line)]">
        <button
          type="button"
          aria-expanded={reportOpen}
          onClick={() => setReportOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left text-sm hover:bg-[var(--surface-muted)]/60"
        >
          <span className="text-[var(--muted)]">
            {reportOpen
              ? "Ocultar desglose del local"
              : `Ver desglose · Ef. ${formatCOP(close.cash_sales)} · Adq. ${formatCOP(acquiringTotal(close))} · QR ${formatCOP(close.transfer_sales ?? 0)}`}
          </span>
          <span className="text-xs font-medium text-[var(--ink)]">
            {reportOpen ? "Cerrar" : "Abrir"}
          </span>
        </button>
        <div
          className={cn(
            "grid gap-0 border-t border-[var(--line)] sm:grid-cols-2 lg:grid-cols-3",
            !reportOpen && "hidden",
          )}
        >
          <SummaryTile
            label="Efectivo → caja"
            value={formatCOP(close.cash_sales)}
            hint={accountLabel(accounts, close.cash_account_id)}
          />
          <SummaryTile
            label="Adquirencia → banco"
            value={formatCOP(acquiringTotal(close))}
            hint={`D ${formatCOP(close.card_debit_sales ?? 0)} · C ${formatCOP(close.card_credit_sales ?? 0)} · ${accountLabel(accounts, close.card_account_id)}`}
          />
          <SummaryTile
            label="Transfer/QR → banco"
            value={formatCOP(close.transfer_sales ?? 0)}
            hint={accountLabel(accounts, close.transfer_account_id)}
          />
        </div>
      </div>

      <form
        className="space-y-4 p-5"
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
          <h5 className="font-medium">1. Contraste Local vs POS</h5>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Escriba lo del POS. Se acredita bruto; la comisión del adquirente
            va después como gasto.
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
          <table className="min-w-full text-sm">
            <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2.5 font-medium">Medio</th>
                <th className="px-3 py-2.5 font-medium">Local</th>
                <th className="px-3 py-2.5 font-medium">POS</th>
                <th className="px-3 py-2.5 font-medium">Resultado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              <tr>
                <td className="px-3 py-3 font-medium">Efectivo</td>
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
                <td className="px-3 py-3 font-medium">
                  Adquirencia
                  <span className="mt-0.5 block text-xs font-normal text-[var(--muted)]">
                    D {formatCOP(close.card_debit_sales ?? 0)} · C{" "}
                    {formatCOP(close.card_credit_sales ?? 0)}
                  </span>
                </td>
                <td className="px-3 py-3 tabular-nums">
                  {formatCOP(acquiringTotal(close))}
                </td>
                <td className="px-3 py-3">
                  <input
                    name="pos_card_amount"
                    value={posCard}
                    onChange={(e) => setPosCard(e.target.value)}
                    placeholder="Total POS tarjetas"
                    inputMode="decimal"
                    className={inputClass}
                  />
                </td>
                <td className="px-3 py-3">
                  <MatchChip
                    declared={acquiringTotal(close).toNumber()}
                    reference={posCard}
                  />
                </td>
              </tr>
              <tr>
                <td className="px-3 py-3 font-medium">QR / transferencia</td>
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
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-xl border border-[var(--line)]">
          <button
            type="button"
            aria-expanded={creditsOpen}
            onClick={() => setCreditsOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[var(--surface-muted)]/60"
          >
            <div>
              <p className="text-sm font-medium">2. Montos a acreditar</p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                Por defecto = lo reportado · Total {formatCOP(creditTotal)}
              </p>
            </div>
            <span className="text-xs font-medium text-[var(--ink)]">
              {creditsOpen ? "Ocultar" : "Ajustar"}
            </span>
          </button>
          <div
            className={cn(
              "space-y-3 border-t border-[var(--line)] px-4 py-4",
              !creditsOpen && "hidden",
            )}
          >
            <p className="text-xs text-[var(--muted)]">
              Comisión del datáfono: regístrela después en Gastos (baja el
              banco). No se descuenta aquí.
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium">
                  Acreditar a caja
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
                  Acreditar adquirencia
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
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-[var(--solid)] px-5 py-3 text-sm font-semibold text-[var(--on-solid)] disabled:opacity-60"
          >
            {pending
              ? "Acreditando…"
              : `Avalar y cargar ${formatCOP(creditTotal)} a tesorería`}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setShowReject((v) => !v)}
            className="rounded-lg border border-red-200 px-4 py-3 text-sm font-medium text-[var(--danger)]"
          >
            Devolver al local
          </button>
        </div>
      </form>

      {showReject ? (
        <form
          className="space-y-3 border-t border-[var(--line)] bg-[var(--accent-soft)] px-5 py-4"
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
            <span className="mb-1.5 block font-medium text-[var(--danger)]">
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
            className="rounded-lg bg-[var(--solid)] px-4 py-2.5 text-sm font-medium text-[var(--on-solid)] disabled:opacity-60"
          >
            Confirmar devolución
          </button>
        </form>
      ) : null}

      {error ? (
        <p className="border-t border-[var(--line)] bg-[var(--accent-soft)] px-5 py-3 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
