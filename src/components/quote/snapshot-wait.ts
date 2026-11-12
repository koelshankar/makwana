// When the print page takes its own 3D picture, how long it waits for the offscreen scene. Pure, so
// it is unit-tested: the scene gets a few frames to settle, and after 3 s the quote prints without
// the picture rather than never printing.

export const SNAPSHOT_SETTLE_TRIES = 6;
export const SNAPSHOT_TIMEOUT_MS = 3000;

export type SnapshotStep = "shoot" | "give-up" | "wait";

export function snapshotStep(sceneReady: boolean, tries: number, elapsedMs: number): SnapshotStep {
  const timedOut = elapsedMs >= SNAPSHOT_TIMEOUT_MS;
  if (sceneReady && (tries > SNAPSHOT_SETTLE_TRIES || timedOut)) return "shoot";
  return timedOut ? "give-up" : "wait";
}
