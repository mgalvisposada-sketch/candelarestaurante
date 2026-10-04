import type {
  EmployeeScheduleInput,
  HoursBreakdown,
  PayrollScheduleInput,
} from "./types";

/** Parse "HH:mm" or "HH:mm:ss" to minutes from midnight. */
export function timeToMinutes(value: string): number {
  const parts = value.trim().split(":");
  const h = Number(parts[0] ?? 0);
  const m = Number(parts[1] ?? 0);
  return h * 60 + m;
}

export function minutesToHours(minutes: number): number {
  return minutes / 60;
}

export function formatTimeHm(value: string | null | undefined): string {
  if (!value) return "—";
  const [h, m] = value.split(":");
  return `${(h ?? "00").padStart(2, "0")}:${(m ?? "00").padStart(2, "0")}`;
}

export function biweeklyRange(
  year: number,
  month: number,
  half: 1 | 2,
): { start: Date; end: Date; startIso: string; endIso: string } {
  const startDay = half === 1 ? 1 : 16;
  const endDay =
    half === 1 ? 15 : new Date(Date.UTC(year, month, 0)).getUTCDate();
  const start = new Date(Date.UTC(year, month - 1, startDay));
  const end = new Date(Date.UTC(year, month - 1, endDay));
  return {
    start,
    end,
    startIso: start.toISOString().slice(0, 10),
    endIso: end.toISOString().slice(0, 10),
  };
}

function weekdayWorks(
  schedule: PayrollScheduleInput,
  utcDay: number,
): boolean {
  // JS getUTCDay: 0=Sun … 6=Sat
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

/**
 * Split a shift into day/night minutes given night window that may wrap midnight
 * (e.g. 19:00–06:00).
 */
export function splitDayNightMinutes(
  entryMin: number,
  exitMin: number,
  nightStart: number,
  nightEnd: number,
): { day: number; night: number } {
  let end = exitMin;
  if (end <= entryMin) end += 24 * 60;

  let day = 0;
  let night = 0;
  for (let t = entryMin; t < end; t++) {
    const clock = ((t % (24 * 60)) + 24 * 60) % (24 * 60);
    const isNight =
      nightStart < nightEnd
        ? clock >= nightStart && clock < nightEnd
        : clock >= nightStart || clock < nightEnd;
    if (isNight) night += 1;
    else day += 1;
  }
  return { day, night };
}

/** Net paid minutes in a shift after break (break deducted from day portion first). */
export function netShiftMinutes(
  entry: string,
  exit: string,
  breakMinutes: number,
): number {
  const entryMin = timeToMinutes(entry);
  let exitMin = timeToMinutes(exit);
  if (exitMin <= entryMin) exitMin += 24 * 60;
  const gross = exitMin - entryMin;
  return Math.max(0, gross - Math.max(0, breakMinutes));
}

export function resolveEmployeeSchedule(
  employee: EmployeeScheduleInput,
  candela: PayrollScheduleInput,
): { entry: string; exit: string; breakMinutes: number } {
  if (employee.uses_custom_schedule) {
    return {
      entry: employee.ordinary_entry_time,
      exit: employee.ordinary_exit_time,
      breakMinutes: employee.break_minutes,
    };
  }
  return {
    entry: candela.ordinary_entry_time,
    exit: candela.ordinary_exit_time,
    breakMinutes: candela.break_minutes,
  };
}

export function scheduleDiffSummary(
  employee: EmployeeScheduleInput,
  candela: PayrollScheduleInput,
): string | null {
  if (!employee.uses_custom_schedule) return null;
  const parts: string[] = [];
  const eIn = formatTimeHm(employee.ordinary_entry_time);
  const cIn = formatTimeHm(candela.ordinary_entry_time);
  const eOut = formatTimeHm(employee.ordinary_exit_time);
  const cOut = formatTimeHm(candela.ordinary_exit_time);
  if (eIn !== cIn) parts.push(`Entrada ${eIn} vs Candela ${cIn}`);
  if (eOut !== cOut) parts.push(`Salida ${eOut} vs Candela ${cOut}`);
  if (employee.break_minutes !== candela.break_minutes) {
    parts.push(
      `Descanso ${employee.break_minutes} min vs Candela ${candela.break_minutes} min`,
    );
  }
  return parts.length > 0 ? parts.join(" · ") : "Horario personalizado";
}

/**
 * Count ordinary hours in a biweekly period for restaurant open days.
 * Without "novedades", extras are not assumed — only night/sunday surcharges
 * on the ordinary scheduled shift.
 */
export function computePeriodHours(input: {
  year: number;
  month: number;
  half: 1 | 2;
  employee: EmployeeScheduleInput;
  candela: PayrollScheduleInput;
  nightStart: string;
  nightEnd: string;
}): HoursBreakdown {
  const { start, end } = biweeklyRange(input.year, input.month, input.half);
  const resolved = resolveEmployeeSchedule(input.employee, input.candela);
  const nightStart = timeToMinutes(input.nightStart);
  const nightEnd = timeToMinutes(input.nightEnd);

  let ordinaryDayMinutes = 0;
  let ordinaryNightMinutes = 0;
  let sundayDayMinutes = 0;
  let sundayNightMinutes = 0;
  let workedDays = 0;
  let sundayDays = 0;

  for (
    let d = new Date(start);
    d.getTime() <= end.getTime();
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const dow = d.getUTCDay();
    if (!weekdayWorks(input.candela, dow)) continue;

    workedDays += 1;
    const isSunday = dow === 0;
    if (isSunday) sundayDays += 1;

    const entryMin = timeToMinutes(resolved.entry);
    let exitMin = timeToMinutes(resolved.exit);
    if (exitMin <= entryMin) exitMin += 24 * 60;

    const split = splitDayNightMinutes(
      entryMin,
      exitMin,
      nightStart,
      nightEnd,
    );

    // Deduct break from day minutes first, then night
    let breakLeft = Math.max(0, resolved.breakMinutes);
    let day = split.day;
    let night = split.night;
    const fromDay = Math.min(day, breakLeft);
    day -= fromDay;
    breakLeft -= fromDay;
    night = Math.max(0, night - breakLeft);

    if (isSunday) {
      sundayDayMinutes += day;
      sundayNightMinutes += night;
    } else {
      ordinaryDayMinutes += day;
      ordinaryNightMinutes += night;
    }
  }

  return {
    ordinaryDayHours: minutesToHours(ordinaryDayMinutes),
    ordinaryNightHours: minutesToHours(ordinaryNightMinutes),
    sundayDayHours: minutesToHours(sundayDayMinutes),
    sundayNightHours: minutesToHours(sundayNightMinutes),
    workedDays,
    sundayDays,
  };
}
