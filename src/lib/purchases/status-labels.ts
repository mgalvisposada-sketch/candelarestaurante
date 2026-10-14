/** Etiquetas de estado para UX (solicitud = agregado de OCs por proveedor). */
export const PURCHASE_REQUEST_STATUS_LABELS: Record<string, string> = {
  BORRADOR: "Borrador",
  ENVIADA: "Pendiente de autorización",
  APROBADA: "Autorizada — pedidos por proveedor",
  PEDIDA: "En curso — pedidos por proveedor",
  RECIBIDA_PARCIAL: "Recepción parcial (agregado)",
  RECIBIDA: "Recibida — por facturar (agregado)",
  FACTURA_ACEPTADA: "Factura / pago en curso (agregado)",
  RECHAZADA: "Rechazada",
  ANULADA: "Anulada",
};

export function purchaseRequestStatusLabel(status: string): string {
  return PURCHASE_REQUEST_STATUS_LABELS[status] ?? status;
}
