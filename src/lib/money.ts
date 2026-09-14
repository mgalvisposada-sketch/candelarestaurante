import Decimal from "decimal.js";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export type MoneyInput = string | number | Decimal;

export function money(value: MoneyInput = 0): Decimal {
  return value instanceof Decimal ? value : new Decimal(value || 0);
}

export function formatCOP(value: MoneyInput): string {
  const n = money(value).toDecimalPlaces(2);
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n.toNumber());
}

export function addMoney(...values: MoneyInput[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(money(v)), money(0));
}

export function subtractMoney(a: MoneyInput, b: MoneyInput): Decimal {
  return money(a).minus(money(b));
}

/** Saldo de un documento CxP. */
export function apDocumentBalance(
  originalAmount: MoneyInput,
  paidAmount: MoneyInput,
): Decimal {
  const balance = subtractMoney(originalAmount, paidAmount);
  return Decimal.max(balance, 0);
}

export function toMoneyString(value: MoneyInput): string {
  return money(value).toFixed(2);
}
