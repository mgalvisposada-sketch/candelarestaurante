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
