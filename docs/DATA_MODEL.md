# CANDELA ADMIN — Modelo de Datos

## Convenciones

- PK: `uuid` (`gen_random_uuid()`).
- Multi-tenant: `organization_id` en tablas de negocio.
- Auditoría de fila (cuando aplique): `created_at`, `updated_at`, `created_by`, `updated_by`.
- Soft delete: `deleted_at` en entidades financieras relevantes.
- Dinero: `numeric(18,2)`.
- Porcentajes: `numeric(7,4)` (ej. 33.3333%).
- Verificación transversal: `verification_status` ∈ `CONFIRMADO | DECLARADO | PENDIENTE`.

## Diagrama de dominio (MVP 1 destacado)

```
organizations ─┬─ organization_users ─ profiles
               ├─ shareholders ─┬─ shareholder_accounts
               │                └─ shareholder_transactions
               ├─ handover_sessions ─┬─ handover_items
               │                     └─ handover_snapshots
               ├─ bank_accounts ─┬─ bank_balance_snapshots
               │                 └─ bank_transactions
               ├─ suppliers ─ accounts_payable ─┬─ accounts_payable_documents
               │                                └─ accounts_payable_payments
               ├─ loans ─┬─ loan_disbursements ─ funding_allocations
               │         ├─ loan_payment_schedule
               │         └─ loan_payments
               └─ documents (polimórfico)
```

## Enums principales

| Enum | Valores |
|------|---------|
| `app_role` | SUPER_ADMIN, GESTION, SOCIO, CONTADOR, LECTURA |
| `verification_status` | CONFIRMADO, DECLARADO, PENDIENTE |
| `ap_priority` | CRITICA, ALTA, NORMAL, NEGOCIABLE, POR_VALIDAR |
| `loan_amortization` | SIN_INTERES, CUOTA_FIJA, CAPITAL_FIJO, BULLET, MANUAL |
| `funding_request_status` | BORRADOR, SOLICITADA, APROBADA, RECHAZADA, PARCIALMENTE_APROBADA, DESEMBOLSADA, CERRADA |
| `expense_status` | BORRADOR, APROBADO, PAGADO, ANULADO |
| `tax_obligation_status` | PENDIENTE, PRESENTADA, PAGADA, VENCIDA, EN_ACUERDO, NO_APLICA |
| `monthly_close_status` | ABIERTO, EN_REVISION, CERRADO |
| `capital_nature` | CAPITAL, PRESTAMO, ANTICIPO, OTRO |

## Tablas mínimas

### Identidad y acceso

| Tabla | Descripción |
|-------|-------------|
| `organizations` | Empresa administrada (razón social, NIT, DV, corte, moneda, timezone, …) |
| `profiles` | Perfil ligado a `auth.users` |
| `organization_users` | Membresía + rol por organización |

### Socios

| Tabla | Descripción |
|-------|-------------|
| `shareholders` | Participación accionaria (% ≠ préstamos) |
| `shareholder_accounts` | Cuenta socio↔sociedad (acreedor/deudor/sin saldo) |
| `shareholder_transactions` | Movimientos de esa cuenta |

### Empalme

| Tabla | Descripción |
|-------|-------------|
| `handover_sessions` | Sesión de empalme + fecha de corte + estado |
| `handover_items` | Ítems por dominio con verification_status |
| `handover_snapshots` | Fotografía inmutable al cierre |

### Tesorería

| Tabla | Descripción |
|-------|-------------|
| `bank_accounts` | Bancos, caja, pasarelas, otros |
| `bank_balance_snapshots` | Saldo inicial a fecha de corte + evidencia |
| `bank_transactions` | Débitos/créditos, conciliación, vínculos |

### Proveedores y CxP

| Tabla | Descripción |
|-------|-------------|
| `suppliers` | Maestro de proveedores |
| `accounts_payable` | Cabecera CxP por proveedor (totales derivados) |
| `accounts_payable_documents` | Facturas / cuentas de cobro |
| `accounts_payable_payments` | Pagos aplicados a documentos |

### Capital y préstamos

| Tabla | Descripción |
|-------|-------------|
| `loans` | Contrato de préstamo |
| `loan_disbursements` | Desembolsos |
| `loan_payment_schedule` | Cronograma |
| `loan_payments` | Pagos aplicados |
| `funding_requests` | Solicitudes de recursos |
| `funding_request_items` | Detalle de necesidades |
| `funding_allocations` | Uso del capital (bolsas: aprobado/comprometido/pagado) |

