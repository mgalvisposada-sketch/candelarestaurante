-- Distingue proveedores de insumos (compras) vs administrativos/servicios

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS is_purchase_supplier boolean NOT NULL DEFAULT false;

-- Quienes ya tienen categorías de producto quedan marcados como de insumos
UPDATE public.suppliers s
SET is_purchase_supplier = true
WHERE s.deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.supplier_product_categories spc
    WHERE spc.supplier_id = s.id
      AND spc.organization_id = s.organization_id
      AND spc.deleted_at IS NULL
      AND spc.is_active = true
  );
