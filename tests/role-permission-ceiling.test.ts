import { describe, expect, it } from "vitest";
import {
  ALL_PERMISSION_KEYS,
  clampPermissionKeysToRole,
  ROLE_DEFAULT_PERMISSIONS,
  ROLE_PERMISSION_CEILING,
} from "@/lib/permissions-catalog";
import { resolveEffectivePermissions } from "@/lib/permissions";
import type { AppRole } from "@/types/domain";

const ROLES = Object.keys(ROLE_DEFAULT_PERMISSIONS) as AppRole[];

describe("ROLE_PERMISSION_CEILING", () => {
  it("defaults ⊆ ceiling para cada rol", () => {
    for (const role of ROLES) {
      const ceiling = new Set(ROLE_PERMISSION_CEILING[role]);
      for (const key of ROLE_DEFAULT_PERMISSIONS[role]) {
        expect(ceiling.has(key), `${role} default ${key} no está en techo`).toBe(
          true,
        );
      }
    }
  });

  it("claves del ceiling ⊆ ALL_PERMISSION_KEYS", () => {
    const catalog = new Set(ALL_PERMISSION_KEYS);
    for (const role of ROLES) {
      for (const key of ROLE_PERMISSION_CEILING[role]) {
        expect(catalog.has(key), `${role} ceiling ${key} inválida`).toBe(true);
      }
    }
  });

  it("ningún techo (salvo SUPER_ADMIN) incluye configuracion.usuarios", () => {
    for (const role of ROLES) {
      if (role === "SUPER_ADMIN") continue;
      expect(ROLE_PERMISSION_CEILING[role]).not.toContain(
        "configuracion.usuarios",
      );
    }
  });
});

describe("clampPermissionKeysToRole", () => {
  it("ADMIN_LOCAL elimina compras.solicitudes.aprobar", () => {
    const out = clampPermissionKeysToRole("ADMIN_LOCAL", [
      "compras",
      "compras.solicitudes",
      "compras.solicitudes.crear",
      "compras.solicitudes.aprobar",
      "compras.solicitudes.recibir",
    ]);
    expect(out).not.toContain("compras.solicitudes.aprobar");
    expect(out).toContain("compras.solicitudes.crear");
    expect(out).toContain("compras.solicitudes.recibir");
  });

  it("LECTURA elimina configuracion.permisos", () => {
    const out = clampPermissionKeysToRole("LECTURA", [
      "inicio",
      "configuracion",
      "configuracion.permisos",
      "documentos",
    ]);
    expect(out).not.toContain("configuracion.permisos");
    expect(out).not.toContain("configuracion");
    expect(out).toContain("inicio");
    expect(out).toContain("documentos");
  });

  it("CONTADOR no puede recibir solicitudes-pago.aprobar", () => {
    const out = clampPermissionKeysToRole("CONTADOR", [
      "solicitudes-pago",
      "solicitudes-pago.bandeja",
      "solicitudes-pago.aprobar",
      "solicitudes-pago.pagar",
    ]);
    expect(out).not.toContain("solicitudes-pago.aprobar");
    expect(out).toContain("solicitudes-pago.pagar");
  });
});

describe("resolveEffectivePermissions + techo", () => {
  it("respeta el techo aunque DB tenga filas ilegales", () => {
    const keys = resolveEffectivePermissions({
      role: "ADMIN_LOCAL",
      storedKeys: [
        "compras",
        "compras.solicitudes",
        "compras.solicitudes.aprobar",
        "compras.solicitudes.crear",
        "inventario.fisico.ajustar",
      ],
    });
    expect(keys).not.toContain("compras.solicitudes.aprobar");
    expect(keys).not.toContain("inventario.fisico.ajustar");
    expect(keys).toContain("compras.solicitudes.crear");
  });

  it("si solo hay claves ilegales, cae a defaults del rol", () => {
    const keys = resolveEffectivePermissions({
      role: "LECTURA",
      storedKeys: ["compras.solicitudes.aprobar", "configuracion.permisos"],
    });
    expect(keys).toEqual([...ROLE_DEFAULT_PERMISSIONS.LECTURA]);
  });
});
