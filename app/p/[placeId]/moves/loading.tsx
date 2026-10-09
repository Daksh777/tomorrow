/** Shown the moment "What moves your place" is tapped, while the page gathers taps and readings. */
export default function Loading() {
  return (
    <main aria-busy="true" aria-label="Loading">
      <div className="mb-4 h-10" />
      <div className="h-4 w-28 animate-pulse rounded bg-ink/[0.06]" />
      <div className="mt-4 h-7 w-3/4 animate-pulse rounded bg-ink/[0.08]" />
      <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-ink/[0.06]" />
      <div className="mt-4 h-72 animate-pulse rounded-xl bg-ink/[0.05]" />
      <div className="mt-3 h-32 animate-pulse rounded-xl bg-ink/[0.05]" />
    </main>
  );
}
