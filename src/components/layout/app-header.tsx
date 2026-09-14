export function AppHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="flex items-end justify-between border-b border-[var(--line)] bg-[var(--surface)]/90 px-8 py-5 backdrop-blur">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--ink)]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p>
        ) : null}
      </div>
      <div className="text-right text-xs text-[var(--muted)]">
        <div className="font-medium uppercase tracking-[0.14em] text-[var(--accent)]">
          America/Bogota
        </div>
        <div className="mt-0.5">Moneda: COP</div>
      </div>
    </header>
  );
}
