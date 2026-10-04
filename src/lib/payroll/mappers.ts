import type {
  EmployeeScheduleInput,
  LegalParamsInput,
  PayrollScheduleInput,
} from "./types";

export function timeFromDb(value: string | null | undefined): string {
  if (!value) return "00:00";
  return value.slice(0, 5);
}

export function mapScheduleRow(row: {
  ordinary_entry_time: string;
  ordinary_exit_time: string;
  break_minutes: number;
  works_monday: boolean;
  works_tuesday: boolean;
  works_wednesday: boolean;
  works_thursday: boolean;
  works_friday: boolean;
  works_saturday: boolean;
  works_sunday: boolean;
}): PayrollScheduleInput {
  return {
    ordinary_entry_time: timeFromDb(row.ordinary_entry_time),
    ordinary_exit_time: timeFromDb(row.ordinary_exit_time),
    break_minutes: Number(row.break_minutes) || 0,
    works_monday: row.works_monday,
    works_tuesday: row.works_tuesday,
    works_wednesday: row.works_wednesday,
    works_thursday: row.works_thursday,
    works_friday: row.works_friday,
    works_saturday: row.works_saturday,
    works_sunday: row.works_sunday,
  };
}

export function mapEmployeeSchedule(row: {
  ordinary_entry_time: string | null;
  ordinary_exit_time: string | null;
  break_minutes: number | null;
  uses_custom_schedule: boolean;
  fallback: PayrollScheduleInput;
}): EmployeeScheduleInput {
  return {
    ordinary_entry_time: timeFromDb(
      row.ordinary_entry_time ?? row.fallback.ordinary_entry_time,
    ),
    ordinary_exit_time: timeFromDb(
      row.ordinary_exit_time ?? row.fallback.ordinary_exit_time,
    ),
    break_minutes:
      row.break_minutes ?? row.fallback.break_minutes ?? 0,
    uses_custom_schedule: Boolean(row.uses_custom_schedule),
  };
}

export function mapLegalParamsRow(row: Record<string, unknown>): LegalParamsInput {
  const n = (k: string, d = 0) => Number(row[k] ?? d);
  const b = (k: string, d = false) => Boolean(row[k] ?? d);
  const t = (k: string, d: string) => timeFromDb(String(row[k] ?? d));
  return {
    max_weekly_hours: n("max_weekly_hours", 42),
    night_start_time: t("night_start_time", "19:00"),
    night_end_time: t("night_end_time", "06:00"),
    surcharge_night_ordinary: n("surcharge_night_ordinary", 35),
    surcharge_sunday_holiday: n("surcharge_sunday_holiday", 90),
    surcharge_extra_day: n("surcharge_extra_day", 25),
    surcharge_extra_night: n("surcharge_extra_night", 75),
    surcharge_extra_day_sunday: n("surcharge_extra_day_sunday", 115),
    surcharge_extra_night_sunday: n("surcharge_extra_night_sunday", 165),
    smmlv: n("smmlv", 1_750_905),
    transport_aid: n("transport_aid", 249_095),
    transport_aid_max_salaries: n("transport_aid_max_salaries", 2),
    employee_health_pct: n("employee_health_pct", 4),
    employee_pension_pct: n("employee_pension_pct", 4),
    solidarity_pension_threshold_smmlv: n(
      "solidarity_pension_threshold_smmlv",
      4,
    ),
    solidarity_pension_pct: n("solidarity_pension_pct", 1),
    apply_solidarity_pension: b("apply_solidarity_pension", true),
    employer_health_pct: n("employer_health_pct", 8.5),
    employer_pension_pct: n("employer_pension_pct", 12),
    arl_pct_level_i: n("arl_pct_level_i", 0.522),
    arl_pct_level_ii: n("arl_pct_level_ii", 1.044),
    arl_pct_level_iii: n("arl_pct_level_iii", 2.436),
    arl_pct_level_iv: n("arl_pct_level_iv", 4.35),
    arl_pct_level_v: n("arl_pct_level_v", 6.96),
    sena_pct: n("sena_pct", 2),
    icbf_pct: n("icbf_pct", 3),
    compensation_fund_pct: n("compensation_fund_pct", 4),
    parafiscal_exemption_max_smmlv: n("parafiscal_exemption_max_smmlv", 10),
    apply_parafiscales: b("apply_parafiscales", true),
    apply_parafiscal_exemption: b("apply_parafiscal_exemption", true),
    provision_prima_pct: n("provision_prima_pct", 8.33),
    provision_cesantias_pct: n("provision_cesantias_pct", 8.33),
    provision_interest_cesantias_pct: n(
      "provision_interest_cesantias_pct",
      1,
    ),
    provision_vacaciones_pct: n("provision_vacaciones_pct", 4.17),
    round_to_peso: b("round_to_peso", true),
  };
}
