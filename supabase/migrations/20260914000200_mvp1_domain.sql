-- Candela Admin — MVP 1 business domain
-- Shareholders, handover, banks, suppliers, CxP, loans, documents, audit

-- ---------------------------------------------------------------------------
-- Shareholders
-- ---------------------------------------------------------------------------

CREATE TABLE public.shareholders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  full_name text NOT NULL,
  id_type public.id_document_type NOT NULL DEFAULT 'CC',
  id_number text NOT NULL,
  participation_pct numeric(7, 4) NOT NULL DEFAULT 0,
  entry_date date,
  registered_capital numeric(18, 2) NOT NULL DEFAULT 0,
  notes text,
  status public.shareholder_status NOT NULL DEFAULT 'ACTIVO',
  verification_status public.verification_status NOT NULL DEFAULT 'PENDIENTE',
  validated_by uuid REFERENCES public.profiles (id),
  validated_at timestamptz,
  comments text,
  source text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz,
  CONSTRAINT shareholders_participation_nonneg CHECK (participation_pct >= 0),
  CONSTRAINT shareholders_capital_nonneg CHECK (registered_capital >= 0)
);

CREATE INDEX shareholders_org_idx ON public.shareholders (organization_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER shareholders_set_updated_at
  BEFORE UPDATE ON public.shareholders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.shareholder_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  shareholder_id uuid NOT NULL REFERENCES public.shareholders (id),
  opening_balance numeric(18, 2) NOT NULL DEFAULT 0,
  currency char(3) NOT NULL DEFAULT 'COP',
  notes text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz,
  UNIQUE (organization_id, shareholder_id)
);

CREATE TRIGGER shareholder_accounts_set_updated_at
  BEFORE UPDATE ON public.shareholder_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.shareholder_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  shareholder_account_id uuid NOT NULL REFERENCES public.shareholder_accounts (id),
  transaction_date date NOT NULL,
  description text,
  debit numeric(18, 2) NOT NULL DEFAULT 0,
  credit numeric(18, 2) NOT NULL DEFAULT 0,
  nature public.capital_nature NOT NULL DEFAULT 'OTRO',
  reference text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz,
  CONSTRAINT shareholder_tx_amounts_nonneg CHECK (debit >= 0 AND credit >= 0),
  CONSTRAINT shareholder_tx_one_side CHECK (NOT (debit > 0 AND credit > 0))
);

CREATE TRIGGER shareholder_transactions_set_updated_at
  BEFORE UPDATE ON public.shareholder_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Handover (Empalme)
-- ---------------------------------------------------------------------------

CREATE TABLE public.handover_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  cutoff_date date NOT NULL,
  status public.handover_status NOT NULL DEFAULT 'BORRADOR',
  delivered_by_name text,
  received_by_name text,
  notes text,
  closing_notes text,
  pct_confirmed numeric(7, 4),
  pct_declared numeric(7, 4),
  pct_pending numeric(7, 4),
  closed_by uuid REFERENCES public.profiles (id),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz
);

CREATE INDEX handover_sessions_org_idx ON public.handover_sessions (organization_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER handover_sessions_set_updated_at
  BEFORE UPDATE ON public.handover_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.handover_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  handover_session_id uuid NOT NULL REFERENCES public.handover_sessions (id),
  domain text NOT NULL,
  item_key text NOT NULL,
  label text NOT NULL,
  amount numeric(18, 2),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  verification_status public.verification_status NOT NULL DEFAULT 'PENDIENTE',
  validated_by uuid REFERENCES public.profiles (id),
  validated_at timestamptz,
  comments text,
  source text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz
);

CREATE INDEX handover_items_session_idx
  ON public.handover_items (handover_session_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER handover_items_set_updated_at
  BEFORE UPDATE ON public.handover_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.handover_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  handover_session_id uuid NOT NULL UNIQUE REFERENCES public.handover_sessions (id),
  payload jsonb NOT NULL,
  pct_confirmed numeric(7, 4) NOT NULL,
  pct_declared numeric(7, 4) NOT NULL,
  pct_pending numeric(7, 4) NOT NULL,
  closed_by uuid REFERENCES public.profiles (id),
  closed_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  closing_notes text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- ---------------------------------------------------------------------------
-- Treasury
-- ---------------------------------------------------------------------------

CREATE TABLE public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  bank_name text NOT NULL,
  account_kind public.bank_account_kind NOT NULL DEFAULT 'BANCO',
  account_type text,
  masked_number text,
  holder_name text,
  currency char(3) NOT NULL DEFAULT 'COP',
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz
);

