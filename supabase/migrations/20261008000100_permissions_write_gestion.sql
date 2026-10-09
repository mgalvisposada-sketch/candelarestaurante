-- Gestión (y SUPER_ADMIN) pueden escribir permisos por módulo.
-- Antes solo SUPER_ADMIN pasaba RLS, lo que bloqueaba cambios en producción
-- cuando el operador era Gestión o cuando el chequeo de rol fallaba en edge cases.

DROP POLICY IF EXISTS user_module_permissions_write_super_admin
  ON public.user_module_permissions;

CREATE POLICY user_module_permissions_write_admins
  ON public.user_module_permissions FOR ALL
  USING (
    public.has_org_role(
      organization_id,
      ARRAY['SUPER_ADMIN', 'GESTION']::public.app_role[]
    )
  )
  WITH CHECK (
    public.has_org_role(
      organization_id,
      ARRAY['SUPER_ADMIN', 'GESTION']::public.app_role[]
    )
  );
