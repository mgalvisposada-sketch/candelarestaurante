"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatCOP, money } from "@/lib/money";
import { formatDateCO, todayInBogota } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type {
  AccountSummary,
  CategorySummary,
  ExpenseByAccountDetail,
  ExpenseByAccountFilters,
  ReportFilterOption,
  SourceSummary,
} from "@/lib/reports/expense-by-account-types";

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]";

function daysAgo(n: number, base = todayInBogota()): string {
  const d = new Date(`${base}T12:00:00-05:00`);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function monthBounds(offsetMonths: number): { from: string; to: string } {
  const today = todayInBogota();
  const d = new Date(`${today}T12:00:00-05:00`);
  d.setDate(1);
  d.setMonth(d.getMonth() + offsetMonths);
  const from = d.toISOString().slice(0, 10);
  const end = new Date(d);
  end.setMonth(end.getMonth() + 1);
  end.setDate(0);
  const to = offsetMonths === 0 ? today : end.toISOString().slice(0, 10);
  return { from, to };
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function downloadCsv(
  details: ExpenseByAccountDetail[],
  filters: ExpenseByAccountFilters,
) {
  const header = [
    "Fecha",
    "Cuenta",
    "Propósito",
    "Origen",
    "Categoría",
    "Concepto",
    "Proveedor",
    "Documento",
    "Referencia",
    "Monto",
    "Id solicitud",
  ];
  const lines = [header.join(",")];
  for (const r of details) {
    lines.push(
      [
        r.transaction_date,
        `${r.account_name}${r.is_cash_float ? " (Caja)" : ""}`,
        r.fund_purpose === "EMPRESA"
          ? "Empresa"
          : r.fund_purpose
            ? "Ventas"
            : "",
        r.source_label,
        r.category_name,
        r.concept,
        r.supplier_name ?? "",
        r.document_label ?? "",
        r.payment_reference ?? "",
        r.debit,
        r.payment_request_id,
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
  a.download = `egresos-ejecutivo-${filters.from}_${filters.to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function buildHref(
  filters: ExpenseByAccountFilters,
  patch: Partial<ExpenseByAccountFilters>,
): string {
  const next = { ...filters, ...patch };
  const params = new URLSearchParams();
  if (next.from) params.set("from", next.from);
  if (next.to) params.set("to", next.to);
  if (next.account_id) params.set("account_id", next.account_id);
  if (next.fund_purpose) params.set("fund_purpose", next.fund_purpose);
  if (next.source) params.set("source", next.source);
  if (next.category_key) params.set("category_key", next.category_key);
  const qs = params.toString();
  return qs ? `/reportes/egresos?${qs}` : "/reportes/egresos";
}

export function EgresosFiltersForm({
  filters,
  accounts,
  categories,
}: {
  filters: ExpenseByAccountFilters;
  accounts: ReportFilterOption[];
  categories: ReportFilterOption[];
}) {
  const thisMonth = monthBounds(0);
  const lastMonth = monthBounds(-1);
  const last30 = { from: daysAgo(30), to: todayInBogota() };
  const last90 = { from: daysAgo(90), to: todayInBogota() };

  const presets = [
    { label: "Mes actual", ...thisMonth },
    { label: "Mes anterior", ...lastMonth },
    { label: "Últimos 30 días", ...last30 },
    { label: "Últimos 90 días", ...last90 },
  ];

  return (
    <div className="no-print space-y-3 print:hidden">
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <Link
            key={p.label}
            href={buildHref(filters, { from: p.from, to: p.to })}
            className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] hover:bg-neutral-50"
          >
            {p.label}
          </Link>
        ))}
      </div>

      <form
        method="get"
        className="grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)] md:grid-cols-12"
      >
        <p className="md:col-span-12 text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
          Filtros del informe
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
          <span className="mb-1 block text-[var(--muted)]">Propósito</span>
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
        <label className="block text-sm md:col-span-3">
          <span className="mb-1 block text-[var(--muted)]">Categoría</span>
          <select
            name="category_key"
            defaultValue={filters.category_key}
            className={inputClass}
          >
            <option value="">Todas</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm md:col-span-3">
          <span className="mb-1 block text-[var(--muted)]">Origen</span>
          <select
            name="source"
            defaultValue={filters.source}
            className={inputClass}
          >
            <option value="">Todos</option>
            <option value="FACTURA_PROVEEDOR">Factura proveedor</option>
            <option value="GASTO">Gasto</option>
            <option value="SOLICITUD_INTERNA">Solicitud interna</option>
          </select>
        </label>
        <div className="flex items-end gap-2 md:col-span-9">
          <button
            type="submit"
            className="rounded-lg bg-[var(--solid)] px-4 py-2.5 text-sm font-medium text-[var(--on-solid)]"
          >
            Aplicar filtros
          </button>
          <Link
            href="/reportes/egresos"
            className="rounded-lg border border-[var(--line)] px-4 py-2.5 text-sm font-medium hover:bg-neutral-50"
          >
            Limpiar
          </Link>
        </div>
      </form>
    </div>
  );
}

export function EgresosReportActions({
  details,
  filters,
}: {
  details: ExpenseByAccountDetail[];
  filters: ExpenseByAccountFilters;
}) {
  return (
    <div className="no-print flex flex-wrap gap-2 print:hidden">
      <button
        type="button"
        onClick={() => downloadCsv(details, filters)}
        disabled={details.length === 0}
        className="rounded-lg border border-[var(--line)] px-4 py-2.5 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
      >
        Exportar CSV
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-lg border border-[var(--line)] px-4 py-2.5 text-sm font-medium hover:bg-neutral-50"
      >
        Imprimir / PDF
      </button>
    </div>
  );
}

export function AccountQuickFilters({
  accounts,
  filters,
}: {
  accounts: AccountSummary[];
  filters: ExpenseByAccountFilters;
}) {
  if (accounts.length === 0) return null;

  return (
    <div className="no-print space-y-2 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
          Alinear por cuenta
        </p>
        {filters.account_id ? (
          <Link
            href={buildHref(filters, { account_id: "" })}
            className="text-xs font-medium text-[var(--ink)] underline-offset-2 hover:underline"
          >
            Ver todas las cuentas
          </Link>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {accounts.map((a) => {
          const active = filters.account_id === a.bank_account_id;
          return (
            <Link
              key={a.bank_account_id}
              href={buildHref(filters, {
                account_id: active ? "" : a.bank_account_id,
              })}
              className={cn(
                "rounded-lg border px-3 py-2 text-left transition-colors",
                active
                  ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--on-solid)]"
                  : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--ink)]",
              )}
            >
              <span className="block text-sm font-medium">
                {a.is_cash_float ? "Caja · " : ""}
                {a.account_name}
              </span>
              <span
                className={cn(
                  "mt-0.5 block text-xs tabular-nums",
                  active ? "text-white/80" : "text-[var(--muted)]",
                )}
              >
                {formatCOP(a.total)} · {a.share_pct}%
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function CategoryDetailRows({ rows }: { rows: ExpenseByAccountDetail[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--line)] bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-[var(--line)] bg-[var(--surface)] text-xs uppercase tracking-[0.08em] text-[var(--muted)]">
          <tr>
            <th className="px-3 py-2 font-medium">Fecha</th>
            <th className="px-3 py-2 font-medium">Cuenta</th>
            <th className="px-3 py-2 font-medium">Concepto</th>
            <th className="px-3 py-2 font-medium">Proveedor</th>
            <th className="px-3 py-2 font-medium">Origen</th>
            <th className="px-3 py-2 font-medium text-right">Monto</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className="border-b border-[var(--line)] last:border-0 align-top"
            >
              <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                {formatDateCO(r.transaction_date)}
              </td>
              <td className="px-3 py-2">
                {r.is_cash_float ? "Caja · " : ""}
                {r.account_name}
              </td>
              <td className="max-w-[240px] px-3 py-2">
                <span className="line-clamp-2">{r.concept}</span>
                {r.document_label ? (
                  <span className="mt-0.5 block text-xs text-[var(--muted)]">
                    {r.document_label}
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-2 text-[var(--muted)]">
                {r.supplier_name ?? "—"}
              </td>
              <td className="px-3 py-2 text-[var(--muted)]">{r.source_label}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums">
                {formatCOP(r.debit)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EgresosExecutiveView({
  byCategory,
  byAccount,
  bySource,
  filters,
  grandTotal,
}: {
  byCategory: CategorySummary[];
  byAccount: AccountSummary[];
  bySource: SourceSummary[];
  filters: ExpenseByAccountFilters;
  grandTotal: string;
}) {
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());
  const allOpen = openKeys.size > 0 && openKeys.size === byCategory.length;

  const totalNum = useMemo(() => money(grandTotal), [grandTotal]);

  function toggle(key: string) {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    if (allOpen) setOpenKeys(new Set());
    else setOpenKeys(new Set(byCategory.map((c) => c.category_key)));
  }

  if (byCategory.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">Sin egresos en el período.</p>
    );
  }

  return (
    <div className="space-y-6">
      <AccountQuickFilters accounts={byAccount} filters={filters} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-[var(--ink)]">
              Gastos por categoría
            </h2>
            <p className="text-sm text-[var(--muted)]">
              Vista ejecutiva: expande cada categoría para ver el detalle y de
              qué cuenta salió.
            </p>
          </div>
          <button
            type="button"
            onClick={toggleAll}
            className="no-print rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 print:hidden"
          >
            {allOpen ? "Colapsar todo" : "Expandir todo"}
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-[var(--line)]">
          {byCategory.map((cat) => {
            const open = openKeys.has(cat.category_key);
            const barWidth =
              totalNum.gt(0) && cat.share_pct > 0
                ? Math.max(cat.share_pct, 2)
                : 0;

            return (
              <div
                key={cat.category_key}
                className="border-b border-[var(--line)] last:border-0"
              >
                <button
                  type="button"
                  onClick={() => toggle(cat.category_key)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface)]"
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[var(--line)] text-xs text-[var(--muted)]",
                      open && "bg-neutral-100 text-[var(--ink)]",
                    )}
                    aria-hidden
                  >
                    {open ? "−" : "+"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-[var(--ink)]">
                          {cat.category_name}
                        </p>
                        <p className="text-xs text-[var(--muted)]">
                          {cat.payment_count} pago
                          {cat.payment_count === 1 ? "" : "s"} ·{" "}
                          {cat.leg_count} movimiento
                          {cat.leg_count === 1 ? "" : "s"}
                          {cat.is_synthetic ? " · agrupación automática" : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold tabular-nums text-[var(--ink)]">
                          {formatCOP(cat.total)}
                        </p>
                        <p className="text-xs tabular-nums text-[var(--muted)]">
                          {cat.share_pct}% del total
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                      <div
                        className="h-full rounded-full bg-[var(--ink)]/70"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                </button>

                {open ? (
                  <div className="space-y-3 border-t border-[var(--line)] bg-[var(--surface)]/60 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
                        Salida por cuenta en esta categoría
                      </p>
                      <Link
                        href={buildHref(filters, {
                          category_key:
                            filters.category_key === cat.category_key
                              ? ""
                              : cat.category_key,
                        })}
                        className="no-print text-xs font-medium text-[var(--ink)] underline-offset-2 hover:underline print:hidden"
                      >
                        {filters.category_key === cat.category_key
                          ? "Quitar filtro de categoría"
                          : "Filtrar solo esta categoría"}
                      </Link>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {cat.by_account.map((slice) => {
                        const active =
                          filters.account_id === slice.bank_account_id;
                        return (
                          <Link
                            key={slice.bank_account_id}
                            href={buildHref(filters, {
                              account_id: active
                                ? ""
                                : slice.bank_account_id,
                              category_key: cat.category_key,
                            })}
                            className={cn(
                              "rounded-md border px-2.5 py-1.5 text-xs",
                              active
                                ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--on-solid)]"
                                : "border-[var(--line)] bg-white hover:border-[var(--ink)]",
                            )}
                          >
                            {slice.is_cash_float ? "Caja · " : ""}
                            {slice.account_name}: {formatCOP(slice.total)} (
                            {slice.share_pct}%)
                          </Link>
                        );
                      })}
                    </div>

                    <CategoryDetailRows rows={cat.details} />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-[var(--ink)]">
            Resumen por cuenta
          </h3>
          <div className="overflow-hidden rounded-xl border border-[var(--line)]">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--line)] bg-[var(--surface)] text-xs uppercase tracking-[0.08em] text-[var(--muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Cuenta</th>
                  <th className="px-3 py-2 font-medium text-right">%</th>
                  <th className="px-3 py-2 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {byAccount.map((a) => (
                  <tr
                    key={a.bank_account_id}
                    className="border-b border-[var(--line)] last:border-0"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={buildHref(filters, {
                          account_id:
                            filters.account_id === a.bank_account_id
                              ? ""
                              : a.bank_account_id,
                        })}
                        className="font-medium text-[var(--ink)] underline-offset-2 hover:underline"
                      >
                        {a.is_cash_float ? "Caja · " : ""}
                        {a.account_name}
                      </Link>
                      <span className="mt-0.5 block text-xs text-[var(--muted)]">
                        {a.fund_purpose_label} · {a.payment_count} pagos
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--muted)]">
                      {a.share_pct}%
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {formatCOP(a.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-[var(--ink)]">
            Resumen por origen
          </h3>
          <div className="overflow-hidden rounded-xl border border-[var(--line)]">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--line)] bg-[var(--surface)] text-xs uppercase tracking-[0.08em] text-[var(--muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Origen</th>
                  <th className="px-3 py-2 font-medium text-right">%</th>
                  <th className="px-3 py-2 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {bySource.map((s) => (
                  <tr
                    key={s.source}
                    className="border-b border-[var(--line)] last:border-0"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={buildHref(filters, {
                          source:
                            filters.source === s.source ? "" : s.source,
                        })}
                        className="font-medium text-[var(--ink)] underline-offset-2 hover:underline"
                      >
                        {s.label}
                      </Link>
                      <span className="mt-0.5 block text-xs text-[var(--muted)]">
                        {s.payment_count} pagos
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--muted)]">
                      {s.share_pct}%
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {formatCOP(s.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
