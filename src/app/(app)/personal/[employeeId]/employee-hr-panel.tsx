"use client";

import { useMemo, useState, useTransition } from "react";
import {
  createEmployeeVacationAction,
  prepareEmployeeDocumentUploadAction,
  registerEmployeeDocumentMetaAction,
  softDeleteEmployeeDocumentAction,
  softDeleteEmployeeVacationAction,
  updateEmployeeVacationStatusAction,
} from "../employee-hr-actions";
import { getSignedDocumentUrlAction } from "../../documentos/actions";
import { Badge } from "@/components/ui/primitives";
import { formatDateCO } from "@/lib/dates";
import { formatCOP } from "@/lib/money";
import {
  EMPLOYEE_DOCUMENT_TYPES,
  MAX_EMPLOYEE_DOCUMENT_BYTES,
  employeeDocumentTypeLabel,
  isIndefiniteContract,
} from "@/lib/hr-documents";
import {
  computeVacationEntitlement,
  type VacationWorkdays,
} from "@/lib/payroll/vacations";
import { createClient } from "@/lib/supabase/client";

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2";

export type EmployeeDocRow = {
  id: string;
  name: string;
  document_type: string | null;
  file_size: number | null;
  created_at: string;
};

export type VacationRow = {
  id: string;
  start_date: string;
  end_date: string;
  business_days: number | string;
  status: string;
  notes: string | null;
};

function formatBytes(n: number | null) {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function EmployeeDocumentsSection({
  employeeId,
  documents,
}: {
  employeeId: string;
  documents: EmployeeDocRow[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-5">
      <div>
        <h2 className="font-medium">Documentos del empleado</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Contratos, otrosíes, permisos autorizados, llamados de atención y demás
          soportes de la carpeta laboral.
        </p>
      </div>

      {documents.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Sin documentos cargados.</p>
      ) : (
        <ul className="space-y-2">
          {documents.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-2 text-sm"
            >
              <div>
                <p className="font-medium">{d.name}</p>
                <p className="text-[var(--muted)]">
                  {employeeDocumentTypeLabel(d.document_type)} ·{" "}
                  {formatDateCO(d.created_at)} · {formatBytes(d.file_size)}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="text-[var(--accent)]"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const r = await getSignedDocumentUrlAction(d.id);
                      if (r.ok && r.url) window.open(r.url, "_blank");
                      else setError(r.error ?? "No se pudo abrir");
                    });
                  }}
                >
                  Ver
                </button>
                <button
                  type="button"
                  className="text-red-700"
                  disabled={pending}
                  onClick={() => {
                    if (!confirm("¿Quitar documento de la carpeta?")) return;
                    startTransition(async () => {
                      await softDeleteEmployeeDocumentAction(d.id, employeeId);
                    });
                  }}
                >
                  Quitar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form
        className="grid gap-3 border-t border-[var(--line)] pt-4 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fd = new FormData(form);
          const name = String(fd.get("name") || "").trim();
          const documentType = String(fd.get("document_type") || "");
          const fileInput = form.elements.namedItem("file") as HTMLInputElement;
          const file = fileInput.files?.[0];
          setError(null);
          setOk(null);
          if (!file) {
            setError("Seleccione un archivo");
            return;
          }
          if (file.size > MAX_EMPLOYEE_DOCUMENT_BYTES) {
            setError("El archivo supera 60 MB");
            return;
          }
          startTransition(async () => {
            const prepared = await prepareEmployeeDocumentUploadAction({
              employeeId,
              fileName: file.name,
              fileSize: file.size,
            });
            if (!prepared.ok || !prepared.storagePath) {
              setError(prepared.error ?? "No se pudo preparar la carga");
              return;
            }

            const supabase = createClient();
            const { error: uploadError } = await supabase.storage
              .from("documents")
              .upload(prepared.storagePath, file, {
                contentType: file.type || "application/pdf",
                upsert: false,
              });
            if (uploadError) {
              setError(uploadError.message);
              return;
            }

            const registered = await registerEmployeeDocumentMetaAction({
              employeeId,
              name,
              document_type: documentType,
              storagePath: prepared.storagePath,
              fileSize: file.size,
              mimeType: file.type || "application/pdf",
            });
            if (!registered.ok) {
              setError(registered.error ?? "Error al registrar");
              return;
            }
            form.reset();
            setOk("Documento cargado");
          });
        }}
      >
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Nombre</span>
          <input name="name" required className={inputClass} placeholder="Ej. Contrato 2026" />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Tipo</span>
          <select name="document_type" defaultValue="CONTRATO" className={inputClass}>
            {EMPLOYEE_DOCUMENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">
            Archivo (máx. 60 MB)
          </span>
          <input
            name="file"
            type="file"
            required
            accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
            className={inputClass}
          />
        </label>
        {error ? <p className="text-sm text-red-700 md:col-span-2">{error}</p> : null}
        {ok ? <p className="text-sm text-emerald-800 md:col-span-2">{ok}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white md:col-span-2"
        >
          {pending ? "Subiendo…" : "Cargar documento"}
        </button>
      </form>
    </section>
  );
}

