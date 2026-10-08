"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess } from "@/lib/permissions";
import {
  productCategorySchema,
  productSchema,
  productUnitSchema,
} from "@/validations/purchases";
import { parseBulkProductPaste } from "@/lib/inventory/bulk-paste";
import type { ActionResult } from "../empresa/actions";

export type BulkImportProductsResult = {
  ok: boolean;
  error?: string;
  created?: number;
  errors?: { line: number; message: string }[];
};

function canManageInventoryMaster(
  ctx: NonNullable<Awaited<ReturnType<typeof getOrgContext>>>,
) {
  return (
    ctxCanAccess(ctx, "inventario.maestro") ||
    ctxCanAccess(ctx, "compras.proveedores") ||
    ctxCanAccess(ctx, "proveedores") ||
    ctxCanAccess(ctx, "proveedores.maestro")
  );
}

function emptyToNull(value: string | null | undefined) {
  if (value === undefined || value === null || String(value).trim() === "")
    return null;
  return String(value).trim();
}

function parseNumber(raw: string | null | undefined, fallback?: number) {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return fallback === undefined ? null : fallback;
  }
  const n = Number(String(raw).replace(/,/g, "").trim());
  if (Number.isNaN(n)) return null;
  return n;
}

export async function createProductCategoryAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  const canManageCategories =
    ctxCanAccess(ctx, "proveedores.categorias") ||
    ctxCanAccess(ctx, "inventario.maestro") ||
    ctxCanAccess(ctx, "compras.proveedores") ||
    ctxCanAccess(ctx, "proveedores") ||
    ctxCanAccess(ctx, "proveedores.maestro");
  if (!canManageCategories) {
    return { ok: false, error: "Sin permiso" };
  }

  const parsed = productCategorySchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_categories")
    .insert({
      organization_id: ctx.organization.id,
      code: parsed.data.code.trim().toUpperCase(),
      name: parsed.data.name.trim(),
      description: emptyToNull(parsed.data.description),
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) {
    if (error.message.toLowerCase().includes("row-level security")) {
      return {
        ok: false,
        error:
          "No tiene permiso de base de datos para crear categorías. Use un usuario Gestión o actualice las políticas RLS.",
      };
    }
    return { ok: false, error: error.message };
  }
  revalidatePath("/inventario/maestro");
  revalidatePath("/inventario/lista");
  revalidatePath("/compras/proveedores");
  revalidatePath("/proveedores");
  revalidatePath("/proveedores/maestro");
  return { ok: true, id: data.id };
}

