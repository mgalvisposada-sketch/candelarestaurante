"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { formatCOP } from "@/lib/money";
import { formatDateCO } from "@/lib/dates";
import { sendPayrollLineToPaymentRequestAction } from "../payroll-ops-actions";

export type SlipEmployee = {
  id: string;
  full_name: string;
  id_number: string | null;
  position_title: string | null;
  hire_date: string | null;
  employment_type: string | null;
  basic_salary: number | string | null;
  eps: string | null;
  pension_fund: string | null;
  arl: string | null;
  compensation_fund: string | null;
  arl_risk_level: string | null;
};

export type SlipOrg = {
  name: string;
  nit: string | null;
  address: string | null;
  municipality: string | null;
  department: string | null;
};

export type SlipPeriod = {
  id: string;
  period_year: number;
  period_month: number;
  period_half: number;
  period_start: string;
  period_end: string;
  status: string;
  emitted_at: string | null;
};

export type SlipLine = {
  id: string;
  employee_id: string;
  employee_name: string;
  position_title: string | null;
  novelty_count: number;
  net_pay: number | string;
  employer_cost: number | string;
  earnings_total: number | string;
  deductions_total: number | string;
  snapshot: Record<string, unknown> | null;
};

export type SlipPaymentRequest = {
  id: string;
  status: string;
};

type Snap = {
  periodLabel?: string;
  periodStart?: string;
  periodEnd?: string;
  ordinaryHourValue?: number;
  hours?: {
    workedDays?: number;
    sundayDays?: number;
    ordinaryDayHours?: number;
    ordinaryNightHours?: number;
    sundayDayHours?: number;
    sundayNightHours?: number;
  };
  earnings?: {
    total?: number;
    basicSalary?: number;
    shiftPay?: number;
    nightSurcharge?: number;
    sundaySurcharge?: number;
    fixedBonuses?: number;
    goalBonuses?: number;
    transportAid?: number;
    overtime?: number;
    occasionalBonuses?: number;
    unpaidTimeDiscount?: number;
  };
  deductions?: {
    total?: number;
    health?: number;
    pension?: number;
    solidarity?: number;
    advances?: number;
    authorizedDiscounts?: number;
  };
  employer?: {
    health?: number;
    pension?: number;
    arl?: number;
    sena?: number;
    icbf?: number;
    compensationFund?: number;
    totalContributions?: number;
  };
  provisions?: {
    prima?: number;
    cesantias?: number;
    interestCesantias?: number;
    vacaciones?: number;
    total?: number;
  };
  attendance?: {
    used?: boolean;
    netWorkedHours?: number;
    restDays?: number;
    holidayWorkedDays?: number;
    overtimeMinutes?: number;
    unpaidMinutes?: number;
  };
  notes?: string[];
  netPay?: number;
  employerCost?: number;
};

function fmtHours(h: number | undefined): string {
  if (h == null || Number.isNaN(h)) return "—";
  const totalMins = Math.round(h * 60);
  const hh = Math.floor(totalMins / 60);
  const mm = totalMins % 60;
  return `${hh}:${String(mm).padStart(2, "0")}`;
}

function MoneyRow({
  label,
  value,
  strong,
  hideZero,
}: {
  label: string;
  value: number;
  strong?: boolean;
  hideZero?: boolean;
}) {
  if (hideZero && !value) return null;
  return (
    <tr className={strong ? "slip-strong" : undefined}>
      <td>{label}</td>
      <td className="num">{formatCOP(value)}</td>
    </tr>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="slip-meta-item">
      <dt>{label}</dt>
      <dd>{value || "—"}</dd>
    </div>
  );
}

function periodTitle(period: SlipPeriod): string {
  const half = period.period_half === 1 ? "1ª" : "2ª";
  return `${half} quincena ${String(period.period_month).padStart(2, "0")}/${period.period_year}`;
}

