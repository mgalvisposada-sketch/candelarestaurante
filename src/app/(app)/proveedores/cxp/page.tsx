import { AppHeader } from "@/components/layout/app-header";
import { Card, EmptyState, PageIntro, StatCard } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess, requireModuleAccess } from "@/lib/permissions";
import { isSuperAdmin } from "@/types/domain";
import { createClient } from "@/lib/supabase/server";
import { formatCOP, apDocumentBalance, money } from "@/lib/money";
import { summarizeApAging } from "@/lib/accounts-payable";
import { todayInBogota } from "@/lib/dates";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ProveedoresNav } from "../proveedores-nav";
import {
  SupplierCxpGroup,
  type ApDocRow,
  type ProveedoresCaps,
  type SupplierRow,
} from "../suppliers-client";

export default async function ProveedoresCxpPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "proveedores");
  if (!ctxCanAccess(ctx, "proveedores.cxp") && !isSuperAdmin(ctx.role)) {
    redirect("/proveedores/maestro");
  }
  if (!ctx.organization) {
    return (
      <>
        <AppHeader title="Proveedores & CxP" subtitle="Cuentas por pagar" />
        <main className="p-8">
          <Card>
            <p className="font-medium">Primero configura la empresa</p>
            <Link
              href="/empresa"
              className="mt-4 inline-flex rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white"
            >
              Ir a Empresa
            </Link>
          </Card>
        </main>
      </>
    );
  }

  const caps: ProveedoresCaps = {
    canCreateSupplier: ctxCanAccess(ctx, "proveedores.crear"),
    canEditSupplier: ctxCanAccess(ctx, "proveedores.editar"),
    canManageCategories: ctxCanAccess(ctx, "proveedores.categorias"),
    canCreateAp: ctxCanAccess(ctx, "proveedores.cxp.crear"),
    canEditAp: ctxCanAccess(ctx, "proveedores.cxp.editar"),
    canPay: ctxCanAccess(ctx, "proveedores.cxp.pagar"),
  };

  const supabase = await createClient();
  const [{ data: supplierRows }, { data: docs }] = await Promise.all([
    supabase
      .from("suppliers")
      .select(
        "id, name, tax_id, contact_name, phone, email, category, bank_account_info, notes, is_active, is_purchase_supplier, is_expense_supplier, purchase_payment_terms",
      )
      .eq("organization_id", ctx.organization.id)
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("accounts_payable_documents")
      .select(
        "id, supplier_id, document_type, document_number, issue_date, due_date, concept, original_amount, paid_amount, status, priority, verification_status, observation, comments, source",
      )
      .eq("organization_id", ctx.organization.id)
      .is("deleted_at", null)
      .order("due_date", { ascending: true }),
  ]);

  const suppliers: SupplierRow[] = ((supplierRows ?? []) as Array<
    Omit<SupplierRow, "category_ids"> & { is_expense_supplier?: boolean }
  >).map((s) => ({
    ...s,
    is_expense_supplier: Boolean(s.is_expense_supplier),
    category_ids: [],
  }));
  const documents = (docs ?? []) as ApDocRow[];
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));

  const openDocs = documents.filter((d) => d.status !== "ANULADA");
  let total = money(0);
  let confirmed = money(0);
  let declared = money(0);
  let pending = money(0);
  let critica = money(0);

  for (const d of openDocs) {
    const bal = apDocumentBalance(d.original_amount, d.paid_amount);
    total = total.plus(bal);
    if (d.verification_status === "CONFIRMADO") confirmed = confirmed.plus(bal);
    if (d.verification_status === "DECLARADO") declared = declared.plus(bal);
    if (d.verification_status === "PENDIENTE") pending = pending.plus(bal);
    if (d.priority === "CRITICA") critica = critica.plus(bal);
  }

  const aging = summarizeApAging(
    openDocs.map((d) => ({
      dueDate: d.due_date,
      originalAmount: d.original_amount,
      paidAmount: d.paid_amount,
    })),
    todayInBogota(),
  );

  const docsBySupplier = new Map<string, ApDocRow[]>();
  for (const d of documents) {
    const list = docsBySupplier.get(d.supplier_id) ?? [];
    list.push(d);
    docsBySupplier.set(d.supplier_id, list);
  }

  const groups = [...docsBySupplier.entries()]
    .map(([supplierId, docsForSupplier]) => ({
      supplier: supplierById.get(supplierId),
      documents: docsForSupplier,
    }))
    .filter(
      (g): g is { supplier: SupplierRow; documents: ApDocRow[] } =>
        Boolean(g.supplier),
    )
    .sort((a, b) => a.supplier.name.localeCompare(b.supplier.name, "es"));

  return (
    <>
      <AppHeader
        title="Proveedores & CxP"
        subtitle="Cuentas por pagar"
      />
      <main className="space-y-6 p-8">
        <ProveedoresNav
          permissions={ctx.permissions}
          isSuperAdmin={isSuperAdmin(ctx.role)}
        />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageIntro
            title="Cuentas por pagar"
            description="Cartera de costos de insumos/materias primas que llegan desde Compras. No se cargan facturas a mano ni se paga aquí: el pago se gestiona en Solicitudes de pago y el saldo se actualiza solo. Gastos operativos (arriendo, gas, etc.) van en Gastos."
          />
          <div className="flex flex-wrap gap-2">
            <Link
              href="/gastos"
              className="rounded-lg border border-[var(--line)] px-4 py-2.5 text-sm font-medium"
            >
              Ir a Gastos
            </Link>
            <Link
              href="/solicitudes-pago"
              className="rounded-lg border border-[var(--line)] px-4 py-2.5 text-sm font-medium"
            >
              Ir a solicitudes de pago
            </Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Total CxP" value={formatCOP(total)} />
          <StatCard label="Confirmada" value={formatCOP(confirmed)} />
          <StatCard label="Declarada" value={formatCOP(declared)} />
          <StatCard label="Pendiente soporte" value={formatCOP(pending)} />
          <StatCard label="Crítica" value={formatCOP(critica)} />
        </div>

        <Card>
          <h3 className="font-medium">Aging</h3>
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
            <div>
              0-30: <strong>{formatCOP(aging["0-30"])}</strong>
            </div>
            <div>
              31-60: <strong>{formatCOP(aging["31-60"])}</strong>
            </div>
            <div>
              61-90: <strong>{formatCOP(aging["61-90"])}</strong>
            </div>
            <div>
              +90: <strong>{formatCOP(aging[">90"])}</strong>
            </div>
            <div>
              Sin venc.: <strong>{formatCOP(aging.sin_vencimiento)}</strong>
            </div>
          </div>
        </Card>

        {suppliers.length === 0 ? (
          <EmptyState
            title="Sin proveedores"
            description="Cree proveedores en el maestro. Las facturas de insumos llegarán aquí desde Compras."
          />
        ) : groups.length === 0 ? (
          <EmptyState
            title="Sin documentos CxP"
            description="Acepte una factura desde Compras (tras recibir insumos). Quedará en esta cartera y en Solicitudes de pago."
          />
        ) : (
          <div className="space-y-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-medium">
                Deuda por proveedor ({groups.length})
              </h3>
              <Link
                href="/proveedores/maestro"
                className="text-sm text-[var(--muted)]"
              >
                Maestro de proveedores
              </Link>
            </div>
            {groups.map((g) => (
              <SupplierCxpGroup
                key={g.supplier.id}
                supplier={g.supplier}
                documents={g.documents}
                allSuppliers={suppliers.filter((s) => s.is_active)}
                caps={caps}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
