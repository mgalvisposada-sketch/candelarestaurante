import Decimal from "decimal.js";
import { money, type MoneyInput } from "./money";

/** balance > 0: socio acreedor de Candela; < 0: deudor; = 0: sin saldo */
export function computeShareholderAccountBalance(input: {
  openingBalance: MoneyInput;
  debits: MoneyInput[];
  credits: MoneyInput[];
}) {
  const opening = money(input.openingBalance);
  const debitTotal = input.debits.reduce<Decimal>(
    (acc, v) => acc.plus(money(v)),
    money(0),
  );
  const creditTotal = input.credits.reduce<Decimal>(
    (acc, v) => acc.plus(money(v)),
    money(0),
  );
  return opening.plus(creditTotal).minus(debitTotal);
}

export function shareholderBalanceLabel(balance: MoneyInput): {
  label: "Acreedor de Candela" | "Deudor de Candela" | "Sin saldo";
  tone: "warn" | "info" | "neutral";
} {
  const b = money(balance);
  if (b.gt(0)) return { label: "Acreedor de Candela", tone: "warn" };
  if (b.lt(0)) return { label: "Deudor de Candela", tone: "info" };
  return { label: "Sin saldo", tone: "neutral" };
}

export function sumParticipation(
  percentages: Array<string | number>,
): number {
  return percentages.reduce<number>((acc, p) => acc + Number(p || 0), 0);
}
