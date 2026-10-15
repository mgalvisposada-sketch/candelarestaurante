/** Precisión alineada a purchase_request_items.quantity_* (numeric 18,3). */
const QTY_SCALE = 1000;

export function roundPurchaseQty(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * QTY_SCALE) / QTY_SCALE;
}

export function formatPurchaseQty(value: number | string): string {
  const n = roundPurchaseQty(Number(value) || 0);
  return Number.isInteger(n) ? String(n) : String(n);
}

/**
 * Parsea cantidad de factura/compra.
 * A diferencia de parseBulkNumber (pensada para costos con miles), aquí el punto
 * es siempre decimal: "4.625" → 4.625 kg, no 4.625 como miles (4625).
 * La coma también es decimal: "4,625" → 4.625.
 */
export function parsePurchaseQtyInput(
  raw: string | undefined,
  fallback?: number,
): number | null {
  if (raw === undefined || String(raw).trim() === "") {
    return fallback === undefined ? null : fallback;
  }

  let s = String(raw).trim().replace(/\s/g, "");
  if (!s) return fallback === undefined ? null : fallback;

  const hasDot = s.includes(".");
  const hasComma = s.includes(",");

  if (hasDot && hasComma) {
    // Último separador = decimal; el otro = miles.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    s = s.replace(",", ".");
  }
  // Solo punto: decimal (4.625 kg). No tratar como miles.

  const n = Number(s);
  if (Number.isNaN(n)) return null;
  return n;
}
