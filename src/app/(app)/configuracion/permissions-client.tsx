"use client";

import { useMemo, useState, useTransition } from "react";
import { saveUserPermissionsAction } from "./actions";
import { APP_MODULES } from "@/lib/permissions-catalog";
import { ROLE_LABELS, type AppRole } from "@/types/domain";

export type PermissionUserOption = {
  membership_id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: AppRole;
  permission_keys: string[];
};

function toggleKey(keys: Set<string>, key: string, on: boolean) {
  const next = new Set(keys);
  if (on) next.add(key);
  else next.delete(key);
  return next;
}

const PRIVILEGED_KEYS = new Set([
  "configuracion.usuarios",
  "configuracion.permisos",
]);

export function PermissionsManager({
  users,
  canGrantPrivilegedConfig = false,
}: {
  users: PermissionUserOption[];
  /** Solo SUPER_ADMIN puede otorgar admin de usuarios/permisos. */
  canGrantPrivilegedConfig?: boolean;
}) {
  const editableUsers = useMemo(
    () => users.filter((u) => u.role !== "SUPER_ADMIN"),
    [users],
  );
  const initialUser = editableUsers[0] ?? users[0] ?? null;
  const [selectedId, setSelectedId] = useState(initialUser?.membership_id ?? "");
  const selected = useMemo(
    () => users.find((u) => u.membership_id === selectedId) ?? null,
    [users, selectedId],
  );
  const [draft, setDraft] = useState<Set<string>>(
    () => new Set(initialUser?.permission_keys ?? []),
  );
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function selectUser(membershipId: string) {
    const user = users.find((u) => u.membership_id === membershipId);
    setSelectedId(membershipId);
    setDraft(new Set(user?.permission_keys ?? []));
    setError(null);
    setOkMsg(null);
  }

  function setModule(moduleKey: string, submoduleKeys: string[], on: boolean) {
    setDraft((prev) => {
      let next = toggleKey(prev, moduleKey, on);
      for (const sub of submoduleKeys) {
        next = toggleKey(next, sub, on);
      }
      return next;
    });
  }

  function setSubmodule(moduleKey: string, submoduleKey: string, on: boolean) {
    setDraft((prev) => {
      let next = toggleKey(prev, submoduleKey, on);
      if (on) {
        next = toggleKey(next, moduleKey, true);
      } else {
        const mod = APP_MODULES.find((m) => m.key === moduleKey);
        const anySub = mod?.submodules.some((s) => next.has(s.key));
        if (!anySub) next = toggleKey(next, moduleKey, false);
      }
      return next;
    });
  }

  if (users.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Cree usuarios primero para asignar permisos.
      </p>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-5">
      <div className="flex flex-wrap items-end gap-4">
        <label className="block min-w-[240px] flex-1 text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Usuario</span>
          <select
            value={selectedId}
            onChange={(e) => selectUser(e.target.value)}
            className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2"
          >
            {users.map((u) => (
              <option key={u.membership_id} value={u.membership_id}>
                {(u.full_name || u.email || "Sin nombre") +
                  ` · ${ROLE_LABELS[u.role]}` +
                  (u.role === "SUPER_ADMIN" ? " (no editable)" : "")}
              </option>
            ))}
          </select>
        </label>
        {selected ? (
          <p className="pb-2 text-sm text-[var(--muted)]">
            {selected.email}
            {selected.role === "SUPER_ADMIN"
              ? " — el super admin siempre tiene acceso total"
              : null}
          </p>
        ) : null}
      </div>

      {selected?.role === "SUPER_ADMIN" ? (
        <p className="rounded-lg bg-neutral-50 px-3 py-2 text-sm text-[var(--muted)]">
          Los permisos de un super admin no se restringen. Puede editar otros
          usuarios desde el selector.
        </p>
      ) : (
        <>
          <div className="space-y-4">
            {APP_MODULES.filter((m) => m.mvp <= 3 || m.key === "reportes").map(
              (mod) => {
                const subs = mod.submodules.filter(
                  (s) =>
                    canGrantPrivilegedConfig || !PRIVILEGED_KEYS.has(s.key),
                );
                const moduleOn = draft.has(mod.key);
                const allSubsOn =
                  subs.length === 0
                    ? moduleOn
                    : subs.every((s) => draft.has(s.key));
                return (
                  <div
                    key={mod.key}
                    className="rounded-lg border border-[var(--line)] p-4"
                  >
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={moduleOn && allSubsOn}
                        ref={(el) => {
                          if (el) {
                            el.indeterminate =
                              moduleOn && !allSubsOn && subs.length > 0;
                          }
                        }}
                        onChange={(e) =>
                          setModule(
                            mod.key,
                            subs.map((s) => s.key),
                            e.target.checked,
                          )
                        }
                        className="size-4 accent-[var(--accent)]"
                      />
                      <span className="font-medium text-[var(--ink)]">
                        {mod.label}
                      </span>
                      <span className="text-xs text-[var(--muted)]">
                        {mod.href}
                      </span>
                    </label>
                    {subs.length > 0 ? (
                      <div className="mt-3 grid gap-2 border-t border-[var(--line)] pt-3 sm:grid-cols-2">
                        {subs.map((sub) => (
                          <label
                            key={sub.key}
                            className="flex items-center gap-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={draft.has(sub.key)}
                              onChange={(e) =>
                                setSubmodule(mod.key, sub.key, e.target.checked)
                              }
                              className="size-4 accent-[var(--accent)]"
                            />
                            <span>{sub.label}</span>
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              },
            )}
          </div>

          {error ? (
            <p className="rounded-lg bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--danger)]">
              {error}
            </p>
          ) : null}
          {okMsg ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {okMsg}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || !selected}
              className="rounded-lg bg-[var(--ink)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
              onClick={() => {
                if (!selected) return;
                setError(null);
                setOkMsg(null);
                startTransition(async () => {
                  const r = await saveUserPermissionsAction(
                    selected.membership_id,
                    [...draft],
                  );
                  if (!r.ok) setError(r.error ?? "Error");
                  else setOkMsg("Permisos guardados");
                });
              }}
            >
              {pending ? "Guardando…" : "Guardar permisos"}
            </button>
            <button
              type="button"
              disabled={pending || !selected}
              className="rounded-lg border border-[var(--line)] px-4 py-2.5 text-sm"
              onClick={() => {
                if (!selected) return;
                setDraft(new Set(selected.permission_keys));
                setError(null);
                setOkMsg(null);
              }}
            >
              Restablecer
            </button>
          </div>
        </>
      )}
    </div>
  );
}
