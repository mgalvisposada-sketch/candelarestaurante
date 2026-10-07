-- Proveedores de gastos operativos (opex), independientes de insumos/compras.
-- Un mismo proveedor puede ser de insumos, de gastos, ambos o ninguno.

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS is_expense_supplier boolean NOT NULL DEFAULT false;

-- Quienes no estaban marcados como insumos suelen ser servicios (arriendo, gas, etc.)
UPDATE public.suppliers
SET is_expense_supplier = true
WHERE deleted_at IS NULL
  AND is_active = true
  AND is_purchase_supplier = false;
