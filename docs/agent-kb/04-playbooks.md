# Playbooks — cómo hacer las cosas en Candela

Guía a la pantalla correcta. Si va a **escribir**, pedir datos precisos + confirmación. Aplicar protocolo de clarificación si falta alcance.

---

## Dinero / caja / tesorería

### Declarar el día (local)
1. `/cierre-caja`
2. Completar ventas efectivo / débito / crédito / transfer + base (`cash_float`)
3. Guardar borrador → enviar a revisión (`EN_REVISION`)
4. Avisar: el dinero **aún no** está acreditado en bancos

### Avalar (tesorería / gestión)
1. `/tesoreria` cola de cierres
2. Contrastar vs POS/banco si aplica
3. Confirmar montos a acreditar → avalar (`AVALADO`)
4. Permiso: `tesoreria.caja.avalar`

### Ver liquidez
- `/inicio` o `/tesoreria` (o tool liquidez del agente)

### Pagar un proveedor
1. Confirmar que la compra ya está **facturada** (CxP + solicitud)
2. `/solicitudes-pago` → aprobar si hace falta → ejecutar pago
3. No crear pago CxP suelto en Proveedores

### Liquidar prestador POR_TURNO
1. `/gastos` → liquidación por turno
2. Empleado, quincena, días/turnos, tarifa
3. Sale gasto + solicitud de pago (`GASTO`)
4. No usar liquidación de Personal nómina para esto

---

## Compras e inventario

### Reponer por bajo mínimo
1. `/compras` sugeridos (o inventario mínimos)
2. Crear solicitud (`BORRADOR` → enviar `ENVIADA`) — marcar urgente si aplica
3. Autorizar (`APROBADA`) — sin esto no comprar
4. Pedir (`PEDIDA`)
5. Según proveedor:
   - **Crédito:** recibir → facturar (qty recibida)
   - **Prepago:** facturar/pagar → recibir
6. Pago en `/solicitudes-pago`

### Contar inventario
1. `/inventario` físico → contar → enviar
2. Revisión/ajuste: quien tenga `inventario.fisico.ajustar`

### Crear producto
- MP comprable: `/inventario` maestro
- Insumo/preparación/carta: `/cocina` maestro

---

## Cocina

### Definir / costear receta
1. `/cocina` → Recetas → BOM (componentes + yield)
2. Consultar costo teórico antes de producir si preguntan “¿cuánto cuesta?”

### Registrar producción
1. `/cocina` → Producciones
2. Elegir flujo **insumo** o **preparación**
3. Capturar qty salida y merma / varianza
4. Completar → mueve stock (consumo + entrada producción)

### “¿Alcanza para N porciones?”
1. Identificar receta y batches
2. Revisar stock de componentes (inventario)
3. Si falta, derivar a sugeridos/compras

---

## Personal / domingo

### Costo de abrir un domingo
1. Clarificar quién + horario (+ ¿POR_TURNO?)
2. Listar empleados
3. Simular laborales; sumar aparte tarifas POR_TURNO
4. Responder: “Abrir cuesta $X” (costo empleador), no solo recargo

### Cambiar si el local abre domingo
- `/personal/parametros` → `works_sunday`
- Antes: simular impacto

### Novedad (anticipo/bono/permiso)
- `/personal/novedades` — no extras/ausencias/turno laborado por esta vía

### Liquidar quincena laboral
- `/personal` liquidación → planilla si aplica → calcular/emitir

---

## Gobierno

- Usuarios: solo SUPER_ADMIN `/configuracion`
- Permisos: GESTION / SUPER_ADMIN
- Empresa / socios / capital / préstamos: rutas homónimas

## Criterio al guiar

1. Módulo + permiso.
2. Ruta y pasos en orden (estados).
3. Dependencias (no facturar crédito sin recibir; no avalar sin envío; POR_TURNO ≠ nómina).
4. Si falta dato → preguntar.
