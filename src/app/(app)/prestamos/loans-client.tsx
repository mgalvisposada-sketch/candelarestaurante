"use client";

import { useMemo, useState, useTransition } from "react";
import {
  createLoanAction,
  postDisbursementToTreasuryAction,
  softDeleteLoanAction,
} from "./actions";
import { quickCreateShareholderAction } from "../socios/actions";
import { quickCreateBankAccountAction } from "../tesoreria/actions";
import { Badge } from "@/components/ui/primitives";
import {
  QuickCreateField,
  QuickCreateSelect,
  QuickCreateSelectField,
} from "@/components/ui/quick-create";
import { formatCOP } from "@/lib/money";
import { formatDateCO, todayInBogota } from "@/lib/dates";
import {
  computeLoanKpis,
  disbursementTreasuryStatus,
} from "@/lib/loans";

export type ShareholderOption = { id: string; full_name: string };
export type BankOption = {
  id: string;
  bank_name: string;
  account_kind?: string | null;
};

export type LoanRow = {
  id: string;
  lender_shareholder_id: string | null;
  lender_name: string;
  contract_date: string | null;
  approved_principal: number | string;
  status: string;
  notes: string | null;
};

export type DisbursementRow = {
  id: string;
  loan_id: string;
  disbursement_date: string;
  amount: number | string;
  bank_account_id: string | null;
  bank_transaction_id: string | null;
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
  "w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] outline-none ring-[var(--accent)] focus:ring-2";

function treasuryTone(status: ReturnType<typeof disbursementTreasuryStatus>) {
  if (status === "EN_TESORERIA") return "ok" as const;
  if (status === "PENDIENTE_INGRESO") return "warn" as const;
  return "danger" as const;
}

function treasuryLabel(status: ReturnType<typeof disbursementTreasuryStatus>) {
  if (status === "EN_TESORERIA") return "En cuenta";
  if (status === "PENDIENTE_INGRESO") return "Pendiente en cuenta";
  return "Sin cuenta";
}

function bankLabel(banks: BankOption[], id: string | null) {
  if (!id) return "Sin cuenta";
  return banks.find((b) => b.id === id)?.bank_name ?? "Cuenta";
}

export function CreateLoanForm({
  shareholders: initialShareholders,
  banks: initialBanks,
  embedded = false,
}: {
  shareholders: ShareholderOption[];
  banks: BankOption[];
  embedded?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [shareholders, setShareholders] = useState(initialShareholders);
  const [banks, setBanks] = useState(initialBanks);
  const [shareholderId, setShareholderId] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const selectedShareholder = useMemo(
    () => shareholders.find((s) => s.id === shareholderId) ?? null,
    [shareholders, shareholderId],
  );

  return (
    <form
      className={
        embedded
          ? "space-y-4"
          : "space-y-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5"
      }
      action={(fd) => {
        setError(null);
        if (selectedShareholder) {
          fd.set("lender_name", selectedShareholder.full_name);
        }
        startTransition(async () => {
          const r = await createLoanAction(fd);
          if (!r.ok) setError(r.error ?? "Error");
        });
      }}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <QuickCreateSelect
          className="md:col-span-2"
          name="lender_shareholder_id"
          label="Socio"
          required
          value={shareholderId}
          onChange={setShareholderId}
          options={shareholders.map((s) => ({
            id: s.id,
            label: s.full_name,
          }))}
          placeholder="— Elegir socio —"
          createLabel="Nuevo socio"
          createTitle="Alta rápida de socio"
          onCreate={async (fd) => {
            const r = await quickCreateShareholderAction(fd);
            if (!r.ok || !r.id) {
              return { ok: false, error: r.error ?? "No se pudo crear" };
            }
            const label = r.name ?? String(fd.get("full_name") ?? "Socio");
            setShareholders((prev) =>
              prev.some((s) => s.id === r.id)
                ? prev
                : [...prev, { id: r.id!, full_name: label }],
            );
            return { ok: true, id: r.id, label };
          }}
        >
          <QuickCreateField name="full_name" label="Nombre" required />
          <QuickCreateSelectField name="id_type" label="Tipo ID" required defaultValue="CC">
            <option value="CC">CC</option>
            <option value="CE">CE</option>
            <option value="NIT">NIT</option>
            <option value="PASAPORTE">Pasaporte</option>
            <option value="OTRO">Otro</option>
          </QuickCreateSelectField>
          <QuickCreateField name="id_number" label="Número ID" required />
          <QuickCreateField
            name="participation_pct"
            label="% participación"
            required
            placeholder="Ej. 25"
          />
        </QuickCreateSelect>

        {shareholderId ? (
          <input
            type="hidden"
            name="lender_name"
            value={selectedShareholder?.full_name ?? ""}
          />
        ) : null}

        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Fecha en que prestó</span>
          <input
            type="date"
            name="loan_date"
            required
            defaultValue={todayInBogota()}
            className={inputClass}
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Monto prestado</span>
          <input
            name="amount"
            required
            inputMode="decimal"
            className={inputClass}
            placeholder="Ej. 5000000"
          />
        </label>

        <QuickCreateSelect
          className="md:col-span-2"
          name="bank_account_id"
          label="Cuenta donde ingresó el dinero"
          required
          value={bankAccountId}
          onChange={setBankAccountId}
          options={banks.map((b) => ({ id: b.id, label: b.bank_name }))}
          placeholder="— Elegir cuenta —"
          createLabel="Nueva cuenta"
          createTitle="Alta rápida de cuenta"
          onCreate={async (fd) => {
            const r = await quickCreateBankAccountAction(fd);
            if (!r.ok || !r.id) {
              return { ok: false, error: r.error ?? "No se pudo crear" };
            }
            const label = r.name ?? String(fd.get("bank_name") ?? "Cuenta");
            const kind = String(fd.get("account_kind") ?? "BANCO");
            setBanks((prev) =>
              prev.some((b) => b.id === r.id)
                ? prev
                : [...prev, { id: r.id!, bank_name: label, account_kind: kind }],
            );
            return { ok: true, id: r.id, label };
          }}
        >
          <QuickCreateField
            name="bank_name"
            label="Nombre"
            required
            placeholder="Ej. Bancolombia empresa"
          />
          <QuickCreateSelectField
            name="account_kind"
            label="Tipo"
            required
            defaultValue="BANCO"
          >
            <option value="BANCO">Banco</option>
            <option value="CAJA">Caja</option>
            <option value="PASARELA">Pasarela</option>
            <option value="OTRO">Otro</option>
          </QuickCreateSelectField>
        </QuickCreateSelect>

        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">Nota (opcional)</span>
          <input
            name="notes"
            className={inputClass}
            placeholder="Referencia, transferencia, observación…"
          />
        </label>
      </div>

      {error ? (
        <p className="rounded-lg bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || !shareholderId || !bankAccountId}
        className="rounded-lg bg-[var(--solid)] px-5 py-2.5 text-sm font-medium text-[var(--on-solid)] disabled:cursor-not-allowed disabled:opacity-45"
      >
        {pending ? "Guardando…" : "Registrar préstamo"}
      </button>
    </form>
  );
}

export function LoanCard({
  loan,
  disbursements,
  payments,
  banks,
}: {
  loan: LoanRow;
  disbursements: DisbursementRow[];
  payments: PaymentRow[];
  banks: BankOption[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const kpis = computeLoanKpis({
    approvedPrincipal: loan.approved_principal,
    disbursements: disbursements.map((d) => d.amount),
    principalPaid: payments.map((p) => p.principal_amount),
    interestAccrued: 0,
    interestPaid: payments.map((p) => p.interest_amount),
  });

  const primary = disbursements[0] ?? null;
  const primaryStatus = primary
    ? disbursementTreasuryStatus(primary)
    : "SIN_CUENTA";

  return (
    <article className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 text-[var(--ink)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-medium">{loan.lender_name}</h3>
          <p className="text-sm text-[var(--muted)]">
            {primary
              ? formatDateCO(primary.disbursement_date)
              : loan.contract_date
                ? formatDateCO(loan.contract_date)
                : "Sin fecha"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {loan.status === "ANULADO" ? (
            <Badge tone="neutral">Anulado</Badge>
          ) : (
            <Badge tone="ok">Activo</Badge>
          )}
          {primary ? (
            <Badge tone={treasuryTone(primaryStatus)}>
              {treasuryLabel(primaryStatus)}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
        <div>
          <p className="text-xs text-[var(--muted)]">Prestó</p>
          <p className="mt-0.5 font-medium">{formatCOP(kpis.capitalDesembolsado)}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--muted)]">Saldo por devolver</p>
          <p className="mt-0.5 font-medium">{formatCOP(kpis.saldoCapital)}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--muted)]">Cuenta</p>
          <p className="mt-0.5 font-medium">
            {bankLabel(banks, primary?.bank_account_id ?? null)}
          </p>
        </div>
      </div>

      {loan.notes ? (
        <p className="mt-3 text-sm text-[var(--muted)]">{loan.notes}</p>
      ) : null}

      {disbursements.length > 1 ? (
        <ul className="mt-4 space-y-2 border-t border-[var(--line)] pt-3 text-sm">
          {disbursements.map((d) => {
            const status = disbursementTreasuryStatus(d);
            return (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span>
                  {formatDateCO(d.disbursement_date)} · {formatCOP(d.amount)} ·{" "}
                  {bankLabel(banks, d.bank_account_id)}
                </span>
                <Badge tone={treasuryTone(status)}>{treasuryLabel(status)}</Badge>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {primary && primaryStatus === "PENDIENTE_INGRESO" ? (
          <button
            type="button"
            disabled={pending}
            className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm"
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const r = await postDisbursementToTreasuryAction(primary.id);
                if (!r.ok) setError(r.error ?? "Error");
              });
            }}
          >
            Cargar en cuenta
          </button>
        ) : null}
        {loan.status !== "ANULADO" ? (
          <button
            type="button"
            className="rounded-lg px-3 py-1.5 text-sm text-[var(--danger)]"
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
        ) : null}
      </div>

      {error ? (
        <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>
      ) : null}
    </article>
  );
}
