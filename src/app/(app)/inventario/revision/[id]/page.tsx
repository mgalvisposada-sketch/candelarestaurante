import { AppHeader } from "@/components/layout/app-header";
import { getOrgContext } from "@/lib/org-context";
import { requireModuleAccess } from "@/lib/permissions";
import { isSuperAdmin } from "@/types/domain";
import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { InventarioNav } from "../../inventario-nav";
import { PHYSICAL_COUNT_ITEM_KINDS } from "@/lib/inventory/physical-count";
import {
  PhysicalReviewDetailClient,
  type ReviewCount,
  type ReviewItem,
} from "./review-client";

export const dynamic = "force-dynamic";

const ITEM_KIND_LABEL: Record<string, string> = {
  MATERIA_PRIMA: "Materia prima",
  INSUMO_PREPARACION: "Insumo",
  PREPARACION: "Preparación",
};

export default async function InventarioRevisionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "inventario.fisico.ajustar");
  if (!ctx.organization) redirect("/empresa");

  const supabase = await createClient();
  const { data: count } = await supabase
    .from("physical_inventory_counts")
    .select("id, title, status, counted_at, location_label, notes")
    .eq("id", id)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!count) notFound();

  const [{ data: itemRows }, { data: categoryRows }] = await Promise.all([
    supabase
      .from("physical_inventory_count_items")
      .select(
        "id, product_id, system_qty, counted_qty, difference_qty, created_by, created_at",
      )
      .eq("count_id", id)
      .eq("organization_id", ctx.organization.id)
      .eq("status", "ENVIADO")
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("product_categories")
      .select("id, name")
      .eq("organization_id", ctx.organization.id)
      .is("deleted_at", null),
  ]);

  const productIds = [...new Set((itemRows ?? []).map((i) => i.product_id))];
  const { data: productRows } = productIds.length
    ? await supabase
        .from("products")
        .select("id, name, unit, category_id, item_kind")
        .eq("organization_id", ctx.organization.id)
        .in("id", productIds)
        .in("item_kind", [...PHYSICAL_COUNT_ITEM_KINDS])
    : { data: [] as {
        id: string;
        name: string;
        unit: string;
        category_id: string | null;
        item_kind: string;
      }[] };

  const counterIds = [
    ...new Set(
      (itemRows ?? [])
        .map((item) => item.created_by as string | null)
        .filter((uid): uid is string => Boolean(uid)),
    ),
  ];
  const { data: profileRows } = counterIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", counterIds)
    : { data: [] as { id: string; full_name: string | null }[] };

  const nameById = new Map(
    (profileRows ?? []).map((p) => [p.id, p.full_name?.trim() || "Usuario"]),
  );
  const categoryById = new Map(
    (categoryRows ?? []).map((c) => [c.id, c.name]),
  );
  const productMap = new Map((productRows ?? []).map((p) => [p.id, p]));

  const items: ReviewItem[] = (itemRows ?? []).map((item) => {
    const p = productMap.get(item.product_id);
    const kind = p?.item_kind ?? "";
    const createdBy = (item.created_by as string | null) ?? null;
    const categoryId = p?.category_id ?? null;
    return {
      id: item.id,
      product_id: item.product_id,
      product_name: p?.name ?? item.product_id,
      unit: p?.unit ?? "",
      category_id: categoryId,
      category_name: categoryId
        ? (categoryById.get(categoryId) ?? "Sin categoría")
        : "Sin categoría",
      item_kind_label: ITEM_KIND_LABEL[kind] ?? kind,
      system_qty: item.system_qty,
      counted_qty: item.counted_qty,
      difference_qty: item.difference_qty,
      created_by_name: createdBy ? (nameById.get(createdBy) ?? null) : null,
    };
  });

  return (
    <>
      <AppHeader title="Inventario" subtitle="Revisión de inventario físico" />
      <main className="space-y-4 p-4 pb-28 sm:p-6 md:space-y-6 md:p-8 md:pb-8">
        <div className="hidden md:block">
          <InventarioNav
            permissions={ctx.permissions}
            isSuperAdmin={isSuperAdmin(ctx.role)}
          />
        </div>
        <Link
          href="/inventario/revision"
          className="inline-flex min-h-10 items-center text-sm text-[var(--accent)] hover:underline"
        >
          ← Volver a revisión física
        </Link>
        <PhysicalReviewDetailClient
          count={count as ReviewCount}
          items={items}
        />
      </main>
    </>
  );
}
