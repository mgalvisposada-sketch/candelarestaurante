import Decimal from "decimal.js";
import { money, type MoneyInput } from "./money";

export function sumOpeningBalances(balances: MoneyInput[]): string {
  return balances
    .reduce<Decimal>((acc, v) => acc.plus(money(v)), money(0))
    .toFixed(2);
}

export function bankKindLabel(kind: string): string {
  switch (kind) {
    case "BANCO":
      return "Banco";
    case "CAJA":
      return "Caja";
    case "PASARELA":
      return "Pasarela";
    case "OTRO":
      return "Otro";
    default:
      return kind;
  }
}
