import { z } from "zod";

export const productCategorySchema = z.object({
  code: z.string().min(1, "Código obligatorio"),
  name: z.string().min(1, "Nombre obligatorio"),
  description: z.string().optional().nullable(),
});

export const productSchema = z.object({
  category_id: z.string().uuid("Categoría inválida"),
  sku: z.string().optional().nullable(),
  name: z.string().min(1, "Nombre obligatorio"),
  unit: z.string().min(1, "Unidad obligatoria"),
  min_stock: z.string().optional().nullable(),
  current_stock: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
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
});

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
});
