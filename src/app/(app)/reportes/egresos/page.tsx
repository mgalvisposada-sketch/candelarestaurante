import { AppHeader } from "@/components/layout/app-header";
import {
  Card,
  EmptyState,
  PageIntro,
  StatCard,
} from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { requireModuleAccess } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatCOP } from "@/lib/money";
import { todayInBogota } from "@/lib/dates";
import {
  loadExpenseByAccountReport,
  type ExpenseByAccountFilters,
} from "@/lib/reports/expense-by-account";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ReportesNav } from "../reportes-nav";
import {
  EgresosExecutiveView,
  EgresosFiltersForm,
  EgresosReportActions,
} from "./egresos-report-client";

type SearchParams = {
  from?: string;
  to?: string;
  account_id?: string;
  fund_purpose?: string;
  source?: string;
  category_key?: string;
};

function startOfMonthBogota(): string {
  const today = todayInBogota();
  const d = new Date(`${today}T12:00:00-05:00`);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

export default async function ReportesEgresosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "reportes");

  if (!ctx.organization) {
    return (
      <>
        <AppHeader title="Reportes" subtitle="Egresos ejecutivos" />
        <main className="p-8">
          <Card>
            <p className="font-medium">Primero configura la empresa</p>
            <Link
              href="/empresa"
              className="mt-4 inline-flex rounded-lg bg-[var(--solid)] px-4 py-2 text-sm text-[var(--on-solid)]"
            >
              Ir a Empresa
            </Link>
          </Card>
        </main>
      </>
    );
  }

  const sp = await searchParams;
  const filters: ExpenseByAccountFilters = {
    from: sp.from?.trim() || startOfMonthBogota(),
    to: sp.to?.trim() || todayInBogota(),
    account_id: sp.account_id?.trim() || "",
    fund_purpose: sp.fund_purpose?.trim() || "",
    source: sp.source?.trim() || "",
    category_key: sp.category_key?.trim() || "",
  };

  const supabase = await createClient();
  const report = await loadExpenseByAccountReport(
    supabase,
    ctx.organization.id,
    filters,
  );

  const activeAccount = report.byAccount.find(
    (a) => a.bank_account_id === filters.account_id,
  );
  const activeCategory = report.byCategory.find(
    (c) => c.category_key === filters.category_key,
  );

  return (
    <>
      <AppHeader title="Reportes" subtitle="Egresos ejecutivos" />
      <main className="mx-auto max-w-6xl space-y-6 p-6 md:p-8 print:max-w-none print:p-0">
        <div className="no-print print:hidden">
          <ReportesNav />
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageIntro
            title="Informe ejecutivo de egresos"
            description="Resumen por categoría (expandible) y cruce dinámico con las cuentas que desembolsaron. Base caja: pagos ejecutados, sin traspasos."
          />
          <EgresosReportActions details={report.details} filters={filters} />
        </div>

        <div className="print:mb-4">
          <p className="hidden text-sm text-[var(--muted)] print:block">
            Período: {filters.from} → {filters.to}
            {activeAccount
              ? ` · Cuenta: ${activeAccount.is_cash_float ? "Caja · " : ""}${activeAccount.account_name}`
              : ""}
            {activeCategory
              ? ` · Categoría: ${activeCategory.category_name}`
              : ""}
            {filters.fund_purpose
              ? ` · ${filters.fund_purpose === "EMPRESA" ? "Empresa" : "Ventas"}`
              : ""}
            {filters.source ? ` · Origen ${filters.source}` : ""}
          </p>
        </div>

        <div className="no-print print:hidden">
          <EgresosFiltersForm
            filters={filters}
            accounts={report.accounts}
            categories={report.categories}
          />
        </div>

        {report.truncated ? (
          <p className="no-print rounded-lg border border-amber-600 bg-amber-50 px-3 py-2 text-sm text-amber-950 print:hidden">
            El rango tiene muchos pagos; el informe puede estar truncado. Acota
            las fechas para un resultado completo.
          </p>
        ) : null}

        {(filters.account_id ||
          filters.category_key ||
          filters.source ||
          filters.fund_purpose) && (
          <div className="no-print flex flex-wrap items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm print:hidden">
            <span className="text-[var(--muted)]">Filtros activos:</span>
            {activeAccount ? (
              <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[var(--ink)]">
                Cuenta: {activeAccount.is_cash_float ? "Caja · " : ""}
                {activeAccount.account_name}
              </span>
            ) : null}
            {activeCategory ? (
              <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[var(--ink)]">
                Categoría: {activeCategory.category_name}
              </span>
            ) : null}
            {filters.fund_purpose ? (
              <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[var(--ink)]">
                {filters.fund_purpose === "EMPRESA" ? "Empresa" : "Ventas"}
              </span>
            ) : null}
            {filters.source ? (
              <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[var(--ink)]">
                Origen: {filters.source}
              </span>
            ) : null}
            <Link
              href={`/reportes/egresos?from=${filters.from}&to=${filters.to}`}
              className="ml-auto text-xs font-medium underline-offset-2 hover:underline"
            >
              Quitar filtros
            </Link>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total egresado"
            value={formatCOP(report.totals.total)}
            hint={`${filters.from} → ${filters.to}`}
          />
          <StatCard
            label="Categorías"
            value={String(report.totals.category_count)}
            hint="Con egreso en el filtro"
          />
          <StatCard
            label="Cuentas"
            value={String(report.totals.account_count)}
            hint="Cuentas que desembolsaron"
          />
          <StatCard
            label="Pagos"
            value={String(report.totals.payment_count)}
            hint={`${report.totals.leg_count} movimientos`}
          />
        </div>

        {report.details.length === 0 ? (
          <EmptyState
            title="Sin egresos en el período"
            description="Cuando se confirmen pagos en Solicitudes de pago, aparecerán aquí agrupados por categoría y cuenta."
          />
        ) : (
          <EgresosExecutiveView
            byCategory={report.byCategory}
            byAccount={report.byAccount}
            bySource={report.bySource}
            filters={filters}
            grandTotal={report.totals.total}
          />
        )}
      </main>
    </>
  );
}
