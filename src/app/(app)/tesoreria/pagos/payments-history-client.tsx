"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/primitives";
import { formatCOP } from "@/lib/money";
import { formatDateCO, formatDateTimeCO } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type PaymentHistoryFilters = {
  from: string;
  to: string;
  q: string;
  source: string;
  supplier_id: string;
  account_id: string;
  fund_purpose: string;
  min_amount: string;
  max_amount: string;
};

export type PaymentLegRow = {
  id: string;
  bank_account_id: string;
  account_name: string;
  fund_purpose: "VENTAS" | "EMPRESA" | null;
  is_cash_float: boolean;
  transaction_date: string;
  debit: number | string;
  reference: string | null;
};

export type PaymentHistoryRow = {
  id: string;
  source: string;
  concept: string;
  amount: number | string;
  paid_amount: number | string | null;
  paid_at: string | null;
  payment_date: string | null;
  payment_reference: string | null;
  document_type: string | null;
  document_number: string | null;
  notes: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  paid_by_name: string | null;
  approved_by_name: string | null;
  legs: PaymentLegRow[];
};

export type FilterOption = { id: string; label: string };

const SOURCE_LABEL: Record<string, string> = {
  SOLICITUD_INTERNA: "Solicitud interna",
  FACTURA_PROVEEDOR: "Factura proveedor",
  GASTO: "Gasto",
};

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]";

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function downloadCsv(rows: PaymentHistoryRow[]) {
  const header = [
    "Fecha pago",
    "Pagado el",
    "Concepto",
    "Origen",
    "Proveedor",
    "Documento",
    "Monto",
    "Referencia",
    "Cuentas",
    "Ejecutado por",
    "Aprobado por",
    "Notas",
    "Id solicitud",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    const accounts = r.legs
      .map(
        (l) =>
          `${l.account_name}${l.is_cash_float ? " (Base)" : ""}: ${formatCOP(l.debit)}`,
      )
      .join(" | ");
    const doc = [r.document_type, r.document_number].filter(Boolean).join(" ");
    lines.push(
      [
        r.payment_date ?? "",
        r.paid_at ?? "",
        r.concept,
        SOURCE_LABEL[r.source] ?? r.source,
        r.supplier_name ?? "",
        doc,
        String(r.paid_amount ?? r.amount),
        r.payment_reference ?? "",
        accounts,
        r.paid_by_name ?? "",
        r.approved_by_name ?? "",
        r.notes ?? "",
        r.id,
      ]
        .map((v) => csvEscape(String(v)))
        .join(","),
    );
  }
  const blob = new Blob(["\uFEFF" + lines.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `historial-pagos-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function PaymentHistoryFiltersForm({
  filters,
  suppliers,
  accounts,
}: {
  filters: PaymentHistoryFilters;
  suppliers: FilterOption[];
  accounts: FilterOption[];
}) {
  return (
    <form
      method="get"
      className="grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)] md:grid-cols-12"
    >
      <p className="md:col-span-12 text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
        Filtros de auditoría
      </p>
      <label className="block text-sm md:col-span-2">
        <span className="mb-1 block text-[var(--muted)]">Desde</span>
        <input
          type="date"
          name="from"
          defaultValue={filters.from}
          className={inputClass}
        />
      </label>
      <label className="block text-sm md:col-span-2">
        <span className="mb-1 block text-[var(--muted)]">Hasta</span>
        <input
          type="date"
          name="to"
          defaultValue={filters.to}
          className={inputClass}
        />
      </label>
      <label className="block text-sm md:col-span-3">
        <span className="mb-1 block text-[var(--muted)]">Buscar</span>
        <input
          name="q"
          defaultValue={filters.q}
          placeholder="Concepto, referencia, documento…"
          className={inputClass}
        />
      </label>
      <label className="block text-sm md:col-span-2">
        <span className="mb-1 block text-[var(--muted)]">Origen</span>
        <select name="source" defaultValue={filters.source} className={inputClass}>
          <option value="">Todos</option>
          <option value="FACTURA_PROVEEDOR">Factura proveedor</option>
          <option value="GASTO">Gasto</option>
          <option value="SOLICITUD_INTERNA">Solicitud interna</option>
        </select>
      </label>
      <label className="block text-sm md:col-span-3">
        <span className="mb-1 block text-[var(--muted)]">Proveedor</span>
        <select
          name="supplier_id"
          defaultValue={filters.supplier_id}
          className={inputClass}
        >
          <option value="">Todos</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm md:col-span-3">
        <span className="mb-1 block text-[var(--muted)]">Cuenta</span>
        <select
          name="account_id"
          defaultValue={filters.account_id}
          className={inputClass}
        >
          <option value="">Todas</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm md:col-span-2">
        <span className="mb-1 block text-[var(--muted)]">Propósito fondo</span>
        <select
          name="fund_purpose"
          defaultValue={filters.fund_purpose}
          className={inputClass}
        >
          <option value="">Todos</option>
          <option value="VENTAS">Ventas</option>
          <option value="EMPRESA">Empresa</option>
        </select>
      </label>
      <label className="block text-sm md:col-span-2">
        <span className="mb-1 block text-[var(--muted)]">Monto mín.</span>
        <input
          name="min_amount"
          inputMode="decimal"
          defaultValue={filters.min_amount}
          placeholder="0"
          className={inputClass}
        />
      </label>
      <label className="block text-sm md:col-span-2">
        <span className="mb-1 block text-[var(--muted)]">Monto máx.</span>
        <input
          name="max_amount"
          inputMode="decimal"
          defaultValue={filters.max_amount}
          placeholder="Sin tope"
          className={inputClass}
        />
      </label>
      <div className="flex flex-wrap items-end gap-2 md:col-span-3">
        <button
          type="submit"
          className="rounded-lg bg-[var(--solid)] px-4 py-2.5 text-sm font-medium text-[var(--on-solid)]"
        >
          Aplicar
        </button>
        <Link
          href="/tesoreria/pagos"
          className="rounded-lg border border-[var(--line)] px-4 py-2.5 text-sm text-[var(--muted)] hover:bg-neutral-50"
        >
          Limpiar
        </Link>
      </div>
    </form>
  );
}

export function PaymentHistoryTable({
  rows,
  totalAmount,
}: {
  rows: PaymentHistoryRow[];
  totalAmount: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          {rows.length}{" "}
          {rows.length === 1 ? "pago" : "pagos"} · total{" "}
          <span className="font-medium text-[var(--ink)]">
            {formatCOP(totalAmount)}
          </span>
        </p>
        <button
          type="button"
          disabled={rows.length === 0}
          onClick={() => downloadCsv(rows)}
          className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
        >
          Exportar CSV
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--line)] px-4 py-8 text-center text-sm text-[var(--muted)]">
          No hay pagos con esos filtros.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li
              key={r.id}
              className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-[var(--ink)]">{r.concept}</h3>
                    <Badge tone="neutral">
                      {SOURCE_LABEL[r.source] ?? r.source}
                    </Badge>
                    {r.legs.length > 1 ? (
                      <Badge tone="warn">Pago repartido</Badge>
                    ) : null}
                  </div>
                  <p className="text-sm text-[var(--muted)]">
                    {r.supplier_name ? (
                      <>
                        {r.supplier_name}
                        {" · "}
                      </>
                    ) : null}
                    Fecha pago {formatDateCO(r.payment_date)}
                    {r.paid_at ? (
                      <> · registrado {formatDateTimeCO(r.paid_at)}</>
                    ) : null}
                  </p>
                  {(r.document_type || r.document_number) && (
                    <p className="text-sm text-[var(--muted)]">
                      Doc. {[r.document_type, r.document_number]
                        .filter(Boolean)
                        .join(" ")}
                    </p>
                  )}
                  {r.payment_reference ? (
                    <p className="text-sm text-[var(--muted)]">
                      Ref. {r.payment_reference}
                    </p>
                  ) : null}
                </div>
                <p className="text-right font-display text-xl font-semibold tabular-nums">
                  {formatCOP(r.paid_amount ?? r.amount)}
                </p>
              </div>

              <ul className="mt-3 space-y-1.5 border-t border-[var(--line)] pt-3">
                {r.legs.map((leg) => (
                  <li
                    key={leg.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <span className="text-[var(--muted)]">
                      {leg.account_name}
                      {leg.is_cash_float ? " · Base" : ""}
                      {leg.fund_purpose ? (
                        <span
                          className={cn(
                            "ml-2 text-xs uppercase tracking-wide",
                            leg.fund_purpose === "VENTAS"
                              ? "text-[var(--ok)]"
                              : "text-[var(--muted)]",
                          )}
                        >
                          {leg.fund_purpose === "VENTAS" ? "Ventas" : "Empresa"}
                        </span>
                      ) : null}
                    </span>
                    <span className="font-medium tabular-nums text-[var(--ink)]">
                      {formatCOP(leg.debit)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
                {r.paid_by_name ? <span>Ejecutó: {r.paid_by_name}</span> : null}
                {r.approved_by_name ? (
                  <span>Aprobó: {r.approved_by_name}</span>
                ) : null}
                {r.notes ? <span className="basis-full">Notas: {r.notes}</span> : null}
                <Link
                  href="/solicitudes-pago"
                  className="text-[var(--accent)] underline-offset-2 hover:underline"
                >
                  Ver bandeja
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
