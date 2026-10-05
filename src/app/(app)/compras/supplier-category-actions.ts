"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess } from "@/lib/permissions";
import {
  supplierCategoryLinkSchema,
  supplierLeadTimeSchema,
} from "@/validations/purchases";
import type { ActionResult } from "../empresa/actions";

function emptyToNull(value: string | null | undefined) {
  if (value === undefined || value === null || String(value).trim() === "")
    return null;
  return String(value).trim();
}

function parseIntSafe(raw: string | null | undefined) {
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const n = Number(String(raw).trim());
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

export async function updateSupplierLeadTimeAction(
  supplierId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "compras.proveedores")) {
    return { ok: false, error: "Sin permiso" };
  }

  const parsed = supplierLeadTimeSchema.safeParse({
    lead_time_days: formData.get("lead_time_days"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const days = parseIntSafe(parsed.data.lead_time_days ?? null);
  if (parsed.data.lead_time_days && String(parsed.data.lead_time_days).trim() !== "" && days === null) {
    return { ok: false, error: "Días de entrega inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .update({
      lead_time_days: days,
      updated_by: ctx.userId,
    })
    .eq("id", supplierId)
    .eq("organization_id", ctx.organization.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/compras/proveedores");
  revalidatePath("/proveedores");
  return { ok: true, id: supplierId };
}

export async function linkSupplierCategoryAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "compras.proveedores")) {
    return { ok: false, error: "Sin permiso" };
  }

  const parsed = supplierCategoryLinkSchema.safeParse({
    supplier_id: formData.get("supplier_id"),
    category_id: formData.get("category_id"),
    lead_time_days: formData.get("lead_time_days"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const days = parseIntSafe(parsed.data.lead_time_days ?? null);
  if (
    parsed.data.lead_time_days &&
    String(parsed.data.lead_time_days).trim() !== "" &&
    days === null
  ) {
    return { ok: false, error: "Días de entrega inválidos" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("supplier_product_categories")
    .upsert(
      {
        organization_id: ctx.organization.id,
        supplier_id: parsed.data.supplier_id,
        category_id: parsed.data.category_id,
        lead_time_days: days,
        notes: emptyToNull(parsed.data.notes),
        is_active: true,
        deleted_at: null,
        updated_by: ctx.userId,
        created_by: ctx.userId,
      },
      { onConflict: "organization_id,supplier_id,category_id" },
    )
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/compras/proveedores");
  revalidatePath("/compras/solicitudes");
  return { ok: true, id: data.id };
}

export async function unlinkSupplierCategoryAction(
  linkId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "compras.proveedores")) {
    return { ok: false, error: "Sin permiso" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("supplier_product_categories")
    .update({
      deleted_at: new Date().toISOString(),
      is_active: false,
      updated_by: ctx.userId,
    })
    .eq("id", linkId)
    .eq("organization_id", ctx.organization.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/compras/proveedores");
  return { ok: true, id: linkId };
}
