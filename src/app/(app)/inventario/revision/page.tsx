import { AppHeader } from "@/components/layout/app-header";
import { PageIntro, StatCard } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { requireModuleAccess } from "@/lib/permissions";
import { isSuperAdmin } from "@/types/domain";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { InventarioNav } from "../inventario-nav";
import type { CountListRow } from "../fisico/fisico-client";
import { PhysicalReviewQueue } from "./revision-list-client";

export const dynamic = "force-dynamic";

export default async function InventarioRevisionPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "inventario.fisico.ajustar");
  if (!ctx.organization) redirect("/empresa");

  const supabase = await createClient();
  const { data } = await supabase
    .from("physical_inventory_counts")
    .select(
      "id, title, status, counted_at, location_label, notes, submitted_at, counted_by",
    )
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .order("counted_at", { ascending: false });

  const rawCounts = data ?? [];
  const countIds = rawCounts.map((c) => c.id);
  const counterIds = [
    ...new Set(
      rawCounts
        .map((c) => c.counted_by)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [{ data: itemRows }, { data: profileRows }] = await Promise.all([
    countIds.length
      ? supabase
          .from("physical_inventory_count_items")
          .select("count_id, difference_qty, status")
          .in("count_id", countIds)
          .eq("status", "ENVIADO")
          .is("deleted_at", null)
      : Promise.resolve({
          data: [] as {
            count_id: string;
            difference_qty: number | string;
            status: string;
          }[],
        }),
    counterIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", counterIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
  ]);

  const nameById = new Map(
    (profileRows ?? []).map((p) => [p.id, p.full_name ?? null]),
  );

  const statsByCount = new Map<
    string,
    { items_count: number; with_diff: number; match_count: number }
  >();
  for (const item of itemRows ?? []) {
    const stats = statsByCount.get(item.count_id) ?? {
      items_count: 0,
      with_diff: 0,
      match_count: 0,
    };
    stats.items_count += 1;
    const diff = Number(item.difference_qty ?? 0);
    if (diff === 0) stats.match_count += 1;
    else stats.with_diff += 1;
    statsByCount.set(item.count_id, stats);
  }

  const pending: CountListRow[] = rawCounts
    .filter((c) => (statsByCount.get(c.id)?.items_count ?? 0) > 0)
    .map((c) => {
      const stats = statsByCount.get(c.id) ?? {
        items_count: 0,
        with_diff: 0,
        match_count: 0,
      };
      return {
        id: c.id,
        title: c.title,
        status: c.status,
        counted_at: c.counted_at,
        location_label: c.location_label,
        notes: c.notes,
        submitted_at: c.submitted_at,
        counted_by_name: c.counted_by
          ? (nameById.get(c.counted_by) ?? null)
          : null,
        items_count: stats.items_count,
        with_diff: stats.with_diff,
        match_count: stats.match_count,
      };
    })
    .sort((a, b) =>
      (b.submitted_at ?? b.counted_at).localeCompare(
        a.submitted_at ?? a.counted_at,
      ),
    );

  const totalNovedades = pending.reduce((acc, c) => acc + c.with_diff, 0);
  const totalItems = pending.reduce((acc, c) => acc + c.items_count, 0);

  return (
    <>
      <AppHeader title="Inventario" subtitle="Revisión de inventario físico" />
      <main className="space-y-6 p-8">
        <InventarioNav
          permissions={ctx.permissions}
          isSuperAdmin={isSuperAdmin(ctx.role)}
        />
        <PageIntro
          title="Revisión física"
          description="Solo auditoría: revise novedades (sistema vs contado) y aplique o rechace el ajuste al stock. El conteo se hace en Inv. físico."
        />
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard
            label="Conteos por revisar"
            value={String(pending.length)}
            hint="Con al menos una categoría enviada"
          />
          <StatCard
            label="Productos en revisión"
            value={String(totalItems)}
            hint="Ítems esperando autorización"
          />
          <StatCard
            label="Novedades"
            value={String(totalNovedades)}
            hint="Diferencia ≠ 0"
          />
        </div>
        <PhysicalReviewQueue counts={pending} />
      </main>
    </>
  );
}
