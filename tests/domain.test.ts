import { describe, expect, it } from "vitest";
import {
  apDocumentBalance,
  addMoney,
  toMoneyString,
} from "../src/lib/money";
import {
  computeLoanKpis,
  computeFundingBag,
  disbursementTreasuryStatus,
} from "../src/lib/loans";
import {
  canCloseHandover,
  parseHandoverBreakdownLines,
  participationWarning,
  sumHandoverBreakdownLines,
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

  it("marca si el desembolso ya ingresó a tesorería", () => {
    expect(
      disbursementTreasuryStatus({
        bank_account_id: "a",
        bank_transaction_id: "t",
      }),
    ).toBe("EN_TESORERIA");
    expect(
      disbursementTreasuryStatus({
        bank_account_id: "a",
        bank_transaction_id: null,
      }),
    ).toBe("PENDIENTE_INGRESO");
    expect(
      disbursementTreasuryStatus({
        bank_account_id: null,
        bank_transaction_id: null,
      }),
    ).toBe("SIN_CUENTA");
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

  it("parsea y suma líneas de desglose", () => {
    const lines = parseHandoverBreakdownLines([
      { id: "1", name: "Cliente A", amount: "150000.50", note: "factura" },
      { id: "2", name: "  ", amount: 10 },
      { id: "3", name: "Cliente B", amount: 50000 },
      { name: "Cliente C" },
    ]);
    expect(lines).toHaveLength(3);
    expect(lines[0]?.name).toBe("Cliente A");
    expect(lines[0]?.amount).toBe(150000.5);
    expect(lines[1]?.name).toBe("Cliente B");
    expect(lines[2]?.name).toBe("Cliente C");
    expect(lines[2]?.amount).toBeNull();
    expect(sumHandoverBreakdownLines(lines)).toBe(200000.5);
  });

  it("acepta metadata_json string y ignora arrays vacíos", () => {
    expect(parseHandoverBreakdownLines("")).toEqual([]);
    expect(parseHandoverBreakdownLines("not-json")).toEqual([]);
    const fromJson = parseHandoverBreakdownLines(
      JSON.stringify([{ id: "a", name: "Tercero X", amount: 1000 }]),
    );
    expect(fromJson).toHaveLength(1);
    expect(sumHandoverBreakdownLines(fromJson)).toBe(1000);
    expect(sumHandoverBreakdownLines([])).toBeNull();
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

describe("shareholders", () => {
  it("calcula saldo de cuenta socio y etiqueta", async () => {
    const { computeShareholderAccountBalance, shareholderBalanceLabel, sumParticipation } =
      await import("../src/lib/shareholders");

    const balance = computeShareholderAccountBalance({
      openingBalance: "1000000",
      credits: ["500000"],
      debits: ["200000"],
    });
    expect(balance.toFixed(2)).toBe("1300000.00");
    expect(shareholderBalanceLabel(balance).label).toBe("Acreedor de Candela");
    expect(sumParticipation([50, 30, 20])).toBe(100);
  });
});

describe("treasury", () => {
  it("suma saldos iniciales", async () => {
    const { sumOpeningBalances, bankKindLabel } = await import(
      "../src/lib/treasury"
    );
    expect(sumOpeningBalances(["1000.50", "2000.25"])).toBe("3000.75");
    expect(bankKindLabel("CAJA")).toBe("Caja");
    expect(bankKindLabel("CAJA", { isCashFloat: true })).toBe("Base / flotante");
  });

  it("resuelve destinos del cierre solo con cuentas de ventas", async () => {
    const { resolveCashCloseDestinations } = await import(
      "../src/lib/treasury"
    );
    const accounts = [
      { id: "base-1", account_kind: "CAJA", is_active: true, is_cash_float: true, fund_purpose: "VENTAS" },
      { id: "caja-1", account_kind: "CAJA", is_active: true, is_cash_float: false, fund_purpose: "VENTAS" },
      { id: "banco-1", account_kind: "BANCO", is_active: true, fund_purpose: "VENTAS" },
      { id: "banco-2", account_kind: "BANCO", is_active: true, fund_purpose: "VENTAS" },
      { id: "banco-prestamo", account_kind: "BANCO", is_active: true, fund_purpose: "EMPRESA" },
    ];
    const dest = resolveCashCloseDestinations(accounts);
    expect(dest.cashAccountId).toBe("caja-1");
    expect(dest.cardAccountId).toBe("banco-1");
    expect(dest.transferAccountId).toBe("banco-1");

    const split = resolveCashCloseDestinations(accounts, {
      cardAccountId: "banco-1",
      transferAccountId: "banco-2",
    });
    expect(split.cardAccountId).toBe("banco-1");
    expect(split.transferAccountId).toBe("banco-2");

    const empresaOnly = resolveCashCloseDestinations(
      accounts.filter((a) => a.fund_purpose === "EMPRESA"),
    );
    expect(empresaOnly.cashAccountId).toBeNull();
    expect(empresaOnly.cardAccountId).toBeNull();
  });

  it("calcula saldo disponible con créditos y débitos posteriores al corte", async () => {
    const {
      computeAvailableBalance,
      availableBalanceForAccount,
      contrastDelta,
      pickOpeningSnapshot,
    } = await import("../src/lib/treasury-balance");

    expect(
      computeAvailableBalance({
        openingBalance: "1000000",
        credits: ["500000"],
        debits: ["200000"],
      }).toFixed(2),
    ).toBe("1300000.00");

    const snapshots = [
      {
        bank_account_id: "acc-1",
        cutoff_date: "2026-01-01",
        opening_balance: "1000000",
        verification_status: "CONFIRMADO",
      },
      {
        bank_account_id: "acc-1",
        cutoff_date: "2025-12-01",
        opening_balance: "500000",
        verification_status: "DECLARADO",
      },
    ];
    expect(pickOpeningSnapshot(snapshots, "acc-1", "2026-01-01")?.opening_balance).toBe(
      "1000000",
    );

    const available = availableBalanceForAccount({
      accountId: "acc-1",
      orgCutoff: "2026-01-01",
      snapshots,
      transactions: [
        {
          bank_account_id: "acc-1",
          transaction_date: "2026-01-01",
          debit: 0,
          credit: "999",
        },
        {
          bank_account_id: "acc-1",
          transaction_date: "2026-01-10",
          debit: 0,
          credit: "300000",
        },
        {
          bank_account_id: "acc-1",
          transaction_date: "2026-01-12",
          debit: "50000",
          credit: 0,
        },
        {
          bank_account_id: "acc-2",
          transaction_date: "2026-01-10",
          debit: 0,
          credit: "1000000",
        },
      ],
    });
    // opening 1_000_000 + crédito 300_000 − débito 50_000 (mismo día del corte no cuenta)
    expect(available.toFixed(2)).toBe("1250000.00");

    expect(contrastDelta("100", "90")?.toFixed(2)).toBe("10.00");
    expect(contrastDelta("100", null)).toBeNull();
  });

  it("bloquea pago cuando el disponible es menor al monto", async () => {
    const { computeAvailableBalance } = await import(
      "../src/lib/treasury-balance"
    );
    const available = computeAvailableBalance({
      openingBalance: "100000",
      credits: ["20000"],
      debits: ["10000"],
    });
    const payAmount = 150000;
    expect(available.lt(payAmount)).toBe(true);
    expect(available.toFixed(2)).toBe("110000.00");
  });

  it("permite pagar cuando el disponible redondea al mismo peso que el monto", async () => {
    const { hasFundsFor, formatCOP } = await import("../src/lib/money");
    // Saldo real con centavos; en pantalla ambos se ven como $ 301.321
    expect(formatCOP(301320.5)).toBe(formatCOP(301321));
    expect(hasFundsFor(301320.5, 301321)).toBe(true);
    expect(hasFundsFor(301320.49, 301321)).toBe(false);
    expect(hasFundsFor(301321, 301321)).toBe(true);
  });
});

describe("budget sales goal", () => {
  it("aproxima meta de ventas y break-even con margen de contribución", async () => {
    const {
      computeSalesGoal,
      contributionMarginFromVariableCost,
    } = await import("../src/lib/budget");

    expect(contributionMarginFromVariableCost(35).toFixed(2)).toBe("65.00");

    const breakEven = computeSalesGoal({
      fixedExpenses: "30000000",
      contributionMarginPct: 65,
    });
    expect(breakEven.ok).toBe(true);
    if (breakEven.ok) {
      expect(breakEven.breakEven.toFixed(2)).toBe("46153846.15");
      expect(breakEven.salesGoal.toFixed(2)).toBe("46153846.15");
    }

    const withProfit = computeSalesGoal({
      fixedExpenses: "30000000",
      contributionMarginPct: 65,
      desiredProfit: "5000000",
    });
    expect(withProfit.ok).toBe(true);
    if (withProfit.ok) {
      expect(withProfit.salesGoal.toFixed(2)).toBe("53846153.85");
      expect(withProfit.breakEven.toFixed(2)).toBe("46153846.15");
    }
  });

  it("rechaza margen de contribución inválido", async () => {
    const { computeSalesGoal } = await import("../src/lib/budget");
    const zero = computeSalesGoal({
      fixedExpenses: "1000000",
      contributionMarginPct: 0,
    });
    expect(zero.ok).toBe(false);
    if (!zero.ok) {
      expect(zero.error).toMatch(/mayor a 0/);
    }

    const over = computeSalesGoal({
      fixedExpenses: "1000000",
      contributionMarginPct: 120,
    });
    expect(over.ok).toBe(false);
  });

  it("formatea períodos año / semestre / trimestre / mes", async () => {
    const { formatBudgetPeriod } = await import("../src/lib/budget");
    expect(
      formatBudgetPeriod({
        period_kind: "YEAR",
        period_year: 2026,
        period_month: null,
      }),
    ).toBe("Año 2026");
    expect(
      formatBudgetPeriod({
        period_kind: "SEMESTER",
        period_year: 2026,
        period_month: 2,
      }),
    ).toBe("2.º semestre 2026");
    expect(
      formatBudgetPeriod({
        period_kind: "QUARTER",
        period_year: 2026,
        period_month: 3,
      }),
    ).toBe("T3 2026");
    expect(
      formatBudgetPeriod({
        period_kind: "MONTH",
        period_year: 2026,
        period_month: 10,
      }),
    ).toBe("Octubre 2026");
  });
});
