"use client";

// Last line of defence for the configurator screens. The project is saved on every change, so
// reloading brings back exactly what was on screen before the error.

import { RotateCw } from "lucide-react";
import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

export class ScreenBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex h-screen min-h-[740px] min-w-[1280px] flex-col items-center justify-center gap-3 bg-mk-canvas text-center text-mk-ink" role="alert" data-screen-error>
        <div className="mb-2 leading-none">
          <div className="text-[16px] font-semibold tracking-[0.32em]">MAKWANA</div>
          <div className="mt-1.5 text-[8.5px] font-medium tracking-[0.36em] text-mk-muted">MODULAR KULTURE</div>
        </div>
        <p className="text-[16px] font-medium">Something went wrong on this screen</p>
        <p className="max-w-md text-[13.5px] text-mk-muted">Your project is saved. Reload to carry on where you left off.</p>
        <Button size="lg" className="mt-2 h-[42px] gap-2 px-5" onClick={() => window.location.reload()}>
          <RotateCw className="size-4" /> Reload
        </Button>
      </div>
    );
  }
}
