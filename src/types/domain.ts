export type AppRole =
  | "SUPER_ADMIN"
  | "GESTION"
  | "ADMIN_LOCAL"
  | "SOCIO"
  | "CONTADOR"
  | "LECTURA";

export type VerificationStatus = "CONFIRMADO" | "DECLARADO" | "PENDIENTE";

export const NAV_ITEMS = [
  {
    href: "/inicio",
    label: "Inicio",
    mvp: 1,
    hint: "Resumen ejecutivo",
  },
  {
    href: "/empalme",
    label: "Empalme",
    mvp: 1,
    hint: "Cierre y entrega de turno",
  },
  {
    href: "/empresa",
    label: "Empresa",
    mvp: 1,
    hint: "Datos corporativos",
  },
  {
    href: "/socios",
    label: "Socios",
    mvp: 1,
    hint: "Maestro y cuentas de socios",
  },
  {
    href: "/tesoreria",
    label: "Tesorería",
    mvp: 1,
    hint: "Cuentas, caja y saldos",
  },
  {
    href: "/proveedores",
    label: "Proveedores & CxP",
    mvp: 1,
    hint: "Proveedores y cuentas por pagar",
  },
  {
    href: "/prestamos",
    label: "Préstamos",
    mvp: 1,
    hint: "Contratos y movimientos",
  },
  {
    href: "/capital",
    label: "Capital",
    mvp: 1,
    hint: "Movimientos de capital",
  },
  {
    href: "/gastos",
    label: "Gastos",
    mvp: 2,
    hint: "Registro de gastos",
  },
  {
    href: "/solicitudes-pago",
    label: "Solicitudes de pago",
    mvp: 2,
    hint: "Bandeja, aprobación y pago",
  },
  {
    href: "/compras",
    label: "Compras",
    mvp: 2,
    hint: "Inventario, proveedores y solicitudes",
  },
  {
    href: "/presupuesto",
    label: "Presupuesto",
    mvp: 2,
    hint: "Líneas presupuestales",
  },
  {
    href: "/personal",
    label: "Personal",
    mvp: 3,
    hint: "Empleados, novedades y liquidación",
  },
  {
    href: "/tributario",
    label: "Tributario",
    mvp: 3,
    hint: "Obligaciones fiscales",
  },
  {
    href: "/contratos",
    label: "Contratos",
    mvp: 3,
    hint: "Contratos y vencimientos",
  },
  {
    href: "/sst",
    label: "SST",
    mvp: 3,
    hint: "Seguridad y salud en el trabajo",
  },
  {
    href: "/documentos",
    label: "Documentos",
    mvp: 1,
    hint: "Archivo documental",
  },
  {
    href: "/reportes",
    label: "Reportes",
    mvp: 4,
    hint: "Consulta de reportes",
  },
  {
    href: "/configuracion",
    label: "Configuración",
    mvp: 1,
    hint: "Usuarios y permisos",
  },
] as const;

export type NavItem = (typeof NAV_ITEMS)[number];

/** Agrupación del menú raíz para escanear por dominio de negocio. */
export const NAV_GROUPS = [
  {
    id: "principal",
    label: "Principal",
    hrefs: ["/inicio", "/empalme"] as const,
  },
  {
    id: "caja",
    label: "Caja y pagos",
    hrefs: [
      "/tesoreria",
      "/gastos",
      "/solicitudes-pago",
      "/presupuesto",
    ] as const,
  },
  {
    id: "compras",
    label: "Compras y proveedores",
    hrefs: ["/proveedores", "/compras"] as const,
  },
  {
    id: "socios",
    label: "Socios y capital",
    hrefs: ["/socios", "/capital", "/prestamos"] as const,
  },
  {
    id: "equipo",
    label: "Equipo",
    hrefs: ["/personal"] as const,
  },
  {
    id: "cumplimiento",
    label: "Cumplimiento",
    hrefs: ["/tributario", "/contratos", "/sst", "/documentos"] as const,
  },
  {
    id: "sistema",
    label: "Sistema",
    hrefs: ["/empresa", "/reportes", "/configuracion"] as const,
  },
] as const;

export const WRITE_ROLES: AppRole[] = ["SUPER_ADMIN", "GESTION"];

export const ROLE_LABELS: Record<AppRole, string> = {
  SUPER_ADMIN: "Super admin",
  GESTION: "Gestión",
  ADMIN_LOCAL: "Admin del local",
  SOCIO: "Socio",
  CONTADOR: "Contador",
  LECTURA: "Solo lectura",
};

export function canWrite(role: AppRole | null | undefined): boolean {
  return !!role && WRITE_ROLES.includes(role);
}

export function isSuperAdmin(role: AppRole | null | undefined): boolean {
  return role === "SUPER_ADMIN";
}
