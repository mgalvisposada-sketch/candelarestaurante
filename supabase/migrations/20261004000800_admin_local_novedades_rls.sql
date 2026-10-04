-- ADMIN_LOCAL puede insertar/actualizar novedades de turno, sin can_write_org global.

CREATE OR REPLACE FUNCTION public.can_report_shift_novelties(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_org_role(
    p_org_id,
    ARRAY['SUPER_ADMIN', 'GESTION', 'ADMIN_LOCAL']::public.app_role[]
  );
$$;

ALTER FUNCTION public.can_report_shift_novelties(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_report_shift_novelties(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_report_shift_novelties(uuid) TO authenticated, anon;

DROP POLICY IF EXISTS shift_novelties_insert_writers ON public.shift_novelties;
DROP POLICY IF EXISTS shift_novelties_update_writers ON public.shift_novelties;

CREATE POLICY shift_novelties_insert_reporters
  ON public.shift_novelties FOR INSERT
  WITH CHECK (public.can_report_shift_novelties(organization_id));

CREATE POLICY shift_novelties_update_reporters
  ON public.shift_novelties FOR UPDATE
  USING (public.can_report_shift_novelties(organization_id))
  WITH CHECK (public.can_report_shift_novelties(organization_id));
