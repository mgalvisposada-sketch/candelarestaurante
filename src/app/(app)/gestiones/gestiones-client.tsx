"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  CircleDashed,
  Clock3,
  Pencil,
  Plus,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { notifyPendingActionsChanged } from "@/components/layout/pending-actions-inbox";
import { Badge, EmptyState, WorkSection } from "@/components/ui/primitives";
import { formatDateCO, todayInBogota } from "@/lib/dates";
import { cn } from "@/lib/utils";
import {
  createGestionAction,
  setGestionStatusAction,
  softDeleteGestionAction,
  updateGestionAction,
} from "./actions";

export type TeamMember = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  is_active: boolean;
};

export type GestionRow = {
  id: string;
  title: string;
  description: string | null;
  status: "PENDIENTE" | "EN_PROGRESO" | "HECHA" | "CANCELADA";
  priority: "BAJA" | "NORMAL" | "ALTA" | "URGENTE";
  assigned_to: string;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  created_by: string | null;
};

type Scope = "mias" | "creadas" | "equipo" | "todas";
type StatusFilter = "abiertas" | "PENDIENTE" | "EN_PROGRESO" | "HECHA" | "CANCELADA" | "todas";

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] outline-none ring-[var(--accent)] focus:ring-2";

const STATUS_LABEL: Record<GestionRow["status"], string> = {
  PENDIENTE: "Pendiente",
  EN_PROGRESO: "En progreso",
  HECHA: "Hecha",
  CANCELADA: "Cancelada",
};

const PRIORITY_LABEL: Record<GestionRow["priority"], string> = {
  BAJA: "Baja",
  NORMAL: "Normal",
  ALTA: "Alta",
  URGENTE: "Urgente",
};

function statusTone(status: GestionRow["status"]) {
  if (status === "HECHA") return "ok" as const;
  if (status === "CANCELADA") return "neutral" as const;
  if (status === "EN_PROGRESO") return "info" as const;
  return "warn" as const;
}

function priorityTone(priority: GestionRow["priority"]) {
  if (priority === "URGENTE") return "danger" as const;
  if (priority === "ALTA") return "warn" as const;
  if (priority === "BAJA") return "neutral" as const;
  return "accent" as const;
}

function priorityBar(priority: GestionRow["priority"]) {
  if (priority === "URGENTE") return "bg-[var(--danger)]";
  if (priority === "ALTA") return "bg-[var(--warn)]";
  if (priority === "BAJA") return "bg-[var(--muted)]";
  return "bg-[var(--accent)]";
}

function memberLabel(m: TeamMember) {
  return m.full_name?.trim() || m.email || "Usuario";
}

