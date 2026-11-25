import { money, toMoneyString } from "@/lib/money";
import { bankKindLabel, fundPurposeLabel } from "@/lib/treasury";
import { createClient } from "@/lib/supabase/server";
import {
  PAYMENT_SOURCE_LABEL,
  SYNTHETIC_CATEGORY,
  type AccountSummary,
  type CategoryAccountSlice,
  type CategorySummary,
  type ExpenseByAccountDetail,
  type ExpenseByAccountFilters,
  type ExpenseByAccountReport,
  type ReportFilterOption,
  type SourceSummary,
} from "@/lib/reports/expense-by-account-types";

export type {
  AccountSummary,
  CategoryAccountSlice,
  CategorySummary,
  ExpenseByAccountDetail,
  ExpenseByAccountFilters,
  ExpenseByAccountReport,
  ReportFilterOption,
  SourceSummary,
} from "@/lib/reports/expense-by-account-types";
export {
  PAYMENT_SOURCE_LABEL,
  SYNTHETIC_CATEGORY,
} from "@/lib/reports/expense-by-account-types";

const PAGE_SIZE = 1000;
const IN_CHUNK = 200;

type Supabase = Awaited<ReturnType<typeof createClient>>;

type AccountRow = {
  id: string;
  bank_name: string;
  account_kind: string | null;
  fund_purpose: "VENTAS" | "EMPRESA" | null;
  is_cash_float: boolean | null;
  masked_number: string | null;
};

type RequestRow = {
  id: string;
  source: string;
  concept: string;
  amount: number | string;
  paid_amount: number | string | null;
  paid_at: string | null;
  payment_reference: string | null;
  document_type: string | null;
  document_number: string | null;
  supplier_id: string | null;
  bank_account_id: string | null;
  expense_id: string | null;
};

type TxRow = {
  id: string;
  bank_account_id: string;
  transaction_date: string;
  debit: number | string;
  credit: number | string | null;
  category: string | null;
  origin: string | null;
  reference: string | null;
  linked_entity_id: string;
};

type ExpenseCatInfo = {
  category_key: string;
  category_name: string;
  is_synthetic: boolean;
};

async function fetchAllPaidRequests(
  supabase: Supabase,
  orgId: string,
  filters: ExpenseByAccountFilters,
): Promise<{ rows: RequestRow[]; truncated: boolean }> {
  const rows: RequestRow[] = [];
  let from = 0;
  let truncated = false;

  for (;;) {
    let query = supabase
      .from("payment_requests")
      .select(
        "id, source, concept, amount, paid_amount, paid_at, payment_reference, document_type, document_number, supplier_id, bank_account_id, expense_id",
      )
      .eq("organization_id", orgId)
      .eq("status", "PAGADA")
      .is("deleted_at", null)
      .order("paid_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (filters.from) {
      query = query.gte("paid_at", `${filters.from}T00:00:00-05:00`);
    }
    if (filters.to) {
      query = query.lte("paid_at", `${filters.to}T23:59:59-05:00`);
    }
    if (filters.source) {
      query = query.eq("source", filters.source);
    }

    const { data, error } = await query;
    if (error) throw error;

    const batch = (data ?? []) as RequestRow[];
    rows.push(...batch);

    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
    if (from >= 5000) {
      truncated = true;
      break;
    }
  }

  return { rows, truncated };
}

async function fetchLegsForRequests(
  supabase: Supabase,
  orgId: string,
  requestIds: string[],
): Promise<TxRow[]> {
  const out: TxRow[] = [];
  for (let i = 0; i < requestIds.length; i += IN_CHUNK) {
    const chunk = requestIds.slice(i, i + IN_CHUNK);
    const { data, error } = await supabase
      .from("bank_transactions")
      .select(
        "id, bank_account_id, transaction_date, debit, credit, category, origin, reference, linked_entity_id",
      )
      .eq("organization_id", orgId)
      .eq("linked_entity_type", "payment_requests")
      .is("deleted_at", null)
      .in("linked_entity_id", chunk)
      .order("transaction_date", { ascending: true });
    if (error) throw error;
    out.push(...((data ?? []) as TxRow[]));
  }
  return out;
}

function accountOptionLabel(a: AccountRow): string {
  return `${a.is_cash_float ? "Caja · " : ""}${a.bank_name}${
    a.masked_number ? ` · ${a.masked_number}` : ""
  }${
    a.fund_purpose
      ? ` · ${a.fund_purpose === "VENTAS" ? "Ventas" : "Empresa"}`
      : ""
  }`;
}

function isTransferLeg(tx: TxRow): boolean {
  const cat = (tx.category ?? "").toUpperCase();
  const origin = (tx.origin ?? "").toLowerCase();
  return cat === "TRASPASO" || origin.includes("traspaso");
}

