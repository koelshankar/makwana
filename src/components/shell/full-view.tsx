"use client";

// Full screen for one view (the Room Setup plan, the Design plan or elevation, the Design 3D view).
// The view fills the window as an overlay, which always works and keeps menus and tooltips (they
// portal to <body>) visible; the browser is also asked for real full screen, which some refuse
// (embedded and preview browsers, iframes, an unfocused window). Esc, the button again, or leaving
// browser full screen closes it.

import { Maximize, Minimize } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { leaveBrowserFullscreen, requestBrowserFullscreen } from "@/lib/full-screen";
import { cn } from "@/lib/utils";

/** The open view's classes: on top of the page, filling the window, under menus and dialogs (z-50). */
export const FULL_VIEW_CLASS = "fixed inset-0 z-40";

export function useFullView() {
  const [on, setOn] = useState(false);
  /** `keepBrowser`: another view takes over the browser's full screen (Show customer). */
  const exit = useCallback((keepBrowser = false) => {
    setOn(false);
    if (!keepBrowser) leaveBrowserFullscreen();
  }, []);
  const enter = useCallback(() => {
    setOn(true);
    // Called within the click, which the browser requires; a refusal leaves the window overlay.
    void requestBrowserFullscreen();
  }, []);
  const toggle = useCallback(() => (on ? exit() : enter()), [on, enter, exit]);

  useEffect(() => {
    if (!on) return;
    // Esc in an open menu, list or dialog closes that first.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (e.target instanceof Element && e.target.closest('[role="menu"],[role="listbox"],[role="dialog"],[role="alertdialog"]')) return;
      exit();
    };
    // Esc in browser full screen is taken by the browser: it only reports leaving.
    const onChange = () => !document.fullscreenElement && setOn(false);
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onChange);
    };
  }, [on, exit]);

  // Leaving the screen with this view open: give the browser its window back.
  const onRef = useRef(on);
  onRef.current = on;
  useEffect(() => () => void (onRef.current && leaveBrowserFullscreen()), []);

  return { on, toggle, exit };
}

export function FullViewButton({ on, onToggle, className }: { on: boolean; onToggle: () => void; className?: string }) {
  const Icon = on ? Minimize : Maximize;
  const label = on ? "Exit full screen" : "Full screen";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            aria-pressed={on}
            onClick={onToggle}
            className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg text-mk-ink hover:bg-mk-subtle", className)}
          />
        }
      >
        <Icon className="size-[17px]" />
      </TooltipTrigger>
      <TooltipContent>{on ? "Exit full screen (Esc)" : "Full screen"}</TooltipContent>
    </Tooltip>
  );
}
