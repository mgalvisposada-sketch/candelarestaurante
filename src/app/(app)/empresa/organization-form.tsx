"use client";

import { useState, useTransition } from "react";
import {
  createOrganizationAction,
  updateOrganizationAction,
} from "./actions";
import type { OrganizationRow } from "@/lib/org-context";

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
  const [pending, startTransition] = useTransition();

  function valueFor(name: string): string {
    if (!organization) return "";
    const raw = organization[name as keyof OrganizationRow];
    return raw == null ? "" : String(raw);
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
      setSuccess(
        organization
          ? "Empresa actualizada correctamente."
          : "Empresa creada. Ya puedes continuar con el empalme.",
      );
    });
  }

  return (
    <form action={onSubmit} className="space-y-6">
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
              defaultValue={valueFor(field.name)}
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

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
      >
        {pending
          ? "Guardando…"
          : organization
            ? "Guardar cambios"
            : "Crear empresa"}
      </button>
    </form>
  );
}
