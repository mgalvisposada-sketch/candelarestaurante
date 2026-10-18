# Costos del local: compras, inventario y cocina

Ciclo: **bajo mínimo → compra → recepción/factura → stock → receta/producción → costo de plato**.

---

## Inventario (`/inventario`)

**Permisos clave:** `inventario.maestro`, `inventario.minimo`, `inventario.fisico` (contar/enviar), `inventario.fisico.ajustar` (aplicar ajuste).

**`products.item_kind`:**
| Kind | Dónde vive |
|------|------------|
| `MATERIA_PRIMA` | Compras / inventario maestro |
| `INSUMO_PREPARACION` | Cocina (sale de producción) |
| `PREPARACION` | Cocina (BOM / producción) |
| `PRODUCTO_CARTA` | Cocina (carta) |

- Stock: `current_stock`, mínimo `min_stock` → sugeridos de compra.
- Kardex `inventory_movements`: `APERTURA`, `COMPRA`, `AJUSTE_FISICO`, `CONSUMO`, `PRODUCCION_ENTRADA`, …
- Conteo físico incluye MP, insumos y preparaciones; el ajuste a stock lo aplica quien tiene `inventario.fisico.ajustar`.

---

## Compras (`/compras`) — 5 pasos

### Permisos por paso
1. Solicitar — `compras.solicitudes.crear`
2. Autorizar — `compras.solicitudes.aprobar`
3. Pedir — `compras.solicitudes.pedir`
4. Recibir — `compras.solicitudes.recibir` (+ extras `compras.solicitudes.recibir.extras`)
5. Facturar — `compras.solicitudes.facturar`

También: `compras.sugeridos`, `compras.solicitudes` (ver), `compras.proveedores` (categoría↔proveedor).

### Estados cabecera (`purchase_request_status`)
`BORRADOR` → `ENVIADA` → `APROBADA` → `PEDIDA` → `RECIBIDA_PARCIAL` / `RECIBIDA` → `FACTURA_ACEPTADA`  
Terminales: `RECHAZADA`, `ANULADA`.

### Estados ítem (`purchase_item_status`)
`PENDIENTE` → `APROBADO` → `PEDIDO` → `RECIBIDO_PARCIAL` / `RECIBIDO` | `CANCELADO`.

### OC por proveedor (ciclo)
`POR_PEDIR` → `PEDIDA` → … → `FACTURADA` / `PAGADA` / `RECIBIDA_*` / `CERRADA` | `ANULADA`.

### Urgencia y forma de pago de la solicitud
- `is_urgent` — prioriza en bandeja de autorización.
- `payment_mode`: `CREDITO` | `EFECTIVO_INMEDIATO`  
  **No es débito automático** de caja; el pago real va por Solicitudes de pago / Tesorería.
- Términos del proveedor (`CREDITO` | `PREPAGO`) son del maestro; no confundir con `payment_mode`.

### Crédito vs prepago (criterios duros)
| | Crédito | Prepago |
|--|---------|---------|
| Pedir | Tras autorización | Tras autorización |
| Facturar | Tras pedir (`PEDIDA`+); qty facturable ≈ **recibida** | Desde `APROBADA` / puede facturar con OC aún `POR_PEDIR`; qty ≈ **aprobada** |
| Recibir | Tras pedir | Solo si facturas asociadas están **pagadas** |
| Stock | Recepción → movimiento `COMPRA` | Misma idea post-pago/recepción según flujo |

### Qué crea el paso Facturar
- `accounts_payable_documents` (típic. factura `ABIERTA`, source compras).
- `payment_requests` `source` `FACTURA_PROVEEDOR` (a menudo entra a cola de pago).
- Prioridad de pago: `CRITICA` | `ALTA` | `NORMAL` | `BAJA`.

### Listados / Excel desde el asistente
- Pedidos tipo “productos sin inventario / a comprar / Excel”:
  - Tool `list_products_to_buy`
  - `filter=sin_stock` | `bajo_minimo` | `a_comprar`
  - `export_csv=true` → adjunto CSV (abre en Excel) con botón de descarga en el chat
- Alcance: materia prima con `tracks_inventory` (igual que Compras → Sugeridos).
- `bajo_minimo` solo ve productos con mínimo > 0; si el usuario dice “sin inventario”, usar `sin_stock`.

### Clarificar en compras
- ¿Solicitud nueva o una existente (id/estado)?
- ¿Proveedor crédito o prepago?
- ¿Urgente? ¿Efectivo inmediato o crédito?
- ¿Autorizar, pedir, recibir o facturar?
- ¿Listado: sin stock, bajo mínimo, o ambos (a comprar)?

### Qué no hacer
- Comprar sin `APROBADA`.
- Facturar crédito sin recepción (qty facturable = recibida).
- Recibir prepago sin facturas pagadas.
- Inventar CxP/pago fuera de este flujo.

---

## Cocina (`/cocina`)

**Permisos:** `cocina.maestro`, `cocina.recetas`, `cocina.produccion`.

### Maestro
- Alta de cocina: `INSUMO_PREPARACION`, `PREPARACION`, `PRODUCTO_CARTA` (no crear `MATERIA_PRIMA` aquí; eso es inventario/compras).
- Agua de red / densidades (g/ml) para conversiones de receta.

### Recetas (BOM)
- `kitchen_recipes` + `kitchen_recipe_lines` (`component_product_id`, `quantity`, `yield_qty`).
- Costeo teórico: estima costo de componentes × rendimiento (`estimateRecipeCost` / batch).
- Sin BOM, el costeo de preparación queda a ciegas.

### Producciones
Dos flujos:
1. **Insumo:** materia prima → insumo; `output_qty`, `merma_qty` opcional.
2. **Preparación:** receta × `batches` + `output_qty` real; nota de varianza si real ≠ teórico.

Movimientos: entradas `CONSUMO`; salidas `PRODUCCION_ENTRADA`.

### Merma y costeo
- Merma ≈ entradas − salida útil − aprovechamientos (o merma explícita).
- El costo de entradas se concentra en el rendimiento útil → sube costo unitario si hay merma.
- Aprovechamientos pueden llevar `allocated_cost`.
- Preguntas tipicas: costo por porción, si alcanza stock para N batches, cómo registrar merma.

### Clarificar en cocina
- ¿Receta / producto de salida?
- ¿Cuántos batches o qty de salida?
- ¿Merma conocida o se calcula?
- ¿Consulta de costo teórico (BOM) o producción ya hecha?

### Qué no hacer
- Prometer stock/costo sin mirar productos/recetas/producciones.
- Mezclar “precio de venta Filipo” con “costo Candela” (son sistemas distintos hoy).
- Tratar preparaciones como si se compraran igual que MP.

---

## Presupuesto (puente)

- Líneas vs ejecutado; incluye idea de **nómina operativa**.
- Conecta costos de personal + operación, no reemplaza liquidación ni compras.

## Cadena mental del agente

```
Sugerido (mínimo) → Solicitud compra → Autorizar → Pedir
  → Recibir (stock) / Facturar (CxP+pago) según crédito|prepago
  → Cocina consume MP/insumos → Producción → Costo preparación/carta
```
