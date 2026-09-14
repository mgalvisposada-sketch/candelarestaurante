-- Candela Admin — MVP 1 foundation
-- Enums, helpers RLS, organizations, profiles, membership

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE public.app_role AS ENUM (
  'SUPER_ADMIN',
  'GESTION',
  'SOCIO',
  'CONTADOR',
  'LECTURA'
);

CREATE TYPE public.verification_status AS ENUM (
  'CONFIRMADO',
  'DECLARADO',
  'PENDIENTE'
);

CREATE TYPE public.handover_status AS ENUM (
  'BORRADOR',
  'EN_PROGRESO',
  'CERRADO'
);

CREATE TYPE public.ap_priority AS ENUM (
  'CRITICA',
  'ALTA',
  'NORMAL',
  'NEGOCIABLE',
  'POR_VALIDAR'
);

CREATE TYPE public.ap_document_status AS ENUM (
  'ABIERTA',
  'PARCIAL',
  'PAGADA',
  'ANULADA'
);

CREATE TYPE public.bank_account_kind AS ENUM (
  'BANCO',
  'CAJA',
  'PASARELA',
  'OTRO'
);

CREATE TYPE public.loan_status AS ENUM (
  'BORRADOR',
  'ACTIVO',
  'CERRADO',
  'ANULADO'
);

CREATE TYPE public.loan_amortization AS ENUM (
  'SIN_INTERES',
  'CUOTA_FIJA',
  'CAPITAL_FIJO',
  'BULLET',
  'MANUAL'
);

CREATE TYPE public.rate_type AS ENUM (
  'MENSUAL',
  'EFECTIVA_ANUAL',
  'MANUAL'
);

CREATE TYPE public.capital_nature AS ENUM (
  'CAPITAL',
  'PRESTAMO',
  'ANTICIPO',
  'OTRO'
);

CREATE TYPE public.shareholder_status AS ENUM (
  'ACTIVO',
  'INACTIVO'
);

CREATE TYPE public.id_document_type AS ENUM (
  'CC',
  'CE',
  'NIT',
  'PASAPORTE',
  'OTRO'
);

CREATE TYPE public.document_entity_type AS ENUM (
  'organization',
  'shareholder',
  'supplier',
  'accounts_payable',
  'accounts_payable_document',
  'loan',
  'employee',
  'contract',
  'tax_obligation',
  'bank_account',
  'asset',
  'handover',
  'other'
);

CREATE TYPE public.audit_action AS ENUM (
  'CREATE',
  'UPDATE',
  'VALIDATE',
  'ANULAR',
  'CLOSE',
  'PAYMENT',
  'SOFT_DELETE',
  'LOGIN'
);

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER for RLS)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name text,
  email text,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    NEW.email
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name text NOT NULL,
  trade_name text,
  nit text,
  dv char(1),
  company_type text,
  incorporation_date date,
  commercial_registration text,
  primary_ciiu text,
  secondary_activities text[],
  address text,
  municipality text,
  department text,
  corporate_email text,
  phone text,
  legal_representative text,
  currency char(3) NOT NULL DEFAULT 'COP',
  timezone text NOT NULL DEFAULT 'America/Bogota',
  administrative_cutoff_date date,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz
);

CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.organization_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  user_id uuid NOT NULL REFERENCES public.profiles (id),
  role public.app_role NOT NULL DEFAULT 'LECTURA',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz,
  UNIQUE (organization_id, user_id)
);

CREATE INDEX organization_users_user_idx ON public.organization_users (user_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER organization_users_set_updated_at
  BEFORE UPDATE ON public.organization_users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Membership helpers (después de organization_users)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.organization_users ou
    WHERE ou.organization_id = p_org_id
      AND ou.user_id = auth.uid()
      AND ou.deleted_at IS NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(p_org_id uuid, p_roles public.app_role[])
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.organization_users ou
    WHERE ou.organization_id = p_org_id
      AND ou.user_id = auth.uid()
      AND ou.deleted_at IS NULL
      AND ou.role = ANY (p_roles)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_write_org(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.has_org_role(
    p_org_id,
    ARRAY['SUPER_ADMIN', 'GESTION']::public.app_role[]
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS: profiles / organizations / membership
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_own_or_org_peer
  ON public.profiles FOR SELECT
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.organization_users me
      JOIN public.organization_users peer
        ON peer.organization_id = me.organization_id
      WHERE me.user_id = auth.uid()
        AND me.deleted_at IS NULL
        AND peer.user_id = profiles.id
        AND peer.deleted_at IS NULL
    )
  );

CREATE POLICY profiles_update_own
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY organizations_select_member
  ON public.organizations FOR SELECT
  USING (public.is_org_member(id) AND deleted_at IS NULL);

CREATE POLICY organizations_insert_authenticated
  ON public.organizations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY organizations_update_writers
  ON public.organizations FOR UPDATE
  USING (public.can_write_org(id))
  WITH CHECK (public.can_write_org(id));

CREATE POLICY organization_users_select_member
  ON public.organization_users FOR SELECT
  USING (public.is_org_member(organization_id));

CREATE POLICY organization_users_write_super_admin
  ON public.organization_users FOR ALL
  USING (
    public.has_org_role(organization_id, ARRAY['SUPER_ADMIN']::public.app_role[])
  )
  WITH CHECK (
    public.has_org_role(organization_id, ARRAY['SUPER_ADMIN']::public.app_role[])
  );

-- Allow a user to insert themselves as SUPER_ADMIN when creating first membership
CREATE POLICY organization_users_insert_self_bootstrap
  ON public.organization_users FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'SUPER_ADMIN'
  );
