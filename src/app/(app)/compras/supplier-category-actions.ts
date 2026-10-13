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

/** Alta rápida de proveedor de insumos ligado a una categoría (desde solicitud). */
export async function quickCreatePurchaseSupplierAction(
  formData: FormData,
): Promise<ActionResult & { name?: string }> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  const can =
    ctxCanAccess(ctx, "compras.proveedores") ||
    ctxCanAccess(ctx, "proveedores.crear") ||
    ctxCanAccess(ctx, "proveedores") ||
    ctxCanAccess(ctx, "compras.solicitudes.crear");
  if (!can) return { ok: false, error: "Sin permiso para crear proveedor" };

  const name = String(formData.get("name") ?? "").trim();
  const categoryId = String(formData.get("category_id") ?? "").trim();
  const terms = String(formData.get("purchase_payment_terms") ?? "PREPAGO").trim();
  if (name.length < 2) {
    return { ok: false, error: "El nombre del proveedor es obligatorio" };
  }
  if (!/^[0-9a-f-]{36}$/i.test(categoryId)) {
    return { ok: false, error: "Seleccione una categoría antes de crear el proveedor" };
  }

  const supabase = await createClient();
  const { data: cat, error: catError } = await supabase
    .from("product_categories")
    .select("id, name")
    .eq("id", categoryId)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (catError) return { ok: false, error: catError.message };
  if (!cat) return { ok: false, error: "Categoría no válida" };

  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      organization_id: ctx.organization.id,
      name,
      tax_id: emptyToNull(String(formData.get("tax_id") ?? "")),
      is_active: true,
      is_purchase_supplier: true,
      is_expense_supplier: false,
      purchase_payment_terms: terms === "CREDITO" ? "CREDITO" : "PREPAGO",
      category: cat.name,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id, name")
    .single();
  if (error) return { ok: false, error: error.message };

  const { error: linkError } = await supabase
    .from("supplier_product_categories")
    .upsert(
      {
        organization_id: ctx.organization.id,
        supplier_id: data.id,
        category_id: categoryId,
        is_active: true,
        deleted_at: null,
        created_by: ctx.userId,
        updated_by: ctx.userId,
      },
      { onConflict: "organization_id,supplier_id,category_id" },
    );
  if (linkError) return { ok: false, error: linkError.message };

  // CxP cabecera mínima
  const { data: existingAp } = await supabase
    .from("accounts_payable")
    .select("id")
    .eq("organization_id", ctx.organization.id)
    .eq("supplier_id", data.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!existingAp) {
    await supabase.from("accounts_payable").insert({
      organization_id: ctx.organization.id,
      supplier_id: data.id,
      priority: "POR_VALIDAR",
      created_by: ctx.userId,
      updated_by: ctx.userId,
    });
  }

  revalidatePath("/compras/proveedores");
  revalidatePath("/compras/solicitudes");
  revalidatePath("/proveedores");
  revalidatePath("/proveedores/maestro");
  return { ok: true, id: data.id, name: data.name as string };
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
