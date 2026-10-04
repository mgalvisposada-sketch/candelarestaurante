-- Nómina parte 1: nuevos valores de enum (deben quedar committed antes de usarlos)

ALTER TYPE public.employment_type ADD VALUE IF NOT EXISTS 'INDEFINIDO';
ALTER TYPE public.employment_type ADD VALUE IF NOT EXISTS 'TERMINO_FIJO';
ALTER TYPE public.employment_type ADD VALUE IF NOT EXISTS 'OBRA_LABOR';
ALTER TYPE public.employment_type ADD VALUE IF NOT EXISTS 'APRENDIZAJE';
ALTER TYPE public.employment_type ADD VALUE IF NOT EXISTS 'MEDIO_TIEMPO';

CREATE TYPE public.arl_risk_level AS ENUM ('I', 'II', 'III', 'IV', 'V');

CREATE TYPE public.employee_bonus_type AS ENUM ('FIJA', 'POR_META');
