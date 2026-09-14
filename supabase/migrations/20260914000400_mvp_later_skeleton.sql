-- Candela Admin — skeleton tables for MVP 2–4 (schema ready, UI later)

CREATE TYPE public.expense_status AS ENUM (
  'BORRADOR',
  'APROBADO',
  'PAGADO',
  'ANULADO'
);

CREATE TYPE public.expense_nature AS ENUM (
  'FIJO',
  'VARIABLE',
  'UNICO'
);

CREATE TYPE public.expense_criticality AS ENUM (
  'ESENCIAL',
  'REDUCIBLE',
  'DISCRECIONAL'
);

CREATE TYPE public.funding_request_status AS ENUM (
  'BORRADOR',
  'SOLICITADA',
  'APROBADA',
  'RECHAZADA',
  'PARCIALMENTE_APROBADA',
  'DESEMBOLSADA',
  'CERRADA'
);

CREATE TYPE public.tax_obligation_status AS ENUM (
  'PENDIENTE',
  'PRESENTADA',
  'PAGADA',
  'VENCIDA',
  'EN_ACUERDO',
  'NO_APLICA'
);

CREATE TYPE public.monthly_close_status AS ENUM (
  'ABIERTO',
  'EN_REVISION',
  'CERRADO'
);

CREATE TYPE public.employment_type AS ENUM (
  'LABORAL',
  'PRESTACION_SERVICIOS',
  'TEMPORAL',
  'OTRO'
);

CREATE TABLE public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  code text NOT NULL,
  name text NOT NULL,
  parent_id uuid REFERENCES public.expense_categories (id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (organization_id, code)
);

CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  expense_date date NOT NULL,
  supplier_id uuid REFERENCES public.suppliers (id),
  category_id uuid REFERENCES public.expense_categories (id),
  subcategory text,
  concept text NOT NULL,
  amount numeric(18, 2) NOT NULL,
  tax_amount numeric(18, 2) NOT NULL DEFAULT 0,
  total_amount numeric(18, 2) NOT NULL,
  cost_center text,
  nature public.expense_nature NOT NULL DEFAULT 'UNICO',
  criticality public.expense_criticality NOT NULL DEFAULT 'ESENCIAL',
  is_recurring boolean NOT NULL DEFAULT false,
  period text,
  status public.expense_status NOT NULL DEFAULT 'BORRADOR',
  bank_account_id uuid REFERENCES public.bank_accounts (id),
  payment_method text,
  support_document_id uuid REFERENCES public.documents (id),
  shared_service boolean NOT NULL DEFAULT false,
  allocation_method text,
  allocation_percentage numeric(7, 4),
  allocated_amount numeric(18, 2),
  allocation_reason text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz
);

CREATE TABLE public.recurring_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  category_id uuid REFERENCES public.expense_categories (id),
  concept text NOT NULL,
  amount numeric(18, 2) NOT NULL,
  day_of_month integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  deleted_at timestamptz
);

CREATE TABLE public.budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  name text NOT NULL,
  scenario text NOT NULL,
  period_year integer NOT NULL,
  period_month integer,
  notes text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz
);

CREATE TABLE public.budget_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  budget_id uuid NOT NULL REFERENCES public.budgets (id),
  category text NOT NULL,
  budgeted_amount numeric(18, 2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  deleted_at timestamptz
);

CREATE TABLE public.funding_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  request_date date NOT NULL,
  amount_required numeric(18, 2) NOT NULL,
  period text,
  reason text,
  responsible_name text,
  justification text,
  status public.funding_request_status NOT NULL DEFAULT 'BORRADOR',
  resulting_nature public.capital_nature,
  resulting_loan_id uuid REFERENCES public.loans (id),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz
);

CREATE TABLE public.funding_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  funding_request_id uuid NOT NULL REFERENCES public.funding_requests (id),
  category text NOT NULL,
  concept text NOT NULL,
  amount numeric(18, 2) NOT NULL,
  required_date date,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  deleted_at timestamptz
);

CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  full_name text NOT NULL,
  id_number text,
  position_title text,
  hire_date date,
  employment_type public.employment_type NOT NULL DEFAULT 'LABORAL',
  salary_or_fee numeric(18, 2),
  monthly_company_cost numeric(18, 2),
  eps text,
  pension_fund text,
  arl text,
  compensation_fund text,
  manager_employee_id uuid REFERENCES public.employees (id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz
);

CREATE TABLE public.employee_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  employee_id uuid NOT NULL REFERENCES public.employees (id),
  start_date date,
  end_date date,
  document_id uuid REFERENCES public.documents (id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  deleted_at timestamptz
);

CREATE TABLE public.sst_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  has_sg_sst text,
  responsible_name text,
  provider_name text,
  monthly_cost numeric(18, 2),
  annual_cost numeric(18, 2),
  arl text,
  documentation_status text,
  last_review_date date,
  next_review_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  deleted_at timestamptz
);

CREATE TABLE public.accounting_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  full_name text NOT NULL,
  firm_name text,
  phone text,
  email text,
  continues_status text,
  accounting_software text,
  last_close_available text,
  last_period_posted text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  deleted_at timestamptz
);

CREATE TABLE public.tax_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  obligation_type text NOT NULL,
  period text,
  due_date date,
  filed_date date,
  paid_date date,
  declared_amount numeric(18, 2),
  paid_amount numeric(18, 2),
  balance_amount numeric(18, 2),
  status public.tax_obligation_status NOT NULL DEFAULT 'PENDIENTE',
  support_document_id uuid REFERENCES public.documents (id),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz
);

CREATE TABLE public.tax_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  tax_obligation_id uuid REFERENCES public.tax_obligations (id),
  payment_date date NOT NULL,
  amount numeric(18, 2) NOT NULL,
  kind text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  deleted_at timestamptz
);

CREATE TABLE public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  counterparty text NOT NULL,
  contract_type text NOT NULL,
  start_date date,
  end_date date,
  auto_renewal boolean NOT NULL DEFAULT false,
  notice_days integer,
  cost_amount numeric(18, 2),
  periodicity text,
  responsible_name text,
  document_id uuid REFERENCES public.documents (id),
  status text NOT NULL DEFAULT 'ACTIVO',
  notes text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz
);

CREATE TABLE public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  name text NOT NULL,
  category text,
  quantity numeric(18, 2) DEFAULT 1,
  owned_by_candela boolean,
  status text,
  location text,
  approximate_value numeric(18, 2),
  notes text,
  photo_document_id uuid REFERENCES public.documents (id),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  deleted_at timestamptz
);

CREATE TABLE public.opening_inventory_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  category text NOT NULL,
  approximate_value numeric(18, 2),
  cutoff_date date NOT NULL,
  responsible_name text,
  support_document_id uuid REFERENCES public.documents (id),
  verification_status public.verification_status NOT NULL DEFAULT 'PENDIENTE',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  deleted_at timestamptz
);

CREATE TABLE public.monthly_closes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  period_year integer NOT NULL,
  period_month integer NOT NULL,
  status public.monthly_close_status NOT NULL DEFAULT 'ABIERTO',
  notes text,
  closed_by uuid REFERENCES public.profiles (id),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (organization_id, period_year, period_month)
);

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'expense_categories',
    'expenses',
    'recurring_expenses',
    'budgets',
    'budget_lines',
    'funding_requests',
    'funding_request_items',
    'employees',
    'employee_contracts',
    'sst_records',
    'accounting_contacts',
    'tax_obligations',
    'tax_payments',
    'contracts',
    'assets',
    'opening_inventory_summary',
    'monthly_closes'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (public.is_org_member(organization_id))',
      t || '_select_member', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (public.can_write_org(organization_id))',
      t || '_insert_writers', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE USING (public.can_write_org(organization_id)) WITH CHECK (public.can_write_org(organization_id))',
      t || '_update_writers', t
    );
  END LOOP;
END $$;