function PayrollSlipSheet({
  organization,
  period,
  line,
  employee,
  focusId,
}: {
  organization: SlipOrg;
  period: SlipPeriod;
  line: SlipLine;
  employee: SlipEmployee | null;
  focusId: string | null;
}) {
  const snap = (line.snapshot ?? {}) as Snap;
  const net = Number(snap.netPay ?? line.net_pay ?? 0);
  const cost = Number(snap.employerCost ?? line.employer_cost ?? 0);
  const earningsTotal = Number(snap.earnings?.total ?? line.earnings_total ?? 0);
  const deductionsTotal = Number(
    snap.deductions?.total ?? line.deductions_total ?? 0,
  );
  const location = [organization.municipality, organization.department]
    .filter(Boolean)
    .join(", ");
  const hiddenForFocus =
    focusId != null && focusId !== line.employee_id ? "print-hide-sheet" : "";
  const isOfficial =
    period.status === "EMITIDA" || period.status === "CERRADA";

  return (
    <article
      className={`print-sheet slip-sheet ${hiddenForFocus}`}
      data-employee-id={line.employee_id}
    >
      {!isOfficial ? (
        <p className="slip-draft-banner">
          Borrador / no emitida — sujeta a cambios hasta volver a emitir
        </p>
      ) : null}
      <header className="slip-header">
        <div>
          <p className="slip-kicker">
            {isOfficial
              ? "Comprobante de pago · Nómina quincenal"
              : "Borrador de colilla · Nómina quincenal"}
          </p>
          <h2 className="slip-org">{organization.name}</h2>
          <p className="slip-sub">
            {[
              organization.nit ? `NIT ${organization.nit}` : null,
              organization.address,
              location || null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="slip-period-box">
          <p className="slip-kicker">Periodo</p>
          <p className="slip-period-title">{periodTitle(period)}</p>
          <p className="slip-sub">
            {formatDateCO(period.period_start)} →{" "}
            {formatDateCO(period.period_end)}
          </p>
          <p className="slip-sub">
            {isOfficial
              ? `Oficial · ${period.status}${
                  period.emitted_at
                    ? ` · Emitida ${formatDateCO(period.emitted_at)}`
                    : ""
                }`
              : `Provisional · ${period.status} (no emitida)`}
          </p>
        </div>
      </header>

      <section className="slip-section">
        <h3>Trabajador</h3>
        <dl className="slip-meta-grid">
          <Meta label="Nombre" value={line.employee_name} />
          <Meta
            label="Documento"
            value={employee?.id_number ? `CC ${employee.id_number}` : "—"}
          />
          <Meta
            label="Cargo"
            value={
              line.position_title || employee?.position_title || "Sin cargo"
            }
          />
          <Meta
            label="Tipo vínculo"
            value={employee?.employment_type ?? "—"}
          />
          <Meta
            label="Fecha ingreso"
            value={
              employee?.hire_date ? formatDateCO(employee.hire_date) : "—"
            }
          />
          <Meta
            label="Salario básico mens."
            value={
              employee?.basic_salary != null
                ? formatCOP(employee.basic_salary)
                : "—"
            }
          />
          <Meta label="EPS" value={employee?.eps ?? "—"} />
          <Meta label="Fondo pensión" value={employee?.pension_fund ?? "—"} />
          <Meta
            label="ARL"
            value={
              employee?.arl
                ? `${employee.arl}${
                    employee.arl_risk_level
                      ? ` (riesgo ${employee.arl_risk_level})`
                      : ""
                  }`
                : "—"
            }
          />
          <Meta
            label="Caja compensación"
            value={employee?.compensation_fund ?? "—"}
          />
        </dl>
      </section>

      <section className="slip-section">
        <h3>Asistencia y horas</h3>
        <dl className="slip-meta-grid">
          <Meta
            label="Días laborados"
            value={String(snap.hours?.workedDays ?? "—")}
          />
          <Meta
            label="Domingos / festivos"
            value={String(snap.hours?.sundayDays ?? "—")}
          />
          <Meta
            label="Horas diurnas"
            value={fmtHours(snap.hours?.ordinaryDayHours)}
          />
          <Meta
            label="Horas nocturnas"
            value={fmtHours(snap.hours?.ordinaryNightHours)}
          />
          <Meta
            label="Horas dom./fest. día"
            value={fmtHours(snap.hours?.sundayDayHours)}
          />
          <Meta
            label="Horas dom./fest. noche"
            value={fmtHours(snap.hours?.sundayNightHours)}
          />
          <Meta
            label="Valor hora ordinaria"
            value={formatCOP(snap.ordinaryHourValue ?? 0)}
          />
          {snap.attendance?.used ? (
            <>
              <Meta
                label="Horas netas planilla"
                value={fmtHours(snap.attendance.netWorkedHours)}
              />
              <Meta
                label="Días descanso"
                value={String(snap.attendance.restDays ?? 0)}
              />
              <Meta
                label="Min. extras"
                value={String(snap.attendance.overtimeMinutes ?? 0)}
              />
              <Meta
                label="Min. no laborados"
                value={String(snap.attendance.unpaidMinutes ?? 0)}
              />
            </>
          ) : null}
        </dl>
      </section>

      <div className="slip-tables">
        <section className="slip-section">
          <h3>Devengos</h3>
          <table className="slip-table">
            <tbody>
              <MoneyRow
                label="Salario básico quincenal"
                value={snap.earnings?.basicSalary ?? 0}
              />
              <MoneyRow
                label="Turnos / días"
                value={snap.earnings?.shiftPay ?? 0}
                hideZero
              />
              <MoneyRow
                label="Recargo nocturno"
                value={snap.earnings?.nightSurcharge ?? 0}
              />
              <MoneyRow
                label="Recargo dominical/festivo"
                value={snap.earnings?.sundaySurcharge ?? 0}
              />
              <MoneyRow
                label="Bonos fijos"
                value={snap.earnings?.fixedBonuses ?? 0}
              />
              <MoneyRow
                label="Bonos por meta"
                value={snap.earnings?.goalBonuses ?? 0}
              />
              <MoneyRow label="Horas extra" value={snap.earnings?.overtime ?? 0} />
              <MoneyRow
                label="Bonos ocasionales"
                value={snap.earnings?.occasionalBonuses ?? 0}
              />
              <MoneyRow
                label="Auxilio de transporte"
                value={snap.earnings?.transportAid ?? 0}
              />
              <MoneyRow
                label="Desc. tiempo no laborado"
                value={-(snap.earnings?.unpaidTimeDiscount ?? 0)}
              />
              <MoneyRow label="Total devengos" value={earningsTotal} strong />
            </tbody>
          </table>
        </section>

        <section className="slip-section">
          <h3>Deducciones trabajador</h3>
          <table className="slip-table">
            <tbody>
              <MoneyRow label="Salud" value={snap.deductions?.health ?? 0} />
              <MoneyRow label="Pensión" value={snap.deductions?.pension ?? 0} />
              <MoneyRow
                label="Fondo de solidaridad"
                value={snap.deductions?.solidarity ?? 0}
              />
              <MoneyRow
                label="Anticipos"
                value={snap.deductions?.advances ?? 0}
              />
              <MoneyRow
                label="Descuentos autorizados"
                value={snap.deductions?.authorizedDiscounts ?? 0}
              />
              <MoneyRow
                label="Total deducciones"
                value={deductionsTotal}
                strong
              />
            </tbody>
          </table>
        </section>

        <section className="slip-section">
          <h3>Aportes empresa (contabilidad / SST)</h3>
          <table className="slip-table">
            <tbody>
              <MoneyRow
                label="Salud patronal"
                value={snap.employer?.health ?? 0}
              />
              <MoneyRow
                label="Pensión patronal"
                value={snap.employer?.pension ?? 0}
              />
              <MoneyRow label="ARL" value={snap.employer?.arl ?? 0} />
              <MoneyRow label="SENA" value={snap.employer?.sena ?? 0} />
              <MoneyRow label="ICBF" value={snap.employer?.icbf ?? 0} />
              <MoneyRow
                label="Caja de compensación"
                value={snap.employer?.compensationFund ?? 0}
              />
              <MoneyRow
                label="Total aportes"
                value={snap.employer?.totalContributions ?? 0}
                strong
              />
            </tbody>
          </table>
        </section>

        <section className="slip-section">
          <h3>Provisiones (contabilidad)</h3>
          <table className="slip-table">
            <tbody>
              <MoneyRow label="Prima" value={snap.provisions?.prima ?? 0} />
              <MoneyRow
                label="Cesantías"
                value={snap.provisions?.cesantias ?? 0}
              />
              <MoneyRow
                label="Intereses cesantías"
                value={snap.provisions?.interestCesantias ?? 0}
              />
              <MoneyRow
                label="Vacaciones"
                value={snap.provisions?.vacaciones ?? 0}
              />
              <MoneyRow
                label="Total provisiones"
                value={snap.provisions?.total ?? 0}
                strong
              />
            </tbody>
          </table>
        </section>
      </div>

      <section className="slip-totals">
        <div>
          <p className="slip-kicker">Neto a pagar al trabajador</p>
          <p className="slip-net">{formatCOP(net)}</p>
          <p className="slip-sub">
            Tesorería: valor a girar / consignar en esta quincena
          </p>
        </div>
        <div>
          <p className="slip-kicker">Costo empresa del periodo</p>
          <p className="slip-cost">{formatCOP(cost)}</p>
          <p className="slip-sub">
            Contabilidad: neto + aportes + provisiones del cálculo
          </p>
        </div>
        <div>
          <p className="slip-kicker">Novedades aplicadas</p>
          <p className="slip-cost">{line.novelty_count}</p>
          <p className="slip-sub">Anticipos, bonos, descuentos y permisos</p>
        </div>
      </section>

      {(snap.notes ?? []).length > 0 ? (
        <section className="slip-section">
          <h3>Notas del cálculo</h3>
          <ul className="slip-notes">
            {(snap.notes ?? []).map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="slip-signs">
        <div>
          <div className="slip-sign-line" />
          <p>Firma trabajador</p>
          <p className="slip-sub">Recibí conforme</p>
        </div>
        <div>
          <div className="slip-sign-line" />
          <p>RRHH / Liquidación</p>
          <p className="slip-sub">Elaboró / revisó</p>
        </div>
        <div>
          <div className="slip-sign-line" />
          <p>Tesorería</p>
          <p className="slip-sub">Pago ejecutado</p>
        </div>
      </footer>
    </article>
  );
}

function paymentStatusLabel(status: string) {
  const map: Record<string, string> = {
    BORRADOR: "Borrador",
    EN_REVISION: "Por aprobar",
    APROBADA: "Aprobada",
    EN_COLA_PAGO: "Por pagar",
    PAGADA: "Pagada",
    RECHAZADA: "Rechazada",
    ANULADA: "Anulada",
  };
  return map[status] ?? status;
}

export function PayrollSlipsSection({
  organization,
  period,
  lines,
  employeesById,
  paymentRequestsByLineId = {},
}: {
  organization: SlipOrg;
  period: SlipPeriod;
  lines: SlipLine[];
  employeesById: Record<string, SlipEmployee>;
  /** Solicitudes activas indexadas por payroll_period_lines.id */
  paymentRequestsByLineId?: Record<string, SlipPaymentRequest>;
}) {
  const router = useRouter();
  const [focusId, setFocusId] = useState<string | null>(null);
  const [pendingLineId, setPendingLineId] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [payOk, setPayOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const clearFocus = () => setFocusId(null);
    window.addEventListener("afterprint", clearFocus);
    return () => window.removeEventListener("afterprint", clearFocus);
  }, []);

  const printAll = useCallback(() => {
    setFocusId(null);
    requestAnimationFrame(() => window.print());
  }, []);

  const printOne = useCallback((employeeId: string) => {
    setFocusId(employeeId);
    requestAnimationFrame(() => window.print());
  }, []);

  if (lines.length === 0) return null;

  const isOfficial =
    period.status === "EMITIDA" || period.status === "CERRADA";

  return (
    <section className="space-y-4">
      <style>{`
        @page {
          size: letter;
          margin: 12mm 14mm;
        }
        @media screen {
          .print-only { display: none !important; }
        }
        @media print {
          html, body {
            background: white !important;
            color: #111 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body * { box-shadow: none !important; }
          .no-print { display: none !important; }
          .print-root {
            display: block !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .print-sheet {
            break-after: page;
            break-inside: avoid;
            border: none !important;
            border-radius: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          .print-sheet:last-child { break-after: auto; }
          .print-hide-sheet { display: none !important; }
        }

        .slip-sheet {
          border: 1px solid var(--line);
          border-radius: 1rem;
          background: white;
          padding: 1.25rem 1.5rem;
        }
        .slip-draft-banner {
          margin: 0 0 0.75rem;
          padding: 0.45rem 0.65rem;
          border: 1px dashed #b45309;
          background: #fffbeb;
          color: #92400e;
          font-size: 0.78rem;
          font-weight: 700;
          letter-spacing: 0.03em;
          text-transform: uppercase;
          text-align: center;
        }
        .slip-header {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          gap: 1rem;
          border-bottom: 1.5px solid #111;
          padding-bottom: 0.85rem;
          margin-bottom: 1rem;
        }
        .slip-kicker {
          font-size: 0.68rem;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #666;
          margin: 0;
        }
        .slip-org {
          margin: 0.2rem 0 0;
          font-size: 1.25rem;
          font-weight: 700;
          letter-spacing: -0.02em;
        }
        .slip-sub {
          margin: 0.15rem 0 0;
          font-size: 0.78rem;
          color: #555;
        }
        .slip-period-box { text-align: right; min-width: 12rem; }
        .slip-period-title {
          margin: 0.15rem 0 0;
          font-size: 1rem;
          font-weight: 700;
        }
        .slip-section { margin-top: 0.9rem; }
        .slip-section h3 {
          margin: 0 0 0.4rem;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: #444;
          border-bottom: 1px solid #ddd;
          padding-bottom: 0.25rem;
        }
        .slip-meta-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.35rem 1.25rem;
          margin: 0;
        }
        @media (min-width: 700px) {
          .slip-meta-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
        .slip-meta-item { margin: 0; }
        .slip-meta-item dt {
          font-size: 0.65rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #777;
        }
        .slip-meta-item dd {
          margin: 0.05rem 0 0;
          font-size: 0.86rem;
          font-weight: 500;
        }
        .slip-tables {
          display: grid;
          gap: 0.85rem;
          margin-top: 0.35rem;
        }
        @media (min-width: 800px) {
          .slip-tables { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        .slip-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.82rem;
        }
        .slip-table td {
          padding: 0.22rem 0;
          border-bottom: 1px solid #eee;
          vertical-align: baseline;
        }
        .slip-table td.num {
          text-align: right;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
          padding-left: 0.75rem;
        }
        .slip-table tr.slip-strong td {
          font-weight: 700;
          border-bottom: none;
          padding-top: 0.4rem;
        }
        .slip-totals {
          display: grid;
          gap: 0.75rem;
          margin-top: 1rem;
          padding: 0.85rem 0 0;
          border-top: 1.5px solid #111;
        }
        @media (min-width: 700px) {
          .slip-totals { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
        .slip-net {
          margin: 0.15rem 0 0;
          font-size: 1.45rem;
          font-weight: 800;
          letter-spacing: -0.02em;
        }
        .slip-cost {
          margin: 0.15rem 0 0;
          font-size: 1.15rem;
          font-weight: 700;
        }
        .slip-notes {
          margin: 0.35rem 0 0;
          padding-left: 1.1rem;
          font-size: 0.75rem;
          color: #555;
        }
        .slip-signs {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 1rem;
          margin-top: 1.4rem;
          padding-top: 0.5rem;
          font-size: 0.78rem;
          text-align: center;
        }
        .slip-sign-line {
          height: 2.2rem;
          border-bottom: 1px solid #333;
          margin-bottom: 0.35rem;
        }
      `}</style>

      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            4 · Colillas de pago
          </p>
          <h2 className="mt-1 font-medium">Comprobantes por empleado</h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
            Se generan con el cálculo vigente (no se archivan aparte). Si
            reabre, corrige y recalcula, al volver a emitir las colillas ya
            reflejan los nuevos valores.{" "}
            {isOfficial
              ? "Versión oficial emitida."
              : "Ahora están provisionales hasta emitir de nuevo."}
          </p>
        </div>
        <button
          type="button"
          onClick={printAll}
          className="rounded-lg bg-[var(--solid)] px-4 py-2 text-sm text-[var(--on-solid)]"
        >
          Imprimir todas ({lines.length})
        </button>
      </div>
      {!isOfficial ? (
        <p className="no-print rounded-lg border border-dashed border-amber-600 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Colillas en borrador: cualquier impresión de esta pantalla queda
          sujeta a cambio. La versión oficial es la que imprima después de
          emitir.
        </p>
      ) : null}

      {isOfficial ? (
        <p className="no-print rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--muted)]">
          Envíe cada neto a{" "}
          <Link
            href="/solicitudes-pago"
            className="underline underline-offset-2 hover:text-[var(--ink)]"
          >
            Solicitudes de pago
          </Link>{" "}
          para aval y desembolso (banco/caja). El monto es el neto de la colilla.
        </p>
      ) : null}
      {payError ? (
        <p className="no-print rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {payError}
        </p>
      ) : null}
      {payOk ? (
        <p className="no-print rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {payOk}{" "}
          <Link
            href="/solicitudes-pago"
            className="underline underline-offset-2"
          >
            Ir a solicitudes →
          </Link>
        </p>
      ) : null}

      <div className="no-print space-y-2">
        {lines.map((line) => {
          const payReq = paymentRequestsByLineId[line.id];
          const net = Number(line.net_pay || 0);
          return (
            <div
              key={line.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-white px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-medium">{line.employee_name}</p>
                <p className="text-sm text-[var(--muted)]">
                  {line.position_title || "Sin cargo"} · Neto{" "}
                  {formatCOP(line.net_pay)}
                </p>
                {payReq ? (
                  <p className="mt-1 text-xs text-emerald-800">
                    Solicitud {paymentStatusLabel(payReq.status)}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:border-[var(--ink)]"
                  onClick={() => printOne(line.employee_id)}
                >
                  Imprimir colilla
                </button>
                {isOfficial ? (
                  payReq ? (
                    <Link
                      href="/solicitudes-pago"
                      className="rounded-lg border border-emerald-700 px-3 py-2 text-sm text-emerald-900 hover:bg-emerald-50"
                    >
                      Ver en pagos
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled={pending || net <= 0}
                      className="rounded-lg bg-[var(--solid)] px-3 py-2 text-sm text-[var(--on-solid)] disabled:opacity-50"
                      onClick={() => {
                        if (
                          !confirm(
                            `¿Enviar a Solicitudes de pago?\n\n${line.employee_name}\nNeto: ${formatCOP(net)}`,
                          )
                        )
                          return;
                        setPayError(null);
                        setPayOk(null);
                        setPendingLineId(line.id);
                        startTransition(async () => {
                          const r = await sendPayrollLineToPaymentRequestAction(
                            line.id,
                          );
                          setPendingLineId(null);
                          if (!r.ok) {
                            setPayError(r.error ?? "No se pudo enviar");
                            return;
                          }
                          setPayOk(
                            `Solicitud creada por ${formatCOP(net)} · ${line.employee_name}.`,
                          );
                          router.refresh();
                        });
                      }}
                    >
                      {pending && pendingLineId === line.id
                        ? "Enviando…"
                        : "Enviar a solicitud de pago"}
                    </button>
                  )
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="print-only print-root space-y-8">
        {lines.map((line) => (
          <PayrollSlipSheet
            key={line.id}
            organization={organization}
            period={period}
            line={line}
            employee={employeesById[line.employee_id] ?? null}
            focusId={focusId}
          />
        ))}
      </div>
    </section>
  );
}
