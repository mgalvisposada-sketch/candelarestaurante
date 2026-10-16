import { money } from "@/lib/money";
import {
  biweeklyRange,
  netShiftMinutes,
  resolveEmployeeSchedule,
  splitDayNightMinutes,
  timeToMinutes,
} from "./schedule";
import { overtimeSurchargePct } from "./novelties";
import type {
  AttendanceDayInput,
  AttendanceDayKind,
  AttendanceHoursResult,
  EmployeeScheduleInput,
  HoursBreakdown,
  LegalParamsInput,
  PayrollScheduleInput,
} from "./types";

const WORKED_KINDS = new Set<AttendanceDayKind>([
  "LABORADO",
  "FESTIVO_LABORADO",
]);

function weekdayWorks(
  schedule: PayrollScheduleInput,
  utcDay: number,
): boolean {
  switch (utcDay) {
    case 0:
      return schedule.works_sunday;
    case 1:
      return schedule.works_monday;
    case 2:
      return schedule.works_tuesday;
    case 3:
      return schedule.works_wednesday;
    case 4:
      return schedule.works_thursday;
    case 5:
      return schedule.works_friday;
    case 6:
      return schedule.works_saturday;
    default:
      return false;
  }
}

function isoDateUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Lunes (UTC) de la semana calendario lun–dom de una fecha ISO. */
function weekMondayKey(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  const dow = d.getUTCDay(); // 0=dom … 6=sáb
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + mondayOffset);
  return isoDateUtc(d);
}

/** Precarga filas de planilla desde Horario Candela (+ horario empleado). */
export function buildAttendanceSeedRows(input: {
  year: number;
  month: number;
  half: 1 | 2;
  employeeId: string;
  employee: EmployeeScheduleInput;
  candela: PayrollScheduleInput;
}): Omit<AttendanceDayInput, "id">[] {
  const { start, end } = biweeklyRange(input.year, input.month, input.half);
  const resolved = resolveEmployeeSchedule(input.employee, input.candela);
  const rows: Omit<AttendanceDayInput, "id">[] = [];

  for (
    let d = new Date(start);
    d.getTime() <= end.getTime();
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const workDate = isoDateUtc(d);
    const dow = d.getUTCDay();
    const works = weekdayWorks(input.candela, dow);
    if (!works) {
      rows.push({
        employeeId: input.employeeId,
        workDate,
        dayKind: "DESCANSO",
        entryTime: null,
        exitTime: null,
        breakMinutes: 0,
        notes: null,
      });
      continue;
    }
    rows.push({
      employeeId: input.employeeId,
      workDate,
      dayKind: "LABORADO",
      entryTime: resolved.entry,
      exitTime: resolved.exit,
      breakMinutes: resolved.breakMinutes,
      notes: null,
    });
  }
  return rows;
}

export function validateAttendanceForCalculate(
  days: AttendanceDayInput[],
): { ok: true } | { ok: false; error: string } {
  if (days.length === 0) {
    return {
      ok: false,
      error: "La planilla de asistencia está vacía. Precargue desde Horario Candela.",
    };
  }
  for (const day of days) {
    if (!WORKED_KINDS.has(day.dayKind)) continue;
    if (!day.entryTime || !day.exitTime) {
      return {
        ok: false,
        error: `Falta ingreso/salida en ${day.workDate}. Complete la planilla o márquelo como descanso/festivo.`,
      };
    }
  }
  return { ok: true };
}

function allocateDayNight(
  dayMin: number,
  nightMin: number,
  targetTotal: number,
): { day: number; night: number } {
  const gross = dayMin + nightMin;
  if (gross <= 0 || targetTotal <= 0) return { day: 0, night: 0 };
  if (targetTotal >= gross) return { day: dayMin, night: nightMin };
  const dayShare = Math.round((dayMin / gross) * targetTotal);
  const day = Math.min(dayMin, dayShare);
  const night = Math.min(nightMin, targetTotal - day);
  return { day, night };
}

type DayWorkSlice = {
  workDate: string;
  dayKind: AttendanceDayKind;
  isSundayOrHoliday: boolean;
  ordinaryDay: number;
  ordinaryNight: number;
  otMins: number;
  otDay: number;
  otNight: number;
  faltante: number;
  otPct: number;
};

