import { readdir, readFile } from "fs/promises";
import path from "path";

export type KbDocument = {
  id: string;
  title: string;
  body: string;
};

let cache: KbDocument[] | null = null;

function titleFromMarkdown(body: string, fallback: string): string {
  const match = body.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() || fallback;
}

export async function loadAgentKnowledgeBase(): Promise<KbDocument[]> {
  // En desarrollo recargar siempre para no servir KB viejo tras editar docs.
  if (cache && process.env.NODE_ENV === "production") return cache;

  const dir = path.join(process.cwd(), "docs", "agent-kb");
  try {
    const files = (await readdir(dir))
      .filter((f) => f.endsWith(".md"))
      .sort();
    const docs: KbDocument[] = [];
    for (const file of files) {
      const body = await readFile(path.join(dir, file), "utf8");
      docs.push({
        id: file.replace(/\.md$/, ""),
        title: titleFromMarkdown(body, file),
        body,
      });
    }
    cache = docs;
    return docs;
  } catch (error) {
    console.error("loadAgentKnowledgeBase:", error);
    cache = [
      {
        id: "fallback",
        title: "Candela Admin",
        body:
          "Candela Admin opera caja, tesorería, compras, inventario, cocina, personal y socios. " +
          "No se pudo cargar docs/agent-kb; usa tools de datos y pide al usuario revisar la documentación.",
      },
    ];
    return cache;
  }
}

/** Texto completo del KB para el system prompt (recortado si es enorme). */
export async function getKnowledgeBasePromptBlock(
  maxChars = 48_000,
): Promise<string> {
  const docs = await loadAgentKnowledgeBase();
  const parts = docs.map(
    (d) => `### ${d.title} (${d.id})\n\n${d.body.trim()}`,
  );
  let joined = parts.join("\n\n---\n\n");
  if (joined.length > maxChars) {
    joined =
      joined.slice(0, maxChars) +
      "\n\n[KB truncado: usa search_knowledge_base para secciones específicas.]";
  }
  return joined;
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Búsqueda simple por palabras sobre el KB. */
export async function searchKnowledgeBase(
  query: string,
  limit = 4,
): Promise<{ id: string; title: string; excerpt: string; score: number }[]> {
  const docs = await loadAgentKnowledgeBase();
  const terms = normalize(query)
    .split(/[^a-z0-9áéíóúñü]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
  if (terms.length === 0) {
    return docs.slice(0, limit).map((d) => ({
      id: d.id,
      title: d.title,
      excerpt: d.body.slice(0, 600),
      score: 0,
    }));
  }

  const scored = docs.map((d) => {
    const hay = normalize(`${d.title}\n${d.body}`);
    let score = 0;
    for (const t of terms) {
      if (hay.includes(t)) score += 1;
      const re = new RegExp(t, "gi");
      const hits = hay.match(re);
      if (hits) score += Math.min(hits.length, 8) * 0.15;
    }
    // Excerpt: primer párrafo que contenga un término
    let excerpt = d.body.slice(0, 700);
    for (const line of d.body.split("\n")) {
      const n = normalize(line);
      if (terms.some((t) => n.includes(t)) && line.trim().length > 20) {
        excerpt = line.trim().slice(0, 700);
        break;
      }
    }
    return { id: d.id, title: d.title, excerpt, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
