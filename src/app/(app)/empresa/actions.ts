"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { organizationSchema } from "@/validations/organization";

function emptyToNull(value: string | null | undefined) {
  if (value === undefined || value === null || value.trim() === "") return null;
  return value.trim();
}

export type ActionResult = {
  ok: boolean;
  error?: string;
  id?: string;
};

export async function createOrganizationAction(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = organizationSchema.safeParse({
    legal_name: formData.get("legal_name"),
    trade_name: formData.get("trade_name"),
    nit: formData.get("nit"),
    dv: formData.get("dv"),
    company_type: formData.get("company_type"),
    incorporation_date: formData.get("incorporation_date"),
    commercial_registration: formData.get("commercial_registration"),
    primary_ciiu: formData.get("primary_ciiu"),
    address: formData.get("address"),
    municipality: formData.get("municipality"),
    department: formData.get("department"),
    corporate_email: formData.get("corporate_email"),
    phone: formData.get("phone"),
    legal_representative: formData.get("legal_representative"),
    administrative_cutoff_date: formData.get("administrative_cutoff_date"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado" };

  const v = parsed.data;
  const { data, error } = await supabase.rpc("create_organization_with_admin", {
    p_legal_name: v.legal_name.trim(),
    p_trade_name: emptyToNull(v.trade_name),
    p_nit: emptyToNull(v.nit),
    p_dv: emptyToNull(v.dv),
    p_administrative_cutoff_date: emptyToNull(v.administrative_cutoff_date),
  });

  if (error) return { ok: false, error: error.message };

  const org = data as { id: string };
  // Completar campos adicionales tras el bootstrap
  const { error: updateError } = await supabase
    .from("organizations")
    .update({
      company_type: emptyToNull(v.company_type),
      incorporation_date: emptyToNull(v.incorporation_date),
      commercial_registration: emptyToNull(v.commercial_registration),
      primary_ciiu: emptyToNull(v.primary_ciiu),
      address: emptyToNull(v.address),
      municipality: emptyToNull(v.municipality),
      department: emptyToNull(v.department),
      corporate_email: emptyToNull(v.corporate_email),
      phone: emptyToNull(v.phone),
      legal_representative: emptyToNull(v.legal_representative),
      updated_by: user.id,
    })
    .eq("id", org.id);

  if (updateError) return { ok: false, error: updateError.message };

  revalidatePath("/empresa");
  revalidatePath("/inicio");
  revalidatePath("/empalme");
  return { ok: true, id: org.id };
}

export async function updateOrganizationAction(
  organizationId: string,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = organizationSchema.safeParse({
    legal_name: formData.get("legal_name"),
    trade_name: formData.get("trade_name"),
    nit: formData.get("nit"),
    dv: formData.get("dv"),
    company_type: formData.get("company_type"),
    incorporation_date: formData.get("incorporation_date"),
    commercial_registration: formData.get("commercial_registration"),
    primary_ciiu: formData.get("primary_ciiu"),
    address: formData.get("address"),
    municipality: formData.get("municipality"),
    department: formData.get("department"),
    corporate_email: formData.get("corporate_email"),
    phone: formData.get("phone"),
    legal_representative: formData.get("legal_representative"),
    administrative_cutoff_date: formData.get("administrative_cutoff_date"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado" };

  const v = parsed.data;
  const { error } = await supabase
    .from("organizations")
    .update({
      legal_name: v.legal_name.trim(),
      trade_name: emptyToNull(v.trade_name),
      nit: emptyToNull(v.nit),
      dv: emptyToNull(v.dv),
      company_type: emptyToNull(v.company_type),
      incorporation_date: emptyToNull(v.incorporation_date),
      commercial_registration: emptyToNull(v.commercial_registration),
      primary_ciiu: emptyToNull(v.primary_ciiu),
      address: emptyToNull(v.address),
      municipality: emptyToNull(v.municipality),
      department: emptyToNull(v.department),
      corporate_email: emptyToNull(v.corporate_email),
      phone: emptyToNull(v.phone),
      legal_representative: emptyToNull(v.legal_representative),
      administrative_cutoff_date: emptyToNull(v.administrative_cutoff_date),
      updated_by: user.id,
    })
    .eq("id", organizationId);

  if (error) return { ok: false, error: error.message };

  await supabase.from("audit_logs").insert({
    organization_id: organizationId,
    user_id: user.id,
    action: "UPDATE",
    entity: "organizations",
    entity_id: organizationId,
    new_values: v,
  });

  revalidatePath("/empresa");
  revalidatePath("/empalme");
  return { ok: true, id: organizationId };
}
