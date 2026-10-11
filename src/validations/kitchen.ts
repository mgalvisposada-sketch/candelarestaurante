import { z } from "zod";

export const kitchenItemKindSchema = z.enum([
  "MATERIA_PRIMA",
  "INSUMO_PREPARACION",
  "PREPARACION",
  "PRODUCTO_CARTA",
]);

export const createKitchenProductSchema = z.object({
  item_kind: z.enum(["INSUMO_PREPARACION", "PREPARACION", "PRODUCTO_CARTA"]),
  category_id: z.string().uuid("Categoría inválida"),
  unit_id: z.string().uuid("Unidad inválida"),
  sku: z.string().optional().nullable(),
  name: z.string().min(1, "Nombre obligatorio"),
  min_stock: z.string().optional().nullable(),
  /** Stock de apertura (restaurante ya operando). */
  current_stock: z.string().optional().nullable(),
  /** Costo unitario de apertura / inventario. */
  unit_cost: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const kitchenProductionInputSchema = z.object({
  product_id: z.string().uuid("Materia prima inválida"),
  quantity: z.string().min(1, "Cantidad obligatoria"),
  notes: z.string().optional().nullable(),
});

export const kitchenAprovechamientoSchema = z.object({
  product_id: z.string().uuid("Producto de aprovechamiento inválido"),
  quantity: z.string().min(1, "Cantidad obligatoria"),
  allocated_cost: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const completeInsumoProductionSchema = z.object({
  title: z.string().min(2, "Título obligatorio"),
  produced_at: z.string().min(1, "Fecha obligatoria"),
  output_product_id: z.string().uuid("Insumo destino inválido"),
  output_qty: z.string().min(1, "Cantidad útil obligatoria"),
  merma_qty: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const kitchenRecipeSchema = z.object({
  product_id: z.string().uuid("Producto inválido"),
  name: z.string().min(1, "Nombre obligatorio"),
  yield_qty: z.string().min(1, "Rendimiento obligatorio"),
  notes: z.string().optional().nullable(),
});

export const kitchenRecipeLineSchema = z.object({
  component_product_id: z.string().uuid("Componente inválido"),
  quantity: z.string().min(1, "Cantidad obligatoria"),
  notes: z.string().optional().nullable(),
});

export const completePreparacionProductionSchema = z.object({
  title: z.string().min(2, "Título obligatorio"),
  produced_at: z.string().min(1, "Fecha obligatoria"),
  output_product_id: z.string().uuid("Preparación inválida"),
  output_qty: z.string().min(1, "Cantidad producida obligatoria"),
  notes: z.string().optional().nullable(),
});

export const voidKitchenProductionSchema = z.object({
  production_id: z.string().uuid("Producción inválida"),
  reason: z.string().min(2, "Indique el motivo de anulación"),
});
