# FILIPO Integration (preparación)

Candela Admin **no** implementa la integración operacional en el MVP.

Este directorio define el contrato READ ONLY para recibir agregados desde FILIPO en una fase futura:

- ventas diarias
- ventas por canal
- órdenes
- ticket promedio
- costo operacional
- Food Cost
- Beverage Cost

## Reglas

1. FILIPO es source of truth operacional.
2. Candela Admin solo **lee** agregados importados.
3. La UI deberá marcar claramente: “Información operacional proveniente de FILIPO”.
4. No desarrollar sync, webhooks ni UI operativa hasta la fase futura.

Ver `types.ts` y `client.ts`.
