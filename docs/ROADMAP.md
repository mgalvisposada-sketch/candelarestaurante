# CANDELA ADMIN — Roadmap

## Prioridades

Orden: **confiabilidad del empalme y la deuda** antes que amplitud funcional.

---

## FASE MVP 1 — Línea base y empalme

**Objetivo:** Sentarse con socios y responder quiénes somos, qué hay, qué se debe, qué está confirmado, y descargar Acta + Resumen PDF.

### Incluye

- [ ] Login / Auth / RBAC base
- [ ] Organización (Empresa) + fecha de corte
- [ ] Socios y composición accionaria (+ advertencia ≠ 100%)
- [ ] Cuentas socio↔sociedad (entidad separada)
- [ ] Módulo Empalme (ítems, estados, % , pendientes, cierre, snapshot)
- [ ] Document Center (upload, metadata, signed URLs)
- [ ] Bancos / caja / pasarelas + saldos iniciales + evidencia
- [ ] Proveedores
- [ ] CxP (documentos, saldos, prioridades, aging básico)
- [ ] Préstamos de socios (alta, desembolsos, KPIs básicos)
- [ ] Uso del capital (`funding_allocations`) mínimo
- [ ] Resumen de Empalme
- [ ] Acta de Empalme PDF + Resumen Línea Base PDF
- [ ] `audit_logs` base
- [ ] Migraciones + RLS
- [ ] Docs de producto/arquitectura
- [ ] CI lint/typecheck/test/build
- [ ] Stub `/integrations/filipo`

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
- [ ] Activos de empalme
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
| Tests unitarios críticos | Con lógica de CxP/préstamos/empalme |
| E2E flujos críticos | Antes de cerrar MVP 1 |

---

## Criterio de aceptación de cualquier feature nueva

1. ¿Es administración financiera/corporativa? Si no → FILIPO.
2. ¿Tiene trazabilidad, evidencia y auditoría?
3. ¿Respeta multi-tenant + RLS?
4. ¿Usa `NUMERIC` y timezone correctos?
5. ¿Tiene migración versionada si toca schema?
6. ¿Está en la fase correcta del roadmap?
