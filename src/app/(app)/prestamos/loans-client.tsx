"use client";

import { useState, useTransition } from "react";
import {
  createDisbursementAction,
  createLoanAction,
  createLoanPaymentAction,
  softDeleteLoanAction,
  updateLoanAction,
} from "./actions";
import { Badge } from "@/components/ui/primitives";
import { formatCOP } from "@/lib/money";
import { formatDateCO } from "@/lib/dates";
import { computeLoanKpis } from "@/lib/loans";
import type { VerificationStatus } from "@/types/domain";

export type ShareholderOption = { id: string; full_name: string };
export type BankOption = { id: string; bank_name: string };

export type LoanRow = {
  id: string;
  lender_shareholder_id: string | null;
  lender_name: string;
  contract_date: string | null;
  approved_principal: number | string;
  interest_rate: number | string | null;
  rate_type: string | null;
  term_months: number | null;
  grace_period_months: number | null;
  first_installment_date: string | null;
  amortization_method: string;
  status: string;
  notes: string | null;
  verification_status: VerificationStatus;
  comments: string | null;
  source: string | null;
};

export type DisbursementRow = {
  id: string;
  loan_id: string;
  disbursement_date: string;
  amount: number | string;
  bank_account_id: string | null;
  notes: string | null;
};

export type PaymentRow = {
  id: string;
  loan_id: string;
  payment_date: string;
  principal_amount: number | string;
  interest_amount: number | string;
  total_amount: number | string;
};

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2";

function vTone(s: VerificationStatus) {
  if (s === "CONFIRMADO") return "ok" as const;
  if (s === "DECLARADO") return "warn" as const;
  return "danger" as const;
}

function LoanFields({
  shareholders,
  defaults,
}: {
  shareholders: ShareholderOption[];
  defaults?: Partial<LoanRow>;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label className="block text-sm md:col-span-2">
        <span className="mb-1.5 block text-[var(--muted)]">Prestamista</span>
        <input
          name="lender_name"
          required
          defaultValue={defaults?.lender_name ?? ""}
          className={inputClass}
        />
      </label>
      <label className="block text-sm md:col-span-2">
        <span className="mb-1.5 block text-[var(--muted)]">Socio (opcional)</span>
        <select
          name="lender_shareholder_id"
          defaultValue={defaults?.lender_shareholder_id ?? ""}
          className={inputClass}
        >
          <option value="">— Ninguno —</option>
          {shareholders.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-[var(--muted)]">Capital aprobado</span>
        <input
          name="approved_principal"
          required
          defaultValue={defaults?.approved_principal?.toString() ?? ""}
          className={inputClass}
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-[var(--muted)]">Fecha contrato</span>
        <input
          type="date"
          name="contract_date"
          defaultValue={defaults?.contract_date ?? ""}
          className={inputClass}
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-[var(--muted)]">Tasa</span>
        <input
          name="interest_rate"
          defaultValue={defaults?.interest_rate?.toString() ?? ""}
          className={inputClass}
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-[var(--muted)]">Tipo de tasa</span>
        <select name="rate_type" defaultValue={defaults?.rate_type ?? ""} className={inputClass}>
          <option value="">—</option>
          <option value="MENSUAL">Mensual</option>
          <option value="EFECTIVA_ANUAL">Efectiva anual</option>
          <option value="MANUAL">Manual</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-[var(--muted)]">Plazo (meses)</span>
        <input
          name="term_months"
          defaultValue={defaults?.term_months?.toString() ?? ""}
          className={inputClass}
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-[var(--muted)]">Amortización</span>
        <select
          name="amortization_method"
          defaultValue={defaults?.amortization_method ?? "MANUAL"}
          className={inputClass}
        >
          <option value="MANUAL">Manual</option>
          <option value="SIN_INTERES">Sin interés</option>
          <option value="CUOTA_FIJA">Cuota fija</option>
          <option value="CAPITAL_FIJO">Capital fijo</option>
          <option value="BULLET">Bullet</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-[var(--muted)]">Estado</span>
        <select name="status" defaultValue={defaults?.status ?? "ACTIVO"} className={inputClass}>
          <option value="BORRADOR">Borrador</option>
          <option value="ACTIVO">Activo</option>
          <option value="CERRADO">Cerrado</option>
          <option value="ANULADO">Anulado</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-[var(--muted)]">Verificación</span>
        <select
          name="verification_status"
          defaultValue={defaults?.verification_status ?? "PENDIENTE"}
          className={inputClass}
        >
          <option value="PENDIENTE">PENDIENTE</option>
          <option value="DECLARADO">DECLARADO</option>
          <option value="CONFIRMADO">CONFIRMADO</option>
        </select>
      </label>
      <label className="block text-sm md:col-span-2">
        <span className="mb-1.5 block text-[var(--muted)]">Notas</span>
        <textarea name="notes" rows={2} defaultValue={defaults?.notes ?? ""} className={inputClass} />
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-[var(--muted)]">Fuente</span>
        <input name="source" defaultValue={defaults?.source ?? ""} className={inputClass} />
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-[var(--muted)]">Comentarios</span>
        <input name="comments" defaultValue={defaults?.comments ?? ""} className={inputClass} />
      </label>
    </div>
  );
}

export function CreateLoanForm({ shareholders }: { shareholders: ShareholderOption[] }) {
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
        Nuevo préstamo
      </button>
    );
  }
  return (
    <form
      className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-5"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await createLoanAction(fd);
          if (!r.ok) setError(r.error ?? "Error");
          else setOpen(false);
        });
      }}
    >
      <div className="flex justify-between">
        <h3 className="font-medium">Nuevo préstamo</h3>
        <button type="button" className="text-sm text-[var(--muted)]" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
      <LoanFields shareholders={shareholders} />
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm text-white disabled:opacity-60"
      >
        {pending ? "Guardando…" : "Guardar préstamo"}
      </button>
    </form>
  );
}

