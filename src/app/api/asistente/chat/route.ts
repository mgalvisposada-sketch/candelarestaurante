import { NextResponse } from "next/server";
import { z } from "zod";
import { runAgentTurn } from "@/lib/agent/run";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess } from "@/lib/permissions";

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(12_000),
      }),
    )
    .min(1)
    .max(40),
});

export async function POST(request: Request) {
  const ctx = await getOrgContext();
  if (!ctx?.organization) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!ctxCanAccess(ctx, "asistente") && !ctxCanAccess(ctx, "asistente.chat")) {
    return NextResponse.json(
      { error: "Sin permiso para el Asistente" },
      { status: 403 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 },
    );
  }

  try {
    const result = await runAgentTurn({
      ctx,
      messages: parsed.data.messages,
    });
    return NextResponse.json({
      reply: result.reply,
      model: result.model,
      attachments: result.attachments,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error del asistente";
    const status = message.includes("OPENAI_API_KEY") ? 503 : 500;
    console.error("asistente/chat:", message);
    return NextResponse.json({ error: message }, { status });
  }
}
