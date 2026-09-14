"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  closeHandoverAction,
  createHandoverItemAction,
  createHandoverSessionAction,
  seedMissingHandoverDefaultsAction,
  softDeleteHandoverItemAction,
  updateHandoverItemAction,
  updateHandoverSessionAction,
} from "./actions";
import { Badge } from "@/components/ui/primitives";
import { formatCOP } from "@/lib/money";
import { formatDateCO } from "@/lib/dates";
import {
  HANDOVER_DOMAINS,
  domainLabel,
  domainMeta,
  itemAnswerHint,
  itemAnswerMode,
  itemAsk,
  itemExpect,
  sanitizeItemComments,
  verificationHint,
  verificationLabel,
} from "@/lib/handover-catalog";
import {
  breakdownNamePlaceholder,
  buildHandoverItemMetadata,
  readHandoverItemMetadata,
  sumHandoverBreakdownLines,
  type HandoverBreakdownLine,
} from "@/lib/handover";
import type { VerificationStatus } from "@/types/domain";
import { cn } from "@/lib/utils";

export type HandoverSession = {
  id: string;
  cutoff_date: string;
  status: string;
  delivered_by_name: string | null;
  received_by_name: string | null;
  notes: string | null;
  closing_notes: string | null;
  pct_confirmed: number | null;
  pct_declared: number | null;
  pct_pending: number | null;
  closed_at: string | null;
};

export type HandoverItem = {
  id: string;
  domain: string;
  item_key: string;
  label: string;
  amount: number | string | null;
  verification_status: VerificationStatus;
  comments: string | null;
  source: string | null;
  metadata?: unknown;
};

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2";

