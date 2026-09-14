-- SELECT de memberships propias sin depender solo de is_org_member
DROP POLICY IF EXISTS organization_users_select_member ON public.organization_users;

CREATE POLICY organization_users_select_member
  ON public.organization_users FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_org_member(organization_id)
  );
