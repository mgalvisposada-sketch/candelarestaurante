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

  // Defaults de nómina (Horario Candela + parámetros legales)
  await supabase.from("payroll_schedules").insert({
    organization_id: org.id,
    name: "Horario Candela",
    is_active: true,
    ordinary_entry_time: "10:00",
    ordinary_exit_time: "22:00",
    break_minutes: 60,
    works_monday: true,
    works_tuesday: true,
    works_wednesday: true,
    works_thursday: true,
    works_friday: true,
    works_saturday: true,
    works_sunday: false,
    created_by: user.id,
    updated_by: user.id,
  });
  await supabase.from("payroll_legal_params").insert({
    organization_id: org.id,
    effective_from: "2026-01-01",
    notes:
      "Colombia 2026: SMMLV $1.750.905, auxilio $249.095, nocturno 19:00, dominical 90%.",
    smmlv: 1750905,
    transport_aid: 249095,
    night_start_time: "19:00",
    surcharge_sunday_holiday: 90,
    surcharge_extra_day_sunday: 115,
    surcharge_extra_night_sunday: 165,
    created_by: user.id,
    updated_by: user.id,
  });

  const cargoSeed: Array<{
    code: string;
    name: string;
    arl_risk_level: "I" | "II" | "III" | "IV" | "V";
    notes: string;
  }> = [
    { code: "GER", name: "Gerente / Administrador de local", arl_risk_level: "I", notes: "Riesgo administrativo bajo." },
    { code: "BOF", name: "Contador / back-office", arl_risk_level: "I", notes: "Trabajo de oficina." },
    { code: "CAJ", name: "Cajero / Hostess / Anfitrión", arl_risk_level: "I", notes: "Atención al público." },
    { code: "MES", name: "Mesero / Capitán de meseros", arl_risk_level: "II", notes: "Servicio en salón." },
    { code: "BAR", name: "Bartender / Barista", arl_risk_level: "II", notes: "Barra y bebidas." },
    { code: "COC", name: "Cocinero / Chef de partida", arl_risk_level: "III", notes: "Cocina; alineado CIIU 5611." },
    { code: "AUX", name: "Auxiliar de cocina / Lavaplatos", arl_risk_level: "III", notes: "Cocina y lavado." },
    { code: "DOM_M", name: "Domiciliario (moto)", arl_risk_level: "IV", notes: "Exposición vial alta." },
    { code: "DOM_B", name: "Domiciliario (bici / a pie)", arl_risk_level: "III", notes: "Entrega sin moto." },
    { code: "SST", name: "SST / mantenimiento operativo", arl_risk_level: "III", notes: "Mantenimiento operativo." },
  ];
  await supabase.from("job_positions").insert(
    cargoSeed.map((c) => ({
      organization_id: org.id,
      ...c,
      created_by: user.id,
      updated_by: user.id,
    })),
  );

  revalidatePath("/empresa");
  revalidatePath("/inicio");
  revalidatePath("/empalme");
  revalidatePath("/personal");
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
