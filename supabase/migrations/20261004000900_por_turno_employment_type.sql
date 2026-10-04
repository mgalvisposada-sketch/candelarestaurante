-- Prestador pagado por día/turno (sin vinculación laboral CST).
ALTER TYPE public.employment_type ADD VALUE IF NOT EXISTS 'POR_TURNO';
