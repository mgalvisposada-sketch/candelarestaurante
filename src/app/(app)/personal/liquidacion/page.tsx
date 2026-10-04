import { AppHeader } from "@/components/layout/app-header";
import { Card, PageIntro } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { requirePersonalSubAccess } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { isSuperAdmin } from "@/types/domain";
import { PersonalNav } from "../personal-nav";
import {
  CreatePeriodForm,
  PeriodsList,
  type PeriodRow,
} from "./liquidacion-client";

export default async function LiquidacionPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requirePersonalSubAccess(ctx, "personal.liquidacion");
  if (!ctx.organization) {
    return (
      <>
        <AppHeader title="Personal" subtitle="Liquidación" />
        <main className="p-8">
          <Card>
            <p className="font-medium">Primero configura la empresa</p>
            <Link
              href="/empresa"
              className="mt-4 inline-flex rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white"
            >
              Ir a Empresa
            </Link>
          </Card>
        </main>
      </>
    );
  }

  const supabase = await createClient();
  const { data: periods } = await supabase
    .from("payroll_periods")
    .select(
      "id, period_year, period_month, period_half, period_start, period_end, status, calculated_at, emitted_at",
    )
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false })
    .order("period_half", { ascending: false });

  return (
    <>
      <AppHeader title="Personal" subtitle="Liquidación quincenal" />
      <main className="space-y-6 p-8">
        <PersonalNav
          permissions={ctx.permissions}
          isSuperAdmin={isSuperAdmin(ctx.role)}
        />
        <PageIntro
          title="Liquidación de quincena"
          description="El gerente crea el periodo, calcula con condiciones del empleado + novedades aprobadas, y emite el paquete a Contabilidad/RRHH, Tesorería y SST."
        />
        <CreatePeriodForm />
        <PeriodsList periods={(periods ?? []) as PeriodRow[]} />
      </main>
    </>
  );
}
