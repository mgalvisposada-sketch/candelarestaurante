# Candela Admin

Plataforma web privada para el control **administrativo y financiero** de una empresa de restaurantes.

> No es un POS ni un ERP contable. La operación del restaurante (ventas, inventarios, Food Cost, pedidos) pertenece a **FILIPO**.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Supabase (PostgreSQL, Auth, Storage, RLS)
- Vercel + GitHub

## Documentación

| Documento | Contenido |
|-----------|-----------|
| [docs/PRODUCT.md](docs/PRODUCT.md) | Visión, frontera FILIPO, DoD MVP |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Arquitectura técnica |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Modelo de datos |
| [docs/SECURITY.md](docs/SECURITY.md) | Auth, RLS, Storage, auditoría |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Fases MVP 1–4 |

## Inicio rápido

```bash
cp .env.example .env.local
# Completar URL y keys de Supabase

npm install
npm run dev
```

Aplicar migraciones (CLI de Supabase):

```bash
npx supabase db push
# o: supabase migration up
```

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |
| `npm test` | Pruebas unitarias (Vitest) |

## Principios

1. Simplicidad, trazabilidad, evidencia, histórico, auditoría.
2. Dinero en `NUMERIC` / `Decimal` — nunca float.
3. Fechas visuales DD/MM/YYYY · timezone `America/Bogota` · moneda COP.
4. Cambios de schema solo vía migraciones en `supabase/migrations/`.
5. Sin secretos en el repositorio.

## MVP 1 (en construcción)

Login, Empresa, Socios, Empalme, Documentos, Bancos/saldos, Proveedores/CxP, Préstamos, Resumen y Acta PDF.

Ver Definition of Done en `docs/PRODUCT.md`.

## Contribución

Ver [CONTRIBUTING.md](CONTRIBUTING.md). Ramas `feature/*` + Pull Requests. `main` = producción.
