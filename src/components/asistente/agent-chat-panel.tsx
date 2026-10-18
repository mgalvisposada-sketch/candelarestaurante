"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Loader2, RotateCcw, Send, Sparkles } from "lucide-react";
import { AgentMarkdown } from "@/components/asistente/agent-markdown";
import { Button } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export type AgentChatMessage = {
  role: "user" | "assistant";
  content: string;
  attachments?: {
    filename: string;
    mimeType: string;
    contentBase64: string;
  }[];
};

function downloadAttachment(att: {
  filename: string;
  mimeType: string;
  contentBase64: string;
}) {
  const binary = atob(att.contentBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: att.mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = att.filename;
  a.click();
  URL.revokeObjectURL(url);
}

const SUGGESTIONS = [
  "¿Cuánto le cuesta a Candela abrir un domingo?",
  "¿Cómo está la liquidez y la CxP hoy?",
  "¿Qué tengo pendiente en el sistema?",
  "Dame un Excel de productos sin inventario para comprar",
  "¿Qué está bajo el stock mínimo?",
  "¿Cómo registro una producción en Cocina?",
];

const STORAGE_KEY = "candela.asistente.messages.v1";

function loadStoredMessages(): AgentChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AgentChatMessage[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m) =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string",
    );
  } catch {
    return [];
  }
}

export function AgentChatPanel({
  orgLabel,
  userRole,
  variant = "page",
  className,
}: {
  orgLabel: string;
  userRole: string;
  variant?: "page" | "widget";
  className?: string;
}) {
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMessages(loadStoredMessages());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)));
    } catch {
      /* ignore quota */
    }
  }, [messages, hydrated]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;

    const nextMessages: AgentChatMessage[] = [
      ...messages,
      { role: "user", content },
    ];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setBusy(true);

    try {
      const res = await fetch("/api/asistente/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const data = (await res.json()) as {
        reply?: string;
        error?: string;
        attachments?: AgentChatMessage["attachments"];
      };
      if (!res.ok) {
        throw new Error(data.error || `Error ${res.status}`);
      }
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: data.reply || "(sin respuesta)",
          attachments: data.attachments?.length ? data.attachments : undefined,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function clearChat() {
    setMessages([]);
    setError(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  const isWidget = variant === "widget";

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--surface)]",
        className,
      )}
    >
      {!isWidget ? (
        <div className="shrink-0 border-b border-[var(--line)] px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-[var(--muted)]">
                Datos de{" "}
                <span className="font-medium text-[var(--ink)]">{orgLabel}</span>
                . Si falta alcance, el agente pregunta antes de calcular.
              </p>
            </div>
            <p className="rounded-md bg-[var(--surface-muted)] px-2.5 py-1 text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">
              {userRole} · Luna
            </p>
          </div>
        </div>
      ) : (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--line)] px-3 py-2">
          <p className="truncate text-[11px] text-[var(--muted)]">
            <span className="font-medium text-[var(--ink)]">{orgLabel}</span>
            {" · "}
            {userRole}
          </p>
          <button
            type="button"
            onClick={clearChat}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[var(--muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"
            title="Nueva conversación"
          >
            <RotateCcw className="size-3" aria-hidden />
            Nueva
          </button>
        </div>
      )}

      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4",
          !isWidget && "px-4 py-4 sm:px-5",
        )}
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col justify-center gap-3 py-4">
            <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <Sparkles className="size-4 shrink-0 text-[var(--accent)]" aria-hidden />
              <span>
                {isWidget
                  ? "Pregunta lo que necesites de Candela"
                  : "Prueba con una de estas:"}
              </span>
            </div>
            <div
              className={cn(
                "grid gap-2",
                isWidget ? "grid-cols-1" : "sm:grid-cols-2",
              )}
            >
              {(isWidget ? SUGGESTIONS.slice(0, 4) : SUGGESTIONS).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-left text-[13px] leading-snug text-[var(--ink)] transition hover:border-[var(--accent)]/35 hover:bg-[var(--surface-muted)]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {messages.map((m, i) => (
              <div
                key={`${m.role}-${i}`}
                className={cn(
                  "flex",
                  m.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "flex flex-col gap-1.5",
                    m.role === "user" ? "max-w-[88%]" : "max-w-[98%] sm:max-w-[94%]",
                  )}
                >
                  <div
                    className={cn(
                      "rounded-2xl px-3 py-2.5 text-[13px] leading-relaxed",
                      m.role === "user"
                        ? "whitespace-pre-wrap bg-[var(--accent)] text-[var(--on-solid)]"
                        : "border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] shadow-[var(--shadow-soft)]",
                    )}
                  >
                    {m.role === "assistant" ? (
                      <AgentMarkdown content={m.content} />
                    ) : (
                      m.content
                    )}
                  </div>
                  {m.role === "assistant" && m.attachments?.length
                    ? m.attachments.map((att) => (
                        <button
                          key={att.filename}
                          type="button"
                          onClick={() => downloadAttachment(att)}
                          className="inline-flex w-fit items-center gap-1.5 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-3 py-2 text-[12px] font-semibold text-[var(--accent)] transition hover:bg-[var(--accent)] hover:text-[var(--on-solid)]"
                        >
                          <Download className="size-3.5" aria-hidden />
                          Descargar {att.filename}
                        </button>
                      ))
                    : null}
                </div>
              </div>
            ))}
            {busy ? (
              <div className="flex items-center gap-2 text-[13px] text-[var(--muted)]">
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                Pensando con datos de Candela…
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-[var(--line)] px-3 py-2.5 sm:px-4">
        {error ? (
          <p className="mb-2 rounded-md bg-[var(--accent-soft)] px-2.5 py-1.5 text-[12px] text-[var(--danger)]">
            {error}
          </p>
        ) : null}
        {!isWidget && messages.length > 0 ? (
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              onClick={clearChat}
              className="inline-flex items-center gap-1 text-[11px] text-[var(--muted)] hover:text-[var(--ink)]"
            >
              <RotateCcw className="size-3" aria-hidden />
              Nueva conversación
            </button>
          </div>
        ) : null}
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={isWidget ? 2 : 2}
            placeholder="Escribe aquí…"
            disabled={busy}
            className="min-h-[40px] max-h-28 flex-1 resize-none rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)] outline-none ring-[var(--accent)] placeholder:text-[var(--muted)] focus:bg-[var(--surface)] focus:ring-2 disabled:opacity-60"
          />
          <Button
            type="submit"
            disabled={busy || !input.trim()}
            className="size-10 shrink-0 !rounded-xl !p-0"
            aria-label="Enviar"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
