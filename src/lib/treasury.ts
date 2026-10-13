import Decimal from "decimal.js";
import { money, type MoneyInput } from "./money";

export function sumOpeningBalances(balances: MoneyInput[]): string {
  return balances
    .reduce<Decimal>((acc, v) => acc.plus(money(v)), money(0))
    .toFixed(2);
}

export type BankAccountFundPurpose = "VENTAS" | "EMPRESA";

export function bankKindLabel(kind: string, opts?: { isCashFloat?: boolean }) {
  if (opts?.isCashFloat) return "Base / flotante";
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

export function fundPurposeLabel(purpose: string | null | undefined) {
  if (purpose === "EMPRESA") return "Empresa";
  return "Ventas";
}

export function findCashFloatAccount<
  T extends { is_cash_float?: boolean | null; is_active?: boolean },
>(accounts: T[]): T | null {
  return (
    accounts.find((a) => a.is_cash_float && a.is_active !== false) ??
    accounts.find((a) => a.is_cash_float) ??
    null
  );
}

type AccountForClose = {
  id: string;
  account_kind: string;
  is_active: boolean;
  is_cash_float?: boolean | null;
  /** Solo VENTAS entran al cierre. Si falta, se trata como VENTAS. */
  fund_purpose?: string | null;
};

function isSalesAccount(a: AccountForClose) {
  return (a.fund_purpose ?? "VENTAS") === "VENTAS";
}

/**
 * Destinos del cierre (solo cuentas de ventas):
 * - efectivo (ventas) → cuenta CAJA que NO es la base/flotante
 * - adquirencia (débito+crédito) → banco/pasarela donde liquida el datáfono
 * - transferencia/QR → banco donde caen esos abonos (puede ser otro)
 */
export function resolveCashCloseDestinations(
  accounts: AccountForClose[],
  overrides?: {
    cardAccountId?: string | null;
    transferAccountId?: string | null;
  },
): {
  cashAccountId: string | null;
  cardAccountId: string | null;
  transferAccountId: string | null;
} {
  const active = accounts.filter((a) => a.is_active && isSalesAccount(a));
  const cash =
    active.find((a) => a.account_kind === "CAJA" && !a.is_cash_float) ??
    active.find((a) => a.account_kind === "CAJA") ??
    active.find((a) => a.account_kind === "OTRO" && !a.is_cash_float) ??
    null;
  const banks = active.filter(
    (a) =>
      !a.is_cash_float &&
      (a.account_kind === "BANCO" ||
        a.account_kind === "PASARELA" ||
        a.account_kind === "OTRO"),
  );
  const defaultBank = banks[0] ?? null;

  const pickBank = (id: string | null | undefined) => {
    if (!id) return null;
    return banks.find((a) => a.id === id) ?? null;
  };

  const card =
    pickBank(overrides?.cardAccountId) ??
    defaultBank;
  const transfer =
    pickBank(overrides?.transferAccountId) ??
    card ??
    defaultBank;

  return {
    cashAccountId: cash?.id ?? null,
    cardAccountId: card?.id ?? null,
    transferAccountId: transfer?.id ?? null,
  };
}
