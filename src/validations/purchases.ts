import { z } from "zod";

export const productCategorySchema = z.object({
  code: z.string().min(1, "Código obligatorio"),
  name: z.string().min(1, "Nombre obligatorio"),
  description: z.string().optional().nullable(),
});

export const productUnitSchema = z.object({
  code: z.string().min(1, "Código obligatorio"),
  name: z.string().min(1, "Nombre obligatorio"),
});

export const productSchema = z.object({
  category_id: z.string().uuid("Categoría inválida"),
  unit_id: z.string().uuid("Unidad inválida"),
  sku: z.string().optional().nullable(),
  name: z.string().min(1, "Nombre obligatorio"),
  min_stock: z.string().min(1, "Stock mínimo obligatorio"),
  current_stock: z.string().optional().nullable(),
  unit_cost: z.string().min(1, "Costo unitario obligatorio"),
  notes: z.string().optional().nullable(),
});

export const createPhysicalCountSchema = z.object({
  title: z.string().min(2, "Título obligatorio"),
  counted_at: z.string().min(1, "Fecha obligatoria"),
  location_label: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const physicalCountItemSchema = z.object({
  product_id: z.string().uuid("Producto inválido"),
  counted_qty: z.string().min(1, "Cantidad contada obligatoria"),
  notes: z.string().optional().nullable(),
});

export const rejectPhysicalCountSchema = z.object({
  rejection_reason: z.string().min(2, "Indique el motivo"),
});

export const supplierCategoryLinkSchema = z.object({
  supplier_id: z.string().uuid("Proveedor inválido"),
  category_id: z.string().uuid("Categoría inválida"),
  lead_time_days: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const supplierLeadTimeSchema = z.object({
  lead_time_days: z.string().optional().nullable(),
});

export const createPurchaseRequestSchema = z.object({
  title: z.string().min(2, "Título obligatorio"),
  notes: z.string().optional().nullable(),
  location_label: z.string().optional().nullable(),
  requested_at: z.string().min(1, "Fecha obligatoria"),
  needed_by: z.string().optional().nullable(),
});

export const purchaseRequestItemSchema = z.object({
  product_id: z.string().uuid("Producto inválido"),
  quantity_requested: z.string().min(1, "Cantidad obligatoria"),
  suggested_supplier_id: z.string().uuid().optional().nullable().or(z.literal("")),
  unit_cost_estimate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const updatePurchaseRequestItemSchema = z.object({
  quantity_requested: z.string().min(1, "Cantidad obligatoria"),
  suggested_supplier_id: z.string().uuid().optional().nullable().or(z.literal("")),
  unit_cost_estimate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const approvePurchaseItemSchema = z.object({
  item_id: z.string().uuid(),
  approved_supplier_id: z.string().uuid("Proveedor inválido"),
  quantity_approved: z.string().min(1, "Cantidad obligatoria"),
  expected_delivery_date: z.string().optional().nullable(),
  unit_cost_estimate: z.string().optional().nullable(),
});

export const receivePurchaseItemSchema = z.object({
  item_id: z.string().uuid(),
  quantity_received: z.string().min(1, "Cantidad recibida obligatoria"),
  unit_cost: z.string().min(1, "Costo de la entrega obligatorio"),
});

/** Producto que se agrega al pedido de un proveedor en recepción (queda pendiente). */
export const addSupplierPendingItemSchema = z.object({
  product_id: z.string().uuid("Producto inválido"),
  supplier_id: z.string().uuid("Proveedor inválido"),
  quantity: z.string().min(1, "Cantidad obligatoria"),
  unit_cost_estimate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

/** @deprecated usar addSupplierPendingItemSchema */
export const addReceivedExtraItemSchema = addSupplierPendingItemSchema;

export const rejectPurchaseRequestSchema = z.object({
  rejection_reason: z.string().min(2, "Indique el motivo"),
});

export const acceptInvoiceSchema = z.object({
  supplier_id: z.string().uuid("Proveedor inválido"),
  amount: z.string().min(1, "Monto obligatorio"),
  document_number: z.string().optional().nullable(),
  document_type: z.string().optional().nullable(),
  issue_date: z.string().optional().nullable(),
  due_date: z.string().optional().nullable(),
  concept: z.string().optional().nullable(),
  priority: z.enum(["CRITICA", "ALTA", "NORMAL", "BAJA"]).optional(),
});
