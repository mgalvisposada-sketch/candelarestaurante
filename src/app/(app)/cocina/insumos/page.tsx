import { AppHeader } from "@/components/layout/app-header";
import { EmptyState, PageIntro } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess, requireModuleAccess } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/types/domain";
import { redirect } from "next/navigation";
import { CocinaNav } from "../cocina-nav";
import {
  BulkImportKitchenProductsForm,
  CreateKitchenProductForm,
} from "../kitchen-product-forms";
import { InsumosCatalogList, type InsumoListItem } from "./insumos-list";

export default async function CocinaInsumosPage({
  searchParams,
}: {
  searchParams: Promise<{ producto?: string }>;
}) {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "cocina.maestro");
  if (!ctx.organization) redirect("/empresa");

  const { producto: focusProductId } = await searchParams;
  const supabase = await createClient();
  const orgId = ctx.organization.id;

  const [
    { data: insumos },
    { data: categories },
    { data: units },
    { data: materiasPrimas },
    { data: recipes },
  ] = await Promise.all([
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
    supabase
      .from("products")
      .select("id, name, unit, item_kind, unit_cost")
      .eq("organization_id", orgId)
      .eq("item_kind", "MATERIA_PRIMA")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("kitchen_recipes")
      .select(
        "id, product_id, name, yield_qty, kitchen_recipe_lines(quantity, products:component_product_id(name, unit))",
      )
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .is("deleted_at", null),
  ]);

  const canProduce = ctxCanAccess(ctx, "cocina.produccion");
  const canRecipe =
    ctxCanAccess(ctx, "cocina.recetas") || ctxCanAccess(ctx, "cocina.maestro");
  const recipeByProduct = new Map(
    (recipes ?? []).map((r) => [r.product_id, r]),
  );

  const items: InsumoListItem[] = (insumos ?? []).map((p) => {
    const cat = Array.isArray(p.product_categories)
      ? p.product_categories[0]
      : p.product_categories;
    const recipe = recipeByProduct.get(p.id);
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      unit: p.unit,
      categoryName: (cat as { name?: string } | null)?.name ?? "—",
      currentStock: Number(p.current_stock || 0),
      unitCost: Number(p.unit_cost || 0),
      hasRecipe: Boolean(recipe),
      recipeName: recipe?.name ?? null,
      yieldQty: recipe ? Number(recipe.yield_qty || 1) : null,
      recipeLines: (recipe?.kitchen_recipe_lines ?? []).map((l) => {
        const comp = Array.isArray(l.products) ? l.products[0] : l.products;
        return {
          quantity: Number(l.quantity),
          unit: (comp as { unit?: string } | null)?.unit ?? "",
          name: (comp as { name?: string } | null)?.name ?? "—",
        };
      }),
    };
  });

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
            description="Catálogo + stock. Dos caminos: (1) dar de alta un producto nuevo que no existe, (2) Crear más de uno ya existente — con receta que consume materia prima."
          />
          <div className="flex flex-wrap gap-2">
            <BulkImportKitchenProductsForm
              itemKind="INSUMO_PREPARACION"
              categories={categories ?? []}
              units={units ?? []}
            />
            <CreateKitchenProductForm
              itemKind="INSUMO_PREPARACION"
              label="Nuevo en catálogo"
              categories={categories ?? []}
              units={units ?? []}
            />
          </div>
        </div>

        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--muted)]">
          <p>
            <strong className="text-[var(--ink)]">Nuevo en catálogo / carga masiva</strong>
            {" — "}producto que aún no existe (apertura).
          </p>
          <p className="mt-1">
            <strong className="text-[var(--ink)]">Crear más</strong>
            {" — "}fabrica más cantidad: define/usa la receta y descuenta materias
            primas del inventario.
          </p>
        </div>

        {!items.length ? (
          <EmptyState
            title="Sin insumos en el catálogo"
            description="Cargue masivamente o cree uno nuevo. Luego defina la receta y use Crear más para fabricar."
          />
        ) : (
          <InsumosCatalogList
            items={items}
            canProduce={canProduce}
            canRecipe={canRecipe}
            components={materiasPrimas ?? []}
            focusProductId={focusProductId}
          />
        )}
      </main>
    </>
  );
}
