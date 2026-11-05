import type { BiweeklySimulation } from "./types";

export type AccountingConceptKind =
  | "DEVENGO"
  | "DEDUCCION"
  | "APORTE_EMPRESA"
  | "PROVISION";

export type AccountingQuantityUnit = "DIAS" | "HORAS" | "MINUTOS";

export type AccountingConceptRow = {
  employeeId: string;
  employeeName: string;
  idNumber: string | null;
  positionTitle: string | null;
  conceptCode: string;
  conceptLabel: string;
  /** Grupo orientativo para nómina electrónica / Siigo */
  dianGroup: string;
  kind: AccountingConceptKind;
  quantity: number | null;
  quantityUnit: AccountingQuantityUnit | null;
  percent: number | null;
  amount: number;
  /** Si el concepto entra a IBC (null = no aplica, p.ej. deducciones) */
  isIbcBase: boolean | null;
  notes: string | null;
};

export type EmployeeAccountingReport = {
  employeeId: string;
  employeeName: string;
  idNumber: string | null;
  positionTitle: string | null;
  employmentType: string | null;
  basicSalaryMonthly: number | null;
  eps: string | null;
  pensionFund: string | null;
  arl: string | null;
  compensationFund: string | null;
  arlRiskLevel: string | null;
  workedDays: number | null;
  ibc: number;
  earningsTotal: number;
  deductionsTotal: number;
  netPay: number;
  employerContributions: number;
  provisionsTotal: number;
  employerCost: number;
  concepts: AccountingConceptRow[];
};

export type PeriodAccountingReport = {
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  periodYear: number;
  periodMonth: number;
  periodHalf: number;
  employees: EmployeeAccountingReport[];
  totals: {
    earnings: number;
    deductions: number;
    netPay: number;
    ibc: number;
    employerContributions: number;
    provisions: number;
    employerCost: number;
  };
};

export type AccountingEmployeeProfile = {
  id: string;
  full_name: string;
  id_number: string | null;
  position_title: string | null;
  employment_type: string | null;
  basic_salary: number | string | null;
  eps: string | null;
  pension_fund: string | null;
  arl: string | null;
  compensation_fund: string | null;
  arl_risk_level: string | null;
};

export type AccountingLineInput = {
  employee_id: string;
  employee_name: string;
  position_title: string | null;
  net_pay: number | string;
  employer_cost: number | string;
  earnings_total: number | string;
  deductions_total: number | string;
  snapshot: Record<string, unknown> | BiweeklySimulation | null;
};