function initials(label: string) {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function isOverdue(row: GestionRow, today: string) {
  if (!row.due_date) return false;
  if (row.status === "HECHA" || row.status === "CANCELADA") return false;
  return row.due_date < today;
}

export function GestionesClient({
  currentUserId,
  members,
  gestiones,
  canCreate,
  canManage,
}: {
  currentUserId: string;
  members: TeamMember[];
  gestiones: GestionRow[];
  canCreate: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>("mias");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("abiertas");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const today = todayInBogota();

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) map.set(m.user_id, memberLabel(m));
    return map;
  }, [members]);

  const activeMembers = useMemo(
    () => members.filter((m) => m.is_active),
    [members],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash.startsWith("gestion-")) return;
    const el = document.getElementById(hash);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-[var(--accent)]");
      const t = window.setTimeout(() => {
        el.classList.remove("ring-2", "ring-[var(--accent)]");
      }, 1800);
      return () => window.clearTimeout(t);
    }
  }, [gestiones]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return gestiones
      .filter((g) => {
        if (scope === "mias" && g.assigned_to !== currentUserId) return false;
        if (scope === "creadas" && g.created_by !== currentUserId) return false;
        if (
          scope === "equipo" &&
          (g.assigned_to === currentUserId || g.status === "HECHA" || g.status === "CANCELADA")
        ) {
          return false;
        }
        if (statusFilter === "abiertas") {
          if (g.status !== "PENDIENTE" && g.status !== "EN_PROGRESO") return false;
        } else if (statusFilter !== "todas" && g.status !== statusFilter) {
          return false;
        }
        if (!q) return true;
        const hay = `${g.title} ${g.description ?? ""} ${nameById.get(g.assigned_to) ?? ""}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        const aOpen = a.status === "PENDIENTE" || a.status === "EN_PROGRESO";
        const bOpen = b.status === "PENDIENTE" || b.status === "EN_PROGRESO";
        if (aOpen !== bOpen) return aOpen ? -1 : 1;
        const aOver = isOverdue(a, today) ? 0 : 1;
        const bOver = isOverdue(b, today) ? 0 : 1;
        if (aOver !== bOver) return aOver - bOver;
        const pRank = { URGENTE: 0, ALTA: 1, NORMAL: 2, BAJA: 3 } as const;
        if (pRank[a.priority] !== pRank[b.priority]) {
          return pRank[a.priority] - pRank[b.priority];
        }
        const aDue = a.due_date ?? "9999-99-99";
        const bDue = b.due_date ?? "9999-99-99";
        if (aDue !== bDue) return aDue.localeCompare(bDue);
        return b.created_at.localeCompare(a.created_at);
      });
  }, [gestiones, scope, statusFilter, query, currentUserId, nameById, today]);

  const stats = useMemo(() => {
    const mineOpen = gestiones.filter(
      (g) =>
        g.assigned_to === currentUserId &&
        (g.status === "PENDIENTE" || g.status === "EN_PROGRESO"),
    ).length;
    const overdue = gestiones.filter((g) => isOverdue(g, today)).length;
    const teamOpen = gestiones.filter(
      (g) =>
        g.assigned_to !== currentUserId &&
        (g.status === "PENDIENTE" || g.status === "EN_PROGRESO"),
    ).length;
    const done = gestiones.filter((g) => g.status === "HECHA").length;
    return { mineOpen, overdue, teamOpen, done };
  }, [gestiones, currentUserId, today]);

  function runAction(
    action: (fd: FormData) => Promise<{ ok: boolean; error?: string }>,
    fd: FormData,
    onOk?: () => void,
  ) {
    setError(null);
    startTransition(async () => {
      const r = await action(fd);
      if (!r.ok) {
        setError(r.error ?? "No se pudo guardar");
        return;
      }
      onOk?.();
      notifyPendingActionsChanged();
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatChip label="Para mí" value={String(stats.mineOpen)} hint="Abiertas" />
        <StatChip
          label="Vencidas"
          value={String(stats.overdue)}
          hint="Con fecha pasada"
          danger={stats.overdue > 0}
        />
        <StatChip label="Del equipo" value={String(stats.teamOpen)} hint="Abiertas ajenas" />
        <StatChip label="Hechas" value={String(stats.done)} hint="Historial" />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["mias", "Para mí"],
              ["creadas", "Creadas por mí"],
              ["equipo", "Equipo"],
              ["todas", "Todas"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setScope(id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm transition",
                scope === id
                  ? "bg-[var(--solid)] text-[var(--on-solid)]"
                  : "bg-[var(--surface-muted)] text-[var(--muted)] hover:text-[var(--ink)]",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className={cn(inputClass, "w-auto min-w-[10rem]")}
          >
            <option value="abiertas">Abiertas</option>
            <option value="PENDIENTE">Pendientes</option>
            <option value="EN_PROGRESO">En progreso</option>
            <option value="HECHA">Hechas</option>
            <option value="CANCELADA">Canceladas</option>
            <option value="todas">Todos los estados</option>
          </select>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar…"
            className={cn(inputClass, "min-w-[12rem] flex-1")}
          />
          {canCreate ? (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setCreating(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--solid)] px-4 py-2.5 text-sm font-medium text-[var(--on-solid)]"
            >
              <Plus className="size-4" aria-hidden />
              Nueva gestión
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-[var(--danger)]/30 bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      {creating && canCreate ? (
        <GestionForm
          members={activeMembers}
          currentUserId={currentUserId}
          pending={pending}
          onCancel={() => setCreating(false)}
          onSubmit={(fd) =>
            runAction(createGestionAction, fd, () => setCreating(false))
          }
        />
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          title="Nada por aquí"
          description={
            canCreate
              ? "Crea una gestión para ti o asígnala a alguien del equipo."
              : "Cuando te asignen tareas, aparecerán en esta bandeja."
          }
        />
      ) : (
        <WorkSection
          kind="list"
          title="Bandeja"
          description="Prioridad · responsable · fecha · avance rápido"
          defaultOpen
          badge={
            <span className="text-xs text-[var(--muted)]">{filtered.length}</span>
          }
        >
          <ul className="space-y-3">
            {filtered.map((g) => {
              const assignee = nameById.get(g.assigned_to) ?? "Sin nombre";
              const creator = g.created_by
                ? nameById.get(g.created_by) ?? "—"
                : "—";
              const overdue = isOverdue(g, today);
              const editing = editingId === g.id;

              return (
                <li
                  key={g.id}
                  id={`gestion-${g.id}`}
                  className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] transition"
                >
                  <div className={cn("h-1 w-full", priorityBar(g.priority))} />
                  <div className="p-4">
                    {editing && canManage ? (
                      <GestionForm
                        members={activeMembers}
                        currentUserId={currentUserId}
                        pending={pending}
                        initial={g}
                        onCancel={() => setEditingId(null)}
                        onSubmit={(fd) =>
                          runAction(updateGestionAction, fd, () =>
                            setEditingId(null),
                          )
                        }
                      />
                    ) : (
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-medium leading-snug text-[var(--ink)]">
                              {g.title}
                            </h3>
                            <Badge tone={statusTone(g.status)}>
                              {STATUS_LABEL[g.status]}
                            </Badge>
                            <Badge tone={priorityTone(g.priority)}>
                              {PRIORITY_LABEL[g.priority]}
                            </Badge>
                            {overdue ? (
                              <Badge tone="danger">Vencida</Badge>
                            ) : null}
                          </div>
                          {g.description ? (
                            <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--muted)]">
                              {g.description}
                            </p>
                          ) : null}
                          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[var(--muted)]">
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                className="inline-flex size-6 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[10px] font-semibold text-[var(--ink)]"
                                aria-hidden
                              >
                                {initials(assignee)}
                              </span>
                              Responsable: {assignee}
                              {g.assigned_to === currentUserId ? " (tú)" : ""}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <UserRound className="size-3.5" aria-hidden />
                              Creó: {creator}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Clock3 className="size-3.5" aria-hidden />
                              {g.due_date
                                ? `Vence ${formatDateCO(g.due_date)}`
                                : "Sin fecha límite"}
                            </span>
                          </div>
                        </div>

                        {canManage ? (
                          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                            {g.status !== "EN_PROGRESO" &&
                            g.status !== "HECHA" &&
                            g.status !== "CANCELADA" ? (
                              <QuickStatus
                                id={g.id}
                                status="EN_PROGRESO"
                                label="Empezar"
                                icon={CircleDashed}
                                disabled={pending}
                                onRun={runAction}
                              />
                            ) : null}
                            {g.status !== "HECHA" && g.status !== "CANCELADA" ? (
                              <QuickStatus
                                id={g.id}
                                status="HECHA"
                                label="Hecha"
                                icon={Check}
                                disabled={pending}
                                onRun={runAction}
                              />
                            ) : null}
                            {g.status === "HECHA" || g.status === "CANCELADA" ? (
                              <QuickStatus
                                id={g.id}
                                status="PENDIENTE"
                                label="Reabrir"
                                icon={CircleDashed}
                                disabled={pending}
                                onRun={runAction}
                              />
                            ) : null}
                            {g.status !== "CANCELADA" && g.status !== "HECHA" ? (
                              <QuickStatus
                                id={g.id}
                                status="CANCELADA"
                                label="Cancelar"
                                icon={X}
                                disabled={pending}
                                onRun={runAction}
                              />
                            ) : null}
                            <button
                              type="button"
                              title="Editar"
                              disabled={pending}
                              onClick={() => {
                                setCreating(false);
                                setEditingId(g.id);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--ink)] disabled:opacity-50"
                            >
                              <Pencil className="size-3.5" aria-hidden />
                              Editar
                            </button>
                            <button
                              type="button"
                              title="Archivar"
                              disabled={pending}
                              onClick={() => {
                                const fd = new FormData();
                                fd.set("id", g.id);
                                runAction(softDeleteGestionAction, fd);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--danger)] disabled:opacity-50"
                            >
                              <Trash2 className="size-3.5" aria-hidden />
                            </button>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </WorkSection>
      )}
    </div>
  );
}

function StatChip({
  label,
  value,
  hint,
  danger,
}: {
  label: string;
  value: string;
  hint: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-display text-2xl font-bold tracking-tight",
          danger && "text-[var(--danger)]",
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-[var(--muted)]">{hint}</p>
    </div>
  );
}

function QuickStatus({
  id,
  status,
  label,
  icon: Icon,
  disabled,
  onRun,
}: {
  id: string;
  status: GestionRow["status"];
  label: string;
  icon: typeof Check;
  disabled: boolean;
  onRun: (
    action: (fd: FormData) => Promise<{ ok: boolean; error?: string }>,
    fd: FormData,
  ) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        const fd = new FormData();
        fd.set("id", id);
        fd.set("status", status);
        onRun(setGestionStatusAction, fd);
      }}
      className="inline-flex items-center gap-1 rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs text-[var(--ink)] hover:bg-[var(--surface-muted)] disabled:opacity-50"
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </button>
  );
}

function GestionForm({
  members,
  currentUserId,
  pending,
  initial,
  onCancel,
  onSubmit,
}: {
  members: TeamMember[];
  currentUserId: string;
  pending: boolean;
  initial?: GestionRow;
  onCancel: () => void;
  onSubmit: (fd: FormData) => void;
}) {
  const isEdit = Boolean(initial);

  return (
    <form
      className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5"
      action={(fd) => onSubmit(fd)}
    >
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">
            {isEdit ? "Editar gestión" : "Nueva gestión"}
          </h3>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Asígnatela a ti o a alguien del equipo. Todos verán el avance.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-[var(--muted)] hover:text-[var(--ink)]"
        >
          Cancelar
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">Título *</span>
          <input
            name="title"
            required
            maxLength={200}
            defaultValue={initial?.title ?? ""}
            placeholder="Ej. Revisar factura del gas"
            className={inputClass}
          />
        </label>

        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">Detalle</span>
          <textarea
            name="description"
            rows={3}
            maxLength={4000}
            defaultValue={initial?.description ?? ""}
            placeholder="Contexto, links o qué se espera"
            className={inputClass}
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Responsable *</span>
          <select
            name="assigned_to"
            required
            defaultValue={initial?.assigned_to ?? currentUserId}
            className={inputClass}
          >
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {memberLabel(m)}
                {m.user_id === currentUserId ? " (yo)" : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Prioridad</span>
          <select
            name="priority"
            defaultValue={initial?.priority ?? "NORMAL"}
            className={inputClass}
          >
            <option value="BAJA">Baja</option>
            <option value="NORMAL">Normal</option>
            <option value="ALTA">Alta</option>
            <option value="URGENTE">Urgente</option>
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Fecha límite</span>
          <input
            type="date"
            name="due_date"
            defaultValue={initial?.due_date ?? ""}
            className={inputClass}
          />
        </label>

        {isEdit ? (
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Estado</span>
            <select
              name="status"
              defaultValue={initial?.status ?? "PENDIENTE"}
              className={inputClass}
            >
              <option value="PENDIENTE">Pendiente</option>
              <option value="EN_PROGRESO">En progreso</option>
              <option value="HECHA">Hecha</option>
              <option value="CANCELADA">Cancelada</option>
            </select>
          </label>
        ) : null}
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[var(--solid)] px-4 py-2.5 text-sm font-medium text-[var(--on-solid)] disabled:opacity-50"
        >
          {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear gestión"}
        </button>
      </div>
    </form>
  );
}
