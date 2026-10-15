import { describe, expect, it } from "vitest";
import { parsePurchaseQtyInput } from "@/lib/purchases/qty";

describe("parsePurchaseQtyInput", () => {
  it("trata el punto como decimal (no como miles)", () => {
    expect(parsePurchaseQtyInput("4.625")).toBe(4.625);
    expect(parsePurchaseQtyInput("5.3")).toBe(5.3);
    expect(parsePurchaseQtyInput("10.5")).toBe(10.5);
  });

  it("trata la coma como decimal", () => {
    expect(parsePurchaseQtyInput("4,625")).toBe(4.625);
    expect(parsePurchaseQtyInput("5,3")).toBe(5.3);
  });

  it("acepta miles + decimal cuando hay ambos separadores", () => {
    expect(parsePurchaseQtyInput("1.234,5")).toBe(1234.5);
    expect(parsePurchaseQtyInput("1,234.5")).toBe(1234.5);
  });
});
