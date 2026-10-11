import { money } from "@/lib/money";
import { weightedAverageUnitCost } from "@/lib/inventory/cost";

export type KitchenInputLine = {
  quantity: number;
  unitCost: number;
};

export type KitchenAprovechamientoLine = {
  quantity: number;
  /** Costo total asignado a este aprovechamiento (no unitario). */
  allocatedCost: number;
};

export type KitchenProductionCostResult = {
  inputTotalQty: number;
  inputTotalCost: number;
  aprovechamientoTotalCost: number;
  outputTotalCost: number;
  outputUnitCost: number;
  mermaQty: number;
  yieldPct: number | null;
  mermaPct: number | null;
};

/**
 * Costeo de una producción de insumo/preparación.
 *
 * - Todo el costo de entradas se concentra en el rendimiento útil (principal),
 *   excepto lo que se asigne explícitamente a aprovechamientos.
 * - Merma = qty entradas − qty principal − qty aprovechamientos (si se informa).
 * - Costo unitario principal = (costo entradas − costo aprovechamientos) / qty principal.
 *
 * Ejemplo: 3000 g a $5000 → 1500 g útiles → $3.333…/g; merma 1500 g.
 */
export function computeKitchenProductionCost(args: {
  inputs: KitchenInputLine[];
  outputQty: number;
  aprovechamientos?: KitchenAprovechamientoLine[];
  /** Si se omite, se calcula como input − output − aprovechamientos (mín. 0). */
  mermaQty?: number;
}): KitchenProductionCostResult {
  const inputs = args.inputs ?? [];
  const aprovechamientos = args.aprovechamientos ?? [];
  const outputQty = Math.max(0, Number(args.outputQty) || 0);

  let inputTotalQty = money(0);
  let inputTotalCost = money(0);
  for (const line of inputs) {
    const qty = money(Math.max(0, Number(line.quantity) || 0));
    const unit = money(Math.max(0, Number(line.unitCost) || 0));
    inputTotalQty = inputTotalQty.plus(qty);
    inputTotalCost = inputTotalCost.plus(qty.times(unit));
  }

  let aprovechamientoQty = money(0);
  let aprovechamientoTotalCost = money(0);
  for (const line of aprovechamientos) {
    const qty = money(Math.max(0, Number(line.quantity) || 0));
    const allocated = money(Math.max(0, Number(line.allocatedCost) || 0));
    aprovechamientoQty = aprovechamientoQty.plus(qty);
    aprovechamientoTotalCost = aprovechamientoTotalCost.plus(allocated);
  }

  if (aprovechamientoTotalCost.greaterThan(inputTotalCost)) {
    aprovechamientoTotalCost = inputTotalCost;
  }

  const outputTotalCost = DecimalMax(
    inputTotalCost.minus(aprovechamientoTotalCost),
    money(0),
  );

  const outputUnitCost =
    outputQty > 0
      ? outputTotalCost.div(outputQty).toDecimalPlaces(6)
      : money(0);

  let mermaQty: number;
  if (args.mermaQty !== undefined && args.mermaQty !== null) {
    mermaQty = Math.max(0, Number(args.mermaQty) || 0);
  } else {
    mermaQty = DecimalMax(
      inputTotalQty.minus(outputQty).minus(aprovechamientoQty),
      money(0),
    ).toDecimalPlaces(3).toNumber();
  }

  const inputQtyNum = inputTotalQty.toNumber();
  const yieldPct =
    inputQtyNum > 0
      ? money(outputQty).div(inputQtyNum).times(100).toDecimalPlaces(4).toNumber()
      : null;
  const mermaPct =
    inputQtyNum > 0
      ? money(mermaQty).div(inputQtyNum).times(100).toDecimalPlaces(4).toNumber()
      : null;

  return {
    inputTotalQty: inputTotalQty.toDecimalPlaces(3).toNumber(),
    inputTotalCost: inputTotalCost.toDecimalPlaces(6).toNumber(),
    aprovechamientoTotalCost: aprovechamientoTotalCost.toDecimalPlaces(6).toNumber(),
    outputTotalCost: outputTotalCost.toDecimalPlaces(6).toNumber(),
    outputUnitCost: outputUnitCost.toNumber(),
    mermaQty,
    yieldPct,
    mermaPct,
  };
}

