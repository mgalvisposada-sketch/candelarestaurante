import type { AppRole } from "@/types/domain";

export type AppSubmoduleDef = {
  key: string;
  label: string;
  description?: string;
};

export type AppModuleDef = {
  key: string;
  label: string;
  href: string;
  mvp: number;
  submodules: AppSubmoduleDef[];
};

/**
 * Catálogo de módulos y submódulos de la app.
 * Las claves se guardan en user_module_permissions.permission_key.
 */
export const APP_MODULES: AppModuleDef[] = [
  {
    key: "inicio",
    label: "Inicio",
    href: "/inicio",
    mvp: 1,
    submodules: [
      { key: "inicio.resumen", label: "Resumen ejecutivo" },
    ],
  },
  {
    key: "empalme",
    label: "Empalme",
    href: "/empalme",
    mvp: 1,
    submodules: [
      { key: "empalme.sesion", label: "Sesión de empalme" },
      { key: "empalme.items", label: "Ítems y verificación" },
      {
        key: "empalme.cerrar",
        label: "Cerrar empalme",
        description: "Permite congelar / cerrar la sesión de empalme",
      },
    ],
  },
  {
    key: "empresa",
    label: "Empresa",
    href: "/empresa",
    mvp: 1,
    submodules: [
      { key: "empresa.datos", label: "Datos corporativos" },
    ],
  },
  {
    key: "socios",
    label: "Socios",
    href: "/socios",
    mvp: 1,
    submodules: [
      { key: "socios.maestro", label: "Maestro de socios" },
      { key: "socios.cuentas", label: "Cuentas socio ↔ sociedad" },
    ],
  },
  {
    key: "tesoreria",
    label: "Tesorería",
    href: "/tesoreria",
    mvp: 1,
    submodules: [
      { key: "tesoreria.cuentas", label: "Cuentas bancarias / caja" },
      { key: "tesoreria.saldos", label: "Saldos iniciales" },
    ],
  },
  {
    key: "proveedores",
    label: "Proveedores & CxP",
    href: "/proveedores",
    mvp: 1,
    submodules: [
      { key: "proveedores.maestro", label: "Proveedores" },
      { key: "proveedores.cxp", label: "Cuentas por pagar" },
    ],
  },
  {
    key: "prestamos",
    label: "Préstamos",
    href: "/prestamos",
    mvp: 1,
    submodules: [
      { key: "prestamos.contratos", label: "Contratos de préstamo" },
      { key: "prestamos.movimientos", label: "Desembolsos y pagos" },
    ],
  },
  {
    key: "capital",
    label: "Capital",
    href: "/capital",
    mvp: 1,
    submodules: [
      { key: "capital.movimientos", label: "Movimientos de capital" },
    ],
  },
  {
    key: "gastos",
    label: "Gastos",
    href: "/gastos",
    mvp: 2,
    submodules: [
      { key: "gastos.registro", label: "Registro de gastos" },
    ],
  },
  {
    key: "solicitudes-pago",
    label: "Solicitudes de pago",
    href: "/solicitudes-pago",
    mvp: 2,
    submodules: [
      { key: "solicitudes-pago.bandeja", label: "Bandeja de solicitudes" },
      { key: "solicitudes-pago.crear", label: "Crear solicitudes" },
      { key: "solicitudes-pago.aprobar", label: "Aprobar / rechazar" },
      { key: "solicitudes-pago.pagar", label: "Ejecutar pagos" },
    ],
  },
  {
    key: "compras",
    label: "Compras",
    href: "/compras",
    mvp: 2,
    submodules: [
      { key: "compras.inventario", label: "Inventario (maestro)" },
      { key: "compras.proveedores", label: "Proveedores por categoría" },
      { key: "compras.solicitudes", label: "Solicitudes de compra" },
      { key: "compras.solicitudes.crear", label: "Crear solicitudes de compra" },
      { key: "compras.solicitudes.aprobar", label: "Aprobar compras" },
      { key: "compras.solicitudes.recibir", label: "Recibir mercancía" },
    ],
  },
  {
    key: "presupuesto",
    label: "Presupuesto",
    href: "/presupuesto",
    mvp: 2,
    submodules: [
      { key: "presupuesto.lineas", label: "Líneas presupuestales" },
    ],
  },
  {
    key: "personal",
    label: "Personal",
    href: "/personal",
    mvp: 3,
    submodules: [
      { key: "personal.empleados", label: "Empleados" },
      { key: "personal.novedades", label: "Novedades en turno" },
      { key: "personal.novedades.aprobar", label: "Aprobar novedades" },
      { key: "personal.liquidacion", label: "Liquidación quincenal" },
      { key: "personal.parametros", label: "Parámetros de nómina" },
      { key: "personal.simulacion", label: "Simulación quincenal" },
      { key: "personal.maestro", label: "Personal administrativo (legado)" },
      { key: "personal.contratos", label: "Contratos laborales (legado)" },
    ],
  },
  {
    key: "tributario",
    label: "Tributario",
    href: "/tributario",
    mvp: 3,
    submodules: [
      { key: "tributario.obligaciones", label: "Obligaciones" },
    ],
  },
  {
    key: "contratos",
    label: "Contratos",
    href: "/contratos",
    mvp: 3,
    submodules: [
      { key: "contratos.maestro", label: "Contratos y vencimientos" },
    ],
  },
  {
    key: "sst",
    label: "SST",
    href: "/sst",
    mvp: 3,
    submodules: [
      { key: "sst.obligaciones", label: "Obligaciones SST" },
    ],
  },
  {
    key: "documentos",
    label: "Documentos",
    href: "/documentos",
    mvp: 1,
    submodules: [
      { key: "documentos.archivo", label: "Archivo documental" },
    ],
  },
  {
    key: "reportes",
    label: "Reportes",
    href: "/reportes",
    mvp: 4,
    submodules: [
      { key: "reportes.ver", label: "Consulta de reportes" },
    ],
  },
  {
    key: "configuracion",
    label: "Configuración",
    href: "/configuracion",
    mvp: 1,
    submodules: [
      { key: "configuracion.usuarios", label: "Usuarios del sistema" },
      { key: "configuracion.permisos", label: "Permisos por módulo" },
    ],
  },
];

