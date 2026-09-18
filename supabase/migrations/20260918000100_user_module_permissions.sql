-- Permisos granulares por membresía (módulo / submódulo)

CREATE TABLE public.user_module_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  membership_id uuid NOT NULL REFERENCES public.organization_users (id) ON DELETE CASCADE,
  permission_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  UNIQUE (membership_id, permission_key)
);

CREATE INDEX user_module_permissions_org_idx
  ON public.user_module_permissions (organization_id);

CREATE INDEX user_module_permissions_membership_idx
  ON public.user_module_permissions (membership_id);

CREATE TRIGGER user_module_permissions_set_updated_at
  BEFORE UPDATE ON public.user_module_permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_module_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_module_permissions_select_member
  ON public.user_module_permissions FOR SELECT
  USING (public.is_org_member(organization_id));

CREATE POLICY user_module_permissions_write_super_admin
  ON public.user_module_permissions FOR ALL
  USING (
    public.has_org_role(organization_id, ARRAY['SUPER_ADMIN']::public.app_role[])
  )
  WITH CHECK (
    public.has_org_role(organization_id, ARRAY['SUPER_ADMIN']::public.app_role[])
  );
