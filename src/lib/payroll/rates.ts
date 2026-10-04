import { money } from "@/lib/money";
import type { ArlRiskLevel, LegalParamsInput } from "./types";

/**
 * Valor hora ordinaria (práctica MinTrabajo):
 * divisor mensual = horas_semanales / 6 × 30
 * Con 42 h → 210.
 */
export function monthlyHourDivisor(maxWeeklyHours: number): number {
  return money(maxWeeklyHours).div(6).times(30).toNumber();
}

export function ordinaryHourValue(
  basicSalary: number,
  maxWeeklyHours: number,
): number {
  const divisor = monthlyHourDivisor(maxWeeklyHours);
  if (divisor <= 0) return 0;
  return money(basicSalary).div(divisor).toDecimalPlaces(6).toNumber();
}

export function pctOf(base: number, pct: number): number {
  return money(base).times(pct).div(100).toDecimalPlaces(2).toNumber();
}

export function roundMoney(value: number, roundToPeso: boolean): number {
  if (!roundToPeso) return money(value).toDecimalPlaces(2).toNumber();
  return money(value).toDecimalPlaces(0).toNumber();
}

export function arlPctForLevel(
  legal: LegalParamsInput,
  level: ArlRiskLevel,
): number {
  switch (level) {
    case "I":
      return legal.arl_pct_level_i;
    case "II":
      return legal.arl_pct_level_ii;
    case "III":
      return legal.arl_pct_level_iii;
    case "IV":
      return legal.arl_pct_level_iv;
    case "V":
      return legal.arl_pct_level_v;
    default:
      return legal.arl_pct_level_i;
  }
}

export function isLaborContract(employmentType: string): boolean {
  return (
    employmentType !== "PRESTACION_SERVICIOS" &&
    employmentType !== "POR_TURNO" &&
    employmentType !== "OTRO"
  );
}

/** Prestador pagado por día/turno (sin nómina laboral). */
export function isShiftDayContractor(employmentType: string): boolean {
  return employmentType === "POR_TURNO";
}

export function transportAidApplies(
  basicSalary: number,
  legal: LegalParamsInput,
  override: boolean | null,
): boolean {
  if (override !== null) return override;
  const max = money(legal.smmlv).times(legal.transport_aid_max_salaries);
  return money(basicSalary).lte(max);
}

/**
 * Exoneración art. 114-1 ET / Ley 1607: salario &lt; N SMMLV.
 * Exime salud patronal, SENA e ICBF. No exime Caja, pensión patronal ni ARL.
 */
export function art1141ExemptionApplies(
  basicSalary: number,
  legal: LegalParamsInput,
): boolean {
  if (!legal.apply_parafiscal_exemption) return false;
  const max = money(legal.smmlv).times(legal.parafiscal_exemption_max_smmlv);
  return money(basicSalary).lt(max);
}

/** @deprecated usar art1141ExemptionApplies */
export function parafiscalesExempt(
  basicSalary: number,
  legal: LegalParamsInput,
): boolean {
  if (!legal.apply_parafiscales) return true;
  return art1141ExemptionApplies(basicSalary, legal);
}
