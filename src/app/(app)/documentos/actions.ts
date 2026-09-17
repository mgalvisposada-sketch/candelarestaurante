"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org-context";
import { documentMetaSchema } from "@/validations/documents";
import type { ActionResult } from "../empresa/actions";

function emptyToNull(value: string | null | undefined) {
  if (value === undefined || value === null || String(value).trim() === "")
    return null;
  return String(value).trim();
}

export async function registerDocumentAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Primero configura la empresa" };

  const parsed = documentMetaSchema.safeParse({
    name: formData.get("name"),
    document_type: formData.get("document_type"),
    entity_type: formData.get("entity_type") || "other",
    entity_id: formData.get("entity_id"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Seleccione un archivo" };
  }

  const maxBytes = 20 * 1024 * 1024;
  if (file.size > maxBytes) {
    return { ok: false, error: "El archivo supera 20 MB" };
  }

  const supabase = await createClient();
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const storagePath = `${ctx.organization.id}/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) return { ok: false, error: uploadError.message };

  const { data, error } = await supabase
    .from("documents")
    .insert({
      organization_id: ctx.organization.id,
      name: parsed.data.name.trim(),
      document_type: emptyToNull(parsed.data.document_type),
      file_size: file.size,
      mime_type: file.type || null,
      storage_path: storagePath,
      entity_type: parsed.data.entity_type,
      entity_id: emptyToNull(parsed.data.entity_id),
      uploaded_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) {
    await supabase.storage.from("documents").remove([storagePath]);
    return { ok: false, error: error.message };
  }

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "CREATE",
    entity: "documents",
    entity_id: data.id,
  });

  revalidatePath("/documentos");
  return { ok: true, id: data.id };
}

export async function softDeleteDocumentAction(
  documentId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("documents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", documentId)
    .eq("organization_id", ctx.organization.id);

  if (error) return { ok: false, error: error.message };

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "DELETE",
    entity: "documents",
    entity_id: documentId,
  });

  revalidatePath("/documentos");
  return { ok: true, id: documentId };
}

export async function getSignedDocumentUrlAction(
  documentId: string,
): Promise<ActionResult & { url?: string }> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) return { ok: false, error: "Sin organización" };

  const supabase = await createClient();
  const { data: doc, error } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", documentId)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !doc) return { ok: false, error: error?.message ?? "Documento no encontrado" };

  const { data: signed, error: signError } = await supabase.storage
    .from("documents")
    .createSignedUrl(doc.storage_path, 60 * 10);

  if (signError || !signed?.signedUrl) {
    return { ok: false, error: signError?.message ?? "No se pudo firmar la URL" };
  }

  return { ok: true, url: signed.signedUrl };
}
