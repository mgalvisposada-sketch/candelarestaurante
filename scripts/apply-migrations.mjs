#!/usr/bin/env node
/**
 * Aplica migraciones SQL al Postgres de Supabase.
 * Requiere en .env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_DB_PASSWORD  (Settings → Database → Database password)
 *
 * Opcional:
 *   SUPABASE_DB_HOST  (ej. db.<ref>.supabase.co o pooler host)
 */
import fs from "fs";
import path from "path";
import postgres from "postgres";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });

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
    `postgresql://postgres.${ref}:${encoded}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`,
    `postgresql://postgres.${ref}:${encoded}@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`,
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
    console.error(
      "Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_DB_PASSWORD en .env",
    );
    console.error(
      "La contraseña está en: Supabase Dashboard → Project Settings → Database",
    );
    process.exit(1);
  }

  const ref = projectRef(url);
  if (!ref) {
    console.error("No se pudo extraer project ref de la URL");
    process.exit(1);
  }

  const sql = await connect(candidateUrls(ref, password));
  const dir = path.join(process.cwd(), "supabase", "migrations");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  console.log(`Proyecto: ${ref}`);
  console.log(`Migraciones: ${files.length}`);

  await sql`
    create table if not exists public.schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default timezone('utc', now())
    )
  `;

  for (const file of files) {
    const [{ count }] = await sql`
      select count(*)::int as count from public.schema_migrations where filename = ${file}
    `;
    if (count > 0) {
      console.log(`skip  ${file}`);
      continue;
    }

    const body = fs.readFileSync(path.join(dir, file), "utf8");
    console.log(`apply ${file} ...`);
    try {
      await sql.unsafe(body);
      await sql`
        insert into public.schema_migrations (filename) values (${file})
      `;
      console.log(`ok    ${file}`);
    } catch (err) {
      console.error(`FAIL  ${file}`);
      console.error(err.message);
      await sql.end();
      process.exit(1);
    }
  }

  await sql.end();
  console.log("Migraciones aplicadas.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
