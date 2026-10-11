export function AppHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="flex items-end justify-between gap-3 border-b border-[var(--line)] bg-[var(--surface)]/90 px-4 py-4 backdrop-blur sm:px-6 md:px-8 md:py-5">
      <div className="min-w-0">
        <h1 className="font-display text-xl font-bold tracking-tight text-[var(--ink)] md:text-2xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 truncate text-sm text-[var(--muted)]">{subtitle}</p>
        ) : null}
      </div>
      <div className="hidden text-right text-xs text-[var(--muted)] sm:block">
        <div className="font-medium uppercase tracking-[0.14em] text-[var(--accent)]">
          America/Bogota
        </div>
        <div className="mt-0.5">Moneda: COP</div>
      </div>
    </header>
  );
}
