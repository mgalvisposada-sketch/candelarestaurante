import { AppHeader } from "@/components/layout/app-header";
import { EmptyState, PageIntro } from "@/components/ui/primitives";
import { estimateRecipeCost } from "@/lib/kitchen/cost";
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
import {
  PreparacionesByCategoryList,
  type PreparacionCategoryGroup,
} from "./preparaciones-list";

type CategoryRow = { id: string; code: string; name: string };

type PreparacionRow = {
  id: string;
  name: string;
  unit: string;
  category_id: string;
  current_stock: number | string;
  unit_cost: number | string;
  product_categories:
    | { name?: string; code?: string }
    | { name?: string; code?: string }[]
    | null;
};

export default async function CocinaPreparacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ producto?: string }>;
}) {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "cocina.recetas");
  if (!ctx.organization) redirect("/empresa");

  const { producto: focusProductId } = await searchParams;
  const supabase = await createClient();
  const orgId = ctx.organization.id;
  const canProduce = ctxCanAccess(ctx, "cocina.produccion");
  const canMaestro = ctxCanAccess(ctx, "cocina.maestro");

  const [
    { data: preparaciones },
    { data: categories },
    { data: units },
    { data: components },
    { data: recipes },
  ] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, name, unit, category_id, current_stock, unit_cost, product_categories(code, name)",
      )
      .eq("organization_id", orgId)
      .eq("item_kind", "PREPARACION")
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
      .is("deleted_at", null)
      .eq("is_active", true)
      .in("item_kind", ["MATERIA_PRIMA", "INSUMO_PREPARACION", "PREPARACION"])
      .order("name"),
    supabase
      .from("kitchen_recipes")
      .select(
        "id, product_id, name, yield_qty, kitchen_recipe_lines(quantity, component_product_id, products:component_product_id(name, unit, unit_cost))",
      )
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .is("deleted_at", null),
  ]);

  const recipeByProduct = new Map(
    (recipes ?? []).map((r) => [r.product_id, r]),
  );

  const categoryOrder = new Map(
    (categories ?? []).map((c, idx) => [c.id, idx]),
  );

  const byCategory = new Map<
    string,
    {
      categoryId: string;
      categoryCode: string;
      categoryName: string;
      items: PreparacionRow[];
    }
  >();

  for (const p of (preparaciones ?? []) as PreparacionRow[]) {
    const catRel = Array.isArray(p.product_categories)
      ? p.product_categories[0]
      : p.product_categories;
    const categoryId = p.category_id || "__sin__";
    const existing = byCategory.get(categoryId);
    if (existing) {
      existing.items.push(p);
      continue;
    }
    const fromMaster = (categories as CategoryRow[] | null)?.find(
      (c) => c.id === p.category_id,
    );
    byCategory.set(categoryId, {
      categoryId,
      categoryCode: fromMaster?.code ?? catRel?.code ?? "—",
      categoryName: fromMaster?.name ?? catRel?.name ?? "Sin categoría",
      items: [p],
    });
  }

  const groups: PreparacionCategoryGroup[] = [...byCategory.values()]
    .sort((a, b) => {
      if (a.categoryId === "__sin__") return 1;
      if (b.categoryId === "__sin__") return -1;
      const ai = categoryOrder.get(a.categoryId) ?? 9999;
      const bi = categoryOrder.get(b.categoryId) ?? 9999;
      if (ai !== bi) return ai - bi;
      return a.categoryName.localeCompare(b.categoryName, "es");
    })
    .map((group) => ({
      categoryId: group.categoryId,
      categoryCode: group.categoryCode,
      categoryName: group.categoryName,
      items: group.items.map((p) => {
        const recipe = recipeByProduct.get(p.id);
        const recipeLines = (recipe?.kitchen_recipe_lines ?? []).map((l) => {
          const comp = Array.isArray(l.products) ? l.products[0] : l.products;
          return {
            quantity: Number(l.quantity),
            unitCost: Number(
              (comp as { unit_cost?: number | string } | null)?.unit_cost ?? 0,
            ),
            name: (comp as { name?: string } | null)?.name ?? "—",
            unit: (comp as { unit?: string } | null)?.unit ?? "",
          };
        });
        const est = recipe
          ? estimateRecipeCost(recipeLines, Number(recipe.yield_qty || 1))
          : null;

        return {
          id: p.id,
          name: p.name,
          unit: p.unit,
          currentStock: p.current_stock,
          inventoryUnitCost: Number(p.unit_cost || 0),
          theoreticalUnitCost: est ? est.unitCost : null,
          theoreticalBatchCost: est ? est.totalCost : null,
          yieldQty: recipe ? Number(recipe.yield_qty || 1) : null,
          recipeName: recipe?.name ?? null,
          recipeLines: recipeLines.map(({ quantity, unit, name }) => ({
            quantity,
            unit,
            name,
          })),
          hasRecipe: Boolean(recipe),
        };
      }),
    }));

  return (
    <>
      <AppHeader title="Cocina" subtitle="Preparaciones" />
      <main className="space-y-6 p-8">
        <CocinaNav
          permissions={ctx.permissions}
          isSuperAdmin={isSuperAdmin(ctx.role)}
        />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageIntro
            title="Preparaciones"
            description="Catálogo + stock. (1) Nuevo en catálogo si no existe. (2) Definir receta (MP e insumos). (3) Crear más para fabricar y consumir esa receta."
          />
          <div className="flex flex-wrap gap-2">
            {canMaestro ? (
              <>
                <BulkImportKitchenProductsForm
                  itemKind="PREPARACION"
                  categories={categories ?? []}
                  units={units ?? []}
                />
                <CreateKitchenProductForm
                  itemKind="PREPARACION"
                  label="Nuevo en catálogo"
                  categories={categories ?? []}
                  units={units ?? []}
                />
              </>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--muted)]">
          <p>
            <strong className="text-[var(--ink)]">Nuevo en catálogo / carga masiva</strong>
            {" — "}producto que aún no existe (apertura).
          </p>
          <p className="mt-1">
            <strong className="text-[var(--ink)]">Crear más</strong>
            {" — "}en cada fila, con receta: consume materias primas e insumos
            preparación del inventario.
          </p>
        </div>

        {!preparaciones?.length ? (
          <EmptyState
            title="Sin preparaciones en el catálogo"
            description="Cargue masivamente o cree una nueva. Luego defina la receta y use Crear más para fabricar."
          />
        ) : (
          <PreparacionesByCategoryList
            groups={groups}
            canProduce={canProduce}
            components={components ?? []}
            focusProductId={focusProductId}
          />
        )}
      </main>
    </>
  );
}
