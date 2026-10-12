/**
 * Conversión volumen ↔ gramos para recetas de cocina.
 *
 * Densidad ρ en g/ml (agua de grifo por defecto ≈ 1.01):
 *   gramos = ml × ρ
 *   ml     = gramos / ρ
 *   gramos = litros × 1000 × ρ
 *   litros = gramos / (1000 × ρ)
 */

/** SKU canónico del agua de grifo (sin inventario). */
export const TAP_WATER_SKU = "AGUA-GRIFO";

/** ¿El producto mueve / exige stock? (default true si no viene el campo). */
export function productTracksInventory(
  tracksInventory: boolean | null | undefined,
): boolean {
  return tracksInventory !== false;
}

export type VolumeKind = "ml" | "l";

function normalizeUnitCode(unit: string): string {
  return unit
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

/** Detecta si la unidad de inventario es volumen (ML/L y variantes). */
export function isVolumeUnit(unit: string | null | undefined): boolean {
  return volumeKind(unit) != null;
}

export function volumeKind(unit: string | null | undefined): VolumeKind | null {
  if (!unit) return null;
  const code = normalizeUnitCode(unit);
  if (
    code === "ML" ||
    code === "MLS" ||
    code === "MLL" ||
    code === "MILILITRO" ||
    code === "MILILITROS" ||
    code === "CC" ||
    code === "CM3"
  ) {
    return "ml";
  }
  if (
    code === "L" ||
    code === "LT" ||
    code === "LTS" ||
    code === "LTR" ||
    code === "LITRO" ||
    code === "LITROS"
  ) {
    return "l";
  }
  return null;
}

export function inventoryUnitLabel(unit: string): string {
  const kind = volumeKind(unit);
  if (kind === "ml") return "ml";
  if (kind === "l") return "L";
  return unit;
}

/** gramos = qty_inventario × factor(ρ, unidad) */
export function gramsFromInventoryQty(
  inventoryQty: number,
  unit: string,
  densityGPerMl: number,
): number | null {
  if (!(inventoryQty > 0) || !(densityGPerMl > 0)) return null;
  const kind = volumeKind(unit);
  if (kind === "ml") return inventoryQty * densityGPerMl;
  if (kind === "l") return inventoryQty * 1000 * densityGPerMl;
  return null;
}

/** qty_inventario = gramos / factor(ρ, unidad) */
export function inventoryQtyFromGrams(
  grams: number,
  unit: string,
  densityGPerMl: number,
): number | null {
  if (!(grams > 0) || !(densityGPerMl > 0)) return null;
  const kind = volumeKind(unit);
  if (kind === "ml") return grams / densityGPerMl;
  if (kind === "l") return grams / (1000 * densityGPerMl);
  return null;
}

/** Redondeo estable para cantidades de receta/stock (3 decimales). */
export function roundQty(value: number, decimals = 3): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** Texto de listado: líquidos con densidad en gramos + ≈ inventario. */
export function formatRecipeComponentQty(
  inventoryQty: number,
  unit: string,
  densityGPerMl?: number | string | null,
): string {
  if (!isVolumeUnit(unit)) {
    return `${inventoryQty} ${unit}`;
  }
  const dens = Number(densityGPerMl);
  if (!(dens > 0)) {
    return `${inventoryQty} ${inventoryUnitLabel(unit)} (sin densidad)`;
  }
  const grams = gramsFromInventoryQty(inventoryQty, unit, dens);
  if (grams == null) {
    return `${inventoryQty} ${inventoryUnitLabel(unit)}`;
  }
  return `${roundQty(grams)} g (≈ ${roundQty(inventoryQty)} ${inventoryUnitLabel(unit)})`;
}