export async function softDeleteProductCategoryAction(
  categoryId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  const canManageCategories =
    ctxCanAccess(ctx, "proveedores.categorias") ||
    ctxCanAccess(ctx, "inventario.maestro") ||
    ctxCanAccess(ctx, "compras.proveedores") ||
    ctxCanAccess(ctx, "proveedores") ||
    ctxCanAccess(ctx, "proveedores.maestro");
  if (!canManageCategories) {
    return { ok: false, error: "Sin permiso" };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("product_categories")
    .select("id")
    .eq("id", categoryId)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Categoría no encontrada" };

  const { count, error: countError } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", ctx.organization.id)
    .eq("category_id", categoryId)
    .is("deleted_at", null);

  if (countError) return { ok: false, error: countError.message };
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `No se puede eliminar: ${count} producto(s) usan esta categoría. Muévalos o elimínelos primero.`,
    };
  }

  const now = new Date().toISOString();

  const { error: linksError } = await supabase
    .from("supplier_product_categories")
    .update({
      deleted_at: now,
      is_active: false,
      updated_by: ctx.userId,
    })
    .eq("organization_id", ctx.organization.id)
    .eq("category_id", categoryId)
    .is("deleted_at", null);

  if (linksError) return { ok: false, error: linksError.message };

  const { error } = await supabase
    .from("product_categories")
    .update({
      deleted_at: now,
      is_active: false,
      updated_by: ctx.userId,
    })
    .eq("id", categoryId)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null);

  if (error) {
    if (error.message.toLowerCase().includes("row-level security")) {
      return {
        ok: false,
        error:
          "No tiene permiso de base de datos para eliminar categorías. Use un usuario Gestión o actualice las políticas RLS.",
      };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/inventario/maestro");
  revalidatePath("/inventario/lista");
  revalidatePath("/compras/proveedores");
  revalidatePath("/compras/solicitudes");
  revalidatePath("/compras/sugeridos");
  revalidatePath("/proveedores");
  revalidatePath("/proveedores/maestro");
  return { ok: true, id: categoryId };
}

export async function createProductUnitAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!canManageInventoryMaster(ctx)) {
    return { ok: false, error: "Sin permiso" };
  }

  const parsed = productUnitSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_units")
    .insert({
      organization_id: ctx.organization.id,
      code: parsed.data.code.trim().toUpperCase(),
      name: parsed.data.name.trim(),
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) {
    if (error.message.toLowerCase().includes("duplicate")) {
      return { ok: false, error: "Ya existe una unidad con ese código" };
    }
    if (error.message.toLowerCase().includes("row-level security")) {
      return { ok: false, error: "No tiene permiso para crear unidades." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/inventario/maestro");
  revalidatePath("/inventario/lista");
  revalidatePath("/compras/solicitudes");
  return { ok: true, id: data.id };
}

export async function updateProductUnitAction(
  unitId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!canManageInventoryMaster(ctx)) {
    return { ok: false, error: "Sin permiso" };
  }

  const parsed = productUnitSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const code = parsed.data.code.trim().toUpperCase();
  const name = parsed.data.name.trim();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("product_units")
    .select("id, code")
    .eq("id", unitId)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Unidad no encontrada" };

  const { error } = await supabase
    .from("product_units")
    .update({
      code,
      name,
      updated_by: ctx.userId,
    })
    .eq("id", unitId)
    .eq("organization_id", ctx.organization.id);

  if (error) {
    if (error.message.toLowerCase().includes("duplicate")) {
      return { ok: false, error: "Ya existe una unidad con ese código" };
    }
    if (error.message.toLowerCase().includes("row-level security")) {
      return { ok: false, error: "No tiene permiso para editar unidades." };
    }
    return { ok: false, error: error.message };
  }

  if (existing.code !== code) {
    await supabase
      .from("products")
      .update({ unit: code, updated_by: ctx.userId })
      .eq("organization_id", ctx.organization.id)
      .eq("unit_id", unitId)
      .is("deleted_at", null);
  }

  revalidatePath("/inventario/maestro");
  revalidatePath("/inventario/lista");
  revalidatePath("/compras/solicitudes");
  revalidatePath("/compras/sugeridos");
  return { ok: true, id: unitId };
}

export async function softDeleteProductUnitAction(
  unitId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!canManageInventoryMaster(ctx)) {
    return { ok: false, error: "Sin permiso" };
  }

  const supabase = await createClient();
  const { count, error: countError } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", ctx.organization.id)
    .eq("unit_id", unitId)
    .is("deleted_at", null);

  if (countError) return { ok: false, error: countError.message };
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `No se puede eliminar: ${count} producto(s) usan esta unidad. Cámbielos primero.`,
    };
  }

  const { error } = await supabase
    .from("product_units")
    .update({
      deleted_at: new Date().toISOString(),
      is_active: false,
      updated_by: ctx.userId,
    })
    .eq("id", unitId)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/inventario/maestro");
  revalidatePath("/inventario/lista");
  revalidatePath("/compras/solicitudes");
  return { ok: true, id: unitId };
}

