"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useRouter } from "next/navigation";
import {
  closeHandoverAction,
  createHandoverItemAction,
  createHandoverSessionAction,
  seedMissingHandoverDefaultsAction,
  cleanupObsoleteHandoverItemsAction,
  softDeleteHandoverItemAction,
  updateHandoverItemAction,
  updateHandoverSessionAction,
} from "./actions";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { formatCOP } from "@/lib/money";
import { formatDateCO } from "@/lib/dates";
import {
  HANDOVER_DOMAINS,
  domainLabel,
  domainMeta,
  itemAnswerHint,
  itemAnswerMode,
  itemAsk,
  itemExample,
  itemExpect,
  itemSeedLines,
  isObsoleteHandoverItem,
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
import {
  Check,
  ChevronDown,
  FileCheck2,
  Plus,
  Trash2,
} from "lucide-react";

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

export type QualitySummary = {
  total: number;
  confirmed: number;
  declared: number;
  pending: number;
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
  return "neutral" as const;
}

function domainProgress(items: HandoverItem[]) {
  const reviewed = items.filter((i) => i.verification_status !== "PENDIENTE")
    .length;
  return { reviewed, total: items.length };
}

function parseAmountDraft(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const amount = Number(trimmed.replace(/,/g, "").replace(/\s/g, ""));
  return Number.isNaN(amount) ? null : amount;
}

function formatAmountDraft(value: number | null | undefined): string {
  if (value == null) return "";
  return String(value);
}

const STATUS_OPTIONS: Array<{
  value: VerificationStatus;
  label: string;
  short: string;
  hint: string;
}> = [
  {
    value: "PENDIENTE",
    label: "Pendiente",
    short: "Pendiente",
    hint: "Aún no lo indagué · lo dejo para después",
  },
  {
    value: "DECLARADO",
    label: "Sin prueba",
    short: "Sin prueba",
    hint: "Me respondieron de palabra · queda en el acta",
  },
  {
    value: "CONFIRMADO",
    label: "Con prueba",
    short: "Con prueba",
    hint: "Vi extracto, factura, Excel u otro soporte",
  },
];

function seededBreakdownLines(itemKey: string): HandoverBreakdownLine[] {
  const names = itemSeedLines(itemKey);
  if (!names.length) return [newBreakdownLine()];
  return names.map((name) => ({
    ...newBreakdownLine(),
    name,
    // En checklists de docs el monto casi siempre es 0
    amount:
      itemAnswerMode(itemKey) === "docs" ||
      itemKey.startsWith("claridad_") ||
      itemKey === "informacion_solo_puente"
        ? 0
        : null,
  }));
}

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
      <legend className="text-sm font-medium text-[var(--ink)]">
        ¿Cómo dejas esta pregunta?
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
              aria-pressed={active}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-left transition",
                active
                  ? "border-[var(--ink)] bg-[var(--ink)] text-white"
                  : "border-[var(--line)] bg-white text-[var(--ink)] hover:border-[var(--ink)]/30",
              )}
            >
              <span className="block text-sm font-semibold">{option.label}</span>
              <span
                className={cn(
                  "mt-0.5 block text-[11px] leading-snug",
                  active ? "text-white/70" : "text-[var(--muted)]",
                )}
              >
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
          Esta pantalla es tu{" "}
          <strong className="font-medium text-[var(--ink)]">
            material de apoyo
          </strong>{" "}
          para indagar en la reunión: preguntas listas, desgloses y estados de
          calidad.
        </p>
        <p>
          Empieza por papeles e inventario; Holding, Publicidad y capital por
          socio vienen después. Si la respuesta viene a medias, márcala
          declarada y sigue.
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
      <Button type="submit" disabled={pending}>
        {pending ? "Preparando…" : "Empezar la entrega"}
      </Button>
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
        <Button type="submit" variant="secondary" disabled={pending} className="px-3 py-1.5 text-xs">
          {pending ? "Guardando…" : "Guardar"}
        </Button>
        {saved ? (
          <span className="text-xs text-emerald-700">Guardado</span>
        ) : null}
        {error ? <span className="text-xs text-red-700">{error}</span> : null}
      </div>
    </form>
  );
}

