import { money } from "@/lib/money";
import {
  biweeklyRange,
  computePeriodHours,
} from "./schedule";
import {
  arlPctForLevel,
  art1141ExemptionApplies,
  isLaborContract,
  isShiftDayContractor,
  ordinaryHourValue,
  pctOf,
  roundMoney,
  transportAidApplies,
} from "./rates";
import { computeNoveltyImpact } from "./novelties";
import type {
  BiweeklySimulation,
  BonusInput,
  SimulateBiweeklyInput,
} from "./types";

function bonusAmount(bonus: BonusInput, monthlySalary: number): number {
  if (bonus.amount != null && !Number.isNaN(bonus.amount)) {
    return money(bonus.amount).toDecimalPlaces(2).toNumber();
  }
  if (bonus.percent_of_salary != null) {
    return pctOf(monthlySalary, bonus.percent_of_salary);
  }
  return 0;
}

export function simulateBiweekly(
  input: SimulateBiweeklyInput,
): BiweeklySimulation {
  const notes: string[] = [];
  const { startIso, endIso } = biweeklyRange(
    input.year,
    input.month,
    input.half,
  );
  const periodLabel = `${input.half === 1 ? "1ª" : "2ª"} quincena ${String(input.month).padStart(2, "0")}/${input.year}`;

  const hours = computePeriodHours({
    year: input.year,
    month: input.month,
    half: input.half,
    employee: input.schedule,
    candela: input.candelaSchedule,
    nightStart: input.legal.night_start_time,
    nightEnd: input.legal.night_end_time,
  });

  const hourValue = ordinaryHourValue(
    input.basicSalary,
    input.legal.max_weekly_hours,
  );

  const labor = isLaborContract(input.employmentType);
  const byShift = isShiftDayContractor(input.employmentType);
  if (byShift) {
    notes.push(
      "Por turno/día (prestador): se paga solo turnos reportados y aprobados. Sin aportes, auxilio ni provisiones de nómina.",
    );
  } else if (!labor) {
    notes.push(
      "Prestación de servicios: se estiman honorarios quincenales sin aportes laborales ni provisiones de nómina.",
    );
  }

  // POR_TURNO: basic_salary = tarifa por turno/día; el básico quincenal sale de turnos.
  const basicBiweekly = byShift
    ? money(0)
    : money(input.basicSalary).div(2).toDecimalPlaces(2);

  const nightSurcharge = byShift
    ? money(0)
    : money(hours.ordinaryNightHours)
        .times(hourValue)
        .times(input.legal.surcharge_night_ordinary)
        .div(100);

  const sundayBaseSurcharge = money(hours.sundayDayHours)
    .plus(hours.sundayNightHours)
    .times(hourValue)
    .times(input.legal.surcharge_sunday_holiday)
    .div(100);
  const sundayNightExtra = money(hours.sundayNightHours)
    .times(hourValue)
    .times(input.legal.surcharge_night_ordinary)
    .div(100);
  const sundaySurcharge = byShift
    ? money(0)
    : sundayBaseSurcharge.plus(sundayNightExtra);

  const activeBonuses = input.bonuses.filter((b) => b.is_active);
  let fixedBonuses = money(0);
  let goalBonuses = money(0);
  if (!byShift) {
    for (const b of activeBonuses) {
      const amt = money(bonusAmount(b, input.basicSalary));
      const biweekly = amt.div(2);
      if (b.bonus_type === "FIJA") fixedBonuses = fixedBonuses.plus(biweekly);
      else if (input.includeGoalBonuses !== false) {
        goalBonuses = goalBonuses.plus(biweekly);
        notes.push(`Bono por meta "${b.name}" incluido como estimado.`);
      }
    }
  }

  const aidApplies =
    labor &&
    transportAidApplies(
      input.basicSalary,
      input.legal,
      input.receivesTransportAid,
    );
  const transportAid = aidApplies
    ? money(input.legal.transport_aid).div(2)
    : money(0);
  if (!aidApplies && labor) {
    notes.push("Sin auxilio de transporte (salario > tope o desmarcado).");
  }

  const noveltyImpact = computeNoveltyImpact(
    input.novelties ?? [],
    hourValue,
    input.legal,
  );
  notes.push(...noveltyImpact.notes);

  const shiftPay = money(noveltyImpact.shiftPay);
  const shiftDays = noveltyImpact.shiftDays;
  const overtime = byShift ? money(0) : money(noveltyImpact.overtimePay);
  const occasionalBonuses = money(noveltyImpact.occasionalBonuses);
  const unpaidDisc = byShift ? money(0) : money(noveltyImpact.unpaidTimeDiscount);
  const advances = money(noveltyImpact.advances);
  const authDisc = money(noveltyImpact.authorizedDiscounts);

  if (byShift && shiftDays === 0) {
    notes.push(
      "Sin turnos laborados aprobados en la quincena: total en $0 (registre novedad «Turno laborado»).",
    );
  }

  let earningsTotal = basicBiweekly
    .plus(shiftPay)
    .plus(nightSurcharge)
    .plus(sundaySurcharge)
    .plus(fixedBonuses)
    .plus(goalBonuses)
    .plus(transportAid)
    .plus(overtime)
    .plus(occasionalBonuses)
    .minus(unpaidDisc);
  if (earningsTotal.lt(0)) earningsTotal = money(0);

  // IBC: sin auxilio; incluye extras/bonos ocasionales; resta tiempo no laborado
  let ibcBase = byShift
    ? money(0)
    : basicBiweekly
        .plus(nightSurcharge)
        .plus(sundaySurcharge)
        .plus(fixedBonuses)
        .plus(goalBonuses)
        .plus(overtime)
        .plus(occasionalBonuses)
        .minus(unpaidDisc);
  if (ibcBase.lt(0)) ibcBase = money(0);

  const r = (n: number) => roundMoney(n, input.legal.round_to_peso);

  let healthDed = money(0);
  let pensionDed = money(0);
  let solidarityDed = money(0);
  let empHealth = money(0);
  let empPension = money(0);
  let arl = money(0);
  let sena = money(0);
  let icbf = money(0);
  let caja = money(0);
  let prima = money(0);
  let cesantias = money(0);
  let interestCes = money(0);
  let vacaciones = money(0);

  if (labor) {
    healthDed = money(pctOf(ibcBase.toNumber(), input.legal.employee_health_pct));
    pensionDed = money(
      pctOf(ibcBase.toNumber(), input.legal.employee_pension_pct),
    );

    const solidarityThreshold = money(input.legal.smmlv).times(
      input.legal.solidarity_pension_threshold_smmlv,
    );
    if (
      input.legal.apply_solidarity_pension &&
      money(input.basicSalary).gt(solidarityThreshold)
    ) {
      solidarityDed = money(
        pctOf(ibcBase.toNumber(), input.legal.solidarity_pension_pct),
      );
    }

    const exempt1141 = art1141ExemptionApplies(
      input.basicSalary,
      input.legal,
    );

    if (!exempt1141) {
      empHealth = money(
        pctOf(ibcBase.toNumber(), input.legal.employer_health_pct),
      );
    } else {
      notes.push(
        "Exoneración art. 114-1 ET: sin salud patronal, SENA ni ICBF (salario < 10 SMMLV). Caja sí aplica.",
      );
    }

    empPension = money(
      pctOf(ibcBase.toNumber(), input.legal.employer_pension_pct),
    );
    arl = money(
      pctOf(
        ibcBase.toNumber(),
        arlPctForLevel(input.legal, input.arlRiskLevel),
      ),
    );

    if (input.legal.apply_parafiscales) {
      caja = money(
        pctOf(ibcBase.toNumber(), input.legal.compensation_fund_pct),
      );
      if (!exempt1141) {
        sena = money(pctOf(ibcBase.toNumber(), input.legal.sena_pct));
        icbf = money(pctOf(ibcBase.toNumber(), input.legal.icbf_pct));
      }
    }

    prima = money(pctOf(ibcBase.toNumber(), input.legal.provision_prima_pct));
    cesantias = money(
      pctOf(ibcBase.toNumber(), input.legal.provision_cesantias_pct),
    );
    interestCes = money(
      pctOf(ibcBase.toNumber(), input.legal.provision_interest_cesantias_pct),
    );
    vacaciones = money(
      pctOf(ibcBase.toNumber(), input.legal.provision_vacaciones_pct),
    );
  }

  const socialDeds = healthDed.plus(pensionDed).plus(solidarityDed);
  const deductionsTotal = socialDeds.plus(advances).plus(authDisc);
  const employerContrib = empHealth
    .plus(empPension)
    .plus(arl)
    .plus(sena)
    .plus(icbf)
    .plus(caja);
  const provisionsTotal = prima
    .plus(cesantias)
    .plus(interestCes)
    .plus(vacaciones);

  const netPay = earningsTotal.minus(deductionsTotal);
  const employerCostFinal = earningsTotal
    .plus(employerContrib)
    .plus(provisionsTotal);

  if (input.schedule.uses_custom_schedule) {
    notes.push("Horario personalizado del empleado (distinto al Horario Candela).");
  }
  if ((input.novelties ?? []).length === 0 && !byShift) {
    notes.push("Liquidación ordinaria sin novedades de turno en el periodo.");
  }

  return {
    periodLabel,
    periodStart: startIso,
    periodEnd: endIso,
    hours,
    ordinaryHourValue: r(hourValue),
    earnings: {
      basicSalary: r(basicBiweekly.toNumber()),
      shiftPay: r(shiftPay.toNumber()),
      nightSurcharge: r(nightSurcharge.toNumber()),
      sundaySurcharge: r(sundaySurcharge.toNumber()),
      fixedBonuses: r(fixedBonuses.toNumber()),
      goalBonuses: r(goalBonuses.toNumber()),
      transportAid: r(transportAid.toNumber()),
      overtime: r(overtime.toNumber()),
      occasionalBonuses: r(occasionalBonuses.toNumber()),
      unpaidTimeDiscount: r(unpaidDisc.toNumber()),
      total: r(earningsTotal.toNumber()),
    },
    deductions: {
      health: r(healthDed.toNumber()),
      pension: r(pensionDed.toNumber()),
      solidarity: r(solidarityDed.toNumber()),
      advances: r(advances.toNumber()),
      authorizedDiscounts: r(authDisc.toNumber()),
      total: r(deductionsTotal.toNumber()),
    },
    novelties: {
      count: (input.novelties ?? []).length,
      unpaidMinutes: noveltyImpact.unpaidMinutes,
      overtimeMinutes: noveltyImpact.overtimeMinutes,
      overtimePay: r(overtime.toNumber()),
      shiftDays,
      shiftPay: r(shiftPay.toNumber()),
      occasionalBonuses: r(occasionalBonuses.toNumber()),
      advances: r(advances.toNumber()),
      authorizedDiscounts: r(authDisc.toNumber()),
      unpaidTimeDiscount: r(unpaidDisc.toNumber()),
    },
    employer: {
      health: r(empHealth.toNumber()),
      pension: r(empPension.toNumber()),
      arl: r(arl.toNumber()),
      sena: r(sena.toNumber()),
      icbf: r(icbf.toNumber()),
      compensationFund: r(caja.toNumber()),
      totalContributions: r(employerContrib.toNumber()),
    },
    provisions: {
      prima: r(prima.toNumber()),
      cesantias: r(cesantias.toNumber()),
      interestCesantias: r(interestCes.toNumber()),
      vacaciones: r(vacaciones.toNumber()),
      total: r(provisionsTotal.toNumber()),
    },
    netPay: r(netPay.toNumber()),
    employerCost: r(employerCostFinal.toNumber()),
    notes,
    usesCustomSchedule: input.schedule.uses_custom_schedule,
  };
}
