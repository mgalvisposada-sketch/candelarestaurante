"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

export function AgentMarkdown({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "agent-md text-[13px] leading-relaxed text-[var(--ink)]",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p className="mb-2 last:mb-0 whitespace-pre-wrap">{children}</p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-[var(--ink)]">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-[var(--ink)]/90">{children}</em>
          ),
          ul: ({ children }) => (
            <ul className="mb-2 list-disc space-y-1 pl-4 last:mb-0">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-2 list-decimal space-y-1 pl-4 last:mb-0">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-snug marker:text-[var(--muted)]">{children}</li>
          ),
          h1: ({ children }) => (
            <h3 className="mb-2 mt-1 text-[15px] font-semibold tracking-tight text-[var(--ink)] first:mt-0">
              {children}
            </h3>
          ),
          h2: ({ children }) => (
            <h3 className="mb-2 mt-1 text-[14px] font-semibold tracking-tight text-[var(--ink)] first:mt-0">
              {children}
            </h3>
          ),
          h3: ({ children }) => (
            <h4 className="mb-1.5 mt-1 text-[13px] font-semibold text-[var(--ink)] first:mt-0">
              {children}
            </h4>
          ),
          hr: () => <hr className="my-3 border-[var(--line)]" />,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[var(--accent)] underline underline-offset-2"
            >
              {children}
            </a>
          ),
          code: ({ className: codeClass, children }) => {
            const isBlock = Boolean(codeClass);
            if (isBlock) {
              return (
                <code className="block overflow-x-auto rounded-lg bg-[var(--surface-muted)] px-3 py-2 font-mono text-[12px] text-[var(--ink)]">
                  {children}
                </code>
              );
            }
            return (
              <code className="rounded bg-[var(--surface-muted)] px-1 py-0.5 font-mono text-[12px] text-[var(--ink)]">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="mb-2 overflow-x-auto last:mb-0">{children}</pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mb-2 border-l-2 border-[var(--accent)]/40 pl-3 text-[var(--muted)] last:mb-0">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="my-2.5 -mx-0.5 overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--surface)] last:mb-0">
              <table className="w-full min-w-[320px] border-collapse text-left text-[12px]">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-[var(--surface-muted)] text-[11px] uppercase tracking-[0.06em] text-[var(--muted)]">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-[var(--line)]">{children}</tbody>
          ),
          tr: ({ children }) => (
            <tr className="transition-colors hover:bg-[var(--surface-muted)]/60">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="whitespace-nowrap px-2.5 py-2 font-semibold first:pl-3 last:pr-3">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-2.5 py-2 align-top text-[var(--ink)] first:pl-3 first:font-medium last:pr-3">
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
