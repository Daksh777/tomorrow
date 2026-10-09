/** Shown the moment a place is opened, while its card and last week's readings load. */
export default function Loading() {
  return (
    <main aria-busy="true" aria-label="Loading tomorrow's card">
      <div className="mb-4 flex h-10 items-center justify-between">
        <div className="h-5 w-24 animate-pulse rounded bg-ink/[0.08]" />
        <div className="h-5 w-32 animate-pulse rounded bg-ink/[0.06]" />
      </div>
      <section className="rounded-xl border border-ink/[0.07] bg-surface px-5 pb-5 pt-4">
        <div className="flex justify-between">
          <div className="h-4 w-20 animate-pulse rounded bg-ink/[0.06]" />
          <div className="h-4 w-16 animate-pulse rounded bg-ink/[0.06]" />
        </div>
        <div className="mt-4 h-7 w-11/12 animate-pulse rounded bg-ink/[0.08]" />
        <div className="mt-2 h-7 w-2/3 animate-pulse rounded bg-ink/[0.08]" />
        <div className="mt-5 h-[170px] animate-pulse rounded-lg bg-ink/[0.05]" />
        <div className="mt-5 grid grid-cols-5 gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-9 animate-pulse rounded bg-ink/[0.05]" />
          ))}
        </div>
        <div className="mt-4 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-5 animate-pulse rounded bg-ink/[0.05]" />
          ))}
        </div>
        <div className="mt-4 h-24 animate-pulse rounded-lg bg-ink/[0.05]" />
      </section>
      <p className="mt-3 text-center text-xs text-ink/45">The first card for a new place takes up to half a minute: we check every signal near you.</p>
    </main>
  );
}
