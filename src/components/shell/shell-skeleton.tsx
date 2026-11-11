/** Neutral placeholder shown until the saved project has been restored. */
export function ShellSkeleton() {
  const bar = "animate-pulse rounded-md bg-mk-subtle";
  return (
    <div aria-busy="true" aria-label="Loading project" className="flex h-screen min-h-[740px] min-w-[1280px] flex-col bg-mk-panel">
      <header className="grid h-16 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-mk-line px-7">
        <div className="flex items-center gap-6">
          <div className="leading-none">
            <div className="text-[16px] font-semibold tracking-[0.32em] text-mk-ink">MAKWANA</div>
            <div className="mt-1.5 text-[8.5px] font-medium tracking-[0.36em] text-mk-muted">MODULAR KULTURE</div>
          </div>
          <span className="h-9 w-px bg-mk-line" />
          <div className="space-y-1.5">
            <div className={`${bar} h-3.5 w-36`} />
            <div className={`${bar} h-3 w-28`} />
          </div>
        </div>
        <div className={`${bar} h-6 w-[420px]`} />
        <div className="flex items-center justify-end gap-3.5">
          <div className={`${bar} h-8 w-40`} />
          <div className="size-10 rounded-full bg-mk-subtle" />
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="w-[300px] space-y-3 border-r border-mk-line p-6">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={`${bar} h-14`} />
          ))}
        </div>
        <div className="flex-1 bg-mk-canvas" />
      </div>
      <div className="h-[72px] border-t border-mk-line" />
    </div>
  );
}
