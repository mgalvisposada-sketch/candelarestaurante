/** Condición comercial del proveedor de insumos. */
export type PurchasePaymentTerms = "CREDITO" | "PREPAGO";

/** Cómo el local piensa pagar esta solicitud (no es el crédito del proveedor). */
export type PurchasePaymentMode = "CREDITO" | "EFECTIVO_INMEDIATO";

export const PURCHASE_PAYMENT_TERMS_LABELS: Record<PurchasePaymentTerms, string> =
  {
    PREPAGO: "Prepago (pagar antes de despachar)",
    CREDITO: "Crédito (pagar después de recibir)",
  };

export const PURCHASE_PAYMENT_TERMS_SHORT: Record<PurchasePaymentTerms, string> =
  {
    PREPAGO: "Prepago",
    CREDITO: "Crédito",
  };

export const PURCHASE_PAYMENT_MODE_LABELS: Record<PurchasePaymentMode, string> =
  {
    CREDITO: "Factura al proveedor (sin efectivo de caja)",
    EFECTIVO_INMEDIATO: "Efectivo de caja (tras autorización)",
  };

export const PURCHASE_PAYMENT_MODE_SHORT: Record<PurchasePaymentMode, string> =
  {
    CREDITO: "Factura",
    EFECTIVO_INMEDIATO: "Efectivo de caja",
  };

export function normalizePurchasePaymentTerms(
  terms: string | null | undefined,
): PurchasePaymentTerms {
  return terms === "CREDITO" ? "CREDITO" : "PREPAGO";
}

export function isPrepagoTerms(
  terms: string | null | undefined,
): boolean {
  return normalizePurchasePaymentTerms(terms) === "PREPAGO";
}

export function isCreditoTerms(
  terms: string | null | undefined,
): boolean {
  return terms === "CREDITO";
}

export function supplierPaymentTermsShort(
  terms: string | null | undefined,
): string {
  return PURCHASE_PAYMENT_TERMS_SHORT[normalizePurchasePaymentTerms(terms)];
}

export function supplierPaymentTermsLabel(
  terms: string | null | undefined,
): string {
  return PURCHASE_PAYMENT_TERMS_LABELS[normalizePurchasePaymentTerms(terms)];
}

/** Etiqueta para selects: "Proveedor · Crédito (2d)". */
export function formatSupplierSelectLabel(
  name: string,
  opts?: {
    terms?: string | null;
    leadTimeDays?: number | null;
  },
): string {
  const parts = [name, supplierPaymentTermsShort(opts?.terms)];
  if (opts?.leadTimeDays != null) {
    parts.push(`${opts.leadTimeDays}d`);
  }
  return parts.join(" · ");
}

export function purchasePaymentModeShort(
  mode: string | null | undefined,
): string {
  if (mode === "EFECTIVO_INMEDIATO") {
    return PURCHASE_PAYMENT_MODE_SHORT.EFECTIVO_INMEDIATO;
  }
  return PURCHASE_PAYMENT_MODE_SHORT.CREDITO;
}

export type SupplierTermsMixEntry = {
  id: string;
  name: string;
  terms: PurchasePaymentTerms;
};

export type SupplierTermsMix = {
  prepago: SupplierTermsMixEntry[];
  credito: SupplierTermsMixEntry[];
  isMixed: boolean;
  hasPrepago: boolean;
  hasCredito: boolean;
};

/** Agrupa proveedores de una solicitud por crédito / prepago. */
export function classifySuppliersByTerms(
  entries: { id: string; name: string; terms?: string | null }[],
): SupplierTermsMix {
  const seen = new Set<string>();
  const prepago: SupplierTermsMixEntry[] = [];
  const credito: SupplierTermsMixEntry[] = [];

  for (const entry of entries) {
    if (!entry.id || seen.has(entry.id)) continue;
    seen.add(entry.id);
    const terms = normalizePurchasePaymentTerms(entry.terms);
    const row = { id: entry.id, name: entry.name, terms };
    if (terms === "PREPAGO") prepago.push(row);
    else credito.push(row);
  }

  return {
    prepago,
    credito,
    isMixed: prepago.length > 0 && credito.length > 0,
    hasPrepago: prepago.length > 0,
    hasCredito: credito.length > 0,
  };
}

/**
 * Futuro: si ya se pagó y no llega lo pedido → nota crédito / reclamo.
 * Hoy solo se documenta el hueco; no hay flujo de NC en la app.
 */
export const PREPAGO_CREDIT_NOTE_TODO =
  "Prepago: faltantes o diferencias tras el pago requieren nota crédito (pendiente de producto).";
