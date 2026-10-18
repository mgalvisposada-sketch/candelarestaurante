# Candela Admin — mapa del sistema

Candela Admin es la plataforma de **operación administrativa y financiera** de un restaurante (multi-tenant por `organization_id`). No es el POS: las ventas/comandas viven en **Filipo**; Candela es la fuente de verdad de caja administrativa, dinero, costos, compras, inventario, cocina, personal y gobierno societario.

## Principios

- Operación primero, trazabilidad, control por estados, evidencia documental, histórico y auditoría.
- Moneda COP (nunca float; `decimal.js`). Fechas UI DD/MM/YYYY. Zona `America/Bogota`.
- Autorización en tres capas: RLS en Postgres, Server Actions, UI.
- El agente **siempre** actúa con la sesión y permisos del usuario; no inventa datos ni bypasea roles.

## Roles

| Rol | Rol en la operación |
|-----|---------------------|
| SUPER_ADMIN | Dueño del sistema: todo + usuarios |
| GESTION | Operación administrativa amplia; permisos; sin crear usuarios |
| ADMIN_LOCAL | Opera el local (caja, compras recibir, novedades, inventario/cocina) |
| TESORERIA | Factura, cola de pago, bancos, CxP |
| SOCIO | Consulta capital / pagos / gobierno |
| CONTADOR | Tributario + puede ejecutar pagos |
| LECTURA | Solo consulta acotada |

## Módulos (visión 360°)

| Módulo | Ruta | Qué conecta |
|--------|------|-------------|
| Inicio | `/inicio` | Liquidez, CxP, deuda socios, atajos operativos |
| Checklist inicial | `/checklist-inicial` | Arranque opcional (saldos/deudas de partida) |
| Empresa | `/empresa` | Identidad, fecha de inicio operativo |
| Socios | `/socios` | Accionistas y cuentas socio↔sociedad |
| Cierre de caja | `/cierre-caja` | Declaración diaria del local → aval en Tesorería |
| Tesorería | `/tesoreria` | Cuentas, saldos, avales, base/flotante |
| Proveedores & CxP | `/proveedores` | Maestro y cuentas por pagar |
| Préstamos | `/prestamos` | Socios prestan a la empresa |
| Capital | `/capital` | Movimientos de capital |
| Gastos | `/gastos` | Opex; liquidación por turno/propina |
| Solicitudes de pago | `/solicitudes-pago` | Aprobar y pagar |
| Inventario | `/inventario` | Maestro SKU, mínimos, conteo físico |
| Cocina | `/cocina` | Insumos, preparaciones, carta, recetas, producciones |
| Compras | `/compras` | Solicitar → autorizar → pedir → recibir → facturar |
| Presupuesto | `/presupuesto` | Líneas vs ejecutado (incl. nómina operativa) |
| Personal | `/personal` | Empleados, novedades, liquidación, parámetros |
| Tributario / Contratos / SST | rutas homónimas | Cumplimiento (esqueleto/operativo según módulo) |
| Documentos | `/documentos` | Archivo en Storage privado |
| Configuración | `/configuracion` | Usuarios (solo super) y permisos |
| Asistente | `/asistente` | Este agente |

## Cómo se conectan los conceptos

```
Caja (día) → Tesorería (aval / bancos)
Compras → recepción → Inventario (stock) → Cocina (recetas/producción/costo)
Compras facturadas → CxP / Solicitudes de pago → Tesorería
Personal laboral → Liquidación quincenal → Solicitud de pago nómina
POR_TURNO → Gastos (liquidación turno) → Solicitud de pago gasto
Gastos + nómina + compras → Presupuesto / Inicio (liquidez y costos)
Socios ↔ Capital / Préstamos ↔ Tesorería
```

Detalle operativo endurecido: `01` (caja/tesorería), `02` (compras/cocina), `03` (nómina/POR_TURNO), `04` (playbooks).

## Frontera Filipo

- POS (venta, comanda, ticket) → Filipo.
- Todo lo administrativo listado arriba → Candela.
- Integración futura: agregados READ ONLY de ventas/food cost; hoy no están implementados.
