import { AppHeader } from "@/components/layout/app-header";
import { Card, EmptyState, PageIntro, StatCard } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { createClient } from "@/lib/supabase/server";
import { todayInBogota } from "@/lib/dates";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CreateTaxForm, TaxList, type TaxRow } from "./tax-client";

export default async function TributarioPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  if (!ctx.organization) {
    return (
      <>
        <AppHeader title="Tributario" subtitle="Calendario de obligaciones" />
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
    .from("tax_obligations")
    .select(
      "id, obligation_type, period, due_date, declared_amount, paid_amount, balance_amount, status",
    )
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .order("due_date", { ascending: true, nullsFirst: false });

  const rows = (data ?? []) as TaxRow[];
  const today = todayInBogota();
  const upcoming = rows.filter(
    (r) =>
      r.due_date &&
      r.due_date >= today &&
      (r.status === "PENDIENTE" || r.status === "PRESENTADA"),
  ).length;
  const overdue = rows.filter(
    (r) => r.due_date && r.due_date < today && r.status !== "PAGADA" && r.status !== "NO_APLICA",
  ).length;

  return (
    <>
      <AppHeader
        title="Tributario"
        subtitle="Calendario y obligaciones — no reemplaza contabilidad"
      />
      <main className="space-y-6 p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageIntro
            title="Obligaciones fiscales"
            description="Seguimiento de vencimientos, estados y saldos. El contador sigue siendo la fuente legal."
          />
          <CreateTaxForm />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="Próximas" value={String(upcoming)} />
          <StatCard label="Vencidas" value={String(overdue)} />
          <StatCard label="Total" value={String(rows.length)} />
        </div>
        {rows.length === 0 ? (
          <EmptyState
            title="Sin obligaciones"
            description="Cargue IVA, retenciones, renta u otras obligaciones con fecha de vencimiento."
          />
        ) : (
          <TaxList rows={rows} />
        )}
      </main>
    </>
  );
}