### Gastos y presupuesto (MVP 2+)

| Tabla | Descripción |
|-------|-------------|
| `expense_categories` | Catálogo |
| `expenses` | Gastos administrativos |
| `recurring_expenses` | Plantillas recurrentes |
| `budgets` | Escenarios (actual / mínimo / aprobado) |
| `budget_lines` | Líneas por categoría |

### Personal, SST, tributario, contratos, activos (MVP 3+)

| Tabla | Descripción |
|-------|-------------|
| `employees` | Colaboradores administrativos |
| `employee_contracts` | Contratos asociados |
| `sst_records` | SST documental/económico |
| `accounting_contacts` | Contador / firma |
| `tax_obligations` | Obligaciones fiscales |
| `tax_payments` | Pagos / sanciones / acuerdos |
| `contracts` | Contratos y compromisos |
| `assets` | Activos de empalme |
| `opening_inventory_summary` | Resumen apertura (no SKU) |

### Transversales

| Tabla | Descripción |
|-------|-------------|
| `documents` | Metadata Document Center |
| `monthly_closes` | Cierre administrativo mensual |
| `audit_logs` | Auditoría append-only |
| `integration_sources` | Fuentes externas (FILIPO, …) |
| `integration_imports` | Importaciones READ ONLY |

## Relaciones clave

### CxP

```
suppliers 1──* accounts_payable_documents
accounts_payable_documents 1──* accounts_payable_payments

saldo_documento = valor_original - sum(pagos)
total_proveedor  = sum(saldos documentos abiertos)
```

`accounts_payable` puede ser vista materializada o tabla de agregación mantenida por triggers/aplicación. Preferencia MVP: **cálculo por query + índices**; tabla cabecera opcional para estado/prioridad consolidada.

### Préstamos

```
loans 1──* loan_disbursements 1──* funding_allocations
loans 1──* loan_payment_schedule
loans 1──* loan_payments

KPIs:
  capital_inicial, desembolsado, pagado,
  interés_causado, interés_pagado,
  saldo_capital, próxima_cuota, fin_estimado
```

### Socios ≠ préstamos

- `shareholders.participation_pct` = gobierno societario.
- `loans` / `shareholder_accounts` = deuda/crédito financiero.
- Nunca mezclar en una sola entidad.

### Documentos

```
documents.entity_type ∈ {
  organization, shareholder, supplier, accounts_payable,
  loan, employee, contract, tax_obligation, bank_account,
  asset, handover, other
}
documents.entity_id = uuid
documents.storage_path = path privado
```

## Campos de verificación (patrón)

Aplicar a ítems de empalme, documentos CxP, saldos iniciales, etc.:

```sql
verification_status verification_status NOT NULL DEFAULT 'PENDIENTE',
validated_by uuid REFERENCES profiles(id),
validated_at timestamptz,
comments text,
source text
```

## Cierre de empalme

1. `handover_sessions.status` → `CERRADO`.
2. Insertar `handover_snapshots` con payload JSON completo.
3. Registrar `closed_by`, `closed_at`, `closing_notes`.
4. Calcular y persistir métricas: `% CONFIRMADO / DECLARADO / PENDIENTE`.
5. Post-cierre: mutaciones = ajustes referenciados al snapshot, sin alterar el JSON.

## Integridad

- Participación accionaria: **advertir** si ≠ 100%; no bloquear empalme.
- Registros financieros importantes: soft delete + auditoría; no `DELETE` físico.
- Montos: constraints `>= 0` donde aplique; débitos/créditos mutuamente exclusivos en movimientos.

## Índices sugeridos (MVP 1)

- `(organization_id)` en todas las tablas tenant.
- CxP docs: `(organization_id, supplier_id, due_date)`.
- Bank tx: `(organization_id, bank_account_id, transaction_date)`.
- Loans: `(organization_id, status)`.
- Documents: `(organization_id, entity_type, entity_id)`.
- Audit: `(organization_id, created_at DESC)`.

## Evolución por fase

| Fase | Tablas activas |
|------|----------------|
| MVP 1 | orgs, users, shareholders*, handover*, banks*, suppliers, CxP*, loans*, funding_allocations, documents, audit_logs |
| MVP 2 | expenses*, budgets*, funding_requests*, bank_transactions completo |
| MVP 3 | employees*, sst, tax*, contracts, assets, opening_inventory |
| MVP 4 | monthly_closes, vistas BI, reportes |
| Futura | integration_* + consumo FILIPO |
