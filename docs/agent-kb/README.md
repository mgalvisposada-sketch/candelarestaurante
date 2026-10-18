# Base de conocimiento del Asistente Candela

Fuente documental que el agente carga en cada conversación (`src/lib/agent/kb.ts`).

## Contenido

| Archivo | Enfoque | Madurez |
|---------|---------|---------|
| `00-sistema.md` | Mapa, roles, conexiones | Base |
| `01-dinero-caja-tesoreria.md` | Cierre, aval, liquidez, CxP, pagos | **Endurecido** |
| `02-compras-inventario-cocina.md` | Compras 5 pasos, crédito/prepago, cocina/costeo | **Endurecido** |
| `03-personal-nomina.md` | Nómina, domingo, **POR_TURNO** | **Endurecido** |
| `04-playbooks.md` | Cómo hacer X en la UI | **Endurecido** |
| `05-seguridad-y-limites.md` | Reglas duras | Base |
| `06-protocolo-clarificacion.md` | Clarificar antes de asumir | Base+ |

## Mantenimiento

Al cambiar un flujo en código (estados, permisos, reglas crédito/prepago, liquidación turno, aval de caja), actualiza el doc del módulo **en el mismo PR**.

Las tools dan números; el KB dice **cómo interpretarlos y qué no asumir**.
