export type ExpenseByAccountFilters = {
  from: string;
  to: string;
  account_id: string;
  fund_purpose: string;
  source: string;
  category_key: string;
};

export type ReportFilterOption = { id: string; label: string };

export type AccountSummary = {
  bank_account_id: string;
  account_name: string;
  account_kind: string | null;
  account_kind_label: string;
  fund_purpose: "VENTAS" | "EMPRESA" | null;
  fund_purpose_label: string;
  is_cash_float: boolean;
  total: string;
  share_pct: number;
  payment_count: number;
  leg_count: number;
};

export type SourceSummary = {
  source: string;
  label: string;
  total: string;
  share_pct: number;
  payment_count: number;
  leg_count: number;
};

export type CategoryAccountSlice = {
  bank_account_id: string;
  account_name: string;
  is_cash_float: boolean;
  total: string;
  share_pct: number;
  leg_count: number;
};

export type CategorySummary = {
  category_key: string;
  category_name: string;
  is_synthetic: boolean;
  total: string;
  share_pct: number;
  payment_count: number;
  leg_count: number;
  by_account: CategoryAccountSlice[];
  details: ExpenseByAccountDetail[];
};

export type ExpenseByAccountDetail = {
  id: string;
  payment_request_id: string;
  transaction_date: string;
  paid_at: string | null;
  bank_account_id: string;
  account_name: string;
  fund_purpose: "VENTAS" | "EMPRESA" | null;
  is_cash_float: boolean;
  source: string;
  source_label: string;
  concept: string;
  supplier_name: string | null;
  category_key: string;
  category_name: string;
  document_label: string | null;
  payment_reference: string | null;
  debit: string;
};

export type ExpenseByAccountReport = {
  accounts: ReportFilterOption[];
  categories: ReportFilterOption[];
  byAccount: AccountSummary[];
  bySource: SourceSummary[];
  byCategory: CategorySummary[];
  details: ExpenseByAccountDetail[];
  totals: {
    total: string;
    payment_count: number;
    leg_count: number;
    account_count: number;
    category_count: number;
  };
  truncated: boolean;
};

export const PAYMENT_SOURCE_LABEL: Record<string, string> = {
  SOLICITUD_INTERNA: "Solicitud interna",
  FACTURA_PROVEEDOR: "Factura proveedor",
  GASTO: "Gasto",
};

export const SYNTHETIC_CATEGORY = {
  COMPRAS: {
    key: "synthetic:compras",
    name: "Compras a proveedores",
  },
  SOLICITUDES: {
    key: "synthetic:solicitudes",
    name: "Solicitudes internas",
  },
  GASTO_SIN_CAT: {
    key: "synthetic:gasto-sin-categoria",
    name: "Gastos sin categoría",
  },
  SIN_CLASIFICAR: {
    key: "synthetic:sin-clasificar",
    name: "Sin clasificar",
  },
} as const;
