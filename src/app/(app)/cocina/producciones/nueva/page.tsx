import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";
import { Card, PageIntro } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { requireModuleAccess } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/types/domain";
import { redirect } from "next/navigation";
import { CocinaNav } from "../../cocina-nav";
import { InsumoProductionForm } from "./production-form";

export default async function NuevaProduccionPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "cocina.produccion");
  if (!ctx.organization) redirect("/empresa");

  const supabase = await createClient();
  const orgId = ctx.organization.id;

  const [{ data: mpRows }, { data: insumoRows }, { data: aprovechamientos }] =
    await Promise.all([
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

  return (
    <>
      <AppHeader title="Cocina" subtitle="Nueva producción de insumo" />
      <main className="space-y-6 p-8">
        <CocinaNav
          permissions={ctx.permissions}
          isSuperAdmin={isSuperAdmin(ctx.role)}
        />
        <PageIntro
          title="Producción de insumo preparación"
          description="Consuma materia prima, declare el rendimiento útil y, si aplica, aprovechamientos. La merma concentra el costo en lo usable."
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
            <p className="font-medium">Primero cree un insumo preparación</p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Ej. “Cebolla insumo” o “Solomito porcionado”. Luego vuelva a
              producir.
            </p>
            <Link
              href="/cocina/insumos"
              className="mt-4 inline-flex rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white"
            >
              Crear insumo
            </Link>
          </Card>
        ) : (
          <InsumoProductionForm
            materiasPrimas={materiasPrimas}
            insumos={insumoRows ?? []}
            aprovechamientos={aprovechamientos ?? []}
          />
        )}
      </main>
    </>
  );
}