export const ALL_PERMISSION_KEYS: string[] = APP_MODULES.flatMap((m) => [
  m.key,
  ...m.submodules.map((s) => s.key),
]);

const ALL_EXCEPT_CONFIG_ADMIN = ALL_PERMISSION_KEYS.filter(
  (k) =>
    k !== "configuracion" &&
    k !== "configuracion.usuarios" &&
    k !== "configuracion.permisos",
);

/** Defaults por rol cuando se crea un usuario (SUPER_ADMIN no necesita filas). */
export const ROLE_DEFAULT_PERMISSIONS: Record<AppRole, string[]> = {
  SUPER_ADMIN: [...ALL_PERMISSION_KEYS],
  GESTION: [...ALL_EXCEPT_CONFIG_ADMIN, "configuracion"],
  /** Administrador operativo del local: novedades y solicitudes de compra. */
  ADMIN_LOCAL: [
    "personal",
    "personal.novedades",
    "compras",
    "compras.solicitudes",
    "compras.solicitudes.crear",
    "compras.solicitudes.recibir",
  ],
  SOCIO: [
    "inicio",
    "inicio.resumen",
    "socios",
    "socios.maestro",
    "socios.cuentas",
    "capital",
    "capital.movimientos",
    "documentos",
    "documentos.archivo",
    "empalme",
    "empalme.sesion",
  ],
  CONTADOR: [
    "inicio",
    "inicio.resumen",
    "tesoreria",
    "tesoreria.cuentas",
    "tesoreria.saldos",
    "proveedores",
    "proveedores.maestro",
    "proveedores.cxp",
    "gastos",
    "gastos.registro",
    "solicitudes-pago",
    "solicitudes-pago.bandeja",
    "solicitudes-pago.pagar",
    "compras",
    "compras.inventario",
    "compras.proveedores",
    "compras.solicitudes",
    "presupuesto",
    "presupuesto.lineas",
    "tributario",
    "tributario.obligaciones",
    "documentos",
    "documentos.archivo",
    "prestamos",
    "prestamos.contratos",
    "prestamos.movimientos",
    "capital",
    "capital.movimientos",
  ],
  LECTURA: [
    "inicio",
    "inicio.resumen",
    "empresa",
    "empresa.datos",
    "documentos",
    "documentos.archivo",
  ],
};

export function isValidPermissionKey(key: string): boolean {
  return ALL_PERMISSION_KEYS.includes(key);
}

export function moduleKeyFromPath(pathname: string): string | null {
  const segment = pathname.split("/").filter(Boolean)[0];
  if (!segment) return null;
  const mod = APP_MODULES.find((m) => m.href === `/${segment}`);
  return mod?.key ?? null;
}

export function hasPermission(
  granted: ReadonlySet<string> | readonly string[],
  key: string,
  opts?: { isSuperAdmin?: boolean },
): boolean {
  if (opts?.isSuperAdmin) return true;
  const set = granted instanceof Set ? granted : new Set(granted);
  if (set.has(key)) return true;
  // Entrar al módulo: basta con cualquier submódulo concedido
  if (!key.includes(".")) {
    for (const g of set) {
      if (g.startsWith(`${key}.`)) return true;
    }
  }
  return false;
}

export function canAccessModuleHref(
  granted: ReadonlySet<string> | readonly string[],
  href: string,
  opts?: { isSuperAdmin?: boolean },
): boolean {
  const mod = APP_MODULES.find((m) => m.href === href);
  if (!mod) return false;
  return hasPermission(granted, mod.key, opts);
}

/** Primera ruta permitida (MVP ≤ 3), o null si no hay ninguna. */
export function firstAllowedHref(
  granted: ReadonlySet<string> | readonly string[],
  opts?: { isSuperAdmin?: boolean },
): string | null {
  for (const mod of APP_MODULES) {
    if (mod.mvp > 3) continue;
    if (canAccessModuleHref(granted, mod.href, opts)) return mod.href;
  }
  return null;
}
