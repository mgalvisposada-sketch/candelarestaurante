# CANDELA ADMIN — Producto

## Qué es

**Candela Admin** es una plataforma web privada para el control **administrativo y financiero** de una empresa de restaurantes.

No es un POS. No es un ERP contable. No reemplaza al contador. No gestiona operación de cocina, comandas, recetas, inventarios operativos, Food Cost, pedidos ni clientes del restaurante.

Eso vive en **FILIPO** (sistema operacional). Candela Admin es el sistema principal de administración empresarial, tesorería, capital, gobierno de socios y línea base financiera.

## Cinco preguntas que debe responder

1. ¿Qué empresa estamos administrando?
2. ¿Qué tiene y qué debe actualmente?
3. ¿Cuánto cuesta administrarla y mantenerla funcionando?
4. ¿De dónde viene y para qué se utiliza el dinero?
5. ¿Cuánto capital adicional necesita y cómo será devuelto?

## Principios de producto

| Principio | Significado |
|-----------|-------------|
| Simplicidad | Solo lo necesario para administrar, no para operar el restaurante |
| Trazabilidad | Origen, destino y vínculo de cada movimiento de dinero |
| Control | Estados, roles, validaciones y cierres |
| Evidencia | Documentos y soportes asociados a registros relevantes |
| Histórico | Snapshots inmutables; ajustes posteriores visibles |
| Auditoría | Quién hizo qué, cuándo, con valores antes/después |
| Claridad para socios | Dashboards legibles sin jerga operativa |

## Frontera Candela Admin vs FILIPO

### Candela Admin — source of truth

Gastos, pagos, bancos, tesorería, CxP, proveedores administrativos, préstamos, capital, contratos, impuestos, personal administrativo, estructura corporativa, presupuesto, documentos, compromisos financieros.

### FILIPO — source of truth

Ventas, pedidos, inventarios operativos, recetas, producción, consumos, Food Cost, Beverage Cost, desperdicio, clientes, delivery, canales, operación diaria.

### Integración futura

Arquitectura preparada en `/integrations/filipo` con tipos READ ONLY. **No se desarrolla en el MVP.**

## Roles (RBAC)

| Rol | Acceso |
|-----|--------|
| `SUPER_ADMIN` | Control completo |
| `GESTION` | Crear, editar, validar y administrar |
| `SOCIO` | Lectura de dashboard, capital, préstamos, presupuesto, CxP, estado financiero y documentos autorizados |
| `CONTADOR` | Obligaciones tributarias, documentos contables, cierres y módulos de su función |
| `LECTURA` | Solo lectura de información expresamente autorizada |

Las personas se administran en base de datos. No hardcodear usuarios.

## Módulo central: Empalme

Objetivo: construir una **línea base administrativa** a una **fecha de corte**.

- Antes del corte → situación recibida
- Después del corte → nueva administración

### Estados de calidad (transversales)

| Estado | Significado |
|--------|-------------|
| `CONFIRMADO` | Existe soporte y fue validado |
| `DECLARADO` | Suministrado sin soporte suficiente |
| `PENDIENTE` | Aún no establecido |

Campos típicos: `verification_status`, `validated_by`, `validated_at`, `comments`, `source`, evidencia.

**Regla crítica:** el empalme puede cerrarse con pendientes. Se muestran % confirmado / declarado / pendiente y una lista de pendientes. Al cerrar se genera un **snapshot inmutable**.

## Dominios funcionales

| Dominio | Propósito |
|---------|-----------|
| Empresa | Identidad corporativa y documentos societarios |
| Socios | Composición accionaria + cuentas socio↔sociedad (separadas de préstamos) |
| Proveedores & CxP | Maestro, documentos, pagos, aging, prioridades |
| Tesorería | Cuentas, saldos iniciales, movimientos, conciliación |
| Préstamos | Capital vs préstamo vs anticipo; desembolsos, cuotas, pagos |
| Uso del capital | Destino aprobado / comprometido / pagado / disponible |
| Solicitudes de capital | Workflow de recursos |
| Gastos | Administrativos, fijos/variables, esenciales/reducibles |
| Costos compartidos | Asignación trazable a Candela |
| Presupuesto | Estructura actual / mínimo viable / aprobado vs ejecutado |
| Personal | Maestro administrativo (no nómina completa) |
| SST | Documental y económico (no SG-SST completo) |
| Tributario | Calendario y obligaciones (no reemplaza contabilidad) |
| Contratos | Compromisos y vencimientos |
| Activos / inventario apertura | Fotografía de empalme, no inventario SKU |
| Documentos | Document Center central (Storage privado) |
| Cierre mensual | Administrativo, no contable legal |
| Auditoría | `audit_logs` obligatorio |

## Localización

- UI: español
- Moneda: COP (`NUMERIC`, nunca float)
- Fechas visuales: DD/MM/YYYY
- Timezone visual: `America/Bogota`
- Timestamps internos tipados y timezone-aware

## Definition of Done — MVP 1

El sistema permite responder ante socios:

- ¿Cuál es la empresa?
- ¿Quiénes son los socios y su %?
- ¿Fecha de corte?
- ¿Dinero en bancos y caja?
- ¿Cuánto se debe y a quién?
- ¿Qué facturas componen cada deuda?
- ¿Deuda con socios / préstamos / uso del capital?
- ¿Qué está confirmado, declarado y pendiente?

Y exportar:

- **Acta de Empalme** (PDF)
- **Resumen de Línea Base** (PDF)

## Regla final de producto

> ¿Esto pertenece a la administración financiera/corporativa de Candela o a la operación del restaurante?

Si es operación → **FILIPO**. No desarrollarlo aquí.
