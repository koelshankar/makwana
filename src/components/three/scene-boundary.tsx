"use client";

// Every 3D canvas sits inside this boundary. If the device has no WebGL, the renderer throws while
// starting or drawing, or the WebGL context is lost mid-session, the panel says so and the rest of
// the screen keeps working. When a lost context is restored, the canvas remounts.

import { Box } from "lucide-react";
import { Component, createContext, Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { healthyScene, sceneHealth, sceneUnavailable, type SceneEvent, type SceneHealth } from "./scene-health";

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

/** How a canvas inside the boundary reports WebGL context loss and restore. */
export const SceneEvents = createContext<((event: Exclude<SceneEvent, "error">) => void) | null>(null);

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
  /** Called when the 3D view can't be shown (no WebGL, it failed, or its context was lost). */
  onUnavailable?: () => void;
  fallback?: ReactNode;
}

export class SceneBoundary extends Component<Props, SceneHealth> {
  state: SceneHealth = hasWebGL() ? healthyScene : sceneHealth(healthyScene, "error");

  static getDerivedStateFromError(): Partial<SceneHealth> {
    return { failed: true };
  }

  componentDidMount() {
    if (this.state.failed) this.props.onUnavailable?.();
  }

  componentDidCatch() {
    this.props.onUnavailable?.();
  }

  private report = (event: Exclude<SceneEvent, "error">) => {
    const wasUnavailable = sceneUnavailable(this.state);
    this.setState((s) => sceneHealth(s, event));
    if (event === "context-lost" && !wasUnavailable) this.props.onUnavailable?.();
  };

  render() {
    const { failed, generation } = this.state;
    const panel = this.props.fallback === undefined ? <SceneUnavailable /> : this.props.fallback;
    if (failed) return panel;
    // While the context is lost the canvas stays mounted (it is the element that receives the
    // restore event) under the panel; on restore the new generation key remounts it.
    return (
      <SceneEvents.Provider value={this.report}>
        <Fragment key={generation}>{this.props.children}</Fragment>
        {sceneUnavailable(this.state) && panel}
      </SceneEvents.Provider>
    );
  }
}
