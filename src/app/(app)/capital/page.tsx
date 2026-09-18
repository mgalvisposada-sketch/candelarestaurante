import { AppHeader } from "@/components/layout/app-header";
import { Card, EmptyState, PageIntro, StatCard } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { requireModuleAccess } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatCOP, money } from "@/lib/money";
import { computeFundingBag } from "@/lib/loans";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  AllocationCard,
  CreateAllocationForm,
  type AllocationRow,
  type DisbursementWithLoan,
} from "./capital-client";

export default async function CapitalPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "capital");
  if (!ctx.organization) {
    return (
      <>
        <AppHeader title="Capital" subtitle="Uso de recursos" />
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
  const { data: disbRows } = await supabase
    .from("loan_disbursements")
    .select("id, loan_id, disbursement_date, amount, loans(lender_name)")
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .order("disbursement_date", { ascending: false });

  const disbursements: DisbursementWithLoan[] = (disbRows ?? []).map((d) => {
    const loan = d.loans as unknown as { lender_name: string } | null;
    return {
      id: d.id,
      loan_id: d.loan_id,
      disbursement_date: d.disbursement_date,
      amount: d.amount,
      lender_name: loan?.lender_name ?? "Préstamo",
    };
  });

  const { data: allocRows } = await supabase
    .from("funding_allocations")
    .select(
      "id, loan_disbursement_id, category, concept, approved_amount, committed_amount, paid_amount, notes",
    )
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const allocations = (allocRows ?? []) as AllocationRow[];

  let available = money(0);
  let approved = money(0);
  let committed = money(0);
  for (const a of allocations) {
    const bag = computeFundingBag({
      approved: a.approved_amount,
      committed: a.committed_amount,
      paid: a.paid_amount,
    });
    available = available.plus(bag.disponible);
    approved = approved.plus(bag.aprobado);
    committed = committed.plus(bag.comprometido);
  }

  return (
    <>
      <AppHeader title="Capital" subtitle="Uso de recursos prestados y solicitudes" />
      <main className="space-y-6 p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageIntro
            title="¿Qué pasó con el dinero?"
            description="Por cada desembolso se definen bolsas con aprobado, comprometido, pagado y disponible."
          />
          <CreateAllocationForm disbursements={disbursements} />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="Aprobado" value={formatCOP(approved)} />
          <StatCard label="Comprometido" value={formatCOP(committed)} />
          <StatCard label="Disponible" value={formatCOP(available)} />
        </div>

        {disbursements.length === 0 ? (
          <EmptyState
            title="Sin desembolsos"
            description="Registre desembolsos en Préstamos para poder asignar bolsas de uso."
          />
        ) : allocations.length === 0 ? (
          <EmptyState
            title="Sin asignaciones de capital"
            description="Cree bolsas (CxP, nómina, impuestos, capital de trabajo…) por desembolso."
          />
        ) : (
          <div className="space-y-4">
            {allocations.map((a) => (
              <AllocationCard
                key={a.id}
                allocation={a}
                disbursement={disbursements.find((d) => d.id === a.loan_disbursement_id)}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
