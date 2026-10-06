"use client";

import Link from "next/link";
import { Fragment, useMemo } from "react";
import { formatDateCO } from "@/lib/dates";
import {
  groupItemsBySupplier,
  type SupplierOrderGroup,
  type SupplierOrderItem,
} from "@/lib/purchases/supplier-orders";

export type PedidoRequest = {
  id: string;
  title: string;
  status: string;
  notes: string | null;
  location_label: string | null;
  requested_at: string;
  needed_by: string | null;
  ordered_at: string | null;
  approved_at: string | null;
};

export type PedidoItem = {
  id: string;
  product_id: string;
  product_name: string;
  category_name: string;
  quantity_requested: number | string;
  quantity_approved: number | string | null;
  unit: string;
  suggested_supplier_id: string | null;
  approved_supplier_id: string | null;
  expected_delivery_date: string | null;
  notes: string | null;
  status: string;
};

export type PedidoSupplier = {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
};

export type PedidoOrganization = {
  name: string;
  nit: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  municipality: string | null;
};

type CategoryBlock = {
  category: string;
  items: SupplierOrderItem[];
};

function sortAndGroupByCategory(items: SupplierOrderItem[]): CategoryBlock[] {
  const sorted = [...items].sort((a, b) => {
    const cat = a.category_name.localeCompare(b.category_name, "es");
    if (cat !== 0) return cat;
    return a.product_name.localeCompare(b.product_name, "es");
  });
  const blocks: CategoryBlock[] = [];
  for (const item of sorted) {
    const last = blocks[blocks.length - 1];
    if (last && last.category === item.category_name) {
      last.items.push(item);
    } else {
      blocks.push({ category: item.category_name, items: [item] });
    }
  }
  return blocks;
}

export function PedidoPorProveedorClient({
  request,
  items,
  suppliers,
  organization,
  focusSupplierId,
}: {
  request: PedidoRequest;
  items: PedidoItem[];
  suppliers: PedidoSupplier[];
  organization: PedidoOrganization;
  focusSupplierId?: string | null;
}) {
  const supplierMap = useMemo(
    () => new Map(suppliers.map((s) => [s.id, s])),
    [suppliers],
  );
  const nameMap = useMemo(
    () => new Map(suppliers.map((s) => [s.id, s.name])),
    [suppliers],
  );

  const groups = useMemo(() => {
    const all = groupItemsBySupplier(items, nameMap);
    if (!focusSupplierId) return all;
    return all.filter((g) => g.supplierId === focusSupplierId);
  }, [items, nameMap, focusSupplierId]);

  return (
    <div className="space-y-6">
      <style>{`
        @page {
          size: letter;
          margin: 14mm 16mm;
        }
        @media print {
          html, body {
            background: white !important;
            color: #111 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body * {
            box-shadow: none !important;
          }
          .no-print { display: none !important; }
          .print-root {
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .print-sheet {
            break-after: page;
            break-inside: avoid;
            border: none !important;
            border-radius: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          .print-sheet:last-child { break-after: auto; }
          .print-table { width: 100%; border-collapse: collapse; }
          .print-table th,
          .print-table td {
            border-bottom: 1px solid #d4d4d4;
            padding: 7px 6px;
            font-size: 11pt;
            vertical-align: top;
          }
          .print-table th {
            border-bottom: 1.5px solid #111;
            font-size: 9pt;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: #444;
          }
          .print-cat td {
            border-bottom: 1px solid #bbb !important;
            background: #f3f3f3 !important;
            font-size: 9pt !important;
            font-weight: 700 !important;
            letter-spacing: 0.03em;
            text-transform: uppercase;
            padding-top: 9px !important;
            padding-bottom: 5px !important;
          }
        }
      `}</style>

      <div className="no-print space-y-4">
        <div>
          <Link
            href={`/compras/solicitudes/${request.id}`}
            className="text-sm text-[var(--accent)]"
          >
            ← Volver a la solicitud
          </Link>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-medium">Pedidos por proveedor</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Cada hoja es una orden lista para enviar. Use «Solo este
              proveedor» o filtre antes de imprimir / guardar PDF.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {focusSupplierId ? (
              <Link
                href={`/compras/solicitudes/${request.id}/pedido`}
                className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm"
              >
                Ver todos
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white"
            >
              Imprimir / guardar PDF
            </button>
          </div>
        </div>
        {groups.length > 1 ? (
          <nav className="flex flex-wrap gap-2 text-sm">
            {groups.map((g) => (
              <a
                key={g.supplierId ?? "none"}
                href={`#proveedor-${g.supplierId ?? "sin"}`}
                className="rounded-lg border border-[var(--line)] bg-white px-3 py-1.5"
              >
                {g.supplierName} ({g.items.length})
              </a>
            ))}
          </nav>
        ) : null}
      </div>

      <div className="print-root space-y-8">
        {groups.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--line)] bg-white px-4 py-6 text-sm text-[var(--muted)]">
            No hay ítems con proveedor para armar pedidos. Revise la aprobación.
          </p>
        ) : (
          groups.map((group, index) => (
            <SupplierOrderSheet
              key={group.supplierId ?? `none-${index}`}
              group={group}
              supplier={
                group.supplierId ? supplierMap.get(group.supplierId) : undefined
              }
              request={request}
              organization={organization}
              sheetIndex={index + 1}
              sheetTotal={groups.length}
            />
          ))
        )}
      </div>
    </div>
  );
}

