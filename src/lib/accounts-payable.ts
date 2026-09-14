import { apDocumentBalance, money, type MoneyInput } from "./money";

export type AgingBucket = "0-30" | "31-60" | "61-90" | ">90";

export interface ApDocForAging {
  dueDate: string | null;
  originalAmount: MoneyInput;
  paidAmount: MoneyInput;
}

export function daysPastDue(dueDate: string | null, asOf: string): number | null {
  if (!dueDate) return null;
  const due = new Date(`${dueDate}T00:00:00`);
  const asOfDate = new Date(`${asOf}T00:00:00`);
  const diffMs = asOfDate.getTime() - due.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function agingBucket(days: number | null): AgingBucket | "sin_vencimiento" {
  if (days === null) return "sin_vencimiento";
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return ">90";
}

export function summarizeApAging(
  docs: ApDocForAging[],
  asOf: string,
): Record<AgingBucket | "sin_vencimiento", string> {
  const buckets: Record<AgingBucket | "sin_vencimiento", ReturnType<typeof money>> = {
    "0-30": money(0),
    "31-60": money(0),
    "61-90": money(0),
    ">90": money(0),
    sin_vencimiento: money(0),
  };

  for (const doc of docs) {
    const balance = apDocumentBalance(doc.originalAmount, doc.paidAmount);
    if (balance.lte(0)) continue;
    const bucket = agingBucket(daysPastDue(doc.dueDate, asOf));
    buckets[bucket] = buckets[bucket].plus(balance);
  }

  return {
    "0-30": buckets["0-30"].toFixed(2),
    "31-60": buckets["31-60"].toFixed(2),
    "61-90": buckets["61-90"].toFixed(2),
    ">90": buckets[">90"].toFixed(2),
    sin_vencimiento: buckets.sin_vencimiento.toFixed(2),
  };
}
