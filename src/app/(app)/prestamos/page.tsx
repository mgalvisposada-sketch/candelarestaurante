import { AppHeader } from "@/components/layout/app-header";
import { Card, EmptyState, PageIntro, StatCard } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { createClient } from "@/lib/supabase/server";
import { formatCOP, money } from "@/lib/money";
import { computeLoanKpis } from "@/lib/loans";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  CreateLoanForm,
  LoanCard,
  type DisbursementRow,
  type LoanRow,
  type PaymentRow,
  type ShareholderOption,
  type BankOption,
} from "./loans-client";

export default async function PrestamosPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  if (!ctx.organization) {
    return (
      <>
        <AppHeader title="Préstamos" subtitle="Financiación de socios" />
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
  const [{ data: loanRows }, { data: shRows }, { data: bankRows }] = await Promise.all([
    supabase
      .from("loans")
      .select(
        "id, lender_shareholder_id, lender_name, contract_date, approved_principal, interest_rate, rate_type, term_months, grace_period_months, first_installment_date, amortization_method, status, notes, verification_status, comments, source",
      )
      .eq("organization_id", ctx.organization.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("shareholders")
      .select("id, full_name")
      .eq("organization_id", ctx.organization.id)
      .is("deleted_at", null)
      .order("full_name"),
    supabase
      .from("bank_accounts")
      .select("id, bank_name")
      .eq("organization_id", ctx.organization.id)
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("bank_name"),
  ]);

  const loans = (loanRows ?? []) as LoanRow[];
  const shareholders = (shRows ?? []) as ShareholderOption[];
  const banks = (bankRows ?? []) as BankOption[];
  const loanIds = loans.map((l) => l.id);

  let disbursements: DisbursementRow[] = [];
  let payments: PaymentRow[] = [];
  if (loanIds.length > 0) {
    const [{ data: d }, { data: p }] = await Promise.all([
      supabase
        .from("loan_disbursements")
        .select("id, loan_id, disbursement_date, amount, bank_account_id, notes")
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .in("loan_id", loanIds),
      supabase
        .from("loan_payments")
        .select("id, loan_id, payment_date, principal_amount, interest_amount, total_amount")
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .in("loan_id", loanIds),
    ]);
    disbursements = (d ?? []) as DisbursementRow[];
    payments = (p ?? []) as PaymentRow[];
  }

  let totalDebt = money(0);
  let totalDisbursed = money(0);
  for (const loan of loans.filter((l) => l.status !== "ANULADO")) {
    const kpis = computeLoanKpis({
      approvedPrincipal: loan.approved_principal,
      disbursements: disbursements.filter((d) => d.loan_id === loan.id).map((d) => d.amount),
      principalPaid: payments.filter((p) => p.loan_id === loan.id).map((p) => p.principal_amount),
      interestAccrued: 0,
      interestPaid: payments.filter((p) => p.loan_id === loan.id).map((p) => p.interest_amount),
    });
    totalDebt = totalDebt.plus(kpis.saldoCapital);
    totalDisbursed = totalDisbursed.plus(kpis.capitalDesembolsado);
  }

  return (
    <>
      <AppHeader
        title="Préstamos"
        subtitle="Financiación de socios — distinta de aportes de capital"
      />
      <main className="space-y-6 p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageIntro
            title="Préstamos de socios"
            description="Diferencie CAPITAL, PRÉSTAMO, ANTICIPO y OTRO. Cada préstamo muestra capital inicial, desembolsado, pagado, interés y saldo."
          />
          <CreateLoanForm shareholders={shareholders} />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="Saldo capital activo" value={formatCOP(totalDebt)} />
          <StatCard label="Total desembolsado" value={formatCOP(totalDisbursed)} />
          <StatCard label="Préstamos" value={String(loans.length)} />
        </div>

        {loans.length === 0 ? (
          <EmptyState
            title="Sin préstamos"
            description="Registre contratos, desembolsos y pagos. El uso del dinero se asigna en Capital."
          />
        ) : (
          <div className="space-y-4">
            {loans.map((loan) => (
              <LoanCard
                key={loan.id}
                loan={loan}
                disbursements={disbursements.filter((d) => d.loan_id === loan.id)}
                payments={payments.filter((p) => p.loan_id === loan.id)}
                shareholders={shareholders}
                banks={banks}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
