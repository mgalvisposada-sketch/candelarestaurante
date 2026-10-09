"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createSystemUserAction,
  deactivateSystemUserAction,
  updateSystemUserAction,
} from "./actions";
import { Badge } from "@/components/ui/primitives";
import { ROLE_LABELS, type AppRole } from "@/types/domain";

export type SystemUserRow = {
  membership_id: string;
  user_id: string;
  role: AppRole;
  email: string | null;
  full_name: string | null;
  is_active: boolean;
  created_at: string;
};

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2";

const ROLES: AppRole[] = [
  "SUPER_ADMIN",
  "GESTION",
  "ADMIN_LOCAL",
  "TESORERIA",
  "SOCIO",
  "CONTADOR",
  "LECTURA",
];

function RoleSelect({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue?: AppRole;
}) {
  return (
    <select
      name={name}
      required
      defaultValue={defaultValue ?? "LECTURA"}
      className={inputClass}
    >
      {ROLES.map((role) => (
        <option key={role} value={role}>
          {ROLE_LABELS[role]}
        </option>
      ))}
    </select>
  );
}

export function CreateSystemUserForm() {
  const router = useRouter();
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
        Nuevo usuario
      </button>
    );
  }

  return (
    <form
      className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        startTransition(async () => {
          try {
            const r = await createSystemUserAction(fd);
            if (!r.ok) {
              setError(r.error ?? "Error");
              return;
            }
            setOpen(false);
            router.refresh();
          } catch (err) {
            setError(
              err instanceof Error ? err.message : "Error inesperado al crear",
            );
          }
        });
      }}
    >
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Crear usuario del sistema</h3>
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
          <span className="mb-1.5 block text-[var(--muted)]">Nombre</span>
          <input name="full_name" required className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Correo</span>
          <input type="email" name="email" required className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Rol</span>
          <RoleSelect name="role" defaultValue="GESTION" />
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">
            Contraseña inicial
          </span>
          <input
            type="password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={inputClass}
          />
        </label>
      </div>
      {error ? (
        <p className="rounded-lg bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Creando…" : "Crear acceso"}
      </button>
    </form>
  );
}

export function SystemUsersTable({
  users,
  currentUserId,
}: {
  users: SystemUserRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (users.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Aún no hay usuarios en esta organización.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-[var(--line)] bg-[var(--surface)] text-xs uppercase tracking-wide text-[var(--muted)]">
          <tr>
            <th className="px-4 py-3 font-medium">Usuario</th>
            <th className="px-4 py-3 font-medium">Rol</th>
            <th className="px-4 py-3 font-medium">Estado</th>
            <th className="px-4 py-3 font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const isEditing = editingId === user.membership_id;
            return (
              <tr
                key={user.membership_id}
                className="border-b border-[var(--line)] last:border-0"
              >
                <td className="px-4 py-3 align-top" colSpan={isEditing ? 4 : 1}>
                  {isEditing ? (
                    <form
                      className="space-y-3 py-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const fd = new FormData(e.currentTarget);
                        setError(null);
                        startTransition(async () => {
                          try {
                            const r = await updateSystemUserAction(fd);
                            if (!r.ok) {
                              setError(r.error ?? "Error");
                              return;
                            }
                            setEditingId(null);
                            router.refresh();
                          } catch (err) {
                            setError(
                              err instanceof Error
                                ? err.message
                                : "Error inesperado al guardar",
                            );
                          }
                        });
                      }}
                    >
                      <input
                        type="hidden"
                        name="membership_id"
                        value={user.membership_id}
                      />
                      <input type="hidden" name="user_id" value={user.user_id} />
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="block text-sm md:col-span-2">
                          <span className="mb-1.5 block text-[var(--muted)]">
                            Nombre
                          </span>
                          <input
                            name="full_name"
                            required
                            defaultValue={user.full_name ?? ""}
                            className={inputClass}
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="mb-1.5 block text-[var(--muted)]">
                            Correo
                          </span>
                          <input
                            type="email"
                            name="email"
                            required
                            defaultValue={user.email ?? ""}
                            className={inputClass}
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="mb-1.5 block text-[var(--muted)]">
                            Rol
                          </span>
                          <RoleSelect name="role" defaultValue={user.role} />
                        </label>
                        <label className="block text-sm">
                          <span className="mb-1.5 block text-[var(--muted)]">
                            Estado
                          </span>
                          <select
                            name="is_active"
                            defaultValue={user.is_active ? "true" : "false"}
                            className={inputClass}
                          >
                            <option value="true">Activo</option>
                            <option value="false">Inactivo</option>
                          </select>
                        </label>
                        <label className="block text-sm">
                          <span className="mb-1.5 block text-[var(--muted)]">
                            Nueva contraseña (opcional)
                          </span>
                          <input
                            type="password"
                            name="password"
                            minLength={8}
                            autoComplete="new-password"
                            placeholder="Dejar vacío para no cambiar"
                            className={inputClass}
                          />
                        </label>
                      </div>
                      {error && editingId === user.membership_id ? (
                        <p className="rounded-lg bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--danger)]">
                          {error}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="submit"
                          disabled={pending}
                          className="rounded-lg bg-[var(--ink)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                        >
                          {pending ? "Guardando…" : "Guardar"}
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
                          onClick={() => {
                            setEditingId(null);
                            setError(null);
                          }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div>
                      <p className="font-medium text-[var(--ink)]">
                        {user.full_name || "Sin nombre"}
                        {user.user_id === currentUserId ? (
                          <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                            (tú)
                          </span>
                        ) : null}
                      </p>
                      <p className="text-[var(--muted)]">{user.email}</p>
                    </div>
                  )}
                </td>
                {!isEditing ? (
                  <>
                    <td className="px-4 py-3 align-top">
                      <Badge tone={user.role === "SUPER_ADMIN" ? "accent" : "neutral"}>
                        {ROLE_LABELS[user.role]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Badge tone={user.is_active ? "ok" : "warn"}>
                        {user.is_active ? "Activo" : "Inactivo"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="text-sm font-medium text-[var(--accent)]"
                          onClick={() => {
                            setEditingId(user.membership_id);
                            setError(null);
                          }}
                        >
                          Editar
                        </button>
                        {user.user_id !== currentUserId ? (
                          <button
                            type="button"
                            className="text-sm text-[var(--danger)]"
                            disabled={pending}
                            onClick={() => {
                              if (
                                !confirm(
                                  `¿Desactivar el acceso de ${user.email ?? "este usuario"}?`,
                                )
                              ) {
                                return;
                              }
                              setError(null);
                              startTransition(async () => {
                                const r = await deactivateSystemUserAction(
                                  user.membership_id,
                                );
                                if (!r.ok) setError(r.error ?? "Error");
                              });
                            }}
                          >
                            Desactivar
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
      {error && !editingId ? (
        <p className="border-t border-[var(--line)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
