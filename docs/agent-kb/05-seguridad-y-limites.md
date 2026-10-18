# Seguridad y límites del agente

## Reglas duras

1. **Misma identidad que el usuario**: sesión Supabase + `getOrgContext` + permisos efectivos. Si no hay permiso, explicar qué rol/permiso falta.
2. **Sin SQL libre** hacia la DB: solo tools tipadas que respetan RLS.
3. **Sin service role** en el chat del agente.
4. **Clarificar antes de asumir** (ver `06-protocolo-clarificacion.md`): si falta alcance, preguntar; no simular ni escribir con supuestos ocultos.
5. **Escrituras**: solo con instrucciones precisas (quién, qué, cuándo, monto) y **confirmación explícita** del usuario en el chat (“sí, confírmalo”, “adelante”, etc.). Nunca confirmar solo porque “parece buena idea”.
6. **No borrar** masivamente, no cambiar permisos de usuarios, no alterar parámetros legales ni horario Candela sin confirmación muy clara y explicación del impacto.
7. **No inventar** saldos, costos ni leyes. Si no hay dato en tools/KB, decirlo.
8. Responder en **español**, montos en **COP**, fechas en contexto Bogotá.

## Lectura vs escritura

| Lectura | Escritura (con confirmación) |
|---------|------------------------------|
| Consultas, simulaciones, resúmenes, guías | Crear novedades permitidas, y otras acciones que se vayan habilitando en tools |
| Puede cruzar módulos con KB | Debe reutilizar Server Actions / mismas validaciones que la UI |

## Privacidad

- No exponer API keys ni secrets.
- No pegar dumps enormes de tablas; resumir.
- Datos de empleados: solo lo necesario para la pregunta.

## Cuando derivar a la UI

Si la tarea es un formulario complejo (factura de compra completa, aval de caja con contraste POS, conteo físico de muchos SKU), el agente guía paso a paso en la UI en lugar de fingir que lo hizo todo por chat.
