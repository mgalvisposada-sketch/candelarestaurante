"use client";

import { useEffect } from "react";
import { formatCOP } from "@/lib/money";

export type LiquidationDetailLine = {
  employee_name: string;
  position_title: string | null;
  novelty_count: number;
  net_pay: number | string;
  employer_cost: number | string;
  earnings_total: number | string;
  deductions_total: number | string;
  snapshot: Record<string, unknown> | null;
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
  novelties?: {
    count?: number;
    overtimeMinutes?: number;
    unpaidMinutes?: number;
  };
  notes?: string[];
  netPay?: number;
  employerCost?: number;
};

function Line({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: number;
  emphasize?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 text-sm ${
        emphasize ? "font-medium" : ""
      }`}
    >
      <span className="text-[var(--muted)]">{label}</span>
      <span className="tabular-nums">{formatCOP(value)}</span>
    </div>
  );
}

function fmtHours(h: number | undefined): string {
  if (h == null || Number.isNaN(h)) return "—";
  const totalMins = Math.round(h * 60);
  const hh = Math.floor(totalMins / 60);
  const mm = totalMins % 60;
  return `${hh}:${String(mm).padStart(2, "0")}`;
}

export function LiquidationDetailModal({
  line,
  onClose,
}: {
  line: LiquidationDetailLine;
  onClose: () => void;
}) {
  const snap = (line.snapshot ?? {}) as Snap;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const net = Number(snap.netPay ?? line.net_pay ?? 0);
  const cost = Number(snap.employerCost ?? line.employer_cost ?? 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="liq-detail-title"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-[var(--line)] bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
              Detalle de liquidación
            </p>
            <h2
              id="liq-detail-title"
              className="mt-0.5 truncate font-display text-xl font-bold tracking-tight"
            >
              {line.employee_name}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {line.position_title || "Sin cargo"}
              {snap.periodLabel ? ` · ${snap.periodLabel}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm hover:bg-[var(--surface)]"
          >
            Cerrar
          </button>
        </header>

        <div className="overflow-y-auto px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--line)] p-4">
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                Neto a pagar
              </p>
              <p className="mt-1 font-display text-2xl font-bold">
                {formatCOP(net)}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--line)] p-4">
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                Costo empresa
              </p>
              <p className="mt-1 font-display text-2xl font-bold">
                {formatCOP(cost)}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-[var(--line)] p-4 text-sm">
            <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              Horas / planilla
            </h3>
            <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--muted)]">Días laborados</dt>
                <dd>{snap.hours?.workedDays ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--muted)]">Domingos</dt>
                <dd>{snap.hours?.sundayDays ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--muted)]">Horas diurnas</dt>
                <dd>{fmtHours(snap.hours?.ordinaryDayHours)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--muted)]">Horas nocturnas</dt>
                <dd>{fmtHours(snap.hours?.ordinaryNightHours)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--muted)]">Horas dom./fest. día</dt>
                <dd>{fmtHours(snap.hours?.sundayDayHours)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--muted)]">Horas dom./fest. noche</dt>
                <dd>{fmtHours(snap.hours?.sundayNightHours)}</dd>
              </div>
              {snap.attendance?.used ? (
                <>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--muted)]">Horas netas planilla</dt>
                    <dd>{fmtHours(snap.attendance.netWorkedHours)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--muted)]">Descanso / festivo</dt>
                    <dd>{snap.attendance.restDays ?? 0}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--muted)]">Min. extras</dt>
                    <dd>{snap.attendance.overtimeMinutes ?? 0}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--muted)]">Min. no laborados</dt>
                    <dd>{snap.attendance.unpaidMinutes ?? 0}</dd>
                  </div>
                </>
              ) : null}
              <div className="flex justify-between gap-2 sm:col-span-2">
                <dt className="text-[var(--muted)]">Valor hora ordinaria</dt>
                <dd className="tabular-nums">
                  {formatCOP(snap.ordinaryHourValue ?? 0)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="space-y-2 rounded-xl border border-[var(--line)] p-4">
              <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                Devengos
              </h3>
              <Line
                label="Salario básico quincenal"
                value={snap.earnings?.basicSalary ?? 0}
              />
              {(snap.earnings?.shiftPay ?? 0) > 0 ? (
                <Line label="Turnos / días" value={snap.earnings?.shiftPay ?? 0} />
              ) : null}
              <Line
                label="Recargo nocturno"
                value={snap.earnings?.nightSurcharge ?? 0}
              />
              <Line
                label="Recargo dominical/festivo"
                value={snap.earnings?.sundaySurcharge ?? 0}
              />
              <Line label="Bonos fijos" value={snap.earnings?.fixedBonuses ?? 0} />
              <Line
                label="Bonos por meta"
                value={snap.earnings?.goalBonuses ?? 0}
              />
              <Line label="Horas extra" value={snap.earnings?.overtime ?? 0} />
              <Line
                label="Bonos ocasionales"
                value={snap.earnings?.occasionalBonuses ?? 0}
              />
              <Line
                label="Auxilio transporte"
                value={snap.earnings?.transportAid ?? 0}
              />
              <Line
                label="Desc. tiempo no laborado"
                value={-(snap.earnings?.unpaidTimeDiscount ?? 0)}
              />
              <Line
                label="Total devengos"
                value={snap.earnings?.total ?? Number(line.earnings_total)}
                emphasize
              />
            </div>

            <div className="space-y-2 rounded-xl border border-[var(--line)] p-4">
              <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                Deducciones trabajador
              </h3>
              <Line label="Salud" value={snap.deductions?.health ?? 0} />
              <Line label="Pensión" value={snap.deductions?.pension ?? 0} />
              <Line
                label="Fondo solidaridad"
                value={snap.deductions?.solidarity ?? 0}
              />
              <Line label="Anticipos" value={snap.deductions?.advances ?? 0} />
              <Line
                label="Descuentos autorizados"
                value={snap.deductions?.authorizedDiscounts ?? 0}
              />
              <Line
                label="Total deducciones"
                value={snap.deductions?.total ?? Number(line.deductions_total)}
                emphasize
              />
            </div>

            <div className="space-y-2 rounded-xl border border-[var(--line)] p-4">
              <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                Aportes empresa
              </h3>
              <Line label="Salud patronal" value={snap.employer?.health ?? 0} />
              <Line
                label="Pensión patronal"
                value={snap.employer?.pension ?? 0}
              />
              <Line label="ARL" value={snap.employer?.arl ?? 0} />
              <Line label="SENA" value={snap.employer?.sena ?? 0} />
              <Line label="ICBF" value={snap.employer?.icbf ?? 0} />
              <Line
                label="Caja compensación"
                value={snap.employer?.compensationFund ?? 0}
              />
              <Line
                label="Total aportes"
                value={snap.employer?.totalContributions ?? 0}
                emphasize
              />
            </div>

            <div className="space-y-2 rounded-xl border border-[var(--line)] p-4">
              <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                Provisiones
              </h3>
              <Line label="Prima" value={snap.provisions?.prima ?? 0} />
              <Line label="Cesantías" value={snap.provisions?.cesantias ?? 0} />
              <Line
                label="Intereses cesantías"
                value={snap.provisions?.interestCesantias ?? 0}
              />
              <Line label="Vacaciones" value={snap.provisions?.vacaciones ?? 0} />
              <Line
                label="Total provisiones"
                value={snap.provisions?.total ?? 0}
                emphasize
              />
            </div>
          </div>

          {(snap.notes ?? []).length > 0 ? (
            <div className="mt-4 rounded-xl border border-[var(--line)] p-4">
              <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                Notas del cálculo
              </h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--muted)]">
                {(snap.notes ?? []).map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
