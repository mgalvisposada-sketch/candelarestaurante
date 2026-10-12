import { describe, expect, it } from "vitest";
import {
  applyProductionEntryCost,
  aprovechamientoUnitCost,
  computeKitchenProductionCost,
  computeRecipeBatchCost,
  estimateRecipeCost,
  scaleRecipeLines,
} from "@/lib/kitchen/cost";

describe("computeKitchenProductionCost", () => {
  it("concentra el costo en el rendimiento útil (ejemplo cebolla)", () => {
    // 3000 g con costo total 5000 → unit cost entrada 5000/3000
    const r = computeKitchenProductionCost({
      inputs: [{ quantity: 3000, unitCost: 5000 / 3000 }],
      outputQty: 1500,
    });
    expect(r.inputTotalCost).toBeCloseTo(5000, 5);
    expect(r.mermaQty).toBeCloseTo(1500, 5);
    expect(r.outputUnitCost).toBeCloseTo(5000 / 1500, 5);
    expect(r.yieldPct).toBeCloseTo(50, 4);
    expect(r.mermaPct).toBeCloseTo(50, 4);
  });

  it("resta el costo asignado a aprovechamientos del principal", () => {
    const r = computeKitchenProductionCost({
      inputs: [{ quantity: 3000, unitCost: 5000 / 3000 }],
      outputQty: 1500,
      aprovechamientos: [{ quantity: 200, allocatedCost: 500 }],
    });
    expect(r.aprovechamientoTotalCost).toBe(500);
    expect(r.outputTotalCost).toBeCloseTo(4500, 5);
    expect(r.outputUnitCost).toBeCloseTo(3, 5);
    expect(r.mermaQty).toBeCloseTo(1300, 5);
  });

  it("respeta merma informada manualmente", () => {
    const r = computeKitchenProductionCost({
      inputs: [{ quantity: 5000, unitCost: 2 }],
      outputQty: 3000,
      mermaQty: 800,
      aprovechamientos: [{ quantity: 200, allocatedCost: 0 }],
    });
    expect(r.mermaQty).toBe(800);
    expect(r.inputTotalCost).toBe(10000);
    expect(r.outputUnitCost).toBeCloseTo(10000 / 3000, 5);
  });

  it("no permite que aprovechamientos superen el costo de entradas", () => {
    const r = computeKitchenProductionCost({
      inputs: [{ quantity: 100, unitCost: 10 }],
      outputQty: 50,
      aprovechamientos: [{ quantity: 10, allocatedCost: 9999 }],
    });
    expect(r.aprovechamientoTotalCost).toBe(1000);
    expect(r.outputTotalCost).toBe(0);
    expect(r.outputUnitCost).toBe(0);
  });
});

describe("aprovechamientoUnitCost", () => {
  it("divide costo asignado entre cantidad", () => {
    expect(aprovechamientoUnitCost(200, 500)).toBeCloseTo(2.5, 6);
  });
});

describe("applyProductionEntryCost", () => {
  it("promedia con stock previo del insumo", () => {
    // 1000 @ 3 + 1500 @ 3.333… 
    expect(applyProductionEntryCost(1000, 3, 1500, 5000 / 1500)).toBeCloseTo(
      (1000 * 3 + 5000) / 2500,
      5,
    );
  });
});

describe("estimateRecipeCost / scaleRecipeLines", () => {
  it("estima costo teórico de birria", () => {
    const r = estimateRecipeCost(
      [
        { quantity: 2000, unitCost: 20 }, // pecho
        { quantity: 1000, unitCost: 18 }, // costilla
        { quantity: 50, unitCost: 2 }, // sal
      ],
      5,
    );
    // (40000 + 18000 + 100) / 5
    expect(r.totalCost).toBeCloseTo(58100, 5);
    expect(r.unitCost).toBeCloseTo(11620, 5);
  });

  it("escala el doble de batches", () => {
    const scaled = scaleRecipeLines([{ quantity: 100 }, { quantity: 50 }], 2);
    expect(scaled[0].scaledQuantity).toBe(200);
    expect(scaled[1].scaledQuantity).toBe(100);
  });

  it("costea batches con merma de cocción (consumo fijo, rinde menos)", () => {
    // Ficha: 100@10 + 50@4 = 1200 por batch, rinde teórico 1000 g
    // 1 batch, salieron 800 g → merma 200; costo/u = 1200/800
    const batch = computeRecipeBatchCost({
      recipeLines: [
        { quantity: 100, unitCost: 10 },
        { quantity: 50, unitCost: 4 },
      ],
      recipeYieldQty: 1000,
      batches: 1,
      outputQty: 800,
    });
    expect(batch.scaleFactor).toBe(1);
    expect(batch.scaledLines[0].scaledQuantity).toBe(100);
    expect(batch.inputTotalCost).toBeCloseTo(1200, 5);
    expect(batch.theoreticalOutputQty).toBe(1000);
    expect(batch.mermaQty).toBe(200);
    expect(batch.yieldPct).toBeCloseTo(80, 4);
    expect(batch.outputUnitCost).toBeCloseTo(1200 / 800, 5);
  });

  it("dos batches consumen el doble aunque el output real varíe", () => {
    const batch = computeRecipeBatchCost({
      recipeLines: [{ quantity: 100, unitCost: 10 }],
      recipeYieldQty: 500,
      batches: 2,
      outputQty: 900,
    });
    expect(batch.scaledLines[0].scaledQuantity).toBe(200);
    expect(batch.inputTotalCost).toBeCloseTo(2000, 5);
    expect(batch.theoreticalOutputQty).toBe(1000);
    expect(batch.mermaQty).toBe(100);
    expect(batch.outputUnitCost).toBeCloseTo(2000 / 900, 5);
  });
});
