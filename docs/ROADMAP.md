# CANDELA ADMIN — Roadmap

## Prioridades

Orden: **operación diaria del local** (caja, tesorería, costos, pagos, personal) antes que ceremonias de arranque o ampliaciones de gobierno.

Filipo = POS por ahora; Candela absorbe el resto de la operación administrativa.

---

## FASE MVP 1 — Arranque + operación base

**Objetivo:** Configurar empresa, saldos iniciales y operar liquidez, CxP y socios sin depender de un “empalme” ceremonial.

### Incluye

- [ ] Login / Auth / RBAC base
- [ ] Organización (Empresa) + fecha de inicio operativo
- [ ] Socios y composición accionaria (+ advertencia ≠ 100%)
- [ ] Cuentas socio↔sociedad (entidad separada)
- [ ] Checklist inicial opcional (ítems, estados, cierre/snapshot) — no bloquea operación
- [ ] Document Center (upload, metadata, signed URLs)
- [ ] Bancos / caja / pasarelas + saldos iniciales + evidencia
- [ ] Cierre de caja + aval en Tesorería
- [ ] Proveedores
- [ ] CxP (documentos, saldos, prioridades, aging básico)
- [ ] Préstamos de socios (alta, desembolsos, KPIs básicos)
- [ ] Uso del capital (`funding_allocations`) mínimo
- [ ] `audit_logs` base
- [ ] Migraciones + RLS
- [ ] Docs de producto/arquitectura
- [ ] CI lint/typecheck/test/build
- [ ] Stub `/integrations/filipo` (POS → agregados futuros)

### Definition of Done

Ver `docs/PRODUCT.md` § Definition of Done MVP 1.

---

## FASE MVP 2 — Dinero en movimiento

- [ ] Gastos administrativos + categorías + estados
- [ ] Costos compartidos (allocation)
- [ ] Presupuesto (3 escenarios) vs ejecutado
- [ ] Tesorería: `bank_transactions`, conciliación, import CSV/XLSX
- [ ] Solicitudes de capital (workflow completo)
- [ ] Uso del capital ampliado (comprometido/pagado)
- [ ] Vinculación banco ↔ pago/gasto/préstamo

---

## FASE MVP 3 — Compromisos y cumplimiento

- [ ] Personal administrativo (sin nómina completa)
- [ ] SST documental/económico
- [ ] Contabilidad/Tributario (calendario, obligaciones, dashboard próximos)
- [ ] Contratos y vencimientos
- [ ] Activos de arranque
- [ ] Opening inventory summary (categorías, no SKU)

---

## FASE MVP 4 — Control continuo

- [ ] Dashboard BI administrativo (3 filas definidas en producto)
- [ ] Cierre administrativo mensual + ajustes
- [ ] Reportes exportables
- [ ] Mejoras de aging, burn rate, necesidad mínima de caja

---

## FASE FUTURA — FILIPO

- [ ] Implementar `FilipoReadClient`
- [ ] Importaciones agregadas READ ONLY
- [ ] Sección UI: “Información operacional proveniente de FILIPO”
- [ ] Tablas `integration_sources` / `integration_imports`

**No incluir** ventas/operación en dashboards hasta esta fase.

---

## Fuera de alcance (explícito)

POS, comandas, recetas, inventario operativo diario, producción, Food Cost operativo, pedidos, clientes restaurante, ERP contable completo, OCR bancario (MVP), firma electrónica legal del acta, nómina completa, SG-SST completo.

---

## Hitos de ingeniería transversales

| Hito | Cuándo |
|------|--------|
| Docs fundacionales | Antes de codificar (hecho en kickoff) |
| Scaffold Next.js + Supabase | Inicio MVP 1 |
| Migraciones + RLS | Antes de UI de datos |
| CI + Vercel Preview | Con primer PR |
| Tests unitarios críticos | Con lógica de CxP/préstamos/caja/tesorería |
| E2E flujos críticos | Antes de cerrar MVP 1 |

---

## Criterio de aceptación de cualquier feature nueva

1. ¿Es administración financiera/corporativa? Si no → FILIPO.
2. ¿Tiene trazabilidad, evidencia y auditoría?
3. ¿Respeta multi-tenant + RLS?
4. ¿Usa `NUMERIC` y timezone correctos?
5. ¿Tiene migración versionada si toca schema?
6. ¿Está en la fase correcta del roadmap?