export function EmployeeVacationsSection({
  employeeId,
  vacations,
  hireDate,
  employmentType,
  contractEndDate,
  basicSalary,
  workdays,
}: {
  employeeId: string;
  vacations: VacationRow[];
  hireDate: string | null;
  employmentType: string;
  contractEndDate: string | null;
  basicSalary: number;
  workdays?: VacationWorkdays;
}) {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [formKey, setFormKey] = useState(0);
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  const [draftDays, setDraftDays] = useState("");

  const entitlement = useMemo(
    () =>
      computeVacationEntitlement({
        hireDate,
        employmentType,
        contractEndDate,
        basicSalary,
        vacations,
        workdays,
      }),
    [
      hireDate,
      employmentType,
      contractEndDate,
      basicSalary,
      vacations,
      workdays,
    ],
  );

  const indefinite = isIndefiniteContract(employmentType);

  function applySuggestion() {
    if (!entitlement.suggestion) return;
    setDraftStart(entitlement.suggestion.startDate);
    setDraftEnd(entitlement.suggestion.endDate);
    setDraftDays(String(entitlement.suggestion.businessDays));
    setFormKey((k) => k + 1);
  }

  return (
    <section className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-5">
      <div>
        <h2 className="font-medium">Vacaciones</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Art. 186 CST: 15 días hábiles por año de servicio, causados desde la
          fecha de ingreso
          {indefinite
            ? " (contrato indefinido: sin fecha de terminación)."
            : contractEndDate
              ? ` (causación hasta fin de contrato ${formatDateCO(contractEndDate)}).`
              : " (defina fin de contrato para cortar la causación)."}
        </p>
      </div>

      {!entitlement.applies ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {entitlement.reason ?? "No aplica cálculo de vacaciones."}
        </p>
      ) : (
        <div className="grid gap-3 rounded-lg border border-[var(--line)] bg-neutral-50 p-4 md:grid-cols-2">
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-[var(--muted)]">Ingreso: </span>
              {hireDate ? formatDateCO(hireDate) : "—"}
            </p>
            <p>
              <span className="text-[var(--muted)]">Años cumplidos: </span>
              {entitlement.yearsCompleted}
            </p>
            <p>
              <span className="text-[var(--muted)]">Días causados: </span>
              <span className="font-medium">{entitlement.earnedDays}</span>
              <span className="text-[var(--muted)]">
                {" "}
                ({entitlement.calendarDaysWorked} días calendario × 15/360)
              </span>
            </p>
            <p>
              <span className="text-[var(--muted)]">Usados / programados: </span>
              {entitlement.usedDays} ({entitlement.scheduledDays} en agenda)
            </p>
            <p>
              <span className="text-[var(--muted)]">Saldo disponible: </span>
              <span className="font-medium">{entitlement.availableDays} días</span>
            </p>
            {entitlement.nextAnniversary ? (
              <p>
                <span className="text-[var(--muted)]">Próximo aniversario: </span>
                {formatDateCO(entitlement.nextAnniversary)}
              </p>
            ) : null}
          </div>
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-[var(--muted)]">Valor si disfruta el saldo: </span>
              <span className="font-medium tabular-nums">
                {formatCOP(entitlement.availablePayEstimate)}
              </span>
            </p>
            <p>
              <span className="text-[var(--muted)]">
                Valor proporcional si se liquidara hoy:{" "}
              </span>
              <span className="font-medium tabular-nums">
                {formatCOP(entitlement.accruedPayIfSettled)}
              </span>
            </p>
            <p className="text-xs text-[var(--muted)]">
              Disfrute ≈ salario × días / 30 (art. 192). Liquidación ≈ salario ×
              días trabajados / 720. Sin festivos ni promedio de variable.
            </p>
          </div>

          {entitlement.suggestion ? (
            <div className="md:col-span-2 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3">
              <p className="text-sm font-medium text-emerald-950">
                Sugerencia de programación
              </p>
              <p className="text-sm text-emerald-950">
                {formatDateCO(entitlement.suggestion.startDate)} →{" "}
                {formatDateCO(entitlement.suggestion.endDate)} ·{" "}
                {entitlement.suggestion.businessDays} días hábiles ·{" "}
                <span className="font-medium tabular-nums">
                  {formatCOP(entitlement.suggestion.payEstimate)}
                </span>
              </p>
              <p className="text-xs text-emerald-900/80">
                {entitlement.suggestion.reason}
              </p>
              <button
                type="button"
                className="rounded-lg bg-emerald-900 px-3 py-1.5 text-sm text-white"
                onClick={applySuggestion}
              >
                Usar esta sugerencia en el formulario
              </button>
            </div>
          ) : null}
        </div>
      )}

      {vacations.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Sin vacaciones programadas.</p>
      ) : (
        <ul className="space-y-2">
          {vacations.map((v) => (
            <li
              key={v.id}
              className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--line)] pb-2 text-sm"
            >
              <div>
                <p className="font-medium">
                  {formatDateCO(v.start_date)} → {formatDateCO(v.end_date)}
                </p>
                <p className="text-[var(--muted)]">
                  {v.business_days} días hábiles
                  {basicSalary > 0
                    ? ` · ~${formatCOP((basicSalary * Number(v.business_days || 0)) / 30)}`
                    : ""}
                  {v.notes ? ` · ${v.notes}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  tone={
                    v.status === "DISFRUTADA"
                      ? "ok"
                      : v.status === "CANCELADA"
                        ? "neutral"
                        : v.status === "EN_CURSO"
                          ? "info"
                          : "warn"
                  }
                >
                  {v.status}
                </Badge>
                {v.status === "PROGRAMADA" ? (
                  <button
                    type="button"
                    className="text-sm text-[var(--accent)]"
                    disabled={pending}
                    onClick={() => {
                      startTransition(async () => {
                        await updateEmployeeVacationStatusAction(
                          v.id,
                          employeeId,
                          "EN_CURSO",
                        );
                      });
                    }}
                  >
                    Marcar en curso
                  </button>
                ) : null}
                {v.status === "EN_CURSO" || v.status === "PROGRAMADA" ? (
                  <button
                    type="button"
                    className="text-sm text-emerald-800"
                    disabled={pending}
                    onClick={() => {
                      startTransition(async () => {
                        await updateEmployeeVacationStatusAction(
                          v.id,
                          employeeId,
                          "DISFRUTADA",
                        );
                      });
                    }}
                  >
                    Disfrutada
                  </button>
                ) : null}
                {v.status !== "CANCELADA" ? (
                  <button
                    type="button"
                    className="text-sm text-red-700"
                    disabled={pending}
                    onClick={() => {
                      if (!confirm("¿Cancelar este periodo?")) return;
                      startTransition(async () => {
                        await softDeleteEmployeeVacationAction(v.id, employeeId);
                      });
                    }}
                  >
                    Cancelar
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <form
        key={formKey}
        className="grid gap-3 border-t border-[var(--line)] pt-4 md:grid-cols-2"
        action={(fd) => {
          fd.set("employee_id", employeeId);
          setError(null);
          setOk(null);
          startTransition(async () => {
            const r = await createEmployeeVacationAction(fd);
            if (!r.ok) setError(r.error ?? "Error");
            else {
              setOk("Vacaciones programadas");
              setDraftStart("");
              setDraftEnd("");
              setDraftDays("");
              setFormKey((k) => k + 1);
            }
          });
        }}
      >
        <input type="hidden" name="employee_id" value={employeeId} />
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Inicio</span>
          <input
            type="date"
            name="start_date"
            required
            defaultValue={draftStart}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Fin</span>
          <input
            type="date"
            name="end_date"
            required
            defaultValue={draftEnd}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">
            Días hábiles (opcional)
          </span>
          <input
            name="business_days"
            type="number"
            step="0.5"
            placeholder="Auto según jornada"
            defaultValue={draftDays}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Estado</span>
          <select name="status" defaultValue="PROGRAMADA" className={inputClass}>
            <option value="PROGRAMADA">Programada</option>
            <option value="EN_CURSO">En curso</option>
            <option value="DISFRUTADA">Disfrutada</option>
          </select>
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">Notas</span>
          <input name="notes" className={inputClass} placeholder="Ej. 1er periodo 2026" />
        </label>
        {error ? <p className="text-sm text-red-700 md:col-span-2">{error}</p> : null}
        {ok ? <p className="text-sm text-emerald-800 md:col-span-2">{ok}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white md:col-span-2"
        >
          Programar vacaciones
        </button>
      </form>
    </section>
  );
}
