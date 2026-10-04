/** Tope de carga en carpeta del empleado (alineado con storage.buckets). */
export const MAX_EMPLOYEE_DOCUMENT_BYTES = 60 * 1024 * 1024;

/** Tipos de documento HR en carpeta del empleado */
export const EMPLOYEE_DOCUMENT_TYPES = [
  { value: "CONTRATO", label: "Contrato laboral" },
  { value: "OTROSI", label: "Otrosí / modificación contractual" },
  { value: "PERMISO_AUTORIZADO", label: "Permiso autorizado" },
  { value: "LLAMADO_ATENCION", label: "Llamado de atención" },
  { value: "CEDULA", label: "Cédula / documento de identidad" },
  { value: "HOJA_VIDA", label: "Hoja de vida" },
  { value: "AFILIACION_SS", label: "Afiliación seguridad social" },
  { value: "VACACIONES", label: "Soporte de vacaciones" },
  { value: "CERTIFICADO", label: "Certificado laboral / constancia" },
  { value: "OTRO", label: "Otro" },
] as const;

export type EmployeeDocumentType =
  (typeof EMPLOYEE_DOCUMENT_TYPES)[number]["value"];

export function employeeDocumentTypeLabel(value: string | null): string {
  const found = EMPLOYEE_DOCUMENT_TYPES.find((t) => t.value === value);
  return found?.label ?? value ?? "Documento";
}

/** Tipos de contrato que suelen llevar fecha de fin. */
export function contractRequiresEndDate(employmentType: string): boolean {
  return (
    employmentType === "TERMINO_FIJO" ||
    employmentType === "OBRA_LABOR" ||
    employmentType === "APRENDIZAJE" ||
    employmentType === "TEMPORAL" ||
    employmentType === "POR_TURNO"
  );
}

export function isIndefiniteContract(employmentType: string): boolean {
  return employmentType === "INDEFINIDO" || employmentType === "LABORAL";
}

/** Días hábiles aproximados entre dos fechas (lun–vie, sin festivos). */
export function countWeekdays(startIso: string, endIso: string): number {
  const start = new Date(`${startIso}T12:00:00Z`);
  const end = new Date(`${endIso}T12:00:00Z`);
  if (end < start) return 0;
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getUTCDay();
    if (dow !== 0 && dow !== 6) count += 1;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}
