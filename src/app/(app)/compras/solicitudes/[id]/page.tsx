import { AppHeader } from "@/components/layout/app-header";
import { Card } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess, requireModuleAccess } from "@/lib/permissions";
import { isSuperAdmin } from "@/types/domain";
import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ComprasNav } from "../../compras-nav";
import {
  RequestDetailClient,
  type CategoryOption,
  type CategorySupplierLink,
  type ItemRow,
  type ProductOption,
  type RequestDetail,
  type SupplierOption,
  type UnitOption,
} from "./request-detail-client";

export default async function CompraSolicitudDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "compras.solicitudes");
  if (!ctx.organization) redirect("/empresa");

  const supabase = await createClient();
  const { data: request } = await supabase
    .from("purchase_requests")
    .select(
      "id, title, status, notes, location_label, requested_at, needed_by, rejection_reason, payment_request_id",
    )
    .eq("id", id)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!request) notFound();

  const [
    { data: itemRows },
    { data: productRows },
    { data: supplierRows },
    { data: linkRows },
    { data: categoryRows },
    { data: unitRows },
  ] = await Promise.all([
      supabase
        .from("purchase_request_items")
        .select(
          "id, product_id, category_id, quantity_requested, quantity_approved, quantity_received, unit, suggested_supplier_id, approved_supplier_id, unit_cost_estimate, expected_delivery_date, status, notes, invoice_payment_request_id, invoice_ap_document_id",
        )
        .eq("purchase_request_id", id)
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .order("sort_order"),
      supabase
        .from("products")
        .select("id, name, unit, category_id, current_stock, min_stock, unit_cost")
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("suppliers")
        .select("id, name, lead_time_days")
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .eq("is_active", true)
        .eq("is_purchase_supplier", true)
        .order("name"),
      supabase
        .from("supplier_product_categories")
        .select("supplier_id, category_id, lead_time_days")
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .eq("is_active", true),
      supabase
        .from("product_categories")
        .select("id, name")
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null),
      supabase
        .from("product_units")
        .select("id, code, name")
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("code"),
    ]);

  const categories = new Map((categoryRows ?? []).map((c) => [c.id, c.name]));
  const productNameMap = new Map((productRows ?? []).map((p) => [p.id, p.name]));

  const products: ProductOption[] = (productRows ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    unit: p.unit,
    category_id: p.category_id,
    category_name: categories.get(p.category_id) ?? "Sin categoría",
    current_stock: p.current_stock ?? 0,
    min_stock: p.min_stock ?? 0,
    unit_cost: p.unit_cost ?? 0,
  }));

  const purchaseSupplierIds = new Set(
    (linkRows ?? []).map((l) => l.supplier_id),
  );
  const purchaseSuppliers = ((supplierRows ?? []) as SupplierOption[]).filter((s) =>
    purchaseSupplierIds.has(s.id),
  );

  const items: ItemRow[] = ((itemRows ?? []) as ItemRow[]).map((item) => ({
    ...item,
    product_name: productNameMap.get(item.product_id) ?? item.product_id,
    category_name: categories.get(item.category_id) ?? "Sin categoría",
  }));

  return (
    <>
      <AppHeader title="Compras" subtitle="Detalle de solicitud" />
      <main className="space-y-6 p-8">
        <ComprasNav
          permissions={ctx.permissions}
          isSuperAdmin={isSuperAdmin(ctx.role)}
        />
        <div>
          <Link href="/compras/solicitudes" className="text-sm text-[var(--accent)]">
            ← Volver a solicitudes
          </Link>
        </div>
        {products.length === 0 ? (
          <Card>
            <p className="font-medium">Falta maestro de inventario</p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Cree categorías y productos antes de armar la solicitud.
            </p>
            <Link
              href="/compras/inventario"
              className="mt-4 inline-flex rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white"
            >
              Ir a Inventario
            </Link>
          </Card>
        ) : null}
        <RequestDetailClient
          request={request as RequestDetail}
          items={items}
          products={products}
          categories={(categoryRows ?? []).map((c) => ({
            id: c.id,
            name: c.name,
          })) as CategoryOption[]}
          units={(unitRows ?? []) as UnitOption[]}
          suppliers={purchaseSuppliers}
          links={(linkRows ?? []) as CategorySupplierLink[]}
          canCreate={ctxCanAccess(ctx, "compras.solicitudes.crear")}
          canCreateProduct={
            ctxCanAccess(ctx, "compras.inventario") ||
            ctxCanAccess(ctx, "compras.solicitudes.crear") ||
            ctxCanAccess(ctx, "compras.solicitudes.recibir.extras")
          }
          canApprove={ctxCanAccess(ctx, "compras.solicitudes.aprobar")}
          canReceive={ctxCanAccess(ctx, "compras.solicitudes.recibir")}
          canReceiveExtras={ctxCanAccess(
            ctx,
            "compras.solicitudes.recibir.extras",
          )}
          canAcceptInvoice={
            ctxCanAccess(ctx, "compras.solicitudes.facturar") ||
            ctxCanAccess(ctx, "compras.solicitudes.aprobar") ||
            ctxCanAccess(ctx, "compras.solicitudes.recibir")
          }
        />
      </main>
    </>
  );
}
