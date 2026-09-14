# Contribuir a Candela Admin

## Flujo

1. Crear rama `feature/<nombre-corto>` desde `main`.
2. Implementar cambios acotados (una capacidad clara por PR).
3. Si toca schema: agregar migración SQL en `supabase/migrations/`.
4. Abrir Pull Request hacia `main`.
5. CI debe pasar: lint, typecheck, test, build.
6. Vercel Preview valida la UI antes de merge.

## Reglas de producto

Antes de agregar una feature, responder:

> ¿Es administración financiera/corporativa o es operación del restaurante?

Si es operación → **FILIPO**, no aquí.

## Calidad

- UI en español, montos COP, fechas DD/MM/YYYY.
- Validar inputs con schemas en server.
- No hard delete de registros financieros; soft delete + auditoría.
- No commitear `.env`, service role keys ni contraseñas.
- Preferir pruebas unitarias en CxP, préstamos, empalme y dinero.

## Revisión de PR

Incluir:

- Resumen del cambio (por qué).
- Cómo probar.
- Impacto en migraciones / RLS / Storage si aplica.
