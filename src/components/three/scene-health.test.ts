import { describe, expect, it } from "vitest";
import { healthyScene, sceneHealth, sceneUnavailable, type SceneEvent } from "./scene-health";

const run = (...events: SceneEvent[]) => events.reduce(sceneHealth, healthyScene);

describe("3D panel health (#3)", () => {
  it("shows the unavailable panel while the WebGL context is lost, mid-session", () => {
    expect(sceneUnavailable(run("context-lost"))).toBe(true);
  });

  it("shows the 3D view again when the context comes back, as often as it is lost", () => {
    expect(run("context-lost", "context-restored")).toEqual(healthyScene);
    expect(run("context-lost", "context-restored", "context-lost", "context-restored")).toEqual(healthyScene);
  });

  it("ignores a restore without a loss and repeated loss events", () => {
    expect(run("context-restored")).toEqual(healthyScene);
    expect(run("context-lost", "context-lost", "context-restored")).toEqual(healthyScene);
  });

  it("stays unavailable after a renderer error, even if a context is restored", () => {
    expect(sceneUnavailable(run("error", "context-lost", "context-restored"))).toBe(true);
  });
});
