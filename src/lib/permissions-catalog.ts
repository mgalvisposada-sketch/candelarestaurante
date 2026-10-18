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
    key: "asistente",
    label: "Asistente",
    href: "/asistente",
    mvp: 1,
    submodules: [
      {
        key: "asistente.chat",
        label: "Chat del asistente",
        description:
          "Consultar y operar con el agente (KB + datos + acciones confirmadas).",
      },
    ],
  },
  {
    key: "empalme",
    label: "Checklist inicial",
    href: "/checklist-inicial",
    mvp: 1,
    submodules: [
      { key: "empalme.sesion", label: "Sesión de arranque" },
      { key: "empalme.items", label: "Ítems y verificación" },
      {
        key: "empalme.cerrar",
        label: "Cerrar checklist",
        description: "Congela el checklist de arranque (opcional)",
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
    key: "cierre-caja",
    label: "Cierre de caja",
    href: "/cierre-caja",
    mvp: 1,
    submodules: [
      {
        key: "cierre-caja.declarar",
        label: "Declarar cierre del día",
        description:
          "Admin del local: ventas en efectivo, adquirencia y transferencia/QR.",
      },
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
      {
        key: "tesoreria.caja",
        label: "Ver cierres / cola de aval",
        description: "Historial de cierres y contraste desde tesorería.",
      },
      {
        key: "tesoreria.caja.avalar",
        label: "Avalar cierre de caja",
        description:
          "Gerencia/tesorería: contrastar vs POS y acreditar saldos.",
      },
      {
        key: "tesoreria.pagos",
        label: "Historial de pagos",
        description:
          "Consulta y exportes para auditoría (socios, contador, externa).",
      },
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
      { key: "prestamos.contratos", label: "Registrar préstamos" },
      { key: "prestamos.movimientos", label: "Cargar en tesorería" },
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
      {
        key: "gastos.liquidacion-turno",
        label: "Liquidación de prestadores por turno",
      },
      {
        key: "gastos.liquidacion-propina",
        label: "Liquidación de propina",
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
        label: "Revisión de inventario físico",
        description:
          "Bandeja de auditoría: ver novedades y aplicar o rechazar categorías enviadas.",
      },
    ],
  },
  {
    key: "cocina",
    label: "Cocina",
    href: "/cocina",
    mvp: 2,
    submodules: [
      {
        key: "cocina.maestro",
        label: "Maestro (insumos, preparaciones, carta)",
        description: "Crear ítems de cocina que no se compran: insumos, preparaciones y productos de carta.",
      },
      {
        key: "cocina.produccion",
        label: "Producciones (merma y costeo)",
        description: "Convertir materia prima en insumos/preparaciones con merma y aprovechamiento.",
      },
      {
        key: "cocina.recetas",
        label: "Recetas (BOM)",
        description: "Definir componentes de preparaciones y productos de carta.",
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
          "Admin del local: arma borrador, marca urgencia y si sale efectivo de caja; al elegir proveedor ve crédito/prepago.",
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
      {
        key: "configuracion.usuarios",
        label: "Usuarios del sistema",
        description:
          "No se otorga por checkbox: requiere rol Super admin (CRUD de usuarios).",
      },
      { key: "configuracion.permisos", label: "Permisos por módulo" },
    ],
  },
];

export const ALL_PERMISSION_KEYS: string[] = APP_MODULES.flatMap((m) => [
  m.key,
  ...m.submodules.map((s) => s.key),
]);

const CHECKLIST_PERMISSION_KEYS = new Set([
  "empalme",
  "empalme.sesion",
  "empalme.items",
  "empalme.cerrar",
]);

const ALL_EXCEPT_CONFIG_ADMIN = ALL_PERMISSION_KEYS.filter(
  (k) =>
    k !== "configuracion" &&
    k !== "configuracion.usuarios" &&
    k !== "configuracion.permisos",
);

/** Operación diaria: sin checklist de arranque por defecto. */
const ALL_EXCEPT_CONFIG_AND_CHECKLIST = ALL_EXCEPT_CONFIG_ADMIN.filter(
  (k) => !CHECKLIST_PERMISSION_KEYS.has(k),
);

/** Defaults por rol cuando se crea un usuario (SUPER_ADMIN no necesita filas). */
export const ROLE_DEFAULT_PERMISSIONS: Record<AppRole, string[]> = {
  SUPER_ADMIN: [...ALL_PERMISSION_KEYS],
  // Gestión: puede ajustar permisos; checklist se otorga bajo demanda.
  GESTION: [
    ...ALL_EXCEPT_CONFIG_AND_CHECKLIST,
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
    "cocina",
    "cocina.maestro",
    "cocina.produccion",
    "cocina.recetas",
    "compras",
    "compras.sugeridos",
    "compras.solicitudes",
    "compras.solicitudes.crear",
    "compras.solicitudes.pedir",
    "compras.solicitudes.recibir",
    "compras.solicitudes.recibir.extras",
    "cierre-caja",
    "cierre-caja.declarar",
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
    "tesoreria.caja",
    "tesoreria.caja.avalar",
    "tesoreria.pagos",
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
    "tesoreria",
    "tesoreria.pagos",
    "documentos",
    "documentos.archivo",
  ],
  CONTADOR: [
    "inicio",
    "inicio.resumen",
    "tesoreria",
    "tesoreria.cuentas",
    "tesoreria.saldos",
    "tesoreria.caja",
    "tesoreria.pagos",
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

/**
 * Techo duro por rol: no se pueden otorgar (ni hacer efectivas) claves fuera de este set.
 * Invariante: ROLE_DEFAULT_PERMISSIONS[role] ⊆ ROLE_PERMISSION_CEILING[role].
 * `configuracion.usuarios` no entra en ningún techo: el CRUD es solo rol SUPER_ADMIN.
 */
export const ROLE_PERMISSION_CEILING: Record<AppRole, string[]> = {
  SUPER_ADMIN: [...ALL_PERMISSION_KEYS],
  GESTION: ALL_PERMISSION_KEYS.filter((k) => k !== "configuracion.usuarios"),
  ADMIN_LOCAL: [
    ...ROLE_DEFAULT_PERMISSIONS.ADMIN_LOCAL,
    "inicio",
    "inicio.resumen",
    "documentos",
    "documentos.archivo",
  ],
  TESORERIA: [
    ...ROLE_DEFAULT_PERMISSIONS.TESORERIA,
    "proveedores.crear",
    "proveedores.editar",
    "proveedores.categorias",
  ],
  SOCIO: [...ROLE_DEFAULT_PERMISSIONS.SOCIO],
  CONTADOR: [...ROLE_DEFAULT_PERMISSIONS.CONTADOR],
  LECTURA: [...ROLE_DEFAULT_PERMISSIONS.LECTURA],
};

/** Claves que no se otorgan por checkbox (requieren rol Super admin). */
export const NON_GRANTABLE_PERMISSION_KEYS = new Set([
  "configuracion.usuarios",
]);

export function rolePermissionCeilingSet(role: AppRole): Set<string> {
  return new Set(ROLE_PERMISSION_CEILING[role] ?? []);
}

/**
 * Recorta claves al techo del rol (tras normalizar).
 * SUPER_ADMIN no se edita; devolver todas las válidas normalizadas.
 */
export function clampPermissionKeysToRole(
  role: AppRole | null | undefined,
  keys: readonly string[] | null | undefined,
): string[] {
  const normalized = normalizePermissionKeys(keys);
  if (!role || role === "SUPER_ADMIN") return normalized;
  const ceiling = rolePermissionCeilingSet(role);
  return normalized.filter((k) => ceiling.has(k));
}

export function isPermissionAllowedForRole(
  role: AppRole | null | undefined,
  key: string,
): boolean {
  if (!role || role === "SUPER_ADMIN") return isValidPermissionKey(key);
  if (NON_GRANTABLE_PERMISSION_KEYS.has(key)) return false;
  return rolePermissionCeilingSet(role).has(key);
}

export function isValidPermissionKey(key: string): boolean {
  return ALL_PERMISSION_KEYS.includes(key);
}

/** Claves guardadas cuando Inventario vivía bajo Compras → claves actuales. */
const LEGACY_PERMISSION_TO_CURRENT: Record<string, string> = {
  "compras.inventario": "inventario.maestro",
  "compras.inventario.minimo": "inventario.minimo",
  "compras.inventario-fisico": "inventario.fisico",
  "compras.inventario-fisico.ajustar": "inventario.fisico.ajustar",
  "tesoreria.caja.declarar": "cierre-caja.declarar",
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
    if (key.startsWith("cierre-caja.")) out.add("cierre-caja");
  }
  return [...out];
}

export function moduleKeyFromPath(pathname: string): string | null {
  const segment = pathname.split("/").filter(Boolean)[0];
  if (!segment) return null;
  // Alias legacy: /empalme → checklist inicial
  if (segment === "empalme") return "empalme";
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
  "cierre-caja.declarar": ["tesoreria.caja.declarar"],
  "cierre-caja": ["tesoreria.caja.declarar", "cierre-caja.declarar"],
  "tesoreria.caja.declarar": ["cierre-caja.declarar"],
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
