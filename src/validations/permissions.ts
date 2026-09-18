import { z } from "zod";
import { isValidPermissionKey } from "@/lib/permissions-catalog";

export const saveUserPermissionsSchema = z.object({
  membership_id: z.string().uuid(),
  permission_keys: z
    .array(z.string())
    .max(200)
    .refine(
      (keys) => keys.every((k) => isValidPermissionKey(k)),
      "Hay claves de permiso inválidas",
    ),
});