function newBreakdownLine(): HandoverBreakdownLine {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `line_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    amount: null,
    note: "",
  };
}

function statusTone(status: VerificationStatus) {
  if (status === "CONFIRMADO") return "ok" as const;
  if (status === "DECLARADO") return "warn" as const;
  return "danger" as const;
}

function domainProgress(items: HandoverItem[]) {
  const reviewed = items.filter((i) => i.verification_status !== "PENDIENTE")
    .length;
  return { reviewed, total: items.length };
}

const STATUS_OPTIONS: Array<{
  value: VerificationStatus;
  label: string;
  hint: string;
}> = [
  {
    value: "PENDIENTE",
    label: "Aún no",
    hint: "Todavía no lo revisamos",
  },
  {
    value: "DECLARADO",
    label: "Me lo dijeron",
    hint: "Hay cifra, pero sin prueba",
  },
  {
    value: "CONFIRMADO",
    label: "Lo vi / tengo prueba",
    hint: "Hay extracto, factura u otro soporte",
  },
];

function StatusChooser({
  value,
  onChange,
  name = "verification_status",
}: {
  value: VerificationStatus;
  onChange: (next: VerificationStatus) => void;
  name?: string;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-medium text-[var(--ink)]">
        ¿Cómo quedó esta respuesta?
      </legend>
      <input type="hidden" name={name} value={value} />
      <div className="grid gap-2 sm:grid-cols-3">
        {STATUS_OPTIONS.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={cn(
                "rounded-lg border px-3 py-2.5 text-left transition",
                active
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                  : "border-[var(--line)] bg-white hover:border-[var(--accent)]/40",
              )}
            >
              <span className="block text-sm font-semibold">{option.label}</span>
              <span className="mt-0.5 block text-xs text-[var(--muted)]">
                {option.hint}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function CreateHandoverForm({
  defaultCutoff,
}: {
  defaultCutoff: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-5"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const result = await createHandoverSessionAction(fd);
          if (!result.ok) setError(result.error ?? "Error");
        });
      }}
    >
      <div className="space-y-2 text-sm leading-relaxed text-[var(--muted)]">
        <p>
          Imagina que te sientas con el administrador anterior y le preguntas,
          punto por punto:{" "}
          <strong className="font-medium text-[var(--ink)]">
            ¿qué plata hay, qué se debe, qué papeles entrega?
          </strong>
        </p>
        <p>
          Esta pantalla es esa reunión. Al final se congela como acta del día 1.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">
            ¿Hasta qué fecha responde la administración anterior? *
          </span>
          <input
            type="date"
            name="cutoff_date"
            required
            defaultValue={defaultCutoff ?? ""}
            className={inputClass}
          />
        </label>
        <div className="hidden md:block" />
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">
            Nombre de quien entrega
          </span>
          <input
            name="delivered_by_name"
            placeholder="Administrador anterior"
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">
            Nombre de quien recibe
          </span>
          <input
            name="received_by_name"
            placeholder="Nueva administración"
            className={inputClass}
          />
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">
            Notas de la reunión (opcional)
          </span>
          <textarea
            name="notes"
            rows={3}
            placeholder="Ej. Nos reunimos en el local; faltan extractos del banco X…"
            className={inputClass}
          />
        </label>
      </div>
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
      >
        {pending ? "Preparando…" : "Empezar la entrega"}
      </button>
    </form>
  );
}

export function SessionMetaForm({ session }: { session: HandoverSession }) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const readOnly = session.status === "CERRADO";

  if (readOnly) {
    return (
      <div className="grid gap-3 text-sm md:grid-cols-2">
        <div>
          <span className="text-[var(--muted)]">Entrega:</span>{" "}
          {session.delivered_by_name || "—"}
        </div>
        <div>
          <span className="text-[var(--muted)]">Recibe:</span>{" "}
          {session.received_by_name || "—"}
        </div>
        <div className="md:col-span-2">
          <span className="text-[var(--muted)]">Notas:</span>{" "}
          {session.notes || "—"}
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-3"
      action={(fd) => {
        setError(null);
        setSaved(false);
        startTransition(async () => {
          const result = await updateHandoverSessionAction(session.id, fd);
          if (!result.ok) setError(result.error ?? "Error");
          else setSaved(true);
        });
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Fecha de corte</span>
          <input
            type="date"
            name="cutoff_date"
            required
            defaultValue={session.cutoff_date}
            className={inputClass}
          />
        </label>
        <div />
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Quién entrega</span>
          <input
            name="delivered_by_name"
            defaultValue={session.delivered_by_name ?? ""}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Quién recibe</span>
          <input
            name="received_by_name"
            defaultValue={session.received_by_name ?? ""}
            className={inputClass}
          />
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">
            Notas de la reunión
          </span>
          <textarea
            name="notes"
            rows={2}
            defaultValue={session.notes ?? ""}
            className={inputClass}
          />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
        >
          {pending ? "Guardando…" : "Guardar"}
        </button>
        {saved ? (
          <span className="text-xs text-emerald-700">Guardado</span>
        ) : null}
        {error ? <span className="text-xs text-red-700">{error}</span> : null}
      </div>
    </form>
  );
}

export function HandoverItemCard({
  item,
  readOnly,
}: {
  item: HandoverItem;
  readOnly: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<VerificationStatus>(
    item.verification_status,
  );
  const mode = itemAnswerMode(item.item_key);
  const prefersList = mode === "list" || mode === "docs";
  const initialLines = readHandoverItemMetadata(item.metadata).lines;
  const [lines, setLines] = useState<HandoverBreakdownLine[]>(() =>
    prefersList && initialLines.length === 0
      ? [newBreakdownLine()]
      : initialLines,
  );
  const linesSum = sumHandoverBreakdownLines(lines);
  const namePlaceholder =
    mode === "docs"
      ? "Ej. RUT, Cámara de Comercio, estatutos"
      : breakdownNamePlaceholder(item.domain);
  const ask = itemAsk(item.item_key, item.label);
  const expect = itemExpect(item.item_key);
  const answerHint = itemAnswerHint(item.item_key);
  const cleanComments = sanitizeItemComments(item.item_key, item.comments);
  const amountLabel =
    mode === "confirm"
      ? "Total que entregan el día 1 (COP)"
      : mode === "docs"
        ? "Monto (casi siempre 0)"
        : prefersList
          ? "Total (suma de la lista)"
          : "Monto de la respuesta (COP)";

  function renderLinesEditor() {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-[var(--ink)]">
              {mode === "docs"
                ? "Lista de documentos"
                : prefersList
                  ? "Tu respuesta: la lista"
                  : "Detalle opcional"}
            </p>
            <p className="text-xs text-[var(--muted)]">
              {mode === "docs"
                ? "Un renglón por documento. El monto puede ir en 0."
                : prefersList
                  ? "Un renglón por cuenta, persona o concepto. Ese es el corazón de la respuesta."
                  : "Solo si quieres desglosar el monto."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLines((prev) => [...prev, newBreakdownLine()])}
            className="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs font-semibold"
          >
            + Agregar renglón
          </button>
        </div>
        <div className="space-y-2">
          {lines.map((line, index) => (
            <div
              key={line.id}
              className="grid gap-2 border border-[var(--line)] bg-[var(--bg)]/40 p-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)_auto]"
            >
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-[var(--muted)]">
                  {mode === "docs" ? "Documento" : "Quién / qué"}
                </span>
                <input
                  value={line.name}
                  onChange={(e) => {
                    const value = e.target.value;
                    setLines((prev) =>
                      prev.map((row, i) =>
                        i === index ? { ...row, name: value } : row,
                      ),
                    );
                  }}
                  placeholder={namePlaceholder}
                  className={inputClass}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-[var(--muted)]">
                  {mode === "docs" ? "Valor (opc.)" : "Cuánto"}
                </span>
                <input
                  value={line.amount != null ? String(line.amount) : ""}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    const amount =
                      raw === "" ? null : Number(raw.replace(/,/g, ""));
                    setLines((prev) =>
                      prev.map((row, i) =>
                        i === index
                          ? {
                              ...row,
                              amount: Number.isNaN(amount as number)
                                ? null
                                : amount,
                            }
                          : row,
                      ),
                    );
                  }}
                  placeholder={mode === "docs" ? "0" : "COP"}
                  className={inputClass}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-[var(--muted)]">
                  Nota corta
                </span>
                <input
                  value={line.note ?? ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    setLines((prev) =>
                      prev.map((row, i) =>
                        i === index ? { ...row, note: value } : row,
                      ),
                    );
                  }}
                  placeholder="Opcional"
                  className={inputClass}
                />
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() =>
                    setLines((prev) => prev.filter((_, i) => i !== index))
                  }
                  className="rounded-md border border-red-200 px-2.5 py-2 text-xs font-medium text-red-700"
                >
                  Quitar
                </button>
              </div>
            </div>
          ))}
        </div>
        {linesSum != null ? (
          <p className="text-xs text-[var(--muted)]">
            Suma de la lista:{" "}
            <span className="font-semibold text-[var(--ink)]">
              {formatCOP(linesSum)}
            </span>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="border border-[var(--line)] bg-white p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 max-w-2xl space-y-1">
          <p className="font-display text-base font-bold tracking-tight">
            {ask}
          </p>
          {expect ? (
            <p className="text-sm text-[var(--muted)]">
              Cómo responder: {expect}
            </p>
          ) : null}
          {answerHint ? (
            <p className="rounded-md bg-[var(--accent-soft)] px-2.5 py-1.5 text-xs text-[var(--accent)]">
              {answerHint}
            </p>
          ) : null}
        </div>
        <Badge tone={statusTone(status)}>{verificationLabel(status)}</Badge>
      </div>

      {readOnly ? (
        <div className="space-y-3 text-sm text-[var(--muted)]">
          <p>
            Estado:{" "}
            <span className="font-medium text-[var(--ink)]">
              {verificationLabel(item.verification_status)}
            </span>
            <span className="block text-xs">
              {verificationHint(item.verification_status)}
            </span>
          </p>
          <p>
            Monto:{" "}
            <span className="font-medium text-[var(--ink)]">
              {item.amount != null ? formatCOP(item.amount) : "—"}
            </span>
          </p>
          {initialLines.length > 0 ? (
            <div className="overflow-x-auto border border-[var(--line)]">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead className="bg-[var(--bg)] text-xs uppercase tracking-wide text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Detalle</th>
                    <th className="px-3 py-2 font-medium">Monto</th>
                    <th className="px-3 py-2 font-medium">Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {initialLines.map((line) => (
                    <tr key={line.id} className="border-t border-[var(--line)]">
                      <td className="px-3 py-2 text-[var(--ink)]">{line.name}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {line.amount != null ? formatCOP(line.amount) : "—"}
                      </td>
                      <td className="px-3 py-2">{line.note || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <p>De dónde salió: {item.source || "—"}</p>
          <p>Notas: {cleanComments || "—"}</p>
        </div>
      ) : (
        <form
          className="space-y-4"
          action={(fd) => {
            setError(null);
            setSaved(false);
            const cleaned = lines
              .map((line) => ({
                ...line,
                name: line.name.trim(),
                note: line.note?.trim() || undefined,
              }))
              .filter((line) => line.name.length > 0);
            fd.set(
              "metadata_json",
              JSON.stringify(buildHandoverItemMetadata(cleaned)),
            );
            startTransition(async () => {
              const result = await updateHandoverItemAction(item.id, fd);
              if (!result.ok) setError(result.error ?? "Error");
              else {
                setLines(
                  cleaned.length > 0
                    ? cleaned
                    : prefersList
                      ? [newBreakdownLine()]
                      : [],
                );
                setSaved(true);
              }
            });
          }}
        >
          <input type="hidden" name="label" value={item.label} />
          <input type="hidden" name="domain" value={item.domain} />
          <input type="hidden" name="item_key" value={item.item_key} />

          {prefersList ? renderLinesEditor() : null}

          {!prefersList ? (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-[var(--ink)]">
                {amountLabel}
              </span>
              <input
                name="amount"
                defaultValue={item.amount != null ? String(item.amount) : ""}
                placeholder={
                  mode === "confirm"
                    ? "Suma esperada de bancos + caja + pasarelas…"
                    : "Escribe el monto"
                }
                className={inputClass}
              />
            </label>
          ) : linesSum != null ? (
            <>
              <input type="hidden" name="amount" value={String(linesSum)} />
              <p className="text-sm text-[var(--muted)]">
                {amountLabel}:{" "}
                <span className="font-semibold text-[var(--ink)]">
                  {formatCOP(linesSum)}
                </span>
              </p>
            </>
          ) : (
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--muted)]">{amountLabel}</span>
              <input
                name="amount"
                defaultValue={item.amount != null ? String(item.amount) : ""}
                placeholder="Se llena solo cuando agregues montos arriba"
                className={inputClass}
              />
            </label>
          )}

          {mode === "single" ? renderLinesEditor() : null}

          <StatusChooser value={status} onChange={setStatus} />

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--muted)]">
                ¿De dónde salió esta respuesta?
              </span>
              <input
                name="source"
                defaultValue={item.source ?? ""}
                placeholder="Extracto, conteo físico, Excel, WhatsApp…"
                className={inputClass}
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="mb-1 block text-[var(--muted)]">
                Notas de la reunión (opcional)
              </span>
              <textarea
                name="comments"
                rows={2}
                defaultValue={cleanComments}
                placeholder="Solo lo que dijo el administrador anterior… no copies la guía"
                className={inputClass}
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            >
              {pending ? "…" : "Guardar esta respuesta"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!confirm("¿Quitar esta pregunta del acta?")) return;
                startTransition(async () => {
                  const result = await softDeleteHandoverItemAction(item.id);
                  if (!result.ok) setError(result.error ?? "Error");
                });
              }}
              className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700"
            >
              Quitar pregunta
            </button>
            {saved ? (
              <span className="text-xs text-emerald-700">Guardado</span>
            ) : null}
            {error ? <span className="text-xs text-red-700">{error}</span> : null}
          </div>
        </form>
      )}
    </div>
  );
}

export function AddHandoverItemForm({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<VerificationStatus>("PENDIENTE");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full border border-dashed border-[var(--line)] px-4 py-3 text-left text-sm font-medium text-[var(--ink)] transition hover:border-[var(--accent)]/40 hover:bg-white"
      >
        + Agregar otra pregunta que salió en la reunión
      </button>
    );
  }

  return (
    <form
      className="space-y-3 border border-[var(--line)] bg-white p-4"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const result = await createHandoverItemAction(sessionId, fd);
          if (!result.ok) setError(result.error ?? "Error");
          else setOpen(false);
        });
      }}
    >
      <div className="flex items-center justify-between">
        <h4 className="font-medium">Pregunta adicional</h4>
        <button
          type="button"
          className="text-sm text-[var(--muted)]"
          onClick={() => setOpen(false)}
        >
          Cancelar
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm md:col-span-2">
          <span className="mb-1 block text-[var(--muted)]">
            ¿Qué pregunta quieres agregar? *
          </span>
          <input
            name="label"
            required
            className={inputClass}
            placeholder="Ej. Anticipos ya pagados a proveedores"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-[var(--muted)]">Tema *</span>
          <select name="domain" defaultValue="otros" className={inputClass}>
            {HANDOVER_DOMAINS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-[var(--muted)]">Monto (COP)</span>
          <input name="amount" className={inputClass} placeholder="Opcional" />
        </label>
        <div className="md:col-span-2">
          <StatusChooser value={status} onChange={setStatus} />
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-[var(--muted)]">De dónde salió</span>
          <input name="source" className={inputClass} />
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1 block text-[var(--muted)]">Notas</span>
          <textarea name="comments" rows={2} className={inputClass} />
        </label>
      </div>
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Guardando…" : "Agregar pregunta"}
      </button>
    </form>
  );
}

export function SeedDefaultsButton({ sessionId }: { sessionId: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            const result = await seedMissingHandoverDefaultsAction(sessionId);
            setMsg(
              result.ok
                ? "Listo: se agregaron las preguntas estándar que faltaban."
                : (result.error ?? "Error"),
            );
          });
        }}
        className="text-xs font-medium text-[var(--muted)] underline-offset-2 hover:text-[var(--ink)] hover:underline"
      >
        {pending ? "…" : "¿Faltan preguntas? Completar lista estándar"}
      </button>
      {msg ? <span className="text-xs text-[var(--muted)]">{msg}</span> : null}
    </div>
  );
}

export function HandoverDomainSections({
  items,
  readOnly,
}: {
  items: HandoverItem[];
  readOnly: boolean;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, HandoverItem[]>();
    for (const item of items) {
      const list = map.get(item.domain) ?? [];
      list.push(item);
      map.set(item.domain, list);
    }
    const ordered = HANDOVER_DOMAINS.map((d) => d.value).filter((d) =>
      map.has(d),
    );
    const extras = [...map.keys()].filter((d) => !ordered.includes(d as never));
    return [...ordered, ...extras].map((domain) => ({
      domain,
      items: map.get(domain) ?? [],
    }));
  }, [items]);

  const firstIncomplete =
    grouped.find((g) =>
      g.items.some((i) => i.verification_status === "PENDIENTE"),
    )?.domain ?? grouped[0]?.domain;

  const [openDomain, setOpenDomain] = useState<string | null>(
    firstIncomplete ?? null,
  );

  return (
    <div className="space-y-3">
      {grouped.map((group, index) => {
        const meta = domainMeta(group.domain);
        const { reviewed, total } = domainProgress(group.items);
        const open = openDomain === group.domain;
        const done = reviewed === total && total > 0;

        return (
          <section
            key={group.domain}
            className="overflow-hidden border border-[var(--line)] bg-[var(--surface)]"
          >
            <button
              type="button"
              onClick={() =>
                setOpenDomain((current) =>
                  current === group.domain ? null : group.domain,
                )
              }
              className="flex w-full items-start justify-between gap-4 px-4 py-4 text-left transition hover:bg-black/[0.02]"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
                    Bloque {index + 1}
                  </span>
                  {done ? <Badge tone="ok">Listo</Badge> : null}
                </div>
                <h3 className="mt-1 font-display text-lg font-bold tracking-tight">
                  {domainLabel(group.domain)}
                </h3>
                {meta && "ask" in meta ? (
                  <p className="mt-1 text-sm font-medium text-[var(--ink)]">
                    {meta.ask}
                  </p>
                ) : null}
                {meta && "expect" in meta && meta.expect ? (
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Qué deberías recibir: {meta.expect}
                  </p>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums">
                  {reviewed}/{total}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  {done ? "Completo" : open ? "Cerrar" : "Abrir"}
                </p>
              </div>
            </button>

            {open ? (
              <div className="space-y-3 border-t border-[var(--line)] px-4 py-4">
                {meta && "href" in meta && meta.href ? (
                  <p className="text-sm text-[var(--muted)]">
                    Si quieres el detalle operativo:{" "}
                    <Link
                      href={meta.href}
                      className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
                    >
                      {"hrefLabel" in meta && meta.hrefLabel
                        ? meta.hrefLabel
                        : "Abrir módulo"}
                    </Link>
                  </p>
                ) : null}
                <div className="grid gap-3">
                  {group.items.map((item) => (
                    <HandoverItemCard
                      key={item.id}
                      item={item}
                      readOnly={readOnly}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

export function CloseHandoverForm({
  session,
  pendingCount,
  summaryLines,
}: {
  session: HandoverSession;
  pendingCount: number;
  summaryLines: Array<{ label: string; amount: string }>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (session.status === "CERRADO") {
    return (
      <div className="space-y-3 border border-emerald-200 bg-emerald-50 px-5 py-5 text-sm text-emerald-950">
        <p className="font-display text-lg font-bold">Entrega cerrada</p>
        <p>
          Quedó congelada el {formatDateCO(session.closed_at)}. Esta es la foto
          oficial del día 1 de la nueva administración.
        </p>
        {session.closing_notes ? (
          <p>Notas finales: {session.closing_notes}</p>
        ) : null}
      </div>
    );
  }

  return (
    <form
      className="space-y-4 border border-[var(--line)] bg-white p-5"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const result = await closeHandoverAction(session.id, fd);
          if (!result.ok) setError(result.error ?? "Error al cerrar");
        });
      }}
    >
      <div>
        <h3 className="font-display text-lg font-bold tracking-tight">
          Cerrar y congelar el acta
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
          Cuando terminen la reunión, cierren aquí. No hace falta tener todo
          perfecto
          {pendingCount > 0
            ? `: aún hay ${pendingCount} sin revisar y pueden quedar como pendientes`
            : ""}
          .
        </p>
      </div>

      {summaryLines.length > 0 ? (
        <div className="bg-[var(--bg)] px-3 py-3 text-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            Resumen de montos capturados
          </p>
          <ul className="space-y-1">
            {summaryLines.map((line) => (
              <li key={line.label} className="flex justify-between gap-3">
                <span>{line.label}</span>
                <span className="font-medium">{line.amount}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <textarea
        name="closing_notes"
        rows={3}
        placeholder="Pendientes aceptados, próximos pasos, acuerdos verbales…"
        className={inputClass}
      />
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
      >
        {pending ? "Cerrando…" : "Cerrar acta de entrega"}
      </button>
    </form>
  );
}

export function EmpalmeSteps({ current }: { current: 1 | 2 | 3 }) {
  const steps = [
    { n: 1 as const, label: "Quiénes y fecha" },
    { n: 2 as const, label: "Hacer las preguntas" },
    { n: 3 as const, label: "Cerrar el acta" },
  ];

  return (
    <ol className="grid gap-2 md:grid-cols-3">
      {steps.map((step) => {
        const active = step.n === current;
        const done = step.n < current;
        return (
          <li
            key={step.n}
            className={cn(
              "border px-4 py-3",
              active && "border-[var(--accent)] bg-[var(--accent-soft)]",
              done && "border-[var(--line)] bg-white",
              !active &&
                !done &&
                "border-[var(--line)] bg-transparent opacity-60",
            )}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
              Paso {step.n}
            </p>
            <p className="mt-1 text-sm font-semibold">{step.label}</p>
          </li>
        );
      })}
    </ol>
  );
}
