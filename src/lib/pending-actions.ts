import { createClient } from "@/lib/supabase/server";
import { ctxCanAccess } from "@/lib/permissions";
import type { OrgContext } from "@/lib/org-context";
import { formatCOP } from "@/lib/money";
import { formatDateCO } from "@/lib/dates";

export type PendingActionKind =
  | "compra_autorizar"
  | "novedad_aprobar"
  | "pago_aprobar"
  | "pago_ejecutar"
  | "inventario_revisar"
  | "caja_avalar";

export type PendingAction = {
  id: string;
  kind: PendingActionKind;
  title: string;
  body: string;
  href: string;
  createdAt: string;
  urgent?: boolean;
};

export type PendingActionCounts = {
  total: number;
  compras: number;
  personal: number;
  pagos: number;
  inventario: number;
  caja: number;
};

export type PendingActionsResult = {
  items: PendingAction[];
  counts: PendingActionCounts;
};

const NOVELTY_TYPE_LABELS: Record<string, string> = {
  LLEGADA_TARDE: "Llegada tarde",
  SALIDA_TEMPRANA: "Salida temprana",
  PERMISO_REMUNERADO: "Permiso remunerado",
  PERMISO_NO_REMUNERADO: "Permiso no remunerado",
  AUSENCIA: "Ausencia / falta",
  HORA_EXTRA: "Hora extra",
  TURNO_LABORADO: "Turno / día laborado",
  ANTICIPO: "Anticipo",
  DESCUENTO_AUTORIZADO: "Descuento autorizado",
  BONO_OCASIONAL: "Bono ocasional",
};

const KIND_ORDER: Record<PendingActionKind, number> = {
  compra_autorizar: 0,
  novedad_aprobar: 1,
  caja_avalar: 2,
  pago_aprobar: 3,
  pago_ejecutar: 4,
  inventario_revisar: 5,
};

/**
 * Acciones pendientes derivadas del estado real de cada flujo.
 * Desaparecen solas cuando se gestionan (autorizar/aprobar/pagar/rechazar).
 */
