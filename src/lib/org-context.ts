import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/domain";
import { resolveEffectivePermissions } from "@/lib/permissions";

export type OrganizationRow = {
  id: string;
  legal_name: string;
  trade_name: string | null;
  nit: string | null;
  dv: string | null;
  company_type: string | null;
  incorporation_date: string | null;
  commercial_registration: string | null;
  primary_ciiu: string | null;
  secondary_activities: string[] | null;
  address: string | null;
  municipality: string | null;
  department: string | null;
  corporate_email: string | null;
  phone: string | null;
  legal_representative: string | null;
  currency: string;
  timezone: string;
  administrative_cutoff_date: string | null;
};

export type OrgContext = {
  userId: string;
  email: string | null;
  organization: OrganizationRow | null;
  role: AppRole | null;
  membershipId: string | null;
  /** Claves efectivas (almacenadas o default por rol). */
  permissions: string[];
};

export async function getOrgContext(): Promise<OrgContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: membership, error: membershipError } = await supabase
    .from("organization_users")
    .select("id, role, organization_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    console.error("getOrgContext membership:", membershipError.message);
    return {
      userId: user.id,
      email: user.email ?? null,
      organization: null,
      role: null,
      membershipId: null,
      permissions: [],
    };
  }

  if (!membership?.organization_id) {
    return {
      userId: user.id,
      email: user.email ?? null,
      organization: null,
      role: null,
      membershipId: null,
      permissions: [],
    };
  }

  const role = (membership.role as AppRole | undefined) ?? null;

  const [{ data: organization, error: orgError }, permResult] =
    await Promise.all([
      supabase
        .from("organizations")
        .select(
          "id, legal_name, trade_name, nit, dv, company_type, incorporation_date, commercial_registration, primary_ciiu, secondary_activities, address, municipality, department, corporate_email, phone, legal_representative, currency, timezone, administrative_cutoff_date",
        )
        .eq("id", membership.organization_id)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase
        .from("user_module_permissions")
        .select("permission_key")
        .eq("membership_id", membership.id)
        .eq("organization_id", membership.organization_id),
    ]);

  if (orgError) {
    console.error("getOrgContext organization:", orgError.message);
  }
  if (permResult.error) {
    console.error("getOrgContext permissions:", permResult.error.message);
  }

  const storedKeys = (permResult.data ?? []).map(
    (r) => r.permission_key as string,
  );
  const permissions = resolveEffectivePermissions({
    role,
    storedKeys,
  });

  return {
    userId: user.id,
    email: user.email ?? null,
    organization: (organization as OrganizationRow | null) ?? null,
    role,
    membershipId: membership.id as string,
    permissions,
  };
}
