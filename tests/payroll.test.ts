import { describe, expect, it } from "vitest";
import {
  art1141ExemptionApplies,
  computePeriodHours,
  ordinaryHourValue,
  scheduleDiffSummary,
  simulateBiweekly,
  splitDayNightMinutes,
  transportAidApplies,
  type LegalParamsInput,
  type PayrollScheduleInput,
} from "../src/lib/payroll";

const legalBase: LegalParamsInput = {
  max_weekly_hours: 42,
  night_start_time: "19:00",
  night_end_time: "06:00",
  surcharge_night_ordinary: 35,
  surcharge_sunday_holiday: 90,
  surcharge_extra_day: 25,
  surcharge_extra_night: 75,
  surcharge_extra_day_sunday: 115,
  surcharge_extra_night_sunday: 165,
  smmlv: 1_750_905,
  transport_aid: 249_095,
  transport_aid_max_salaries: 2,
  employee_health_pct: 4,
  employee_pension_pct: 4,
  solidarity_pension_threshold_smmlv: 4,
  solidarity_pension_pct: 1,
  apply_solidarity_pension: true,
  employer_health_pct: 8.5,
  employer_pension_pct: 12,
  arl_pct_level_i: 0.522,
  arl_pct_level_ii: 1.044,
  arl_pct_level_iii: 2.436,
  arl_pct_level_iv: 4.35,
  arl_pct_level_v: 6.96,
  sena_pct: 2,
  icbf_pct: 3,
  compensation_fund_pct: 4,
  parafiscal_exemption_max_smmlv: 10,
  apply_parafiscales: true,
  apply_parafiscal_exemption: true,
  provision_prima_pct: 8.33,
  provision_cesantias_pct: 8.33,
  provision_interest_cesantias_pct: 1,
  provision_vacaciones_pct: 4.17,
  round_to_peso: true,
};

const candelaClosedSunday: PayrollScheduleInput = {
  ordinary_entry_time: "10:00",
  ordinary_exit_time: "22:00",
  break_minutes: 60,
  works_monday: true,
  works_tuesday: true,
  works_wednesday: true,
  works_thursday: true,
  works_friday: true,
  works_saturday: true,
  works_sunday: false,
};

const candelaOpenSunday: PayrollScheduleInput = {
  ...candelaClosedSunday,
  works_sunday: true,
};

describe("payroll schedule helpers", () => {
  it("parte turno en diurno/nocturno con ventana desde 19:00", () => {
    // 18:00–21:00 → 60 min día + 120 min noche (noche desde 19:00)
    const split = splitDayNightMinutes(
      18 * 60,
      21 * 60,
      19 * 60,
      6 * 60,
    );
    expect(split.day).toBe(60);
    expect(split.night).toBe(120);
  });

  it("calcula valor hora ordinaria con divisor 210 (42h)", () => {
    const hv = ordinaryHourValue(1_750_905, 42);
    // 1750905 / (42/6*30) = 1750905 / 210
    expect(hv).toBeCloseTo(1_750_905 / 210, 4);
  });

  it("resume diff de horario personalizado", () => {
    const summary = scheduleDiffSummary(
      {
        ordinary_entry_time: "11:00",
        ordinary_exit_time: "22:00",
        break_minutes: 60,
        uses_custom_schedule: true,
      },
      candelaClosedSunday,
    );
    expect(summary).toContain("Entrada 11:00 vs Candela 10:00");
  });
});

describe("horas quincenales", () => {
  it("turno diurno sin domingo abierto no genera horas dominicales", () => {
    const hours = computePeriodHours({
      year: 2026,
      month: 1,
      half: 1,
      employee: {
        ordinary_entry_time: "10:00",
        ordinary_exit_time: "18:00",
        break_minutes: 60,
        uses_custom_schedule: true,
      },
      candela: candelaClosedSunday,
      nightStart: "19:00",
      nightEnd: "06:00",
    });
    expect(hours.sundayDays).toBe(0);
    expect(hours.sundayDayHours).toBe(0);
    expect(hours.ordinaryNightHours).toBe(0);
    expect(hours.workedDays).toBeGreaterThan(0);
  });

  it("turno que cruza 19:00 acumula horas nocturnas", () => {
    const hours = computePeriodHours({
      year: 2026,
      month: 1,
      half: 1,
      employee: {
        ordinary_entry_time: "14:00",
        ordinary_exit_time: "22:00",
        break_minutes: 60,
        uses_custom_schedule: true,
      },
      candela: candelaClosedSunday,
      nightStart: "19:00",
      nightEnd: "06:00",
    });
    expect(hours.ordinaryNightHours).toBeGreaterThan(0);
  });

  it("domingo abierto cuenta horas dominicales", () => {
    const hours = computePeriodHours({
      year: 2026,
      month: 1,
      half: 1,
      employee: {
        ordinary_entry_time: "10:00",
        ordinary_exit_time: "18:00",
        break_minutes: 60,
        uses_custom_schedule: false,
      },
      candela: candelaOpenSunday,
      nightStart: "19:00",
      nightEnd: "06:00",
    });
    expect(hours.sundayDays).toBe(2);
    expect(hours.sundayDayHours).toBeGreaterThan(0);
  });
});

