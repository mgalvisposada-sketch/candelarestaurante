-- Cierre diario de caja: declaración local → aval gerencia → créditos a tesorería

CREATE TYPE public.cash_daily_close_status AS ENUM (
  'BORRADOR',
  'EN_REVISION',
  'AVALADO',
  'RECHAZADO'
);

CREATE TYPE public.cash_daily_close_source AS ENUM (
  'MANUAL',
  'POS_IMPORT',
  'BANK_IMPORT'
);

CREATE TABLE public.cash_daily_closes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  business_date date NOT NULL,
  status public.cash_daily_close_status NOT NULL DEFAULT 'BORRADOR',
  cash_float numeric(18, 2) NOT NULL DEFAULT 0,
  cash_sales numeric(18, 2) NOT NULL DEFAULT 0,
  card_sales numeric(18, 2) NOT NULL DEFAULT 0,
  cash_account_id uuid REFERENCES public.bank_accounts (id),
  card_account_id uuid REFERENCES public.bank_accounts (id),
  pos_cash_amount numeric(18, 2),
  pos_card_amount numeric(18, 2),
  bank_card_amount numeric(18, 2),
  cash_credited numeric(18, 2),
  card_credited numeric(18, 2),
  submitted_by uuid REFERENCES public.profiles (id),
  submitted_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles (id),
  reviewed_at timestamptz,
  rejection_reason text,
  comments text,
  source public.cash_daily_close_source NOT NULL DEFAULT 'MANUAL',
  external_ref text,
  imported_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz,
  CONSTRAINT cash_daily_closes_amounts_nonneg CHECK (
    cash_float >= 0
    AND cash_sales >= 0
    AND card_sales >= 0
    AND (pos_cash_amount IS NULL OR pos_cash_amount >= 0)
    AND (pos_card_amount IS NULL OR pos_card_amount >= 0)
    AND (bank_card_amount IS NULL OR bank_card_amount >= 0)
    AND (cash_credited IS NULL OR cash_credited >= 0)
    AND (card_credited IS NULL OR card_credited >= 0)
  )
);

CREATE UNIQUE INDEX cash_daily_closes_org_date_uidx
  ON public.cash_daily_closes (organization_id, business_date)
  WHERE deleted_at IS NULL;

CREATE INDEX cash_daily_closes_org_status_idx
  ON public.cash_daily_closes (organization_id, status)
  WHERE deleted_at IS NULL;

CREATE TRIGGER cash_daily_closes_set_updated_at
  BEFORE UPDATE ON public.cash_daily_closes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.cash_daily_closes IS
  'Cierre diario de caja: admin declara efectivo/adquirencia; gerencia avala y acredita cuentas.';
COMMENT ON COLUMN public.cash_daily_closes.cash_float IS
  'Base de caja (flotante que debe permanecer); no se acredita como ingreso.';
COMMENT ON COLUMN public.cash_daily_closes.source IS
  'MANUAL hoy; POS_IMPORT / BANK_IMPORT reservados para integración futura.';

-- Admin local puede declarar; GESTION/TESORERIA escriben vía can_write_org.
CREATE OR REPLACE FUNCTION public.can_declare_cash_close(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_org_role(
    p_org_id,
    ARRAY['SUPER_ADMIN', 'GESTION', 'ADMIN_LOCAL', 'TESORERIA']::public.app_role[]
  );
$$;

ALTER FUNCTION public.can_declare_cash_close(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_declare_cash_close(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_declare_cash_close(uuid) TO authenticated, anon;

ALTER TABLE public.cash_daily_closes ENABLE ROW LEVEL SECURITY;

CREATE POLICY cash_daily_closes_select_member
  ON public.cash_daily_closes FOR SELECT
  USING (public.is_org_member(organization_id));

CREATE POLICY cash_daily_closes_insert_declarers
  ON public.cash_daily_closes FOR INSERT
  WITH CHECK (
    public.can_write_org(organization_id)
    OR public.can_declare_cash_close(organization_id)
  );

CREATE POLICY cash_daily_closes_update_declarers
  ON public.cash_daily_closes FOR UPDATE
  USING (
    public.can_write_org(organization_id)
    OR public.can_declare_cash_close(organization_id)
  )
  WITH CHECK (
    public.can_write_org(organization_id)
    OR public.can_declare_cash_close(organization_id)
  );
