# FILIPO Integration (preparación)

**Hoy Filipo es solo POS** (ventas / comandas / ticket). Candela Admin opera el resto del día a día administrativo.

Este directorio define el contrato READ ONLY para recibir agregados desde FILIPO en una fase futura:

- ventas diarias
- ventas por canal
- órdenes
- ticket promedio
- costo operacional
- Food Cost
- Beverage Cost

## Reglas

1. FILIPO es source of truth de **POS / ventas**.
2. Candela Admin solo **lee** agregados importados (cuando existan).
3. La UI deberá marcar claramente: “Información operacional proveniente de FILIPO”.
4. Mientras no haya sync, el local declara caja en Candela (Cierre de caja) y opera costos aquí.

Ver `types.ts` y `client.ts`.
