# Personal y nómina

## Alcance en la app

- Empleados, cargos, bonos, contratos documentales.
- **Horario Candela** (`payroll_schedules`): lun–dom, entrada/salida, descanso. Domingo suele `works_sunday = false`.
- **Parámetros legales** (`payroll_legal_params`): SMMLV, recargos (domingo tip. 90% desde jul/2026 en CO), extras, aportes, provisiones.
- Novedades (`shift_novelties`): `BORRADOR` / `PENDIENTE` → `APROBADA` | `RECHAZADA` | `ANULADA`.
- Planilla (`payroll_attendance_days`): verdad de horas cuando se usa en liquidación.
- Periodos (`payroll_periods`): `BORRADOR` → `CALCULADA` → `EMITIDA` → `CERRADA`.

## Tipos de vínculo

| Tipo | Cómo se paga | ¿Recargo domingo Candela? |
|------|--------------|---------------------------|
| Laboral (indefinido, fijo, etc.) | Liquidación quincenal nómina | Sí (Horario Candela + motor payroll) |
| `PRESTACION_SERVICIOS` | Honorarios (sin nómina completa) | No en simulación dominical empleador |
| `POR_TURNO` | **Gastos → liquidación por turno** | No: tarifa × días/turnos |

---

## POR_TURNO (detalle — crítico para “abrir domingo”)

- `basic_salary` / fee = **tarifa por turno/día**, no sueldo mensual.
- **No** entra en `payroll_period_lines` laborales (`liquidatePeriod` los omite).
- Pago: permiso `gastos.liquidacion-turno` → crea gasto `expense_kind` `LIQUIDACION_TURNO` + `payment_requests` `source` `GASTO` (a menudo `EN_REVISION`) con cuenta de cobro.
- Neto típico: días × tarifa ± novedades de dinero aprobadas en la quincena (`ANTICIPO`, `DESCUENTO_AUTORIZADO`, `BONO_OCASIONAL`).
- La liquidación puede crear `TURNO_LABORADO` `APROBADA` por días marcados.
- **No** registrar `TURNO_LABORADO` / extras / ausencias como novedad genérica de Personal para estos prestadores (UI lo bloquea / desvía).
- **No** duplicar días ya liquidados en otro `LIQUIDACION_TURNO` activo.

### Si preguntan costo de abrir domingo e incluyen POR_TURNO
1. Separar dos bolsas:
   - Laborales → simulación Horario Candela (recargo + cargas).
   - POR_TURNO → **tarifa × turnos de ese domingo** (vía lógica de Gastos), sin recargo 90% del motor laboral.
2. Nunca meter POR_TURNO en `simulateBiweekly` como si fuera contrato laboral.
3. Si no dan tarifa/días, preguntar o leer empleado (`list_employees` → grupo `porTurno`).

---

## Cálculo laboral (motor `src/lib/payroll`)

- Valor hora: divisor jornada (p.ej. 42h → 210 h/mes).
- Recargos: nocturno ordinario, domingo/festivo, extras día/noche/domingo.
- `simulateBiweekly` → neto, aportes, provisiones, **employerCost**.
- Con planilla, asistencia reemplaza parte del teórico de horas/extras.
- Básico quincenal laboral ≈ salario/2 (fijo abras o no el domingo).

## “¿Cuánto cuesta abrir / trabajar un domingo?”

**Clarificar** (protocolo global): quién (¿incluye POR_TURNO?), horario, periodo.

Métrica por defecto si dicen “le vale a Candela / abrir”:
→ **costo de abrir** = costo empleador del domingo (recargos + cargas).  
No digas “adicionales” como si faltara otra cifra: con sueldo fijo, el básico se paga igual; **ese monto ES el costo de abrir**.

Insumo:
1. Personas (listar activos: laborales vs POR_TURNO vs prestación).
2. Horario domingo (entrada/salida/descanso) o Horario Candela.
3. Periodo: `current` (Bogotá) o `latest_liquidated` — nunca inventar fechas.
4. Si hay POR_TURNO: tarifas × turnos aparte.

Salida tipo dueño:
1. “Abrir el domingo de … le cuesta a Candela unos **$X** en nómina.”
2. Desglose recargo vs cargas; exclusiones.
3. Vs ventas: margen de contribución del día debe superar ~$X.

## Novedades vs asistencia (laborales)

| Tema | Dónde |
|------|--------|
| Anticipo, descuento, bono, permisos | Novedades Personal |
| Horas extra, tarde, ausencia | Planilla en Liquidación |
| Turno prestador POR_TURNO | Gastos → liquidación turno |

## Conexiones

- Liquidación laboral → solicitud de pago nómina.
- POR_TURNO → Gastos → solicitud de pago gasto.
- Presupuesto: nómina operativa.
- Bandeja: novedades por aprobar (`personal.novedades.aprobar`).
