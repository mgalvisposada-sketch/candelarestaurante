import { describe, expect, it } from "vitest";
import {
  buildBulkProductExample,
  parseBulkNumber,
  parseBulkProductPaste,
} from "@/lib/inventory/bulk-paste";

describe("buildBulkProductExample", () => {
  it("usa códigos reales del maestro y no exige sku ni notas", () => {
    const { rows, pasteText } = buildBulkProductExample([
      { code: "ML", name: "Mililitro" },
      { code: "KGS", name: "Kilogramos" },
    ]);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]?.[1]).toBe("ML");
    expect(rows[1]?.[1]).toBe("KGS");
    expect(pasteText).toContain(";ML;");
    expect(pasteText).not.toContain(";Mililitro;");
    expect(pasteText).not.toContain("sku");
    expect(pasteText).not.toContain("notas");
  });
});

describe("parseBulkNumber", () => {
  it("acepta costos con $ y separador de miles", () => {
    expect(parseBulkNumber("$ 14")).toBe(14);
    expect(parseBulkNumber("$ 10,466")).toBe(10466);
    expect(parseBulkNumber("$ 8,250")).toBe(8250);
    expect(parseBulkNumber("5.3")).toBe(5.3);
  });
});

describe("parseBulkProductPaste opcionales", () => {
  it("acepta filas solo con las 4 columnas obligatorias", () => {
    const { rows, issues } = parseBulkProductPaste("Aceite;ML;10;8500");
    expect(issues).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sku).toBeNull();
    expect(rows[0]?.notes).toBeNull();
    expect(rows[0]?.currentStock).toBe(0);
  });

  it("acepta lista pegada desde Excel con costos en formato moneda", () => {
    const text = [
      "Aceite de Girasol (Mestre) x 5000cc\tML\t0\t$ 14\t0",
      "Carbón\tKGS\t0\t$ 8,250\t10",
      "Aceite Fritura\tLTS\t0\t$ 7,474\t5.3",
    ].join("\n");
    const { rows, issues } = parseBulkProductPaste(text);
    expect(issues).toHaveLength(0);
    expect(rows).toHaveLength(3);
    expect(rows[0]?.unitCost).toBe(14);
    expect(rows[1]?.unitCost).toBe(8250);
    expect(rows[2]?.currentStock).toBe(5.3);
  });
});

describe("parseBulkProductPaste", () => {
  it("parsea filas con tabulador y omite encabezado", () => {
    const text = [
      "nombre\tunidad\tstock_minimo\tcosto_unitario\tstock_actual\tsku\tnotas",
      "Aceite\tL\t10\t8500\t0\tACE\tCocina",
      "Sal\tKG\t5\t1200\t2\t\t",
    ].join("\n");

    const { rows, issues } = parseBulkProductPaste(text);
    expect(issues).toHaveLength(0);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.name).toBe("Aceite");
    expect(rows[0]?.unitCode).toBe("L");
    expect(rows[0]?.minStock).toBe(10);
    expect(rows[0]?.unitCost).toBe(8500);
    expect(rows[1]?.sku).toBeNull();
  });

  it("acepta punto y coma y stock_actual vacío = 0", () => {
    const { rows, issues } = parseBulkProductPaste("Vasos;UND;100;80");
    expect(issues).toHaveLength(0);
    expect(rows[0]?.currentStock).toBe(0);
    expect(rows[0]?.unitCode).toBe("UND");
  });

  it("reporta filas inválidas sin tumbar las válidas", () => {
    const text = ["Bueno\tML\t1\t10\t0", "SinUnidad\t\t1\t10", "Malo\tKG\tx\t10"].join(
      "\n",
    );
    const { rows, issues } = parseBulkProductPaste(text);
    expect(rows).toHaveLength(1);
    expect(issues).toHaveLength(2);
  });
});