export function LoanCard({
  loan,
  disbursements,
  payments,
  shareholders,
  banks,
}: {
  loan: LoanRow;
  disbursements: DisbursementRow[];
  payments: PaymentRow[];
  shareholders: ShareholderOption[];
  banks: BankOption[];
}) {
  const [editing, setEditing] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [showDisb, setShowDisb] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const interestPaid = payments.map((p) => p.interest_amount);
  const kpis = computeLoanKpis({
    approvedPrincipal: loan.approved_principal,
    disbursements: disbursements.map((d) => d.amount),
    principalPaid: payments.map((p) => p.principal_amount),
    interestAccrued: interestPaid.reduce((a, b) => Number(a) + Number(b), 0),
    interestPaid,
  });

  return (
    <article className="rounded-xl border border-[var(--line)] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-medium">{loan.lender_name}</h3>
          <p className="text-sm text-[var(--muted)]">
            {loan.contract_date ? formatDateCO(loan.contract_date) : "Sin fecha"} ·{" "}
            {loan.amortization_method}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={loan.status === "ACTIVO" ? "ok" : "neutral"}>{loan.status}</Badge>
          <Badge tone={vTone(loan.verification_status)}>{loan.verification_status}</Badge>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
        <div>
          Capital inicial: <strong>{formatCOP(kpis.capitalInicial)}</strong>
        </div>
        <div>
          Desembolsado: <strong>{formatCOP(kpis.capitalDesembolsado)}</strong>
        </div>
        <div>
          Pagado capital: <strong>{formatCOP(kpis.capitalPagado)}</strong>
        </div>
        <div>
          Interés pagado: <strong>{formatCOP(kpis.interesPagado)}</strong>
        </div>
        <div>
          Saldo capital: <strong>{formatCOP(kpis.saldoCapital)}</strong>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm"
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? "Cerrar edición" : "Editar"}
        </button>
        <button
          type="button"
          className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm"
          onClick={() => setShowDisb((v) => !v)}
        >
          Desembolso
        </button>
        <button
          type="button"
          className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm"
          onClick={() => setShowPay((v) => !v)}
        >
          Pago
        </button>
        <button
          type="button"
          className="rounded-lg px-3 py-1.5 text-sm text-red-700"
          disabled={pending}
          onClick={() => {
            if (!confirm("¿Anular este préstamo?")) return;
            startTransition(async () => {
              await softDeleteLoanAction(loan.id);
            });
          }}
        >
          Anular
        </button>
      </div>

      {editing ? (
        <form
          className="mt-4 space-y-3 border-t border-[var(--line)] pt-4"
          action={(fd) => {
            setError(null);
            startTransition(async () => {
              const r = await updateLoanAction(loan.id, fd);
              if (!r.ok) setError(r.error ?? "Error");
              else setEditing(false);
            });
          }}
        >
          <LoanFields shareholders={shareholders} defaults={loan} />
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <button type="submit" disabled={pending} className="rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white">
            Guardar cambios
          </button>
        </form>
      ) : null}

      {showDisb ? (
        <form
          className="mt-4 grid gap-3 border-t border-[var(--line)] pt-4 md:grid-cols-2"
          action={(fd) => {
            fd.set("loan_id", loan.id);
            setError(null);
            startTransition(async () => {
              const r = await createDisbursementAction(fd);
              if (!r.ok) setError(r.error ?? "Error");
              else setShowDisb(false);
            });
          }}
        >
          <input type="hidden" name="loan_id" value={loan.id} />
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Fecha</span>
            <input type="date" name="disbursement_date" required className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Monto</span>
            <input name="amount" required className={inputClass} />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="mb-1.5 block text-[var(--muted)]">Cuenta destino</span>
            <select name="bank_account_id" className={inputClass}>
              <option value="">—</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.bank_name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={pending} className="rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white md:col-span-2">
            Registrar desembolso
          </button>
        </form>
      ) : null}

      {showPay ? (
        <form
          className="mt-4 grid gap-3 border-t border-[var(--line)] pt-4 md:grid-cols-2"
          action={(fd) => {
            fd.set("loan_id", loan.id);
            setError(null);
            startTransition(async () => {
              const r = await createLoanPaymentAction(fd);
              if (!r.ok) setError(r.error ?? "Error");
              else setShowPay(false);
            });
          }}
        >
          <input type="hidden" name="loan_id" value={loan.id} />
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Fecha pago</span>
            <input type="date" name="payment_date" required className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Capital</span>
            <input name="principal_amount" defaultValue="0" className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Interés</span>
            <input name="interest_amount" defaultValue="0" className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Referencia</span>
            <input name="reference" className={inputClass} />
          </label>
          <button type="submit" disabled={pending} className="rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white md:col-span-2">
            Registrar pago
          </button>
        </form>
      ) : null}

      {disbursements.length > 0 ? (
        <div className="mt-4 border-t border-[var(--line)] pt-3 text-sm">
          <p className="mb-2 font-medium">Desembolsos</p>
          <ul className="space-y-1 text-[var(--muted)]">
            {disbursements.map((d) => (
              <li key={d.id}>
                {formatDateCO(d.disbursement_date)} — {formatCOP(d.amount)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}