function SupplierOrderSheet({
  group,
  supplier,
  request,
  organization,
  sheetIndex,
  sheetTotal,
}: {
  group: SupplierOrderGroup;
  supplier?: PedidoSupplier;
  request: PedidoRequest;
  organization: PedidoOrganization;
  sheetIndex: number;
  sheetTotal: number;
}) {
  const blocks = sortAndGroupByCategory(group.items);
  const orderDate = formatDateCO(
    request.ordered_at ?? request.approved_at ?? request.requested_at,
  );
  const orgPlace = [organization.address, organization.municipality]
    .filter(Boolean)
    .join(", ");
  let lineNo = 0;

  return (
    <section
      id={`proveedor-${group.supplierId ?? "sin"}`}
      className="print-sheet rounded-xl border border-[var(--line)] bg-white p-6 md:p-8"
    >
      {/* Encabezado */}
      <header className="border-b-2 border-[var(--ink)] pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xl font-semibold tracking-tight text-[var(--ink)]">
              {organization.name}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
              {[
                organization.nit ? `NIT ${organization.nit}` : null,
                organization.phone,
                organization.email,
                orgPlace,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
              Orden de pedido
            </p>
            <p className="mt-1 text-sm tabular-nums text-[var(--muted)]">
              {sheetTotal > 1 ? `${sheetIndex}/${sheetTotal}` : null}
            </p>
            <p className="no-print mt-2">
              <Link
                href={`/compras/solicitudes/${request.id}/pedido?supplier=${group.supplierId ?? ""}`}
                className="text-sm text-[var(--accent)]"
              >
                Solo este proveedor
              </Link>
            </p>
          </div>
        </div>
      </header>

      {/* Destinatario + meta */}
      <div className="mt-5 grid gap-4 border-b border-[var(--line)] pb-5 md:grid-cols-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            Proveedor
          </p>
          <p className="mt-1 text-lg font-semibold">{group.supplierName}</p>
          {(supplier?.contact_name ||
            supplier?.phone ||
            supplier?.email) && (
            <div className="mt-2 space-y-0.5 text-sm text-[var(--muted)]">
              {supplier.contact_name ? <p>{supplier.contact_name}</p> : null}
              {supplier.phone ? <p>{supplier.phone}</p> : null}
              {supplier.email ? <p>{supplier.email}</p> : null}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm md:justify-items-end md:text-right">
          <Meta label="Solicitud" value={request.title} />
          <Meta label="Fecha pedido" value={orderDate} />
          <Meta
            label="Punto / ubicación"
            value={request.location_label || "—"}
          />
          <Meta
            label="Necesario para"
            value={
              request.needed_by ? formatDateCO(request.needed_by) : "—"
            }
          />
        </div>
      </div>

      {/* Tabla de ítems por categoría */}
      <div className="mt-5">
        <table className="print-table w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-[var(--ink)] text-left text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
              <th className="w-10 py-2 pr-2 font-semibold">#</th>
              <th className="py-2 pr-2 font-semibold">Producto</th>
              <th className="w-16 py-2 pr-2 font-semibold">Und</th>
              <th className="w-20 py-2 pr-2 text-right font-semibold">Cant.</th>
              <th className="w-28 py-2 font-semibold">Entrega est.</th>
            </tr>
          </thead>
          <tbody>
            {blocks.map((block) => (
              <Fragment key={block.category}>
                <tr className="print-cat">
                  <td
                    colSpan={5}
                    className="bg-neutral-100 px-1 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ink)]"
                  >
                    {block.category}
                  </td>
                </tr>
                {block.items.map((item) => {
                  lineNo += 1;
                  return (
                    <tr
                      key={item.id}
                      className="border-b border-[var(--line)] align-top"
                    >
                      <td className="py-2.5 pr-2 tabular-nums text-[var(--muted)]">
                        {lineNo}
                      </td>
                      <td className="py-2.5 pr-2">
                        <span className="font-medium">{item.product_name}</span>
                        {item.notes ? (
                          <span className="mt-0.5 block text-xs text-[var(--muted)]">
                            Nota: {item.notes}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2.5 pr-2 uppercase text-[var(--muted)]">
                        {item.unit}
                      </td>
                      <td className="py-2.5 pr-2 text-right text-base font-semibold tabular-nums">
                        {item.quantity}
                      </td>
                      <td className="py-2.5 text-[var(--muted)]">
                        {item.expected_delivery_date
                          ? formatDateCO(item.expected_delivery_date)
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-[var(--muted)]">
          Total: <strong className="text-[var(--ink)]">{group.items.length}</strong>{" "}
          producto{group.items.length === 1 ? "" : "s"}
          {blocks.length > 1
            ? ` · ${blocks.length} categorías`
            : ""}
        </p>
      </div>

      {request.notes ? (
        <div className="mt-4 rounded-lg border border-[var(--line)] px-3 py-2 text-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
            Notas
          </p>
          <p className="mt-1">{request.notes}</p>
        </div>
      ) : null}

      {/* Firma */}
      <div className="mt-10 grid gap-8 border-t border-[var(--line)] pt-6 md:grid-cols-2">
        <div>
          <div className="h-10 border-b border-[var(--ink)]" />
          <p className="mt-2 text-xs text-[var(--muted)]">
            Elaborado / enviado por
          </p>
        </div>
        <div>
          <div className="h-10 border-b border-[var(--ink)]" />
          <p className="mt-2 text-xs text-[var(--muted)]">
            Recibido / confirmado por el proveedor
          </p>
        </div>
      </div>

      <p className="mt-6 text-[10px] text-[var(--muted)]">
        Documento generado en Candela · Ref. {request.id.slice(0, 8)}
      </p>
    </section>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-0.5 font-medium text-[var(--ink)]">{value}</p>
    </div>
  );
}
