import { createClient } from "@/lib/supabase/server";
import { ctxCanAccess } from "@/lib/permissions";
import type { OrgContext } from "@/lib/org-context";
import { formatCOP } from "@/lib/money";
import { formatDateCO } from "@/lib/dates";

export type PendingActionKind =
  | "compra_autorizar"
  | "novedad_aprobar"
  | "pago_aprobar"
  | "pago_ejecutar";

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
  pago_aprobar: 2,
  pago_ejecutar: 3,
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
    counts: { total: 0, compras: 0, personal: 0, pagos: 0 },
  };

  if (!ctx.organization?.id) return empty;

  const orgId = ctx.organization.id;
  const canApprovePurchase = ctxCanAccess(ctx, "compras.solicitudes.aprobar");
  const canApproveNovelty = ctxCanAccess(ctx, "personal.novedades.aprobar");
  const canApprovePayment = ctxCanAccess(ctx, "solicitudes-pago.aprobar");
  const canPay = ctxCanAccess(ctx, "solicitudes-pago.pagar");

  if (!canApprovePurchase && !canApproveNovelty && !canApprovePayment && !canPay) {
    return empty;
  }

  const supabase = await createClient();
  const items: PendingAction[] = [];

  const [purchasesRes, noveltiesRes, paymentsReviewRes, paymentsPayRes] =
    await Promise.all([
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
  };

  return { items, counts };
}
