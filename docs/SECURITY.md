# CANDELA ADMIN — Seguridad

## Principios

1. **Nunca confiar solo en el frontend.** Autorización en DB (RLS), server y UI.
2. **Multi-tenant estricto** por `organization_id`.
3. **Mínimo privilegio:** service role solo server-side y solo cuando sea estrictamente necesario.
4. **Secretos fuera del repo:** `.env` local / Vercel / Supabase; nunca `service_role` en Git.
5. **Evidencia y auditoría** de operaciones sensibles.
6. **Documentos privados:** buckets no públicos + signed URLs.

## Autenticación

- Supabase Auth (email/password inicial; extensible a MFA/SSO después).
- Sesión SSR con cookies vía cliente Supabase para Next.js App Router.
- Middleware que protege rutas autenticadas y redirige a login.

## Autorización (RBAC)

Roles: `SUPER_ADMIN`, `GESTION`, `SOCIO`, `CONTADOR`, `LECTURA`.

Matriz resumida MVP 1:

| Recurso | SUPER_ADMIN | GESTION | SOCIO | CONTADOR | LECTURA |
|---------|:-----------:|:-------:|:-----:|:--------:|:-------:|
| Empresa | CRUD | RU | R* | R* | R* |
| Socios | CRUD | CRUD | R | R* | R* |
| Empalme | CRUD + cierre | CRUD + cierre | R | R* | R* |
| Bancos / saldos | CRUD | CRUD | R | R* | R* |
| Proveedores / CxP | CRUD | CRUD | R | R* | R* |
| Préstamos / capital | CRUD | CRUD | R | R* | R* |
| Documentos | CRUD | CRUD | R autorizados | R función | R autorizados |
| Config / usuarios | CRUD | R limitado | — | — | — |
| Audit logs | R | R | — | R* | — |

\* = según política de documentos/campos autorizados; afinar en políticas RLS por fase.

Implementación:

- Rol en `organization_users.role`.
- Helpers SQL: `auth.uid()`, `is_org_member(org_id)`, `has_org_role(org_id, roles[])`.
- Policies por tabla: `SELECT/INSERT/UPDATE` condicionados; `DELETE` físico deshabilitado o restringido a soft delete.

## Row Level Security

Obligatorio en **todas** las tablas sensibles.

Patrón base:

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "<table>_select_member"
  ON <table> FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "<table>_write_gestion"
  ON <table> FOR ALL
  USING (has_org_role(organization_id, ARRAY['SUPER_ADMIN','GESTION']::app_role[]))
  WITH CHECK (has_org_role(organization_id, ARRAY['SUPER_ADMIN','GESTION']::app_role[]));
```

Ajustar por rol (SOCIO/CONTADOR/LECTURA) con policies de solo lectura donde corresponda.

## Storage

- Bucket privado: `documents` (o `org-documents`).
- Path sugerido: `{organization_id}/{entity_type}/{entity_id}/{filename}`.
- Policies Storage alineadas a membresía de organización.
- Lectura mediante **signed URLs** de TTL corto.
- Validar MIME/tamaño en server antes de subir.

## Validación de inputs

- Schemas Zod (u equivalente) en Server Actions / Route Handlers.
- Validar montos, fechas, enums, UUIDs, longitudes.
- Rechazar payloads con campos no permitidos (allowlist).

## Auditoría

Tabla `audit_logs` (append-only desde la app / triggers):

- `user_id`, `action`, `entity`, `entity_id`, `organization_id`
- `old_values` / `new_values` (jsonb)
- `created_at`

Auditar como mínimo: creación, modificación, validación, anulación, cierre de empalme, pagos, préstamos, cambios de presupuesto.

## Soft delete

No eliminar físicamente:

- gastos pagados
- CxP / pagos
- préstamos / desembolsos / pagos
- snapshots de empalme
- obligaciones pagadas
- movimientos bancarios conciliados

Usar `deleted_at` + motivo / usuario cuando aplique.

## Secretos y configuración

| Variable | Dónde vive |
|----------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Cliente + server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente + server |
| `SUPABASE_SERVICE_ROLE_KEY` | **Solo server** |
| Otras API keys | Server / Vercel env |

- `.env` en `.gitignore`
- Publicar `.env.example` sin valores reales
- Rotar keys si se filtran

## Superficie de ataque a minimizar

- No exponer service role al browser.
- No buckets públicos para documentos financieros.
- No IDs de otras orgs en URLs sin chequear membresía.
- Rate limiting / protección login vía Supabase + Vercel según fase.
- PDFs generados en server con datos ya autorizados.

## Checklist de seguridad por feature

- [ ] ¿Tiene `organization_id`?
- [ ] ¿RLS habilitado y policies revisadas?
- [ ] ¿Mutación solo vía server con schema?
- [ ] ¿Roles correctos en UI y server?
- [ ] ¿Documentos en bucket privado?
- [ ] ¿Audit log si es operación sensible?
- [ ] ¿Soft delete en vez de hard delete?
- [ ] ¿Sin secretos en código/commits?
