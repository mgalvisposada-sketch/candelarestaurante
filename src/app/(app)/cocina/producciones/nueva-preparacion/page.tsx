import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";
import { Card, PageIntro } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { requireModuleAccess } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/types/domain";
import { redirect } from "next/navigation";
import { CocinaNav } from "../../cocina-nav";
import {
  PreparacionProductionForm,
  type PrepOption,
} from "./preparacion-production-form";

export default async function NuevaProduccionPreparacionPage({
  searchParams,
}: {
  searchParams: Promise<{ producto?: string }>;
}) {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "cocina.produccion");
  if (!ctx.organization) redirect("/empresa");

  const { producto: productoParam } = await searchParams;
  const supabase = await createClient();
  const orgId = ctx.organization.id;

  const [{ data: preparaciones }, { data: recipes }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, unit, current_stock, unit_cost")
      .eq("organization_id", orgId)
      .eq("item_kind", "PREPARACION")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("kitchen_recipes")
      .select(
        "id, product_id, name, yield_qty, kitchen_recipe_lines(component_product_id, quantity, products:component_product_id(name, unit, unit_cost, current_stock))",
      )
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .is("deleted_at", null),
  ]);

  const recipeByProduct = new Map(
    (recipes ?? []).map((r) => [r.product_id, r]),
  );

  const options: PrepOption[] = (preparaciones ?? []).map((p) => {
    const recipe = recipeByProduct.get(p.id);
    return {
      id: p.id,
      name: p.name,
      unit: p.unit,
      current_stock: p.current_stock,
      unit_cost: p.unit_cost,
      recipe: recipe
        ? {
            id: recipe.id,
            name: recipe.name,
            yield_qty: recipe.yield_qty,
            lines: (recipe.kitchen_recipe_lines ?? []).map((l) => {
              const comp = Array.isArray(l.products) ? l.products[0] : l.products;
              return {
                component_product_id: l.component_product_id,
                quantity: l.quantity,
                name: (comp as { name?: string } | null)?.name ?? "—",
                unit: (comp as { unit?: string } | null)?.unit ?? "",
                unit_cost:
                  (comp as { unit_cost?: number | string } | null)?.unit_cost ??
                  0,
                current_stock:
                  (comp as { current_stock?: number | string } | null)
                    ?.current_stock ?? 0,
              };
            }),
          }
        : null,
    };
  });

  const withRecipe = options.filter((o) => o.recipe);
  const requested = options.find((o) => o.id === productoParam) ?? null;

  return (
    <>
      <AppHeader title="Cocina" subtitle="Crear más · Preparación" />
      <main className="space-y-6 p-8">
        <CocinaNav
          permissions={ctx.permissions}
          isSuperAdmin={isSuperAdmin(ctx.role)}
        />
        <PageIntro
          title="Crear más de una preparación"
          description="No crea un producto nuevo: escala la receta del catálogo, consume materias primas e insumos preparación, y entra stock con costo recalculado."
        />

        {!options.length ? (
          <Card>
            <p className="font-medium">No hay preparaciones en el catálogo</p>
            <Link
              href="/cocina/preparaciones"
              className="mt-4 inline-flex rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white"
            >
              Ir a preparaciones
            </Link>
          </Card>
        ) : !withRecipe.length ? (
          <Card>
            <p className="font-medium">Ninguna preparación tiene receta</p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Defina la receta (qué consume) en el catálogo y luego use Crear más.
            </p>
            <Link
              href="/cocina/preparaciones"
              className="mt-4 inline-flex rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white"
            >
              Ir a preparaciones
            </Link>
          </Card>
        ) : requested && !requested.recipe ? (
          <Card>
            <p className="font-medium">
              “{requested.name}” aún no tiene receta
            </p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Defina qué materias primas e insumos consume y luego cree más.
            </p>
            <Link
              href="/cocina/preparaciones"
              className="mt-4 inline-flex rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white"
            >
              Definir receta
            </Link>
          </Card>
        ) : (
          <PreparacionProductionForm
            preparaciones={options}
            initialProductId={productoParam}
          />
        )}
      </main>
    </>
  );
}
