# Plan: start a wall from any free end (item 1) and the inside-corner door clash rule (item 4)

Feedback 2, Part B. Plan only: no code has been written for either item. Branch `feedback-1`.

---

# Decisions 2026-11-16

Answers to the open questions at the end of this doc. Build order: the `insideCorners` helper, then item 4, then item 1. After item 1, every item 4 test runs again, plus one test where a wall drawn from a clicked free end makes the inside corner. One commit per item, all gates before each commit (`npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run e2e` with the 2 known skips). Not merged to `main`.

**Item 4: inside-corner door clash**
- **Two cases, two fixes.**
  - **a) Hidden front** (part of a front sits behind a neighbour's side): **Blocked** for every unit type. The Blocked card's fix is "Move clear of corner": the unit moves along its wall until its front is clear, if a valid spot exists. If none exists there is no fix button, and the message says why.
  - **b) Handle clash** (two fronts meet at the corner): **Blocked** if either unit is tall; **Warning** for base or wall units. Fix: "Add corner filler", the existing "Filler panel" (FIL) at the clearance width; the unit moves along its wall by that width. If the wall has no room, there is no fix button, and the message says why.
- **Blocked keeps its meaning**: it can't be placed, and it hides the quote and the PDF. No new severity.
- **Height bands decide clashes.** Same band clashes; lofts follow the same rule (loft with loft); tall clashes with every band. Base next to a wall unit doesn't clash.
- **Clearance**: one config constant per handle type (with handle, handleless), 50 mm for both by default, marked "TO CONFIRM WITH MAKWANA" in the code and in `HARDENING.md`'s open items. No new "Corner filler" SKU.
- **The old corner rule** is merged into the new one (case a); no unit gets two messages for the same corner.
- **Sample design**: the A/B corner (BD600/BC1000, W900/W600) is fixed in the seed so the sample is clean.
- **Demo script and brief**: one new step: make a corner clash, see the warning, click "Add corner filler", the quote shows the filler.
- **e2e**: case a) blocked and fixed; case b) tall blocked; case b) base warning and fixed; base next to a wall unit at a corner: no clash.

