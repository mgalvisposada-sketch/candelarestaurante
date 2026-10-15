import { AppHeader } from "@/components/layout/app-header";
import { Card, EmptyState, PageIntro, StatCard } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess, requireModuleAccess } from "@/lib/permissions";
import { isSuperAdmin } from "@/types/domain";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ComprasNav } from "../compras-nav";
import {
  CreatePurchaseRequestForm,
  PurchaseRequestList,
  type PurchaseRequestListRow,
} from "./solicitudes-client";
import { derivePurchaseListNextAction } from "@/lib/purchases/list-next-action";

export default async function ComprasSolicitudesPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "compras.solicitudes");
  if (!ctx.organization) {
    return (
      <>
        <AppHeader title="Compras" subtitle="Solicitudes" />
        <main className="p-8">
          <Card>
            <p className="font-medium">Primero configura la empresa</p>
            <Link href="/empresa" className="mt-4 inline-flex rounded-lg bg-[var(--solid)] px-4 py-2 text-sm text-[var(--on-solid)]">
              Ir a Empresa
            </Link>
          </Card>
        </main>
      </>
    );
  }

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("purchase_requests")
    .select(
      "id, title, status, requested_at, needed_by, location_label, is_urgent, payment_mode",
    )
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .order("requested_at", { ascending: false });

  const baseRows = (rows ?? []) as Omit<PurchaseRequestListRow, "nextAction">[];
  const requestIds = baseRows.map((r) => r.id);

  const orderStatusesByRequest = new Map<string, string[]>();
  if (requestIds.length > 0) {
    const { data: orderRows } = await supabase
      .from("purchase_supplier_orders")
      .select("purchase_request_id, status")
      .eq("organization_id", ctx.organization.id)
      .in("purchase_request_id", requestIds)
      .is("deleted_at", null);
    for (const row of orderRows ?? []) {
      const rid = row.purchase_request_id as string;
      const list = orderStatusesByRequest.get(rid) ?? [];
      list.push((row.status as string) ?? "POR_PEDIR");
      orderStatusesByRequest.set(rid, list);
    }
  }

  const requests: PurchaseRequestListRow[] = baseRows.map((r) => ({
    ...r,
    nextAction: derivePurchaseListNextAction({
      status: r.status,
      orderStatuses: orderStatusesByRequest.get(r.id) ?? [],
    }),
  }));

  const enviadas = requests.filter((r) => r.nextAction?.key === "autorizar")
    .length;
  const autorizadas = requests.filter((r) => r.nextAction?.key === "pedir")
    .length;
  const porRecibir = requests.filter((r) => r.nextAction?.key === "recibir")
    .length;
  const canCreate = ctxCanAccess(ctx, "compras.solicitudes.crear");

  return (
    <>
      <AppHeader title="Compras" subtitle="Solicitudes de reposición" />
      <main className="space-y-6 p-8">
        <ComprasNav
          permissions={ctx.permissions}
          isSuperAdmin={isSuperAdmin(ctx.role)}
        />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageIntro
            title="Solicitudes de compra"
            description="Sin autorización no se compra. Prepago (mayoría): autorizar → facturar → pagar → recibir. Crédito: autorizar → pedir → recibir → facturar → pagar."
          />
          {canCreate ? <CreatePurchaseRequestForm /> : null}
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard label="Por autorizar" value={String(enviadas)} />
          <StatCard label="Autorizadas / por pedir" value={String(autorizadas)} />
          <StatCard label="Listas para recibir" value={String(porRecibir)} />
          <StatCard label="Total" value={String(requests.length)} />
        </div>
        {requests.length === 0 ? (
          <EmptyState
            title="Sin solicitudes"
            description="Cree una solicitud, agregue productos del inventario y envíela a compras."
          />
        ) : (
          <PurchaseRequestList requests={requests} />
        )}
      </main>
    </>
  );
}
