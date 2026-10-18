# Dinero: cierre de caja, tesorería, pagos, CxP, socios

Operación diaria del efectivo y bancos. El agente debe separar **declarar** (local) de **avalar/acreditar** (tesorería).

## Cierre de caja (`/cierre-caja`)

**Permiso declarar:** `cierre-caja.declarar` (alias legacy `tesoreria.caja.declarar`).

**Estados (`cash_daily_close_status`):**
`BORRADOR` → `EN_REVISION` (enviado) → `AVALADO` | `RECHAZADO`.

**Qué declara el local (borrador):**
- `business_date`
- `cash_float` — base/flotante contada en caja (NO es venta)
- `cash_sales` — ventas en efectivo
- `card_debit_sales` + `card_credit_sales` → suman adquirencia
- `transfer_sales` — transferencia/QR
- Cuentas destino: `cash_account_id`, `card_account_id`, `transfer_account_id`
- `comments`

**Reglas duras:**
- Declarar **no** crea movimientos bancarios.
- No editar un cierre en `EN_REVISION` o `AVALADO`.
- Enviar a revisión exige cuentas destino resueltas.
- Pendiente de aval en bandeja = cierres `EN_REVISION` (`caja_avalar`).

## Base / flotante vs ventas

- Target org: `organizations.cash_float_target`.
- Cuenta especial: `bank_accounts.is_cash_float` (base del local).
- Las **ventas en efectivo** van a cuenta de caja con propósito de ventas (`fund_purpose` VENTAS / default), **no** a la cuenta flotante.
- `cash_float` del cierre = conteo de base reportado; al avalar **no** se acredita como ingreso de ventas.

## Tesorería — aval (`/tesoreria`)

**Permisos:** ver cola `tesoreria.caja`; avalar `tesoreria.caja.avalar`.

**Proceso (`approveCashDailyCloseAction`):**
1. Solo desde `EN_REVISION`.
2. Contrastar vs POS/banco si hay datos (`pos_cash_amount`, `pos_card_amount`, `pos_transfer_amount`, `bank_card_amount`).
3. Acreditar con montos editables: `cash_credited`, `card_credited`, `transfer_credited` (default ≈ declarado).

**Qué crea el aval (`bank_transactions`, crédito):**
| Concepto | Categoría típica | Nota |
|----------|------------------|------|
| Efectivo ventas | `INGRESO_CAJA` | → cuenta efectivo destino |
| Adquirencia | `INGRESO_ADQUIRENCIA` | `settlement_status` suele `PENDIENTE_BANCO` |
| Transfer/QR | `INGRESO_TRANSFERENCIA` | → cuenta transfer |

- `linked_entity_type` = `cash_daily_close`.
- Sin aval → la liquidez de Inicio/Tesorería **no** refleja ese día como ingreso acreditado.

## Liquidez (Inicio / Tesorería)

- Se calcula con cuentas activas + snapshots de saldo + movimientos (`sumAvailableBalances`).
- Respeta `administrative_cutoff_date` de la org cuando aplica.
- Preguntas “¿cuánta plata hay?” → tool de liquidez; no inventar.

## Proveedores & CxP (`/proveedores`)

- Maestro: compra y/o gasto (`is_purchase`, `is_expense`).
- Términos de compra del proveedor: `purchase_payment_terms` = `CREDITO` | `PREPAGO` (distinto del `payment_mode` de una solicitud).
- **Alta operativa de CxP** = Compras → facturar (no crear CxP suelta; permisos de crear/pagar CxP directo están desactivados en catálogo).
- Documento: `accounts_payable_documents`, status típ. `ABIERTA`, source `"compras"`.
- Campos útiles para ranking: `supplier_id`, `original_amount` (facturado), `paid_amount`, `issue_date`, `source`, excluir `ANULADA`.
- Pregunta “¿a qué proveedores más se compra?” → `rank_suppliers_by_purchases` con `report_level=ejecutivo`.
  - Resumen gerencial: puesto, proveedor, # facturas, total, **qué se le compra** (categorías del periodo / catálogo).
  - **No** volcar facturas ni ítems en el ranking.
  - Detalle fino solo con `report_level=proveedor_detalle` + `focus_supplier` cuando lo pidan.
  - Solo lo facturado en CxP cuenta. No inventar.

## Solicitudes de pago (`/solicitudes-pago`)

- Cola para aprobar/ejecutar: facturas de compra, gastos, nómina, etc.
- Tras facturar compra: suele crearse `payment_requests` con `source` `FACTURA_PROVEEDOR`, a menudo ya `EN_COLA_PAGO`.
- Gastos / liquidación turno: `source` `GASTO`, a menudo `EN_REVISION` primero.
- Pagar = salir dinero de Tesorería; no inventar un “pago CxP” fuera de esta bandeja.

## Gastos (`/gastos`)

- Opex general.
- **Liquidación por turno** (`gastos.liquidacion-turno`): canal de pago de `POR_TURNO` (ver doc cocina/personal / sección POR_TURNO en `03`).
- Propinas / tip liquidation existen como flujos aparte de gastos.

## Socios, capital, préstamos

- Socios, capital y préstamos alimentan Inicio (deuda / capital) junto a liquidez y CxP.
- No mezclar con cierre de caja del día.

## Checklist / Empresa

- Empresa: identidad + `administrative_cutoff_date`.
- Checklist inicial: opcional; **no bloquea** operar.

## Clarificar antes de actuar (dinero)

| Pregunta ambigua | Preguntar |
|------------------|-----------|
| “¿Cuánta caja hay?” | ¿Liquidez total, una cuenta, o base/flotante? |
| “Cierra el día” | ¿Declarar cierre o avalar en tesorería? Fecha del business_date. |
| “Paga al proveedor” | ¿Ya está facturado / en solicitudes de pago? ¿Qué solicitud? |
| “Mueve plata” | Origen, destino, monto, concepto — y confirmación si escribe. |

## Qué no hacer

- Decir que “ya entró el dinero” solo porque el local declaró (falta aval).
- Confundir `cash_float` con ventas en efectivo.
- Crear CxP o pagar fuera del flujo compras → solicitudes de pago.
- Avalar sin contraste cuando el usuario pide rigor (ofrecer revisar diferencias POS vs declarado).