function BreakdownEditor({
  mode,
  lines,
  setLines,
  domain,
}: {
  mode: ReturnType<typeof itemAnswerMode>;
  lines: HandoverBreakdownLine[];
  setLines: Dispatch<SetStateAction<HandoverBreakdownLine[]>>;
  domain: string;
}) {
  const prefersList = mode === "list" || mode === "docs";
  const namePlaceholder =
    mode === "docs"
      ? "Ej. RUT, Cámara de Comercio, estatutos"
      : breakdownNamePlaceholder(domain);
  const linesSum = sumHandoverBreakdownLines(lines);

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
                ? "Un renglón por cuenta, persona o concepto."
                : "Solo si quieres desglosar el monto."}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="px-3 py-1.5 text-xs"
          onClick={() => setLines((prev) => [...prev, newBreakdownLine()])}
        >
          <Plus className="mr-1 size-3.5" />
          Renglón
        </Button>
      </div>
      <div className="space-y-2">
        {lines.map((line, index) => (
          <div
            key={line.id}
            className="grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--bg)]/50 p-2.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)_auto]"
          >
            <label className="block text-sm">
              <span className="mb-1 block text-[11px] text-[var(--muted)]">
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
              <span className="mb-1 block text-[11px] text-[var(--muted)]">
                {mode === "docs" ? "Valor (opc.)" : "Cuánto"}
              </span>
              <input
                inputMode="decimal"
                value={formatAmountDraft(line.amount)}
                onChange={(e) => {
                  const amount = parseAmountDraft(e.target.value);
                  setLines((prev) =>
                    prev.map((row, i) =>
                      i === index ? { ...row, amount } : row,
                    ),
                  );
                }}
                placeholder={mode === "docs" ? "0" : "COP"}
                className={cn(inputClass, "tabular-nums")}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[11px] text-[var(--muted)]">
                Nota
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
                placeholder={
                  mode === "docs" ? "entregado / falta / parcial" : "Opcional"
                }
                className={inputClass}
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                aria-label="Quitar renglón"
                onClick={() =>
                  setLines((prev) => prev.filter((_, i) => i !== index))
                }
                className="inline-flex size-9 items-center justify-center rounded-lg border border-red-200 text-red-700 transition hover:bg-red-50"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
      {linesSum != null ? (
        <p className="text-xs text-[var(--muted)]">
          Suma:{" "}
          <span className="font-semibold tabular-nums text-[var(--ink)]">
            {formatCOP(linesSum)}
          </span>
        </p>
      ) : null}
    </div>
  );
}

export function HandoverItemCard({
  item,
  readOnly,
  highlighted,
  expanded,
  onToggle,
  onSaveSuccess,
  onSkip,
}: {
  item: HandoverItem;
  readOnly: boolean;
  highlighted?: boolean;
  expanded: boolean;
  onToggle: () => void;
  onSaveSuccess?: () => void;
  onSkip?: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const advanceRef = useRef(false);
  const [status, setStatus] = useState<VerificationStatus>(
    item.verification_status,
  );
  const mode = itemAnswerMode(item.item_key);
  const prefersList = mode === "list" || mode === "docs";
  const initialLines = readHandoverItemMetadata(item.metadata).lines;
  const [lines, setLines] = useState<HandoverBreakdownLine[]>(() => {
    if (initialLines.length > 0) return initialLines;
    if (prefersList) return seededBreakdownLines(item.item_key);
    return [];
  });
  const cleanComments = sanitizeItemComments(item.item_key, item.comments);
  const [source, setSource] = useState(item.source ?? "");
  const [comments, setComments] = useState(cleanComments);
  const [detailsOpen, setDetailsOpen] = useState(
    () => Boolean(item.source?.trim()) || Boolean(cleanComments),
  );
  const linesSum = sumHandoverBreakdownLines(lines);
  const ask = itemAsk(item.item_key, item.label);
  const expect = itemExpect(item.item_key);
  const answerHint = itemAnswerHint(item.item_key);
  const example = itemExample(item.item_key);
  const obsolete = isObsoleteHandoverItem(item);
  const amountLabel =
    mode === "confirm"
      ? "Total día 1 (COP)"
      : mode === "docs"
        ? "Monto (casi siempre 0)"
        : prefersList
          ? "Total (suma de la lista)"
          : "Monto (COP)";
  const cardRef = useRef<HTMLDivElement>(null);
  const amountPreview =
    item.amount != null
      ? formatCOP(item.amount)
      : linesSum != null
        ? formatCOP(linesSum)
        : null;
  const lineCount = (
    initialLines.length > 0 ? initialLines : lines
  ).filter((l) => l.name.trim()).length;

  useEffect(() => {
    if (!highlighted && !expanded) return;
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [highlighted, expanded]);

  function submitItem(fd: FormData) {
    setError(null);
    setSaved(false);
    const andAdvance = advanceRef.current;
    advanceRef.current = false;
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
      if (!result.ok) {
        setError(result.error ?? "Error");
      } else {
        setLines(
          cleaned.length > 0
            ? cleaned
            : prefersList
              ? seededBreakdownLines(item.item_key)
              : [],
        );
        setSaved(true);
        if (andAdvance) onSaveSuccess?.();
      }
    });
  }

  return (
    <div
      id={`item-${item.id}`}
      ref={cardRef}
      className={cn(
        "overflow-hidden rounded-xl border bg-white transition",
        expanded || highlighted
          ? "border-[var(--ink)]/30 shadow-[0_0_0_3px_var(--gold-soft)]"
          : "border-[var(--line)]",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition hover:bg-black/[0.015]"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm font-bold tracking-tight">
            {ask}
          </p>
          <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
            {amountPreview
              ? amountPreview
              : status === "PENDIENTE"
                ? "Sin capturar · puedes saltarla"
                : verificationLabel(status)}
            {lineCount > 0
              ? ` · ${lineCount} renglón${lineCount === 1 ? "" : "es"}`
              : ""}
          </p>
        </div>
        <Badge tone={statusTone(status)}>
          {STATUS_OPTIONS.find((o) => o.value === status)?.label ??
            verificationLabel(status)}
        </Badge>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-[var(--muted)] transition",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded ? (
        <div className="border-t border-[var(--line)] px-3.5 py-4 sm:px-5">
          <div className="mb-4 rounded-2xl bg-[var(--ink)] px-4 py-4 text-white">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">
              Pregunta en voz alta
            </p>
            <p className="mt-1.5 font-display text-lg font-bold leading-snug tracking-tight sm:text-xl">
              {ask}
            </p>
          </div>

          {example ? (
            <div className="mb-4 rounded-xl border border-dashed border-[var(--ink)]/15 bg-[var(--bg)] px-3.5 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                Nota aclaratoria · ejemplo
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink)]">
                {example}
              </p>
            </div>
          ) : null}

          {expect || answerHint ? (
            <div className="mb-4 grid gap-2 sm:grid-cols-2">
              {expect ? (
                <div className="rounded-xl bg-[var(--bg)] px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                    Qué capturar
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--ink)]">
                    {expect}
                  </p>
                </div>
              ) : null}
              {answerHint ? (
                <div className="rounded-xl bg-[var(--gold-soft)] px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--warn)]">
                    Tip de indagación
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--ink)]">
                    {answerHint}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {obsolete && !readOnly ? (
            <div className="mb-4 rounded-xl border border-[var(--warn)]/30 bg-[var(--gold-soft)] px-3.5 py-3">
              <p className="text-xs leading-relaxed text-[var(--ink)]">
                Esta pregunta es de un catálogo anterior y se solapa con las
                nuevas. Puedes quitarla para no confundir la reunión.
              </p>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    const result = await softDeleteHandoverItemAction(item.id);
                    if (!result.ok) {
                      setError(result.error ?? "Error");
                    }
                  });
                }}
                className="mt-2 text-xs font-semibold text-[var(--warn)] underline-offset-2 hover:underline"
              >
                Quitar esta pregunta antigua
              </button>
            </div>
          ) : null}

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
                <span className="font-medium tabular-nums text-[var(--ink)]">
                  {item.amount != null ? formatCOP(item.amount) : "—"}
                </span>
              </p>
              {initialLines.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-[var(--line)]">
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
                        <tr
                          key={line.id}
                          className="border-t border-[var(--line)]"
                        >
                          <td className="px-3 py-2 text-[var(--ink)]">
                            {line.name}
                          </td>
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
              <p>Fuente: {item.source || "—"}</p>
              <p>Notas: {cleanComments || "—"}</p>
            </div>
          ) : (
            <form className="space-y-3" action={(fd) => submitItem(fd)}>
              <input type="hidden" name="label" value={item.label} />
              <input type="hidden" name="domain" value={item.domain} />
              <input type="hidden" name="item_key" value={item.item_key} />

              <StatusChooser value={status} onChange={setStatus} />

              {status === "PENDIENTE" ? (
                <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--bg)]/60 px-3 py-3 text-sm text-[var(--muted)]">
                  Si aún no indagas esto:{" "}
                  <button
                    type="button"
                    className="font-semibold text-[var(--ink)] underline-offset-2 hover:underline"
                    onClick={() => onSkip?.()}
                  >
                    Saltar por ahora →
                  </button>
                  {prefersList
                    ? " Abajo ya tienes la lista mínima para marcar."
                    : null}
                </div>
              ) : null}

              {prefersList ? (
                <div className="space-y-2">
                  {itemSeedLines(item.item_key).length > 0 ? (
                    <p className="text-xs text-[var(--muted)]">
                      Lista mínima prearmada — en la nota marca{" "}
                      <span className="font-medium text-[var(--ink)]">
                        entregado / falta / parcial
                      </span>{" "}
                      (o el monto si aplica). Puedes agregar o quitar renglones.
                    </p>
                  ) : null}
                  <BreakdownEditor
                    mode={mode}
                    lines={lines}
                    setLines={setLines}
                    domain={item.domain}
                  />
                </div>
              ) : null}

              {!prefersList ? (
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-[var(--ink)]">
                    {amountLabel}
                  </span>
                  <input
                    name="amount"
                    inputMode="decimal"
                    defaultValue={
                      item.amount != null ? String(item.amount) : ""
                    }
                    placeholder="Monto"
                    className={cn(inputClass, "tabular-nums")}
                  />
                </label>
              ) : null}

              {prefersList && linesSum != null ? (
                <>
                  <input type="hidden" name="amount" value={String(linesSum)} />
                  <p className="text-sm text-[var(--muted)]">
                    {amountLabel}:{" "}
                    <span className="font-semibold tabular-nums text-[var(--ink)]">
                      {formatCOP(linesSum)}
                    </span>
                  </p>
                </>
              ) : null}

              {prefersList && linesSum == null ? (
                <input type="hidden" name="amount" value="" />
              ) : null}

              {mode === "single" ? (
                <details className="rounded-lg border border-[var(--line)] bg-[var(--bg)]/40 px-3 py-2">
                  <summary className="cursor-pointer text-xs font-medium text-[var(--muted)]">
                    Desglose opcional
                  </summary>
                  <div className="mt-3">
                    <BreakdownEditor
                      mode={mode}
                      lines={lines}
                      setLines={setLines}
                      domain={item.domain}
                    />
                  </div>
                </details>
              ) : null}

              <input type="hidden" name="source" value={source} />
              <input type="hidden" name="comments" value={comments} />
              <div className="rounded-lg border border-[var(--line)]">
                <button
                  type="button"
                  onClick={() => setDetailsOpen((o) => !o)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-[var(--muted)]"
                >
                  <span>
                    Fuente y notas {detailsOpen ? "" : "(opcional)"}
                  </span>
                  <ChevronDown
                    className={cn(
                      "size-3.5 transition",
                      detailsOpen && "rotate-180",
                    )}
                  />
                </button>
                {detailsOpen ? (
                  <div className="grid gap-3 border-t border-[var(--line)] px-3 py-3 md:grid-cols-2">
                    <label className="block text-sm md:col-span-1">
                      <span className="mb-1 block text-[var(--muted)]">
                        Fuente / evidencia
                      </span>
                      <input
                        value={source}
                        onChange={(e) => setSource(e.target.value)}
                        placeholder="Extracto, Excel, oral…"
                        className={inputClass}
                      />
                    </label>
                    <label className="block text-sm md:col-span-2">
                      <span className="mb-1 block text-[var(--muted)]">
                        Notas de la indagación
                      </span>
                      <textarea
                        rows={2}
                        value={comments}
                        onChange={(e) => setComments(e.target.value)}
                        placeholder="Lo que respondió, contradicciones, qué quedó pendiente…"
                        className={inputClass}
                      />
                    </label>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {status === "PENDIENTE" ? (
                  <>
                    <Button
                      type="button"
                      disabled={pending}
                      className="px-4 py-2.5 text-sm"
                      onClick={() => onSkip?.()}
                    >
                      Saltar por ahora →
                    </Button>
                    <Button
                      type="submit"
                      variant="secondary"
                      disabled={pending}
                      className="px-3 py-2.5 text-xs"
                      onClick={() => {
                        advanceRef.current = true;
                      }}
                    >
                      {pending ? "…" : "Guardar lista y seguir"}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="submit"
                      disabled={pending}
                      className="px-4 py-2.5 text-sm"
                      onClick={() => {
                        advanceRef.current = true;
                      }}
                    >
                      {pending ? "…" : "Guardar y seguir"}
                    </Button>
                    <Button
                      type="submit"
                      variant="secondary"
                      disabled={pending}
                      className="px-3 py-2.5 text-xs"
                      onClick={() => {
                        advanceRef.current = false;
                      }}
                    >
                      {pending ? "…" : "Solo guardar"}
                    </Button>
                  </>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  className="px-3 py-1.5 text-xs text-red-700 hover:bg-red-50"
                  onClick={() => {
                    if (!confirm("¿Quitar esta pregunta del acta?")) return;
                    startTransition(async () => {
                      const result = await softDeleteHandoverItemAction(
                        item.id,
                      );
                      if (!result.ok) setError(result.error ?? "Error");
                    });
                  }}
                >
                  Quitar
                </Button>
                {saved ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                    <Check className="size-3.5" />
                    Guardado
                  </span>
                ) : null}
                {error ? (
                  <span className="text-xs text-red-700">{error}</span>
                ) : null}
              </div>
            </form>
          )}
        </div>
      ) : null}
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
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--line)] bg-white/60 px-4 py-3 text-sm font-medium text-[var(--ink)] transition hover:border-[var(--accent)]/40 hover:bg-white"
      >
        <Plus className="size-4" />
        Agregar otra pregunta de la reunión
      </button>
    );
  }

  return (
    <Card className="space-y-3">
      <form
        className="space-y-3"
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
          <h4 className="font-display font-bold">Pregunta adicional</h4>
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
            <input
              name="amount"
              inputMode="decimal"
              className={cn(inputClass, "tabular-nums")}
              placeholder="Opcional"
            />
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
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Agregar pregunta"}
        </Button>
      </form>
    </Card>
  );
}

