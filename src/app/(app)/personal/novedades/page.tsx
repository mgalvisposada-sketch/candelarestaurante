import { AppHeader } from "@/components/layout/app-header";
import { Card, PageIntro } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import {
  requirePersonalSubAccess,
  ctxCanAccess,
} from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { isSuperAdmin } from "@/types/domain";
import { PersonalNav } from "../personal-nav";
import { NovedadesClient, type NoveltyRow } from "./novedades-client";

export default async function NovedadesPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requirePersonalSubAccess(ctx, "personal.novedades");
  if (!ctx.organization) {
    return (
      <>
        <AppHeader title="Personal" subtitle="Novedades" />
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
  const [{ data: novRows }, { data: empRows }] = await Promise.all([
    supabase
      .from("shift_novelties")
      .select(
        "id, employee_id, novelty_date, novelty_type, status, minutes, amount, start_time, end_time, notes, review_notes",
      )
      .eq("organization_id", ctx.organization.id)
      .is("deleted_at", null)
      .order("novelty_date", { ascending: false })
      .limit(200),
    supabase
      .from("employees")
      .select("id, full_name")
      .eq("organization_id", ctx.organization.id)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("full_name"),
  ]);

  const nameById = new Map((empRows ?? []).map((e) => [e.id, e.full_name]));
  const novelties = ((novRows ?? []) as NoveltyRow[]).map((n) => ({
    ...n,
    employee_name: nameById.get(n.employee_id),
  }));

  const canApprove = ctxCanAccess(ctx, "personal.novedades.aprobar");

  return (
    <>
      <AppHeader title="Personal" subtitle="Novedades en turno" />
      <main className="space-y-6 p-8">
        <PersonalNav
          permissions={ctx.permissions}
          isSuperAdmin={isSuperAdmin(ctx.role)}
        />
        <PageIntro
          title="Novedades"
          description="Registro operativo del local (tardanzas, permisos, extras, anticipos). Solo las aprobadas impactan la liquidación quincenal."
        />
        <NovedadesClient
          novelties={novelties}
          employees={empRows ?? []}
          canApprove={canApprove}
        />
      </main>
    </>
  );
}
