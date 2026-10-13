# Candela Admin

Plataforma web privada para la **operación administrativa y financiera** de una empresa de restaurantes.

> Filipo cubre el **POS** (ventas/comandas). Candela opera el día a día: caja, tesorería, compras, inventario, cocina, gastos, personal y gobierno de socios.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Supabase (PostgreSQL, Auth, Storage, RLS)
- Vercel + GitHub

## Documentación

| Documento | Contenido |
|-----------|-----------|
| [docs/PRODUCT.md](docs/PRODUCT.md) | Visión, frontera FILIPO, DoD |
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

1. Operación primero: caja, liquidez y costos del local.
2. Dinero en `NUMERIC` / `Decimal` — nunca float.
3. Fechas visuales DD/MM/YYYY · timezone `America/Bogota` · moneda COP.
4. Cambios de schema solo vía migraciones en `supabase/migrations/`.
5. Sin secretos en el repositorio.

## Enfoque actual

Empresa + saldos iniciales, Cierre de caja, Tesorería, Compras/Inventario/Cocina, Gastos, Solicitudes de pago, Personal, Proveedores/CxP, Socios/Capital. Checklist inicial opcional (arranque). Filipo = POS.

Ver Definition of Done en `docs/PRODUCT.md`.

## Contribución

Ver [CONTRIBUTING.md](CONTRIBUTING.md). Ramas `feature/*` + Pull Requests. `main` = producción.