export async function createProductAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "inventario.maestro")) {
    return { ok: false, error: "Sin permiso" };
  }

  const parsed = productSchema.safeParse({
    category_id: formData.get("category_id"),
    unit_id: formData.get("unit_id"),
    sku: formData.get("sku"),
    name: formData.get("name"),
    min_stock: formData.get("min_stock"),
    current_stock: formData.get("current_stock"),
    unit_cost: formData.get("unit_cost"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const current = parseNumber(parsed.data.current_stock, 0);
  const minStock = parseNumber(parsed.data.min_stock);
  const unitCost = parseNumber(parsed.data.unit_cost);
  if (current === null || current < 0) return { ok: false, error: "Stock inválido" };
  if (minStock === null || minStock < 0) {
    return { ok: false, error: "Stock mínimo inválido" };
  }
  if (unitCost === null || unitCost < 0) {
    return { ok: false, error: "Costo unitario inválido" };
  }

  const supabase = await createClient();
  const { data: unitRow } = await supabase
    .from("product_units")
    .select("id, code")
    .eq("id", parsed.data.unit_id)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!unitRow) return { ok: false, error: "Unidad no encontrada" };

  const { data, error } = await supabase
    .from("products")
    .insert({
      organization_id: ctx.organization.id,
      category_id: parsed.data.category_id,
      unit_id: unitRow.id,
      sku: emptyToNull(parsed.data.sku),
      name: parsed.data.name.trim(),
      unit: unitRow.code,
      min_stock: minStock,
      current_stock: current,
      unit_cost: unitCost,
      notes: emptyToNull(parsed.data.notes),
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) {
    if (error.message.toLowerCase().includes("row-level security")) {
      return {
        ok: false,
        error:
          "Su rol no puede crear productos en base de datos. Si es Admin del local, aplique la última migración RLS o use un usuario Gestión.",
      };
    }
    return { ok: false, error: error.message };
  }

  if (current > 0) {
    await supabase.from("inventory_movements").insert({
      organization_id: ctx.organization.id,
      product_id: data.id,
      movement_type: "APERTURA",
      quantity: current,
      unit_cost: unitCost,
      stock_before: 0,
      stock_after: current,
      unit_cost_before: 0,
      unit_cost_after: unitCost,
      reference_type: "products",
      reference_id: data.id,
      notes: "Stock inicial al crear producto",
      created_by: ctx.userId,
    });
  }

  revalidatePath("/inventario/maestro");
  revalidatePath("/inventario/lista");
  revalidatePath("/compras/sugeridos");
  revalidatePath("/compras/solicitudes");
  return { ok: true, id: data.id };
}

export type QuickProductResult = ActionResult & {
  product?: {
    id: string;
    name: string;
    unit: string;
    category_id: string;
    current_stock: number;
    min_stock: number;
    unit_cost: number;
  };
};

/** Alta rápida de producto desde una solicitud de compra (sin salir del flujo). */
export async function createProductFromRequestAction(
  formData: FormData,
): Promise<QuickProductResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  const canCreate =
    ctxCanAccess(ctx, "inventario.maestro") ||
    ctxCanAccess(ctx, "compras.solicitudes.crear") ||
    ctxCanAccess(ctx, "compras.solicitudes.recibir.extras");
  if (!canCreate) return { ok: false, error: "Sin permiso para crear productos" };

  const parsed = productSchema.safeParse({
    category_id: formData.get("category_id"),
    unit_id: formData.get("unit_id"),
    sku: formData.get("sku"),
    name: formData.get("name"),
    min_stock: formData.get("min_stock") || "0",
    current_stock: formData.get("current_stock") || "0",
    unit_cost: formData.get("unit_cost") || "0",
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const current = parseNumber(parsed.data.current_stock, 0) ?? 0;
  const minStock = parseNumber(parsed.data.min_stock, 0);
  const unitCost = parseNumber(parsed.data.unit_cost, 0);
  if (minStock === null || minStock < 0) {
    return { ok: false, error: "Stock mínimo inválido" };
  }
  if (unitCost === null || unitCost < 0) {
    return { ok: false, error: "Costo unitario inválido" };
  }

  const supabase = await createClient();
  const { data: unitRow } = await supabase
    .from("product_units")
    .select("id, code")
    .eq("id", parsed.data.unit_id)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!unitRow) return { ok: false, error: "Unidad no encontrada" };

  const { data, error } = await supabase
    .from("products")
    .insert({
      organization_id: ctx.organization.id,
      category_id: parsed.data.category_id,
      unit_id: unitRow.id,
      sku: emptyToNull(parsed.data.sku),
      name: parsed.data.name.trim(),
      unit: unitRow.code,
      min_stock: minStock,
      current_stock: current,
      unit_cost: unitCost,
      notes: emptyToNull(parsed.data.notes),
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id, name, unit, category_id, current_stock, min_stock, unit_cost")
    .single();

  if (error) {
    if (error.message.toLowerCase().includes("row-level security")) {
      return {
        ok: false,
        error: "No tiene permiso de base de datos para crear productos.",
      };
    }
    return { ok: false, error: error.message };
  }

  const requestId = String(formData.get("request_id") ?? "").trim();
  revalidatePath("/inventario/maestro");
  revalidatePath("/inventario/lista");
  revalidatePath("/compras/sugeridos");
  revalidatePath("/compras/solicitudes");
  if (/^[0-9a-f-]{36}$/i.test(requestId)) {
    revalidatePath(`/compras/solicitudes/${requestId}`);
  }

  return {
    ok: true,
    id: data.id,
    product: {
      id: data.id,
      name: data.name,
      unit: data.unit,
      category_id: data.category_id,
      current_stock: Number(data.current_stock || 0),
      min_stock: Number(data.min_stock || 0),
      unit_cost: Number(data.unit_cost || 0),
    },
  };
}

export async function bulkImportProductsAction(
  formData: FormData,
): Promise<BulkImportProductsResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "inventario.maestro")) {
    return { ok: false, error: "Sin permiso" };
  }

  const categoryId = String(formData.get("category_id") ?? "").trim();
  const paste = String(formData.get("paste") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(categoryId)) {
    return { ok: false, error: "Seleccione una categoría" };
  }

  const { rows, issues } = parseBulkProductPaste(paste);
  if (rows.length === 0 && issues.length > 0) {
    return { ok: false, error: issues[0]?.message ?? "Datos inválidos", errors: issues };
  }
  if (rows.length === 0) {
    return { ok: false, error: "No hay filas válidas para importar" };
  }

  const supabase = await createClient();
  const { data: category } = await supabase
    .from("product_categories")
    .select("id")
    .eq("id", categoryId)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!category) return { ok: false, error: "Categoría no encontrada" };

  const { data: unitRows } = await supabase
    .from("product_units")
    .select("id, code")
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .eq("is_active", true);

  const unitsByCode = new Map(
    (unitRows ?? []).map((u) => [u.code.toUpperCase(), u]),
  );

  const errors: { line: number; message: string }[] = [...issues];
  let created = 0;

  for (const row of rows) {
    const unit = unitsByCode.get(row.unitCode);
    if (!unit) {
      errors.push({
        line: row.line,
        message: `«${row.name}»: unidad «${row.unitCode}» no existe en el maestro`,
      });
      continue;
    }

    const { data, error } = await supabase
      .from("products")
      .insert({
        organization_id: ctx.organization.id,
        category_id: categoryId,
        unit_id: unit.id,
        sku: row.sku,
        name: row.name,
        unit: unit.code,
        min_stock: row.minStock,
        current_stock: row.currentStock,
        unit_cost: row.unitCost,
        notes: row.notes,
        created_by: ctx.userId,
        updated_by: ctx.userId,
      })
      .select("id")
      .single();

    if (error) {
      errors.push({
        line: row.line,
        message: `«${row.name}»: ${error.message}`,
      });
      continue;
    }

    created += 1;

    if (row.currentStock > 0) {
      await supabase.from("inventory_movements").insert({
        organization_id: ctx.organization.id,
        product_id: data.id,
        movement_type: "APERTURA",
        quantity: row.currentStock,
        unit_cost: row.unitCost,
        stock_before: 0,
        stock_after: row.currentStock,
        unit_cost_before: 0,
        unit_cost_after: row.unitCost,
        reference_type: "products",
        reference_id: data.id,
        notes: "Stock inicial (carga masiva)",
        created_by: ctx.userId,
      });
    }
  }

  if (created > 0) {
    revalidatePath("/inventario/maestro");
    revalidatePath("/inventario/lista");
    revalidatePath("/compras/sugeridos");
    revalidatePath("/compras/solicitudes");
  }

  if (created === 0) {
    return {
      ok: false,
      error: "No se creó ningún producto. Revise los errores por fila.",
      created: 0,
      errors,
    };
  }

  return {
    ok: true,
    created,
    errors: errors.length > 0 ? errors : undefined,
  };
}

