import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";
import { Card, EmptyState, PageIntro } from "@/components/ui/primitives";
import { formatCOP, money } from "@/lib/money";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess, requireModuleAccess } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/types/domain";
import { redirect } from "next/navigation";
import { CocinaNav } from "../cocina-nav";
import { CreateKitchenProductForm } from "../kitchen-product-forms";

function formatUnitCost(value: number | string) {
  const n = money(value).toDecimalPlaces(4).toNumber();
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(n);
}

export default async function CocinaInsumosPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "cocina.maestro");
  if (!ctx.organization) redirect("/empresa");

  const supabase = await createClient();
  const orgId = ctx.organization.id;

  const [{ data: insumos }, { data: categories }, { data: units }] =
    await Promise.all([
      supabase
        .from("products")
        .select(
          "id, name, sku, unit, category_id, current_stock, min_stock, unit_cost, notes, product_categories(name)",
        )
        .eq("organization_id", orgId)
        .eq("item_kind", "INSUMO_PREPARACION")
        .is("deleted_at", null)
        .order("name"),
      supabase
        .from("product_categories")
        .select("id, code, name")
        .eq("organization_id", orgId)
        .is("deleted_at", null)
        .order("code"),
      supabase
        .from("product_units")
        .select("id, code, name")
        .eq("organization_id", orgId)
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("code"),
    ]);

  const canProduce = ctxCanAccess(ctx, "cocina.produccion");

  return (
    <>
      <AppHeader title="Cocina" subtitle="Insumos preparación" />
      <main className="space-y-6 p-8">
        <CocinaNav
          permissions={ctx.permissions}
          isSuperAdmin={isSuperAdmin(ctx.role)}
        />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageIntro
            title="Insumos preparación"
            description="Resultado limpio y usable de una materia prima tras cortes, porcionado y merma. El costo unitario se recalcula en cada producción."
          />
          <div className="flex flex-wrap gap-2">
            {canProduce ? (
              <Link
                href="/cocina/producciones/nueva"
                className="rounded-lg border border-[var(--line)] px-4 py-2.5 text-sm"
              >
                Nueva producción
              </Link>
            ) : null}
            <CreateKitchenProductForm
              itemKind="INSUMO_PREPARACION"
              label="Nuevo insumo"
              categories={categories ?? []}
              units={units ?? []}
            />
          </div>
        </div>

        {!insumos?.length ? (
          <EmptyState
            title="Sin insumos preparación"
            description="Cree el maestro (ej. Cebolla insumo, Solomito porcionado) y luego registre una producción desde materia prima."
          />
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--line)] bg-[var(--surface)] text-xs uppercase tracking-wide text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Nombre</th>
                  <th className="px-4 py-3 font-medium">Categoría</th>
                  <th className="px-4 py-3 font-medium">Stock</th>
                  <th className="px-4 py-3 font-medium">Costo / u</th>
                  <th className="px-4 py-3 font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {insumos.map((p) => {
                  const cat = Array.isArray(p.product_categories)
                    ? p.product_categories[0]
                    : p.product_categories;
                  const stock = Number(p.current_stock || 0);
                  const unitCost = Number(p.unit_cost || 0);
                  return (
                    <tr key={p.id} className="border-b border-[var(--line)] last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-medium">{p.name}</p>
                        {p.sku ? (
                          <p className="text-xs text-[var(--muted)]">{p.sku}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-[var(--muted)]">
                        {(cat as { name?: string } | null)?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        {stock} {p.unit}
                      </td>
                      <td className="px-4 py-3">{formatUnitCost(unitCost)}</td>
                      <td className="px-4 py-3">
                        {formatCOP(money(stock).times(unitCost))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </main>
    </>
  );
}
