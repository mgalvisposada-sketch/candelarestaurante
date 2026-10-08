import { AppHeader } from "@/components/layout/app-header";
import { EmptyState, PageIntro, StatCard } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess, requireModuleAccess } from "@/lib/permissions";
import { isSuperAdmin } from "@/types/domain";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { InventarioNav } from "../inventario-nav";
import {
  CreatePhysicalCountForm,
  PhysicalCountList,
  type CountListRow,
} from "./fisico-client";

export default async function InventarioFisicoPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "inventario.fisico");
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
          .select("count_id, difference_qty")
          .in("count_id", countIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] as { count_id: string; difference_qty: number | string }[] }),
    counterIds.length
      ? supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", counterIds)
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

  const counts: CountListRow[] = rawCounts.map((c) => {
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
      counted_by_name: c.counted_by ? nameById.get(c.counted_by) ?? null : null,
      items_count: stats.items_count,
      with_diff: stats.with_diff,
      match_count: stats.match_count,
    };
  });

  // Por revisar primero en la bandeja; el resto conserva orden por fecha.
  counts.sort((a, b) => {
    if (a.status === "ENVIADO" && b.status !== "ENVIADO") return -1;
    if (a.status !== "ENVIADO" && b.status === "ENVIADO") return 1;
    if (a.status === "ENVIADO" && b.status === "ENVIADO") {
      return (b.submitted_at ?? "").localeCompare(a.submitted_at ?? "");
    }
    return b.counted_at.localeCompare(a.counted_at);
  });

  const pendingReview = counts.filter((c) => c.status === "ENVIADO").length;
  const drafts = counts.filter((c) => c.status === "BORRADOR").length;
  const canCreate = ctxCanAccess(ctx, "inventario.fisico");
  const canAdjust = ctxCanAccess(ctx, "inventario.fisico.ajustar");

  return (
    <>
      <AppHeader title="Inventario" subtitle="Inventario físico" />
      <main className="space-y-6 p-8">
        <InventarioNav
          permissions={ctx.permissions}
          isSuperAdmin={isSuperAdmin(ctx.role)}
        />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageIntro
            title="Conteo físico"
            description="Auditoría a ciegas: se registra lo físico sin ver el stock del sistema. Al enviar, Gestión compara y aplica o rechaza el ajuste."
          />
          {canCreate ? <CreatePhysicalCountForm /> : null}
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard
            label="Por revisar"
            value={String(pendingReview)}
            hint={
              canAdjust
                ? "Esperan autorización de Gestión"
                : "Enviados a Gestión"
            }
          />
          <StatCard label="En conteo" value={String(drafts)} hint="Borradores" />
          <StatCard
            label="Conteos"
            value={String(counts.length)}
            hint="Total registrados"
          />
        </div>
        {counts.length === 0 ? (
          <EmptyState
            title="Sin conteos"
            description="Cree un conteo, registre productos contados y envíelo a revisión."
          />
        ) : (
          <PhysicalCountList counts={counts} canAdjust={canAdjust} />
        )}
      </main>
    </>
  );
}
