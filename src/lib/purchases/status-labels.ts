/** Etiquetas de estado para UX (solicitud de compra). */
export const PURCHASE_REQUEST_STATUS_LABELS: Record<string, string> = {
  BORRADOR: "Borrador",
  ENVIADA: "Pendiente de autorización",
  APROBADA: "Autorizada — por pedir",
  PEDIDA: "Pedida — por recibir",
  RECIBIDA_PARCIAL: "Recibida parcial",
  RECIBIDA: "Recibida — por facturar",
  FACTURA_ACEPTADA: "Factura en cola de pago",
  RECHAZADA: "Rechazada",
  ANULADA: "Anulada",
};

export function purchaseRequestStatusLabel(status: string): string {
  return PURCHASE_REQUEST_STATUS_LABELS[status] ?? status;
}
