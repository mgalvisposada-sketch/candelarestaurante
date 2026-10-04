/**
 * Vacaciones laborales Colombia — CST arts. 186, 187, 189, 192.
 * 15 días hábiles por año de servicio; pago ordinario ≈ salario × días / 30;
 * proporcionales al retiro: salario × días_trabajados / 720.
 */

import { isIndefiniteContract } from "@/lib/hr-documents";
import { todayInBogota } from "@/lib/dates";

export const VACATION_DAYS_PER_YEAR = 15;
/** Año comercial laboral (base de causación / liquidación). */
export const COMMERCIAL_YEAR_DAYS = 360;
/** Aviso mínimo del empleador (art. 187 CST). */
export const VACATION_NOTICE_DAYS = 15;

export type VacationStatus =
  | "PROGRAMADA"
  | "EN_CURSO"
  | "DISFRUTADA"
  | "CANCELADA";

export type VacationUsageInput = {
  business_days: number | string;
  status: string;
};

export type VacationWorkdays = {
  monday?: boolean;
  tuesday?: boolean;
  wednesday?: boolean;
  thursday?: boolean;
  friday?: boolean;
  saturday?: boolean;
  sunday?: boolean;
};

export type VacationEntitlementInput = {
  hireDate: string | null;
  employmentType: string | null;
  contractEndDate?: string | null;
  basicSalary: number;
  vacations: VacationUsageInput[];
  /** Fecha de corte (Bogotá). Default: hoy. */
  asOf?: string;
  workdays?: VacationWorkdays;
};

export type VacationSuggestion = {
  startDate: string;
  endDate: string;
  businessDays: number;
  /** Valor estimado a pagar durante el disfrute (salario × días / 30). */
  payEstimate: number;
  /** Motivo de la fecha sugerida. */
  reason: string;
};

export type VacationEntitlement = {
  applies: boolean;
  reason?: string;
  hireDate: string | null;
  asOf: string;
  serviceEndDate: string;
  calendarDaysWorked: number;
  yearsCompleted: number;
  /** Días hábiles causados (proporcionales). */
  earnedDays: number;
  usedDays: number;
  scheduledDays: number;
  availableDays: number;
  /** Valor si se disfrutan todos los días disponibles. */
  availablePayEstimate: number;
  /** Valor proporcional acumulado tipo liquidación (salario × días / 720). */
  accruedPayIfSettled: number;
  nextAnniversary: string | null;
  suggestion: VacationSuggestion | null;
};

const DEFAULT_WORKDAYS: Required<VacationWorkdays> = {
  monday: true,
  tuesday: true,
  wednesday: true,
  thursday: true,
  friday: true,
  saturday: false,
  sunday: false,
};

