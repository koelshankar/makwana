import { describe, expect, it } from "vitest";
import { healthyScene, sceneHealth, sceneUnavailable, type SceneEvent } from "./scene-health";

const run = (...events: SceneEvent[]) => events.reduce(sceneHealth, healthyScene);

describe("3D panel health (#3)", () => {
  it("shows the unavailable panel while the WebGL context is lost, mid-session", () => {
    const lost = run("context-lost");
    expect(sceneUnavailable(lost)).toBe(true);
    expect(lost.generation).toBe(0);
  });

  it("remounts the canvas (new generation) when the context comes back", () => {
    const back = run("context-lost", "context-restored");
    expect(sceneUnavailable(back)).toBe(false);
    expect(back.generation).toBe(1);
    expect(run("context-lost", "context-restored", "context-lost", "context-restored").generation).toBe(2);
  });

  it("ignores a restore without a loss and repeated loss events", () => {
    expect(run("context-restored")).toEqual(healthyScene);
    expect(run("context-lost", "context-lost", "context-restored").generation).toBe(1);
  });

  it("stays unavailable after a renderer error, even if a context is restored", () => {
    expect(sceneUnavailable(run("error", "context-lost", "context-restored"))).toBe(true);
  });
});