CREATE INDEX bank_accounts_org_idx ON public.bank_accounts (organization_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER bank_accounts_set_updated_at
  BEFORE UPDATE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.bank_balance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts (id),
  cutoff_date date NOT NULL,
  opening_balance numeric(18, 2) NOT NULL,
  evidence_document_id uuid,
  verification_status public.verification_status NOT NULL DEFAULT 'PENDIENTE',
  validated_by uuid REFERENCES public.profiles (id),
  validated_at timestamptz,
  comments text,
  source text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz,
  UNIQUE (bank_account_id, cutoff_date)
);

CREATE TRIGGER bank_balance_snapshots_set_updated_at
  BEFORE UPDATE ON public.bank_balance_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts (id),
  transaction_date date NOT NULL,
  description text,
  reference text,
  debit numeric(18, 2) NOT NULL DEFAULT 0,
  credit numeric(18, 2) NOT NULL DEFAULT 0,
  balance numeric(18, 2),
  origin text,
  category text,
  linked_entity_type text,
  linked_entity_id uuid,
  is_reconciled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz,
  CONSTRAINT bank_tx_amounts_nonneg CHECK (debit >= 0 AND credit >= 0),
  CONSTRAINT bank_tx_one_side CHECK (NOT (debit > 0 AND credit > 0))
);

CREATE INDEX bank_transactions_account_date_idx
  ON public.bank_transactions (organization_id, bank_account_id, transaction_date)
  WHERE deleted_at IS NULL;

CREATE TRIGGER bank_transactions_set_updated_at
  BEFORE UPDATE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Suppliers & CxP
-- ---------------------------------------------------------------------------

CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  name text NOT NULL,
  tax_id text,
  contact_name text,
  phone text,
  email text,
  category text,
  bank_account_info text,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
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

CREATE INDEX suppliers_org_idx ON public.suppliers (organization_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER suppliers_set_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.accounts_payable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  supplier_id uuid NOT NULL REFERENCES public.suppliers (id),
  priority public.ap_priority NOT NULL DEFAULT 'POR_VALIDAR',
  notes text,
  verification_status public.verification_status NOT NULL DEFAULT 'PENDIENTE',
  validated_by uuid REFERENCES public.profiles (id),
  validated_at timestamptz,
  comments text,
  source text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz,
  UNIQUE (organization_id, supplier_id)
);

CREATE TRIGGER accounts_payable_set_updated_at
  BEFORE UPDATE ON public.accounts_payable
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.accounts_payable_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  accounts_payable_id uuid NOT NULL REFERENCES public.accounts_payable (id),
  supplier_id uuid NOT NULL REFERENCES public.suppliers (id),
  document_type text NOT NULL,
  document_number text,
  issue_date date,
  due_date date,
  concept text,
  original_amount numeric(18, 2) NOT NULL,
  paid_amount numeric(18, 2) NOT NULL DEFAULT 0,
  status public.ap_document_status NOT NULL DEFAULT 'ABIERTA',
  priority public.ap_priority NOT NULL DEFAULT 'POR_VALIDAR',
  storage_document_id uuid,
  verification_status public.verification_status NOT NULL DEFAULT 'PENDIENTE',
  validated_by uuid REFERENCES public.profiles (id),
  validated_at timestamptz,
  comments text,
  source text,
  observation text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz,
  CONSTRAINT ap_docs_amounts_nonneg CHECK (original_amount >= 0 AND paid_amount >= 0),
  CONSTRAINT ap_docs_paid_lte_original CHECK (paid_amount <= original_amount)
);

CREATE INDEX ap_documents_org_supplier_due_idx
  ON public.accounts_payable_documents (organization_id, supplier_id, due_date)
  WHERE deleted_at IS NULL;

CREATE TRIGGER accounts_payable_documents_set_updated_at
  BEFORE UPDATE ON public.accounts_payable_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.accounts_payable_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  accounts_payable_document_id uuid NOT NULL REFERENCES public.accounts_payable_documents (id),
  payment_date date NOT NULL,
  amount numeric(18, 2) NOT NULL,
  bank_account_id uuid REFERENCES public.bank_accounts (id),
  bank_transaction_id uuid REFERENCES public.bank_transactions (id),
  reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz,
  CONSTRAINT ap_payments_amount_positive CHECK (amount > 0)
);

CREATE TRIGGER accounts_payable_payments_set_updated_at
  BEFORE UPDATE ON public.accounts_payable_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Loans & capital use
-- ---------------------------------------------------------------------------

CREATE TABLE public.loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  lender_shareholder_id uuid REFERENCES public.shareholders (id),
  lender_name text NOT NULL,
  contract_date date,
  approved_principal numeric(18, 2) NOT NULL,
  currency char(3) NOT NULL DEFAULT 'COP',
  interest_rate numeric(10, 6),
  rate_type public.rate_type,
  term_months integer,
  grace_period_months integer DEFAULT 0,
  first_installment_date date,
  amortization_method public.loan_amortization NOT NULL DEFAULT 'MANUAL',
  status public.loan_status NOT NULL DEFAULT 'BORRADOR',
  contract_document_id uuid,
  notes text,
  verification_status public.verification_status NOT NULL DEFAULT 'PENDIENTE',
  validated_by uuid REFERENCES public.profiles (id),
  validated_at timestamptz,
  comments text,
  source text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz,
  CONSTRAINT loans_principal_positive CHECK (approved_principal > 0)
);

