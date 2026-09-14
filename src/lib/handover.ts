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

export type HandoverBreakdownLine = {
  id: string;
  name: string;
  amount: number | null;
  note?: string;
};

export type HandoverItemMetadata = {
  lines: HandoverBreakdownLine[];
};

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

function parseLineAmount(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : null;
  }
  const n = Number(String(raw).replace(/,/g, "").trim());
  if (!Number.isFinite(n) || Number.isNaN(n)) return null;
  return n;
}

/** Normaliza metadata.lines desde JSON crudo o FormData. */
export function parseHandoverBreakdownLines(
  raw: unknown,
): HandoverBreakdownLine[] {
  if (raw == null) return [];

  let value = raw;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      value = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(value)) return [];

  const lines: HandoverBreakdownLine[] = [];
  for (const entry of value.slice(0, 50)) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const name = String(row.name ?? "").trim();
    if (!name) continue;
    const id =
      String(row.id ?? "").trim() ||
      `line_${lines.length + 1}_${Math.random().toString(36).slice(2, 9)}`;
    const noteRaw = row.note != null ? String(row.note).trim() : "";
    lines.push({
      id,
      name,
      amount: parseLineAmount(row.amount),
      ...(noteRaw ? { note: noteRaw } : {}),
    });
  }
  return lines;
}

export function sumHandoverBreakdownLines(
  lines: HandoverBreakdownLine[],
): number | null {
  const withAmount = lines.filter((l) => l.amount != null);
  if (withAmount.length === 0) return null;
  const total = withAmount.reduce((acc, l) => acc + (l.amount as number), 0);
  return Math.round(total * 100) / 100;
}

export function buildHandoverItemMetadata(
  lines: HandoverBreakdownLine[],
): HandoverItemMetadata {
  return { lines };
}

export function readHandoverItemMetadata(
  metadata: unknown,
): HandoverItemMetadata {
  if (!metadata || typeof metadata !== "object") {
    return { lines: [] };
  }
  const record = metadata as Record<string, unknown>;
  return { lines: parseHandoverBreakdownLines(record.lines) };
}

/** Placeholder del campo nombre según dominio del punto. */
export function breakdownNamePlaceholder(domain: string): string {
  switch (domain) {
    case "tesoreria":
      return "Banco / cuenta / caja";
    case "cxc":
      return "Nombre del tercero";
    case "cxp":
      return "Proveedor / acreedor";
    case "prestamos":
      return "Acreedor / socio";
    case "socios":
      return "Socio";
    case "contratos":
      return "Contrato / contraparte";
    case "documentos":
      return "Documento";
    case "inventario":
      return "Categoría / ítem";
    default:
      return "Nombre / concepto";
  }
}
