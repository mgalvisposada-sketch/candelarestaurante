import { money } from "@/lib/money";
import { timeToMinutes } from "./schedule";
import type { LegalParamsInput, NoveltyInput } from "./types";

const UNPAID_TYPES = new Set([
  "LLEGADA_TARDE",
  "SALIDA_TEMPRANA",
  "PERMISO_NO_REMUNERADO",
  "AUSENCIA",
]);

export function noveltyMinutes(n: NoveltyInput): number {
  if (n.minutes != null && Number(n.minutes) > 0) return Number(n.minutes);
  if (n.start_time && n.end_time) {
    const a = timeToMinutes(n.start_time);
    let b = timeToMinutes(n.end_time);
    if (b <= a) b += 24 * 60;
    return Math.max(0, b - a);
  }
  return 0;
}

/** Recargo % adicional sobre hora ordinaria para una hora extra en fecha/hora dadas. */
export function overtimeSurchargePct(
  noveltyDate: string,
  startTime: string | null | undefined,
  legal: LegalParamsInput,
): number {
  const dow = new Date(`${noveltyDate}T12:00:00Z`).getUTCDay();
  const isSunday = dow === 0;
  const start = timeToMinutes(startTime ?? "08:00");
  const nightStart = timeToMinutes(legal.night_start_time);
  const nightEnd = timeToMinutes(legal.night_end_time);
  const isNight =
    nightStart < nightEnd
      ? start >= nightStart && start < nightEnd
      : start >= nightStart || start < nightEnd;

  if (isSunday && isNight) return legal.surcharge_extra_night_sunday;
  if (isSunday) return legal.surcharge_extra_day_sunday;
  if (isNight) return legal.surcharge_extra_night;
  return legal.surcharge_extra_day;
}

export type NoveltyImpact = {
  unpaidMinutes: number;
  unpaidTimeDiscount: number;
  overtimeMinutes: number;
  overtimePay: number;
  shiftDays: number;
  shiftPay: number;
  occasionalBonuses: number;
  advances: number;
  authorizedDiscounts: number;
  notes: string[];
};

export function computeNoveltyImpact(
  novelties: NoveltyInput[],
  hourValue: number,
  legal: LegalParamsInput,
): NoveltyImpact {
  let unpaidMinutes = 0;
  let overtimeMinutes = 0;
  let overtimePay = money(0);
  let shiftDays = 0;
  let shiftPay = money(0);
  let occasionalBonuses = money(0);
  let advances = money(0);
  let authorizedDiscounts = money(0);
  const notes: string[] = [];

  for (const n of novelties) {
    if (n.novelty_type === "PERMISO_REMUNERADO") {
      notes.push(`Permiso remunerado ${n.novelty_date} (sin descuento).`);
      continue;
    }

    if (n.novelty_type === "TURNO_LABORADO") {
      shiftDays += 1;
      shiftPay = shiftPay.plus(n.amount ?? 0);
      continue;
    }

    if (UNPAID_TYPES.has(n.novelty_type)) {
      const mins = noveltyMinutes(n);
      unpaidMinutes += mins;
      continue;
    }

    if (n.novelty_type === "HORA_EXTRA") {
      const mins = noveltyMinutes(n);
      overtimeMinutes += mins;
      const hours = mins / 60;
      const pct = overtimeSurchargePct(
        n.novelty_date,
        n.start_time,
        legal,
      );
      // Paga hora ordinaria + recargo extra
      const pay = money(hours)
        .times(hourValue)
        .times(money(100).plus(pct))
        .div(100);
      overtimePay = overtimePay.plus(pay);
      continue;
    }

    if (n.novelty_type === "BONO_OCASIONAL") {
      occasionalBonuses = occasionalBonuses.plus(n.amount ?? 0);
      continue;
    }

    if (n.novelty_type === "ANTICIPO") {
      advances = advances.plus(n.amount ?? 0);
      continue;
    }

    if (n.novelty_type === "DESCUENTO_AUTORIZADO") {
      authorizedDiscounts = authorizedDiscounts.plus(n.amount ?? 0);
    }
  }

  const unpaidTimeDiscount = money(unpaidMinutes)
    .div(60)
    .times(hourValue)
    .toDecimalPlaces(2)
    .toNumber();

  if (unpaidMinutes > 0) {
    notes.push(
      `${unpaidMinutes} min no laborados descontados ($${unpaidTimeDiscount}).`,
    );
  }
  if (overtimeMinutes > 0) {
    notes.push(`${overtimeMinutes} min de hora extra liquidados.`);
  }
  if (shiftDays > 0) {
    notes.push(
      `${shiftDays} turno(s)/día(s) laborado(s) por $${shiftPay.toDecimalPlaces(2).toNumber()}.`,
    );
  }

  return {
    unpaidMinutes,
    unpaidTimeDiscount,
    overtimeMinutes,
    overtimePay: overtimePay.toDecimalPlaces(2).toNumber(),
    shiftDays,
    shiftPay: shiftPay.toDecimalPlaces(2).toNumber(),
    occasionalBonuses: occasionalBonuses.toDecimalPlaces(2).toNumber(),
    advances: advances.toDecimalPlaces(2).toNumber(),
    authorizedDiscounts: authorizedDiscounts.toDecimalPlaces(2).toNumber(),
    notes,
  };
}
