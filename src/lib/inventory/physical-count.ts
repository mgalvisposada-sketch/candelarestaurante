/**
 * Inventario físico manda sobre todo stock contable:
 * materia prima, insumos preparación y preparaciones.
 * (Productos de carta no se cuentan aquí: son menú / food cost.)
 */
export const PHYSICAL_COUNT_ITEM_KINDS = [
  "MATERIA_PRIMA",
  "INSUMO_PREPARACION",
  "PREPARACION",
] as const;

export type PhysicalCountItemKind =
  (typeof PHYSICAL_COUNT_ITEM_KINDS)[number];
