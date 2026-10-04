export type ArlRiskLevel = "I" | "II" | "III" | "IV" | "V";

export type EmploymentContractType =
  | "INDEFINIDO"
  | "TERMINO_FIJO"
  | "OBRA_LABOR"
  | "APRENDIZAJE"
  | "PRESTACION_SERVICIOS"
  | "MEDIO_TIEMPO"
  | "LABORAL"
  | "TEMPORAL"
  | "OTRO";

export type EmployeeBonusType = "FIJA" | "POR_META";

export type PayrollScheduleInput = {
  ordinary_entry_time: string; // HH:mm or HH:mm:ss
  ordinary_exit_time: string;
  break_minutes: number;
  works_monday: boolean;
  works_tuesday: boolean;
  works_wednesday: boolean;
  works_thursday: boolean;
  works_friday: boolean;
  works_saturday: boolean;
  works_sunday: boolean;
};

export type EmployeeScheduleInput = {
  ordinary_entry_time: string;
  ordinary_exit_time: string;
  break_minutes: number;
  uses_custom_schedule: boolean;
};

export type LegalParamsInput = {
  max_weekly_hours: number;
  night_start_time: string;
  night_end_time: string;
  surcharge_night_ordinary: number;
  surcharge_sunday_holiday: number;
  surcharge_extra_day: number;
  surcharge_extra_night: number;
  surcharge_extra_day_sunday: number;
  surcharge_extra_night_sunday: number;
  smmlv: number;
  transport_aid: number;
  transport_aid_max_salaries: number;
  employee_health_pct: number;
  employee_pension_pct: number;
  solidarity_pension_threshold_smmlv: number;
  solidarity_pension_pct: number;
  apply_solidarity_pension: boolean;
  employer_health_pct: number;
  employer_pension_pct: number;
  arl_pct_level_i: number;
  arl_pct_level_ii: number;
  arl_pct_level_iii: number;
  arl_pct_level_iv: number;
  arl_pct_level_v: number;
  sena_pct: number;
  icbf_pct: number;
  compensation_fund_pct: number;
  parafiscal_exemption_max_smmlv: number;
  apply_parafiscales: boolean;
  apply_parafiscal_exemption: boolean;
  provision_prima_pct: number;
  provision_cesantias_pct: number;
  provision_interest_cesantias_pct: number;
  provision_vacaciones_pct: number;
  round_to_peso: boolean;
};

export type BonusInput = {
  bonus_type: EmployeeBonusType;
  name: string;
  amount: number | null;
  percent_of_salary: number | null;
  is_active: boolean;
};

export type ShiftNoveltyType =
  | "LLEGADA_TARDE"
  | "SALIDA_TEMPRANA"
  | "PERMISO_REMUNERADO"
  | "PERMISO_NO_REMUNERADO"
  | "AUSENCIA"
  | "HORA_EXTRA"
  | "ANTICIPO"
  | "DESCUENTO_AUTORIZADO"
  | "BONO_OCASIONAL";

export type NoveltyInput = {
  id?: string;
  novelty_type: ShiftNoveltyType;
  novelty_date: string; // yyyy-mm-dd
  minutes?: number | null;
  amount?: number | null;
  start_time?: string | null;
  end_time?: string | null;
};

export type BiweeklyHalf = 1 | 2;

export type SimulateBiweeklyInput = {
  year: number;
  month: number; // 1-12
  half: BiweeklyHalf;
  basicSalary: number;
  employmentType: EmploymentContractType;
  receivesTransportAid: boolean | null;
  arlRiskLevel: ArlRiskLevel;
  schedule: EmployeeScheduleInput;
  candelaSchedule: PayrollScheduleInput;
  legal: LegalParamsInput;
  bonuses: BonusInput[];
  /** Incluir bonos POR_META como estimado en la simulación */
  includeGoalBonuses?: boolean;
  /** Solo novedades ya aprobadas */
  novelties?: NoveltyInput[];
};

export type HoursBreakdown = {
  ordinaryDayHours: number;
  ordinaryNightHours: number;
  sundayDayHours: number;
  sundayNightHours: number;
  workedDays: number;
  sundayDays: number;
};

export type BiweeklySimulation = {
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  hours: HoursBreakdown;
  ordinaryHourValue: number;
  earnings: {
    basicSalary: number;
    nightSurcharge: number;
    sundaySurcharge: number;
    fixedBonuses: number;
    goalBonuses: number;
    transportAid: number;
    overtime: number;
    occasionalBonuses: number;
    unpaidTimeDiscount: number;
    total: number;
  };
  deductions: {
    health: number;
    pension: number;
    solidarity: number;
    advances: number;
    authorizedDiscounts: number;
    total: number;
  };
  novelties: {
    count: number;
    unpaidMinutes: number;
    overtimeMinutes: number;
    overtimePay: number;
    occasionalBonuses: number;
    advances: number;
    authorizedDiscounts: number;
    unpaidTimeDiscount: number;
  };
  employer: {
    health: number;
    pension: number;
    arl: number;
    sena: number;
    icbf: number;
    compensationFund: number;
    totalContributions: number;
  };
  provisions: {
    prima: number;
    cesantias: number;
    interestCesantias: number;
    vacaciones: number;
    total: number;
  };
  netPay: number;
  employerCost: number;
  notes: string[];
  usesCustomSchedule: boolean;
};
