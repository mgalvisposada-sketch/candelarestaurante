"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org-context";
import { employeeContractSchema, employeeSchema } from "@/validations/hr";
import type { ActionResult } from "../empresa/actions";

function emptyToNull(value: string | null | undefined) {
  if (value === undefined || value === null || String(value).trim() === "")
    return null;
  return String(value).trim();
}

function parseMoney(raw: string | null | undefined) {
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const n = Number(String(raw).replace(/,/g, "").trim());
  if (Number.isNaN(n)) return null;
  return n;
}

export async function createEmployeeAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = employeeSchema.safeParse({
    full_name: formData.get("full_name"),
    id_number: formData.get("id_number"),
    position_title: formData.get("position_title"),
    hire_date: formData.get("hire_date"),
    employment_type: formData.get("employment_type") || "LABORAL",
    salary_or_fee: formData.get("salary_or_fee"),
    monthly_company_cost: formData.get("monthly_company_cost"),
    eps: formData.get("eps"),
    pension_fund: formData.get("pension_fund"),
    arl: formData.get("arl"),
    compensation_fund: formData.get("compensation_fund"),
    is_active: formData.get("is_active") || "true",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .insert({
      organization_id: ctx.organization.id,
      full_name: parsed.data.full_name.trim(),
      id_number: emptyToNull(parsed.data.id_number),
      position_title: emptyToNull(parsed.data.position_title),
      hire_date: emptyToNull(parsed.data.hire_date),
      employment_type: parsed.data.employment_type,
      salary_or_fee: parseMoney(parsed.data.salary_or_fee),
      monthly_company_cost: parseMoney(parsed.data.monthly_company_cost),
      eps: emptyToNull(parsed.data.eps),
      pension_fund: emptyToNull(parsed.data.pension_fund),
      arl: emptyToNull(parsed.data.arl),
      compensation_fund: emptyToNull(parsed.data.compensation_fund),
      is_active: parsed.data.is_active !== "false",
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "CREATE",
    entity: "employees",
    entity_id: data.id,
  });

  revalidatePath("/personal");
  return { ok: true, id: data.id };
}

export async function createEmployeeContractAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const parsed = employeeContractSchema.safeParse({
    employee_id: formData.get("employee_id"),
    start_date: formData.get("start_date"),
    end_date: formData.get("end_date"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_contracts")
    .insert({
      organization_id: ctx.organization.id,
      employee_id: parsed.data.employee_id,
      start_date: emptyToNull(parsed.data.start_date),
      end_date: emptyToNull(parsed.data.end_date),
      notes: emptyToNull(parsed.data.notes),
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/personal");
  return { ok: true, id: data.id };
}

export async function softDeleteEmployeeAction(
  employeeId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("employees")
    .update({
      deleted_at: new Date().toISOString(),
      is_active: false,
      updated_by: ctx.userId,
    })
    .eq("id", employeeId)
    .eq("organization_id", ctx.organization.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/personal");
  return { ok: true, id: employeeId };
}
