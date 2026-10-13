import { AppHeader } from "@/components/layout/app-header";
import {
  Card,
  EmptyState,
  PageIntro,
  StatCard,
} from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess, requireModuleAccess } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatCOP, money } from "@/lib/money";
import { todayInBogota } from "@/lib/dates";
import { isSuperAdmin } from "@/types/domain";
import { redirect } from "next/navigation";
import Link from "next/link";
import { TesoreriaNav } from "../tesoreria-nav";
import {
  PaymentHistoryFiltersForm,
  PaymentHistoryTable,
  type FilterOption,
  type PaymentHistoryFilters,
  type PaymentHistoryRow,
  type PaymentLegRow,
} from "./payments-history-client";

type SearchParams = {
  from?: string;
  to?: string;
  q?: string;
  source?: string;
  supplier_id?: string;
  account_id?: string;
  fund_purpose?: string;
  min_amount?: string;
  max_amount?: string;
};

function daysAgo(n: number): string {
  const d = new Date(`${todayInBogota()}T12:00:00-05:00`);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function parseAmount(raw: string | undefined): number | null {
  if (!raw?.trim()) return null;
  const n = Number(raw.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

export default async function TesoreriaPagosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "tesoreria");

  const canSee =
    ctxCanAccess(ctx, "tesoreria.pagos") ||
    ctxCanAccess(ctx, "tesoreria.cuentas") ||
    ctxCanAccess(ctx, "tesoreria.caja") ||
    ctxCanAccess(ctx, "solicitudes-pago.pagar");

  if (!canSee) {
    redirect("/tesoreria");
  }

  if (!ctx.organization) {
    return (
      <>
        <AppHeader title="Tesorería" subtitle="Historial de pagos" />
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

  const sp = await searchParams;
  const filters: PaymentHistoryFilters = {
    from: sp.from?.trim() || daysAgo(90),
    to: sp.to?.trim() || todayInBogota(),
    q: sp.q?.trim() || "",
    source: sp.source?.trim() || "",
    supplier_id: sp.supplier_id?.trim() || "",
    account_id: sp.account_id?.trim() || "",
    fund_purpose: sp.fund_purpose?.trim() || "",
    min_amount: sp.min_amount?.trim() || "",
    max_amount: sp.max_amount?.trim() || "",
  };

  const supabase = await createClient();
  const orgId = ctx.organization.id;

  const [{ data: supplierRows }, { data: accountRows }] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("bank_accounts")
      .select(
        "id, bank_name, account_kind, fund_purpose, is_cash_float, masked_number",
      )
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .order("bank_name"),
  ]);

  const accountsById = new Map(
    (accountRows ?? []).map((a) => [
      a.id as string,
      a as {
        id: string;
        bank_name: string;
        account_kind: string | null;
        fund_purpose: "VENTAS" | "EMPRESA" | null;
        is_cash_float: boolean | null;
        masked_number: string | null;
      },
    ]),
  );

  const supplierOptions: FilterOption[] = (supplierRows ?? []).map((s) => ({
    id: s.id as string,
    label: s.name as string,
  }));
  const accountOptions: FilterOption[] = [...accountsById.values()].map(
    (a) => ({
      id: a.id,
      label: `${a.is_cash_float ? "Base · " : ""}${a.bank_name}${
        a.masked_number ? ` · ${a.masked_number}` : ""
      }${a.fund_purpose ? ` · ${a.fund_purpose === "VENTAS" ? "Ventas" : "Empresa"}` : ""}`,
    }),
  );

  let requestQuery = supabase
    .from("payment_requests")
    .select(
      "id, source, concept, amount, paid_amount, paid_at, payment_reference, document_type, document_number, notes, supplier_id, bank_account_id, approved_by, updated_by, created_by",
    )
    .eq("organization_id", orgId)
    .eq("status", "PAGADA")
    .is("deleted_at", null)
    .order("paid_at", { ascending: false })
    .limit(500);

  if (filters.from) {
    requestQuery = requestQuery.gte("paid_at", `${filters.from}T00:00:00-05:00`);
  }
  if (filters.to) {
    requestQuery = requestQuery.lte("paid_at", `${filters.to}T23:59:59-05:00`);
  }
  if (filters.source) {
    requestQuery = requestQuery.eq("source", filters.source);
  }
  if (filters.supplier_id) {
    requestQuery = requestQuery.eq("supplier_id", filters.supplier_id);
  }

  const { data: requestRows } = await requestQuery;
  const requests = requestRows ?? [];
  const requestIds = requests.map((r) => r.id as string);

  type TxRow = {
    id: string;
    bank_account_id: string;
    transaction_date: string;
    debit: number | string;
    reference: string | null;
    linked_entity_id: string;
  };

  let txRows: TxRow[] = [];
  if (requestIds.length > 0) {
    const { data } = await supabase
      .from("bank_transactions")
      .select(
        "id, bank_account_id, transaction_date, debit, reference, linked_entity_id",
      )
      .eq("organization_id", orgId)
      .eq("linked_entity_type", "payment_requests")
      .is("deleted_at", null)
      .in("linked_entity_id", requestIds)
      .order("transaction_date", { ascending: true });
    txRows = (data ?? []) as TxRow[];
  }

  const legsByRequest = new Map<string, PaymentLegRow[]>();
  for (const tx of txRows) {
    const acc = accountsById.get(tx.bank_account_id);
    const leg: PaymentLegRow = {
      id: tx.id,
      bank_account_id: tx.bank_account_id,
      account_name: acc?.bank_name ?? "Cuenta",
      fund_purpose: acc?.fund_purpose ?? null,
      is_cash_float: Boolean(acc?.is_cash_float),
      transaction_date: tx.transaction_date,
      debit: tx.debit,
      reference: tx.reference,
    };
    const list = legsByRequest.get(tx.linked_entity_id) ?? [];
    list.push(leg);
    legsByRequest.set(tx.linked_entity_id, list);
  }

  const profileIds = [
    ...new Set(
      requests.flatMap((r) =>
        [r.updated_by, r.approved_by, r.created_by].filter(Boolean),
      ),
    ),
  ] as string[];

  const profileName = new Map<string, string>();
  if (profileIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", profileIds);
    for (const p of profiles ?? []) {
      profileName.set(
        p.id as string,
        (p.full_name as string) || (p.email as string) || "Usuario",
      );
    }
  }

  const supplierName = new Map(
    supplierOptions.map((s) => [s.id, s.label] as const),
  );

  const minAmt = parseAmount(filters.min_amount);
  const maxAmt = parseAmount(filters.max_amount);
  const q = filters.q.toLowerCase();

  let rows: PaymentHistoryRow[] = requests.map((r) => {
    let legs = legsByRequest.get(r.id as string) ?? [];
    if (legs.length === 0 && r.bank_account_id) {
      const acc = accountsById.get(r.bank_account_id as string);
      legs = [
        {
          id: `fallback-${r.id}`,
          bank_account_id: r.bank_account_id as string,
          account_name: acc?.bank_name ?? "Cuenta",
          fund_purpose: acc?.fund_purpose ?? null,
          is_cash_float: Boolean(acc?.is_cash_float),
          transaction_date: (r.paid_at as string)?.slice(0, 10) ?? "",
          debit: (r.paid_amount as number | string) ?? (r.amount as number | string),
          reference: (r.payment_reference as string | null) ?? null,
        },
      ];
    }
    const paymentDate =
      legs.map((l) => l.transaction_date).filter(Boolean).sort()[0] ??
      (r.paid_at as string | null)?.slice(0, 10) ??
      null;

    return {
      id: r.id as string,
      source: r.source as string,
      concept: r.concept as string,
      amount: r.amount as number | string,
      paid_amount: (r.paid_amount as number | string | null) ?? null,
      paid_at: (r.paid_at as string | null) ?? null,
      payment_date: paymentDate,
      payment_reference: (r.payment_reference as string | null) ?? null,
      document_type: (r.document_type as string | null) ?? null,
      document_number: (r.document_number as string | null) ?? null,
      notes: (r.notes as string | null) ?? null,
      supplier_id: (r.supplier_id as string | null) ?? null,
      supplier_name: r.supplier_id
        ? (supplierName.get(r.supplier_id as string) ?? null)
        : null,
      paid_by_name: r.updated_by
        ? (profileName.get(r.updated_by as string) ?? null)
        : null,
      approved_by_name: r.approved_by
        ? (profileName.get(r.approved_by as string) ?? null)
        : null,
      legs,
    };
  });

  if (filters.account_id) {
    rows = rows.filter((r) =>
      r.legs.some((l) => l.bank_account_id === filters.account_id),
    );
  }
  if (filters.fund_purpose === "VENTAS" || filters.fund_purpose === "EMPRESA") {
    rows = rows.filter((r) =>
      r.legs.some((l) => l.fund_purpose === filters.fund_purpose),
    );
  }
  if (minAmt != null) {
    rows = rows.filter((r) => money(r.paid_amount ?? r.amount).gte(minAmt));
  }
  if (maxAmt != null) {
    rows = rows.filter((r) => money(r.paid_amount ?? r.amount).lte(maxAmt));
  }
  if (q) {
    rows = rows.filter((r) => {
      const hay = [
        r.concept,
        r.payment_reference,
        r.document_number,
        r.document_type,
        r.supplier_name,
        r.notes,
        r.paid_by_name,
        ...r.legs.map((l) => l.account_name),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  const totalAmount = rows
    .reduce((acc, r) => acc.plus(money(r.paid_amount ?? r.amount)), money(0))
    .toFixed(2);

  return (
    <>
      <AppHeader
        title="Tesorería"
        subtitle="Historial de pagos · auditoría"
      />
      <main className="space-y-6 p-8">
        <TesoreriaNav
          permissions={ctx.permissions}
          isSuperAdmin={isSuperAdmin(ctx.role)}
        />

        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageIntro
            title="Historial de pagos"
            description="Pagos ejecutados desde la cola: cuentas, montos, referencias y quién los hizo. Pensado para auditorías internas, de socios o externas."
          />
          <Link
            href="/solicitudes-pago"
            className="rounded-lg border border-[var(--line)] px-4 py-2.5 text-sm font-medium hover:bg-neutral-50"
          >
            Ir a cola de pagos
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard
            label="Pagos en el filtro"
            value={String(rows.length)}
            hint="Máx. 500 más recientes del rango"
          />
          <StatCard
            label="Total desembolsado"
            value={formatCOP(totalAmount)}
            hint={`${filters.from} → ${filters.to}`}
          />
        </div>

        <PaymentHistoryFiltersForm
          filters={filters}
          suppliers={supplierOptions}
          accounts={accountOptions}
        />

        {requests.length === 0 && !filters.q ? (
          <EmptyState
            title="Sin pagos en el rango"
            description="Cuando se confirmen pagos en Solicitudes de pago, aparecerán aquí con sus cuentas y referencias."
          />
        ) : (
          <PaymentHistoryTable rows={rows} totalAmount={totalAmount} />
        )}
      </main>
    </>
  );
}
