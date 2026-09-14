export type VerificationStatus = "CONFIRMADO" | "DECLARADO" | "PENDIENTE";

export interface HandoverQualityInput {
  status: VerificationStatus;
}

export interface HandoverQualitySummary {
  total: number;
  confirmed: number;
  declared: number;
  pending: number;
  pctConfirmed: number;
  pctDeclared: number;
  pctPending: number;
  pendingItems: number;
}

/**
 * Calcula % de calidad del empalme.
 * El cierre NUNCA se bloquea por pendientes; solo se reportan métricas.
 */
export function summarizeHandoverQuality(
  items: HandoverQualityInput[],
): HandoverQualitySummary {
  const total = items.length;
  if (total === 0) {
    return {
      total: 0,
      confirmed: 0,
      declared: 0,
      pending: 0,
      pctConfirmed: 0,
      pctDeclared: 0,
      pctPending: 0,
      pendingItems: 0,
    };
  }

  const confirmed = items.filter((i) => i.status === "CONFIRMADO").length;
  const declared = items.filter((i) => i.status === "DECLARADO").length;
  const pending = items.filter((i) => i.status === "PENDIENTE").length;

  const round4 = (n: number) => Math.round((n / total) * 10000) / 100;

  return {
    total,
    confirmed,
    declared,
    pending,
    pctConfirmed: round4(confirmed),
    pctDeclared: round4(declared),
    pctPending: round4(pending),
    pendingItems: pending,
  };
}

export function canCloseHandover(): boolean {
  // Regla de producto: siempre se puede cerrar, aunque haya pendientes.
  return true;
}

export function participationWarning(totalPct: number): string | null {
  const rounded = Math.round(totalPct * 10000) / 10000;
  if (rounded === 100) return null;
  return `La participación total suma ${rounded}% (debe advertirse si no es 100%).`;
}
