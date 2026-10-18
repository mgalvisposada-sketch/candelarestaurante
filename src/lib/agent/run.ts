import OpenAI from "openai";
import { toResponseInputItems } from "openai/lib/responses/ResponseInputItems";
import { buildAgentSystemPrompt } from "@/lib/agent/system-prompt";
import {
  AGENT_TOOL_DEFINITIONS,
  executeAgentTool,
  extractAttachmentFromToolOutput,
  type AgentAttachment,
} from "@/lib/agent/tools";
import type { OrgContext } from "@/lib/org-context";

export type AgentChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const MODEL = process.env.OPENAI_AGENT_MODEL?.trim() || "gpt-6-luna";
const MAX_TOOL_ROUNDS = 8;

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "Falta OPENAI_API_KEY en el entorno. Agrégala en .env y reinicia el servidor.",
    );
  }
  return new OpenAI({ apiKey });
}

function extractOutputText(response: OpenAI.Responses.Response): string {
  if (response.output_text?.trim()) return response.output_text.trim();
  const chunks: string[] = [];
  for (const item of response.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && part.text) chunks.push(part.text);
    }
  }
  return chunks.join("\n").trim();
}

/**
 * Ejecuta un turno del asistente con Responses API + function calling.
 */
export async function runAgentTurn(opts: {
  ctx: OrgContext;
  messages: AgentChatMessage[];
}): Promise<{
  reply: string;
  model: string;
  attachments: AgentAttachment[];
}> {
  const client = getClient();
  const instructions = await buildAgentSystemPrompt(opts.ctx);
  const attachments: AgentAttachment[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let input: any[] = opts.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let response = await client.responses.create({
    model: MODEL,
    instructions,
    tools: AGENT_TOOL_DEFINITIONS,
    input,
    store: false,
  });

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const functionCalls = (response.output ?? []).filter(
      (item) => item.type === "function_call",
    );
    if (functionCalls.length === 0) break;

    input = [...input, ...toResponseInputItems(response.output)];

    for (const call of functionCalls) {
      if (call.type !== "function_call") continue;
      const output = await executeAgentTool(
        call.name,
        call.arguments ?? "{}",
        opts.ctx,
      );
      const att = extractAttachmentFromToolOutput(output);
      if (att) attachments.push(att);
      input.push({
        type: "function_call_output",
        call_id: call.call_id,
        output,
      });
    }

    response = await client.responses.create({
      model: MODEL,
      instructions,
      tools: AGENT_TOOL_DEFINITIONS,
      input,
      store: false,
    });
  }

  let reply =
    extractOutputText(response) ||
    "No pude generar una respuesta. Intenta reformular la pregunta.";

  if (attachments.length > 0 && !/descarg/i.test(reply)) {
    reply +=
      "\n\nPuedes descargar el archivo con el botón que aparece bajo este mensaje (CSV compatible con Excel).";
  }

  return { reply, model: MODEL, attachments };
}
