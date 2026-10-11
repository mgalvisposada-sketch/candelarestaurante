"use server";

import {
  applyProductionEntryCost,
  aprovechamientoUnitCost,
  computeKitchenProductionCost,
  computeRecipeBatchCost,
} from "@/lib/kitchen/cost";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  completeInsumoProductionSchema,
  completePreparacionProductionSchema,
  createKitchenProductSchema,
  kitchenRecipeLineSchema,
  kitchenRecipeSchema,
  voidKitchenProductionSchema,
} from "@/validations/kitchen";
import { revalidatePath } from "next/cache";

type ActionResult = { ok: boolean; error?: string; id?: string };

function emptyToNull(v: string | null | undefined) {
  if (v == null) return null;
  const t = String(v).trim();
  return t ? t : null;
}

function parseNumber(value: unknown, fallback?: number): number | null {
  if (value == null || value === "") {
    return fallback !== undefined ? fallback : null;
  }
  const n = Number(String(value).replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return n;
}

function revalidateKitchen(productionId?: string) {
  revalidatePath("/cocina");
  revalidatePath("/cocina/insumos");
  revalidatePath("/cocina/producciones");
  revalidatePath("/cocina/producciones/nueva");
  revalidatePath("/cocina/producciones/nueva-preparacion");
  revalidatePath("/cocina/preparaciones");
  revalidatePath("/cocina/carta");
  revalidatePath("/inventario/maestro");
  revalidatePath("/inventario/lista");
  if (productionId) {
    revalidatePath(`/cocina/producciones/${productionId}`);
  }
}

export async function createKitchenProductAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "cocina.maestro")) {
    return { ok: false, error: "Sin permiso" };
  }

  const parsed = createKitchenProductSchema.safeParse({
    item_kind: formData.get("item_kind"),
    category_id: formData.get("category_id"),
    unit_id: formData.get("unit_id"),
    sku: formData.get("sku"),
    name: formData.get("name"),
    min_stock: formData.get("min_stock"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const minStock = parseNumber(parsed.data.min_stock, 0);
  if (minStock === null || minStock < 0) {
    return { ok: false, error: "Stock mínimo inválido" };
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
      item_kind: parsed.data.item_kind,
      sku: emptyToNull(parsed.data.sku),
      name: parsed.data.name.trim(),
      unit: unitRow.code,
      min_stock: minStock,
      current_stock: 0,
      unit_cost: 0,
      notes: emptyToNull(parsed.data.notes),
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidateKitchen();
  return { ok: true, id: data.id };
}

type ProductionInputPayload = {
  product_id: string;
  quantity: number;
  notes?: string | null;
};

type ProductionAprovechamientoPayload = {
  product_id: string;
  quantity: number;
  allocated_cost: number;
  notes?: string | null;
};

/**
 * Completa una producción de Insumo Preparación:
 * consume materias primas, registra merma/aprovechamiento y entra stock al insumo.
 */
export async function completeInsumoProductionAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "cocina.produccion")) {
    return { ok: false, error: "Sin permiso" };
  }

  const header = completeInsumoProductionSchema.safeParse({
    title: formData.get("title"),
    produced_at: formData.get("produced_at"),
    output_product_id: formData.get("output_product_id"),
    output_qty: formData.get("output_qty"),
    merma_qty: formData.get("merma_qty"),
    notes: formData.get("notes"),
  });
  if (!header.success) {
    return { ok: false, error: header.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const outputQty = parseNumber(header.data.output_qty);
  if (outputQty === null || outputQty <= 0) {
    return { ok: false, error: "La cantidad útil debe ser mayor a 0" };
  }

  let mermaQtyManual: number | undefined;
  const mermaRaw = emptyToNull(header.data.merma_qty);
  if (mermaRaw != null) {
    const m = parseNumber(mermaRaw);
    if (m === null || m < 0) return { ok: false, error: "Merma inválida" };
    mermaQtyManual = m;
  }

  let inputs: ProductionInputPayload[] = [];
  let aprovechamientos: ProductionAprovechamientoPayload[] = [];
  try {
    inputs = JSON.parse(String(formData.get("inputs_json") || "[]"));
    aprovechamientos = JSON.parse(
      String(formData.get("aprovechamientos_json") || "[]"),
    );
  } catch {
    return { ok: false, error: "Líneas de producción inválidas" };
  }

  if (!Array.isArray(inputs) || inputs.length === 0) {
    return { ok: false, error: "Agregue al menos una materia prima" };
  }

  const normalizedInputs: ProductionInputPayload[] = [];
  for (const line of inputs) {
    const qty = Number(line.quantity);
    if (!line.product_id || !Number.isFinite(qty) || qty <= 0) {
      return { ok: false, error: "Hay una entrada con cantidad inválida" };
    }
    normalizedInputs.push({
      product_id: line.product_id,
      quantity: qty,
      notes: line.notes ?? null,
    });
  }

  const normalizedAprov: ProductionAprovechamientoPayload[] = [];
  for (const line of aprovechamientos ?? []) {
    if (!line?.product_id) continue;
    const qty = Number(line.quantity);
    const allocated = Number(line.allocated_cost ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) {
      return { ok: false, error: "Aprovechamiento con cantidad inválida" };
    }
    if (!Number.isFinite(allocated) || allocated < 0) {
      return { ok: false, error: "Costo de aprovechamiento inválido" };
    }
    if (line.product_id === header.data.output_product_id) {
      return {
        ok: false,
        error: "El aprovechamiento no puede ser el mismo insumo principal",
      };
    }
    normalizedAprov.push({
      product_id: line.product_id,
      quantity: qty,
      allocated_cost: allocated,
      notes: line.notes ?? null,
    });
  }

  const supabase = await createClient();
  const orgId = ctx.organization.id;

  const { data: outputProduct } = await supabase
    .from("products")
    .select("id, name, item_kind, current_stock, unit_cost, unit")
    .eq("id", header.data.output_product_id)
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!outputProduct) return { ok: false, error: "Insumo destino no encontrado" };
  if (outputProduct.item_kind !== "INSUMO_PREPARACION") {
    return {
      ok: false,
      error: "El destino debe ser un Insumo preparación",
    };
  }

  const inputIds = [...new Set(normalizedInputs.map((i) => i.product_id))];
  const { data: inputProducts } = await supabase
    .from("products")
    .select("id, name, item_kind, current_stock, unit_cost, unit")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .in("id", inputIds);

  const inputMap = new Map((inputProducts ?? []).map((p) => [p.id, p]));
  for (const line of normalizedInputs) {
    const p = inputMap.get(line.product_id);
    if (!p) return { ok: false, error: "Materia prima no encontrada" };
    if (p.item_kind !== "MATERIA_PRIMA") {
      return {
        ok: false,
        error: `"${p.name}" no es materia prima. Use solo inventario de compras.`,
      };
    }
    const stock = Number(p.current_stock || 0);
    if (line.quantity > stock) {
      return {
        ok: false,
        error: `Stock insuficiente de ${p.name} (disponible ${stock} ${p.unit})`,
      };
    }
  }

  if (normalizedAprov.length > 0) {
    const aprovIds = [...new Set(normalizedAprov.map((a) => a.product_id))];
    const { data: aprovProducts } = await supabase
      .from("products")
      .select("id, name, item_kind")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .in("id", aprovIds);
    const aprovMap = new Map((aprovProducts ?? []).map((p) => [p.id, p]));
    for (const line of normalizedAprov) {
      const p = aprovMap.get(line.product_id);
      if (!p) return { ok: false, error: "Producto de aprovechamiento no encontrado" };
      if (
        p.item_kind !== "INSUMO_PREPARACION" &&
        p.item_kind !== "PREPARACION"
      ) {
        return {
          ok: false,
          error: `El aprovechamiento "${p.name}" debe ser insumo o preparación`,
        };
      }
    }
  }

  const cost = computeKitchenProductionCost({
    inputs: normalizedInputs.map((line) => {
      const p = inputMap.get(line.product_id)!;
      return {
        quantity: line.quantity,
        unitCost: Number(p.unit_cost || 0),
      };
    }),
    outputQty,
    aprovechamientos: normalizedAprov.map((a) => ({
      quantity: a.quantity,
      allocatedCost: a.allocated_cost,
    })),
    mermaQty: mermaQtyManual,
  });

  const { data: production, error: prodError } = await supabase
    .from("kitchen_productions")
    .insert({
      organization_id: orgId,
      production_type: "INSUMO_PREPARACION",
      status: "COMPLETADA",
      title: header.data.title.trim(),
      produced_at: header.data.produced_at,
      output_product_id: header.data.output_product_id,
      output_qty: outputQty,
      merma_qty: cost.mermaQty,
      input_total_qty: cost.inputTotalQty,
      input_total_cost: cost.inputTotalCost,
      aprovechamiento_total_cost: cost.aprovechamientoTotalCost,
      output_total_cost: cost.outputTotalCost,
      output_unit_cost: cost.outputUnitCost,
      yield_pct: cost.yieldPct,
      merma_pct: cost.mermaPct,
      notes: emptyToNull(header.data.notes),
      completed_at: new Date().toISOString(),
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (prodError || !production) {
    return { ok: false, error: prodError?.message ?? "No se pudo crear la producción" };
  }

  const productionId = production.id;

  const { error: inputsError } = await supabase
    .from("kitchen_production_inputs")
    .insert(
      normalizedInputs.map((line) => {
        const p = inputMap.get(line.product_id)!;
        const unitCost = Number(p.unit_cost || 0);
        return {
          organization_id: orgId,
          production_id: productionId,
          product_id: line.product_id,
          quantity: line.quantity,
          unit_cost: unitCost,
          line_cost: line.quantity * unitCost,
          notes: emptyToNull(line.notes),
          created_by: ctx.userId,
        };
      }),
    );
  if (inputsError) {
    return { ok: false, error: inputsError.message };
  }

  const outputRows = [
    {
      organization_id: orgId,
      production_id: productionId,
      product_id: header.data.output_product_id,
      output_role: "PRINCIPAL" as const,
      quantity: outputQty,
      allocated_cost: cost.outputTotalCost,
      unit_cost: cost.outputUnitCost,
      notes: null as string | null,
      created_by: ctx.userId,
    },
    ...normalizedAprov.map((a) => ({
      organization_id: orgId,
      production_id: productionId,
      product_id: a.product_id,
      output_role: "APROVECHAMIENTO" as const,
      quantity: a.quantity,
      allocated_cost: a.allocated_cost,
      unit_cost: aprovechamientoUnitCost(a.quantity, a.allocated_cost),
      notes: emptyToNull(a.notes),
      created_by: ctx.userId,
    })),
  ];

  const { error: outputsError } = await supabase
    .from("kitchen_production_outputs")
    .insert(outputRows);
  if (outputsError) {
    return { ok: false, error: outputsError.message };
  }

  // Consumir materias primas
  for (const line of normalizedInputs) {
    const p = inputMap.get(line.product_id)!;
    const stockBefore = Number(p.current_stock || 0);
    const unitCost = Number(p.unit_cost || 0);
    const stockAfter = stockBefore - line.quantity;

    const { error: updError } = await supabase
      .from("products")
      .update({
        current_stock: stockAfter,
        updated_by: ctx.userId,
      })
      .eq("id", p.id)
      .eq("organization_id", orgId);
    if (updError) return { ok: false, error: updError.message };

    const { error: movError } = await supabase.from("inventory_movements").insert({
      organization_id: orgId,
      product_id: p.id,
      movement_type: "CONSUMO",
      quantity: -line.quantity,
      unit_cost: unitCost,
      stock_before: stockBefore,
      stock_after: stockAfter,
      unit_cost_before: unitCost,
      unit_cost_after: unitCost,
      reference_type: "kitchen_productions",
      reference_id: productionId,
      notes: `Producción insumo: ${header.data.title.trim()}`,
      created_by: ctx.userId,
    });
    if (movError) return { ok: false, error: movError.message };
  }

  // Entrada principal + aprovechamientos
  const entryProducts = [
    {
      product_id: header.data.output_product_id,
      quantity: outputQty,
      unit_cost: cost.outputUnitCost,
      label: "principal",
    },
    ...normalizedAprov.map((a) => ({
      product_id: a.product_id,
      quantity: a.quantity,
      unit_cost: aprovechamientoUnitCost(a.quantity, a.allocated_cost),
      label: "aprovechamiento",
    })),
  ];

  for (const entry of entryProducts) {
    const { data: prod } = await supabase
      .from("products")
      .select("id, current_stock, unit_cost")
      .eq("id", entry.product_id)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!prod) return { ok: false, error: "Producto de salida no encontrado al actualizar stock" };

    const stockBefore = Number(prod.current_stock || 0);
    const costBefore = Number(prod.unit_cost || 0);
    const costAfter = applyProductionEntryCost(
      stockBefore,
      costBefore,
      entry.quantity,
      entry.unit_cost,
    );
    const stockAfter = stockBefore + entry.quantity;

    const { error: updError } = await supabase
      .from("products")
      .update({
        current_stock: stockAfter,
        unit_cost: costAfter,
        updated_by: ctx.userId,
      })
      .eq("id", entry.product_id)
      .eq("organization_id", orgId);
    if (updError) return { ok: false, error: updError.message };

    const { error: movError } = await supabase.from("inventory_movements").insert({
      organization_id: orgId,
      product_id: entry.product_id,
      movement_type: "PRODUCCION_ENTRADA",
      quantity: entry.quantity,
      unit_cost: entry.unit_cost,
      stock_before: stockBefore,
      stock_after: stockAfter,
      unit_cost_before: costBefore,
      unit_cost_after: costAfter,
      reference_type: "kitchen_productions",
      reference_id: productionId,
      notes: `Producción ${entry.label}: ${header.data.title.trim()}`,
      created_by: ctx.userId,
    });
    if (movError) return { ok: false, error: movError.message };
  }

  revalidateKitchen(productionId);
  return { ok: true, id: productionId };
}

export async function upsertKitchenRecipeAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "cocina.recetas")) {
    return { ok: false, error: "Sin permiso" };
  }

  const parsed = kitchenRecipeSchema.safeParse({
    product_id: formData.get("product_id"),
    name: formData.get("name"),
    yield_qty: formData.get("yield_qty"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const yieldQty = parseNumber(parsed.data.yield_qty);
  if (yieldQty === null || yieldQty <= 0) {
    return { ok: false, error: "Rendimiento inválido" };
  }

  let lines: Array<{
    component_product_id: string;
    quantity: number;
    notes?: string | null;
  }> = [];
  try {
    const raw = JSON.parse(String(formData.get("lines_json") || "[]"));
    if (!Array.isArray(raw) || raw.length === 0) {
      return { ok: false, error: "Agregue al menos un componente" };
    }
    for (const row of raw) {
      const lineParsed = kitchenRecipeLineSchema.safeParse({
        component_product_id: row.component_product_id,
        quantity: String(row.quantity ?? ""),
        notes: row.notes ?? null,
      });
      if (!lineParsed.success) {
        return {
          ok: false,
          error: lineParsed.error.issues[0]?.message ?? "Línea inválida",
        };
      }
      const qty = parseNumber(lineParsed.data.quantity);
      if (qty === null || qty <= 0) {
        return { ok: false, error: "Cantidad de componente inválida" };
      }
      lines.push({
        component_product_id: lineParsed.data.component_product_id,
        quantity: qty,
        notes: emptyToNull(lineParsed.data.notes),
      });
    }
  } catch {
    return { ok: false, error: "Líneas de receta inválidas" };
  }

  const supabase = await createClient();
  const orgId = ctx.organization.id;

  const { data: product } = await supabase
    .from("products")
    .select("id, item_kind, name")
    .eq("id", parsed.data.product_id)
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!product) return { ok: false, error: "Producto no encontrado" };
  if (
    product.item_kind !== "PREPARACION" &&
    product.item_kind !== "PRODUCTO_CARTA"
  ) {
    return {
      ok: false,
      error: "La receta solo aplica a Preparaciones o Productos de carta",
    };
  }

  const componentIds = [...new Set(lines.map((l) => l.component_product_id))];
  const { data: components } = await supabase
    .from("products")
    .select("id, item_kind, name")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .in("id", componentIds);

  const componentMap = new Map((components ?? []).map((c) => [c.id, c]));
  for (const line of lines) {
    const c = componentMap.get(line.component_product_id);
    if (!c) return { ok: false, error: "Componente no encontrado" };
    if (c.id === product.id) {
      return { ok: false, error: "Una receta no puede incluirse a sí misma" };
    }
    const allowed =
      c.item_kind === "MATERIA_PRIMA" ||
      c.item_kind === "INSUMO_PREPARACION" ||
      (product.item_kind === "PRODUCTO_CARTA" && c.item_kind === "PREPARACION") ||
      (product.item_kind === "PREPARACION" && c.item_kind === "PREPARACION");
    if (!allowed) {
      return {
        ok: false,
        error: `"${c.name}" no es un componente válido para esta receta`,
      };
    }
  }

  // Desactivar receta activa previa del mismo producto
  await supabase
    .from("kitchen_recipes")
    .update({
      is_active: false,
      updated_by: ctx.userId,
      deleted_at: new Date().toISOString(),
    })
    .eq("organization_id", orgId)
    .eq("product_id", product.id)
    .is("deleted_at", null)
    .eq("is_active", true);

  const { data: recipe, error: recipeError } = await supabase
    .from("kitchen_recipes")
    .insert({
      organization_id: orgId,
      product_id: product.id,
      name: parsed.data.name.trim(),
      yield_qty: yieldQty,
      notes: emptyToNull(parsed.data.notes),
      is_active: true,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (recipeError || !recipe) {
    return { ok: false, error: recipeError?.message ?? "No se pudo guardar la receta" };
  }

  const { error: linesError } = await supabase.from("kitchen_recipe_lines").insert(
    lines.map((line, idx) => ({
      organization_id: orgId,
      recipe_id: recipe.id,
      component_product_id: line.component_product_id,
      quantity: line.quantity,
      sort_order: idx,
      notes: emptyToNull(line.notes),
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })),
  );
  if (linesError) return { ok: false, error: linesError.message };

  revalidateKitchen();
  return { ok: true, id: recipe.id };
}

/**
 * Produce una preparación a partir de su receta activa:
 * escala componentes al rendimiento pedido, consume stock y entra el batch.
 */
export async function completePreparacionProductionAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "cocina.produccion")) {
    return { ok: false, error: "Sin permiso" };
  }

  const header = completePreparacionProductionSchema.safeParse({
    title: formData.get("title"),
    produced_at: formData.get("produced_at"),
    output_product_id: formData.get("output_product_id"),
    output_qty: formData.get("output_qty"),
    notes: formData.get("notes"),
  });
  if (!header.success) {
    return { ok: false, error: header.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const outputQty = parseNumber(header.data.output_qty);
  if (outputQty === null || outputQty <= 0) {
    return { ok: false, error: "La cantidad producida debe ser mayor a 0" };
  }

  const supabase = await createClient();
  const orgId = ctx.organization.id;

  const { data: outputProduct } = await supabase
    .from("products")
    .select("id, name, item_kind, current_stock, unit_cost, unit")
    .eq("id", header.data.output_product_id)
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!outputProduct) return { ok: false, error: "Preparación no encontrada" };
  if (outputProduct.item_kind !== "PREPARACION") {
    return { ok: false, error: "El destino debe ser una Preparación" };
  }

  const { data: recipe } = await supabase
    .from("kitchen_recipes")
    .select("id, name, yield_qty")
    .eq("organization_id", orgId)
    .eq("product_id", outputProduct.id)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (!recipe) {
    return {
      ok: false,
      error: "Defina una receta activa antes de producir esta preparación",
    };
  }

  const recipeYield = Number(recipe.yield_qty || 0);
  if (!(recipeYield > 0)) {
    return { ok: false, error: "La receta no tiene rendimiento válido" };
  }

  const { data: recipeLines } = await supabase
    .from("kitchen_recipe_lines")
    .select("component_product_id, quantity")
    .eq("recipe_id", recipe.id)
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .order("sort_order");

  if (!recipeLines?.length) {
    return { ok: false, error: "La receta no tiene componentes" };
  }

  const componentIds = [
    ...new Set(recipeLines.map((l) => l.component_product_id)),
  ];
  const { data: components } = await supabase
    .from("products")
    .select("id, name, item_kind, current_stock, unit_cost, unit")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .in("id", componentIds);

  const componentMap = new Map((components ?? []).map((c) => [c.id, c]));
  const batch = computeRecipeBatchCost({
    recipeLines: recipeLines.map((l) => {
      const c = componentMap.get(l.component_product_id);
      return {
        quantity: Number(l.quantity || 0),
        unitCost: Number(c?.unit_cost || 0),
      };
    }),
    recipeYieldQty: recipeYield,
    outputQty,
  });

  for (let i = 0; i < recipeLines.length; i++) {
    const line = recipeLines[i];
    const scaled = batch.scaledLines[i];
    const c = componentMap.get(line.component_product_id);
    if (!c) {
      return { ok: false, error: "Componente de receta no encontrado" };
    }
    if (c.id === outputProduct.id) {
      return { ok: false, error: "La preparación no puede consumirse a sí misma" };
    }
    const allowed =
      c.item_kind === "MATERIA_PRIMA" ||
      c.item_kind === "INSUMO_PREPARACION" ||
      c.item_kind === "PREPARACION";
    if (!allowed) {
      return {
        ok: false,
        error: `"${c.name}" no es un componente consumible válido`,
      };
    }
    const stock = Number(c.current_stock || 0);
    if (scaled.scaledQuantity > stock) {
      return {
        ok: false,
        error: `Stock insuficiente de ${c.name} (necesita ${scaled.scaledQuantity} ${c.unit}, hay ${stock})`,
      };
    }
  }

  const { data: production, error: prodError } = await supabase
    .from("kitchen_productions")
    .insert({
      organization_id: orgId,
      production_type: "PREPARACION",
      status: "COMPLETADA",
      title: header.data.title.trim(),
      produced_at: header.data.produced_at,
      output_product_id: outputProduct.id,
      recipe_id: recipe.id,
      output_qty: outputQty,
      merma_qty: 0,
      input_total_qty: batch.scaledLines.reduce(
        (acc, l) => acc + l.scaledQuantity,
        0,
      ),
      input_total_cost: batch.inputTotalCost,
      aprovechamiento_total_cost: 0,
      output_total_cost: batch.inputTotalCost,
      output_unit_cost: batch.outputUnitCost,
      yield_pct: 100,
      merma_pct: 0,
      notes: emptyToNull(header.data.notes),
      completed_at: new Date().toISOString(),
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (prodError || !production) {
    return {
      ok: false,
      error: prodError?.message ?? "No se pudo crear la producción",
    };
  }

  const productionId = production.id;

  const { error: inputsError } = await supabase
    .from("kitchen_production_inputs")
    .insert(
      recipeLines.map((line, i) => {
        const c = componentMap.get(line.component_product_id)!;
        const qty = batch.scaledLines[i].scaledQuantity;
        const unitCost = Number(c.unit_cost || 0);
        return {
          organization_id: orgId,
          production_id: productionId,
          product_id: c.id,
          quantity: qty,
          unit_cost: unitCost,
          line_cost: qty * unitCost,
          notes: `Receta ${recipe.name} ×${batch.scaleFactor.toFixed(3)}`,
          created_by: ctx.userId,
        };
      }),
    );
  if (inputsError) return { ok: false, error: inputsError.message };

  const { error: outputsError } = await supabase
    .from("kitchen_production_outputs")
    .insert({
      organization_id: orgId,
      production_id: productionId,
      product_id: outputProduct.id,
      output_role: "PRINCIPAL",
      quantity: outputQty,
      allocated_cost: batch.inputTotalCost,
      unit_cost: batch.outputUnitCost,
      created_by: ctx.userId,
    });
  if (outputsError) return { ok: false, error: outputsError.message };

  for (let i = 0; i < recipeLines.length; i++) {
    const c = componentMap.get(recipeLines[i].component_product_id)!;
    const qty = batch.scaledLines[i].scaledQuantity;
    const stockBefore = Number(c.current_stock || 0);
    const unitCost = Number(c.unit_cost || 0);
    const stockAfter = stockBefore - qty;

    const { error: updError } = await supabase
      .from("products")
      .update({
        current_stock: stockAfter,
        updated_by: ctx.userId,
      })
      .eq("id", c.id)
      .eq("organization_id", orgId);
    if (updError) return { ok: false, error: updError.message };

    // Actualizar mapa local por si el mismo componente aparece más de una vez
    c.current_stock = stockAfter;

    const { error: movError } = await supabase.from("inventory_movements").insert({
      organization_id: orgId,
      product_id: c.id,
      movement_type: "CONSUMO",
      quantity: -qty,
      unit_cost: unitCost,
      stock_before: stockBefore,
      stock_after: stockAfter,
      unit_cost_before: unitCost,
      unit_cost_after: unitCost,
      reference_type: "kitchen_productions",
      reference_id: productionId,
      notes: `Producción preparación: ${header.data.title.trim()}`,
      created_by: ctx.userId,
    });
    if (movError) return { ok: false, error: movError.message };
  }

  const stockBefore = Number(outputProduct.current_stock || 0);
  const costBefore = Number(outputProduct.unit_cost || 0);
  const costAfter = applyProductionEntryCost(
    stockBefore,
    costBefore,
    outputQty,
    batch.outputUnitCost,
  );
  const stockAfter = stockBefore + outputQty;

  const { error: outUpdError } = await supabase
    .from("products")
    .update({
      current_stock: stockAfter,
      unit_cost: costAfter,
      updated_by: ctx.userId,
    })
    .eq("id", outputProduct.id)
    .eq("organization_id", orgId);
  if (outUpdError) return { ok: false, error: outUpdError.message };

  const { error: outMovError } = await supabase.from("inventory_movements").insert({
    organization_id: orgId,
    product_id: outputProduct.id,
    movement_type: "PRODUCCION_ENTRADA",
    quantity: outputQty,
    unit_cost: batch.outputUnitCost,
    stock_before: stockBefore,
    stock_after: stockAfter,
    unit_cost_before: costBefore,
    unit_cost_after: costAfter,
    reference_type: "kitchen_productions",
    reference_id: productionId,
    notes: `Producción preparación: ${header.data.title.trim()}`,
    created_by: ctx.userId,
  });
  if (outMovError) return { ok: false, error: outMovError.message };

  revalidateKitchen(productionId);
  return { ok: true, id: productionId };
}

/**
 * Anula una producción completada y revierte stocks de entradas/salidas.
 */
export async function voidKitchenProductionAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };
  if (!ctxCanAccess(ctx, "cocina.produccion")) {
    return { ok: false, error: "Sin permiso" };
  }

  const parsed = voidKitchenProductionSchema.safeParse({
    production_id: formData.get("production_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const orgId = ctx.organization.id;
  const productionId = parsed.data.production_id;

  const { data: production } = await supabase
    .from("kitchen_productions")
    .select("id, status, title, notes")
    .eq("id", productionId)
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!production) return { ok: false, error: "Producción no encontrada" };
  if (production.status !== "COMPLETADA") {
    return { ok: false, error: "Solo se pueden anular producciones completadas" };
  }

  const [{ data: inputs }, { data: outputs }] = await Promise.all([
    supabase
      .from("kitchen_production_inputs")
      .select("id, product_id, quantity, unit_cost")
      .eq("production_id", productionId)
      .eq("organization_id", orgId),
    supabase
      .from("kitchen_production_outputs")
      .select("id, product_id, quantity, unit_cost, output_role")
      .eq("production_id", productionId)
      .eq("organization_id", orgId),
  ]);

  // Primero validar que las salidas aún tengan stock suficiente para restar
  for (const out of outputs ?? []) {
    const { data: prod } = await supabase
      .from("products")
      .select("id, name, current_stock, unit, unit_cost")
      .eq("id", out.product_id)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!prod) return { ok: false, error: "Producto de salida no encontrado" };
    const stock = Number(prod.current_stock || 0);
    const qty = Number(out.quantity || 0);
    if (qty > stock) {
      return {
        ok: false,
        error: `No se puede anular: ${prod.name} ya no tiene stock suficiente (hay ${stock} ${prod.unit}, se intentarían restar ${qty})`,
      };
    }
  }

  // Revertir salidas (quitar lo producido)
  for (const out of outputs ?? []) {
    const { data: prod } = await supabase
      .from("products")
      .select("id, current_stock, unit_cost")
      .eq("id", out.product_id)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!prod) continue;

    const stockBefore = Number(prod.current_stock || 0);
    const costBefore = Number(prod.unit_cost || 0);
    const qty = Number(out.quantity || 0);
    const stockAfter = stockBefore - qty;
    const costAfter = stockAfter <= 0 ? 0 : costBefore;

    const { error: updError } = await supabase
      .from("products")
      .update({
        current_stock: Math.max(0, stockAfter),
        unit_cost: costAfter,
        updated_by: ctx.userId,
      })
      .eq("id", prod.id)
      .eq("organization_id", orgId);
    if (updError) return { ok: false, error: updError.message };

    const { error: movError } = await supabase.from("inventory_movements").insert({
      organization_id: orgId,
      product_id: prod.id,
      movement_type: "AJUSTE_MANUAL",
      quantity: -qty,
      unit_cost: Number(out.unit_cost || 0),
      stock_before: stockBefore,
      stock_after: Math.max(0, stockAfter),
      unit_cost_before: costBefore,
      unit_cost_after: costAfter,
      reference_type: "kitchen_productions",
      reference_id: productionId,
      notes: `Anulación producción: ${parsed.data.reason.trim()}`,
      created_by: ctx.userId,
    });
    if (movError) return { ok: false, error: movError.message };
  }

  // Devolver insumos consumidos
  for (const inp of inputs ?? []) {
    const { data: prod } = await supabase
      .from("products")
      .select("id, current_stock, unit_cost")
      .eq("id", inp.product_id)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!prod) continue;

    const stockBefore = Number(prod.current_stock || 0);
    const costBefore = Number(prod.unit_cost || 0);
    const qty = Number(inp.quantity || 0);
    const stockAfter = stockBefore + qty;

    const { error: updError } = await supabase
      .from("products")
      .update({
        current_stock: stockAfter,
        updated_by: ctx.userId,
      })
      .eq("id", prod.id)
      .eq("organization_id", orgId);
    if (updError) return { ok: false, error: updError.message };

    const { error: movError } = await supabase.from("inventory_movements").insert({
      organization_id: orgId,
      product_id: prod.id,
      movement_type: "AJUSTE_MANUAL",
      quantity: qty,
      unit_cost: Number(inp.unit_cost || 0),
      stock_before: stockBefore,
      stock_after: stockAfter,
      unit_cost_before: costBefore,
      unit_cost_after: costBefore,
      reference_type: "kitchen_productions",
      reference_id: productionId,
      notes: `Anulación producción (devolución): ${parsed.data.reason.trim()}`,
      created_by: ctx.userId,
    });
    if (movError) return { ok: false, error: movError.message };
  }

  const prevNotes = production.notes ? `${production.notes}\n` : "";
  const { error: statusError } = await supabase
    .from("kitchen_productions")
    .update({
      status: "ANULADA",
      notes: `${prevNotes}ANULADA: ${parsed.data.reason.trim()}`,
      updated_by: ctx.userId,
    })
    .eq("id", productionId)
    .eq("organization_id", orgId);
  if (statusError) return { ok: false, error: statusError.message };

  revalidateKitchen(productionId);
  return { ok: true, id: productionId };
}
