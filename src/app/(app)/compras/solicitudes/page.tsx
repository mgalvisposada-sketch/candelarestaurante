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
            <Link href="/empresa" className="mt-4 inline-flex rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white">
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
    .select("id, title, status, requested_at, needed_by, location_label")
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .order("requested_at", { ascending: false });

  const requests = (rows ?? []) as PurchaseRequestListRow[];
  const enviadas = requests.filter((r) => r.status === "ENVIADA").length;
  const enCurso = requests.filter((r) =>
    ["PEDIDA", "RECIBIDA_PARCIAL"].includes(r.status),
  ).length;
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
            description="Arme la solicitud, envíela a compras, apruebe proveedores y use el documento «Pedidos por proveedor» para enviar a cada uno. Luego reciba mercancía y acepte la factura hacia tesorería."
          />
          {canCreate ? <CreatePurchaseRequestForm /> : null}
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="Por aprobar" value={String(enviadas)} />
          <StatCard label="En tránsito / parcial" value={String(enCurso)} />
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
