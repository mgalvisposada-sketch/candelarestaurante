import { AppHeader } from "@/components/layout/app-header";
import { Card, EmptyState, PageIntro } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess, requireModuleAccess } from "@/lib/permissions";
import { isSuperAdmin } from "@/types/domain";
import { createClient } from "@/lib/supabase/server";
import { apDocumentBalance, money } from "@/lib/money";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ProveedoresNav } from "../proveedores-nav";
import {
  CategoryMasterList,
  CreateCategoryMasterForm,
  CreateSupplierForm,
  SupplierMasterList,
  type ProductCategoryOption,
  type ProveedoresCaps,
  type SupplierRow,
} from "../suppliers-client";

export default async function ProveedoresMaestroPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "proveedores");
  if (!ctx.organization) {
    return (
      <>
        <AppHeader title="Proveedores & CxP" subtitle="Maestro de proveedores" />
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
  const [{ data: supplierRows }, { data: categoryRows }, { data: linkRows }] =
    await Promise.all([
      supabase
        .from("suppliers")
        .select(
          "id, name, tax_id, contact_name, phone, email, category, bank_account_info, notes, is_active, is_purchase_supplier, is_expense_supplier, purchase_payment_terms",
        )
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .order("name"),
      supabase
        .from("product_categories")
        .select("id, code, name")
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("code"),
      supabase
        .from("supplier_product_categories")
        .select("supplier_id, category_id")
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .eq("is_active", true),
    ]);

  const categories = (categoryRows ?? []) as ProductCategoryOption[];
  const linksBySupplier = new Map<string, string[]>();
  for (const link of linkRows ?? []) {
    const list = linksBySupplier.get(link.supplier_id) ?? [];
    list.push(link.category_id);
    linksBySupplier.set(link.supplier_id, list);
  }

  const suppliers: SupplierRow[] = ((supplierRows ?? []) as Array<
    Omit<SupplierRow, "category_ids"> & { is_expense_supplier?: boolean }
  >).map((s) => ({
    ...s,
    is_expense_supplier: Boolean(s.is_expense_supplier),
    category_ids: linksBySupplier.get(s.id) ?? [],
  }));
  const ids = suppliers.map((s) => s.id);

  const balanceBySupplier = new Map<string, ReturnType<typeof money>>();
  const docsCountBySupplier = new Map<string, number>();
  if (ids.length > 0) {
    const { data: docs } = await supabase
      .from("accounts_payable_documents")
      .select("id, supplier_id, original_amount, paid_amount, status")
      .eq("organization_id", ctx.organization.id)
      .is("deleted_at", null)
      .in("supplier_id", ids);

    for (const d of docs ?? []) {
      if (d.status === "ANULADA") continue;
      const bal = apDocumentBalance(d.original_amount, d.paid_amount);
      balanceBySupplier.set(
        d.supplier_id,
        (balanceBySupplier.get(d.supplier_id) ?? money(0)).plus(bal),
      );
      docsCountBySupplier.set(
        d.supplier_id,
        (docsCountBySupplier.get(d.supplier_id) ?? 0) + 1,
      );
    }
  }

  return (
    <>
      <AppHeader
        title="Proveedores & CxP"
        subtitle="Maestro de proveedores"
      />
      <main className="space-y-6 p-8">
        <ProveedoresNav
          permissions={ctx.permissions}
          isSuperAdmin={isSuperAdmin(ctx.role)}
        />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageIntro
            title="Maestro de proveedores"
            description="Catálogo secundario: contactos, tipo (insumos o administrativo) y categorías. El trabajo diario de facturas y saldos está en Cuentas por pagar."
          />
          <div className="flex flex-wrap gap-2">
            <CreateCategoryMasterForm canManage={caps.canManageCategories} />
            <CreateSupplierForm
              categories={categories}
              canCreate={caps.canCreateSupplier}
            />
          </div>
        </div>

        {categories.length > 0 ? (
          <Card>
            <h3 className="font-medium">Categorías de insumo</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Maestro compartido con inventario de compras.
            </p>
            <CategoryMasterList
              categories={categories}
              canManage={caps.canManageCategories}
            />
          </Card>
        ) : null}

        {suppliers.length === 0 ? (
          <EmptyState
            title="Sin proveedores"
            description="Cree el maestro de proveedores. Luego cargue facturas en Cuentas por pagar."
          />
        ) : (
          <SupplierMasterList
            suppliers={suppliers}
            categories={categories}
            balanceBySupplier={Object.fromEntries(
              [...balanceBySupplier.entries()].map(([id, bal]) => [
                id,
                bal.toNumber(),
              ]),
            )}
            docsCountBySupplier={Object.fromEntries(docsCountBySupplier)}
            caps={caps}
          />
        )}
      </main>
    </>
  );
}
