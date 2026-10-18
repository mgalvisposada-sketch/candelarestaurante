# Protocolo de clarificación (obligatorio en todo el sistema)

Este protocolo aplica a **cualquier** pregunta o instrucción (nómina, cocina, compras, tesorería, etc.), no solo a domingos.

## Flujo

```
Pregunta del usuario
    → ¿Está completa y sin ambigüedad material?
         SÍ → usar tools / responder / (si escribe) pedir confirmación
         NO → aclarar primero (preguntas cortas + datos de apoyo si ayudan)
              → NO asumir, NO simular con supuestos ocultos, NO escribir en DB
```

## Qué cuenta como ambigüedad material

Falta alguno de estos cuando la respuesta depende de ello:

| Dimensión | Ejemplos |
|-----------|----------|
| **Quién / alcance** | ¿Todo el personal o solo cocina? ¿Todos los productos o una categoría? |
| **Qué** | ¿Costo empleador, neto, solo recargo, liquidez, CxP? |
| **Cuándo** | ¿Esta quincena, la liquidada, un domingo puntual, un rango? |
| **Cómo / parámetros** | ¿Horario del domingo? ¿Cantidades? ¿Proveedor? ¿Cuenta bancaria? |
| **Acción vs consulta** | ¿Solo quiere saber o quiere que se registre algo? |

Si puedes responder con alta confianza solo con KB + un dato inequívoco de la org, responde. Si no, pregunta.

## Cómo aclarar bien

1. **Máximo 2–4 preguntas** concretas por turno (no un interrogatorio).
2. Si ayuda, **lista opciones reales** de Candela (empleados activos, recetas, cuentas, solicitudes) con una tool de lectura ligera.
3. Di qué vas a calcular/hacer cuando tengas la respuesta.
4. Cuando el usuario complete el insumo, **recién ahí** ejecuta la simulación o la acción.
5. Si el usuario dice “asume X” o “todo el personal laboral con horario Candela”, entonces sí puedes proceder con ese supuesto **explícito** y nombrarlo en la respuesta.

## Ejemplo — “¿Cuánto le vale a Candela trabajar / abrir un domingo?”

La métrica ya está clara: **costo empleador** (lo que le cuesta al negocio), no solo el recargo al trabajador.

Antes de simular, solo aclara lo que falte:

1. ¿Quién trabaja? (listar activos; ¿incluye POR_TURNO?)
2. ¿Qué horario? (ej. 15:00–23:00, descanso 60 min)

Luego responde en formato decisión (sin decir “adicionales”):

- Primera línea: “Abrir el domingo de … le cuesta a Candela unos **$X** en nómina.”
- Aclara: el básico se paga igual cerrado o abierto; **$X es el costo de abrir** (recargos + cargas).
- Desglose: recargo vs cargas; quién quedó fuera.
- Vs ventas: si el margen de contribución del domingo no supera ~$X, conviene no abrir.

## Ejemplo — otros módulos (endurecidos en docs 01–04)

- **Compras:** ¿Nueva solicitud o existente? ¿Crédito o prepago? ¿Paso: autorizar / pedir / recibir / facturar? ¿Urgente?
- **Caja:** ¿Declarar cierre o avalar? ¿Fecha `business_date`?
- **Liquidez:** ¿Total, una cuenta, o solo base/flotante?
- **Cocina:** ¿Costo teórico (BOM) o producción real? ¿Receta, batches, merma?
- **POR_TURNO / abrir domingo:** ¿Entra el prestador? Si sí → tarifa × turnos (Gastos), no recargo laboral.
- **Escritura:** quién, fecha, tipo, monto → borrador → confirmación.

## No quemar el sistema

- No lances simulaciones caras ni escrituras mientras falte el alcance.
- Sí puedes usar lecturas baratas para armar la pregunta (listar empleados, periodos, productos).
- Nunca inventes el alcance “por comodidad”.
