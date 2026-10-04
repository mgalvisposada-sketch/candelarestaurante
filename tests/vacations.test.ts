import { describe, expect, it } from "vitest";
import {
  calendarDaysInclusive,
  computeVacationEntitlement,
  countBusinessDays,
  earnedVacationDays,
  endDateForBusinessDays,
  vacationEnjoymentPay,
  vacationSettlementPay,
} from "../src/lib/payroll/vacations";

describe("vacaciones CO", () => {
  it("causa 15 días exactos a 360 días trabajados", () => {
    expect(earnedVacationDays(360)).toBe(15);
    expect(earnedVacationDays(180)).toBe(7.5);
  });

  it("paga disfrute como salario × días / 30", () => {
    expect(vacationEnjoymentPay(3_000_000, 15)).toBe(1_500_000);
  });

  it("liquida proporcionales salario × días / 720", () => {
    expect(vacationSettlementPay(3_000_000, 360)).toBe(1_500_000);
    expect(vacationSettlementPay(3_000_000, 180)).toBe(750_000);
  });

  it("cuenta días hábiles lun–vie", () => {
    // 2026-01-05 (lun) a 2026-01-09 (vie) = 5
    expect(countBusinessDays("2026-01-05", "2026-01-09")).toBe(5);
    expect(
      countBusinessDays("2026-01-05", "2026-01-10", { saturday: true }),
    ).toBe(6);
  });

  it("calcula fin de periodo para 15 hábiles", () => {
    expect(endDateForBusinessDays("2026-01-05", 15)).toBe("2026-01-23");
  });

  it("causación indefinido desde ingreso", () => {
    const r = computeVacationEntitlement({
      hireDate: "2025-01-15",
      employmentType: "INDEFINIDO",
      basicSalary: 2_000_000,
      vacations: [],
      asOf: "2026-01-15",
    });
    expect(r.applies).toBe(true);
    expect(r.yearsCompleted).toBe(1);
    expect(r.calendarDaysWorked).toBe(calendarDaysInclusive("2025-01-15", "2026-01-15"));
    expect(r.earnedDays).toBe(earnedVacationDays(r.calendarDaysWorked));
    expect(r.availableDays).toBe(r.earnedDays);
    expect(r.suggestion).not.toBeNull();
    expect(r.suggestion!.businessDays).toBeGreaterThan(0);
    expect(r.suggestion!.payEstimate).toBeGreaterThan(0);
  });

  it("término fijo corta causación en fin de contrato", () => {
    const r = computeVacationEntitlement({
      hireDate: "2025-01-01",
      employmentType: "TERMINO_FIJO",
      contractEndDate: "2025-06-30",
      basicSalary: 2_000_000,
      vacations: [],
      asOf: "2026-01-01",
    });
    expect(r.serviceEndDate).toBe("2025-06-30");
    expect(r.calendarDaysWorked).toBe(
      calendarDaysInclusive("2025-01-01", "2025-06-30"),
    );
  });

  it("descuenta periodos programados/disfrutados del saldo", () => {
    const r = computeVacationEntitlement({
      hireDate: "2024-01-01",
      employmentType: "INDEFINIDO",
      basicSalary: 3_000_000,
      asOf: "2026-01-01",
      vacations: [
        { business_days: 15, status: "DISFRUTADA" },
        { business_days: 5, status: "PROGRAMADA" },
        { business_days: 10, status: "CANCELADA" },
      ],
    });
    expect(r.usedDays).toBe(20);
    expect(r.scheduledDays).toBe(5);
    expect(r.availableDays).toBe(round2(r.earnedDays - 20));
  });

  it("prestación de servicios no aplica", () => {
    const r = computeVacationEntitlement({
      hireDate: "2024-01-01",
      employmentType: "PRESTACION_SERVICIOS",
      basicSalary: 3_000_000,
      vacations: [],
      asOf: "2026-01-01",
    });
    expect(r.applies).toBe(false);
  });
});

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
