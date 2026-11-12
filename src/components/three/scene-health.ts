// What a 3D panel shows, as a pure state machine (no React, so it is unit-tested). The renderer can
// fail outright (no WebGL, or it throws), or lose its WebGL context mid-session (GPU reset, driver
// update, too many contexts) and later get it back.

export interface SceneHealth {
  /** No WebGL, or the renderer threw: the panel stays unavailable. */
  failed: boolean;
  /** The WebGL context was lost and hasn't come back yet. */
  lost: boolean;
  /** Bumped when a lost context is restored: the canvas is keyed by it, so it remounts cleanly. */
  generation: number;
}

export type SceneEvent = "error" | "context-lost" | "context-restored";

export const healthyScene: SceneHealth = { failed: false, lost: false, generation: 0 };

export function sceneHealth(state: SceneHealth, event: SceneEvent): SceneHealth {
  switch (event) {
    case "error":
      return state.failed ? state : { ...state, failed: true };
    case "context-lost":
      return state.lost ? state : { ...state, lost: true };
    case "context-restored":
      return state.lost ? { ...state, lost: false, generation: state.generation + 1 } : state;
  }
}

/** The "3D view isn't available" panel shows whenever the canvas can't draw. */
export const sceneUnavailable = (s: SceneHealth) => s.failed || s.lost;
