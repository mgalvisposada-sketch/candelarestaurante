import { money } from "@/lib/money";
import type { NoveltyInput } from "./types";

export type ShiftContractorSettlement = {
  shiftDays: number;
  shiftPay: number;
  occasionalBonuses: number;
  advances: number;
  authorizedDiscounts: number;
  netPay: number;
  notes: string[];
};

/** Neto a pagar a un prestador POR_TURNO a partir de novedades aprobadas. */
export function computeShiftContractorSettlement(
  novelties: NoveltyInput[],
): ShiftContractorSettlement {
  let shiftDays = 0;
  let shiftPay = money(0);
  let occasionalBonuses = money(0);
  let advances = money(0);
  let authorizedDiscounts = money(0);
  const notes: string[] = [];

  for (const n of novelties) {
    if (n.novelty_type === "TURNO_LABORADO") {
      shiftDays += 1;
      shiftPay = shiftPay.plus(n.amount ?? 0);
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

  if (shiftDays === 0) {
    notes.push("Sin turnos laborados aprobados en la quincena.");
  } else {
    notes.push(
      `${shiftDays} turno(s) por $${shiftPay.toDecimalPlaces(2).toNumber()}.`,
    );
  }
  if (occasionalBonuses.gt(0)) {
    notes.push(`Bonos ocasionales: $${occasionalBonuses.toDecimalPlaces(2).toNumber()}.`);
  }
  if (advances.gt(0)) {
    notes.push(`Anticipos a descontar: $${advances.toDecimalPlaces(2).toNumber()}.`);
  }
  if (authorizedDiscounts.gt(0)) {
    notes.push(
      `Descuentos autorizados: $${authorizedDiscounts.toDecimalPlaces(2).toNumber()}.`,
    );
  }

  let net = shiftPay
    .plus(occasionalBonuses)
    .minus(advances)
    .minus(authorizedDiscounts);
  if (net.lt(0)) net = money(0);

  return {
    shiftDays,
    shiftPay: shiftPay.toDecimalPlaces(2).toNumber(),
    occasionalBonuses: occasionalBonuses.toDecimalPlaces(2).toNumber(),
    advances: advances.toDecimalPlaces(2).toNumber(),
    authorizedDiscounts: authorizedDiscounts.toDecimalPlaces(2).toNumber(),
    netPay: net.toDecimalPlaces(2).toNumber(),
    notes,
  };
}