function n(v: unknown): number {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function hoursFromMinutes(mins: number): number {
  return round2(mins / 60);
}

function pctOf(amount: number, base: number): number | null {
  if (base <= 0 || amount <= 0) return null;
  return round2((amount / base) * 100);
}

/** Reconstruye IBC del periodo a partir del snapshot (sin auxilio de transporte). */
export function ibcFromSnapshot(snap: Partial<BiweeklySimulation> | null): number {
  if (!snap?.earnings) return 0;
  const e = snap.earnings;
  const raw =
    n(e.basicSalary) +
    n(e.nightSurcharge) +
    n(e.sundaySurcharge) +
    n(e.fixedBonuses) +
    n(e.goalBonuses) +
    n(e.overtime) +
    n(e.occasionalBonuses) -
    n(e.unpaidTimeDiscount);
  return round2(Math.max(0, raw));
}

function pushConcept(
  rows: AccountingConceptRow[],
  base: Omit<
    AccountingConceptRow,
    | "conceptCode"
    | "conceptLabel"
    | "dianGroup"
    | "kind"
    | "quantity"
    | "quantityUnit"
    | "percent"
    | "amount"
    | "isIbcBase"
    | "notes"
  >,
  input: {
    code: string;
    label: string;
    dianGroup: string;
    kind: AccountingConceptKind;
    amount: number;
    quantity?: number | null;
    quantityUnit?: AccountingQuantityUnit | null;
    percent?: number | null;
    isIbcBase?: boolean | null;
    notes?: string | null;
    /** Si false, omite montos en 0 (default true para omitir ceros) */
    keepZero?: boolean;
  },
) {
  const amount = round2(input.amount);
  if (!input.keepZero && amount === 0) return;
  rows.push({
    ...base,
    conceptCode: input.code,
    conceptLabel: input.label,
    dianGroup: input.dianGroup,
    kind: input.kind,
    quantity: input.quantity ?? null,
    quantityUnit: input.quantityUnit ?? null,
    percent: input.percent ?? null,
    amount,
    isIbcBase: input.isIbcBase ?? null,
    notes: input.notes ?? null,
  });
}

function conceptsFromSnapshot(
  base: Omit<
    AccountingConceptRow,
    | "conceptCode"
    | "conceptLabel"
    | "dianGroup"
    | "kind"
    | "quantity"
    | "quantityUnit"
    | "percent"
    | "amount"
    | "isIbcBase"
    | "notes"
  >,
  snap: Partial<BiweeklySimulation> | null,
  ibc: number,
): AccountingConceptRow[] {
  const rows: AccountingConceptRow[] = [];
  if (!snap) return rows;

  const e = snap.earnings;
  const d = snap.deductions;
  const emp = snap.employer;
  const prov = snap.provisions;
  const hours = snap.hours;
  const nov = snap.novelties;
  const att = snap.attendance;

  const workedDays = hours?.workedDays ?? null;
  const nightHours = n(hours?.ordinaryNightHours);
  const sundayHours =
    n(hours?.sundayDayHours) + n(hours?.sundayNightHours);
  const overtimeMins = Math.max(
    n(nov?.overtimeMinutes),
    n(att?.overtimeMinutes),
  );
  const unpaidMins = Math.max(
    n(nov?.unpaidMinutes),
    n(att?.unpaidMinutes),
  );

  if (e) {
    pushConcept(rows, base, {
      code: "BASICO",
      label: "Salario básico del periodo",
      dianGroup: "Basico",
      kind: "DEVENGO",
      amount: n(e.basicSalary),
      quantity: workedDays,
      quantityUnit: workedDays != null ? "DIAS" : null,
      isIbcBase: true,
      keepZero: true,
      notes:
        workedDays != null
          ? "Basico DIAN = SuelDia × TraDur; aquí el monto ya es el del periodo"
          : null,
    });
    pushConcept(rows, base, {
      code: "TURNOS",
      label: "Pago por turnos / días",
      dianGroup: "Otros",
      kind: "DEVENGO",
      amount: n(e.shiftPay),
      quantity: n(nov?.shiftDays) || null,
      quantityUnit: n(nov?.shiftDays) ? "DIAS" : null,
      isIbcBase: false,
      notes: "Típico de prestadores POR_TURNO (no suele ir en esta liquidación)",
    });
    pushConcept(rows, base, {
      code: "RECARGO_NOCTURNO",
      label: "Recargo nocturno",
      dianGroup: "OtrosDevengos",
      kind: "DEVENGO",
      amount: n(e.nightSurcharge),
      quantity: nightHours > 0 ? nightHours : null,
      quantityUnit: nightHours > 0 ? "HORAS" : null,
      isIbcBase: true,
    });
    pushConcept(rows, base, {
      code: "RECARGO_DOMINICAL",
      label: "Recargo dominical / festivo",
      dianGroup: "OtrosDevengos",
      kind: "DEVENGO",
      amount: n(e.sundaySurcharge),
      quantity: sundayHours > 0 ? sundayHours : null,
      quantityUnit: sundayHours > 0 ? "HORAS" : null,
      isIbcBase: true,
    });
    pushConcept(rows, base, {
      code: "BONO_FIJO",
      label: "Bonos fijos",
      dianGroup: "Bonificacion",
      kind: "DEVENGO",
      amount: n(e.fixedBonuses),
      isIbcBase: true,
    });
    pushConcept(rows, base, {
      code: "BONO_META",
      label: "Bonos por meta",
      dianGroup: "Bonificacion",
      kind: "DEVENGO",
      amount: n(e.goalBonuses),
      isIbcBase: true,
    });
    pushConcept(rows, base, {
      code: "BONO_OCASIONAL",
      label: "Bonos ocasionales",
      dianGroup: "Bonificacion",
      kind: "DEVENGO",
      amount: n(e.occasionalBonuses),
      isIbcBase: true,
      notes: "Confirmar con el contador si es salarial (IBC) o no salarial",
    });
    pushConcept(rows, base, {
      code: "AUX_TRANSPORTE",
      label: "Auxilio de transporte",
      dianGroup: "AuxTransporte",
      kind: "DEVENGO",
      amount: n(e.transportAid),
      isIbcBase: false,
      notes: "No hace base de IBC; omitir en NIDD si salario > 2 SMMLV",
    });
    pushConcept(rows, base, {
      code: "HORA_EXTRA",
      label: "Horas extra",
      dianGroup: "HorasExtra",
      kind: "DEVENGO",
      amount: n(e.overtime),
      quantity: overtimeMins > 0 ? hoursFromMinutes(overtimeMins) : null,
      quantityUnit: overtimeMins > 0 ? "HORAS" : null,
      isIbcBase: true,
      notes:
        "Agregado en Candela; en Siigo/DIAN conviene separar HED / HEN / HRD / HRN",
    });
    pushConcept(rows, base, {
      code: "DESC_TIEMPO",
      label: "Descuento por tiempo no laborado",
      dianGroup: "OtrosDevengos",
      kind: "DEVENGO",
      amount: -n(e.unpaidTimeDiscount),
      quantity: unpaidMins > 0 ? unpaidMins : null,
      quantityUnit: unpaidMins > 0 ? "MINUTOS" : null,
      isIbcBase: true,
      keepZero: false,
      notes: "Reduce el básico / IBC; en ERP puede ir como novedad negativa",
    });
  }

  if (d) {
    pushConcept(rows, base, {
      code: "SALUD_EMPLEADO",
      label: "Aporte salud (empleado)",
      dianGroup: "Salud",
      kind: "DEDUCCION",
      amount: n(d.health),
      percent: pctOf(n(d.health), ibc) ?? 4,
      isIbcBase: null,
      keepZero: true,
    });
    pushConcept(rows, base, {
      code: "PENSION_EMPLEADO",
      label: "Aporte pensión (empleado)",
      dianGroup: "FondoPension",
      kind: "DEDUCCION",
      amount: n(d.pension),
      percent: pctOf(n(d.pension), ibc) ?? 4,
      isIbcBase: null,
      keepZero: true,
    });
    pushConcept(rows, base, {
      code: "FONDO_SOLIDARIDAD",
      label: "Fondo de solidaridad pensional",
      dianGroup: "FondoSP",
      kind: "DEDUCCION",
      amount: n(d.solidarity),
      percent: pctOf(n(d.solidarity), ibc),
      isIbcBase: null,
    });
    pushConcept(rows, base, {
      code: "ANTICIPO",
      label: "Anticipos",
      dianGroup: "OtrasDeducciones",
      kind: "DEDUCCION",
      amount: n(d.advances),
      isIbcBase: null,
    });
    pushConcept(rows, base, {
      code: "DESCUENTO_AUT",
      label: "Descuentos autorizados",
      dianGroup: "OtrasDeducciones",
      kind: "DEDUCCION",
      amount: n(d.authorizedDiscounts),
      isIbcBase: null,
    });
  }

  if (emp) {
    pushConcept(rows, base, {
      code: "SALUD_EMPRESA",
      label: "Salud patronal",
      dianGroup: "AporteEmpresa",
      kind: "APORTE_EMPRESA",
      amount: n(emp.health),
      percent: pctOf(n(emp.health), ibc),
      isIbcBase: null,
    });
    pushConcept(rows, base, {
      code: "PENSION_EMPRESA",
      label: "Pensión patronal",
      dianGroup: "AporteEmpresa",
      kind: "APORTE_EMPRESA",
      amount: n(emp.pension),
      percent: pctOf(n(emp.pension), ibc),
      isIbcBase: null,
      keepZero: true,
    });
    pushConcept(rows, base, {
      code: "ARL",
      label: "ARL",
      dianGroup: "AporteEmpresa",
      kind: "APORTE_EMPRESA",
      amount: n(emp.arl),
      percent: pctOf(n(emp.arl), ibc),
      isIbcBase: null,
      keepZero: true,
    });
    pushConcept(rows, base, {
      code: "SENA",
      label: "SENA",
      dianGroup: "Parafiscal",
      kind: "APORTE_EMPRESA",
      amount: n(emp.sena),
      percent: pctOf(n(emp.sena), ibc),
      isIbcBase: null,
    });
    pushConcept(rows, base, {
      code: "ICBF",
      label: "ICBF",
      dianGroup: "Parafiscal",
      kind: "APORTE_EMPRESA",
      amount: n(emp.icbf),
      percent: pctOf(n(emp.icbf), ibc),
      isIbcBase: null,
    });
    pushConcept(rows, base, {
      code: "CAJA",
      label: "Caja de compensación",
      dianGroup: "Parafiscal",
      kind: "APORTE_EMPRESA",
      amount: n(emp.compensationFund),
      percent: pctOf(n(emp.compensationFund), ibc),
      isIbcBase: null,
      keepZero: true,
    });
  }

  if (prov) {
    pushConcept(rows, base, {
      code: "PROV_PRIMA",
      label: "Provisión prima",
      dianGroup: "Provision",
      kind: "PROVISION",
      amount: n(prov.prima),
      percent: pctOf(n(prov.prima), ibc),
      isIbcBase: null,
      notes: "Causación estimada; no va a NIDD hasta el pago real",
    });
    pushConcept(rows, base, {
      code: "PROV_CESANTIAS",
      label: "Provisión cesantías",
      dianGroup: "Provision",
      kind: "PROVISION",
      amount: n(prov.cesantias),
      percent: pctOf(n(prov.cesantias), ibc),
      isIbcBase: null,
      notes: "Causación estimada; no va a NIDD hasta el pago real",
    });
    pushConcept(rows, base, {
      code: "PROV_INT_CES",
      label: "Provisión intereses cesantías",
      dianGroup: "Provision",
      kind: "PROVISION",
      amount: n(prov.interestCesantias),
      percent: pctOf(n(prov.interestCesantias), ibc),
      isIbcBase: null,
    });
    pushConcept(rows, base, {
      code: "PROV_VACACIONES",
      label: "Provisión vacaciones",
      dianGroup: "Provision",
      kind: "PROVISION",
      amount: n(prov.vacaciones),
      percent: pctOf(n(prov.vacaciones), ibc),
      isIbcBase: null,
    });
  }

  return rows;
}

export function buildPeriodAccountingReport(input: {
  periodYear: number;
  periodMonth: number;
  periodHalf: number;
  periodStart: string;
  periodEnd: string;
  lines: AccountingLineInput[];
  employeesById: Record<string, AccountingEmployeeProfile>;
}): PeriodAccountingReport {
  const employees: EmployeeAccountingReport[] = input.lines.map((line) => {
    const profile = input.employeesById[line.employee_id];
    const snap = (line.snapshot ?? null) as Partial<BiweeklySimulation> | null;
    const ibc = ibcFromSnapshot(snap);
    const base = {
      employeeId: line.employee_id,
      employeeName: line.employee_name,
      idNumber: profile?.id_number ?? null,
      positionTitle: line.position_title ?? profile?.position_title ?? null,
    };
    const concepts = conceptsFromSnapshot(base, snap, ibc);
    const employerContributions = concepts
      .filter((c) => c.kind === "APORTE_EMPRESA")
      .reduce((a, c) => a + c.amount, 0);
    const provisionsTotal = concepts
      .filter((c) => c.kind === "PROVISION")
      .reduce((a, c) => a + c.amount, 0);

    return {
      employeeId: line.employee_id,
      employeeName: line.employee_name,
      idNumber: profile?.id_number ?? null,
      positionTitle: line.position_title ?? profile?.position_title ?? null,
      employmentType: profile?.employment_type ?? null,
      basicSalaryMonthly:
        profile?.basic_salary != null ? n(profile.basic_salary) : null,
      eps: profile?.eps ?? null,
      pensionFund: profile?.pension_fund ?? null,
      arl: profile?.arl ?? null,
      compensationFund: profile?.compensation_fund ?? null,
      arlRiskLevel: profile?.arl_risk_level ?? null,
      workedDays: snap?.hours?.workedDays ?? null,
      ibc,
      earningsTotal: n(line.earnings_total ?? snap?.earnings?.total),
      deductionsTotal: n(line.deductions_total ?? snap?.deductions?.total),
      netPay: n(line.net_pay ?? snap?.netPay),
      employerContributions: round2(employerContributions),
      provisionsTotal: round2(provisionsTotal),
      employerCost: n(line.employer_cost ?? snap?.employerCost),
      concepts,
    };
  });

  const totals = employees.reduce(
    (acc, e) => {
      acc.earnings += e.earningsTotal;
      acc.deductions += e.deductionsTotal;
      acc.netPay += e.netPay;
      acc.ibc += e.ibc;
      acc.employerContributions += e.employerContributions;
      acc.provisions += e.provisionsTotal;
      acc.employerCost += e.employerCost;
      return acc;
    },
    {
      earnings: 0,
      deductions: 0,
      netPay: 0,
      ibc: 0,
      employerContributions: 0,
      provisions: 0,
      employerCost: 0,
    },
  );

  for (const k of Object.keys(totals) as (keyof typeof totals)[]) {
    totals[k] = round2(totals[k]);
  }

  const halfLabel = input.periodHalf === 1 ? "1ª" : "2ª";
  const mm = String(input.periodMonth).padStart(2, "0");

  return {
    periodLabel: `${halfLabel} quincena ${mm}/${input.periodYear}`,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    periodYear: input.periodYear,
    periodMonth: input.periodMonth,
    periodHalf: input.periodHalf,
    employees,
    totals,
  };
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function accountingConceptsToCsvRows(
  report: PeriodAccountingReport,
  kinds?: AccountingConceptKind[],
): string[][] {
  const header = [
    "Periodo",
    "Desde",
    "Hasta",
    "Documento",
    "Empleado",
    "Cargo",
    "Codigo concepto",
    "Concepto",
    "Grupo DIAN/Siigo",
    "Tipo",
    "Cantidad",
    "Unidad",
    "Porcentaje",
    "Valor",
    "Base IBC",
    "IBC empleado",
    "Notas",
    "EPS",
    "AFP",
    "ARL",
    "Caja",
    "Nivel ARL",
  ];

  const rows: string[][] = [header];
  for (const emp of report.employees) {
    for (const c of emp.concepts) {
      if (kinds && !kinds.includes(c.kind)) continue;
      rows.push([
        report.periodLabel,
        report.periodStart,
        report.periodEnd,
        c.idNumber ?? "",
        c.employeeName,
        c.positionTitle ?? "",
        c.conceptCode,
        c.conceptLabel,
        c.dianGroup,
        c.kind,
        c.quantity != null ? String(c.quantity) : "",
        c.quantityUnit ?? "",
        c.percent != null ? String(c.percent) : "",
        String(c.amount),
        c.isIbcBase == null ? "" : c.isIbcBase ? "SI" : "NO",
        String(emp.ibc),
        c.notes ?? "",
        emp.eps ?? "",
        emp.pensionFund ?? "",
        emp.arl ?? "",
        emp.compensationFund ?? "",
        emp.arlRiskLevel ?? "",
      ]);
    }
  }
  return rows;
}

export function accountingEmployeeSummaryToCsvRows(
  report: PeriodAccountingReport,
): string[][] {
  const header = [
    "Periodo",
    "Desde",
    "Hasta",
    "Documento",
    "Empleado",
    "Cargo",
    "Tipo contrato",
    "Salario mensual",
    "Dias liquidados",
    "IBC",
    "Devengos",
    "Deducciones",
    "Neto a pagar",
    "Aportes empresa",
    "Provisiones",
    "Costo empresa",
    "EPS",
    "AFP",
    "ARL",
    "Caja",
    "Nivel ARL",
  ];
  const rows: string[][] = [header];
  for (const emp of report.employees) {
    rows.push([
      report.periodLabel,
      report.periodStart,
      report.periodEnd,
      emp.idNumber ?? "",
      emp.employeeName,
      emp.positionTitle ?? "",
      emp.employmentType ?? "",
      emp.basicSalaryMonthly != null ? String(emp.basicSalaryMonthly) : "",
      emp.workedDays != null ? String(emp.workedDays) : "",
      String(emp.ibc),
      String(emp.earningsTotal),
      String(emp.deductionsTotal),
      String(emp.netPay),
      String(emp.employerContributions),
      String(emp.provisionsTotal),
      String(emp.employerCost),
      emp.eps ?? "",
      emp.pensionFund ?? "",
      emp.arl ?? "",
      emp.compensationFund ?? "",
      emp.arlRiskLevel ?? "",
    ]);
  }
  return rows;
}

export function csvRowsToBlobContent(rows: string[][]): string {
  return (
    "\uFEFF" +
    rows.map((r) => r.map((c) => csvEscape(c)).join(",")).join("\n")
  );
}
