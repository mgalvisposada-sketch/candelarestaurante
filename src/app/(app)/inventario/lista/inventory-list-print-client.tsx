"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { formatCOP, money } from "@/lib/money";
import { todayInBogota, formatDateCO } from "@/lib/dates";

export type ListCategory = {
  id: string;
  code: string;
  name: string;
};

export type ListProduct = {
  id: string;
  category_id: string;
  sku: string | null;
  name: string;
  unit: string;
  min_stock: number | string;
  current_stock: number | string;
  unit_cost: number | string;
  notes: string | null;
};

type CategoryBlock = {
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  products: ListProduct[];
  stockValue: number;
};

function qty(value: number | string) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number.isInteger(n) ? String(n) : String(n);
}

function lineValue(p: ListProduct) {
  return money(p.current_stock).times(money(p.unit_cost)).toNumber();
}

export function InventoryListPrintClient({
  organizationName,
  categories,
  products,
}: {
  organizationName: string;
  categories: ListCategory[];
  products: ListProduct[];
}) {
  const [query, setQuery] = useState("");
  const [onlyBelowMin, setOnlyBelowMin] = useState(false);

  const blocks = useMemo(() => {
    const q = query.trim().toLowerCase();
    const catMap = new Map(categories.map((c) => [c.id, c]));
    const filtered = products.filter((p) => {
      const stock = Number(p.current_stock || 0);
      const min = Number(p.min_stock || 0);
      if (onlyBelowMin && !(stock < min)) return false;
      if (!q) return true;
      const cat = catMap.get(p.category_id);
      const hay = [p.name, p.sku ?? "", p.unit, cat?.code ?? "", cat?.name ?? ""]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });

    const byCat = new Map<string, ListProduct[]>();
    for (const c of categories) byCat.set(c.id, []);
    const orphan: ListProduct[] = [];
    for (const p of filtered) {
      const list = byCat.get(p.category_id);
      if (list) list.push(p);
      else orphan.push(p);
    }

    const result: CategoryBlock[] = [];
    for (const c of categories) {
      const list = (byCat.get(c.id) ?? []).sort((a, b) =>
        a.name.localeCompare(b.name, "es"),
      );
      if (list.length === 0) continue;
      result.push({
        categoryId: c.id,
        categoryCode: c.code,
        categoryName: c.name,
        products: list,
        stockValue: list.reduce((acc, p) => acc + lineValue(p), 0),
      });
    }
    if (orphan.length > 0) {
      const list = orphan.sort((a, b) => a.name.localeCompare(b.name, "es"));
      result.push({
        categoryId: "__sin__",
        categoryCode: "—",
        categoryName: "Sin categoría",
        products: list,
        stockValue: list.reduce((acc, p) => acc + lineValue(p), 0),
      });
    }
    return result;
  }, [categories, products, query, onlyBelowMin]);

  const totalProducts = blocks.reduce((acc, b) => acc + b.products.length, 0);
  const totalValue = blocks.reduce((acc, b) => acc + b.stockValue, 0);
  const asOf = formatDateCO(todayInBogota());

  return (
    <div className="space-y-6">
      <style>{`
        @page {
          size: letter;
          margin: 12mm 14mm;
        }
        @media print {
          html, body {
            background: white !important;
            color: #111 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body * { box-shadow: none !important; }
          .no-print { display: none !important; }
          .print-root {
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .print-table { width: 100%; border-collapse: collapse; }
          .print-table th,
          .print-table td {
            border-bottom: 1px solid #d4d4d4;
            padding: 6px 5px;
            font-size: 10pt;
            vertical-align: top;
          }
          .print-table th {
            border-bottom: 1.5px solid #111;
            font-size: 8.5pt;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: #444;
            text-align: left;
          }
          .print-table .num { text-align: right; font-variant-numeric: tabular-nums; }
          .print-cat td {
            border-bottom: 1px solid #bbb !important;
            background: #f3f3f3 !important;
            font-size: 9pt !important;
            font-weight: 700 !important;
            letter-spacing: 0.03em;
            text-transform: uppercase;
            padding-top: 10px !important;
            padding-bottom: 5px !important;
          }
          .print-subtotal td {
            border-top: 1px solid #999 !important;
            border-bottom: none !important;
            font-weight: 600;
            padding-top: 6px !important;
          }
          .print-total td {
            border-top: 2px solid #111 !important;
            font-weight: 700;
            font-size: 11pt !important;
          }
          .print-header {
            border-bottom: 2px solid #111;
            margin-bottom: 12px;
            padding-bottom: 8px;
          }
        }
      `}</style>

      <div className="no-print space-y-4">
        <div>
          <Link href="/inventario/maestro" className="text-sm text-[var(--accent)]">
            ← Volver al inventario
          </Link>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-medium">Lista de inventario</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Vista para revisar o imprimir, agrupada por categoría.
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white"
          >
            Imprimir / guardar PDF
          </button>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block min-w-[220px] flex-1 sm:max-w-sm">
            <span className="mb-1 block text-sm text-[var(--muted)]">Buscar</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Producto, SKU, categoría…"
              className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2"
            />
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              checked={onlyBelowMin}
              onChange={(e) => setOnlyBelowMin(e.target.checked)}
            />
            Solo bajo mínimo
          </label>
        </div>
        <p className="text-sm text-[var(--muted)]">
          {totalProducts} producto{totalProducts === 1 ? "" : "s"} · valor stock{" "}
          {formatCOP(totalValue)}
        </p>
      </div>

      <div className="print-root mx-auto max-w-5xl rounded-xl border border-[var(--line)] bg-white p-5 md:p-8 print:border-0 print:p-0">
        <header className="print-header mb-5">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Inventario de compras
          </p>
          <h2 className="mt-1 text-xl font-medium">{organizationName}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Al {asOf} · {totalProducts} producto{totalProducts === 1 ? "" : "s"} ·{" "}
            {blocks.length} categoría{blocks.length === 1 ? "" : "s"}
            {onlyBelowMin ? " · solo bajo mínimo" : ""}
          </p>
        </header>

        {blocks.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            No hay productos para mostrar con los filtros actuales.
          </p>
        ) : (
          <table className="print-table w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--ink)] text-left text-xs uppercase tracking-wide text-[var(--muted)]">
                <th className="py-2 pr-2 font-medium">Producto</th>
                <th className="py-2 pr-2 font-medium">SKU</th>
                <th className="num py-2 pr-2 font-medium">Stock</th>
                <th className="num py-2 pr-2 font-medium">Mín.</th>
                <th className="py-2 pr-2 font-medium">Und.</th>
                <th className="num py-2 pr-2 font-medium">Costo/u</th>
                <th className="num py-2 font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((block) => (
                <Fragment key={block.categoryId}>
                  <tr className="print-cat">
                    <td
                      colSpan={7}
                      className="bg-neutral-100 py-2 font-semibold uppercase tracking-wide"
                    >
                      {block.categoryCode} — {block.categoryName}{" "}
                      <span className="font-normal text-[var(--muted)]">
                        ({block.products.length})
                      </span>
                    </td>
                  </tr>
                  {block.products.map((p) => {
                    const stock = Number(p.current_stock || 0);
                    const min = Number(p.min_stock || 0);
                    const below = stock < min;
                    return (
                      <tr key={p.id} className="border-b border-[var(--line)]">
                        <td className="py-1.5 pr-2">
                          <span className="font-medium">{p.name}</span>
                          {p.notes ? (
                            <span className="mt-0.5 block text-xs text-[var(--muted)]">
                              {p.notes}
                            </span>
                          ) : null}
                          {below ? (
                            <span className="mt-0.5 block text-xs text-amber-800 no-print">
                              Bajo mínimo
                            </span>
                          ) : null}
                        </td>
                        <td className="py-1.5 pr-2 text-[var(--muted)]">
                          {p.sku || "—"}
                        </td>
                        <td className="num py-1.5 pr-2 tabular-nums">
                          {qty(p.current_stock)}
                        </td>
                        <td className="num py-1.5 pr-2 tabular-nums text-[var(--muted)]">
                          {qty(p.min_stock)}
                        </td>
                        <td className="py-1.5 pr-2">{p.unit}</td>
                        <td className="num py-1.5 pr-2 tabular-nums">
                          {formatCOP(Number(p.unit_cost || 0))}
                        </td>
                        <td className="num py-1.5 tabular-nums">
                          {formatCOP(lineValue(p))}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="print-subtotal">
                    <td
                      colSpan={6}
                      className="py-1.5 pr-2 text-right text-[var(--muted)]"
                    >
                      Subtotal {block.categoryName}
                    </td>
                    <td className="num py-1.5 font-medium tabular-nums">
                      {formatCOP(block.stockValue)}
                    </td>
                  </tr>
                </Fragment>
              ))}
              <tr className="print-total">
                <td colSpan={6} className="py-3 pr-2 text-right">
                  Total inventario
                </td>
                <td className="num py-3 tabular-nums">{formatCOP(totalValue)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
