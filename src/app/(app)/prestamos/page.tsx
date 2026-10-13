import { AppHeader } from "@/components/layout/app-header";
import {
  Badge,
  Card,
  PageIntro,
  StatCard,
} from "@/components/ui/primitives";
import {
  WorkEmptyHint,
  WorkSection,
  WorkStack,
} from "@/components/ui/work-section";
import { getOrgContext } from "@/lib/org-context";
import { requireModuleAccess } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatCOP, money } from "@/lib/money";
import { computeLoanKpis, disbursementTreasuryStatus } from "@/lib/loans";
import { bankKindLabel } from "@/lib/treasury";
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
  requireModuleAccess(ctx, "prestamos");
  if (!ctx.organization) {
    return (
      <>
        <AppHeader title="Préstamos" subtitle="Socios → empresa" />
        <main className="p-8">
          <Card>
            <p className="font-medium">Primero configura la empresa</p>
            <Link
              href="/empresa"
              className="mt-4 inline-flex rounded-lg bg-[var(--solid)] px-4 py-2 text-sm text-[var(--on-solid)]"
            >
              Ir a Empresa
            </Link>
          </Card>
        </main>
      </>
    );
  }

  const supabase = await createClient();
  const [{ data: loanRows }, { data: shRows }, { data: bankRows }] =
    await Promise.all([
      supabase
        .from("loans")
        .select(
          "id, lender_shareholder_id, lender_name, contract_date, approved_principal, status, notes",
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
        .select("id, bank_name, account_kind, is_cash_float")
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("bank_name"),
    ]);

  const loans = (loanRows ?? []) as LoanRow[];
  const shareholders = (shRows ?? []) as ShareholderOption[];
  const banks: BankOption[] = (bankRows ?? []).map((b) => ({
    id: b.id,
    bank_name: `${b.bank_name} · ${bankKindLabel(b.account_kind, {
      isCashFloat: Boolean(b.is_cash_float),
    })}`,
    account_kind: b.account_kind,
  }));
  const loanIds = loans.map((l) => l.id);

  let disbursements: DisbursementRow[] = [];
  let payments: PaymentRow[] = [];
  if (loanIds.length > 0) {
    const [{ data: d }, { data: p }] = await Promise.all([
      supabase
        .from("loan_disbursements")
        .select(
          "id, loan_id, disbursement_date, amount, bank_account_id, bank_transaction_id, notes",
        )
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .in("loan_id", loanIds)
        .order("disbursement_date", { ascending: false }),
      supabase
        .from("loan_payments")
        .select(
          "id, loan_id, payment_date, principal_amount, interest_amount, total_amount",
        )
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .in("loan_id", loanIds),
    ]);
    disbursements = (d ?? []) as DisbursementRow[];
    payments = (p ?? []) as PaymentRow[];
  }

  let totalDebt = money(0);
  let totalLent = money(0);
  let pendingTreasury = 0;

  for (const loan of loans.filter((l) => l.status !== "ANULADO")) {
    const loanDisbs = disbursements.filter((d) => d.loan_id === loan.id);
    const kpis = computeLoanKpis({
      approvedPrincipal: loan.approved_principal,
      disbursements: loanDisbs.map((d) => d.amount),
      principalPaid: payments
        .filter((p) => p.loan_id === loan.id)
        .map((p) => p.principal_amount),
      interestAccrued: 0,
      interestPaid: [],
    });
    totalDebt = totalDebt.plus(kpis.saldoCapital);
    totalLent = totalLent.plus(kpis.capitalDesembolsado);
    for (const d of loanDisbs) {
      if (disbursementTreasuryStatus(d) !== "EN_TESORERIA") pendingTreasury += 1;
    }
  }

  return (
    <>
      <AppHeader
        title="Préstamos"
        subtitle="Dinero que socios prestan a la empresa"
      />
      <main className="space-y-6 p-8">
        <PageIntro
          title="Préstamos de socios"
          description="Solo registra quién prestó, cuándo, cuánto y a qué cuenta entró. Sin intereses ni plazos por ahora."
        />

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="Deuda con socios" value={formatCOP(totalDebt)} />
          <StatCard label="Total prestado" value={formatCOP(totalLent)} />
          <StatCard label="Préstamos" value={String(loans.length)} />
        </div>

        {pendingTreasury > 0 ? (
          <Card>
            <p className="text-sm">
              Hay <strong>{pendingTreasury}</strong> préstamo
              {pendingTreasury === 1 ? "" : "s"} sin movimiento en la cuenta.
              Usa <em>Cargar en cuenta</em> en cada ficha.
            </p>
            <Link
              href="/tesoreria"
              className="mt-3 inline-flex text-sm font-medium text-[var(--ink)] underline"
            >
              Ver Tesorería
            </Link>
          </Card>
        ) : null}

        <WorkStack>
          <WorkSection
            kind="form"
            title="Nuevo préstamo"
            description="Socio → fecha → monto → cuenta de destino."
            defaultOpen
          >
            <CreateLoanForm
              shareholders={shareholders}
              banks={banks}
              embedded
            />
          </WorkSection>

          <WorkSection
            kind="list"
            title="Préstamos"
            badge={<Badge tone="neutral">{loans.length}</Badge>}
            summary={
              loans.length === 0
                ? "Sin préstamos"
                : `Deuda ${formatCOP(totalDebt)}`
            }
            defaultOpen
          >
            {loans.length === 0 ? (
              <WorkEmptyHint
                title="Aún no hay préstamos"
                description="Cuando un socio preste dinero a la empresa, regístralo aquí con la cuenta donde cayó."
              />
            ) : (
              <div className="space-y-4">
                {loans.map((loan) => (
                  <LoanCard
                    key={loan.id}
                    loan={loan}
                    disbursements={disbursements.filter(
                      (d) => d.loan_id === loan.id,
                    )}
                    payments={payments.filter((p) => p.loan_id === loan.id)}
                    banks={banks}
                  />
                ))}
              </div>
            )}
          </WorkSection>
        </WorkStack>
      </main>
    </>
  );
}
