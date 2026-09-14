export type AppRole =
  | "SUPER_ADMIN"
  | "GESTION"
  | "SOCIO"
  | "CONTADOR"
  | "LECTURA";

export type VerificationStatus = "CONFIRMADO" | "DECLARADO" | "PENDIENTE";

export const NAV_ITEMS = [
  { href: "/inicio", label: "Inicio", mvp: 1 },
  { href: "/empalme", label: "Empalme", mvp: 1 },
  { href: "/empresa", label: "Empresa", mvp: 1 },
  { href: "/socios", label: "Socios", mvp: 1 },
  { href: "/tesoreria", label: "Tesorería", mvp: 1 },
  { href: "/proveedores", label: "Proveedores & CxP", mvp: 1 },
  { href: "/prestamos", label: "Préstamos", mvp: 1 },
  { href: "/capital", label: "Capital", mvp: 1 },
  { href: "/gastos", label: "Gastos", mvp: 2 },
  { href: "/presupuesto", label: "Presupuesto", mvp: 2 },
  { href: "/personal", label: "Personal", mvp: 3 },
  { href: "/tributario", label: "Tributario", mvp: 3 },
  { href: "/contratos", label: "Contratos", mvp: 3 },
  { href: "/documentos", label: "Documentos", mvp: 1 },
  { href: "/reportes", label: "Reportes", mvp: 4 },
  { href: "/configuracion", label: "Configuración", mvp: 1 },
] as const;

export const WRITE_ROLES: AppRole[] = ["SUPER_ADMIN", "GESTION"];

export function canWrite(role: AppRole | null | undefined): boolean {
  return !!role && WRITE_ROLES.includes(role);
}
