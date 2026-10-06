import { AppHeader } from "@/components/layout/app-header";
import { EmptyState, PageIntro, StatCard } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess, requireModuleAccess } from "@/lib/permissions";
import { isSuperAdmin } from "@/types/domain";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ComprasNav } from "../compras-nav";
import {
  CreatePhysicalCountForm,
  PhysicalCountList,
  type CountListRow,
} from "./fisico-client";

export default async function InventarioFisicoPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "compras.inventario-fisico");
  if (!ctx.organization) redirect("/empresa");

  const supabase = await createClient();
  const { data } = await supabase
    .from("physical_inventory_counts")
    .select("id, title, status, counted_at, location_label")
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .order("counted_at", { ascending: false });

  const counts = (data ?? []) as CountListRow[];
  const pendingReview = counts.filter((c) => c.status === "ENVIADO").length;
  const canCreate = ctxCanAccess(ctx, "compras.inventario-fisico");

  return (
    <>
      <AppHeader title="Compras" subtitle="Inventario físico" />
      <main className="space-y-6 p-8">
        <ComprasNav
          permissions={ctx.permissions}
          isSuperAdmin={isSuperAdmin(ctx.role)}
        />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageIntro
            title="Conteo físico"
            description="El administrador del punto reporta cantidades. Gestión revisa diferencias y aplica (o rechaza) el ajuste al stock del sistema."
          />
          {canCreate ? <CreatePhysicalCountForm /> : null}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <StatCard label="Por revisar (Gestión)" value={String(pendingReview)} />
          <StatCard label="Conteos" value={String(counts.length)} />
        </div>
        {counts.length === 0 ? (
          <EmptyState
            title="Sin conteos"
            description="Cree un conteo, registre productos contados y envíelo a revisión."
          />
        ) : (
          <PhysicalCountList counts={counts} />
        )}
      </main>
    </>
  );
}
