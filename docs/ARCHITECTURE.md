# CANDELA ADMIN — Arquitectura

## Stack

| Capa | Tecnología |
|------|------------|
| Frontend / Backend | Next.js (App Router) + TypeScript |
| Estilos | Tailwind CSS + componentes reutilizables |
| Base de datos | Supabase PostgreSQL |
| Auth | Supabase Auth |
| Archivos | Supabase Storage (buckets privados + signed URLs) |
| Autorización | Row Level Security en tablas sensibles |
| Hosting | Vercel |
| Repositorio | GitHub (`main` = producción) |
| Schema changes | Migraciones versionadas en Git |

## Diagrama lógico

```
┌─────────────────────────────────────────────────────────┐
│                     Vercel (Next.js)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ App Router   │  │ Server       │  │ Server Actions│  │
│  │ (UI / RSC)   │  │ Components   │  │ / Route Hand. │  │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘  │
│         │                 │                  │          │
│         └─────────────────┼──────────────────┘          │
│                           ▼                             │
│              Supabase Client (anon / SSR)               │
│              Service Role SOLO server-side              │
└───────────────────────────┬─────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────┐
│                      Supabase                           │
│  Auth │ PostgreSQL + RLS │ Storage (privado) │ Audit    │
└─────────────────────────────────────────────────────────┘
                            ▲
                            │ (fase futura, READ ONLY)
┌─────────────────────────────────────────────────────────┐
│                 FILIPO (operacional)                    │
│  ventas │ food cost │ inventarios │ pedidos │ ...       │
└─────────────────────────────────────────────────────────┘
```

## Estructura del monorepo / app

```
/
├── docs/                      # Producto, arquitectura, modelo, seguridad, roadmap
├── supabase/
│   └── migrations/            # SQL versionado
├── src/
│   ├── app/                   # App Router (rutas, layouts, pages)
│   ├── components/            # UI reutilizable
│   ├── lib/                   # supabase, auth, money, dates, pdf
│   ├── modules/               # Dominios de negocio por feature
│   ├── integrations/
│   │   └── filipo/            # Types e interfaces READ ONLY (sin implementación)
│   ├── types/                 # Tipos compartidos
│   └── validations/           # Schemas (Zod)
├── tests/
├── .github/workflows/
├── README.md
├── CONTRIBUTING.md
└── .env.example
```

## Separación de capas

1. **UI** — presentación, formularios, tablas, dashboards.
2. **Application / Domain** — reglas de negocio (CxP, préstamos, empalme, presupuestos).
3. **Data access** — clientes Supabase tipados, queries, mutaciones.
4. **Infrastructure** — Auth, Storage, PDF, import CSV/XLSX, CI.

La autorización se aplica en **tres capas**: RLS (DB), server (actions/routes), UI (ocultar/deshabilitar).

## Multi-tenant

- Unidad de aislamiento: `organization_id`.
- Usuario ↔ organización vía `organization_users` + rol.
- RLS: ningún usuario accede a datos de otra organización.

## Empalme y snapshots

```
HandoverSession (fecha de corte, estado)
    ├── HandoverItems (bancos, CxP, socios, … + verification_status)
    └── al cerrar → HandoverSnapshot (JSON inmutable + closed_by/at)
```

Cambios posteriores al cierre = **ajustes**, no reescritura silenciosa del snapshot.

## Dinero y tiempo

- Montos: `NUMERIC(18,2)` (o precisión definida en migraciones). Nunca `float`/`double`.
- Fechas de negocio: `date` cuando sea día calendario.
- Auditoría / eventos: `timestamptz`.
- Formateo UI: `es-CO`, `America/Bogota`, DD/MM/YYYY, COP.

## Documentos

- Metadata en tabla `documents`.
- Binarios en Storage privado.
- Asociación polimórfica: `entity_type` + `entity_id`.
- Acceso vía signed URLs de corta duración.

## Integración FILIPO (preparación)

```
src/integrations/filipo/
  types.ts          # DailySales, ChannelSales, FoodCostSnapshot, …
  client.ts         # Interface FilipoReadClient (stub)
  README.md         # Contrato de integración futura
```

Candela Admin **nunca** escribe datos operacionales de FILIPO. Solo consume agregados READ ONLY cuando exista la integración.

## Flujos críticos MVP 1

1. Login → selección/contexto de organización.
2. Configurar Empresa + fecha de corte.
3. Registrar Socios y participación.
4. Registrar bancos/caja + saldos iniciales con evidencia.
5. Alta proveedores → documentos CxP → (pagos opcionales).
6. Registrar préstamos / desembolsos / uso del capital (mínimo viable).
7. Completar ítems de empalme con estados de verificación.
8. Ver Resumen de Empalme → cerrar → Snapshot + Acta PDF / Línea Base PDF.

## Entornos

| Entorno | Branch | Deploy |
|---------|--------|--------|
| Preview | `feature/*` PRs | Vercel Preview |
| Producción | `main` | Vercel Production |

## CI mínimo

- lint
- typecheck
- unit tests
- build

## Decisiones explícitas

| Decisión | Motivo |
|----------|--------|
| App Router + Server Actions | Menos superficie API pública; mutaciones server-side |
| RLS en todas las tablas sensibles | Defensa en profundidad multi-tenant |
| Soft delete en registros financieros | Auditoría e histórico |
| Snapshots de empalme | Inmutabilidad de la línea base |
| Sin OCR bancario en MVP | Complejidad vs valor; CSV/XLSX basta |
| Sin firma electrónica legal en acta | El acta es evidencia administrativa, no instrumento legal |
