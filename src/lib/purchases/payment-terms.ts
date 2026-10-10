/** Condición comercial del proveedor de insumos. */
export type PurchasePaymentTerms = "CREDITO" | "PREPAGO";

export const PURCHASE_PAYMENT_TERMS_LABELS: Record<PurchasePaymentTerms, string> =
  {
    PREPAGO: "Prepago (pagar antes de despachar)",
    CREDITO: "Crédito (pagar después de recibir)",
  };

export function isPrepagoTerms(
  terms: string | null | undefined,
): boolean {
  return (terms ?? "PREPAGO") === "PREPAGO";
}

export function isCreditoTerms(
  terms: string | null | undefined,
): boolean {
  return terms === "CREDITO";
}

/**
 * Futuro: si ya se pagó y no llega lo pedido → nota crédito / reclamo.
 * Hoy solo se documenta el hueco; no hay flujo de NC en la app.
 */
export const PREPAGO_CREDIT_NOTE_TODO =
  "Prepago: faltantes o diferencias tras el pago requieren nota crédito (pendiente de producto).";
