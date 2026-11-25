import { describe, expect, it } from "vitest";
import { money } from "@/lib/money";
import {
  PAYMENT_SOURCE_LABEL,
  SYNTHETIC_CATEGORY,
} from "@/lib/reports/expense-by-account-types";

describe("expense-by-account report helpers", () => {
  it("tiene labels de origen de pago", () => {
    expect(PAYMENT_SOURCE_LABEL.GASTO).toBe("Gasto");
    expect(PAYMENT_SOURCE_LABEL.FACTURA_PROVEEDOR).toBe("Factura proveedor");
    expect(PAYMENT_SOURCE_LABEL.SOLICITUD_INTERNA).toBe("Solicitud interna");
  });

  it("define buckets sintéticos para pagos sin categoría", () => {
    expect(SYNTHETIC_CATEGORY.COMPRAS.name).toMatch(/Compras/);
    expect(SYNTHETIC_CATEGORY.SOLICITUDES.key).toContain("synthetic:");
  });

  it("totales por categoría y cuenta cuadran con la suma de legs", () => {
    const legs = [
      { account: "A", category: "Nómina", debit: "100.00" },
      { account: "A", category: "Nómina", debit: "50.50" },
      { account: "B", category: "Compras", debit: "20.00" },
    ];
    const byAccount = new Map<string, ReturnType<typeof money>>();
    const byCategory = new Map<string, ReturnType<typeof money>>();
    let grand = money(0);
    for (const leg of legs) {
      const d = money(leg.debit);
      grand = grand.plus(d);
      byAccount.set(leg.account, money(byAccount.get(leg.account) ?? 0).plus(d));
      byCategory.set(
        leg.category,
        money(byCategory.get(leg.category) ?? 0).plus(d),
      );
    }
    const sumAccounts = [...byAccount.values()].reduce(
      (acc, v) => acc.plus(v),
      money(0),
    );
    const sumCategories = [...byCategory.values()].reduce(
      (acc, v) => acc.plus(v),
      money(0),
    );
    expect(sumAccounts.toFixed(2)).toBe(grand.toFixed(2));
    expect(sumCategories.toFixed(2)).toBe(grand.toFixed(2));
    expect(byCategory.get("Nómina")?.toFixed(2)).toBe("150.50");
    expect(byCategory.get("Compras")?.toFixed(2)).toBe("20.00");
  });
});
