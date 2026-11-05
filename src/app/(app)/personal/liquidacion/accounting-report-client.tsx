"use client";

import { useMemo, useState } from "react";
import { formatCOP } from "@/lib/money";
import { formatDateCO } from "@/lib/dates";
import {
  accountingConceptsToCsvRows,
  accountingEmployeeSummaryToCsvRows,
  buildPeriodAccountingReport,
  csvRowsToBlobContent,
  type AccountingConceptKind,
  type AccountingEmployeeProfile,
  type EmployeeAccountingReport,
} from "@/lib/payroll/accounting-report";
import type { SlipEmployee } from "./payroll-slips-client";

type ReportPeriod = {
  period_year: number;
  period_month: number;
  period_half: number;
  period_start: string;
  period_end: string;
};

type ReportLine = {
  employee_id: string;
  employee_name: string;
  position_title: string | null;
  net_pay: number | string;
  employer_cost: number | string;
  earnings_total: number | string;
  deductions_total: number | string;
  snapshot: Record<string, unknown> | null;
};

function downloadCsv(filename: string, rows: string[][]) {
  const blob = new Blob([csvRowsToBlobContent(rows)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const KIND_LABEL: Record<AccountingConceptKind, string> = {
  DEVENGO: "Devengo",
  DEDUCCION: "Deducción",
  APORTE_EMPRESA: "Aporte empresa",
  PROVISION: "Provisión",
};

function ConceptTable({
  employee,
  kinds,
}: {
  employee: EmployeeAccountingReport;
  kinds: AccountingConceptKind[];
}) {
  const rows = employee.concepts.filter((c) => kinds.includes(c.kind));
  if (rows.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">Sin conceptos en este bloque.</p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--line)] text-xs uppercase tracking-wide text-[var(--muted)]">
            <th className="py-2 pr-3 font-medium">Concepto</th>
            <th className="py-2 pr-3 font-medium">Grupo</th>
            <th className="py-2 pr-3 font-medium">Cant.</th>
            <th className="py-2 pr-3 font-medium">%</th>
            <th className="py-2 pr-3 font-medium">IBC</th>
            <th className="py-2 text-right font-medium">Valor</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr
              key={`${c.conceptCode}-${c.kind}`}
              className="border-b border-[var(--line)]/70 align-top"
            >
              <td className="py-2 pr-3">
                <p className="font-medium">{c.conceptLabel}</p>
                <p className="text-xs text-[var(--muted)]">{c.conceptCode}</p>
                {c.notes ? (
                  <p className="mt-0.5 text-xs text-[var(--muted)]">{c.notes}</p>
                ) : null}
              </td>
              <td className="py-2 pr-3 text-[var(--muted)]">{c.dianGroup}</td>
              <td className="py-2 pr-3 tabular-nums text-[var(--muted)]">
                {c.quantity != null
                  ? `${c.quantity}${c.quantityUnit ? ` ${c.quantityUnit.toLowerCase()}` : ""}`
                  : "—"}
              </td>
              <td className="py-2 pr-3 tabular-nums text-[var(--muted)]">
                {c.percent != null ? `${c.percent}%` : "—"}
              </td>
              <td className="py-2 pr-3 text-[var(--muted)]">
                {c.isIbcBase == null ? "—" : c.isIbcBase ? "Sí" : "No"}
              </td>
              <td className="py-2 text-right tabular-nums">
                {formatCOP(c.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AccountingReportSection({
  period,
  lines,
  employeesById,
}: {
  period: ReportPeriod;
  lines: ReportLine[];
  employeesById: Record<string, SlipEmployee>;
}) {
  const [openId, setOpenId] = useState<string | null>(
    lines[0]?.employee_id ?? null,
  );

  const report = useMemo(() => {
    const profiles: Record<string, AccountingEmployeeProfile> = {};
    for (const [id, e] of Object.entries(employeesById)) {
      profiles[id] = {
        id: e.id,
        full_name: e.full_name,
        id_number: e.id_number,
        position_title: e.position_title,
        employment_type: e.employment_type,
        basic_salary: e.basic_salary,
        eps: e.eps,
        pension_fund: e.pension_fund,
        arl: e.arl,
        compensation_fund: e.compensation_fund,
        arl_risk_level: e.arl_risk_level,
      };
    }
    return buildPeriodAccountingReport({
      periodYear: period.period_year,
      periodMonth: period.period_month,
      periodHalf: period.period_half as 1 | 2,
      periodStart: period.period_start,
      periodEnd: period.period_end,
      lines,
      employeesById: profiles,
    });
  }, [period, lines, employeesById]);

  const fileBase = `nomina-erp-${period.period_year}-${String(period.period_month).padStart(2, "0")}-q${period.period_half}`;
  const selected =
    report.employees.find((e) => e.employeeId === openId) ??
    report.employees[0] ??
    null;

  return (
    <section className="no-print space-y-4 rounded-xl border border-[var(--line)] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            5 · Informe para contador / ERP
          </p>
          <h2 className="mt-1 font-medium">Nómina electrónica y causación</h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
            Desglose por concepto listo para digitar en Siigo u otro ERP: grupo
            DIAN orientativo, cantidades, IBC, aportes empresa y provisiones.
            La nómina electrónica DIAN se reporta por mes; si liquidan
            quincenal, consoliden las dos quincenas del mes al transmitir.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-[var(--line)] p-3">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
            IBC periodo
          </p>
          <p className="mt-1 font-display text-lg font-bold tabular-nums">
            {formatCOP(report.totals.ibc)}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--line)] p-3">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Neto a pagar
          </p>
          <p className="mt-1 font-display text-lg font-bold tabular-nums">
            {formatCOP(report.totals.netPay)}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--line)] p-3">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Aportes empresa
          </p>
          <p className="mt-1 font-display text-lg font-bold tabular-nums">
            {formatCOP(report.totals.employerContributions)}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--line)] p-3">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Provisiones
          </p>
          <p className="mt-1 font-display text-lg font-bold tabular-nums">
            {formatCOP(report.totals.provisions)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-lg bg-[var(--solid)] px-4 py-2 text-sm text-[var(--on-solid)]"
          onClick={() =>
            downloadCsv(
              `${fileBase}-novedades.csv`,
              accountingConceptsToCsvRows(report, ["DEVENGO", "DEDUCCION"]),
            )
          }
        >
          CSV novedades (Siigo)
        </button>
        <button
          type="button"
          className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm hover:border-[var(--ink)]"
          onClick={() =>
            downloadCsv(
              `${fileBase}-aportes-provisiones.csv`,
              accountingConceptsToCsvRows(report, [
                "APORTE_EMPRESA",
                "PROVISION",
              ]),
            )
          }
        >
          CSV aportes y provisiones
        </button>
        <button
          type="button"
          className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm hover:border-[var(--ink)]"
          onClick={() =>
            downloadCsv(
              `${fileBase}-resumen-empleados.csv`,
              accountingEmployeeSummaryToCsvRows(report),
            )
          }
        >
          CSV resumen por empleado
        </button>
        <button
          type="button"
          className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm hover:border-[var(--ink)]"
          onClick={() =>
            downloadCsv(
              `${fileBase}-completo.csv`,
              accountingConceptsToCsvRows(report),
            )
          }
        >
          CSV completo
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <div className="space-y-1">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Empleados
          </p>
          {report.employees.map((emp) => {
            const active = selected?.employeeId === emp.employeeId;
            return (
              <button
                key={emp.employeeId}
                type="button"
                onClick={() => setOpenId(emp.employeeId)}
                className={`block w-full rounded-lg border px-3 py-2 text-left text-sm ${
                  active
                    ? "border-[var(--ink)] bg-[var(--surface-2,transparent)]"
                    : "border-[var(--line)] hover:border-[var(--ink)]"
                }`}
              >
                <p className="font-medium">{emp.employeeName}</p>
                <p className="text-xs text-[var(--muted)]">
                  {emp.idNumber ? `CC ${emp.idNumber}` : "Sin documento"} · Neto{" "}
                  {formatCOP(emp.netPay)}
                </p>
              </button>
            );
          })}
        </div>

        {selected ? (
          <div className="space-y-5 rounded-lg border border-[var(--line)] p-4">
            <div>
              <h3 className="font-medium">{selected.employeeName}</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {[
                  selected.idNumber ? `CC ${selected.idNumber}` : null,
                  selected.positionTitle,
                  selected.employmentType,
                  `Periodo ${formatDateCO(report.periodStart)} → ${formatDateCO(report.periodEnd)}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {[
                  selected.eps ? `EPS ${selected.eps}` : null,
                  selected.pensionFund ? `AFP ${selected.pensionFund}` : null,
                  selected.arl ? `ARL ${selected.arl}` : null,
                  selected.arlRiskLevel
                    ? `Riesgo ${selected.arlRiskLevel}`
                    : null,
                  selected.compensationFund
                    ? `Caja ${selected.compensationFund}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Fondos no registrados en ficha"}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                  IBC
                </p>
                <p className="mt-0.5 font-medium tabular-nums">
                  {formatCOP(selected.ibc)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                  Devengos
                </p>
                <p className="mt-0.5 font-medium tabular-nums">
                  {formatCOP(selected.earningsTotal)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                  Deducciones
                </p>
                <p className="mt-0.5 font-medium tabular-nums">
                  {formatCOP(selected.deductionsTotal)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                  Neto
                </p>
                <p className="mt-0.5 font-medium tabular-nums">
                  {formatCOP(selected.netPay)}
                </p>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                Devengos y deducciones (digitar en nómina)
              </p>
              <ConceptTable
                employee={selected}
                kinds={["DEVENGO", "DEDUCCION"]}
              />
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                Aportes empresa y provisiones (causación)
              </p>
              <ConceptTable
                employee={selected}
                kinds={["APORTE_EMPRESA", "PROVISION"]}
              />
              <p className="mt-2 text-xs text-[var(--muted)]">
                {KIND_LABEL.APORTE_EMPRESA} + {KIND_LABEL.PROVISION}: no salen
                del neto del empleado; sirven para el asiento contable y PILA.
                Las provisiones son estimación del periodo, no pago de
                prima/cesantías/vacaciones.
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            Calcule la liquidación para ver el informe.
          </p>
        )}
      </div>
    </section>
  );
}
