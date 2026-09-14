import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

export const APP_TIMEZONE = "America/Bogota";

export function formatDateCO(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? parseISO(value) : value;
  return formatInTimeZone(date, APP_TIMEZONE, "dd/MM/yyyy");
}

export function formatDateTimeCO(
  value: string | Date | null | undefined,
): string {
  if (!value) return "—";
  const date = typeof value === "string" ? parseISO(value) : value;
  return formatInTimeZone(date, APP_TIMEZONE, "dd/MM/yyyy HH:mm");
}

export function todayInBogota(): string {
  return formatInTimeZone(new Date(), APP_TIMEZONE, "yyyy-MM-dd");
}

export function formatMonthLabel(year: number, month: number): string {
  const d = toZonedTime(new Date(Date.UTC(year, month - 1, 1)), APP_TIMEZONE);
  return format(d, "MMMM yyyy", { locale: es });
}
