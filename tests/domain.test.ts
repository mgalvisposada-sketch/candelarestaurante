import { describe, expect, it } from "vitest";
import {
  apDocumentBalance,
  addMoney,
  toMoneyString,
} from "../src/lib/money";
import { computeLoanKpis, computeFundingBag } from "../src/lib/loans";
import {
  canCloseHandover,
  participationWarning,
  summarizeHandoverQuality,
} from "../src/lib/handover";
import { summarizeApAging } from "../src/lib/accounts-payable";

describe("money", () => {
  it("evita float y calcula saldo CxP", () => {
    expect(toMoneyString(addMoney("1000000.10", "0.05"))).toBe("1000000.15");
    expect(toMoneyString(apDocumentBalance("10000000", "3500000"))).toBe(
      "6500000.00",
    );
  });
});

describe("loans", () => {
  it("calcula KPIs de capital e interés", () => {
    const kpis = computeLoanKpis({
      approvedPrincipal: "180000000",
      disbursements: ["100000000", "50000000"],
      principalPaid: ["20000000"],
      interestAccrued: "1500000",
      interestPaid: ["500000"],
    });
    expect(kpis.capitalDesembolsado.toFixed(2)).toBe("150000000.00");
    expect(kpis.saldoCapital.toFixed(2)).toBe("130000000.00");
    expect(kpis.interesPagado.toFixed(2)).toBe("500000.00");
  });

  it("calcula bolsa de uso de capital", () => {
    const bag = computeFundingBag({
      approved: "110000000",
      committed: "80000000",
      paid: "50000000",
    });
    expect(bag.disponible.toFixed(2)).toBe("30000000.00");
  });
});

describe("handover", () => {
  it("resume calidad y permite cierre con pendientes", () => {
    const summary = summarizeHandoverQuality([
      { status: "CONFIRMADO" },
      { status: "CONFIRMADO" },
      { status: "DECLARADO" },
      { status: "PENDIENTE" },
    ]);
    expect(summary.pctConfirmed).toBe(50);
    expect(summary.pctDeclared).toBe(25);
    expect(summary.pctPending).toBe(25);
    expect(canCloseHandover()).toBe(true);
  });

  it("advierte participación distinta de 100%", () => {
    expect(participationWarning(95)).toMatch(/95%/);
    expect(participationWarning(100)).toBeNull();
  });
});

describe("accounts payable aging", () => {
  it("clasifica saldos por antigüedad", () => {
    const aging = summarizeApAging(
      [
        { dueDate: "2026-08-20", originalAmount: "100", paidAmount: "0" },
        { dueDate: "2026-07-01", originalAmount: "200", paidAmount: "50" },
        { dueDate: "2026-04-01", originalAmount: "300", paidAmount: "0" },
      ],
      "2026-09-13",
    );
    expect(aging["0-30"]).toBe("100.00");
    expect(aging["61-90"]).toBe("150.00");
    expect(aging[">90"]).toBe("300.00");
  });
});
