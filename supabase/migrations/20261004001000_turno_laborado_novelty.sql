-- Novedad para registrar un día/turno laborado de prestador POR_TURNO.
ALTER TYPE public.shift_novelty_type ADD VALUE IF NOT EXISTS 'TURNO_LABORADO';
