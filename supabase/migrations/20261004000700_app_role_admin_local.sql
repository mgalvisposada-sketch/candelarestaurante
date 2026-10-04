-- Rol operativo del local: reportar novedades (permisos de app + RLS en siguiente migración).
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'ADMIN_LOCAL';
