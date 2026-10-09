#!/usr/bin/env node
/**
 * Borra solicitudes de compra y su efecto en inventario/CxP/cola de pago.
 * NO toca gastos ni payment_requests de origen GASTO.
 *
 * Uso: node scripts/reset-purchases-inventory.mjs
 *      node scripts/reset-purchases-inventory.mjs --dry-run
 */
import postgres from "postgres";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });

const dryRun = process.argv.includes("--dry-run");

function projectRef(url) {
  return url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ?? null;
}

function candidateUrls(ref, password) {
  const encoded = encodeURIComponent(password);
  const customHost = process.env.SUPABASE_DB_HOST;
  const urls = [];
  if (customHost) {
    urls.push(
      `postgresql://postgres:${encoded}@${customHost}:5432/postgres`,
      `postgresql://postgres.${ref}:${encoded}@${customHost}:6543/postgres`,
    );
  }
  urls.push(
    `postgresql://postgres:${encoded}@db.${ref}.supabase.co:5432/postgres`,
    `postgresql://postgres.${ref}:${encoded}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
    `postgresql://postgres.${ref}:${encoded}@aws-0-us-east-2.pooler.supabase.com:6543/postgres`,
    `postgresql://postgres.${ref}:${encoded}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`,
    `postgresql://postgres.${ref}:${encoded}@aws-1-us-east-1.pooler.supabase.com:6543/postgres`,
    `postgresql://postgres.${ref}:${encoded}@aws-1-sa-east-1.pooler.supabase.com:6543/postgres`,
  );
  return urls;
}

async function connect(urls) {
  let lastError;
  for (const connectionString of urls) {
    const host = connectionString.split("@")[1]?.split("/")[0];
    const sql = postgres(connectionString, {
      ssl: "require",
      max: 1,
      prepare: false,
      connect_timeout: 8,
    });
    try {
      await sql`select 1 as ok`;
      console.log(`Conectado: ${host}`);
      return sql;
    } catch (err) {
      lastError = err;
      await sql.end().catch(() => {});
      console.log(`No conectó ${host}: ${err.message}`);
    }
  }
  throw lastError ?? new Error("No fue posible conectar a Postgres");
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!url || !password) {
    console.error("Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_DB_PASSWORD");
    process.exit(1);
  }
  const ref = projectRef(url);
  if (!ref) {
    console.error("No se pudo extraer project ref");
    process.exit(1);
  }

  const sql = await connect(candidateUrls(ref, password));

  const counts = await sql`
    select
      (select count(*)::int from public.purchase_requests) as purchase_requests,
      (select count(*)::int from public.purchase_request_items) as purchase_items,
      (select count(*)::int from public.inventory_movements
        where movement_type = 'COMPRA'
           or reference_type in ('purchase_request_items', 'purchase_requests')
      ) as compra_movements,
      (select count(*)::int from public.accounts_payable_documents
        where source = 'compras' and deleted_at is null
      ) as ap_docs_compras,
      (select count(*)::int from public.payment_requests
        where source = 'FACTURA_PROVEEDOR' and deleted_at is null
      ) as pay_reqs_proveedor,
      (select count(*)::int from public.expenses where deleted_at is null) as expenses_kept,
      (select count(*)::int from public.payment_requests
        where source = 'GASTO' and deleted_at is null
      ) as pay_reqs_gasto_kept
  `;

  console.log(dryRun ? "DRY RUN — no se borra nada" : "RESET compras + efecto inventario");
  console.log(counts[0]);

  if (dryRun) {
    await sql.end();
    return;
  }

  await sql.begin(async (tx) => {
    // 1) IDs de payment_requests de facturas de proveedor (compras)
    const payRows = await tx`
      select id, bank_transaction_id
      from public.payment_requests
      where source = 'FACTURA_PROVEEDOR'
    `;
    const payIds = payRows.map((r) => r.id);
    const bankTxIds = payRows
      .map((r) => r.bank_transaction_id)
      .filter(Boolean);

    // 2) Documentos CxP originados en compras
    const apDocs = await tx`
      select id from public.accounts_payable_documents
      where source = 'compras'
    `;
    const apDocIds = apDocs.map((r) => r.id);

    // 3) Desvincular cabeceras de compra (FKs opcionales)
    await tx`
      update public.purchase_requests
      set payment_request_id = null,
          ap_document_id = null
    `;
    await tx`
      update public.purchase_request_items
      set invoice_payment_request_id = null,
          invoice_ap_document_id = null
    `;

    // 4) Pagos CxP de esos documentos
    if (apDocIds.length) {
      await tx`
        delete from public.accounts_payable_payments
        where accounts_payable_document_id = any(${apDocIds})
      `;
    }

    // 5) Payment requests de proveedor (no GASTO)
    if (payIds.length) {
      await tx`
        delete from public.payment_requests
        where id = any(${payIds})
      `;
    }

    // 6) Movimientos de banco ligados a esos pagos (si existen)
    if (bankTxIds.length) {
      await tx`
        delete from public.bank_transactions
        where id = any(${bankTxIds})
      `;
    }

    // 7) Documentos CxP de compras
    if (apDocIds.length) {
      await tx`
        delete from public.accounts_payable_documents
        where id = any(${apDocIds})
      `;
    }

    // 8) Movimientos de inventario por compra
    await tx`
      delete from public.inventory_movements
      where movement_type = 'COMPRA'
         or reference_type in ('purchase_request_items', 'purchase_requests')
    `;

    // 9) Solicitudes de compra
    await tx`delete from public.purchase_request_items`;
    await tx`delete from public.purchase_requests`;

    // 10) Recalcular stock desde movimientos restantes (si no hay, deja 0)
    await tx`
      update public.products p
      set current_stock = coalesce(m.stock, 0),
          updated_at = timezone('utc', now())
      from (
        select product_id, sum(quantity) as stock
        from public.inventory_movements
        group by product_id
      ) m
      where p.id = m.product_id
        and p.deleted_at is null
    `;

    // Productos sin movimientos restantes → stock 0
    await tx`
      update public.products p
      set current_stock = 0,
          updated_at = timezone('utc', now())
      where p.deleted_at is null
        and not exists (
          select 1 from public.inventory_movements im
          where im.product_id = p.id
        )
    `;
  });

  const after = await sql`
    select
      (select count(*)::int from public.purchase_requests) as purchase_requests,
      (select count(*)::int from public.purchase_request_items) as purchase_items,
      (select count(*)::int from public.inventory_movements
        where movement_type = 'COMPRA') as compra_movements,
      (select count(*)::int from public.accounts_payable_documents
        where source = 'compras' and deleted_at is null) as ap_docs_compras,
      (select count(*)::int from public.payment_requests
        where source = 'FACTURA_PROVEEDOR' and deleted_at is null) as pay_reqs_proveedor,
      (select count(*)::int from public.expenses where deleted_at is null) as expenses_kept,
      (select count(*)::int from public.payment_requests
        where source = 'GASTO' and deleted_at is null) as pay_reqs_gasto_kept,
      (select count(*)::int from public.products where deleted_at is null) as products,
      (select coalesce(sum(current_stock),0)::numeric from public.products
        where deleted_at is null) as stock_total
  `;

  console.log("Después del reset:");
  console.log(after[0]);
  await sql.end();
  console.log("Listo.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
