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
      { key: "proveedores.cxp", label: "Ver cuentas por pagar (principal)" },
      {
        key: "proveedores.cxp.crear",
        label: "Crear documentos CxP (desactivado; alta vía Compras)",
      },
      { key: "proveedores.cxp.editar", label: "Editar documentos CxP" },
      {
        key: "proveedores.cxp.pagar",
        label: "Pagos CxP (desactivado; usar Solicitudes de pago)",
      },
      { key: "proveedores.maestro", label: "Ver maestro de proveedores" },
      { key: "proveedores.crear", label: "Crear proveedores" },
      { key: "proveedores.editar", label: "Editar / desactivar proveedores" },
      { key: "proveedores.categorias", label: "Gestionar categorías" },
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
      {
        key: "gastos.categorias",
        label: "Maestro de categorías de gastos (no Compras)",
      },
    ],
  },
  {
    key: "solicitudes-pago",
    label: "Solicitudes de pago",
    href: "/solicitudes-pago",
    mvp: 2,
    submodules: [
      {
        key: "solicitudes-pago.bandeja",
        label: "Ver bandeja de pagos",
        description: "Cola de lo que hay que pagar (llega desde Compras o Gastos).",
      },
      {
        key: "solicitudes-pago.crear",
        label: "Crear solicitudes (desactivado; alta en CxP / Compras)",
      },
      {
        key: "solicitudes-pago.aprobar",
        label: "Aprobar / rechazar en cola",
      },
      {
        key: "solicitudes-pago.pagar",
        label: "Ejecutar pagos (banco / caja)",
        description: "Tesorería: marca pagado y actualiza CxP o gasto.",
      },
    ],
  },
  {
    key: "inventario",
    label: "Inventario",
    href: "/inventario",
    mvp: 2,
    submodules: [
      {
        key: "inventario.maestro",
        label: "Maestro (categorías, unidades y productos)",
      },
      {
        key: "inventario.minimo",
        label: "Cambiar stock mínimo",
      },
      {
        key: "inventario.fisico",
        label: "Inventario físico (conteo)",
        description: "Admin del local: cuenta y envía. No aplica el ajuste a stock.",
      },
      {
        key: "inventario.fisico.ajustar",
        label: "Aprobar ajuste de stock (auditor)",
        description: "Solo quien audita: aplica o rechaza el conteo físico.",
      },
    ],
  },
  {
    key: "compras",
    label: "Compras",
    href: "/compras",
    mvp: 2,
    submodules: [
      {
        key: "compras.sugeridos",
        label: "Ver sugeridos (bajo mínimo)",
        description: "Lista de productos a reponer según stock mínimo.",
      },
      {
        key: "compras.solicitudes",
        label: "Ver solicitudes de compra",
        description: "Consulta el flujo completo (sin operar pasos).",
      },
      {
        key: "compras.solicitudes.crear",
        label: "1 · Solicitar reposición",
        description:
          "Admin del local: arma borrador, indica urgencia/efectivo y envía a autorización.",
      },
      {
        key: "compras.solicitudes.aprobar",
        label: "2 · Autorizar compra",
        description:
          "Auditor/gestión: sin esto el local no debe comprar. Confirma proveedor y cantidades.",
      },
      {
        key: "compras.solicitudes.pedir",
        label: "3 · Pedir / comprar al proveedor",
        description:
          "Tras autorización: marca pedida (efectivo o envío de lista). Admin local o tesorería.",
      },
      {
        key: "compras.solicitudes.recibir",
        label: "4 · Recibir mercancía (solo cantidades)",
        description:
          "Admin del local: acredita qué llegó vs lo pedido. No carga precios de factura.",
      },
      {
        key: "compras.solicitudes.recibir.extras",
        label: "4b · Agregar extras en recepción",
        description: "Permite sumar productos que llegaron y no estaban en el pedido.",
      },
      {
        key: "compras.solicitudes.facturar",
        label: "5 · Cargar factura y enviar a cola de pago",
        description:
          "Tesorería/compras: pone precios, alias del proveedor, nº factura → CxP y solicitudes de pago.",
      },
      {
        key: "compras.proveedores",
        label: "Proveedores por categoría (lead times)",
        description: "Vínculos categoría ↔ proveedor para armar pedidos.",
      },
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
  // Gestión: puede ajustar permisos de módulos; crear/editar usuarios sigue siendo SUPER_ADMIN.
  GESTION: [
    ...ALL_EXCEPT_CONFIG_ADMIN,
    "configuracion",
    "configuracion.permisos",
  ],
  /**
   * Admin del local (Chase): solicita, pide si autorizado, recibe cantidades.
   * No autoriza, no factura, no paga, no ajusta inventario físico.
   */
  ADMIN_LOCAL: [
    "personal",
    "personal.novedades",
    "inventario",
    "inventario.maestro",
    "inventario.minimo",
    "inventario.fisico",
    "compras",
    "compras.sugeridos",
    "compras.solicitudes",
    "compras.solicitudes.crear",
    "compras.solicitudes.pedir",
    "compras.solicitudes.recibir",
    "compras.solicitudes.recibir.extras",
  ],
  /**
   * Tesorería / compras (Juliana): factura, cola de pago, bancos y CxP.
   * No opera el local (recibir/conteo) ni autoriza como auditor.
   */
  TESORERIA: [
    "inicio",
    "inicio.resumen",
    "tesoreria",
    "tesoreria.cuentas",
    "tesoreria.saldos",
    "proveedores",
    "proveedores.maestro",
    "proveedores.cxp",
    "proveedores.cxp.editar",
    "compras",
    "compras.sugeridos",
    "compras.solicitudes",
    "compras.solicitudes.pedir",
    "compras.solicitudes.facturar",
    "compras.proveedores",
    "solicitudes-pago",
    "solicitudes-pago.bandeja",
    "solicitudes-pago.aprobar",
    "solicitudes-pago.pagar",
    "gastos",
    "gastos.registro",
    "gastos.categorias",
    "documentos",
    "documentos.archivo",
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
    "gastos.categorias",
    "solicitudes-pago",
    "solicitudes-pago.bandeja",
    "solicitudes-pago.pagar",
    "compras",
    "compras.proveedores",
    "compras.solicitudes",
    // Contador: consulta de solicitudes/proveedores; sin editar inventario ni operar el flujo.
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

/** Claves guardadas cuando Inventario vivía bajo Compras → claves actuales. */
const LEGACY_PERMISSION_TO_CURRENT: Record<string, string> = {
  "compras.inventario": "inventario.maestro",
  "compras.inventario.minimo": "inventario.minimo",
  "compras.inventario-fisico": "inventario.fisico",
  "compras.inventario-fisico.ajustar": "inventario.fisico.ajustar",
};

/**
 * Mapea aliases legacy y descarta claves que ya no existen en el catálogo.
 * Usar al leer de DB y antes de guardar desde Configuración.
 */
export function normalizePermissionKeys(
  keys: readonly string[] | null | undefined,
): string[] {
  const out = new Set<string>();
  for (const raw of keys ?? []) {
    const key = LEGACY_PERMISSION_TO_CURRENT[raw] ?? raw;
    if (isValidPermissionKey(key)) out.add(key);
  }
  // Si hay submódulos de inventario, asegurar el módulo padre.
  for (const key of [...out]) {
    if (key.startsWith("inventario.")) out.add("inventario");
  }
  return [...out];
}

export function moduleKeyFromPath(pathname: string): string | null {
  const segment = pathname.split("/").filter(Boolean)[0];
  if (!segment) return null;
  const mod = APP_MODULES.find((m) => m.href === `/${segment}`);
  return mod?.key ?? null;
}

/**
 * Claves legacy (cuando inventario vivía bajo Compras) ↔ claves actuales.
 * Permite que permisos ya guardados en DB sigan funcionando.
 */
const PERMISSION_ALIASES: Record<string, readonly string[]> = {
  "inventario.maestro": ["compras.inventario"],
  "inventario.minimo": ["compras.inventario.minimo"],
  "inventario.fisico": ["compras.inventario-fisico"],
  "inventario.fisico.ajustar": ["compras.inventario-fisico.ajustar"],
  "compras.inventario": ["inventario.maestro"],
  "compras.inventario.minimo": ["inventario.minimo"],
  "compras.inventario-fisico": ["inventario.fisico"],
  "compras.inventario-fisico.ajustar": ["inventario.fisico.ajustar"],
};

export function hasPermission(
  granted: ReadonlySet<string> | readonly string[],
  key: string,
  opts?: { isSuperAdmin?: boolean },
): boolean {
  if (opts?.isSuperAdmin) return true;
  const set = granted instanceof Set ? granted : new Set(granted);
  if (set.has(key)) return true;
  for (const alias of PERMISSION_ALIASES[key] ?? []) {
    if (set.has(alias)) return true;
  }
  // Entrar al módulo: basta con cualquier submódulo concedido
  if (!key.includes(".")) {
    for (const g of set) {
      if (g.startsWith(`${key}.`)) return true;
    }
    // Legacy: módulo inventario si tenía permisos de inventario bajo compras
    if (key === "inventario") {
      for (const g of set) {
        if (g.startsWith("compras.inventario")) return true;
      }
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