export async function fetchPendingActions(
  ctx: Pick<OrgContext, "role" | "permissions" | "organization">,
): Promise<PendingActionsResult> {
  const empty: PendingActionsResult = {
    items: [],
    counts: {
      total: 0,
      compras: 0,
      personal: 0,
      pagos: 0,
      inventario: 0,
      caja: 0,
    },
  };

  if (!ctx.organization?.id) return empty;

  const orgId = ctx.organization.id;
  const canApprovePurchase = ctxCanAccess(ctx, "compras.solicitudes.aprobar");
  const canApproveNovelty = ctxCanAccess(ctx, "personal.novedades.aprobar");
  const canApprovePayment = ctxCanAccess(ctx, "solicitudes-pago.aprobar");
  const canPay = ctxCanAccess(ctx, "solicitudes-pago.pagar");
  const canReviewInventory = ctxCanAccess(ctx, "inventario.fisico.ajustar");
  const canAvalarCaja = ctxCanAccess(ctx, "tesoreria.caja.avalar");

  if (
    !canApprovePurchase &&
    !canApproveNovelty &&
    !canApprovePayment &&
    !canPay &&
    !canReviewInventory &&
    !canAvalarCaja
  ) {
    return empty;
  }

  const supabase = await createClient();
  const items: PendingAction[] = [];

  const [
    purchasesRes,
    noveltiesRes,
    paymentsReviewRes,
    paymentsPayRes,
    inventoryRes,
    cashClosesRes,
  ] = await Promise.all([
      canApprovePurchase
        ? supabase
            .from("purchase_requests")
            .select("id, title, status, requested_at, is_urgent, location_label")
            .eq("organization_id", orgId)
            .eq("status", "ENVIADA")
            .is("deleted_at", null)
            .order("requested_at", { ascending: true })
            .limit(50)
        : Promise.resolve({ data: null as null }),
      canApproveNovelty
        ? supabase
            .from("shift_novelties")
            .select(
              "id, novelty_type, novelty_date, status, created_at, employee_id",
            )
            .eq("organization_id", orgId)
            .eq("status", "PENDIENTE")
            .is("deleted_at", null)
            .order("created_at", { ascending: true })
            .limit(50)
        : Promise.resolve({ data: null as null }),
      canApprovePayment
        ? supabase
            .from("payment_requests")
            .select(
              "id, concept, amount, status, priority, requested_at, document_number",
            )
            .eq("organization_id", orgId)
            .in("status", ["EN_REVISION", "BORRADOR"])
            .is("deleted_at", null)
            .order("requested_at", { ascending: true })
            .limit(50)
        : Promise.resolve({ data: null as null }),
      canPay
        ? supabase
            .from("payment_requests")
            .select(
              "id, concept, amount, status, priority, requested_at, document_number",
            )
            .eq("organization_id", orgId)
            .in("status", ["EN_COLA_PAGO", "APROBADA"])
            .is("deleted_at", null)
            .order("requested_at", { ascending: true })
            .limit(50)
        : Promise.resolve({ data: null as null }),
      canReviewInventory
        ? supabase
            .from("physical_inventory_counts")
            .select("id, title, status, location_label, submitted_at, counted_at")
            .eq("organization_id", orgId)
            .eq("status", "ENVIADO")
            .is("deleted_at", null)
            .order("submitted_at", { ascending: true })
            .limit(50)
        : Promise.resolve({ data: null as null }),
      canAvalarCaja
        ? supabase
            .from("cash_daily_closes")
            .select(
              "id, business_date, cash_sales, card_sales, transfer_sales, status, submitted_at, created_at",
            )
            .eq("organization_id", orgId)
            .eq("status", "EN_REVISION")
            .is("deleted_at", null)
            .order("business_date", { ascending: true })
            .limit(50)
        : Promise.resolve({ data: null as null }),
    ]);

  const noveltyEmployeeIds = [
    ...new Set(
      (noveltiesRes.data ?? []).map((r) => r.employee_id as string).filter(Boolean),
    ),
  ];
  const employeeNameById = new Map<string, string>();
  if (noveltyEmployeeIds.length > 0) {
    const { data: empRows } = await supabase
      .from("employees")
      .select("id, full_name")
      .eq("organization_id", orgId)
      .in("id", noveltyEmployeeIds);
    for (const e of empRows ?? []) {
      employeeNameById.set(e.id as string, e.full_name as string);
    }
  }

  for (const row of purchasesRes.data ?? []) {
    const where = row.location_label
      ? ` · ${row.location_label}`
      : "";
    items.push({
      id: `compra:${row.id}`,
      kind: "compra_autorizar",
      title: "Autorizar compra",
      body: `${row.title || "Solicitud"}${where}`,
      href: `/compras/solicitudes/${row.id}`,
      createdAt: row.requested_at as string,
      urgent: Boolean(row.is_urgent),
    });
  }

  for (const row of noveltiesRes.data ?? []) {
    const empName =
      employeeNameById.get(row.employee_id as string) ?? "Empleado";
    const typeLabel =
      NOVELTY_TYPE_LABELS[row.novelty_type as string] ?? row.novelty_type;
    items.push({
      id: `novedad:${row.id}`,
      kind: "novedad_aprobar",
      title: "Aprobar novedad",
      body: `${empName} · ${typeLabel} · ${formatDateCO(row.novelty_date as string)}`,
      href: "/personal/novedades",
      createdAt: (row.created_at as string) ?? (row.novelty_date as string),
    });
  }

  for (const row of paymentsReviewRes.data ?? []) {
    const doc = row.document_number ? ` · Doc ${row.document_number}` : "";
    items.push({
      id: `pago-aprobar:${row.id}`,
      kind: "pago_aprobar",
      title: "Aprobar solicitud de pago",
      body: `${row.concept || "Pago"}${doc} · ${formatCOP(row.amount)}`,
      href: "/solicitudes-pago",
      createdAt: row.requested_at as string,
      urgent: row.priority === "CRITICA" || row.priority === "ALTA",
    });
  }

  for (const row of paymentsPayRes.data ?? []) {
    const doc = row.document_number ? ` · Doc ${row.document_number}` : "";
    items.push({
      id: `pago-ejecutar:${row.id}`,
      kind: "pago_ejecutar",
      title: "Ejecutar pago",
      body: `${row.concept || "Pago"}${doc} · ${formatCOP(row.amount)}`,
      href: "/solicitudes-pago",
      createdAt: row.requested_at as string,
      urgent: row.priority === "CRITICA" || row.priority === "ALTA",
    });
  }

  for (const row of inventoryRes.data ?? []) {
    const where = row.location_label ? ` · ${row.location_label}` : "";
    items.push({
      id: `inventario:${row.id}`,
      kind: "inventario_revisar",
      title: "Revisar inventario físico",
      body: `${row.title || "Conteo"}${where}`,
      href: `/inventario/revision/${row.id}`,
      createdAt:
        (row.submitted_at as string | null) ?? (row.counted_at as string),
    });
  }

  for (const row of cashClosesRes.data ?? []) {
    const cash = formatCOP(row.cash_sales);
    const card = formatCOP(row.card_sales);
    const transfer = formatCOP(row.transfer_sales ?? 0);
    items.push({
      id: `caja:${row.id}`,
      kind: "caja_avalar",
      title: "Avalar cierre de caja",
      body: `${formatDateCO(row.business_date as string)} · Efectivo ${cash} · Adquirencia ${card} · QR ${transfer}`,
      href: "/tesoreria#caja",
      createdAt:
        (row.submitted_at as string | null) ??
        (row.created_at as string) ??
        (row.business_date as string),
    });
  }

  items.sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    const kindDiff = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    if (kindDiff !== 0) return kindDiff;
    return a.createdAt.localeCompare(b.createdAt);
  });

  const counts: PendingActionCounts = {
    total: items.length,
    compras: items.filter((i) => i.kind === "compra_autorizar").length,
    personal: items.filter((i) => i.kind === "novedad_aprobar").length,
    pagos: items.filter(
      (i) => i.kind === "pago_aprobar" || i.kind === "pago_ejecutar",
    ).length,
    inventario: items.filter((i) => i.kind === "inventario_revisar").length,
    caja: items.filter((i) => i.kind === "caja_avalar").length,
  };

  return { items, counts };
}
