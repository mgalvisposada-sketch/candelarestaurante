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

type AccountForClose = {
  id: string;
  account_kind: string;
  is_active: boolean;
};

/**
 * Destinos automáticos del cierre:
 * - efectivo → primera cuenta CAJA activa
 * - datáfono → primera BANCO (o PASARELA) activa
 * - transferencia/QR → misma cuenta del datáfono (cae al banco)
 */
export function resolveCashCloseDestinations(accounts: AccountForClose[]): {
  cashAccountId: string | null;
  cardAccountId: string | null;
  transferAccountId: string | null;
} {
  const active = accounts.filter((a) => a.is_active);
  const cash =
    active.find((a) => a.account_kind === "CAJA") ??
    active.find((a) => a.account_kind === "OTRO") ??
    null;
  const bank =
    active.find((a) => a.account_kind === "BANCO") ??
    active.find((a) => a.account_kind === "PASARELA") ??
    active.find((a) => a.account_kind === "OTRO") ??
    null;
  return {
    cashAccountId: cash?.id ?? null,
    cardAccountId: bank?.id ?? null,
    transferAccountId: bank?.id ?? null,
  };
}
