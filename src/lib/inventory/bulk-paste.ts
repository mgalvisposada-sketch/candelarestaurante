/**
 * Formato de carga masiva (una fila por producto).
 * Separadores: tabulador (Excel), punto y coma o coma.
 *
 * Columnas (orden fijo):
 * 1 nombre* | 2 unidad* (código maestro) | 3 stock_minimo* | 4 costo_unitario*
 * 5 stock_actual | 6 sku | 7 notas
 */
export const BULK_PRODUCT_COLUMNS = [
  "nombre",
  "unidad",
  "stock_minimo",
  "costo_unitario",
  "stock_actual",
  "sku",
  "notas",
] as const;

/** Solo columnas obligatorias (sku y notas se pueden omitir al pegar). */
export const BULK_PRODUCT_HEADER_REQUIRED = [
  "nombre",
  "unidad",
  "stock_minimo",
  "costo_unitario",
].join(";");

/** Encabezado completo (incluye opcionales). */
export const BULK_PRODUCT_HEADER = BULK_PRODUCT_COLUMNS.join(";");

export const BULK_PRODUCT_COLUMN_META: {
  key: (typeof BULK_PRODUCT_COLUMNS)[number];
  label: string;
  required: boolean;
  hint: string;
}[] = [
  { key: "nombre", label: "Nombre", required: true, hint: "Nombre del producto" },
  {
    key: "unidad",
    label: "Unidad",
    required: true,
    hint: "Use el CÓDIGO del maestro, no el nombre",
  },
  {
    key: "stock_minimo",
    label: "Stock mín.",
    required: true,
    hint: "Número ≥ 0",
  },
  {
    key: "costo_unitario",
    label: "Costo / u",
    required: true,
    hint: "Acepta $ y miles (ej. $ 10,466)",
  },
  {
    key: "stock_actual",
    label: "Stock actual",
    required: false,
    hint: "Opcional · 0 si vacío",
  },
  { key: "sku", label: "SKU", required: false, hint: "Opcional · se puede omitir" },
  {
    key: "notas",
    label: "Notas",
    required: false,
    hint: "Opcional · se puede omitir",
  },
];

type ExampleUnit = { code: string; name: string };

const EXAMPLE_PRODUCT_TEMPLATES: {
  name: string;
  minStock: string;
  unitCost: string;
  currentStock: string;
}[] = [
  {
    name: "Aceite vegetal",
    minStock: "10",
    unitCost: "8500",
    currentStock: "0",
  },
  {
    name: "Sal refinada",
    minStock: "5",
    unitCost: "1200",
    currentStock: "2",
  },
  {
    name: "Vasos 9oz",
    minStock: "100",
    unitCost: "80",
    currentStock: "50",
  },
];

/** Arma filas de ejemplo usando códigos reales del maestro (sin sku ni notas). */
export function buildBulkProductExample(units: ExampleUnit[]): {
  rows: string[][];
  pasteText: string;
} {
  const available = units.filter((u) => u.code?.trim());
  if (available.length === 0) {
    return { rows: [], pasteText: BULK_PRODUCT_HEADER_REQUIRED };
  }

  const rows = EXAMPLE_PRODUCT_TEMPLATES.map((tpl, idx) => {
    const unit = available[idx % available.length]!;
    return [tpl.name, unit.code, tpl.minStock, tpl.unitCost];
  });

  const withStock = available[0]
    ? ["Producto con stock", available[0].code, "20", "500", "8"]
    : null;

  const displayRows = withStock ? [...rows.slice(0, 2), withStock] : rows;

  return {
    rows: displayRows,
    pasteText: [
      BULK_PRODUCT_HEADER_REQUIRED,
      ...rows.map((r) => r.join(";")),
    ].join("\n"),
  };
}

export type BulkProductRow = {
  line: number;
  name: string;
  unitCode: string;
  minStock: number;
  unitCost: number;
  currentStock: number;
  sku: string | null;
  notes: string | null;
};

export type BulkParseIssue = {
  line: number;
  message: string;
};

function detectDelimiter(sample: string): string {
  if (sample.includes("\t")) return "\t";
  if (sample.includes(";")) return ";";
  return ",";
}

function splitLine(line: string, delimiter: string): string[] {
  return line.split(delimiter).map((c) => c.trim());
}

function isHeaderRow(cells: string[]): boolean {
  const first = (cells[0] ?? "").toLowerCase().replace(/\s+/g, "_");
  return first === "nombre" || first === "name";
}

/** Acepta 8500, $ 8.500, $ 10,466, 5.3, 5,3 */
export function parseBulkNumber(
  raw: string | undefined,
  fallback?: number,
): number | null {
  if (raw === undefined || String(raw).trim() === "") {
    return fallback === undefined ? null : fallback;
  }

  let s = String(raw)
    .trim()
    .replace(/[$€£]/gi, "")
    .replace(/\b(COP|USD|EUR)\b/gi, "")
    .replace(/\s/g, "");

  if (!s) return fallback === undefined ? null : fallback;

  // 1.234,56 (miles con punto, decimal con coma)
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  // 1,234.56 o 10,466 (miles con coma)
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    s = s.replace(/,/g, "");
  }
  // 5,3 (decimal con coma)
  else if (/^\d+,\d+$/.test(s)) {
    s = s.replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }

  const n = Number(s);
  if (Number.isNaN(n)) return null;
  return n;
}

export function parseBulkProductPaste(text: string): {
  rows: BulkProductRow[];
  issues: BulkParseIssue[];
} {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    return { rows: [], issues: [{ line: 0, message: "Pegue al menos una fila" }] };
  }

  const delimiter = detectDelimiter(lines[0] ?? "");
  const rows: BulkProductRow[] = [];
  const issues: BulkParseIssue[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const cells = splitLine(lines[i]!, delimiter);
    if (i === 0 && isHeaderRow(cells)) continue;

    const name = (cells[0] ?? "").trim();
    const unitCode = (cells[1] ?? "").trim().toUpperCase();
    const minRaw = cells[2];
    const costRaw = cells[3];
    const stockRaw = cells[4];
    const sku = (cells[5] ?? "").trim();
    const notes = (cells[6] ?? "").trim();

    if (!name) {
      issues.push({ line: lineNo, message: "Falta el nombre" });
      continue;
    }
    if (!unitCode) {
      issues.push({
        line: lineNo,
        message: `«${name}»: falta la unidad (código maestro)`,
      });
      continue;
    }

    const minStock = parseBulkNumber(minRaw);
    if (minStock === null || minStock < 0) {
      issues.push({
        line: lineNo,
        message: `«${name}»: stock_minimo inválido`,
      });
      continue;
    }

    const unitCost = parseBulkNumber(costRaw);
    if (unitCost === null || unitCost < 0) {
      issues.push({
        line: lineNo,
        message: `«${name}»: costo_unitario inválido`,
      });
      continue;
    }

    const currentStock = parseBulkNumber(stockRaw, 0);
    if (currentStock === null || currentStock < 0) {
      issues.push({
        line: lineNo,
        message: `«${name}»: stock_actual inválido`,
      });
      continue;
    }

    rows.push({
      line: lineNo,
      name,
      unitCode,
      minStock,
      unitCost,
      currentStock,
      sku: sku || null,
      notes: notes || null,
    });
  }

  return { rows, issues };
}
