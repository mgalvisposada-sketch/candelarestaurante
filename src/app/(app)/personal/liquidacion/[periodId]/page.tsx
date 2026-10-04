import { AppHeader } from "@/components/layout/app-header";
import { Card } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { requirePersonalSubAccess } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { isSuperAdmin } from "@/types/domain";
import { PersonalNav } from "../../personal-nav";
import {
  PeriodDetailClient,
  type LineRow,
  type PeriodRow,
} from "../liquidacion-client";

export default async function LiquidacionDetailPage({
  params,
}: {
  params: Promise<{ periodId: string }>;
}) {
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

  const { periodId } = await params;
  const supabase = await createClient();
  const [{ data: period }, { data: lines }] = await Promise.all([
    supabase
      .from("payroll_periods")
      .select(
        "id, period_year, period_month, period_half, period_start, period_end, status, calculated_at, emitted_at",
      )
      .eq("id", periodId)
      .eq("organization_id", ctx.organization.id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("payroll_period_lines")
      .select(
        "id, employee_id, employee_name, position_title, novelty_count, net_pay, employer_cost, earnings_total, deductions_total, snapshot",
      )
      .eq("period_id", periodId)
      .eq("organization_id", ctx.organization.id)
      .is("deleted_at", null)
      .order("employee_name"),
  ]);

  if (!period) notFound();

  return (
    <>
      <AppHeader title="Personal" subtitle="Detalle de liquidación" />
      <main className="space-y-6 p-8">
        <PersonalNav
          permissions={ctx.permissions}
          isSuperAdmin={isSuperAdmin(ctx.role)}
        />
        <PeriodDetailClient
          period={period as PeriodRow}
          lines={(lines ?? []) as LineRow[]}
        />
      </main>
    </>
  );
}