export async function updateProductAction(
  productId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "inventario.maestro")) {
    return { ok: false, error: "Sin permiso" };
  }

  const parsed = productSchema.safeParse({
    category_id: formData.get("category_id"),
    unit_id: formData.get("unit_id"),
    sku: formData.get("sku"),
    name: formData.get("name"),
    min_stock: formData.get("min_stock"),
    current_stock: formData.get("current_stock"),
    unit_cost: formData.get("unit_cost"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const current = parseNumber(parsed.data.current_stock, 0);
  const minStock = parseNumber(parsed.data.min_stock);
  const unitCost = parseNumber(parsed.data.unit_cost);
  if (current === null || current < 0) return { ok: false, error: "Stock inválido" };
  if (minStock === null || minStock < 0) {
    return { ok: false, error: "Stock mínimo inválido" };
  }
  if (unitCost === null || unitCost < 0) {
    return { ok: false, error: "Costo unitario inválido" };
  }

  const supabase = await createClient();
  const { data: unitRow } = await supabase
    .from("product_units")
    .select("id, code")
    .eq("id", parsed.data.unit_id)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!unitRow) return { ok: false, error: "Unidad no encontrada" };

  const { data: existing } = await supabase
    .from("products")
    .select("id, current_stock, unit_cost")
    .eq("id", productId)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!existing) return { ok: false, error: "Producto no encontrado" };

  const stockBefore = Number(existing.current_stock || 0);
  const costBefore = Number(existing.unit_cost || 0);

  const { error } = await supabase
    .from("products")
    .update({
      category_id: parsed.data.category_id,
      unit_id: unitRow.id,
      sku: emptyToNull(parsed.data.sku),
      name: parsed.data.name.trim(),
      unit: unitRow.code,
      min_stock: minStock,
      current_stock: current,
      unit_cost: unitCost,
      notes: emptyToNull(parsed.data.notes),
      updated_by: ctx.userId,
    })
    .eq("id", productId)
    .eq("organization_id", ctx.organization.id);

  if (error) {
    if (error.message.toLowerCase().includes("row-level security")) {
      return {
        ok: false,
        error: "No tiene permiso de base de datos para editar productos.",
      };
    }
    return { ok: false, error: error.message };
  }

  const stockDiff = current - stockBefore;
  if (stockDiff !== 0) {
    await supabase.from("inventory_movements").insert({
      organization_id: ctx.organization.id,
      product_id: productId,
      movement_type: "AJUSTE_MANUAL",
      quantity: stockDiff,
      unit_cost: unitCost,
      stock_before: stockBefore,
      stock_after: current,
      unit_cost_before: costBefore,
      unit_cost_after: unitCost,
      reference_type: "products",
      reference_id: productId,
      notes: "Ajuste manual al editar producto",
      created_by: ctx.userId,
    });
  }

  revalidatePath("/inventario/maestro");
  revalidatePath("/inventario/lista");
  revalidatePath("/compras/sugeridos");
  revalidatePath("/compras/solicitudes");
  revalidatePath("/inventario/fisico");
  return { ok: true, id: productId };
}

export async function updateProductMinStockAction(
  productId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "inventario.minimo")) {
    return { ok: false, error: "Sin permiso para cambiar stock mínimo" };
  }

  const minStock = parseNumber(String(formData.get("min_stock") ?? ""));
  if (minStock === null || minStock < 0) {
    return { ok: false, error: "Stock mínimo inválido" };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Producto no encontrado" };

  const { error } = await supabase
    .from("products")
    .update({
      min_stock: minStock,
      updated_by: ctx.userId,
    })
    .eq("id", productId)
    .eq("organization_id", ctx.organization.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/inventario/maestro");
  revalidatePath("/inventario/lista");
  revalidatePath("/compras/sugeridos");
  revalidatePath("/compras/solicitudes");
  return { ok: true, id: productId };
}

export async function softDeleteProductAction(
  productId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "inventario.maestro")) {
    return { ok: false, error: "Sin permiso" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({
      deleted_at: new Date().toISOString(),
      is_active: false,
      updated_by: ctx.userId,
    })
    .eq("id", productId)
    .eq("organization_id", ctx.organization.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/inventario/maestro");
  revalidatePath("/inventario/lista");
  revalidatePath("/compras/sugeridos");
  return { ok: true, id: productId };
}
