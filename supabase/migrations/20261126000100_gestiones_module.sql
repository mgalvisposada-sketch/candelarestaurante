-- Módulo Gestiones: tareas asignables entre usuarios de la organización.

CREATE TYPE public.gestion_status AS ENUM (
  'PENDIENTE',
  'EN_PROGRESO',
  'HECHA',
  'CANCELADA'
);

CREATE TYPE public.gestion_priority AS ENUM (
  'BAJA',
  'NORMAL',
  'ALTA',
  'URGENTE'
);

CREATE TABLE public.gestiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  title text NOT NULL,
  description text,
  status public.gestion_status NOT NULL DEFAULT 'PENDIENTE',
  priority public.gestion_priority NOT NULL DEFAULT 'NORMAL',
  assigned_to uuid NOT NULL REFERENCES public.profiles (id),
  due_date date,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz,
  CONSTRAINT gestiones_title_not_blank CHECK (length(trim(title)) > 0)
);

CREATE INDEX gestiones_org_status_idx
  ON public.gestiones (organization_id, status, due_date NULLS LAST)
  WHERE deleted_at IS NULL;

CREATE INDEX gestiones_org_assigned_idx
  ON public.gestiones (organization_id, assigned_to, status)
  WHERE deleted_at IS NULL;

CREATE INDEX gestiones_org_created_by_idx
  ON public.gestiones (organization_id, created_by)
  WHERE deleted_at IS NULL;

CREATE TRIGGER gestiones_set_updated_at
  BEFORE UPDATE ON public.gestiones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Cualquier miembro activo de la org puede operar gestiones (crear / asignar / completar).
CREATE OR REPLACE FUNCTION public.can_use_gestiones(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_org_member(p_org_id);
$$;

ALTER FUNCTION public.can_use_gestiones(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_use_gestiones(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_use_gestiones(uuid) TO authenticated, anon;

ALTER TABLE public.gestiones ENABLE ROW LEVEL SECURITY;

CREATE POLICY gestiones_select_member
  ON public.gestiones FOR SELECT
  USING (public.is_org_member(organization_id));

CREATE POLICY gestiones_insert_members
  ON public.gestiones FOR INSERT
  WITH CHECK (
    public.can_use_gestiones(organization_id)
    AND created_by = auth.uid()
  );

CREATE POLICY gestiones_update_members
  ON public.gestiones FOR UPDATE
  USING (public.can_use_gestiones(organization_id))
  WITH CHECK (public.can_use_gestiones(organization_id));
