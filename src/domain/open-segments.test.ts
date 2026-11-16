// Feedback 1, item 1: deleting a wall leaves an open segment, so no other wall moves.

import { describe, expect, it } from "vitest";
import { catalogue } from "./catalogue";
import { findWall, isChainClosed, isRoomClosed, roomOutline, roomVertices, solidWalls, wallFrames } from "./geometry";
import { isUsableProject } from "./project-validation";
import { closingHint, cornerNames, roomGaps, validateRoom } from "./room-validation";
import { emptyMehta } from "./seed";
import { roomModel } from "./three-model";
import type { Room } from "./types";

const mehta = emptyMehta.room;
const openWall = (room: Room, ...ids: string[]): Room => ({
  ...room,
  walls: room.walls.map((w) => (ids.includes(w.id) ? { ...w, open: true as const } : w)),
  features: room.features.filter((f) => !("wallId" in f) || !ids.includes(f.wallId)),
});

describe("open segments", () => {
  const gapC = openWall(mehta, "C");

  it("keep every corner where it was: no other wall moves", () => {
    expect(roomVertices(gapC)).toEqual(roomVertices(mehta));
    expect(roomOutline(gapC, 0).inner).toEqual(roomOutline(mehta, 0).inner);
    const before = new Map(wallFrames(mehta).map((f) => [f.wallId, f]));
    for (const f of wallFrames(gapC)) expect(f).toEqual(before.get(f.wallId));
  });

  it("are not walls: no frame, no findWall, not counted as standing", () => {
    expect(wallFrames(gapC).map((f) => f.wallId)).toEqual(["A", "B", "D", "E", "F", "G", "H"]);
    expect(wallFrames(gapC).find((f) => f.wallId === "D")!.index).toBe(3); // chain index kept
    expect(findWall(gapC, "C")).toBeUndefined();
    expect(solidWalls(gapC)).toHaveLength(7);
  });

  it("make the room open, though its chain still closes", () => {
    expect(isChainClosed(gapC)).toBe(true);
    expect(isRoomClosed(gapC)).toBe(false);
    expect(closingHint(gapC)).toBeNull();
  });

  it("are reported by room validation with their neighbours", () => {
    expect(roomGaps(gapC)).toEqual([{ wallId: "C", lengthMm: 1600, heading: "W", between: " between Wall B and Wall D" }]);
    const v = validateRoom(gapC);
    expect(v.ok).toBe(false);
    expect(v.issues).toEqual([{ wallId: "C", message: "Wall C is open: draw a wall in the 1600 mm gap between Wall B and Wall D." }]);
    // Wall A's gap wraps round to H; two gaps side by side name only their standing neighbours.
    expect(roomGaps(openWall(mehta, "A"))[0].between).toBe(" between Wall H and Wall B");
    expect(roomGaps(openWall(mehta, "B", "C")).map((g) => g.between)).toEqual([" next to Wall A", " next to Wall D"]);
  });

  it("have no wall thickness in the outline and no corner names", () => {
    const outer = roomOutline(gapC, 100).outer;
    const full = roomOutline(mehta, 100).outer;
    // B/C and C/D corners (vertices 2 and 3) take only their standing wall's offset.
    expect(outer[2]).toEqual({ x: full[2].x, y: full[2].y - 100 });
    expect(outer[0]).toEqual(full[0]);
    expect(cornerNames(gapC).map((c) => c.name)).not.toContain("C/B");
    expect(cornerNames(gapC).map((c) => c.name)).not.toContain("D/C");
  });

  it("have no 3D wall; the walls either side stop square", () => {
    const model = roomModel(gapC, "full");
    expect(model.walls.some((w) => w.wallId === "C")).toBe(false);
    expect(model.normals.C).toBeUndefined();
    expect(model.walls.filter((w) => w.wallId === "B").length).toBeGreaterThan(0);
  });

  it("are a valid save", () => {
    expect(isUsableProject({ ...emptyMehta, room: gapC }, catalogue)).toBe(true);
    expect(isUsableProject({ ...emptyMehta, room: { ...gapC, walls: gapC.walls.map((w) => (w.id === "C" ? { ...w, open: "yes" } : w)) } }, catalogue)).toBe(false);
  });

  it("an open end still gets the Close room hint", () => {
    const shorter = { ...gapC, walls: gapC.walls.slice(0, 7), features: gapC.features.filter((f) => f.kind !== "door") };
    expect(closingHint(shorter)?.summary).toBe("2400 mm");
    expect(validateRoom(shorter).issues.map((i) => i.message)).toEqual([
      "Wall C is open: draw a wall in the 1600 mm gap between Wall B and Wall D.",
      "The room isn't closed yet (open by 2400 mm).",
    ]);
  });
});
