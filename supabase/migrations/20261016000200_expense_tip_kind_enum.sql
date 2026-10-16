-- Nuevo tipo de gasto: liquidación de propina (valor enum; constraints en migraciones siguientes).
ALTER TYPE public.expense_kind ADD VALUE IF NOT EXISTS 'LIQUIDACION_PROPINA';
