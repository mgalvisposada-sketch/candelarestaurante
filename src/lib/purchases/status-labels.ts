/** Etiquetas de estado para UX (solicitud de compra). */
export const PURCHASE_REQUEST_STATUS_LABELS: Record<string, string> = {
  BORRADOR: "Borrador",
  ENVIADA: "Pendiente de autorización",
  APROBADA: "Autorizada — pedir / facturar (prepago)",
  PEDIDA: "Pedida — por recibir o facturar",
  RECIBIDA_PARCIAL: "Recibida parcial",
  RECIBIDA: "Recibida — por facturar (crédito)",
  FACTURA_ACEPTADA: "Factura en cola — pagar y/o recibir",
  RECHAZADA: "Rechazada",
  ANULADA: "Anulada",
};

export function purchaseRequestStatusLabel(status: string): string {
  return PURCHASE_REQUEST_STATUS_LABELS[status] ?? status;
}