CREATE INDEX loans_org_status_idx ON public.loans (organization_id, status)
  WHERE deleted_at IS NULL;

CREATE TRIGGER loans_set_updated_at
  BEFORE UPDATE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.loan_disbursements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  loan_id uuid NOT NULL REFERENCES public.loans (id),
  disbursement_date date NOT NULL,
  amount numeric(18, 2) NOT NULL,
  bank_account_id uuid REFERENCES public.bank_accounts (id),
  bank_transaction_id uuid REFERENCES public.bank_transactions (id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz,
  CONSTRAINT loan_disbursements_amount_positive CHECK (amount > 0)
);

CREATE TRIGGER loan_disbursements_set_updated_at
  BEFORE UPDATE ON public.loan_disbursements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.loan_payment_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  loan_id uuid NOT NULL REFERENCES public.loans (id),
  installment_number integer NOT NULL,
  due_date date NOT NULL,
  principal_due numeric(18, 2) NOT NULL DEFAULT 0,
  interest_due numeric(18, 2) NOT NULL DEFAULT 0,
  total_due numeric(18, 2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'PENDIENTE',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz,
  UNIQUE (loan_id, installment_number)
);

CREATE TRIGGER loan_payment_schedule_set_updated_at
  BEFORE UPDATE ON public.loan_payment_schedule
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.loan_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  loan_id uuid NOT NULL REFERENCES public.loans (id),
  schedule_item_id uuid REFERENCES public.loan_payment_schedule (id),
  payment_date date NOT NULL,
  principal_amount numeric(18, 2) NOT NULL DEFAULT 0,
  interest_amount numeric(18, 2) NOT NULL DEFAULT 0,
  total_amount numeric(18, 2) NOT NULL DEFAULT 0,
  bank_account_id uuid REFERENCES public.bank_accounts (id),
  bank_transaction_id uuid REFERENCES public.bank_transactions (id),
  reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz,
  CONSTRAINT loan_payments_amounts_nonneg CHECK (
    principal_amount >= 0 AND interest_amount >= 0 AND total_amount >= 0
  )
);

CREATE TRIGGER loan_payments_set_updated_at
  BEFORE UPDATE ON public.loan_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.funding_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  loan_disbursement_id uuid NOT NULL REFERENCES public.loan_disbursements (id),
  category text NOT NULL,
  concept text,
  approved_amount numeric(18, 2) NOT NULL DEFAULT 0,
  committed_amount numeric(18, 2) NOT NULL DEFAULT 0,
  paid_amount numeric(18, 2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz,
  CONSTRAINT funding_allocations_amounts_nonneg CHECK (
    approved_amount >= 0 AND committed_amount >= 0 AND paid_amount >= 0
  )
);

CREATE TRIGGER funding_allocations_set_updated_at
  BEFORE UPDATE ON public.funding_allocations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Documents & audit
-- ---------------------------------------------------------------------------

CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  name text NOT NULL,
  document_type text,
  file_size bigint,
  mime_type text,
  storage_path text NOT NULL,
  entity_type public.document_entity_type NOT NULL DEFAULT 'other',
  entity_id uuid,
  uploaded_by uuid REFERENCES public.profiles (id),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  deleted_at timestamptz
);

CREATE INDEX documents_entity_idx
  ON public.documents (organization_id, entity_type, entity_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER documents_set_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.bank_balance_snapshots
  ADD CONSTRAINT bank_balance_snapshots_evidence_fk
  FOREIGN KEY (evidence_document_id) REFERENCES public.documents (id);

ALTER TABLE public.accounts_payable_documents
  ADD CONSTRAINT ap_documents_storage_fk
  FOREIGN KEY (storage_document_id) REFERENCES public.documents (id);

ALTER TABLE public.loans
  ADD CONSTRAINT loans_contract_document_fk
  FOREIGN KEY (contract_document_id) REFERENCES public.documents (id);

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations (id),
  user_id uuid REFERENCES public.profiles (id),
  action public.audit_action NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX audit_logs_org_created_idx
  ON public.audit_logs (organization_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Integration placeholders (FILIPO future)
-- ---------------------------------------------------------------------------

CREATE TABLE public.integration_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  code text NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (organization_id, code)
);

CREATE TRIGGER integration_sources_set_updated_at
  BEFORE UPDATE ON public.integration_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.integration_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  source_id uuid NOT NULL REFERENCES public.integration_sources (id),
  import_type text NOT NULL,
  period_start date,
  period_end date,
  payload jsonb NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
