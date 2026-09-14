-- Bootstrap atómico: crea organización + membership SUPER_ADMIN

CREATE OR REPLACE FUNCTION public.create_organization_with_admin(
  p_legal_name text,
  p_trade_name text DEFAULT NULL,
  p_nit text DEFAULT NULL,
  p_dv char DEFAULT NULL,
  p_administrative_cutoff_date date DEFAULT NULL
)
RETURNS public.organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org public.organizations;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  INSERT INTO public.organizations (
    legal_name,
    trade_name,
    nit,
    dv,
    administrative_cutoff_date,
    currency,
    timezone,
    created_by,
    updated_by
  )
  VALUES (
    p_legal_name,
    p_trade_name,
    p_nit,
    p_dv,
    p_administrative_cutoff_date,
    'COP',
    'America/Bogota',
    v_uid,
    v_uid
  )
  RETURNING * INTO v_org;

  INSERT INTO public.organization_users (
    organization_id,
    user_id,
    role,
    created_by,
    updated_by
  )
  VALUES (
    v_org.id,
    v_uid,
    'SUPER_ADMIN',
    v_uid,
    v_uid
  );

  INSERT INTO public.audit_logs (
    organization_id,
    user_id,
    action,
    entity,
    entity_id,
    new_values
  )
  VALUES (
    v_org.id,
    v_uid,
    'CREATE',
    'organizations',
    v_org.id,
    to_jsonb(v_org)
  );

  RETURN v_org;
END;
$$;

REVOKE ALL ON FUNCTION public.create_organization_with_admin FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_organization_with_admin TO authenticated;

-- Cierre de empalme con snapshot inmutable
CREATE OR REPLACE FUNCTION public.close_handover_session(
  p_session_id uuid,
  p_closing_notes text DEFAULT NULL
)
RETURNS public.handover_snapshots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.handover_sessions;
  v_uid uuid := auth.uid();
  v_total int;
  v_confirmed int;
  v_declared int;
  v_pending int;
  v_pct_confirmed numeric(7,4);
  v_pct_declared numeric(7,4);
  v_pct_pending numeric(7,4);
  v_payload jsonb;
  v_snapshot public.handover_snapshots;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT * INTO v_session
  FROM public.handover_sessions
  WHERE id = p_session_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesión de empalme no encontrada';
  END IF;

  IF NOT public.can_write_org(v_session.organization_id) THEN
    RAISE EXCEPTION 'Sin permiso para cerrar empalme';
  END IF;

  IF v_session.status = 'CERRADO' THEN
    RAISE EXCEPTION 'El empalme ya está cerrado';
  END IF;

  SELECT
    count(*),
    count(*) FILTER (WHERE verification_status = 'CONFIRMADO'),
    count(*) FILTER (WHERE verification_status = 'DECLARADO'),
    count(*) FILTER (WHERE verification_status = 'PENDIENTE')
  INTO v_total, v_confirmed, v_declared, v_pending
  FROM public.handover_items
  WHERE handover_session_id = p_session_id
    AND deleted_at IS NULL;

  IF v_total = 0 THEN
    v_pct_confirmed := 0;
    v_pct_declared := 0;
    v_pct_pending := 0;
  ELSE
    v_pct_confirmed := round((v_confirmed::numeric / v_total) * 100, 4);
    v_pct_declared := round((v_declared::numeric / v_total) * 100, 4);
    v_pct_pending := round((v_pending::numeric / v_total) * 100, 4);
  END IF;

  SELECT jsonb_build_object(
    'session', to_jsonb(v_session),
    'items', COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.created_at), '[]'::jsonb),
    'quality', jsonb_build_object(
      'total', v_total,
      'confirmed', v_confirmed,
      'declared', v_declared,
      'pending', v_pending,
      'pct_confirmed', v_pct_confirmed,
      'pct_declared', v_pct_declared,
      'pct_pending', v_pct_pending
    ),
    'closed_at', timezone('utc', now())
  )
  INTO v_payload
  FROM public.handover_items i
  WHERE i.handover_session_id = p_session_id
    AND i.deleted_at IS NULL;

  IF v_payload -> 'items' IS NULL THEN
    v_payload := jsonb_build_object(
      'session', to_jsonb(v_session),
      'items', '[]'::jsonb,
      'quality', jsonb_build_object(
        'total', 0,
        'confirmed', 0,
        'declared', 0,
        'pending', 0,
        'pct_confirmed', 0,
        'pct_declared', 0,
        'pct_pending', 0
      ),
      'closed_at', timezone('utc', now())
    );
  END IF;

  UPDATE public.handover_sessions
  SET
    status = 'CERRADO',
    closing_notes = p_closing_notes,
    pct_confirmed = v_pct_confirmed,
    pct_declared = v_pct_declared,
    pct_pending = v_pct_pending,
    closed_by = v_uid,
    closed_at = timezone('utc', now()),
    updated_by = v_uid
  WHERE id = p_session_id;

  INSERT INTO public.handover_snapshots (
    organization_id,
    handover_session_id,
    payload,
    pct_confirmed,
    pct_declared,
    pct_pending,
    closed_by,
    closed_at,
    closing_notes
  )
  VALUES (
    v_session.organization_id,
    p_session_id,
    v_payload,
    v_pct_confirmed,
    v_pct_declared,
    v_pct_pending,
    v_uid,
    timezone('utc', now()),
    p_closing_notes
  )
  RETURNING * INTO v_snapshot;

  INSERT INTO public.audit_logs (
    organization_id,
    user_id,
    action,
    entity,
    entity_id,
    new_values
  )
  VALUES (
    v_session.organization_id,
    v_uid,
    'CLOSE',
    'handover_sessions',
    p_session_id,
    to_jsonb(v_snapshot)
  );

  RETURN v_snapshot;
END;
$$;

REVOKE ALL ON FUNCTION public.close_handover_session FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_handover_session TO authenticated;
