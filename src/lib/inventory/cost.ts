import { money } from "@/lib/money";

/**
 * Costo unitario promedio ponderado al ingresar mercancía.
 * Si no hay stock previo, el costo queda en el de la compra entrante.
 */
export function weightedAverageUnitCost(
  currentStock: number,
  currentUnitCost: number,
  incomingQty: number,
  incomingUnitCost: number,
): number {
  const stock = Number.isFinite(currentStock) ? Math.max(0, currentStock) : 0;
  const incoming = Number.isFinite(incomingQty) ? Math.max(0, incomingQty) : 0;
  const costBefore = Number.isFinite(currentUnitCost) ? Math.max(0, currentUnitCost) : 0;
  const costIn = Number.isFinite(incomingUnitCost) ? Math.max(0, incomingUnitCost) : 0;

  if (incoming <= 0) return costBefore;
  if (stock <= 0) return costIn;

  const total = stock * costBefore + incoming * costIn;
  return total / (stock + incoming);
}

/** Cantidad sugerida a comprar para volver al mínimo. */
export function suggestedPurchaseQty(
  currentStock: number,
  minStock: number,
): number {
  const current = Number.isFinite(currentStock) ? currentStock : 0;
  const min = Number.isFinite(minStock) ? minStock : 0;
  return Math.max(0, min - current);
}

/**
 * Indexa un costo unitario por variación de mercado (%).
 * Ej: +5 → sube 5%; -3 → baja 3%. Nunca queda negativo.
 */
export function indexUnitCost(
  currentUnitCost: number,
  percentChange: number,
): number {
  const cost = money(
    Number.isFinite(currentUnitCost) ? Math.max(0, currentUnitCost) : 0,
  );
  const pct = Number.isFinite(percentChange) ? percentChange : 0;
  const next = cost.times(money(1).plus(money(pct).div(100)));
  if (next.isNegative()) return 0;
  return next.toDecimalPlaces(6).toNumber();
}
