"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  createOrganizationAction,
  updateOrganizationAction,
} from "./actions";
import type { OrganizationRow } from "@/lib/org-context";
import {
  useDebouncedCallback,
  autosaveLabel,
  type AutosaveState,
} from "@/lib/autosave";

const fields: Array<{
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  span?: 1 | 2;
}> = [
  { name: "legal_name", label: "Razón social", required: true, span: 2 },
  { name: "trade_name", label: "Nombre comercial" },
  { name: "nit", label: "NIT" },
  { name: "dv", label: "DV" },
  { name: "company_type", label: "Tipo societario" },
  { name: "incorporation_date", label: "Fecha de constitución", type: "date" },
  { name: "commercial_registration", label: "Matrícula mercantil" },
  { name: "primary_ciiu", label: "CIIU principal" },
  { name: "legal_representative", label: "Representante legal", span: 2 },
  { name: "address", label: "Dirección", span: 2 },
  { name: "municipality", label: "Municipio" },
  { name: "department", label: "Departamento" },
  { name: "corporate_email", label: "Email corporativo", type: "email" },
  { name: "phone", label: "Teléfono" },
  {
    name: "administrative_cutoff_date",
    label: "Fecha de corte administrativa",
    type: "date",
    required: true,
  },
];

export function OrganizationForm({
  organization,
}: {
  organization: OrganizationRow | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [autosave, setAutosave] = useState<AutosaveState>("idle");
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const readyRef = useRef(false);

  const scheduleAutosave = useDebouncedCallback(() => {
    if (!organization || !formRef.current) return;
    const fd = new FormData(formRef.current);
    setAutosave("saving");
    setError(null);
    startTransition(async () => {
      const result = await updateOrganizationAction(organization.id, fd);
      if (!result.ok) {
        setError(result.error ?? "Error al guardar");
        setAutosave("error");
        return;
      }
      setAutosave("saved");
      setSuccess(null);
    });
  }, 800);

  useEffect(() => {
    readyRef.current = true;
  }, []);

  function onFieldChange() {
    if (!organization || !readyRef.current) return;
    setAutosave("dirty");
    scheduleAutosave();
  }

  function onSubmit(formData: FormData) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = organization
        ? await updateOrganizationAction(organization.id, formData)
        : await createOrganizationAction(formData);
      if (!result.ok) {
        setError(result.error ?? "Error al guardar");
        return;
      }
      setAutosave("saved");
      setSuccess(
        organization
          ? "Empresa actualizada. Puedes seguir editando cuando quieras."
          : "Empresa creada. Ya puedes continuar con el empalme.",
      );
    });
  }

  return (
    <form ref={formRef} action={onSubmit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        {fields.map((field) => (
          <label
            key={field.name}
            className={`block text-sm ${field.span === 2 ? "md:col-span-2" : ""}`}
          >
            <span className="mb-1.5 block text-[var(--muted)]">
              {field.label}
              {field.required ? " *" : ""}
            </span>
            <input
              name={field.name}
              type={field.type ?? "text"}
              required={field.required}
              defaultValue={
                organization
                  ? organization[field.name as keyof OrganizationRow] == null
                    ? ""
                    : String(organization[field.name as keyof OrganizationRow])
                  : ""
              }
              onChange={onFieldChange}
              className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 outline-none ring-[var(--accent)] focus:ring-2"
            />
          </label>
        ))}
      </div>

      <div className="rounded-lg border border-[var(--line)] bg-[var(--accent-soft)]/40 px-4 py-3 text-sm text-[var(--muted)]">
        Moneda: <strong className="text-[var(--ink)]">COP</strong> · Zona
        horaria: <strong className="text-[var(--ink)]">America/Bogota</strong>
      </div>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900">
          {success}
        </p>
      ) : null}
      {organization && autosaveLabel(autosave) ? (
        <p className="text-sm text-[var(--muted)]">{autosaveLabel(autosave)}</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
      >
        {pending
          ? "Guardando…"
          : organization
            ? "Guardar ahora"
            : "Crear empresa"}
      </button>
      {organization ? (
        <p className="text-xs text-[var(--muted)]">
          Autoguardado activo: lo que escribas se replica en el sistema para
          validación. Seguir editando después de guardar es normal.
        </p>
      ) : null}
    </form>
  );
}
