"use client";

// The one error page design, used by the configurator's screen boundary, app/error.tsx and
// app/global-error.tsx. Reload keeps the saved project; Start over clears it, for when the saved
// project is what keeps failing.

import { RotateCw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PERSIST_KEY, startOver } from "@/store/project-store";

function reload() {
  window.location.reload();
}

function startOverAndOpenSetup() {
  try {
    startOver();
  } catch {
    // Even if the store can't reset, clearing storage below still breaks a crash loop.
    try {
      window.localStorage.removeItem(PERSIST_KEY);
    } catch {
      // Blocked storage: nothing saved to clear.
    }
  }
  window.location.assign("/setup");
}

export function ErrorScreen() {
  return (
    <div className="flex h-screen min-h-[740px] min-w-[1280px] flex-col items-center justify-center gap-3 bg-mk-canvas text-center text-mk-ink" role="alert" data-screen-error>
      <div className="mb-2 leading-none">
        <div className="text-[16px] font-semibold tracking-[0.32em]">MAKWANA</div>
        <div className="mt-1.5 text-[8.5px] font-medium tracking-[0.36em] text-mk-muted">MODULAR KULTURE</div>
      </div>
      <p className="text-[16px] font-medium">Something went wrong on this screen</p>
      <p className="max-w-md text-[13.5px] text-mk-muted">Your project is saved. Reload to carry on where you left off.</p>
      <div className="mt-2 flex items-center gap-3">
        <Button size="lg" className="h-[42px] gap-2 px-5" onClick={reload} data-error-reload>
          <RotateCw className="size-4" /> Reload
        </Button>
        <Button size="lg" variant="outline" className="h-[42px] gap-2 px-5" onClick={startOverAndOpenSetup} data-error-start-over>
          <Undo2 className="size-4" /> Start over
        </Button>
      </div>
      <p className="max-w-md text-[12.5px] text-mk-faint">If Reload shows this page again, Start over clears the saved project and opens the empty Mehta room.</p>
    </div>
  );
}
