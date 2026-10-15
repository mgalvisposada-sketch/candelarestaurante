import Decimal from "decimal.js";
import { money, type MoneyInput } from "./money";

export type BalanceSnapshotInput = {
  bank_account_id: string;
  cutoff_date: string;
  opening_balance: MoneyInput;
  verification_status: string;
};

export type BankTransactionInput = {
  bank_account_id: string;
  transaction_date: string;
  debit: MoneyInput;
  credit: MoneyInput;
  /** PENDIENTE_BANCO no suma al saldo; INGRESADO / null sí. */
  settlement_status?: string | null;
};

/** Créditos de adquirencia aún no vistos en el extracto. */
export function isPendingBankSettlement(
  status: string | null | undefined,
): boolean {
  return status === "PENDIENTE_BANCO";
}

/** Saldo disponible = opening + créditos − débitos (movimientos posteriores al corte). */
export function computeAvailableBalance(opts: {
  openingBalance: MoneyInput;
  credits?: MoneyInput[];
  debits?: MoneyInput[];
}): Decimal {
  const credits = (opts.credits ?? []).reduce<Decimal>(
    (acc, v) => acc.plus(money(v)),
    money(0),
  );
  const debits = (opts.debits ?? []).reduce<Decimal>(
    (acc, v) => acc.plus(money(v)),
    money(0),
  );
  return money(opts.openingBalance).plus(credits).minus(debits);
}

/**
 * Elige el snapshot de corte para una cuenta:
 * 1) fecha de corte org si existe
 * 2) si no, el más reciente por cutoff_date
 */
export function pickOpeningSnapshot(
  snapshots: BalanceSnapshotInput[],
  accountId: string,
  orgCutoff: string | null | undefined,
): BalanceSnapshotInput | null {
  const forAccount = snapshots.filter((s) => s.bank_account_id === accountId);
  if (forAccount.length === 0) return null;
  if (orgCutoff) {
    const atCutoff = forAccount.find((s) => s.cutoff_date === orgCutoff);
    if (atCutoff) return atCutoff;
  }
  return [...forAccount].sort((a, b) =>
    b.cutoff_date.localeCompare(a.cutoff_date),
  )[0]!;
}

/** Movimientos con fecha estrictamente posterior al corte de opening. */
export function movementsAfterCutoff(
  txs: BankTransactionInput[],
  accountId: string,
  cutoffDate: string | null,
): { credits: number[]; debits: number[] } {
  const credits: number[] = [];
  const debits: number[] = [];
  for (const tx of txs) {
    if (tx.bank_account_id !== accountId) continue;
    if (cutoffDate && tx.transaction_date <= cutoffDate) continue;
    if (isPendingBankSettlement(tx.settlement_status)) continue;
    const credit = Number(tx.credit || 0);
    const debit = Number(tx.debit || 0);
    if (credit > 0) credits.push(credit);
    if (debit > 0) debits.push(debit);
  }
  return { credits, debits };
}

export function availableBalanceForAccount(opts: {
  accountId: string;
  snapshots: BalanceSnapshotInput[];
  transactions: BankTransactionInput[];
  orgCutoff: string | null | undefined;
}): Decimal {
  const snap = pickOpeningSnapshot(
    opts.snapshots,
    opts.accountId,
    opts.orgCutoff,
  );
  const cutoff = snap?.cutoff_date ?? null;
  const opening = snap?.opening_balance ?? 0;
  const { credits, debits } = movementsAfterCutoff(
    opts.transactions,
    opts.accountId,
    cutoff,
  );
  return computeAvailableBalance({ openingBalance: opening, credits, debits });
}

export function sumAvailableBalances(
  accountIds: string[],
  opts: {
    snapshots: BalanceSnapshotInput[];
    transactions: BankTransactionInput[];
    orgCutoff: string | null | undefined;
  },
): Decimal {
  return accountIds.reduce<Decimal>(
    (acc, id) =>
      acc.plus(
        availableBalanceForAccount({
          accountId: id,
          snapshots: opts.snapshots,
          transactions: opts.transactions,
          orgCutoff: opts.orgCutoff,
        }),
      ),
    money(0),
  );
}

/** Diferencia declaración vs contraste (positivo = declarado mayor). */
export function contrastDelta(
  declared: MoneyInput,
  reference: MoneyInput | null | undefined,
): Decimal | null {
  if (reference === null || reference === undefined || reference === "") {
    return null;
  }
  return money(declared).minus(money(reference));
}
