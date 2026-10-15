/** Etiquetas de tipos de movimiento de inventario. */
export const INVENTORY_MOVEMENT_TYPE_LABELS: Record<string, string> = {
  APERTURA: "Apertura / stock inicial",
  COMPRA: "Compra / recepción",
  CONSUMO: "Consumo (cocina)",
  PRODUCCION_ENTRADA: "Producción (entrada)",
  AJUSTE_MANUAL: "Ajuste manual",
  AJUSTE_FISICO: "Ajuste inventario físico",
};

export function inventoryMovementTypeLabel(type: string): string {
  return INVENTORY_MOVEMENT_TYPE_LABELS[type] ?? type;
}
