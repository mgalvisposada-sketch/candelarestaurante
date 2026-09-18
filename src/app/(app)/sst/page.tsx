import { AppHeader } from "@/components/layout/app-header";
import { Card, PageIntro, StatCard } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { requireModuleAccess } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatCOP } from "@/lib/money";
import { formatDateCO } from "@/lib/dates";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SstForm, type SstRow } from "./sst-client";

export default async function SstPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "sst");
  if (!ctx.organization) {
    return (
      <>
        <AppHeader title="SST" subtitle="Documental y económico" />
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
  const { data } = await supabase
    .from("sst_records")
    .select(
      "id, has_sg_sst, responsible_name, provider_name, monthly_cost, annual_cost, arl, documentation_status, last_review_date, next_review_date, notes",
    )
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const record = (data as SstRow | null) ?? null;

  return (
    <>
      <AppHeader title="SST" subtitle="Documental y económico — no es SG-SST completo" />
      <main className="space-y-6 p-8">
        <PageIntro
          title="Seguridad y salud en el trabajo"
          description="Fotografía administrativa: costos, ARL, proveedor y próximas revisiones."
        />
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard
            label="Costo mensual"
            value={record?.monthly_cost != null ? formatCOP(record.monthly_cost) : "—"}
          />
          <StatCard
            label="Costo anual"
            value={record?.annual_cost != null ? formatCOP(record.annual_cost) : "—"}
          />
          <StatCard
            label="Próxima revisión"
            value={
              record?.next_review_date ? formatDateCO(record.next_review_date) : "—"
            }
          />
        </div>
        <SstForm record={record} />
      </main>
    </>
  );
}