/**
 * Horas/recargos/extras desde planilla de asistencia (fuente de verdad).
 * Capacidad ordinaria = jornada Candela/empleado (net).
 * Exceso = extra; faltante en LABORADO se compensa con extras de la misma
 * semana (lun–dom), días más antiguos primero (jornada flexible art. 161 CST).
 * Solo el faltante no compensado se descuenta del salario.
 */
export function computeAttendanceHours(input: {
  days: AttendanceDayInput[];
  employee: EmployeeScheduleInput;
  candela: PayrollScheduleInput;
  legal: LegalParamsInput;
  hourValue: number;
}): AttendanceHoursResult {
  const nightStart = timeToMinutes(input.legal.night_start_time);
  const nightEnd = timeToMinutes(input.legal.night_end_time);
  const resolved = resolveEmployeeSchedule(input.employee, input.candela);
  const ordinaryCapacity = netShiftMinutes(
    resolved.entry,
    resolved.exit,
    resolved.breakMinutes,
  );

  let workedDays = 0;
  let sundayDays = 0;
  let holidayWorkedDays = 0;
  let restDays = 0;
  let netWorkedMinutes = 0;
  const notes: string[] = [];
  const slices: DayWorkSlice[] = [];

  const sorted = [...input.days].sort((a, b) =>
    a.workDate.localeCompare(b.workDate),
  );

  for (const day of sorted) {
    if (day.dayKind === "DESCANSO" || day.dayKind === "FESTIVO") {
      restDays += 1;
      continue;
    }
    if (!day.entryTime || !day.exitTime) continue;

    const actualNet = netShiftMinutes(
      day.entryTime,
      day.exitTime,
      day.breakMinutes,
    );
    netWorkedMinutes += actualNet;
    workedDays += 1;

    const entryMin = timeToMinutes(day.entryTime);
    let exitMin = timeToMinutes(day.exitTime);
    if (exitMin <= entryMin) exitMin += 24 * 60;
    const split = splitDayNightMinutes(
      entryMin,
      exitMin,
      nightStart,
      nightEnd,
    );
    let breakLeft = Math.max(0, day.breakMinutes);
    let dayMins = split.day;
    let nightMins = split.night;
    const fromDay = Math.min(dayMins, breakLeft);
    dayMins -= fromDay;
    breakLeft -= fromDay;
    nightMins = Math.max(0, nightMins - breakLeft);

    const dow = new Date(`${day.workDate}T12:00:00Z`).getUTCDay();
    const isSundayOrHoliday = dow === 0 || day.dayKind === "FESTIVO_LABORADO";
    if (day.dayKind === "FESTIVO_LABORADO") holidayWorkedDays += 1;
    if (dow === 0) sundayDays += 1;

    const ordinaryMins = Math.min(actualNet, ordinaryCapacity);
    const otMins = Math.max(0, actualNet - ordinaryCapacity);
    const faltante =
      day.dayKind === "LABORADO"
        ? Math.max(0, ordinaryCapacity - actualNet)
        : 0;

    const ordinarySplit = allocateDayNight(dayMins, nightMins, ordinaryMins);
    const remainingDay = Math.max(0, dayMins - ordinarySplit.day);
    const remainingNight = Math.max(0, nightMins - ordinarySplit.night);
    const otSplit = allocateDayNight(remainingDay, remainingNight, otMins);

    let otPct = 0;
    if (otMins > 0) {
      const otStartMin = entryMin + ordinaryCapacity + day.breakMinutes;
      const clock = ((otStartMin % (24 * 60)) + 24 * 60) % (24 * 60);
      const hh = String(Math.floor(clock / 60)).padStart(2, "0");
      const mm = String(clock % 60).padStart(2, "0");
      const pct = overtimeSurchargePct(
        day.workDate,
        `${hh}:${mm}`,
        input.legal,
      );
      otPct =
        day.dayKind === "FESTIVO_LABORADO" && dow !== 0
          ? Math.max(pct, input.legal.surcharge_extra_day_sunday)
          : pct;
    }

    slices.push({
      workDate: day.workDate,
      dayKind: day.dayKind,
      isSundayOrHoliday,
      ordinaryDay: ordinarySplit.day,
      ordinaryNight: ordinarySplit.night,
      otMins,
      otDay: otSplit.day,
      otNight: otSplit.night,
      faltante,
      otPct,
    });
  }

  // Compensar faltantes con extras de la misma semana (días más antiguos primero).
  let compensatedMinutes = 0;
  const byWeek = new Map<string, DayWorkSlice[]>();
  for (const s of slices) {
    const key = weekMondayKey(s.workDate);
    const list = byWeek.get(key) ?? [];
    list.push(s);
    byWeek.set(key, list);
  }

  for (const weekSlices of byWeek.values()) {
    weekSlices.sort((a, b) => a.workDate.localeCompare(b.workDate));
    let faltanteLeft = weekSlices.reduce((acc, s) => acc + s.faltante, 0);
    for (const s of weekSlices) {
      if (faltanteLeft <= 0 || s.otMins <= 0) continue;
      const take = Math.min(s.otMins, faltanteLeft);
      const moved = allocateDayNight(s.otDay, s.otNight, take);
      s.otMins -= take;
      s.otDay = Math.max(0, s.otDay - moved.day);
      s.otNight = Math.max(0, s.otNight - moved.night);
      s.ordinaryDay += moved.day;
      s.ordinaryNight += moved.night;
      faltanteLeft -= take;
      compensatedMinutes += take;
    }
  }

  const totalFaltante = slices.reduce((acc, s) => acc + s.faltante, 0);
  const unpaidMinutes = Math.max(0, totalFaltante - compensatedMinutes);

  let ordinaryDayMinutes = 0;
  let ordinaryNightMinutes = 0;
  let sundayDayMinutes = 0;
  let sundayNightMinutes = 0;
  let overtimeMinutes = 0;
  let overtimePay = money(0);

  for (const s of slices) {
    if (s.isSundayOrHoliday) {
      sundayDayMinutes += s.ordinaryDay;
      sundayNightMinutes += s.ordinaryNight;
    } else {
      ordinaryDayMinutes += s.ordinaryDay;
      ordinaryNightMinutes += s.ordinaryNight;
    }
    if (s.otMins > 0) {
      overtimeMinutes += s.otMins;
      overtimePay = overtimePay.plus(
        money(s.otMins)
          .div(60)
          .times(input.hourValue)
          .times(money(100).plus(s.otPct))
          .div(100),
      );
    }
  }

  const unpaidTimeDiscount = money(unpaidMinutes)
    .div(60)
    .times(input.hourValue)
    .toDecimalPlaces(2)
    .toNumber();

  notes.push(
    `Planilla de asistencia: ${workedDays} día(s) laborado(s), ${restDays} descanso/festivo.`,
  );
  if (sundayDays > 0 || holidayWorkedDays > 0) {
    notes.push(
      `${sundayDays} domingo(s) y ${holidayWorkedDays} festivo(s) laborado(s) en planilla.`,
    );
  }
  if (compensatedMinutes > 0) {
    notes.push(
      `${compensatedMinutes} min faltantes compensados con extras de la misma semana (jornada flexible).`,
    );
  }
  if (overtimeMinutes > 0) {
    notes.push(`${overtimeMinutes} min extras desde planilla.`);
  }
  if (unpaidMinutes > 0) {
    notes.push(
      `${unpaidMinutes} min bajo jornada ordinaria no compensados, descontados desde planilla ($${unpaidTimeDiscount}).`,
    );
  }

  const hours: HoursBreakdown = {
    ordinaryDayHours: ordinaryDayMinutes / 60,
    ordinaryNightHours: ordinaryNightMinutes / 60,
    sundayDayHours: sundayDayMinutes / 60,
    sundayNightHours: sundayNightMinutes / 60,
    workedDays,
    sundayDays,
  };

  return {
    hours,
    unpaidMinutes,
    unpaidTimeDiscount,
    overtimeMinutes,
    overtimePay: overtimePay.toDecimalPlaces(2).toNumber(),
    netWorkedHours: netWorkedMinutes / 60,
    restDays,
    holidayWorkedDays,
    notes,
  };
}
