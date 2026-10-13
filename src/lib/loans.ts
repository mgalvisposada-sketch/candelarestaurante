import Decimal from "decimal.js";
import { money, type MoneyInput } from "./money";

export interface LoanKpisInput {
  approvedPrincipal: MoneyInput;
  disbursements: MoneyInput[];
  principalPaid: MoneyInput[];
  interestAccrued: MoneyInput;
  interestPaid: MoneyInput[];
}

export interface LoanKpis {
  capitalInicial: Decimal;
  capitalDesembolsado: Decimal;
  capitalPagado: Decimal;
  interesCausado: Decimal;
  interesPagado: Decimal;
  saldoCapital: Decimal;
}

export function computeLoanKpis(input: LoanKpisInput): LoanKpis {
  const capitalInicial = money(input.approvedPrincipal);
  const capitalDesembolsado = input.disbursements.reduce<Decimal>(
    (acc, v) => acc.plus(money(v)),
    money(0),
  );
  const capitalPagado = input.principalPaid.reduce<Decimal>(
    (acc, v) => acc.plus(money(v)),
    money(0),
  );
  const interesCausado = money(input.interestAccrued);
  const interesPagado = input.interestPaid.reduce<Decimal>(
    (acc, v) => acc.plus(money(v)),
    money(0),
  );
  const saldoCapital = Decimal.max(
    capitalDesembolsado.minus(capitalPagado),
    0,
  );

  return {
    capitalInicial,
    capitalDesembolsado,
    capitalPagado,
    interesCausado,
    interesPagado,
    saldoCapital,
  };
}

export interface FundingBagKpis {
  aprobado: Decimal;
  comprometido: Decimal;
  pagado: Decimal;
  disponible: Decimal;
}

export function computeFundingBag(input: {
  approved: MoneyInput;
  committed: MoneyInput;
  paid: MoneyInput;
}): FundingBagKpis {
  const aprobado = money(input.approved);
  const comprometido = money(input.committed);
  const pagado = money(input.paid);
  const disponible = Decimal.max(aprobado.minus(comprometido), 0);
  return { aprobado, comprometido, pagado, disponible };
}

/** Estado del ingreso del préstamo en una cuenta puntual de tesorería. */
export type DisbursementTreasuryStatus =
  | "EN_TESORERIA"
  | "SIN_CUENTA"
  | "PENDIENTE_INGRESO";

export function disbursementTreasuryStatus(d: {
  bank_account_id: string | null | undefined;
  bank_transaction_id: string | null | undefined;
}): DisbursementTreasuryStatus {
  if (d.bank_transaction_id) return "EN_TESORERIA";
  if (!d.bank_account_id) return "SIN_CUENTA";
  return "PENDIENTE_INGRESO";
}
