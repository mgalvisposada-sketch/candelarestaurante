/** Cargo o descuento adicional en factura de proveedor. */
export type InvoiceCharge = {
  concept: string;
  /** Monto siempre positivo; el signo lo da `kind`. */
  amount: number;
  kind: "cargo" | "descuento";
  /** Si true, se prorratea sobre el costo de los ítems recibidos. */
  affectsCost: boolean;
};

export type BillableLine = {
  itemId: string;
  productId: string;
  receivedQty: number;
  unitCost: number;
};

export type CostAllocation = {
  itemId: string;
  productId: string;
  receivedQty: number;
  baseLineAmount: number;
  /** Positivo = cargo al costo; negativo = descuento al costo. */
  allocatedExtra: number;
  landedUnitCost: number;
};

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function signedChargeAmount(charge: InvoiceCharge): number {
  const amount = Math.max(0, charge.amount);
  return charge.kind === "descuento" ? -amount : amount;
}

/**
 * Prorratea cargos/descuentos que afectan costo según el valor de cada línea
 * (qty × costo). Descuentos restan; cargos suman.
 */
export function allocateInvoiceCharges(
  lines: BillableLine[],
  charges: InvoiceCharge[],
): CostAllocation[] {
  const costCharges = charges.filter(
    (c) => c.affectsCost && c.amount > 0,
  );
  const totalExtra = roundMoney(
    costCharges.reduce((acc, c) => acc + signedChargeAmount(c), 0),
  );

  const bases = lines.map((line) => ({
    ...line,
    baseLineAmount: roundMoney(line.receivedQty * line.unitCost),
  }));
  const totalBase = roundMoney(
    bases.reduce((acc, l) => acc + l.baseLineAmount, 0),
  );

  if (totalExtra === 0 || bases.length === 0) {
    return bases.map((line) => ({
      itemId: line.itemId,
      productId: line.productId,
      receivedQty: line.receivedQty,
      baseLineAmount: line.baseLineAmount,
      allocatedExtra: 0,
      landedUnitCost: line.unitCost,
    }));
  }

  // Si no hay base (costos en 0), reparte por cantidad recibida.
  const weightTotal =
    totalBase > 0
      ? totalBase
      : bases.reduce((acc, l) => acc + Math.max(l.receivedQty, 0), 0);

  let allocatedSum = 0;
  const drafts = bases.map((line, index) => {
    const weight =
      totalBase > 0 ? line.baseLineAmount : Math.max(line.receivedQty, 0);
    const isLast = index === bases.length - 1;
    let allocatedExtra = 0;
    if (weightTotal > 0) {
      allocatedExtra = isLast
        ? roundMoney(totalExtra - allocatedSum)
        : roundMoney((totalExtra * weight) / weightTotal);
      allocatedSum = roundMoney(allocatedSum + allocatedExtra);
    }
    // Un descuento no puede dejar la línea bajo 0.
    if (allocatedExtra < 0 && line.baseLineAmount + allocatedExtra < 0) {
      allocatedExtra = roundMoney(-line.baseLineAmount);
    }
    const landedTotal = Math.max(
      0,
      roundMoney(line.baseLineAmount + allocatedExtra),
    );
    const landedUnitCost =
      line.receivedQty > 0 ? landedTotal / line.receivedQty : line.unitCost;
    return {
      itemId: line.itemId,
      productId: line.productId,
      receivedQty: line.receivedQty,
      baseLineAmount: line.baseLineAmount,
      allocatedExtra,
      landedUnitCost,
    };
  });

  return drafts;
}

export function merchandiseSubtotal(lines: BillableLine[]): number {
  return roundMoney(
    lines.reduce((acc, l) => acc + l.receivedQty * l.unitCost, 0),
  );
}

/** Suma neta de cargos (+) y descuentos (−). */
export function chargesTotal(charges: InvoiceCharge[]): number {
  return roundMoney(
    charges.reduce((acc, c) => acc + signedChargeAmount(c), 0),
  );
}

export function cargosTotal(charges: InvoiceCharge[]): number {
  return roundMoney(
    charges
      .filter((c) => c.kind === "cargo")
      .reduce((acc, c) => acc + Math.max(0, c.amount), 0),
  );
}

export function descuentosTotal(charges: InvoiceCharge[]): number {
  return roundMoney(
    charges
      .filter((c) => c.kind === "descuento")
      .reduce((acc, c) => acc + Math.max(0, c.amount), 0),
  );
}
