import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";
import { Card, PageIntro } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { requireModuleAccess } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/types/domain";
import { redirect } from "next/navigation";
import { CocinaNav } from "../../cocina-nav";
import { InsumoProductionForm, type InsumoRecipeSeed } from "./production-form";

export default async function NuevaProduccionPage({
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

  const [
    { data: mpRows },
    { data: insumoRows },
    { data: aprovechamientos },
    { data: recipeRow },
  ] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, name, unit, current_stock, unit_cost, product_categories(name)",
      )
      .eq("organization_id", orgId)
      .eq("item_kind", "MATERIA_PRIMA")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("products")
      .select("id, name, unit, current_stock, unit_cost")
      .eq("organization_id", orgId)
      .eq("item_kind", "INSUMO_PREPARACION")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("products")
      .select("id, name, unit, current_stock, unit_cost")
      .eq("organization_id", orgId)
      .in("item_kind", ["INSUMO_PREPARACION", "PREPARACION"])
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("name"),
    productoParam && /^[0-9a-f-]{36}$/i.test(productoParam)
      ? supabase
          .from("kitchen_recipes")
          .select(
            "name, yield_qty, kitchen_recipe_lines(component_product_id, quantity)",
          )
          .eq("organization_id", orgId)
          .eq("product_id", productoParam)
          .eq("is_active", true)
          .is("deleted_at", null)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const materiasPrimas = (mpRows ?? []).map((p) => {
    const cat = Array.isArray(p.product_categories)
      ? p.product_categories[0]
      : p.product_categories;
    return {
      id: p.id,
      name: p.name,
      unit: p.unit,
      current_stock: p.current_stock,
      unit_cost: p.unit_cost,
      category_name: (cat as { name?: string } | null)?.name ?? null,
    };
  });

  const initialRecipe: InsumoRecipeSeed | null = recipeRow
    ? {
        name: recipeRow.name,
        yieldQty: Number(recipeRow.yield_qty || 0),
        lines: (recipeRow.kitchen_recipe_lines ?? []).map((l) => ({
          product_id: l.component_product_id,
          quantity: Number(l.quantity),
        })),
      }
    : null;

  return (
    <>
      <AppHeader title="Cocina" subtitle="Crear más · Insumo" />
      <main className="space-y-6 p-8">
        <CocinaNav
          permissions={ctx.permissions}
          isSuperAdmin={isSuperAdmin(ctx.role)}
        />
        <PageIntro
          title="Crear más de un insumo preparación"
          description="No da de alta un producto nuevo: fabrica más cantidad de uno que ya está en el catálogo. Consume materia prima según la receta (o la define aquí) y concentra el costo en el rendimiento útil."
        />

        {!materiasPrimas.length ? (
          <Card>
            <p className="font-medium">No hay materias primas en inventario</p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Cree productos en Inventario o recíbalos por Compras primero.
            </p>
            <Link
              href="/inventario/maestro"
              className="mt-4 inline-flex rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white"
            >
              Ir a Inventario
            </Link>
          </Card>
        ) : !(insumoRows ?? []).length ? (
          <Card>
            <p className="font-medium">Primero cree el insumo en el catálogo</p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              “Crear más” solo aplica a productos existentes. Dé de alta el
              maestro (o carga masiva) y vuelva.
            </p>
            <Link
              href="/cocina/insumos"
              className="mt-4 inline-flex rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white"
            >
              Ir a insumos
            </Link>
          </Card>
        ) : (
          <InsumoProductionForm
            materiasPrimas={materiasPrimas}
            insumos={insumoRows ?? []}
            aprovechamientos={aprovechamientos ?? []}
            initialOutputProductId={productoParam}
            initialRecipe={initialRecipe}
          />
        )}
      </main>
    </>
  );
}
