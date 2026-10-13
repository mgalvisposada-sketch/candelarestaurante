import { AppHeader } from "@/components/layout/app-header";
import {
  Badge,
  Card,
  PageIntro,
  StatCard,
} from "@/components/ui/primitives";
import {
  WorkEmptyHint,
  WorkSection,
  WorkStack,
} from "@/components/ui/work-section";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess, requireModuleAccess } from "@/lib/permissions";
import { isSuperAdmin } from "@/types/domain";
import { createClient } from "@/lib/supabase/server";
import { formatCOP, money } from "@/lib/money";
import { redirect } from "next/navigation";
import Link from "next/link";
import { GastosNav } from "./gastos-nav";
import {
  CreateExpenseForm,
  CreateShiftLiquidationForm,
  ExpenseList,
  type CategoryRow,
  type ExpenseRow,
  type ShiftEmployeeOption,
  type SupplierOption,
} from "./expenses-client";

export default async function GastosPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "gastos");
  if (!ctx.organization) {
    return (
      <>
        <AppHeader title="Gastos" subtitle="Gastos operativos" />
        <main className="p-8">
          <Card>
            <p className="font-medium">Primero configura la empresa</p>
            <Link href="/empresa" className="mt-4 inline-flex rounded-lg bg-[var(--solid)] px-4 py-2 text-sm text-[var(--on-solid)]">
              Ir a Empresa
            </Link>
          </Card>
        </main>
      </>
    );
  }

  const canShiftLiquidation =
    ctxCanAccess(ctx, "gastos.liquidacion-turno") ||
    ctxCanAccess(ctx, "personal.liquidacion");
  const supabase = await createClient();
  const [{ data: catRows }, { data: expRows }, { data: supRows }, { data: shiftEmpRows }] =
    await Promise.all([
      supabase
        .from("expense_categories")
        .select("id, code, name")
        .eq("organization_id", ctx.organization.id)
        .eq("is_active", true)
        .order("code"),
      supabase
        .from("expenses")
        .select(
          "id, expense_date, concept, amount, tax_amount, total_amount, nature, criticality, status, category_id, supplier_id, shared_service, expense_kind, employee_id, period_year, period_month, period_half",
        )
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .order("expense_date", { ascending: false }),
      supabase
        .from("suppliers")
        .select("id, name")
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .eq("is_active", true)
        .eq("is_expense_supplier", true)
        .order("name"),
      canShiftLiquidation
        ? supabase
            .from("employees")
            .select("id, full_name, position_title, basic_salary, salary_or_fee")
            .eq("organization_id", ctx.organization.id)
            .eq("is_active", true)
            .eq("employment_type", "POR_TURNO")
            .is("deleted_at", null)
            .order("full_name")
        : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    ]);

  const categories = (catRows ?? []) as CategoryRow[];
  const expenses = (expRows ?? []) as ExpenseRow[];
  const suppliers = (supRows ?? []) as SupplierOption[];
  const shiftEmployees: ShiftEmployeeOption[] = (shiftEmpRows ?? []).map((e) => ({
    id: e.id as string,
    full_name: e.full_name as string,
    position_title: (e.position_title as string | null) ?? null,
    daily_rate: Number(e.basic_salary ?? e.salary_or_fee ?? 0) || null,
  }));

  const paid = expenses
    .filter((e) => e.status === "PAGADO")
    .reduce((acc, e) => acc.plus(money(e.total_amount)), money(0));
  const pendingPay = expenses
    .filter((e) => e.status === "APROBADO" || e.status === "BORRADOR")
    .reduce((acc, e) => acc.plus(money(e.total_amount)), money(0));

  return (
    <>
      <AppHeader
        title="Gastos"
        subtitle="Opex · facturas que no vienen de Compras"
      />
      <main className="space-y-6 p-8">
        <GastosNav
          permissions={ctx.permissions}
          isSuperAdmin={isSuperAdmin(ctx.role)}
        />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageIntro
            title="Gastos operativos"
            description="Facturas y cuentas de cobro operativas. Solo aparecen proveedores marcados como “Proveedor de gastos” en el maestro. Clasifique, envíe a Solicitudes de pago (aval de gerencia) y pague desde caja o banco. Los prestadores por turno se liquidan aquí, no en nómina."
          />
          <div className="flex flex-wrap gap-2">
            <Link
              href="/proveedores/maestro"
              className="rounded-lg border border-[var(--line)] px-4 py-2.5 text-sm font-medium"
            >
              Maestro de proveedores
            </Link>
            <Link
              href="/gastos/categorias"
              className="rounded-lg border border-[var(--line)] px-4 py-2.5 text-sm font-medium"
            >
              Maestro de categorías
            </Link>
            <Link
              href="/solicitudes-pago"
              className="rounded-lg border border-[var(--line)] px-4 py-2.5 text-sm font-medium"
            >
              Ir a solicitudes de pago
            </Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="Pagados" value={formatCOP(paid)} />
          <StatCard label="Pendientes de pago" value={formatCOP(pendingPay)} />
          <StatCard label="Registros" value={String(expenses.length)} />
        </div>

        <WorkStack>
          <WorkSection
            kind="form"
            title="Nueva factura / cuenta de cobro"
            description="Registra el gasto y lo envía a Solicitudes de pago."
            defaultOpen={expenses.length === 0}
          >
            <CreateExpenseForm
              categories={categories}
              suppliers={suppliers}
              embedded
            />
          </WorkSection>

          {canShiftLiquidation ? (
            <WorkSection
              kind="form"
              title="Liquidación por turno"
              description="Prestadores POR_TURNO: marque días y genere el gasto a pagar."
              defaultOpen={false}
            >
              <CreateShiftLiquidationForm
                categories={categories}
                employees={shiftEmployees}
                embedded
              />
            </WorkSection>
          ) : null}

          <WorkSection
            kind="list"
            title="Gastos registrados"
            badge={<Badge tone="neutral">{expenses.length}</Badge>}
            summary={
              expenses.length === 0
                ? "Sin registros"
                : `${formatCOP(pendingPay)} pendientes de pago`
            }
            defaultOpen
          >
            {expenses.length === 0 ? (
              <WorkEmptyHint
                title="Sin gastos"
                description="Registre una factura o cuenta de cobro operativa. Aparecerá en Solicitudes de pago para aprobar y pagar."
              />
            ) : (
              <ExpenseList
                expenses={expenses}
                categories={categories}
                suppliers={suppliers}
              />
            )}
          </WorkSection>
        </WorkStack>
      </main>
    </>
  );
}
