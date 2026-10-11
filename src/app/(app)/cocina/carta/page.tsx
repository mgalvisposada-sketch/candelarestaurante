import { AppHeader } from "@/components/layout/app-header";
import { Card, EmptyState, PageIntro } from "@/components/ui/primitives";
import { estimateRecipeCost } from "@/lib/kitchen/cost";
import { formatCOP, money } from "@/lib/money";
import { getOrgContext } from "@/lib/org-context";
import { requireModuleAccess } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/types/domain";
import { redirect } from "next/navigation";
import { CocinaNav } from "../cocina-nav";
import { CreateKitchenProductForm } from "../kitchen-product-forms";
import { KitchenRecipeForm } from "../recipe-form";

function formatUnitCost(value: number | string) {
  const n = money(value).toDecimalPlaces(4).toNumber();
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(n);
}

export default async function CocinaCartaPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "cocina.recetas");
  if (!ctx.organization) redirect("/empresa");

  const supabase = await createClient();
  const orgId = ctx.organization.id;

  const [
    { data: carta },
    { data: categories },
    { data: units },
    { data: components },
    { data: recipes },
  ] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, unit, unit_cost")
      .eq("organization_id", orgId)
      .eq("item_kind", "PRODUCTO_CARTA")
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
      .in("item_kind", [
        "MATERIA_PRIMA",
        "INSUMO_PREPARACION",
        "PREPARACION",
      ])
      .order("name"),
    supabase
      .from("kitchen_recipes")
      .select(
        "id, product_id, name, yield_qty, kitchen_recipe_lines(quantity, component_product_id, products:component_product_id(name, unit, unit_cost, item_kind))",
      )
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .is("deleted_at", null),
  ]);

  const recipeByProduct = new Map(
    (recipes ?? []).map((r) => [r.product_id, r]),
  );

  const withCost = (carta ?? [])
    .map((p) => {
      const recipe = recipeByProduct.get(p.id);
      if (!recipe) return null;
      const lines = (recipe.kitchen_recipe_lines ?? []).map((l) => {
        const comp = Array.isArray(l.products) ? l.products[0] : l.products;
        return {
          quantity: Number(l.quantity),
          unitCost: Number(
            (comp as { unit_cost?: number | string } | null)?.unit_cost ?? 0,
          ),
        };
      });
      const est = estimateRecipeCost(lines, Number(recipe.yield_qty || 1));
      return { id: p.id, name: p.name, unitCost: est.unitCost };
    })
    .filter(Boolean) as Array<{ id: string; name: string; unitCost: number }>;

  const avgFoodCost =
    withCost.length > 0
      ? withCost.reduce((a, c) => a + c.unitCost, 0) / withCost.length
      : 0;

  return (
    <>
      <AppHeader title="Cocina" subtitle="Productos de carta" />
      <main className="space-y-6 p-8">
        <CocinaNav
          permissions={ctx.permissions}
          isSuperAdmin={isSuperAdmin(ctx.role)}
        />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageIntro
            title="Productos de carta"
            description="Food cost teórico por porción según receta y costos actuales de componentes (insumos/preparaciones/materias primas)."
          />
          <CreateKitchenProductForm
            itemKind="PRODUCTO_CARTA"
            label="Nuevo producto carta"
            categories={categories ?? []}
            units={units ?? []}
          />
        </div>

        {withCost.length > 0 ? (
          <Card>
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
              Food cost teórico promedio (platos con receta)
            </p>
            <p className="mt-1 font-display text-3xl font-semibold">
              {formatUnitCost(avgFoodCost)}
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {withCost.length} de {(carta ?? []).length} productos con receta
            </p>
          </Card>
        ) : null}

        {!carta?.length ? (
          <EmptyState
            title="Sin productos de carta"
            description="Cree el plato/bebida y defina su receta con preparaciones, insumos o materias primas."
          />
        ) : (
          <div className="space-y-3">
            {carta.map((p) => {
              const recipe = recipeByProduct.get(p.id);
              const lines = (recipe?.kitchen_recipe_lines ?? []).map((l) => {
                const comp = Array.isArray(l.products)
                  ? l.products[0]
                  : l.products;
                return {
                  quantity: Number(l.quantity),
                  unitCost: Number(
                    (comp as { unit_cost?: number | string } | null)
                      ?.unit_cost ?? 0,
                  ),
                  name: (comp as { name?: string } | null)?.name ?? "—",
                  unit: (comp as { unit?: string } | null)?.unit ?? "",
                  kind:
                    (comp as { item_kind?: string } | null)?.item_kind ?? "",
                };
              });
              const est = recipe
                ? estimateRecipeCost(lines, Number(recipe.yield_qty || 1))
                : null;

              return (
                <Card key={p.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-medium">{p.name}</h2>
                      {est ? (
                        <p className="mt-1 font-display text-2xl font-semibold">
                          {formatUnitCost(est.unitCost)}
                          <span className="ml-2 text-sm font-sans font-normal text-[var(--muted)]">
                            / porción teórica
                          </span>
                        </p>
                      ) : (
                        <p className="text-sm text-[var(--muted)]">Sin receta</p>
                      )}
                    </div>
                    <KitchenRecipeForm
                      productId={p.id}
                      productName={p.name}
                      defaultYield={String(recipe?.yield_qty ?? 1)}
                      existingName={recipe?.name}
                      components={components ?? []}
                    />
                  </div>
                  {recipe ? (
                    <ul className="mt-3 space-y-1 text-sm text-[var(--muted)]">
                      {lines.map((l, i) => (
                        <li key={`${p.id}-${i}`}>
                          {l.quantity} {l.unit} · {l.name}{" "}
                          <span className="text-xs">({l.kind})</span>
                          {" · "}
                          {formatCOP(money(l.quantity).times(l.unitCost))}
                        </li>
                      ))}
                      <li className="pt-1 text-[var(--ink)]">
                        Total receta ≈ {formatCOP(est?.totalCost ?? 0)} para{" "}
                        {Number(recipe.yield_qty)} porción(es)
                      </li>
                    </ul>
                  ) : null}
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
