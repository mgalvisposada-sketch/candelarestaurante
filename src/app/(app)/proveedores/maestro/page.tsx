import { AppHeader } from "@/components/layout/app-header";
import { Badge, Card, PageIntro } from "@/components/ui/primitives";
import {
  WorkEmptyHint,
  WorkSection,
  WorkStack,
} from "@/components/ui/work-section";
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
  type ApDocRow,
  type ProductCategoryOption,
  type ProveedoresCaps,
  type SupplierRow,
} from "../suppliers-client";
import { compareSuppliersByPriority } from "@/lib/suppliers/priority";

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
              className="mt-4 inline-flex rounded-lg bg-[var(--solid)] px-4 py-2 text-sm text-[var(--on-solid)]"
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
  const billedBySupplier = new Map<string, ReturnType<typeof money>>();
  const openDocsCountBySupplier = new Map<string, number>();
  const docsBySupplier = new Map<string, ApDocRow[]>();

  const OPEN_PAYMENT_STATUSES = new Set([
    "BORRADOR",
    "EN_REVISION",
    "APROBADA",
    "EN_COLA_PAGO",
  ]);

  if (ids.length > 0) {
    // CxP (compras) + solicitudes de pago sin documento CxP (gastos, etc.)
    const [{ data: docs }, { data: payReqs }] = await Promise.all([
      supabase
        .from("accounts_payable_documents")
        .select(
          "id, supplier_id, document_type, document_number, issue_date, due_date, concept, original_amount, paid_amount, status, priority, verification_status, observation, comments, source",
        )
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .in("supplier_id", ids)
        .order("issue_date", { ascending: false }),
      supabase
        .from("payment_requests")
        .select(
          "id, source, status, priority, concept, amount, requested_at, due_date, supplier_id, document_number, document_type, issue_date, notes, ap_document_id",
        )
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .is("ap_document_id", null)
        .in("supplier_id", ids)
        .order("requested_at", { ascending: false }),
    ]);

    for (const d of (docs ?? []) as ApDocRow[]) {
      const list = docsBySupplier.get(d.supplier_id) ?? [];
      list.push(d);
      docsBySupplier.set(d.supplier_id, list);

      if (d.status === "ANULADA") continue;
      const bal = apDocumentBalance(d.original_amount, d.paid_amount);
      balanceBySupplier.set(
        d.supplier_id,
        (balanceBySupplier.get(d.supplier_id) ?? money(0)).plus(bal),
      );
      billedBySupplier.set(
        d.supplier_id,
        (billedBySupplier.get(d.supplier_id) ?? money(0)).plus(
          money(d.original_amount),
        ),
      );
      if (d.status === "ABIERTA" || d.status === "PARCIAL" || bal.gt(0)) {
        openDocsCountBySupplier.set(
          d.supplier_id,
          (openDocsCountBySupplier.get(d.supplier_id) ?? 0) + 1,
        );
      }
    }

    for (const pr of payReqs ?? []) {
      if (!pr.supplier_id) continue;
      const status = String(pr.status);
      const amount = money(pr.amount);
      const isVoid = status === "ANULADA" || status === "RECHAZADA";
      const isPaid = status === "PAGADA";
      const isOpen = OPEN_PAYMENT_STATUSES.has(status);

      const asDoc: ApDocRow = {
        id: `pr:${pr.id}`,
        supplier_id: pr.supplier_id,
        document_type: pr.document_type || "FACTURA",
        document_number: pr.document_number,
        issue_date: pr.issue_date || pr.requested_at?.slice(0, 10) || null,
        due_date: pr.due_date,
        concept: pr.concept
          ? `${pr.source === "GASTO" ? "Gasto" : "Solicitud"}: ${pr.concept}`
          : pr.source === "GASTO"
            ? "Gasto por pagar"
            : "Solicitud de pago",
        original_amount: amount.toNumber(),
        paid_amount: isPaid ? amount.toNumber() : 0,
        status: isVoid ? "ANULADA" : isPaid ? "PAGADA" : "ABIERTA",
        priority: pr.priority || "NORMAL",
        verification_status: isOpen || isPaid ? "CONFIRMADO" : "PENDIENTE",
        observation: pr.notes,
        comments: null,
        source: pr.source || "GASTO",
      };

      const list = docsBySupplier.get(pr.supplier_id) ?? [];
      list.push(asDoc);
      docsBySupplier.set(pr.supplier_id, list);

      if (isVoid) continue;

      billedBySupplier.set(
        pr.supplier_id,
        (billedBySupplier.get(pr.supplier_id) ?? money(0)).plus(amount),
      );

      if (isOpen) {
        balanceBySupplier.set(
          pr.supplier_id,
          (balanceBySupplier.get(pr.supplier_id) ?? money(0)).plus(amount),
        );
        openDocsCountBySupplier.set(
          pr.supplier_id,
          (openDocsCountBySupplier.get(pr.supplier_id) ?? 0) + 1,
        );
      }
    }

    // Historial: más reciente primero (CxP + gastos mezclados)
    for (const [sid, list] of docsBySupplier) {
      list.sort((a, b) => {
        const ka = a.issue_date || a.due_date || "";
        const kb = b.issue_date || b.due_date || "";
        if (ka && kb) return kb.localeCompare(ka);
        if (ka) return -1;
        if (kb) return 1;
        return 0;
      });
      docsBySupplier.set(sid, list);
    }
  }

  const balanceRecord = Object.fromEntries(
    [...balanceBySupplier.entries()].map(([id, bal]) => [id, bal.toNumber()]),
  );
  const billedRecord = Object.fromEntries(
    [...billedBySupplier.entries()].map(([id, total]) => [
      id,
      total.toNumber(),
    ]),
  );
  const suppliersRanked = [...suppliers].sort((a, b) =>
    compareSuppliersByPriority(a, b, balanceRecord, billedRecord),
  );

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
        <PageIntro
          title="Maestro de proveedores"
          description="Catálogo de contactos, tipo (insumos o administrativo) y categorías. El saldo e historial incluyen facturas de compras (CxP) y gastos por pagar. Quien tiene deuda sube arriba; al pagar vuelve al ranking por volumen (de más a menos)."
        />

        <WorkStack>
          {caps.canManageCategories || caps.canCreateSupplier ? (
            <WorkSection
              kind="form"
              title="Alta en maestro"
              description="Categorías de insumo y nuevos proveedores."
              defaultOpen={suppliers.length === 0}
            >
              <div className="grid gap-6 lg:grid-cols-2">
                {caps.canManageCategories ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Nueva categoría</p>
                    <CreateCategoryMasterForm
                      canManage={caps.canManageCategories}
                      embedded
                    />
                  </div>
                ) : null}
                {caps.canCreateSupplier ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Nuevo proveedor</p>
                    <CreateSupplierForm
                      categories={categories}
                      canCreate={caps.canCreateSupplier}
                      embedded
                    />
                  </div>
                ) : null}
              </div>
            </WorkSection>
          ) : null}

          <WorkSection
            kind="list"
            title="Categorías de insumo"
            description="Maestro compartido con inventario de compras."
            badge={<Badge tone="neutral">{categories.length}</Badge>}
            defaultOpen={categories.length > 0}
          >
            {categories.length === 0 ? (
              <WorkEmptyHint
                title="Sin categorías"
                description="Cree la primera categoría de insumo arriba."
              />
            ) : (
              <CategoryMasterList
                categories={categories}
                canManage={caps.canManageCategories}
              />
            )}
          </WorkSection>

          <WorkSection
            kind="list"
            title="Proveedores"
            badge={<Badge tone="neutral">{suppliersRanked.length}</Badge>}
            summary={
              suppliersRanked.length === 0
                ? "Sin proveedores"
                : `${suppliersRanked.length} · deuda arriba · resto por compras`
            }
            defaultOpen
          >
            {suppliersRanked.length === 0 ? (
              <WorkEmptyHint
                title="Sin proveedores"
                description="Cree el maestro de proveedores. Luego cargue facturas en Cuentas por pagar."
              />
            ) : (
              <SupplierMasterList
                suppliers={suppliersRanked}
                categories={categories}
                balanceBySupplier={balanceRecord}
                billedBySupplier={billedRecord}
                docsCountBySupplier={Object.fromEntries(openDocsCountBySupplier)}
                documentsBySupplier={Object.fromEntries(docsBySupplier)}
                caps={caps}
              />
            )}
          </WorkSection>
        </WorkStack>
      </main>
    </>
  );
}
