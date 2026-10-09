-- Rol Tesorería (compras + cola de pago). Debe ir en migración propia:
-- Postgres no permite usar un enum nuevo en la misma transacción que lo crea.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'TESORERIA';