function DecimalMax(a: ReturnType<typeof money>, b: ReturnType<typeof money>) {
  return a.greaterThan(b) ? a : b;
}

/** Costo unitario de un aprovechamiento a partir de su costo asignado. */
export function aprovechamientoUnitCost(
  quantity: number,
  allocatedCost: number,
): number {
  const qty = Number(quantity) || 0;
  if (qty <= 0) return 0;
  return money(Math.max(0, Number(allocatedCost) || 0))
    .div(qty)
    .toDecimalPlaces(6)
    .toNumber();
}

/** Nuevo costo promedio al ingresar producción al stock del producto destino. */
export function applyProductionEntryCost(
  currentStock: number,
  currentUnitCost: number,
  incomingQty: number,
  incomingUnitCost: number,
): number {
  return weightedAverageUnitCost(
    currentStock,
    currentUnitCost,
    incomingQty,
    incomingUnitCost,
  );
}

export const KITCHEN_ITEM_KIND_LABELS = {
  MATERIA_PRIMA: "Materia prima",
  INSUMO_PREPARACION: "Insumo preparación",
  PREPARACION: "Preparación",
  PRODUCTO_CARTA: "Producto de carta",
} as const;

export type KitchenItemKind = keyof typeof KITCHEN_ITEM_KIND_LABELS;

export type RecipeLineCostInput = {
  quantity: number;
  unitCost: number;
};

/**
 * Escala líneas de receta según el rendimiento real vs el de la ficha.
 * Ej: ficha rinde 5 kg; produce 10 kg → factor 2.
 */
export function scaleRecipeLines<T extends { quantity: number }>(
  lines: T[],
  recipeYieldQty: number,
  outputQty: number,
): Array<T & { scaledQuantity: number }> {
  const yieldQty = Number(recipeYieldQty) || 0;
  const out = Number(outputQty) || 0;
  const factor = yieldQty > 0 ? out / yieldQty : 0;
  return lines.map((line) => ({
    ...line,
    scaledQuantity: money(Math.max(0, Number(line.quantity) || 0))
      .times(factor)
      .toDecimalPlaces(3)
      .toNumber(),
  }));
}

/** Costo teórico de una receta (batch y unitario). */
export function estimateRecipeCost(
  lines: RecipeLineCostInput[],
  yieldQty: number,
): { totalCost: number; unitCost: number } {
  let total = money(0);
  for (const line of lines) {
    total = total.plus(
      money(Math.max(0, Number(line.quantity) || 0)).times(
        Math.max(0, Number(line.unitCost) || 0),
      ),
    );
  }
  const yieldAmount = Number(yieldQty) || 0;
  const unitCost =
    yieldAmount > 0
      ? total.div(yieldAmount).toDecimalPlaces(6).toNumber()
      : 0;
  return {
    totalCost: total.toDecimalPlaces(6).toNumber(),
    unitCost,
  };
}

/**
 * Costo de producir un batch: escala la receta al output y concentra el costo.
 * Merma de cocina opcional (evaporación, etc.) no cambia el costo total,
 * solo el unitario si output < rendimiento teórico escalado.
 */
export function computeRecipeBatchCost(args: {
  recipeLines: RecipeLineCostInput[];
  recipeYieldQty: number;
  outputQty: number;
}): {
  scaleFactor: number;
  scaledLines: Array<RecipeLineCostInput & { scaledQuantity: number }>;
  inputTotalCost: number;
  outputUnitCost: number;
} {
  const recipeYield = Math.max(0, Number(args.recipeYieldQty) || 0);
  const outputQty = Math.max(0, Number(args.outputQty) || 0);
  const scaleFactor = recipeYield > 0 ? outputQty / recipeYield : 0;
  const scaledLines = scaleRecipeLines(
    args.recipeLines,
    recipeYield,
    outputQty,
  );
  let inputTotalCost = money(0);
  for (const line of scaledLines) {
    inputTotalCost = inputTotalCost.plus(
      money(line.scaledQuantity).times(Math.max(0, Number(line.unitCost) || 0)),
    );
  }
  const outputUnitCost =
    outputQty > 0
      ? inputTotalCost.div(outputQty).toDecimalPlaces(6).toNumber()
      : 0;
  return {
    scaleFactor,
    scaledLines,
    inputTotalCost: inputTotalCost.toDecimalPlaces(6).toNumber(),
    outputUnitCost,
  };
}
