import { AppHeader } from "@/components/layout/app-header";
import { Card, EmptyState, PageIntro, StatCard } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { createClient } from "@/lib/supabase/server";
import { todayInBogota } from "@/lib/dates";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ContractList,
  CreateContractForm,
  type ContractRow,
} from "./contracts-client";

export default async function ContratosPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  if (!ctx.organization) {
    return (
      <>
        <AppHeader title="Contratos" subtitle="Compromisos y vencimientos" />
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
    .from("contracts")
    .select(
      "id, counterparty, contract_type, start_date, end_date, auto_renewal, notice_days, cost_amount, periodicity, responsible_name, status, notes",
    )
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .order("end_date", { ascending: true, nullsFirst: false });

  const contracts = (data ?? []) as ContractRow[];
  const today = todayInBogota();
  const upcoming = contracts.filter((c) => {
    if (!c.end_date || c.status !== "ACTIVO") return false;
    const notice = c.notice_days ?? 30;
    const t = new Date(`${today}T12:00:00`).getTime();
    const d = new Date(`${c.end_date}T12:00:00`).getTime();
    const days = Math.round((d - t) / (1000 * 60 * 60 * 24));
    return days <= notice;
  }).length;

  return (
    <>
      <AppHeader title="Contratos" subtitle="Compromisos comerciales y vencimientos" />
      <main className="space-y-6 p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageIntro
            title="Contratos activos"
            description="Seguimiento de contraprestes, costos y fechas de aviso. No reemplaza gestión legal completa."
          />
          <CreateContractForm />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <StatCard label="Activos" value={String(contracts.filter((c) => c.status === "ACTIVO").length)} />
          <StatCard label="Por vencer / aviso" value={String(upcoming)} />
        </div>
        {contracts.length === 0 ? (
          <EmptyState
            title="Sin contratos"
            description="Registre arrendamientos, servicios y otros compromisos con fechas de fin."
          />
        ) : (
          <ContractList contracts={contracts} />
        )}
      </main>
    </>
  );
}
