# CANDELA ADMIN — Producto

## Qué es

**Candela Admin** es la plataforma web privada para la **operación administrativa y financiera** de una empresa de restaurantes.

Hoy el día a día vive aquí: caja, tesorería, compras, inventario, cocina, gastos, personal, proveedores/CxP y gobierno de socios. **Filipo**, por el momento, cubre solo el **POS** (ventas/comandas). No es un ERP contable ni reemplaza al contador.

## Cinco preguntas que debe responder

1. ¿Qué empresa estamos administrando?
2. ¿Cuánta liquidez hay y a dónde se mueve el dinero?
3. ¿Qué se debe y a quién (CxP, socios, compromisos)?
4. ¿Cómo se operan compras, inventario, cocina y personal del local?
5. ¿Cuánto capital adicional necesita y cómo será devuelto?

## Principios de producto

| Principio | Significado |
|-----------|-------------|
| Operación primero | El flujo diario (caja → aval → pagos → costos) es el centro |
| Simplicidad | Solo lo necesario para administrar y operar el local |
| Trazabilidad | Origen, destino y vínculo de cada movimiento de dinero |
| Control | Estados, roles, validaciones y cierres |
| Evidencia | Documentos y soportes asociados a registros relevantes |
| Histórico | Ajustes posteriores visibles; snapshots cuando apliquen |
| Auditoría | Quién hizo qué, cuándo, con valores antes/después |

## Frontera Candela Admin vs FILIPO

### Candela Admin — source of truth (hoy)

Cierre de caja, tesorería, gastos, pagos, bancos, CxP, proveedores, compras, inventario, cocina (insumos/preparaciones/carta), préstamos, capital, contratos, impuestos, personal, presupuesto, documentos, estructura corporativa.

### FILIPO — hoy

**POS**: ventas, pedidos/comandas, ticket. Mientras no exista gestión integral en Filipo, Candela opera el resto del día a día.

### Integración futura

Arquitectura preparada en `/integrations/filipo` con tipos READ ONLY para agregados de ventas. Cuando Filipo madure, esos agregados se mostrarán claramente marcados como provenientes de Filipo.

## Roles (RBAC)

| Rol | Acceso |
|-----|--------|
| `SUPER_ADMIN` | Control completo |
| `GESTION` | Crear, editar, validar y administrar |
| `ADMIN_LOCAL` | Operación del local (caja, compras, novedades, etc.) |
| `TESORERIA` | Compras + cola de pago / avales de caja |
| `SOCIO` | Lectura de dashboard, capital, préstamos, presupuesto, CxP, estado financiero y documentos autorizados |
| `CONTADOR` | Obligaciones tributarias, documentos contables, cierres y módulos de su función |
| `LECTURA` | Solo lectura de información expresamente autorizada |

Las personas se administran en base de datos. No hardcodear usuarios.

## Arranque operativo (no es el centro del producto)

Al configurar la empresa se define una **fecha de inicio operativo** y se registran **saldos iniciales** en Tesorería. Existe un **Checklist inicial** (`/checklist-inicial`, redirect desde `/empalme`) opcional para capturar saldos, deudas y datos de partida.

Eso no bloquea la operación: se puede cerrar caja, comprar, pagar y liquidar personal sin completar el checklist.

Estados de calidad (cuando se usen): `CONFIRMADO` / `DECLARADO` / `PENDIENTE`.

## Dominios funcionales

| Dominio | Propósito |
|---------|-----------|
| Inicio | Panel operativo del día |
| Cierre de caja | Declaración diaria del local |
| Tesorería | Cuentas, saldos iniciales, movimientos, aval de cierres |
| Solicitudes de pago | Aprobar y pagar |
| Proveedores & CxP | Maestro, documentos, pagos, aging |
| Inventario / Cocina / Compras | Costos y operación del local |
| Gastos | Facturas operativas (opex) |
| Empresa | Identidad corporativa e inicio operativo |
| Socios | Composición accionaria + cuentas socio↔sociedad |
| Préstamos / Capital | Deuda con socios y uso del capital |
| Presupuesto | Estructura vs ejecutado |
| Personal | Empleados, novedades y liquidación |
| SST / Tributario / Contratos | Cumplimiento |
| Documentos | Document Center (Storage privado) |
| Checklist inicial | Arranque opcional (no flujo diario) |
| Auditoría | `audit_logs` obligatorio |

## Localización

- UI: español
- Moneda: COP (`NUMERIC`, nunca float)
- Fechas visuales: DD/MM/YYYY
- Timezone visual: `America/Bogota`
- Timestamps internos tipados y timezone-aware

## Definition of Done — fase operativa actual

El sistema permite operar el local día a día:

- Configurar empresa e inicio operativo
- Registrar saldos iniciales y mover liquidez
- Declarar y avalar cierres de caja
- Comprar, inventariar y registrar gastos
- Pagar CxP / solicitudes
- Gestionar personal (novedades / liquidación)
- Ver liquidez, CxP y deuda con socios en Inicio

## Regla final de producto

> ¿Esto es operación administrativa del local o solo venta en caja?

- Venta / comanda / ticket → **FILIPO (POS)**.
- Caja administrativa, dinero, costos, personal, socios → **Candela**.
