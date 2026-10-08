import { AppHeader } from "@/components/layout/app-header";
import { Card, EmptyState, PageIntro } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess, requireModuleAccess } from "@/lib/permissions";
import { isSuperAdmin } from "@/types/domain";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ComprasNav } from "../compras-nav";
import {
  BulkImportProductsForm,
  CreateCategoryForm,
  CreateProductForm,
  CreateUnitForm,
  InventoryLists,
  type CategoryRow,
  type ProductRow,
  type UnitRow,
} from "./inventory-client";

export default async function ComprasInventarioPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "compras.inventario");
  if (!ctx.organization) {
    return (
      <>
        <AppHeader title="Compras" subtitle="Inventario" />
        <main className="p-8">
          <Card>
            <p className="font-medium">Primero configura la empresa</p>
            <Link href="/empresa" className="mt-4 inline-flex rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white">
              Ir a Empresa
            </Link>
          </Card>
        </main>
      </>
    );
  }

  const supabase = await createClient();
  const [{ data: catRows }, { data: unitRows }, { data: prodRows }] =
    await Promise.all([
      supabase
        .from("product_categories")
        .select("id, code, name, description")
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .order("code"),
      supabase
        .from("product_units")
        .select("id, code, name")
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("code"),
      supabase
        .from("products")
        .select(
          "id, category_id, unit_id, sku, name, unit, min_stock, current_stock, unit_cost, notes",
        )
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .order("name"),
    ]);

  const categories = (catRows ?? []) as CategoryRow[];
  const units = (unitRows ?? []) as UnitRow[];
  const products = (prodRows ?? []) as ProductRow[];

  return (
    <>
      <AppHeader title="Compras" subtitle="Maestro de inventario" />
      <main className="space-y-6 p-8">
        <ComprasNav
          permissions={ctx.permissions}
          isSuperAdmin={isSuperAdmin(ctx.role)}
        />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageIntro
            title="Inventario de compras"
            description="Categorías y unidades son maestros únicos. Cada producto elige de esos catálogos para mantener uniformidad."
          />
          <div className="flex w-full flex-wrap gap-2">
            <Link
              href="/compras/inventario/lista"
              className="rounded-lg border border-[var(--line)] px-4 py-2.5 text-sm"
            >
              Lista / imprimir
            </Link>
            <CreateCategoryForm />
            <CreateUnitForm />
            <CreateProductForm categories={categories} units={units} />
            <BulkImportProductsForm categories={categories} units={units} />
          </div>
        </div>
        <p className="text-sm text-[var(--muted)]">
          Categorías compartidas con{" "}
          <Link href="/proveedores/maestro" className="text-[var(--accent)]">
            Maestro de proveedores
          </Link>
          . Reposiciones en{" "}
          <Link href="/compras/sugeridos" className="text-[var(--accent)]">
            Sugeridos
          </Link>
          . Vista de lista en{" "}
          <Link href="/compras/inventario/lista" className="text-[var(--accent)]">
            Lista / imprimir
          </Link>
          .
        </p>
        {categories.length === 0 && units.length === 0 && products.length === 0 ? (
          <EmptyState
            title="Sin inventario"
            description="Cree categorías, unidades (ML, KG, UND…) y luego los productos."
          />
        ) : (
          <InventoryLists
            categories={categories}
            units={units}
            products={products}
            canEditMinStock={ctxCanAccess(ctx, "compras.inventario.minimo")}
          />
        )}
      </main>
    </>
  );
}
