import { AppHeader } from "@/components/layout/app-header";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess, requireModuleAccess } from "@/lib/permissions";
import { isSuperAdmin } from "@/types/domain";
import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { InventarioNav } from "../../inventario-nav";
import {
  PhysicalCountDetailClient,
  type CountDetail,
  type CountItem,
  type ProductOption,
  type CategoryOption,
} from "./detail-client";

export default async function InventarioFisicoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "inventario.fisico");
  if (!ctx.organization) redirect("/empresa");

  const supabase = await createClient();
  const { data: count } = await supabase
    .from("physical_inventory_counts")
    .select(
      "id, title, status, counted_at, location_label, notes, rejection_reason",
    )
    .eq("id", id)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!count) notFound();

  const canAdjust = ctxCanAccess(ctx, "inventario.fisico.ajustar");

  const [{ data: itemRows }, { data: productRows }, { data: categoryRows }] =
    await Promise.all([
      supabase
        .from("physical_inventory_count_items")
        .select(
          "id, product_id, system_qty, counted_qty, difference_qty, notes, status, rejection_reason",
        )
        .eq("count_id", id)
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
      supabase
        .from("products")
        .select("id, name, unit, category_id")
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("product_categories")
        .select("id, name, code")
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .order("name"),
    ]);

  const productMap = new Map((productRows ?? []).map((p) => [p.id, p]));
  const items: CountItem[] = (itemRows ?? []).map((item) => {
    const p = productMap.get(item.product_id);
    const status = (item.status as string | undefined) ?? "BORRADOR";
    const revealSystem =
      canAdjust && (status === "ENVIADO" || status === "AJUSTADO");
    return {
      id: item.id,
      product_id: item.product_id,
      counted_qty: item.counted_qty,
      notes: item.notes,
      product_name: p?.name ?? item.product_id,
      unit: p?.unit ?? "",
      status,
      rejection_reason: item.rejection_reason,
      category_id: p?.category_id ?? null,
      system_qty: revealSystem ? item.system_qty : null,
      difference_qty: revealSystem ? item.difference_qty : null,
    };
  });

  return (
    <>
      <AppHeader title="Inventario" subtitle="Detalle de inventario físico" />
      <main className="space-y-4 p-4 pb-28 sm:p-6 md:space-y-6 md:p-8 md:pb-8">
        <div className="hidden md:block">
          <InventarioNav
            permissions={ctx.permissions}
            isSuperAdmin={isSuperAdmin(ctx.role)}
          />
        </div>
        <Link
          href="/inventario/fisico"
          className="inline-flex min-h-10 items-center text-sm text-[var(--accent)] hover:underline"
        >
          ← Volver a inventarios físicos
        </Link>
        <PhysicalCountDetailClient
          count={count as CountDetail}
          items={items}
          products={(productRows ?? []) as ProductOption[]}
          categories={(categoryRows ?? []) as CategoryOption[]}
          canEdit={ctxCanAccess(ctx, "inventario.fisico")}
          canAdjust={canAdjust}
        />
      </main>
    </>
  );
}
