"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { onSaveFailed, projectStore, useHydrated } from "@/store/project-store";
import { ScreenBoundary } from "./screen-boundary";
import { ShellSkeleton } from "./shell-skeleton";
import { TopBar } from "./top-bar";

function isTextField(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Shared frame for /setup, /design and /quote: top bar, persisted project, undo shortcuts. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated();
  useEffect(() => {
    void projectStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      // Text fields keep their own undo.
      if (isTextField(e.target)) return;
      e.preventDefault();
      if (e.shiftKey) projectStore.getState().redo();
      else projectStore.getState().undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // An edit to a quote awaiting or holding approval sends it back to draft: say so, wherever it happened.
  useEffect(
    () =>
      projectStore.subscribe((s, prev) => {
        const r = s.ui.returnedToDraft;
        if (r && r !== prev.ui.returnedToDraft) {
          toast.warning(`Quote returned to draft — approval needed again (Version ${r.version})`, { id: "returned-to-draft" });
        }
      }),
    [],
  );

  // Browser storage full or blocked: the screen keeps working, but say that it isn't being saved.
  useEffect(
    () =>
      onSaveFailed(() =>
        toast.error("The project couldn't be saved", {
          id: "save-failed",
          description: "Browser storage is full or blocked. Your changes stay on screen, but a reload would lose them.",
          duration: 10000,
        }),
      ),
    [],
  );

  // A saved project that failed validation was replaced by the empty Mehta room: say so once.
  useEffect(() => {
    if (!hydrated || !projectStore.getState().ui.restoreFailed) return;
    projectStore.getState().clearRestoreFailed();
    toast.warning("The saved project couldn't be opened", { id: "restore-failed", description: "Started from the empty Mehta room instead." });
  }, [hydrated]);

  // Nothing that reads the project renders until the saved one is restored: no flash of the seed.
  if (!hydrated) return <ShellSkeleton />;

  return (
    <ScreenBoundary>
      <div className="flex h-screen min-h-[740px] min-w-[1280px] flex-col bg-mk-panel text-mk-ink">
        <TopBar />
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </div>
    </ScreenBoundary>
  );
}
