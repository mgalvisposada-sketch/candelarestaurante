-- Evitar hangs por reentrada RLS en helpers de membresía.
-- Las funciones SECURITY DEFINER deben ejecutarse con privilegios de dueño
-- y sin evaluar policies al leer organization_users.

CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.organization_users ou
    WHERE ou.organization_id = p_org_id
      AND ou.user_id = v_uid
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
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.organization_users ou
    WHERE ou.organization_id = p_org_id
      AND ou.user_id = v_uid
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

ALTER FUNCTION public.is_org_member(uuid) OWNER TO postgres;
ALTER FUNCTION public.has_org_role(uuid, public.app_role[]) OWNER TO postgres;
ALTER FUNCTION public.can_write_org(uuid) OWNER TO postgres;
ALTER FUNCTION public.create_organization_with_admin(text, text, text, char, date) OWNER TO postgres;
ALTER FUNCTION public.close_handover_session(uuid, text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.is_org_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_org_role(uuid, public.app_role[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_write_org(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, public.app_role[]) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_write_org(uuid) TO authenticated, anon;
