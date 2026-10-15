"use client";

import { useMemo, useState, useTransition } from "react";
import { saveUserPermissionsAction } from "./actions";
import {
  APP_MODULES,
  isPermissionAllowedForRole,
  NON_GRANTABLE_PERMISSION_KEYS,
  ROLE_DEFAULT_PERMISSIONS,
} from "@/lib/permissions-catalog";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type AppRole } from "@/types/domain";

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
  /** Solo SUPER_ADMIN puede otorgar admin de permisos. */
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

  const roleDefaults = useMemo(() => {
    if (!selected || selected.role === "SUPER_ADMIN") return new Set<string>();
    return new Set(ROLE_DEFAULT_PERMISSIONS[selected.role] ?? []);
  }, [selected]);

  function selectUser(membershipId: string) {
    const user = users.find((u) => u.membership_id === membershipId);
    setSelectedId(membershipId);
    setDraft(new Set(user?.permission_keys ?? []));
    setError(null);
    setOkMsg(null);
  }

  function setModule(
    moduleKey: string,
    grantableSubKeys: string[],
    on: boolean,
  ) {
    if (!selected || !isPermissionAllowedForRole(selected.role, moduleKey)) {
      return;
    }
    setDraft((prev) => {
      let next = toggleKey(prev, moduleKey, on);
      for (const sub of grantableSubKeys) {
        if (!isPermissionAllowedForRole(selected.role, sub)) continue;
        next = toggleKey(next, sub, on);
      }
      return next;
    });
  }

  function setSubmodule(moduleKey: string, submoduleKey: string, on: boolean) {
    if (!selected || !isPermissionAllowedForRole(selected.role, submoduleKey)) {
      return;
    }
    setDraft((prev) => {
      let next = toggleKey(prev, submoduleKey, on);
      if (on) {
        next = toggleKey(next, moduleKey, true);
      } else {
        const mod = APP_MODULES.find((m) => m.key === moduleKey);
        const anySub = mod?.submodules.some(
          (s) =>
            next.has(s.key) &&
            isPermissionAllowedForRole(selected.role, s.key),
        );
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
          <div className="pb-2 text-sm text-[var(--muted)]">
            <p>
              {selected.email}
              {selected.role === "SUPER_ADMIN"
                ? " — el super admin siempre tiene acceso total"
                : null}
            </p>
            {selected.role !== "SUPER_ADMIN" ? (
              <p className="mt-1 max-w-xl text-xs">
                Rol {ROLE_LABELS[selected.role]}:{" "}
                {ROLE_DESCRIPTIONS[selected.role]}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {!selected ? null : selected.role === "SUPER_ADMIN" ? (
        <p className="rounded-lg bg-neutral-50 px-3 py-2 text-sm text-[var(--muted)]">
          Los permisos de un super admin no se restringen. Puede editar otros
          usuarios desde el selector.
        </p>
      ) : (
        <>
          <p className="text-xs text-[var(--muted)]">
            Los checkboxes deshabilitados están fuera del techo de este rol.
            Las claves del default del rol no llevan etiqueta; las excepciones
            dentro del techo se marcan como «extra».
          </p>
          <div className="space-y-4">
            {APP_MODULES.filter((m) => m.mvp <= 3 || m.key === "reportes").map(
              (mod) => {
                const role = selected.role;
                const subs = mod.submodules.filter((s) => {
                  if (NON_GRANTABLE_PERMISSION_KEYS.has(s.key)) return false;
                  if (
                    PRIVILEGED_KEYS.has(s.key) &&
                    !canGrantPrivilegedConfig
                  ) {
                    return false;
                  }
                  return true;
                });
                const moduleAllowed = isPermissionAllowedForRole(
                  role,
                  mod.key,
                );
                const grantableSubs = subs.filter((s) =>
                  isPermissionAllowedForRole(role, s.key),
                );
                const moduleOn = draft.has(mod.key);
                const allSubsOn =
                  grantableSubs.length === 0
                    ? moduleOn
                    : grantableSubs.every((s) => draft.has(s.key));
                const moduleIsDefault = roleDefaults.has(mod.key);
                const moduleIsExtra =
                  moduleAllowed && moduleOn && !moduleIsDefault;

                return (
                  <div
                    key={mod.key}
                    className="rounded-lg border border-[var(--line)] p-4"
                  >
                    <label
                      className={`flex items-center gap-3 ${
                        moduleAllowed ? "" : "opacity-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={moduleAllowed && moduleOn && allSubsOn}
                        disabled={!moduleAllowed}
                        ref={(el) => {
                          if (el) {
                            el.indeterminate =
                              moduleAllowed &&
                              moduleOn &&
                              !allSubsOn &&
                              grantableSubs.length > 0;
                          }
                        }}
                        onChange={(e) =>
                          setModule(
                            mod.key,
                            grantableSubs.map((s) => s.key),
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
                      {!moduleAllowed ? (
                        <span className="text-xs text-[var(--muted)]">
                          No aplica a este rol
                        </span>
                      ) : moduleIsExtra ? (
                        <span className="text-xs text-[var(--muted)]">
                          extra
                        </span>
                      ) : null}
                    </label>
                    {subs.length > 0 ? (
                      <div className="mt-3 grid gap-2 border-t border-[var(--line)] pt-3 sm:grid-cols-2">
                        {subs.map((sub) => {
                          const allowed = isPermissionAllowedForRole(
                            role,
                            sub.key,
                          );
                          const isDefault = roleDefaults.has(sub.key);
                          const isExtra =
                            allowed && draft.has(sub.key) && !isDefault;
                          return (
                            <label
                              key={sub.key}
                              className={`flex items-start gap-2 text-sm ${
                                allowed ? "" : "opacity-50"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={allowed && draft.has(sub.key)}
                                disabled={!allowed}
                                onChange={(e) =>
                                  setSubmodule(
                                    mod.key,
                                    sub.key,
                                    e.target.checked,
                                  )
                                }
                                className="mt-0.5 size-4 accent-[var(--accent)]"
                              />
                              <span>
                                <span className="block">
                                  {sub.label}
                                  {!allowed ? (
                                    <span className="ml-1 text-xs font-normal text-[var(--muted)]">
                                      · no aplica a este rol
                                    </span>
                                  ) : isExtra ? (
                                    <span className="ml-1 text-xs font-normal text-[var(--muted)]">
                                      · extra
                                    </span>
                                  ) : null}
                                </span>
                                {sub.description ? (
                                  <span className="mt-0.5 block text-xs text-[var(--muted)]">
                                    {sub.description}
                                  </span>
                                ) : null}
                              </span>
                            </label>
                          );
                        })}
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
              className="rounded-lg bg-[var(--solid)] px-4 py-2.5 text-sm font-medium text-[var(--on-solid)] disabled:opacity-60"
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
                  else setOkMsg(r.error ?? "Permisos guardados");
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
            {selected ? (
              <button
                type="button"
                disabled={pending}
                className="rounded-lg border border-[var(--line)] px-4 py-2.5 text-sm"
                onClick={() => {
                  setDraft(
                    new Set(ROLE_DEFAULT_PERMISSIONS[selected.role] ?? []),
                  );
                  setError(null);
                  setOkMsg(
                    `Borrador con defaults de ${ROLE_LABELS[selected.role]} (guarde para aplicar)`,
                  );
                }}
              >
                Cargar defaults del rol
              </button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
