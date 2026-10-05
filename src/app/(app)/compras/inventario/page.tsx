import { AppHeader } from "@/components/layout/app-header";
import { Card, EmptyState, PageIntro } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { requireModuleAccess } from "@/lib/permissions";
import { isSuperAdmin } from "@/types/domain";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ComprasNav } from "../compras-nav";
import {
  CreateCategoryForm,
  CreateProductForm,
  InventoryLists,
  type CategoryRow,
  type ProductRow,
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
  const [{ data: catRows }, { data: prodRows }] = await Promise.all([
    supabase
      .from("product_categories")
      .select("id, code, name, description")
      .eq("organization_id", ctx.organization.id)
      .is("deleted_at", null)
      .order("code"),
    supabase
      .from("products")
      .select("id, category_id, sku, name, unit, min_stock, current_stock, notes")
      .eq("organization_id", ctx.organization.id)
      .is("deleted_at", null)
      .order("name"),
  ]);

  const categories = (catRows ?? []) as CategoryRow[];
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
            description="Asigne a cada producto una categoría del maestro único (el mismo de Proveedores). Así la sugerencia de proveedor coincide siempre por categoría."
          />
          <div className="flex flex-wrap gap-2">
            <CreateCategoryForm />
            <CreateProductForm categories={categories} />
          </div>
        </div>
        <p className="text-sm text-[var(--muted)]">
          Las categorías son un maestro único compartido con{" "}
          <Link href="/proveedores" className="text-[var(--accent)]">
            Proveedores & CxP
          </Link>
          .
        </p>
        {categories.length === 0 && products.length === 0 ? (
          <EmptyState
            title="Sin inventario"
            description="Cree categorías (carnes, lácteos, empaques…) y luego los productos."
          />
        ) : (
          <InventoryLists categories={categories} products={products} />
        )}
      </main>
    </>
  );
}
