import { simulateBiweekly } from "./simulate-biweekly";
import type {
  ArlRiskLevel,
  BonusInput,
  BiweeklySimulation,
  EmploymentContractType,
  LegalParamsInput,
  NoveltyInput,
  PayrollScheduleInput,
  EmployeeScheduleInput,
} from "./types";

export type LiquidateEmployeeInput = {
  employeeId: string;
  fullName: string;
  positionTitle: string | null;
  basicSalary: number;
  employmentType: EmploymentContractType;
  receivesTransportAid: boolean | null;
  arlRiskLevel: ArlRiskLevel;
  schedule: EmployeeScheduleInput;
  bonuses: BonusInput[];
  novelties: NoveltyInput[];
};

export type LiquidationLine = {
  employeeId: string;
  employeeName: string;
  positionTitle: string | null;
  noveltyCount: number;
  netPay: number;
  employerCost: number;
  earningsTotal: number;
  deductionsTotal: number;
  simulation: BiweeklySimulation;
};

export function liquidatePeriod(input: {
  year: number;
  month: number;
  half: 1 | 2;
  candelaSchedule: PayrollScheduleInput;
  legal: LegalParamsInput;
  employees: LiquidateEmployeeInput[];
  includeGoalBonuses?: boolean;
}): {
  lines: LiquidationLine[];
  totals: {
    netPay: number;
    employerCost: number;
    earningsTotal: number;
    deductionsTotal: number;
    employeeCount: number;
    noveltyCount: number;
  };
} {
  const lines: LiquidationLine[] = [];
  let netPay = 0;
  let employerCost = 0;
  let earningsTotal = 0;
  let deductionsTotal = 0;
  let noveltyCount = 0;

  for (const emp of input.employees) {
    const simulation = simulateBiweekly({
      year: input.year,
      month: input.month,
      half: input.half,
      basicSalary: emp.basicSalary,
      employmentType: emp.employmentType,
      receivesTransportAid: emp.receivesTransportAid,
      arlRiskLevel: emp.arlRiskLevel,
      schedule: emp.schedule,
      candelaSchedule: input.candelaSchedule,
      legal: input.legal,
      bonuses: emp.bonuses,
      includeGoalBonuses: input.includeGoalBonuses ?? true,
      novelties: emp.novelties,
    });

    lines.push({
      employeeId: emp.employeeId,
      employeeName: emp.fullName,
      positionTitle: emp.positionTitle,
      noveltyCount: emp.novelties.length,
      netPay: simulation.netPay,
      employerCost: simulation.employerCost,
      earningsTotal: simulation.earnings.total,
      deductionsTotal: simulation.deductions.total,
      simulation,
    });

    netPay += simulation.netPay;
    employerCost += simulation.employerCost;
    earningsTotal += simulation.earnings.total;
    deductionsTotal += simulation.deductions.total;
    noveltyCount += emp.novelties.length;
  }

  return {
    lines,
    totals: {
      netPay,
      employerCost,
      earningsTotal,
      deductionsTotal,
      employeeCount: lines.length,
      noveltyCount,
    },
  };
}