function resolveCategory(
  req: RequestRow,
  expenseCat: ExpenseCatInfo | null,
): ExpenseCatInfo {
  if (expenseCat) return expenseCat;
  if (req.source === "FACTURA_PROVEEDOR") {
    return {
      category_key: SYNTHETIC_CATEGORY.COMPRAS.key,
      category_name: SYNTHETIC_CATEGORY.COMPRAS.name,
      is_synthetic: true,
    };
  }
  if (req.source === "SOLICITUD_INTERNA") {
    return {
      category_key: SYNTHETIC_CATEGORY.SOLICITUDES.key,
      category_name: SYNTHETIC_CATEGORY.SOLICITUDES.name,
      is_synthetic: true,
    };
  }
  if (req.source === "GASTO") {
    return {
      category_key: SYNTHETIC_CATEGORY.GASTO_SIN_CAT.key,
      category_name: SYNTHETIC_CATEGORY.GASTO_SIN_CAT.name,
      is_synthetic: true,
    };
  }
  return {
    category_key: SYNTHETIC_CATEGORY.SIN_CLASIFICAR.key,
    category_name: SYNTHETIC_CATEGORY.SIN_CLASIFICAR.name,
    is_synthetic: true,
  };
}

function sharePct(part: ReturnType<typeof money>, total: ReturnType<typeof money>) {
  if (total.lte(0)) return 0;
  return Math.round(part.div(total).mul(1000).toNumber()) / 10;
}

