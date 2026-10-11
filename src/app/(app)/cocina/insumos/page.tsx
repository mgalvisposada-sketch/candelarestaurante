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
import {
  InsumosCatalogList,
  type InsumoCategoryGroup,
  type InsumoListItem,
} from "./insumos-list";

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

  const [{ data: insumos }, { data: categories }, { data: units }] =
    await Promise.all([
      supabase
        .from("products")
        .select(
          "id, name, sku, unit, unit_id, category_id, current_stock, min_stock, unit_cost, notes, product_categories(name)",
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
    ]);

  const canProduce = ctxCanAccess(ctx, "cocina.produccion");
  const canEdit = ctxCanAccess(ctx, "cocina.maestro");

  const categoryOrder = new Map(
    (categories ?? []).map((c, idx) => [c.id, idx]),
  );

  const byCategory = new Map<
    string,
    {
      categoryId: string;
      categoryCode: string;
      categoryName: string;
      items: InsumoListItem[];
    }
  >();

  for (const p of insumos ?? []) {
    const cat = Array.isArray(p.product_categories)
      ? p.product_categories[0]
      : p.product_categories;
    const categoryId = p.category_id || "__sin__";
    const item: InsumoListItem = {
      id: p.id,
      name: p.name,
      sku: p.sku,
      unit: p.unit,
      unitId: p.unit_id,
      categoryId: p.category_id || "",
      categoryName:
        (cat as { name?: string } | null)?.name ?? "Sin categoría",
      currentStock: Number(p.current_stock || 0),
      minStock: Number(p.min_stock || 0),
      unitCost: Number(p.unit_cost || 0),
      notes: p.notes,
    };
    const existing = byCategory.get(categoryId);
    if (existing) {
      existing.items.push(item);
      continue;
    }
    const fromMaster = (categories ?? []).find((c) => c.id === p.category_id);
    byCategory.set(categoryId, {
      categoryId,
      categoryCode: fromMaster?.code ?? "—",
      categoryName:
        fromMaster?.name ??
        (cat as { name?: string } | null)?.name ??
        "Sin categoría",
      items: [item],
    });
  }

  const groups: InsumoCategoryGroup[] = [...byCategory.values()].sort(
    (a, b) => {
      if (a.categoryId === "__sin__") return 1;
      if (b.categoryId === "__sin__") return -1;
      const ai = categoryOrder.get(a.categoryId) ?? 9999;
      const bi = categoryOrder.get(b.categoryId) ?? 9999;
      if (ai !== bi) return ai - bi;
      return a.categoryName.localeCompare(b.categoryName, "es");
    },
  );

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
            description="Catálogo editable aquí: nombre, stock, costo, categoría. Crear más convierte materia prima con merma/aprovechamiento."
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
            <strong className="text-[var(--ink)]">Editar / desactivar</strong>
            {" — "}ajuste el maestro desde cada fila. En Inventario solo se ven
            en lectura.
          </p>
          <p className="mt-1">
            <strong className="text-[var(--ink)]">Crear más</strong>
            {" — "}consume materia prima, declara cantidad útil y merma.
          </p>
        </div>

        {!groups.length ? (
          <EmptyState
            title="Sin insumos en el catálogo"
            description="Cree o cargue el maestro. Luego use Crear más para convertir materia prima con merma."
          />
        ) : (
          <InsumosCatalogList
            groups={groups}
            categories={categories ?? []}
            units={units ?? []}
            canProduce={canProduce}
            canEdit={canEdit}
            focusProductId={focusProductId}
          />
        )}
      </main>
    </>
  );
}