function parseIso(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`);
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addCalendarDays(iso: string, days: number): string {
  const d = parseIso(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

function minIso(a: string, b: string): string {
  return a <= b ? a : b;
}

function maxIso(a: string, b: string): string {
  return a >= b ? a : b;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function money(n: number): number {
  return Math.round(n);
}

function isWorkday(iso: string, workdays: Required<VacationWorkdays>): boolean {
  const dow = parseIso(iso).getUTCDay(); // 0=Sun … 6=Sat
  switch (dow) {
    case 0:
      return workdays.sunday;
    case 1:
      return workdays.monday;
    case 2:
      return workdays.tuesday;
    case 3:
      return workdays.wednesday;
    case 4:
      return workdays.thursday;
    case 5:
      return workdays.friday;
    case 6:
      return workdays.saturday;
    default:
      return false;
  }
}

/** Días hábiles inclusivos según jornada (sin festivos). */
export function countBusinessDays(
  startIso: string,
  endIso: string,
  workdays?: VacationWorkdays,
): number {
  const wd = { ...DEFAULT_WORKDAYS, ...workdays };
  const start = parseIso(startIso);
  const end = parseIso(endIso);
  if (end < start) return 0;
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    if (isWorkday(toIso(cur), wd)) count += 1;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

/** Primera fecha ≥ startIso que sea día hábil. */
export function nextBusinessDay(
  startIso: string,
  workdays?: VacationWorkdays,
): string {
  const wd = { ...DEFAULT_WORKDAYS, ...workdays };
  let cur = startIso.slice(0, 10);
  for (let i = 0; i < 14; i += 1) {
    if (isWorkday(cur, wd)) return cur;
    cur = addCalendarDays(cur, 1);
  }
  return cur;
}

/** Fecha fin inclusiva para cubrir `days` hábiles desde start. */
export function endDateForBusinessDays(
  startIso: string,
  days: number,
  workdays?: VacationWorkdays,
): string {
  const wd = { ...DEFAULT_WORKDAYS, ...workdays };
  if (days <= 0) return startIso.slice(0, 10);
  let remaining = Math.ceil(days);
  let cur = nextBusinessDay(startIso, wd);
  let last = cur;
  while (remaining > 0) {
    if (isWorkday(cur, wd)) {
      remaining -= 1;
      last = cur;
    }
    if (remaining === 0) break;
    cur = addCalendarDays(cur, 1);
  }
  return last;
}

/** Días calendario inclusivos entre dos ISO. */
export function calendarDaysInclusive(startIso: string, endIso: string): number {
  const start = parseIso(startIso);
  const end = parseIso(endIso);
  if (end < start) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

export function contractGrantsVacations(employmentType: string | null): boolean {
  if (!employmentType) return true;
  return (
    employmentType !== "PRESTACION_SERVICIOS" &&
    employmentType !== "POR_TURNO"
  );
}

/** Causación proporcional: días_trabajados × 15 / 360. */
export function earnedVacationDays(calendarDaysWorked: number): number {
  if (calendarDaysWorked <= 0) return 0;
  return round2((calendarDaysWorked * VACATION_DAYS_PER_YEAR) / COMMERCIAL_YEAR_DAYS);
}

/** Pago por disfrute: salario ordinario × días hábiles / 30 (art. 192, mes comercial). */
export function vacationEnjoymentPay(
  monthlySalary: number,
  businessDays: number,
): number {
  if (monthlySalary <= 0 || businessDays <= 0) return 0;
  return money((monthlySalary * businessDays) / 30);
}

/** Liquidación proporcional (retiro / consolidadas en dinero): salario × días / 720. */
export function vacationSettlementPay(
  monthlySalary: number,
  calendarDaysWorked: number,
): number {
  if (monthlySalary <= 0 || calendarDaysWorked <= 0) return 0;
  return money((monthlySalary * calendarDaysWorked) / 720);
}

function nextAnniversaryAfter(hireDate: string, asOf: string): string {
  const hire = parseIso(hireDate);
  const asOfD = parseIso(asOf);
  let year = asOfD.getUTCFullYear();
  let candidate = new Date(
    Date.UTC(year, hire.getUTCMonth(), hire.getUTCDate(), 12),
  );
  if (candidate <= asOfD) {
    year += 1;
    candidate = new Date(
      Date.UTC(year, hire.getUTCMonth(), hire.getUTCDate(), 12),
    );
  }
  return toIso(candidate);
}

function yearsCompleted(hireDate: string, asOf: string): number {
  const hire = parseIso(hireDate);
  const end = parseIso(asOf);
  let years = end.getUTCFullYear() - hire.getUTCFullYear();
  const anniversaryThisYear = new Date(
    Date.UTC(end.getUTCFullYear(), hire.getUTCMonth(), hire.getUTCDate(), 12),
  );
  if (end < anniversaryThisYear) years -= 1;
  return Math.max(0, years);
}

function resolveWorkdays(workdays?: VacationWorkdays): Required<VacationWorkdays> {
  return { ...DEFAULT_WORKDAYS, ...workdays };
}

export function computeVacationEntitlement(
  input: VacationEntitlementInput,
): VacationEntitlement {
  const asOf = (input.asOf ?? todayInBogota()).slice(0, 10);
  const workdays = resolveWorkdays(input.workdays);
  const hireDate = input.hireDate?.slice(0, 10) ?? null;
  const indefinite = isIndefiniteContract(input.employmentType ?? "INDEFINIDO");

  const empty: VacationEntitlement = {
    applies: false,
    hireDate,
    asOf,
    serviceEndDate: asOf,
    calendarDaysWorked: 0,
    yearsCompleted: 0,
    earnedDays: 0,
    usedDays: 0,
    scheduledDays: 0,
    availableDays: 0,
    availablePayEstimate: 0,
    accruedPayIfSettled: 0,
    nextAnniversary: null,
    suggestion: null,
  };

  if (!contractGrantsVacations(input.employmentType)) {
    return {
      ...empty,
      reason:
        input.employmentType === "POR_TURNO"
          ? "Por turno/día (prestador) no causa vacaciones del CST."
          : "La prestación de servicios no causa vacaciones del CST.",
    };
  }
  if (!hireDate) {
    return {
      ...empty,
      reason: "Defina la fecha de ingreso para calcular vacaciones.",
    };
  }
  if (hireDate > asOf) {
    return {
      ...empty,
      applies: true,
      reason: "La fecha de ingreso es futura.",
      nextAnniversary: hireDate,
    };
  }

  // Indefinido: causación continua. Término fijo/obra: hasta fin de contrato.
  let serviceEnd = asOf;
  if (!indefinite && input.contractEndDate) {
    const end = input.contractEndDate.slice(0, 10);
    if (end < hireDate) {
      return {
        ...empty,
        applies: true,
        reason: "La fecha de fin de contrato es anterior al ingreso.",
      };
    }
    serviceEnd = minIso(asOf, end);
  }

  const calendarDaysWorked = calendarDaysInclusive(hireDate, serviceEnd);
  const earnedDays = earnedVacationDays(calendarDaysWorked);

  const active = input.vacations.filter((v) => v.status !== "CANCELADA");
  const scheduledDays = round2(
    active
      .filter((v) => v.status === "PROGRAMADA")
      .reduce((a, v) => a + Number(v.business_days || 0), 0),
  );
  const usedDays = round2(
    active
      .filter(
        (v) =>
          v.status === "DISFRUTADA" ||
          v.status === "EN_CURSO" ||
          v.status === "PROGRAMADA",
      )
      .reduce((a, v) => a + Number(v.business_days || 0), 0),
  );
  const availableDays = round2(Math.max(0, earnedDays - usedDays));
  const years = yearsCompleted(hireDate, serviceEnd);
  const nextAnn = nextAnniversaryAfter(hireDate, serviceEnd);

  const availablePayEstimate = vacationEnjoymentPay(
    input.basicSalary,
    availableDays,
  );
  const accruedPayIfSettled = vacationSettlementPay(
    input.basicSalary,
    calendarDaysWorked,
  );

  const suggestion = buildSuggestion({
    availableDays,
    earnedDays,
    asOf,
    nextAnniversary: nextAnn,
    yearsCompleted: years,
    basicSalary: input.basicSalary,
    workdays,
    indefinite,
    contractEndDate: input.contractEndDate?.slice(0, 10) ?? null,
  });

  return {
    applies: true,
    hireDate,
    asOf,
    serviceEndDate: serviceEnd,
    calendarDaysWorked,
    yearsCompleted: years,
    earnedDays,
    usedDays,
    scheduledDays,
    availableDays,
    availablePayEstimate,
    accruedPayIfSettled,
    nextAnniversary: nextAnn,
    suggestion,
  };
}

function buildSuggestion(args: {
  availableDays: number;
  earnedDays: number;
  asOf: string;
  nextAnniversary: string;
  yearsCompleted: number;
  basicSalary: number;
  workdays: Required<VacationWorkdays>;
  indefinite: boolean;
  contractEndDate: string | null;
}): VacationSuggestion | null {
  const take = Math.min(
    VACATION_DAYS_PER_YEAR,
    Math.floor(args.availableDays),
  );
  if (take < 1) {
    // Aún no hay saldo: sugerir el próximo aniversario (cuando se consolidan 15).
    if (args.yearsCompleted < 1 && args.earnedDays < VACATION_DAYS_PER_YEAR) {
      const start = nextBusinessDay(args.nextAnniversary, args.workdays);
      const end = endDateForBusinessDays(
        start,
        VACATION_DAYS_PER_YEAR,
        args.workdays,
      );
      return {
        startDate: start,
        endDate: end,
        businessDays: VACATION_DAYS_PER_YEAR,
        payEstimate: vacationEnjoymentPay(
          args.basicSalary,
          VACATION_DAYS_PER_YEAR,
        ),
        reason: args.indefinite
          ? `Al cumplir 1 año de servicio (${args.nextAnniversary}) causa ${VACATION_DAYS_PER_YEAR} días hábiles (art. 186 CST).`
          : `Al completar el periodo hacia ${args.nextAnniversary} (o al vencer el contrato) se liquidan proporcionales.`,
      };
    }
    return null;
  }

  // Con saldo: aviso mínimo 15 días (art. 187) y empezar en día hábil.
  const earliest = addCalendarDays(args.asOf, VACATION_NOTICE_DAYS);
  let start = nextBusinessDay(maxIso(earliest, args.asOf), args.workdays);

  // Si el aniversario está cerca y aún no se ha disfrutado el periodo completo, priorizarlo.
  if (
    args.nextAnniversary &&
    args.nextAnniversary <= addCalendarDays(args.asOf, 60) &&
    args.availableDays >= 6
  ) {
    const annStart = nextBusinessDay(args.nextAnniversary, args.workdays);
    if (annStart >= earliest) start = annStart;
  }

  if (
    !args.indefinite &&
    args.contractEndDate &&
    start > args.contractEndDate
  ) {
    return null;
  }

  const end = endDateForBusinessDays(start, take, args.workdays);
  return {
    startDate: start,
    endDate: end,
    businessDays: take,
    payEstimate: vacationEnjoymentPay(args.basicSalary, take),
    reason:
      take >= VACATION_DAYS_PER_YEAR
        ? `Periodo completo de ${VACATION_DAYS_PER_YEAR} días hábiles con aviso ≥ ${VACATION_NOTICE_DAYS} días (arts. 186–187 CST).`
        : `Disfrute parcial de ${take} días hábiles del saldo causado (mín. legal anual: 6 días continuos, art. 190).`,
  };
}
