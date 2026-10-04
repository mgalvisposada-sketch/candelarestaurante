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
  CargosCandelaForm,
  HorarioCandelaForm,
  ParametrosOrdinariosForm,
  type JobPositionRow,
  type LegalParamsRow,
  type ScheduleRow,
} from "./parametros-client";

export default async function PersonalParametrosPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requirePersonalSubAccess(ctx, "personal.parametros");
  if (!ctx.organization) {
    return (
      <>
        <AppHeader title="Personal" subtitle="Parámetros" />
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

  const sp = await searchParams;
  const tab =
    sp.tab === "legales" || sp.tab === "cargos" ? sp.tab : "horario";

  const supabase = await createClient();
  const [{ data: schedule }, { data: legal }, { data: positions }] =
    await Promise.all([
      supabase
        .from("payroll_schedules")
        .select(
          "id, name, ordinary_entry_time, ordinary_exit_time, break_minutes, works_monday, works_tuesday, works_wednesday, works_thursday, works_friday, works_saturday, works_sunday",
        )
        .eq("organization_id", ctx.organization.id)
        .eq("is_active", true)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase
        .from("payroll_legal_params")
        .select("*")
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .is("effective_to", null)
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("job_positions")
        .select(
          "id, code, name, arl_risk_level, default_break_minutes, notes, is_active",
        )
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .order("name"),
    ]);

  const tabs = [
    { key: "horario", label: "Horario Candela" },
    { key: "legales", label: "Parámetros ordinarios" },
    { key: "cargos", label: "Cargos Candela" },
  ] as const;

  return (
    <>
      <AppHeader title="Personal" subtitle="Parámetros de nómina" />
      <main className="space-y-6 p-8">
        <PersonalNav
          permissions={ctx.permissions}
          isSuperAdmin={isSuperAdmin(ctx.role)}
        />
        <PageIntro
          title="Parámetros"
          description="Horario Candela, reglas legales colombianas y cargos con ARL sugerida. Alimentan novedades y liquidación quincenal."
        />

        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`/personal/parametros?tab=${t.key}`}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                tab === t.key
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "text-[var(--muted)]"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>

        {tab === "horario" ? (
          <HorarioCandelaForm schedule={(schedule as ScheduleRow | null) ?? null} />
        ) : null}
        {tab === "legales" ? (
          <ParametrosOrdinariosForm
            params={(legal as LegalParamsRow | null) ?? null}
          />
        ) : null}
        {tab === "cargos" ? (
          <CargosCandelaForm positions={(positions ?? []) as JobPositionRow[]} />
        ) : null}
      </main>
    </>
  );
}