describe("simulateBiweekly", () => {
  it("aplica auxilio si salario ≤ 2 SMMLV y exoneración 114-1", () => {
    expect(transportAidApplies(1_750_905, legalBase, null)).toBe(true);
    expect(transportAidApplies(3_600_000, legalBase, null)).toBe(false);
    expect(art1141ExemptionApplies(1_750_905, legalBase)).toBe(true);
    expect(art1141ExemptionApplies(17_509_050, legalBase)).toBe(false);

    const sim = simulateBiweekly({
      year: 2026,
      month: 1,
      half: 1,
      basicSalary: 1_750_905,
      employmentType: "INDEFINIDO",
      receivesTransportAid: null,
      arlRiskLevel: "I",
      schedule: {
        ordinary_entry_time: "10:00",
        ordinary_exit_time: "18:00",
        break_minutes: 60,
        uses_custom_schedule: false,
      },
      candelaSchedule: candelaClosedSunday,
      legal: legalBase,
      bonuses: [],
    });
    expect(sim.earnings.transportAid).toBe(124_548); // 249095 / 2 redondeado
    expect(sim.earnings.basicSalary).toBe(875_453); // 1750905 / 2
    expect(sim.deductions.health).toBeGreaterThan(0);
    expect(sim.employer.health).toBe(0); // exonerado 114-1
    expect(sim.employer.sena).toBe(0);
    expect(sim.employer.icbf).toBe(0);
    expect(sim.employer.compensationFund).toBeGreaterThan(0); // caja sí
    expect(sim.employer.pension).toBeGreaterThan(0);
    expect(sim.provisions.total).toBeGreaterThan(0);
    expect(sim.netPay).toBeLessThan(sim.earnings.total);
    expect(sim.employerCost).toBeGreaterThan(sim.earnings.total);
  });

  it("aplica novedades aprobadas: tarde + bono + anticipo", () => {
    const sim = simulateBiweekly({
      year: 2026,
      month: 1,
      half: 1,
      basicSalary: 1_750_905,
      employmentType: "INDEFINIDO",
      receivesTransportAid: null,
      arlRiskLevel: "III",
      schedule: {
        ordinary_entry_time: "10:00",
        ordinary_exit_time: "18:00",
        break_minutes: 60,
        uses_custom_schedule: true,
      },
      candelaSchedule: candelaClosedSunday,
      legal: legalBase,
      bonuses: [],
      novelties: [
        {
          novelty_type: "LLEGADA_TARDE",
          novelty_date: "2026-01-05",
          minutes: 60,
        },
        {
          novelty_type: "BONO_OCASIONAL",
          novelty_date: "2026-01-10",
          amount: 50_000,
        },
        {
          novelty_type: "ANTICIPO",
          novelty_date: "2026-01-08",
          amount: 30_000,
        },
      ],
    });
    expect(sim.novelties.count).toBe(3);
    expect(sim.novelties.unpaidMinutes).toBe(60);
    expect(sim.earnings.occasionalBonuses).toBe(50_000);
    expect(sim.deductions.advances).toBe(30_000);
    expect(sim.earnings.unpaidTimeDiscount).toBeGreaterThan(0);
  });

  it("marca horario personalizado en notas", () => {
    const sim = simulateBiweekly({
      year: 2026,
      month: 1,
      half: 2,
      basicSalary: 2_000_000,
      employmentType: "INDEFINIDO",
      receivesTransportAid: false,
      arlRiskLevel: "II",
      schedule: {
        ordinary_entry_time: "12:00",
        ordinary_exit_time: "22:00",
        break_minutes: 30,
        uses_custom_schedule: true,
      },
      candelaSchedule: candelaClosedSunday,
      legal: legalBase,
      bonuses: [
        {
          bonus_type: "FIJA",
          name: "Propina fija",
          amount: 200_000,
          percent_of_salary: null,
          is_active: true,
        },
      ],
    });
    expect(sim.usesCustomSchedule).toBe(true);
    expect(sim.earnings.fixedBonuses).toBe(100_000);
    expect(sim.notes.some((n) => n.includes("personalizado"))).toBe(true);
  });
});