**Item 1: start a wall from any free end**
- **Free ends only.** No branches or T-junctions.
- **Joining**: a new wall joins another only when it exactly closes its own gap (it ends on the gap's other free end). In every other case it stays open.
- **Order**: tabs and lists follow room order (A B C J D…), not alphabetical. Walls are not renamed.
- **Default start** with no click: the first free end in room order (today's behaviour).
- **Old saves** load with no migration. A test loads a project saved before this change.
- **e2e**: click a free end and draw: the wall starts there; click a joined end: nothing happens; close a gap exactly: the walls join.

**Kept**: the inspector's square turn button.

**Built** (same day): the `insideCorners` helper, item 4 and item 1, one commit each on `feedback-1`. What was built, the behaviour changes and the tests are in `docs/HARDENING.md` ("Item 4" and "Item 1" under Feedback 2).

---

# Item 1: Start a new wall from the end of any wall (by click)

## 1. The current model

**Storage.** `Room.walls: Wall[]` (`src/domain/types.ts`) is one ordered chain. Each `Wall` is `{ id, lengthMm, heading, label?, open? }`. There is no stored point anywhere: Wall A starts at (0, 0), and each wall starts where the one before it ends (`roomVertices`, `src/domain/geometry.ts:44`). A heading is the direction of travel.

**Start point of a new wall.** Always the end of the last element in the list. `addWall` / `appendWalls` push onto `room.walls` (`src/store/project-store.ts`, `addWall`). The Room Setup form `AddWallFlow` (`src/components/setup/walls-section.tsx`) only offers headings at a right angle to the last wall, "turning off Wall X".

**Open segments (Feedback 1, item 1).** A deleted wall stays in the list with `open: true`, keeping its letter, length and heading, so every later vertex stays put. Open segments:
- have no frame (`wallFrames` skips them, keeping the chain `index`);
- have no thickness in the outline (`roomOutline`), no 3D box (`wallExtents`), no corner (`cornerRule`, `cornerNames`);
- are reported as gaps (`roomGaps`), can be restored exactly ("Draw Wall C", `fillGap`), and are filled by Close room (`closeRoom`);
- hold their letter (`nextWallLetter` skips it).

**Closed vs. ready.**
- `isChainClosed`: the last vertex returns to (0, 0) and there are at least 4 elements.
- `isRoomClosed`: the chain is closed and there is no open segment.
- `validateRoom` fails while there is a gap or an open end. Design and Quote stay locked until it passes (`design-screen.tsx` `if (!room.ok)`, `quote-screen.tsx`, top bar).

**Key consequence.** Units, corners, Move/turn, 3D, the quote and the PDF only ever run on one closed loop of standing walls. A multi-run room exists only while the salesperson is in Room Setup.

**Where the code assumes one continuous chain** (index i is followed by i + 1, starting at (0, 0)):

| File | What assumes the chain |
|---|---|
| `src/domain/geometry.ts` | `roomVertices` (start (0, 0), each wall from the previous end), `signedArea` (closes with the chord to (0, 0)), `isChainClosed`, `wallSegments` (one inward-normal side for the whole chain, from the area sign), `wallFrames` (`index`), `roomOutline` (`inner[i]`, the neighbour at i − 1, the open-end case) |
| `src/domain/room-validation.ts` | `validateRoom` (right angle between list neighbours, including open segments; first/last wall at closure; column inside the polygon), `roomGaps` (neighbours by index, with wrap), `closingHint` (last vertex back to (0, 0); last and first headings), `cornerNames` (previous wall by index) |
| `src/domain/rules/fit.ts` | `cornerRule`: corner = `segs[i]` → `segs[i + 1]`, inside if the turn sign equals the area sign |
| `src/domain/rules/context.ts` | `nextWallId`: next frame in chain order, with wrap (used by the window rule's "Move to Wall B" fix) |
| `src/domain/three-model.ts` | `wallExtents` (next segment by index, wrap when closed), `ductBox` (vertices and segments sliced by index between `fromWallId` and `toWallId`), `roomModel` (floor = `roomOutline` inner) |
| `src/domain/turn.ts` | `nextWall`: the A→Z order is `solidWalls` order, which is chain order, with wrap (R / Shift+R, Move list order) |
| `src/domain/project-validation.ts` | Save check: a wall's `open` must be `true` or absent; no other fields are accepted |
| `src/store/project-store.ts` | `addWall`, `appendWalls` (push at the end), `replaceWalls` (letters by index), `removeWall`, `fillGap`, `closeRoom` (`closingHint`), `nextWallLetter`; `PERSIST_VERSION = 2` and `migrate` (any other version is **replaced by the seed**) |
| `src/components/setup/walls-section.tsx` | `AddWallFlow` (allowed headings from the last wall), the Close room row (gaps and the hint), the walls list in chain order |
| `src/components/setup/plan/room-plan.tsx`, `plan-base.tsx`, `plan-geometry.ts` | Closing-hint drawing, gap click → "Draw Wall C", walls drawn from `outline.inner[f.index]`, dimensions from the outline |
| `src/lib/room-format.ts` | Column description by `cornerNames` |
| Design tabs, wall pickers, `print-quote.tsx` elevations, `quote.ts` wall count | Iterate `solidWalls` in chain order. Unaffected by runs because they only run on a closed room |

Not chain-based: features (`wallId` + offset, or the column's absolute x/y), placements (`wallId`, `layer`, `offsetMm`). Both stay valid as long as no existing vertex moves.

## 2. Which ends are clickable

| Option | What it allows | Cost |
|---|---|---|
| **Free ends only** | Chain end (end of the last standing wall when the chain is open); chain start (start of Wall A, open chain only); each end of a standing wall that borders a gap | Small. The room stays one loop with gaps in it, and every downstream consumer keeps working on one closed loop. Mostly Room Setup and gap geometry. ~3.5–4 days (section 6) |
| **Also joined ends (branch / T-junction)** | A third wall from a vertex where two walls already meet: partitions, peninsulas, a T | Large. The room becomes a graph, not a loop. Needs nodes and edges, finding the floor face(s), the interior side per wall (no single area sign), T and cross joins in the outline and 3D wall boxes, corners with three walls, which face of a partition units go on (two elevations per wall), and save migration. Every file in the table above changes. Estimate 2–3 weeks. It also clashes with V1 scope, which leaves out niches and columns for placement |

**I agree: free ends only.** A T-junction only matters for partitions and peninsulas, and V1 does not place units on those. Once the room is closed with no gaps there are no free ends. To change the shape you delete a wall first (that leaves a gap with two free ends), which is how it works today.

## 3. Model change

**Conceptual model: runs.** Your model is a list of runs, each a start point plus a chain of (length, heading). That is the right way to think about it and to explain it. A run boundary is a gap: run 1 ends, a gap follows, run 2 starts.

**Recommended storage: keep the one ordered list and make a gap carry its own offset.** This is the same information as runs, written down differently:
- `room.walls` stays the loop order. A run's start point is wherever the gap before it ends.
- An open segment today is a deleted wall with its axis-aligned length and heading. When you draw from a gap end, the gap left over is usually not axis-aligned. Example: a 1600 mm W gap, and you draw 1000 mm S from its start. The rest of the gap goes diagonally back.
- So an open segment gets an optional vector, `gapMm?: { dx, dy }`, which replaces length and heading for `roomVertices`. A deleted wall's own gap has no vector and is still restorable with "Draw Wall C". A gap you have drawn into loses that button: Close room / "Close gap" fills it instead (below).
- `room.start?: Point`, default (0, 0): the start of the first element. It's needed when you draw backwards from Wall A's start. Prepending would otherwise move every vertex, and with them the column's absolute x/y.

**Why not a separate `runs: Run[]` list in the save.**
- (a) It changes the shape of the save. Today `migrate` replaces any other-version save with the seed, so you would also have to write a real migration.
- (b) Every index-based consumer in the table needs rewriting, and they would only ever see one run anyway once the room is ready.
- (c) Run order around the room has to be stored either way.

With the list-plus-vectors form, old saves load unchanged: a gap with no vector is today's open segment. The change is additive: the validator accepts two optional fields and `PERSIST_VERSION` stays 2.

**Drawing from each kind of free end** (one undoable step each):

| Clicked end | Where the new wall goes in the list | Stored heading |
|---|---|---|
| Chain end | Appended, as today | As drawn |
| End of the wall before a gap | Inserted before the gap; the gap's vector shrinks by the new wall's vector | As drawn |
| Start of the wall after a gap | Inserted after the gap; the gap's vector shrinks | Opposite of the drawn direction (travel ends at that wall's start) |
| Chain start (Wall A's start, open chain) | Inserted at index 0; `room.start` moves back by its vector | Opposite of the drawn direction |

Every existing vertex stays where it is in all four cases.

**Closing a gap or touching another run's end.**
- **Join only when the new wall ends exactly on the other side of the same gap.** That is the gap's vector reaching (0, 0). The gap element is removed, the two runs become one, and the existing right-angle check applies at the new joint.
- **Every other contact does not join.** That covers touching or crossing another run's end, landing mid-wall, or overshooting the gap. The wall is drawn, and validation reports "Wall J runs into Wall E", which keeps the room open. This needs a new check: today nothing detects crossing walls (a too-long wall can already cross another). It is cheap because all walls are axis-aligned.
  - Reason: joining to anything other than the gap's own far side changes the loop order (a run would be cut out or end up inside the room). That is the branch case again.
- **"Close gap" / Close room.** For a vector gap this uses the same one-or-two right-angle walls as `closingHint`, generalised from "last vertex → (0, 0)" to "gap start → gap end" with the headings on both sides. Close room keeps doing all gaps plus the open end in one step.
- **Existing limit, kept.** Two walls in a row must turn a right angle (`validateRoom`). So a straight gap can't be filled with two collinear walls (1000 W, then 600 W). That needs a turn, or Draw Wall C.

## 4. Effect on other parts

- **Corner detection (item 4).** A corner is still two consecutive standing walls with no gap between them, and it is inside if the turn sign equals the area sign. A gap element between two walls means there is no corner, as open segments already work. Since Design needs a closed room with no gaps, at design time the corners are every vertex of the one loop. The corner model does **not** change with this plan. Item 4 should use one shared `insideCorners(room)` helper, so a later change to the model touches one function.
- **Undo/redo.** Each draw is one `edit()`, so one history step, as `addWall` is now. The picked start end is Room Setup view state (`setup-ui.ts`), not project data, so it is not undone. After an undo, the pick resets to the default if the picked end no longer exists.
- **Saved / old projects.**
  - Additive: `gapMm` on an open segment and `room.start` are optional, and `project-validation.ts` must accept them. Old saves load as they are. No version bump, so `migrate` doesn't discard anything.
  - Risk: an older build that reads a new save with `gapMm` fails validation and loads the empty Mehta room with "couldn't be opened". Put the same build on both Macs.
- **Validation.**
  - The right-angle check skips gap elements on both sides; today it also checks open segments against their neighbours.
  - New: crossing/touching walls.
  - Gap messages for vector gaps: "The room is open between Wall C and Wall J (600 × 1000 mm)".
  - `closingHint` is unchanged for the open end.
  - The column-inside-room check keeps needing a closed chain.
- **3D.** It only renders a closed, valid room (Design locked; Quote gated). `wallExtents` already treats a gap neighbour as "stop square". Nothing changes beyond `roomVertices` reading gap vectors and `room.start`. The floor polygon of an open room would have a diagonal edge across a vector gap, but the 3D view is never shown for an open room.
- **PDF / quote.** Same as 3D: only reachable with a valid room. Wall count and elevations use standing walls. No change.
- **Letters and order.** A new wall takes the next free letter (as today) but sits in loop order. So the plan, the walls list, the Design tabs and the Move list may read A B C J D… Loop order matches walking round the room; letters are just names. If you'd rather keep tabs alphabetical, that is a one-line sort, but then R / Shift+R and the Move list would also go alphabetical, not round the room.

## 5. UI

- **Seeing the ends.** While adding a wall (the existing "Draw wall" tool / `AddWallFlow` open), each free end shows a small round handle on the plan. It is 10 px on screen at any zoom, accent-coloured, with a 12 px snap radius. Hover makes it bigger and shows a tooltip, e.g. "Start from the end of Wall B". Joined ends get no handle. A closed room with no gaps shows none, and the form says "The room is closed. Delete a wall to open it."
- **Click.**
  - The handle becomes the start point (filled ring) and the form header says "Wall J · from the end of Wall B · pick a direction".
  - Direction buttons allow only right angles to that wall. They show the direction drawn *away from the clicked end*; the store flips it when needed (see the table in section 3).
  - A dashed ghost line shows the new wall at the typed length. Add draws it.
  - The pick then moves to the new wall's far end, as the chain end does today, so you can keep drawing round. When the new wall joins (closes the gap), the pick goes back to the default.
- **Cancel.** Esc, clicking the picked handle again, or Done clears the pick (Esc already resets the plan tool).
- **Default if nothing is clicked.** Exactly today's behaviour, the chain end. The main script, the templates and every current e2e stay the same. If the chain is closed but has gaps, there is no chain end. The default is then the first gap's start end in loop order, and the handle shows as picked so it is visible.
- **The list.** Gap rows keep "Draw wall" (restore, only for an untouched deleted wall's gap) and get "Close gap" for any gap.

## 6. Risks, estimate, tests

**Risks.**
- The direction flip when drawing backwards (from a wall's start or from Wall A's start) is the most error-prone part. Every vertex-unchanged test below covers it.
- Vector gaps make `roomOutline` / `wallExtents` corner cases at a gap's ends. Today they only see axis-aligned gaps.
- A new crossing check could flag existing saved rooms that cross today. None of the seeds do.
- Letters out of loop order may surprise a presenter (section 4).
- The mixed-build save risk above.

**Estimate: about 3.5–4 days.**
- Geometry, gap vectors, `room.start`, insert/join, crossing check and per-gap close: 1–1.5 days.
- Store actions and save validation: 0.5 day.
- Plan handles, pick state, form changes and the ghost line: 1 day.
- Tests and docs: 1 day.

**Unit tests.**
- `roomVertices` with gap vectors and `room.start`.
- For each kind of free end, drawing a wall leaves every existing vertex, frame and feature position unchanged.
- Join when ending exactly on the gap's far side; no join, plus the crossing issue, for any other contact.
- Close gap for an L-shaped vector gap.
- Right angle at a join.
- Validation of the new fields; an old save with plain open segments loads unchanged.
- Store: one undo step per draw, letters skip gap letters, and the pick is not in history.

**e2e.**
- Handles show only at free ends: none on the closed Mehta room; two after deleting Wall C; plus the chain ends when open.
- Click a handle, draw: the other walls' plan polygons are unchanged.
- Drawing round to the gap's far side closes the room and Start Designing becomes enabled.
- Esc cancels; the default path adds at the chain end; the main script still passes unchanged.
- An old save (fixture) still loads.

---

# Item 4: Inside-corner door clash rule

## 1. What the existing corner rules cover

| Rule | File | Exact condition | Status | Message / fix |
|---|---|---|---|---|
| `corner` (rule 9) | `src/domain/rules/fit.ts` `cornerRule` | An inside corner between two consecutive standing walls (no open segment; the last→first corner only when the room is closed). Both walls have a **base-layer**, non-filler unit whose near end is < 1000 mm (`CORNER_REACH_MM`) from the corner. Passes if any blind unit (`hasBlindSide`, only BC1000) among those has its blind side facing the corner | warning | "{BC1000} on Wall X has its blind side facing away from the corner. Flip it so the blind section sits in the corner." Fix: "Make the blind side {side}". Or: "The corner between Wall A and Wall B has no corner solution. Use a BC1000 blind corner unit so the corner space is reachable." Fixes: "Replace {unit} on Wall X with BC1000 in the corner" (either wall) |
| `blind-side` | `src/domain/rules/product.ts` `blindSideRule` | A BC1000 with no `blindSide` | blocked | "BC1000 needs a blind side (left or right)." Fix: "Make the blind side {nearer end}" |
| `overlap` | `fit.ts` `overlapRule` | Two world boxes intersect, including across a corner (3D boxes, so height bands count) | blocked | "{b} overlaps {a} at the corner of Wall A and Wall B." Move fixes |
| `leftover-gap` | `fit.ts` `leftoverGapRule` | A 1–299 mm gap; a unit from the adjacent wall reaching into this wall's band counts as a run end. So the gap between BC1000's front and the first unit on wall B is checked | warning | "{n} mm gap at the start of Wall B." Fix: "Add a {n} mm filler" (≤ 100 mm) and others |

**Not covered today.**
- Wall units and tall units at a corner: `cornerRule` looks only at base.
- Any spacing between two fronts that meet at a corner: handle clearance.

**Two situations at an inside corner.** One unit, S, takes the corner square on its wall. The unit on the other wall, N, stands with its side panel facing S's front, across a gap g (from S's front plane to N's side). These need different fixes:
- **H, hidden front.** The part of S's front within N's depth of the corner is behind N's side. If that part opens (it isn't a blind section), it can't open whatever the filler: a door needs room to swing and a drawer needs room to pull out. Fixes: a blind unit there (base: BC1000), or move a unit clear of the corner.
- **C, handle clash.** S's opening front starts right at N's front plane (BC1000's door next to its blind section, or S pulled out of the corner). N's door or drawer edge and S's handles meet at a right angle. They collide unless there is a clearance gap. **This is the case a corner filler fixes.**

Your wording, "a unit whose front faces the side of a neighbour", describes S in case H. Your fix, "Add corner filler", fixes case C. I recommend the rule covers both, with the fix that works for each (open question Q4.1).

**Overlap, new, conflict.**
- **Overlap.** Base/base case H is already reported by `cornerRule` ("no corner solution", warning) whenever there is no correctly set BC1000. The new rule must not report the same base pair again. Proposal: the new rule skips base pairs at a corner where `cornerRule` reports "no corner solution" or "blind side facing away". One message per corner and band.
- **New.**
  - Case H for wall and tall units. The catalogue has no blind wall or tall unit.
  - Case C for every band, including a correctly set BC1000 with BD600 straight after it. `cornerRule` passes that today ("Corners are handled").
- **Conflict.**
  - (1) `leftover-gap` offers "Add a 30 mm filler" for a 30 mm gap at the corner. If the clearance is larger, that filler closes the gap and the clash stays, which is conflicting advice. The leftover-gap rule should skip a corner gap the clash rule reports, and the clash fix uses the full clearance.
  - (2) The `cornerRule` pass text "Corners are handled" would sit next to a clash warning. The rule groups ("fit") are shared, so the summary is still right, but the pass text should change to e.g. "Corner units are set up".

## 2. Height bands

The code knows each unit's band from `placement.layer` → `LAYER_BANDS` (`src/domain/rules/context.ts:147`). Each unit's world box is `placementToWorldBox` (`geometry.ts`), with z from `ZONES` (`src/domain/zones.ts`):

| Layer | z (mm) | Depth (mm) |
|---|---|---|
| base | 0–820 | 560 |
| wall | 1380–2100 | 350 |
| loft | 2100–2500 (400 high; short loft 300) | 350 |
| tall | 0–2100 | 560 |

With `rangesOverlap` (strict: touching is not overlapping):
- tall shares a band with base and with wall;
- wall does not share with base;
- loft touches wall and tall at 2100 but does not share with them.

So "a wall unit next to a base unit doesn't clash; tall clashes with both" falls straight out of z-overlap. No new band data is needed.

Lofts aren't in your list. Two lofts at a corner have the same geometry as wall units (Q4.4).

## 3. "Blocked" meaning

Your proposal is "an error that stops `isQuoteFinal` (DRAFT PDF only)". **That doesn't match the current design.** Blocked is stronger than that:
- **(a)** A drop, nudge, Move/turn or fix whose result is blocked is **never committed**. The Blocked card shows instead (`tryPlaceModule`, `turnPlacement`, `checkCandidate`). The ghost turns red while dragging if the rule is in `PLACEMENT_RULES` (`rules/index.ts`).
- **(b)** If a blocked result exists anyway (room edits can cause one), Review Quote is disabled. The Quote screen shows "Resolve the blocked checks before reviewing the quote" with no quote and no PDF at all, not even DRAFT (`quote-screen.tsx`). `canShare` is false.
- **(c)** `isQuoteFinal` itself doesn't look at blocked results. Only approval and the approval mode decide the DRAFT watermark.

"Committed, but the PDF stays DRAFT" is close to what an `approval` item does in "Only when flagged" mode. But an approval item can be approved by the manager, which is wrong for a door that can't open.

**Recommendation.** Use the existing blocked meaning for tall. A tall unit can't be placed where it clashes. The Blocked card offers the fixes ("Add corner filler", "Move to nearest free spot"), and one click places it with the fix (`placeWithFix`). To keep `checkPlacementFast` agreeing with `checkCandidate`, the tall case must also join `PLACEMENT_RULES`. Then the drag preview, R, Move and the Item 3 fit list (`wallsUnitFits`) all respect it automatically. A new "error but committed" status would be a new path through the store, the footer, the Quote gate and the PDF: more work, and unlike every other error.

## 4. Corner filler

**Catalogue.** There is **no corner filler SKU**. There is one filler, `FIL` "Filler panel" (`src/domain/catalogue.ts`):
- width set per placement, 1–100 mm (`FILLER_MAX_MM = 100`; `applyFix` `addFiller` refuses wider);
- height from the layer (`FILLER_HEIGHT` in `src/domain/pricing/index.ts`: base 720, wall 720, loft 400, tall 2100);
- depth 20 mm;
- **no fixed price**: it is priced as shutter area × the finish's rate per sq ft, with no carcass (`moduleLine`).

FIL placements already show in the Quote table (with their wall and size) and in the PDF line items, because both use `quoteModel`. A corner filler built from FIL would show there as "Filler panel". A separate "Corner filler" line needs a catalogue entry, and its price basis must come from Makwana. I have not made one up.

**Minimum width that lets the door/drawer open.** **The repo has no source for this number**, so I have not set one.
- The catalogue has no handle projection, door thickness, hinge side or drawer data. The handle is "Profile handle, matte black" with only a name and a price. Shutter types are "Standard with handle" and "Handleless profile" with price adders only.
- For case C the minimum is at least the handle projection from the front, plus a working clearance, for "Standard with handle". For "Handleless profile" it is the edge clearance the hinge and front need. These figures must come from Makwana's hardware/installation spec.
- If the figure is over 100 mm, FIL can't be used as it stands.
- Case H isn't fixed by a filler at all. Moving a unit clear leaves an empty corner of the neighbour's depth (560 base / 350 wall) plus the clearance, for which the catalogue has no panel.

**The fix action.** "Add corner filler" means: put a FIL of the clearance width on N's wall, against S's front plane, and move N (and the units butting it along that run) away from the corner by the shortfall. There is no such fix action today. `addFiller` only fills an existing gap, and `move` moves one unit. So it needs a new `FixAction` (e.g. `insertCornerFiller { wallId, layer, offsetMm, widthMm }`), applied in `src/domain/fixes.ts`. Like every fix it is proven safe on a copy first (`withSafeFixes`). Where the run has no slack the fix simply isn't offered.

That is what would happen in the main script and the sample design. Wall B is BD600 560–1760 and T600OM, with only 40 mm left over (a gap in the main script, a filler in the seed). A second fix to consider: "Move BC1000 {c} mm out of the corner" with the filler on wall A, which only needs slack on A.

**Effect on the demo.** As described, the rule fires on the sample design and in the main script at the A/B corner:
- BD600 at B 560 butts BC1000's front with no clearance: case C, base, warning.
- W900 at B 350 hides 350 mm of W600's front at the A end of wall A: case H, wall, warning.

The main script expects exactly one warning (the 40 mm gap) after the filler step. It and the brief would change, or the seed would gain the fillers (Q4.6).

## 5. Build order

The corner model doesn't change in item 1's plan, and Design only ever sees one closed loop. So item 4 doesn't wait for item 1. Order:
1. **Extract `insideCorners(room)`** from `cornerRule` (pure, tested, no behaviour change). Both corner rules use it.
2. **Item 4.** The rule, the new fix action, adding the tall case to the placement checks, and the leftover-gap and pass-text adjustments, with tests. It touches the domain and fix code only, plus the main script, seed and brief per Q4.6. Estimate 2–2.5 days once Q4.1–Q4.6 are answered.
3. **Item 1.** Setup, gap geometry and save validation. If you choose the separate `runs` storage instead, only `insideCorners` needs to change for the corners, once.

**Tests for item 4.**
- Unit, per band pair:
  - tall/base and tall/wall clash; wall/base don't; loft/wall don't.
  - BC1000 with blind side at the corner and N at depth: case C warning; with N at depth + clearance: pass.
  - Normal base in the corner: only `cornerRule`'s message (no duplicate).
  - Wall units in case H: warning.
  - Tall: blocked, refused by `tryPlaceModule`, and `checkPlacementFast` agrees.
  - The filler fix is safe or isn't offered; FIL line priced in the quote model.
  - Leftover-gap no longer offers a short filler at a clash.
- e2e: drop a tall unit against a base corner run: Blocked card with "Add corner filler", which places both. The quote and PDF show the filler line. The main script follows Q4.6.

---

# Open questions

**Item 1**
- **Q1.1** Free ends only: agreed (section 2). Confirm.
- **Q1.2** Join only when the new wall ends exactly on its own gap's far side, and report any other contact as "runs into" (keeps the room open). OK?
- **Q1.3** Tabs, list and Move order: loop order (A B C J D…, as recommended) or alphabetical?
- **Q1.4** Closed room with gaps and no chain end: is the default "first gap's start, shown as picked" right?

**Item 4**
- **Q4.1** Which case did you mean: H (front hidden behind the neighbour's side), C (fronts meeting at the corner, handles), or both (recommended, each with its own fix)?
- **Q4.2** "Tall → blocked": is it decided by the unit that can't open, or blocked whenever either unit of the pair is tall (recommended: the tall side or front clashes over the full height)?
- **Q4.3** "Blocked" as it works today (can't be placed; one-click fix on the Blocked card), not "committed, DRAFT PDF only". OK?
- **Q4.4** Lofts at a corner: same as wall units, or ignore?
- **Q4.5** The handle clearance (minimum filler width) for "Standard with handle" and for "Handleless profile", from Makwana's hardware spec. Is it ≤ 100 mm, so FIL works? Should "Corner filler" be its own catalogue line and price, or a FIL "Filler panel" line?
- **Q4.6** The sample design and main script trip the rule at the A/B corner (base: case C; wall: case H). Update the seed to include the fixes (keeps the demo clean), or keep the warnings and change the main script and brief?
