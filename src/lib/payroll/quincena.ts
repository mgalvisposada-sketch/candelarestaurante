import { formatDateCO } from "@/lib/dates";
import { biweeklyRange } from "./schedule";

export type QuincenaMeta = {
  key: string;
  year: number;
  month: number;
  half: 1 | 2;
  label: string;
  rangeLabel: string;
  sortKey: number;
};

export function quincenaFromDate(isoDate: string): QuincenaMeta {
  const [yRaw, mRaw, dRaw] = isoDate.split("-");
  const year = Number(yRaw);
  const month = Number(mRaw);
  const day = Number(dRaw);
  const half: 1 | 2 = day <= 15 ? 1 : 2;
  const range = biweeklyRange(year, month, half);
  return {
    key: `${year}-${String(month).padStart(2, "0")}-${half}`,
    year,
    month,
    half,
    label: `${half === 1 ? "1ª" : "2ª"} quincena ${String(month).padStart(2, "0")}/${year}`,
    rangeLabel: `${formatDateCO(range.startIso)} → ${formatDateCO(range.endIso)}`,
    sortKey: year * 100 + month * 2 + half,
  };
}

export function parseQuincenaKey(key: string): QuincenaMeta | null {
  const m = key.match(/^(\d{4})-(\d{2})-([12])$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const half = Number(m[3]) as 1 | 2;
  const range = biweeklyRange(year, month, half);
  return {
    key,
    year,
    month,
    half,
    label: `${half === 1 ? "1ª" : "2ª"} quincena ${String(month).padStart(2, "0")}/${year}`,
    rangeLabel: `${formatDateCO(range.startIso)} → ${formatDateCO(range.endIso)}`,
    sortKey: year * 100 + month * 2 + half,
  };
}

export function daysInQuincena(meta: Pick<QuincenaMeta, "year" | "month" | "half">): string[] {
  const range = biweeklyRange(meta.year, meta.month, meta.half);
  const days: string[] = [];
  const cursor = new Date(range.start);
  const end = new Date(range.end);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export function shiftWeekdayLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  return d.toLocaleDateString("es-CO", { weekday: "short", timeZone: "UTC" });
}

export function dayNumber(isoDate: string): string {
  return isoDate.slice(8, 10);
}

export function neighboringQuincenas(
  from: QuincenaMeta,
  before = 2,
  after = 1,
): QuincenaMeta[] {
  const out: QuincenaMeta[] = [];
  let year = from.year;
  let month = from.month;
  let half = from.half;

  for (let i = 0; i < before; i++) {
    if (half === 1) {
      half = 2;
      month -= 1;
      if (month < 1) {
        month = 12;
        year -= 1;
      }
    } else {
      half = 1;
    }
  }

  const total = before + 1 + after;
  for (let i = 0; i < total; i++) {
    const range = biweeklyRange(year, month, half);
    out.push({
      key: `${year}-${String(month).padStart(2, "0")}-${half}`,
      year,
      month,
      half,
      label: `${half === 1 ? "1ª" : "2ª"} quincena ${String(month).padStart(2, "0")}/${year}`,
      rangeLabel: `${formatDateCO(range.startIso)} → ${formatDateCO(range.endIso)}`,
      sortKey: year * 100 + month * 2 + half,
    });
    if (half === 1) half = 2;
    else {
      half = 1;
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
  }
  return out.sort((a, b) => b.sortKey - a.sortKey);
}
