import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";
import { Card, EmptyState, PageIntro } from "@/components/ui/primitives";
import { estimateRecipeCost } from "@/lib/kitchen/cost";
import { formatCOP, money } from "@/lib/money";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess, requireModuleAccess } from "@/lib/permissions";
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

export default async function CocinaPreparacionesPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "cocina.recetas");
  if (!ctx.organization) redirect("/empresa");

  const supabase = await createClient();
  const orgId = ctx.organization.id;
  const canProduce = ctxCanAccess(ctx, "cocina.produccion");

  const [
    { data: preparaciones },
    { data: categories },
    { data: units },
    { data: components },
    { data: recipes },
  ] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, unit, current_stock, unit_cost")
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
            description="Ej. Birria: consume insumos y materias primas. Teórico = ficha; inventario = promedio de producciones reales."
          />
          <div className="flex flex-wrap gap-2">
            {canProduce ? (
              <Link
                href="/cocina/producciones/nueva-preparacion"
                className="rounded-lg border border-[var(--line)] px-4 py-2.5 text-sm"
              >
                Producir batch
              </Link>
            ) : null}
            <CreateKitchenProductForm
              itemKind="PREPARACION"
              label="Nueva preparación"
              categories={categories ?? []}
              units={units ?? []}
            />
          </div>
        </div>

        {!preparaciones?.length ? (
          <EmptyState
            title="Sin preparaciones"
            description="Cree la preparación y defina su receta con insumos y/o materias primas."
          />
        ) : (
          <div className="space-y-3">
            {preparaciones.map((p) => {
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
                };
              });
              const est = recipe
                ? estimateRecipeCost(lines, Number(recipe.yield_qty || 1))
                : null;
              const inventoryCost = Number(p.unit_cost || 0);

              return (
                <Card key={p.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-medium">{p.name}</h2>
                      <p className="text-sm text-[var(--muted)]">
                        Stock {p.current_stock} {p.unit}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        {est ? (
                          <span>
                            Teórico{" "}
                            <strong>{formatUnitCost(est.unitCost)}</strong> /{" "}
                            {p.unit}
                          </span>
                        ) : (
                          <span className="text-[var(--muted)]">Sin receta</span>
                        )}
                        <span>
                          Inventario{" "}
                          <strong>{formatUnitCost(inventoryCost)}</strong> /{" "}
                          {p.unit}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {canProduce && recipe ? (
                        <Link
                          href="/cocina/producciones/nueva-preparacion"
                          className="rounded-md border border-[var(--line)] px-2.5 py-1 text-xs"
                        >
                          Producir
                        </Link>
                      ) : null}
                      <KitchenRecipeForm
                        productId={p.id}
                        productName={p.name}
                        defaultYield={String(recipe?.yield_qty ?? 1)}
                        existingName={recipe?.name}
                        components={(components ?? []).filter(
                          (c) => c.id !== p.id,
                        )}
                      />
                    </div>
                  </div>
                  {recipe ? (
                    <ul className="mt-3 space-y-1 text-sm text-[var(--muted)]">
                      {lines.map((l, i) => (
                        <li key={`${p.id}-${i}`}>
                          {l.quantity} {l.unit} · {l.name}
                        </li>
                      ))}
                      <li className="pt-1 text-[var(--ink)]">
                        Costo batch teórico ≈ {formatCOP(est?.totalCost ?? 0)}{" "}
                        para {Number(recipe.yield_qty)} {p.unit}
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
