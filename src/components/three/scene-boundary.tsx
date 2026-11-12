"use client";

// Every 3D canvas sits inside this boundary. If the device has no WebGL, or the renderer throws
// while starting or drawing, the panel says so and the rest of the screen keeps working.

import { Box } from "lucide-react";
import { Component, type ReactNode } from "react";
import { cn } from "@/lib/utils";

let webgl: boolean | undefined;

/** Whether a WebGL context can be created here. Checked once; a throwaway canvas, never attached. */
export function hasWebGL(): boolean {
  if (typeof document === "undefined") return true;
  if (webgl === undefined) {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      webgl = !!gl;
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      webgl = false;
    }
  }
  return webgl;
}

export function SceneUnavailable({ className }: { className?: string }) {
  return (
    <div className={cn("absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#f1efeb] px-6 text-center", className)} role="status" data-three-unavailable>
      <Box className="size-6 text-mk-faint" strokeWidth={1.5} />
      <p className="text-[13.5px] font-medium text-mk-ink-2">3D view isn&apos;t available on this device</p>
      <p className="max-w-[260px] text-[12px] text-mk-muted">The plan, elevations, checks and quote all still work.</p>
    </div>
  );
}

interface Props {
  children: ReactNode;
  /** Called once when the 3D view can't be shown (no WebGL, or it failed). */
  onUnavailable?: () => void;
  fallback?: ReactNode;
}

export class SceneBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: !hasWebGL() };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidMount() {
    if (this.state.failed) this.props.onUnavailable?.();
  }

  componentDidCatch() {
    this.props.onUnavailable?.();
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return this.props.fallback === undefined ? <SceneUnavailable /> : this.props.fallback;
  }
}