export function SeedDefaultsButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            const cleaned = await cleanupObsoleteHandoverItemsAction(sessionId);
            const seeded = await seedMissingHandoverDefaultsAction(sessionId);
            if (!cleaned.ok) {
              setMsg(cleaned.error ?? "Error al limpiar");
              return;
            }
            if (!seeded.ok) {
              setMsg(seeded.error ?? "Error al completar");
              return;
            }
            const removed = cleaned.removed ?? 0;
            setMsg(
              removed > 0
                ? `Listo: se quitaron ${removed} pregunta${removed === 1 ? "" : "s"} antigua${removed === 1 ? "" : "s"} y se completó la lista estándar.`
                : "Listo: preguntas estándar listas para la reunión.",
            );
            router.refresh();
          });
        }}
        className="text-xs font-medium text-[var(--muted)] underline-offset-2 hover:text-[var(--ink)] hover:underline"
      >
        {pending
          ? "…"
          : "Preparar reunión (completar lista + quitar preguntas antiguas)"}
      </button>
      {msg ? <span className="text-xs text-[var(--muted)]">{msg}</span> : null}
    </div>
  );
}

type DomainGroup = {
  domain: string;
  items: HandoverItem[];
};

function groupItems(items: HandoverItem[]): DomainGroup[] {
  const map = new Map<string, HandoverItem[]>();
  for (const item of items) {
    if (isObsoleteHandoverItem(item)) continue;
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
}

export function HandoverDomainSections({
  items,
  readOnly,
  activeDomain,
  onDomainChange,
  highlightItemId,
  expandedItemId,
  onExpandItem,
  onItemSaved,
}: {
  items: HandoverItem[];
  readOnly: boolean;
  activeDomain: string | null;
  onDomainChange: (domain: string | null) => void;
  highlightItemId?: string | null;
  expandedItemId: string | null;
  onExpandItem: (itemId: string | null) => void;
  onItemSaved?: (itemId: string) => void;
}) {
  const grouped = useMemo(() => groupItems(items), [items]);
  const activeIndex = Math.max(
    0,
    grouped.findIndex((g) => g.domain === activeDomain),
  );
  const current = grouped[activeIndex] ?? grouped[0] ?? null;

  if (grouped.length === 0) {
    return (
      <Card>
        <p className="text-sm text-[var(--muted)]">
          Aún no hay preguntas. Prepáralas con el botón de completar lista
          estándar.
        </p>
      </Card>
    );
  }

  if (!current) return null;

  const meta = domainMeta(current.domain);
  const { reviewed, total } = domainProgress(current.items);
  const done = reviewed === total && total > 0;
  const pendingInBlock = current.items.filter(
    (i) => i.verification_status === "PENDIENTE",
  ).length;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[var(--line)] bg-white/80 px-4 py-4">
        <p className="mb-3 text-xs leading-relaxed text-[var(--muted)]">
          Tu mapa de indagación. Elige una esfera para entrar al bloque; las
          preguntas empiezan colapsadas.
        </p>
        <div className="flex flex-wrap gap-2.5">
          {grouped.map((group, index) => {
            const progress = domainProgress(group.items);
            const complete =
              progress.reviewed === progress.total && progress.total > 0;
            const active = group.domain === current.domain;
            return (
              <button
                key={group.domain}
                type="button"
                title={domainLabel(group.domain)}
                onClick={() => onDomainChange(group.domain)}
                className={cn(
                  "group flex min-w-[4.5rem] max-w-[7.5rem] flex-col items-center gap-1.5 rounded-2xl px-2 py-2 transition",
                  active ? "bg-[var(--gold-soft)]" : "hover:bg-[var(--bg)]",
                )}
              >
                <span
                  className={cn(
                    "flex size-10 items-center justify-center rounded-full text-sm font-bold tabular-nums transition",
                    active &&
                      "bg-[var(--ink)] text-white ring-2 ring-[var(--gold)] ring-offset-2",
                    !active &&
                      complete &&
                      "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
                    !active &&
                      !complete &&
                      "bg-[var(--bg)] text-[var(--muted)] ring-1 ring-[var(--line)] group-hover:ring-[var(--ink)]/20",
                  )}
                >
                  {complete && !active ? (
                    <Check className="size-4" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span
                  className={cn(
                    "line-clamp-2 text-center text-[10px] font-medium leading-tight",
                    active ? "text-[var(--ink)]" : "text-[var(--muted)]",
                  )}
                >
                  {domainLabel(group.domain)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-[var(--line)] bg-[var(--bg)]/40 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-full bg-[var(--ink)] text-[11px] font-bold text-white">
                  {activeIndex + 1}
                </span>
                <span className="text-xs text-[var(--muted)]">
                  Bloque {activeIndex + 1} de {grouped.length}
                </span>
                {done ? <Badge tone="ok">Listo</Badge> : null}
              </div>
              <h3 className="mt-2 font-display text-xl font-bold tracking-tight">
                {domainLabel(current.domain)}
              </h3>
              {meta && "ask" in meta ? (
                <p className="mt-1 text-sm text-[var(--muted)]">{meta.ask}</p>
              ) : null}
              {meta && "expect" in meta && meta.expect ? (
                <p className="mt-2 max-w-xl text-xs leading-relaxed text-[var(--ink)]/70">
                  {meta.expect}
                </p>
              ) : null}
            </div>
            <div className="rounded-xl bg-white px-3 py-2 text-right ring-1 ring-[var(--line)]">
              <p className="font-display text-xl font-bold tabular-nums">
                {reviewed}/{total}
              </p>
              <p className="text-[11px] text-[var(--muted)]">
                {pendingInBlock > 0
                  ? `${pendingInBlock} por indagar`
                  : "completo"}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2 px-4 py-4 sm:px-5">
          {current.items.map((item) => (
            <HandoverItemCard
              key={item.id}
              item={item}
              readOnly={readOnly}
              highlighted={highlightItemId === item.id}
              expanded={expandedItemId === item.id}
              onToggle={() =>
                onExpandItem(expandedItemId === item.id ? null : item.id)
              }
              onSaveSuccess={() => onItemSaved?.(item.id)}
              onSkip={() => onItemSaved?.(item.id)}
            />
          ))}
        </div>

        <div className="border-t border-[var(--line)] px-4 py-3 sm:px-5">
          <p className="text-center text-[11px] text-[var(--muted)]">
            Para cambiar de bloque, elige otra esfera arriba · abre una pregunta
            para indagar
          </p>
        </div>
      </Card>
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

  return (
    <Card className="space-y-4">
      <form
        className="space-y-4"
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
            Congelar el empalme
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
            Cuando la conversación haya llegado lo suficientemente lejos,
            cierren aquí. No hace falta tenerlo todo perfecto
            {pendingCount > 0
              ? `: pueden quedar ${pendingCount} puntos por conversar o pendientes`
              : ""}
            .
          </p>
        </div>

        {summaryLines.length > 0 ? (
          <div className="rounded-lg bg-[var(--bg)] px-3 py-3 text-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
              Resumen de montos capturados
            </p>
            <ul className="space-y-1">
              {summaryLines.map((line) => (
                <li key={line.label} className="flex justify-between gap-3">
                  <span>{line.label}</span>
                  <span className="font-medium tabular-nums">{line.amount}</span>
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
        <Button type="submit" disabled={pending}>
          {pending ? "Cerrando…" : "Cerrar empalme"}
        </Button>
      </form>
    </Card>
  );
}

export function ClosedActaView({
  session,
  items,
  quality,
  summaryLines,
}: {
  session: HandoverSession;
  items: HandoverItem[];
  quality: QualitySummary;
  summaryLines: Array<{ label: string; amount: string }>;
}) {
  const grouped = useMemo(() => groupItems(items), [items]);

  return (
    <div className="space-y-6">
      <Card className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,var(--accent),var(--gold))]"
        />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900">
              <FileCheck2 className="size-3.5" />
              Acta cerrada
            </div>
            <h2 className="mt-3 font-display text-2xl font-bold tracking-tight">
              Foto oficial del día 1
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Congelada el {formatDateCO(session.closed_at)} · Corte{" "}
              {formatDateCO(session.cutoff_date)}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="font-display text-xl font-bold text-[var(--ok)]">
                {quality.confirmed}
              </p>
              <p className="text-[11px] text-[var(--muted)]">Con prueba</p>
            </div>
            <div>
              <p className="font-display text-xl font-bold text-[var(--warn)]">
                {quality.declared}
              </p>
              <p className="text-[11px] text-[var(--muted)]">Solo dicho</p>
            </div>
            <div>
              <p className="font-display text-xl font-bold text-[var(--danger)]">
                {quality.pending}
              </p>
              <p className="text-[11px] text-[var(--muted)]">Pendiente</p>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 rounded-xl bg-[var(--bg)] p-4 text-sm md:grid-cols-2">
          <p>
            <span className="text-[var(--muted)]">Entrega:</span>{" "}
            <span className="font-medium">
              {session.delivered_by_name || "—"}
            </span>
          </p>
          <p>
            <span className="text-[var(--muted)]">Recibe:</span>{" "}
            <span className="font-medium">
              {session.received_by_name || "—"}
            </span>
          </p>
          {session.notes ? (
            <p className="md:col-span-2">
              <span className="text-[var(--muted)]">Notas de reunión:</span>{" "}
              {session.notes}
            </p>
          ) : null}
          {session.closing_notes ? (
            <p className="md:col-span-2">
              <span className="text-[var(--muted)]">Notas de cierre:</span>{" "}
              {session.closing_notes}
            </p>
          ) : null}
        </div>

        {summaryLines.length > 0 ? (
          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
              Totales por tema
            </p>
            <ul className="divide-y divide-[var(--line)] rounded-xl border border-[var(--line)]">
              {summaryLines.map((line) => (
                <li
                  key={line.label}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                >
                  <span>{line.label}</span>
                  <span className="font-semibold tabular-nums">{line.amount}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      <div className="space-y-4">
        <h3 className="font-display text-xl font-bold tracking-tight">
          Detalle del acta
        </h3>
        {grouped.map((group) => (
          <Card key={group.domain} className="space-y-3">
            <div>
              <h4 className="font-display text-lg font-bold">
                {domainLabel(group.domain)}
              </h4>
              <p className="text-xs text-[var(--muted)]">
                {domainProgress(group.items).reviewed}/
                {domainProgress(group.items).total} respondidas
              </p>
            </div>
            <div className="space-y-2">
              {group.items.map((item) => {
                const lines = readHandoverItemMetadata(item.metadata).lines;
                const comments = sanitizeItemComments(
                  item.item_key,
                  item.comments,
                );
                return (
                  <div
                    key={item.id}
                    className="rounded-lg border border-[var(--line)] bg-[var(--bg)]/40 px-3 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-medium">
                        {itemAsk(item.item_key, item.label)}
                      </p>
                      <Badge tone={statusTone(item.verification_status)}>
                        {verificationLabel(item.verification_status)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm tabular-nums text-[var(--muted)]">
                      Monto:{" "}
                      <span className="font-medium text-[var(--ink)]">
                        {item.amount != null ? formatCOP(item.amount) : "—"}
                      </span>
                    </p>
                    {lines.length > 0 ? (
                      <ul className="mt-2 space-y-1 text-sm text-[var(--muted)]">
                        {lines.map((line) => (
                          <li key={line.id} className="flex justify-between gap-3">
                            <span>{line.name}</span>
                            <span className="tabular-nums">
                              {line.amount != null
                                ? formatCOP(line.amount)
                                : "—"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {item.source || comments ? (
                      <p className="mt-2 text-xs text-[var(--muted)]">
                        {[item.source, comments].filter(Boolean).join(" · ")}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function CollapsibleSection({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="p-0 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div>
          <h3 className="font-display text-lg font-bold">{title}</h3>
          {subtitle ? (
            <p className="mt-0.5 text-sm text-[var(--muted)]">{subtitle}</p>
          ) : null}
        </div>
        <ChevronDown
          className={cn("size-4 shrink-0 text-[var(--muted)] transition", open && "rotate-180")}
        />
      </button>
      {open ? (
        <div className="border-t border-[var(--line)] px-5 py-4">{children}</div>
      ) : null}
    </Card>
  );
}

export function EmpalmeMeetingView({
  session,
  items,
  quality,
  summaryLines,
}: {
  session: HandoverSession;
  items: HandoverItem[];
  quality: QualitySummary;
  summaryLines: Array<{ label: string; amount: string }>;
}) {
  const readOnly = session.status === "CERRADO";
  const reviewedCount = quality.confirmed + quality.declared;
  const pendingItems = useMemo(
    () => items.filter((i) => i.verification_status === "PENDIENTE"),
    [items],
  );
  const declaredItems = useMemo(
    () => items.filter((i) => i.verification_status === "DECLARADO"),
    [items],
  );
  const grouped = useMemo(() => groupItems(items), [items]);

  const firstIncomplete =
    grouped.find((g) =>
      g.items.some((i) => i.verification_status === "PENDIENTE"),
    )?.domain ?? grouped[0]?.domain ?? null;

  const [activeDomain, setActiveDomain] = useState<string | null>(firstIncomplete);
  const resolvedActiveDomain =
    activeDomain !== null && grouped.some((g) => g.domain === activeDomain)
      ? activeDomain
      : firstIncomplete;
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [highlightItemId, setHighlightItemId] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function persistFocus(domain: string | null, itemId: string | null) {
    if (typeof window === "undefined") return;
    if (!domain) {
      sessionStorage.removeItem("candela-empalme-focus");
      return;
    }
    sessionStorage.setItem(
      "candela-empalme-focus",
      JSON.stringify({ domain, itemId }),
    );
  }

  function selectDomain(domain: string | null) {
    setActiveDomain(domain);
    setExpandedItemId(null);
    setHighlightItemId(null);
    persistFocus(domain, null);
  }

  function jumpToItem(item: HandoverItem) {
    // Los atajos solo abren preguntas del bloque actual; el cambio de
    // bloque es exclusivo de las esferas.
    if (item.domain !== resolvedActiveDomain) return;
    setExpandedItemId(item.id);
    setHighlightItemId(item.id);
    persistFocus(item.domain, item.id);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightItemId(null), 2800);
  }

  function jumpToNextPending() {
    const pendingInBlock = pendingItems.filter(
      (i) => i.domain === resolvedActiveDomain,
    );
    if (pendingInBlock.length === 0) return;
    const currentIndex = expandedItemId
      ? pendingInBlock.findIndex((i) => i.id === expandedItemId)
      : -1;
    const next =
      pendingInBlock[currentIndex + 1] ?? pendingInBlock[0] ?? null;
    if (!next) return;
    setExpandedItemId(next.id);
    setHighlightItemId(next.id);
    persistFocus(resolvedActiveDomain, next.id);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightItemId(null), 2800);
  }

  function advanceAfterSave(savedItemId: string) {
    const domainItems =
      grouped.find((g) => g.domain === resolvedActiveDomain)?.items ?? [];
    const idx = domainItems.findIndex((i) => i.id === savedItemId);
    const nextInDomain = domainItems[idx + 1];
    if (nextInDomain) {
      setExpandedItemId(nextInDomain.id);
      persistFocus(resolvedActiveDomain, nextInDomain.id);
      return;
    }
    // Fin del bloque: colapsar; el usuario elige la siguiente esfera.
    setExpandedItemId(null);
    persistFocus(resolvedActiveDomain, null);
  }

  if (readOnly) {
    return (
      <ClosedActaView
        session={session}
        items={items}
        quality={quality}
        summaryLines={summaryLines}
      />
    );
  }

  const progressPct = quality.total
    ? (reviewedCount / quality.total) * 100
    : 0;
  const activeAsk = expandedItemId
    ? items.find((i) => i.id === expandedItemId)
    : null;

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-20 -mx-8 border-b border-[var(--line)] bg-[var(--surface)]/95 px-8 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 max-w-xl">
            <p className="text-[11px] font-medium tracking-wide text-[var(--muted)]">
              Modo indagación · tú preguntas · aquí capturas · corte{" "}
              {formatDateCO(session.cutoff_date)}
            </p>
            <p className="font-display text-lg font-bold tabular-nums text-[var(--ink)]">
              {reviewedCount}/{quality.total} capturadas
            </p>
            {activeAsk ? (
              <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                Ahora: {itemAsk(activeAsk.item_key, activeAsk.label)}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="ok">Prueba {quality.confirmed}</Badge>
            <Badge tone="warn">Dicho {quality.declared}</Badge>
            <Badge tone="neutral">Faltan {quality.pending}</Badge>
            {pendingItems.some((i) => i.domain === resolvedActiveDomain) ? (
              <Button
                type="button"
                variant="secondary"
                className="px-3 py-1.5 text-xs"
                onClick={jumpToNextPending}
              >
                Siguiente pendiente
              </Button>
            ) : quality.pending > 0 ? (
              <Badge tone="neutral">Elige otra esfera</Badge>
            ) : (
              <Badge tone="ok">Listo</Badge>
            )}
          </div>
        </div>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[var(--line)]">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,var(--gold),var(--accent))] transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <CollapsibleSection
        title="Datos de la sesión"
        subtitle="Quién entrega / quién recibe / fecha de corte · preparar preguntas"
        defaultOpen={
          !session.delivered_by_name ||
          !session.received_by_name ||
          items.length < 20
        }
      >
        <SessionMetaForm session={session} />
        <div className="mt-4 border-t border-[var(--line)] pt-4">
          <SeedDefaultsButton sessionId={session.id} />
        </div>
      </CollapsibleSection>

      <section className="space-y-3">
        <div className="max-w-3xl">
          <h3 className="font-display text-xl font-bold tracking-tight">
            Guía de indagación
          </h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Una pregunta abierta a la vez. Lo demás queda compacto para no
            perder el hilo de la reunión.
          </p>
        </div>

        <HandoverDomainSections
          items={items}
          readOnly={false}
          activeDomain={resolvedActiveDomain}
          onDomainChange={selectDomain}
          highlightItemId={highlightItemId}
          expandedItemId={expandedItemId}
          onExpandItem={(id) => {
            setExpandedItemId(id);
            if (id && resolvedActiveDomain) {
              persistFocus(resolvedActiveDomain, id);
            }
          }}
          onItemSaved={advanceAfterSave}
        />

        <AddHandoverItemForm sessionId={session.id} />
      </section>

      {(pendingItems.some((i) => i.domain === resolvedActiveDomain) ||
        declaredItems.some((i) => i.domain === resolvedActiveDomain)) && (
        <Card>
          <h3 className="font-display text-lg font-bold">Atajos de este bloque</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Solo del bloque actual. Para otro tema, elige su esfera arriba.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <ReminderList
              title="Aún por indagar"
              items={pendingItems.filter(
                (i) => i.domain === resolvedActiveDomain,
              )}
              onJump={jumpToItem}
            />
            <ReminderList
              title="Declarado (sin prueba)"
              items={declaredItems.filter(
                (i) => i.domain === resolvedActiveDomain,
              )}
              onJump={jumpToItem}
            />
          </div>
        </Card>
      )}

      <CollapsibleSection
        title="Cerrar empalme"
        subtitle="Solo cuando la reunión haya llegado lo suficientemente lejos"
        defaultOpen={false}
      >
        <CloseHandoverForm
          session={session}
          pendingCount={pendingItems.length}
          summaryLines={summaryLines}
        />
      </CollapsibleSection>
    </div>
  );
}

function ReminderList({
  title,
  items,
  onJump,
}: {
  title: string;
  items: HandoverItem[];
  onJump: (item: HandoverItem) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
        {title}
      </p>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--muted)]">Ninguna</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {items.slice(0, 8).map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onJump(item)}
                className="w-full rounded-md px-1.5 py-1 text-left text-sm text-[var(--muted)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
              >
                {itemAsk(item.item_key, item.label)}
              </button>
            </li>
          ))}
          {items.length > 8 ? (
            <li className="px-1.5 text-sm text-[var(--muted)]">
              … y {items.length - 8} más
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}

export function EmpalmeSteps({ current }: { current: 1 | 2 | 3 }) {
  const steps = [
    { n: 1 as const, label: "Quiénes y fecha" },
    { n: 2 as const, label: "Conversar los temas" },
    { n: 3 as const, label: "Cerrar el empalme" },
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
              "rounded-2xl border px-4 py-3",
              active && "border-[var(--gold)] bg-[var(--gold-soft)]",
              done && "border-[var(--line)] bg-white",
              !active &&
                !done &&
                "border-[var(--line)] bg-transparent opacity-55",
            )}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
              Paso {step.n}
              {done ? " · listo" : ""}
            </p>
            <p className="mt-1 text-sm font-semibold">{step.label}</p>
          </li>
        );
      })}
    </ol>
  );
}
