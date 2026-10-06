import { AppHeader } from "@/components/layout/app-header";
import { getOrgContext } from "@/lib/org-context";
import { requireModuleAccess } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import {
  PedidoPorProveedorClient,
  type PedidoItem,
  type PedidoSupplier,
} from "./pedido-por-proveedor-client";

export default async function PedidoPorProveedorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ supplier?: string }>;
}) {
  const { id } = await params;
  const { supplier: focusSupplierId } = await searchParams;
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "compras.solicitudes");
  if (!ctx.organization) redirect("/empresa");

  const supabase = await createClient();
  const { data: request } = await supabase
    .from("purchase_requests")
    .select(
      "id, title, status, notes, location_label, requested_at, needed_by, ordered_at, approved_at",
    )
    .eq("id", id)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!request) notFound();

  if (
    ["BORRADOR", "ENVIADA", "RECHAZADA", "ANULADA"].includes(request.status)
  ) {
    redirect(`/compras/solicitudes/${id}`);
  }

  const [{ data: itemRows }, { data: productRows }, { data: categoryRows }, { data: supplierRows }] =
    await Promise.all([
      supabase
        .from("purchase_request_items")
        .select(
          "id, product_id, category_id, quantity_requested, quantity_approved, unit, suggested_supplier_id, approved_supplier_id, expected_delivery_date, status, notes",
        )
        .eq("purchase_request_id", id)
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .order("sort_order"),
      supabase
        .from("products")
        .select("id, name")
        .eq("organization_id", ctx.organization.id),
      supabase
        .from("product_categories")
        .select("id, name")
        .eq("organization_id", ctx.organization.id),
      supabase
        .from("suppliers")
        .select("id, name, contact_name, phone, email")
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null),
    ]);

  const productNames = new Map((productRows ?? []).map((p) => [p.id, p.name]));
  const categoryNames = new Map((categoryRows ?? []).map((c) => [c.id, c.name]));

  const items: PedidoItem[] = (itemRows ?? []).map((item) => ({
    id: item.id,
    product_id: item.product_id,
    product_name: productNames.get(item.product_id) ?? item.product_id,
    category_name: categoryNames.get(item.category_id) ?? "Sin categoría",
    quantity_requested: item.quantity_requested,
    quantity_approved: item.quantity_approved,
    unit: item.unit,
    suggested_supplier_id: item.suggested_supplier_id,
    approved_supplier_id: item.approved_supplier_id,
    expected_delivery_date: item.expected_delivery_date,
    notes: item.notes,
    status: item.status,
  }));

  const suppliers = (supplierRows ?? []) as PedidoSupplier[];
  const organization = {
    name:
      ctx.organization.trade_name ||
      ctx.organization.legal_name ||
      "Candela",
    nit: ctx.organization.nit
      ? `${ctx.organization.nit}${ctx.organization.dv ? `-${ctx.organization.dv}` : ""}`
      : null,
    phone: ctx.organization.phone ?? null,
    email: ctx.organization.corporate_email ?? null,
    address: ctx.organization.address ?? null,
    municipality: ctx.organization.municipality ?? null,
  };

  return (
    <>
      <div className="no-print print:hidden">
        <AppHeader title="Compras" subtitle="Pedidos por proveedor" />
      </div>
      <main className="mx-auto max-w-3xl space-y-6 p-6 md:p-8 print:max-w-none print:p-0">
        <PedidoPorProveedorClient
          request={request}
          items={items}
          suppliers={suppliers}
          organization={organization}
          focusSupplierId={focusSupplierId || null}
        />
      </main>
    </>
  );
}
