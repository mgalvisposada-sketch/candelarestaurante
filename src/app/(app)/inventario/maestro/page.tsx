import { AppHeader } from "@/components/layout/app-header";
import { Card, EmptyState, PageIntro } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess, requireModuleAccess } from "@/lib/permissions";
import { isSuperAdmin } from "@/types/domain";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { InventarioNav } from "../inventario-nav";
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

export default async function InventarioMaestroPage({
  searchParams,
}: {
  searchParams: Promise<{ producto?: string }>;
}) {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "inventario.maestro");
  const { producto: focusProductId } = await searchParams;
  if (!ctx.organization) {
    return (
      <>
        <AppHeader title="Inventario" subtitle="Maestro" />
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
          "id, category_id, unit_id, sku, name, unit, min_stock, current_stock, unit_cost, notes, item_kind, tracks_inventory",
        )
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .order("name"),
    ]);

  const categories = (catRows ?? []) as CategoryRow[];
  const units = (unitRows ?? []) as UnitRow[];
  // Agua de grifo y similares no se gestionan en el maestro de inventario
  const products = ((prodRows ?? []) as ProductRow[]).filter(
    (p) => p.tracks_inventory !== false,
  );
  const kitchenVisible = products.some(
    (p) => (p.item_kind ?? "MATERIA_PRIMA") !== "MATERIA_PRIMA",
  );

  return (
    <>
      <AppHeader title="Inventario" subtitle="Maestro de productos" />
      <main className="space-y-6 p-8">
        <InventarioNav
          permissions={ctx.permissions}
          isSuperAdmin={isSuperAdmin(ctx.role)}
        />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageIntro
            title="Maestro de inventario"
            description="Aquí edita materias primas (compras). Los insumos, preparaciones y carta de Cocina se muestran en solo lectura dentro de su categoría."
          />
          <div className="flex w-full flex-wrap gap-2">
            <Link
              href="/inventario/lista"
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
          {" "}y Cocina. Reposiciones en{" "}
          <Link href="/compras/sugeridos" className="text-[var(--accent)]">
            Sugeridos
          </Link>
          .
          {kitchenVisible ? (
            <>
              {" "}
              Los ítems de Cocina aparecen marcados y solo se gestionan desde{" "}
              <Link href="/cocina" className="text-[var(--accent)]">
                Cocina
              </Link>
              .
            </>
          ) : null}
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
            canEditMinStock={ctxCanAccess(ctx, "inventario.minimo")}
            focusProductId={focusProductId}
          />
        )}
      </main>
    </>
  );
}
