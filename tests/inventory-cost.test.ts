import { describe, expect, it } from "vitest";
import {
  suggestedPurchaseQty,
  weightedAverageUnitCost,
} from "@/lib/inventory/cost";

describe("weightedAverageUnitCost", () => {
  it("usa costo de compra si no hay stock", () => {
    expect(weightedAverageUnitCost(0, 5, 2000, 6)).toBe(6);
  });

  it("promedia stock previo y compra nueva", () => {
    // 200 ml @ 5 + 2000 ml @ 6 = 13000 / 2200
    expect(weightedAverageUnitCost(200, 5, 2000, 6)).toBeCloseTo(13000 / 2200, 6);
  });

  it("no cambia si la entrada es 0", () => {
    expect(weightedAverageUnitCost(100, 5, 0, 9)).toBe(5);
  });
});

describe("suggestedPurchaseQty", () => {
  it("recomienda faltante hasta el mínimo", () => {
    expect(suggestedPurchaseQty(3, 10)).toBe(7);
  });

  it("no recomienda si está sobre el mínimo", () => {
    expect(suggestedPurchaseQty(12, 10)).toBe(0);
  });
});
