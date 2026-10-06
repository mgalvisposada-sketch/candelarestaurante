import { AppHeader } from "@/components/layout/app-header";
import { Card, EmptyState, PageIntro, StatCard } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { requireModuleAccess } from "@/lib/permissions";
import { isSuperAdmin } from "@/types/domain";
import { createClient } from "@/lib/supabase/server";
import { suggestedPurchaseQty } from "@/lib/inventory/cost";
import { money } from "@/lib/money";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ComprasNav } from "../compras-nav";

function formatUnitCost(value: number | string) {
  const n = money(value).toDecimalPlaces(4).toNumber();
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(n);
}

type ProductSuggest = {
  id: string;
  name: string;
  unit: string;
  category_id: string;
  min_stock: number | string;
  current_stock: number | string;
  unit_cost: number | string;
};

export default async function ComprasSugeridosPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "compras.sugeridos");
  if (!ctx.organization) redirect("/empresa");

  const supabase = await createClient();
  const [{ data: products }, { data: categories }, { data: links }, { data: suppliers }] =
    await Promise.all([
      supabase
        .from("products")
        .select("id, name, unit, category_id, min_stock, current_stock, unit_cost")
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("product_categories")
        .select("id, name, code")
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null),
      supabase
        .from("supplier_product_categories")
        .select("supplier_id, category_id")
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .eq("is_active", true),
      supabase
        .from("suppliers")
        .select("id, name")
        .eq("organization_id", ctx.organization.id)
        .eq("is_purchase_supplier", true)
        .eq("is_active", true)
        .is("deleted_at", null),
    ]);

  const catMap = new Map((categories ?? []).map((c) => [c.id, c]));
  const supplierMap = new Map((suppliers ?? []).map((s) => [s.id, s.name]));
  const supplierByCategory = new Map<string, string[]>();
  for (const link of links ?? []) {
    const list = supplierByCategory.get(link.category_id) ?? [];
    list.push(link.supplier_id);
    supplierByCategory.set(link.category_id, list);
  }

  const rows = ((products ?? []) as ProductSuggest[])
    .map((p) => {
      const qty = suggestedPurchaseQty(Number(p.current_stock), Number(p.min_stock));
      const supplierIds = supplierByCategory.get(p.category_id) ?? [];
      return {
        ...p,
        suggestedQty: qty,
        categoryName: catMap.get(p.category_id)?.name ?? "—",
        suggestedSuppliers: supplierIds
          .map((id) => supplierMap.get(id))
          .filter(Boolean)
          .slice(0, 3) as string[],
      };
    })
    .filter((p) => p.suggestedQty > 0)
    .sort((a, b) => b.suggestedQty - a.suggestedQty);

  return (
    <>
      <AppHeader title="Compras" subtitle="Sugerido comprar" />
      <main className="space-y-6 p-8">
        <ComprasNav
          permissions={ctx.permissions}
          isSuperAdmin={isSuperAdmin(ctx.role)}
        />
        <PageIntro
          title="Reposición sugerida"
          description="Productos por debajo del stock mínimo. Es una herramienta de apoyo para armar la solicitud de compra."
        />
        <div className="grid gap-4 md:grid-cols-2">
          <StatCard label="Productos bajo mínimo" value={String(rows.length)} />
          <Card>
            <p className="text-sm text-[var(--muted)]">
              Crear solicitud desde{" "}
              <Link href="/compras/solicitudes" className="text-[var(--accent)]">
                Solicitudes
              </Link>
              .
            </p>
          </Card>
        </div>
        {rows.length === 0 ? (
          <EmptyState
            title="Nada por reponer"
            description="Todos los productos activos están en o sobre su stock mínimo."
          />
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <article
                key={r.id}
                className="rounded-xl border border-[var(--line)] bg-white px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{r.name}</p>
                    <p className="text-sm text-[var(--muted)]">
                      {r.categoryName} · stock {r.current_stock} {r.unit} · mín.{" "}
                      {r.min_stock} · costo/u {formatUnitCost(r.unit_cost)}
                    </p>
                    <p className="mt-1 text-sm">
                      Comprar sugerido:{" "}
                      <strong>
                        {r.suggestedQty} {r.unit}
                      </strong>
                      {r.suggestedSuppliers.length
                        ? ` · proveedores: ${r.suggestedSuppliers.join(", ")}`
                        : " · sin proveedor de insumos para la categoría"}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