export async function loadExpenseByAccountReport(
  supabase: Supabase,
  orgId: string,
  filters: ExpenseByAccountFilters,
): Promise<ExpenseByAccountReport> {
  const [{ data: accountRows }, { data: supplierRows }, paid] =
    await Promise.all([
      supabase
        .from("bank_accounts")
        .select(
          "id, bank_name, account_kind, fund_purpose, is_cash_float, masked_number",
        )
        .eq("organization_id", orgId)
        .is("deleted_at", null)
        .order("bank_name"),
      supabase
        .from("suppliers")
        .select("id, name")
        .eq("organization_id", orgId)
        .is("deleted_at", null),
      fetchAllPaidRequests(supabase, orgId, filters),
    ]);

  const accountsById = new Map(
    ((accountRows ?? []) as AccountRow[]).map((a) => [a.id, a]),
  );
  const accountOptions: ReportFilterOption[] = [
    ...accountsById.values(),
  ].map((a) => ({ id: a.id, label: accountOptionLabel(a) }));

  const supplierName = new Map(
    (supplierRows ?? []).map((s) => [s.id as string, s.name as string]),
  );

  const requests = paid.rows;
  const requestIds = requests.map((r) => r.id);
  const requestsById = new Map(requests.map((r) => [r.id, r]));

  const expenseIds = [
    ...new Set(
      requests
        .map((r) => r.expense_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const categoryByExpense = new Map<string, ExpenseCatInfo>();
  if (expenseIds.length > 0) {
    const categoryNameById = new Map<string, string>();
    const { data: categoryRows } = await supabase
      .from("expense_categories")
      .select("id, code, name")
      .eq("organization_id", orgId);
    for (const c of categoryRows ?? []) {
      const code = (c.code as string | null)?.trim();
      const name = c.name as string;
      categoryNameById.set(
        c.id as string,
        code ? `${code} — ${name}` : name,
      );
    }

    for (let i = 0; i < expenseIds.length; i += IN_CHUNK) {
      const chunk = expenseIds.slice(i, i + IN_CHUNK);
      const { data: expenses } = await supabase
        .from("expenses")
        .select("id, category_id")
        .eq("organization_id", orgId)
        .is("deleted_at", null)
        .in("id", chunk);

      for (const e of expenses ?? []) {
        const catId = e.category_id as string | null;
        if (!catId) continue;
        const name = categoryNameById.get(catId);
        if (!name) continue;
        categoryByExpense.set(e.id as string, {
          category_key: `cat:${catId}`,
          category_name: name,
          is_synthetic: false,
        });
      }
    }
  }

  const txRows =
    requestIds.length > 0
      ? await fetchLegsForRequests(supabase, orgId, requestIds)
      : [];

  type Leg = {
    id: string;
    payment_request_id: string;
    bank_account_id: string;
    transaction_date: string;
    debit: string;
    reference: string | null;
  };

  const legs: Leg[] = [];
  const requestIdsWithLegs = new Set<string>();

  for (const tx of txRows) {
    if (isTransferLeg(tx)) continue;
    const debit = money(tx.debit);
    if (debit.lte(0)) continue;

    const txDate = tx.transaction_date?.slice(0, 10) ?? "";
    if (filters.from && txDate && txDate < filters.from) continue;
    if (filters.to && txDate && txDate > filters.to) continue;

    legs.push({
      id: tx.id,
      payment_request_id: tx.linked_entity_id,
      bank_account_id: tx.bank_account_id,
      transaction_date: txDate,
      debit: toMoneyString(debit),
      reference: tx.reference,
    });
    requestIdsWithLegs.add(tx.linked_entity_id);
  }

  for (const req of requests) {
    if (requestIdsWithLegs.has(req.id)) continue;
    if (!req.bank_account_id) continue;
    const paidAtDate = req.paid_at?.slice(0, 10) ?? "";
    if (filters.from && paidAtDate && paidAtDate < filters.from) continue;
    if (filters.to && paidAtDate && paidAtDate > filters.to) continue;
    const amount = money(req.paid_amount ?? req.amount);
    if (amount.lte(0)) continue;
    legs.push({
      id: `fallback-${req.id}`,
      payment_request_id: req.id,
      bank_account_id: req.bank_account_id,
      transaction_date: paidAtDate,
      debit: toMoneyString(amount),
      reference: req.payment_reference,
    });
  }

  let filteredLegs = legs;
  if (filters.account_id) {
    filteredLegs = filteredLegs.filter(
      (l) => l.bank_account_id === filters.account_id,
    );
  }
  if (filters.fund_purpose === "VENTAS" || filters.fund_purpose === "EMPRESA") {
    filteredLegs = filteredLegs.filter((l) => {
      const acc = accountsById.get(l.bank_account_id);
      return (acc?.fund_purpose ?? null) === filters.fund_purpose;
    });
  }

  const allDetails: ExpenseByAccountDetail[] = [];

  for (const leg of filteredLegs) {
    const req = requestsById.get(leg.payment_request_id);
    if (!req) continue;
    const acc = accountsById.get(leg.bank_account_id);
    const cat = resolveCategory(
      req,
      req.expense_id ? (categoryByExpense.get(req.expense_id) ?? null) : null,
    );
    const debit = money(leg.debit);
    const doc = [req.document_type, req.document_number]
      .filter(Boolean)
      .join(" ");

    allDetails.push({
      id: leg.id,
      payment_request_id: req.id,
      transaction_date: leg.transaction_date,
      paid_at: req.paid_at,
      bank_account_id: leg.bank_account_id,
      account_name: acc?.bank_name ?? "Cuenta",
      fund_purpose: acc?.fund_purpose ?? null,
      is_cash_float: Boolean(acc?.is_cash_float),
      source: req.source,
      source_label: PAYMENT_SOURCE_LABEL[req.source] ?? req.source,
      concept: req.concept,
      supplier_name: req.supplier_id
        ? (supplierName.get(req.supplier_id) ?? null)
        : null,
      category_key: cat.category_key,
      category_name: cat.category_name,
      document_label: doc || null,
      payment_reference: leg.reference ?? req.payment_reference,
      debit: toMoneyString(debit),
    });
  }

  const categoryOptions: ReportFilterOption[] = [
    ...new Map(
      allDetails.map((d) => [
        d.category_key,
        { id: d.category_key, label: d.category_name } as ReportFilterOption,
      ]),
    ).values(),
  ].sort((a, b) => a.label.localeCompare(b.label, "es"));

  const details = filters.category_key
    ? allDetails.filter((d) => d.category_key === filters.category_key)
    : allDetails;

  const accountAgg = new Map<
    string,
    {
      total: ReturnType<typeof money>;
      paymentIds: Set<string>;
      leg_count: number;
    }
  >();
  const sourceAgg = new Map<
    string,
    {
      total: ReturnType<typeof money>;
      paymentIds: Set<string>;
      leg_count: number;
    }
  >();
  const categoryAgg = new Map<
    string,
    {
      category_name: string;
      is_synthetic: boolean;
      total: ReturnType<typeof money>;
      paymentIds: Set<string>;
      leg_count: number;
      accountTotals: Map<
        string,
        { total: ReturnType<typeof money>; leg_count: number }
      >;
      details: ExpenseByAccountDetail[];
    }
  >();

  let grandTotal = money(0);
  const allPaymentIds = new Set<string>();

  for (const detail of details) {
    const debit = money(detail.debit);
    grandTotal = grandTotal.plus(debit);
    allPaymentIds.add(detail.payment_request_id);

    const aAgg = accountAgg.get(detail.bank_account_id) ?? {
      total: money(0),
      paymentIds: new Set<string>(),
      leg_count: 0,
    };
    aAgg.total = aAgg.total.plus(debit);
    aAgg.paymentIds.add(detail.payment_request_id);
    aAgg.leg_count += 1;
    accountAgg.set(detail.bank_account_id, aAgg);

    const sAgg = sourceAgg.get(detail.source) ?? {
      total: money(0),
      paymentIds: new Set<string>(),
      leg_count: 0,
    };
    sAgg.total = sAgg.total.plus(debit);
    sAgg.paymentIds.add(detail.payment_request_id);
    sAgg.leg_count += 1;
    sourceAgg.set(detail.source, sAgg);

    const isSynthetic = detail.category_key.startsWith("synthetic:");
    const cAgg = categoryAgg.get(detail.category_key) ?? {
      category_name: detail.category_name,
      is_synthetic: isSynthetic,
      total: money(0),
      paymentIds: new Set<string>(),
      leg_count: 0,
      accountTotals: new Map(),
      details: [] as ExpenseByAccountDetail[],
    };
    cAgg.total = cAgg.total.plus(debit);
    cAgg.paymentIds.add(detail.payment_request_id);
    cAgg.leg_count += 1;
    const catAcc = cAgg.accountTotals.get(detail.bank_account_id) ?? {
      total: money(0),
      leg_count: 0,
    };
    catAcc.total = catAcc.total.plus(debit);
    catAcc.leg_count += 1;
    cAgg.accountTotals.set(detail.bank_account_id, catAcc);
    cAgg.details.push(detail);
    categoryAgg.set(detail.category_key, cAgg);
  }

  details.sort((a, b) => {
    const d = (a.transaction_date || "").localeCompare(b.transaction_date || "");
    if (d !== 0) return d;
    return a.account_name.localeCompare(b.account_name, "es");
  });

  const byAccount: AccountSummary[] = [...accountAgg.entries()]
    .map(([bank_account_id, agg]) => {
      const acc = accountsById.get(bank_account_id);
      return {
        bank_account_id,
        account_name: acc?.bank_name ?? "Cuenta",
        account_kind: acc?.account_kind ?? null,
        account_kind_label: bankKindLabel(acc?.account_kind ?? "OTRO", {
          isCashFloat: Boolean(acc?.is_cash_float),
        }),
        fund_purpose: acc?.fund_purpose ?? null,
        fund_purpose_label: fundPurposeLabel(acc?.fund_purpose),
        is_cash_float: Boolean(acc?.is_cash_float),
        total: toMoneyString(agg.total),
        share_pct: sharePct(agg.total, grandTotal),
        payment_count: agg.paymentIds.size,
        leg_count: agg.leg_count,
      };
    })
    .sort((a, b) => money(b.total).comparedTo(money(a.total)));

  const bySource: SourceSummary[] = [...sourceAgg.entries()]
    .map(([source, agg]) => ({
      source,
      label: PAYMENT_SOURCE_LABEL[source] ?? source,
      total: toMoneyString(agg.total),
      share_pct: sharePct(agg.total, grandTotal),
      payment_count: agg.paymentIds.size,
      leg_count: agg.leg_count,
    }))
    .sort((a, b) => money(b.total).comparedTo(money(a.total)));

  const byCategory: CategorySummary[] = [...categoryAgg.entries()]
    .map(([category_key, agg]) => {
      const by_account: CategoryAccountSlice[] = [...agg.accountTotals.entries()]
        .map(([bank_account_id, slice]) => {
          const acc = accountsById.get(bank_account_id);
          return {
            bank_account_id,
            account_name: acc?.bank_name ?? "Cuenta",
            is_cash_float: Boolean(acc?.is_cash_float),
            total: toMoneyString(slice.total),
            share_pct: sharePct(slice.total, agg.total),
            leg_count: slice.leg_count,
          };
        })
        .sort((a, b) => money(b.total).comparedTo(money(a.total)));

      const catDetails = [...agg.details].sort((a, b) => {
        const d = (a.transaction_date || "").localeCompare(
          b.transaction_date || "",
        );
        if (d !== 0) return d;
        return a.concept.localeCompare(b.concept, "es");
      });

      return {
        category_key,
        category_name: agg.category_name,
        is_synthetic: agg.is_synthetic,
        total: toMoneyString(agg.total),
        share_pct: sharePct(agg.total, grandTotal),
        payment_count: agg.paymentIds.size,
        leg_count: agg.leg_count,
        by_account,
        details: catDetails,
      };
    })
    .sort((a, b) => money(b.total).comparedTo(money(a.total)));

  return {
    accounts: accountOptions,
    categories: categoryOptions,
    byAccount,
    bySource,
    byCategory,
    details,
    totals: {
      total: toMoneyString(grandTotal),
      payment_count: allPaymentIds.size,
      leg_count: details.length,
      account_count: byAccount.length,
      category_count: byCategory.length,
    },
    truncated: paid.truncated,
  };
}
