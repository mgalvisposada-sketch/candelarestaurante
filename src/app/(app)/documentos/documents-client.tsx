"use client";

import { useState, useTransition } from "react";
import {
  getSignedDocumentUrlAction,
  registerDocumentAction,
  softDeleteDocumentAction,
} from "./actions";
import { formatDateCO } from "@/lib/dates";

export type DocumentRow = {
  id: string;
  name: string;
  document_type: string | null;
  file_size: number | null;
  mime_type: string | null;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
};

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2";

const ENTITY_TYPES = [
  "organization",
  "shareholder",
  "supplier",
  "accounts_payable_document",
  "loan",
  "employee",
  "contract",
  "tax_obligation",
  "bank_account",
  "handover",
  "other",
] as const;

function formatBytes(n: number | null) {
  if (n === null || n === undefined) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadDocumentForm() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-[var(--ink)] px-4 py-2.5 text-sm font-medium text-white"
      >
        Subir documento
      </button>
    );
  }

  return (
    <form
      className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-5"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await registerDocumentAction(fd);
          if (!r.ok) setError(r.error ?? "Error");
          else setOpen(false);
        });
      }}
    >
      <div className="flex justify-between">
        <h3 className="font-medium">Nuevo documento</h3>
        <button type="button" className="text-sm text-[var(--muted)]" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">Nombre</span>
          <input name="name" required className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Tipo</span>
          <input name="document_type" placeholder="Contrato, extracto…" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Entidad</span>
          <select name="entity_type" defaultValue="other" className={inputClass}>
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">ID entidad (opcional)</span>
          <input name="entity_id" placeholder="UUID" className={inputClass} />
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">Archivo</span>
          <input name="file" type="file" required accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx" className={inputClass} />
        </label>
      </div>
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm text-white disabled:opacity-60"
      >
        {pending ? "Subiendo…" : "Subir"}
      </button>
    </form>
  );
}

export function DocumentList({ documents }: { documents: DocumentRow[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      {documents.map((doc) => (
        <article
          key={doc.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-white px-4 py-3"
        >
          <div>
            <p className="font-medium">{doc.name}</p>
            <p className="text-sm text-[var(--muted)]">
              {doc.document_type || "Sin tipo"} · {doc.entity_type} · {formatBytes(doc.file_size)} ·{" "}
              {formatDateCO(doc.created_at.slice(0, 10))}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm"
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const r = await getSignedDocumentUrlAction(doc.id);
                  if (!r.ok || !r.url) setError(r.error ?? "No se pudo abrir");
                  else window.open(r.url, "_blank", "noopener,noreferrer");
                });
              }}
            >
              Abrir
            </button>
            <button
              type="button"
              disabled={pending}
              className="rounded-lg px-3 py-1.5 text-sm text-red-700"
              onClick={() => {
                if (!confirm("¿Eliminar este documento?")) return;
                startTransition(async () => {
                  await softDeleteDocumentAction(doc.id);
                });
              }}
            >
              Eliminar
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
