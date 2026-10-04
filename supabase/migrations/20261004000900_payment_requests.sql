-- Solicitudes de pago: orquesta CxP / gastos / tesorería

CREATE TYPE public.payment_request_source AS ENUM (
  'SOLICITUD_INTERNA',
  'FACTURA_PROVEEDOR',
  'GASTO'
);

CREATE TYPE public.payment_request_status AS ENUM (
  'BORRADOR',
  'EN_REVISION',
  'APROBADA',
  'EN_COLA_PAGO',
  'PAGADA',
  'RECHAZADA',
  'ANULADA'
);

CREATE TYPE public.payment_request_priority AS ENUM (
  'CRITICA',
  'ALTA',
  'NORMAL',
  'BAJA'
);

CREATE TABLE public.payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  source public.payment_request_source NOT NULL,
  status public.payment_request_status NOT NULL DEFAULT 'EN_REVISION',
  priority public.payment_request_priority NOT NULL DEFAULT 'NORMAL',
  concept text NOT NULL,
  amount numeric(18, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'COP',
  requested_at date NOT NULL,
  due_date date,
  supplier_id uuid REFERENCES public.suppliers (id),
  ap_document_id uuid REFERENCES public.accounts_payable_documents (id),
  expense_id uuid REFERENCES public.expenses (id),
  bank_account_id uuid REFERENCES public.bank_accounts (id),
  bank_transaction_id uuid REFERENCES public.bank_transactions (id),
  document_type text,
  document_number text,
  issue_date date,
  notes text,
  rejection_reason text,
  payment_reference text,
  paid_amount numeric(18, 2),
  paid_at timestamptz,
  requested_by uuid REFERENCES public.profiles (id),
  approved_by uuid REFERENCES public.profiles (id),
  approved_at timestamptz,
  create_expense boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz,
  CONSTRAINT payment_requests_amount_positive CHECK (amount > 0),
  CONSTRAINT payment_requests_paid_amount_nonneg CHECK (
    paid_amount IS NULL OR paid_amount >= 0
  )
);

CREATE INDEX payment_requests_org_status_idx
  ON public.payment_requests (organization_id, status, requested_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX payment_requests_org_supplier_idx
  ON public.payment_requests (organization_id, supplier_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER payment_requests_set_updated_at
  BEFORE UPDATE ON public.payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY payment_requests_select_member
  ON public.payment_requests FOR SELECT
  USING (public.is_org_member(organization_id));

CREATE POLICY payment_requests_insert_writers
  ON public.payment_requests FOR INSERT
  WITH CHECK (public.can_write_org(organization_id));

CREATE POLICY payment_requests_update_writers
  ON public.payment_requests FOR UPDATE
  USING (public.can_write_org(organization_id))
  WITH CHECK (public.can_write_org(organization_id));
