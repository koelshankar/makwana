# Hardening pass 1

Branch: `hardening-1` (from `main` at `6a9cd17`). One commit per finding. Not merged.

## Audit findings

| ID | Severity | Area | Status |
|---|---|---|---|
| 1 | Blocker (if demo laptop) | Setup: no `node_modules`; `next build` fetches Google Fonts | Open (environment) |
| 2 | Demo risk | Error page could only Reload, which looped on a bad save | Fixed |
| 3 | Demo risk | WebGL context lost mid-session left a blank canvas | Fixed |
| 4 | Demo risk | Two tabs overwrote each other; duplicate quote numbers | Fixed |
| 5 | Demo risk | Print page had no error page | Fixed |
| 6 | Demo risk | Customer/site/name/kitchen type edits kept a quote approved | Fixed |
| 7 | Demo risk | Quote counter reset on save-version change; silent failed saves | Fixed |
| 8 | Minor | Empty discount field meant 0% | Fixed |
| 9 | Minor | A restore error left the loading skeleton up for good | Fixed |
| 10 | Minor | PDF waited forever for the 3D picture | Fixed |
| 11 | Minor | Draft PDFs looked final | Fixed |
| 12 | Minor | "Sent back" toast named Rohan Desai | Fixed |

## Fixes and tests

- **#2** Error page has Start over: `startOver()` clears `makwana:project` and runs Reset demo. Test: store unit.
- **#3** The canvas reports `webglcontextlost`/`webglcontextrestored`. The panel shows while lost. On restore three.js rebuilds its GPU state in the same canvas; `KitchenScene` re-renders, which redraws the frame and the contact shadows. No remount (pass 2; the remount logged ~84 WebGL warnings). Tests: unit + e2e. The e2e test checks it is the same canvas element and that the restored frame matches the frame before the loss (< 0.2% of pixels differ; a missed redraw gives 37%). It has no console allowance. Toggling shadows, deleting a unit and undoing after a restore log nothing either.
- **#4** BroadcastChannel tab guard (`src/lib/tab-guard.ts`). The newer tab shows "This demo is open in another tab." Tests: unit + e2e.
- **#5** `app/error.tsx` and `app/global-error.tsx` use the shared error screen. Test: none (no way to force a crash); build passes.
- **#6** `designChanged` includes name, customerName, siteAddress and kitchenType. Tests: domain + store unit, e2e.
- **#7** `migrate` keeps `nextQuoteSeq`. `guardedStorage` reports the first failed save; the shell shows a toast. Pass 2: `migrate` marks the replaced save and `merge` sets `ui.restoreNotice = "old-version"` (was the boolean `restoreFailed`, now `"unreadable" | "old-version" | null`). The shell shows "The saved project is from an older version of the demo — Started from the sample design instead. Quote numbers carry on from where they were." once. Tests: store unit, e2e.
- **#8** `parseDiscountInput` returns null for empty or non-numeric text. Tests: unit + e2e.
- **#9** `onRehydrateStorage` error loads the empty Mehta room. Screens wait on `isRestored()`. Test: store unit.
- **#10** `snapshotStep` gives up after 3 s and prints without the picture. Test: unit.
- **#11** `quoteModel` sets `header.watermark = "DRAFT"` unless the quote is final (pass 3: `isQuoteFinal`, so also none in "Only when flagged" mode when nothing needs approval); the print page repeats it on every page. Tests: domain unit + e2e.
- **#12** The toast uses `project.preparedBy`. Test: e2e (seeded with another preparer).

Final run (pass 1): `npm test` 172/172, `tsc` and `lint` clean, build passes (`/design` 339 kB), `npm run e2e` 12/12.

Final run (pass 2): `npm test` 172/172, `tsc` and `lint` clean, build passes (`/design` 339 kB, shared 233 kB). `npx playwright test`: 38 passed, 2 skipped (automatic performance mode, see section 7), 40 in all across both sizes. That count includes the console guard's expected-failure self-check.

Final run (pass 3, the fixes below, with `isQuoteFinal` and the PDF's Final status): `npm test` 178/178, `tsc` and `lint` clean, build passes (`/design` 339 kB, `/quote` 308 kB, shared 234 kB). `npx playwright test`: 40 passed, 2 skipped (the same automatic performance mode half), 42 in all.

## Pass 3 fixes

| ID | Fix | Test |
|---|---|---|
| M1 | `snapOffset` tries a free wall end first, then neighbour edges, then the other run ends, then features. A wall end counts only if the unit there would overlap nothing, so the column in the A/H corner is never a target. | Unit: wall end beats a neighbour in reach; occupied end skipped. e2e: the main script drops BC1000 20 mm short of the end of wall A again; it lands at 2200 at both sizes. (With the old order it landed at 2100 at 1366.) |
| M2 | The elevation draws a selected unit as an accent outline over its normal finish tint. Blocked units keep their red fill. The plan is unchanged: it fills units by layer, not finish. | e2e: in the main script the tint (`data-finish-tint`) changes to the new finish while HU900 is still selected. |
| M3 | The download log moved into `useDownloadPdf`, which both the footer and the Share dialog use, so each download logs once. It calls `markPdfDownloaded` (`src/domain/quote.ts`). A final quote (see `isQuoteFinal` below) logs the share "Version N shared with … · PDF downloaded to send". Any other logs `draft_downloaded` "Draft PDF downloaded · Version N", which is not a share. | Unit: both approval modes, draft, pending, approved and version 2; no quote logs nothing. e2e (focused "download assigns a number", "Always"): the footer download of a draft logs "Draft PDF downloaded · Version 1" and no share; after approval the same button logs one share. The main script (approved, from the dialog) still sees exactly two shares. |
| Final | `isQuoteFinal(project, settings)` in `src/domain/quote.ts`: true if the quote is approved, or if the approval mode is "Only when flagged" and nothing needs approval (no `approval` rule results; computed from the project if not given). It decides the DRAFT watermark (`quoteModel` takes the settings; without them it assumes "Always") and the download entry. `canShare` now uses it too (final and nothing blocked), the same rule as before, written once. | Unit: `isQuoteFinal` in both modes; the watermark in "Only when flagged" with discount 0 and 8. e2e (focused): "Only when flagged", discount 0, Share → Download PDF: 0147, no watermark, one share logged, no draft entry. |
| PDF status | On the PDF only, a final quote that isn't approved prints its status as "Final" (`quoteModel` → `header.pdfStatus`, `"final"` or the stored status). The stored status and the Quote screen (`header.status`, the pill) are unchanged: such a quote is still Draft there. Approved prints Approved in both modes. | Unit: Final in "Only when flagged" with nothing to approve; the stored status otherwise (draft, pending, approved, both modes). e2e (the focused "Only when flagged" test): the PDF says Final and not Draft; back on the Quote screen the pill says Draft and the saved status is `draft`. |
| D5 | The Totals card hides "above 5% · needs approval" once the quote is approved. It still shows in draft and while pending; "within salesperson limit" is unchanged. | e2e: the main script sees the note while pending and no note after approval. |


## Brief: "Fixed on Day 10" check

Checked in the code, then measured in Chrome against the production build at 1366×768 and 1440×900 (sample design; a temporary Playwright script, not kept).

| # | Day 10 fix | Result | Evidence |
|---|---|---|---|
| D1 | Quote table: description into size column, cost tags touching amount, filler rows indented | Holds | `quote-groups.tsx`: `pr-4` on the description, `whitespace-nowrap` on size, `pr-4` on the tags cell. 16 rows at both sizes: no description runs past the size column, tag-to-amount gap ≥ 8 px. Filler text starts at the same x as the other rows' code. |
| D2 | Group cost tags hidden below 1400 px | Holds | `data-group-tags="below"` shows under `min-[1400px]`. 1366: all four groups show tags on a second line. 1440: tags inline. |
| D3 | Design wall tabs cut off ("Wal…") at 1366 | Holds | Tabs are `shrink-0 whitespace-nowrap` in a scrolling tab list with a fade at the right edge below 1440. All nine tabs measure full width at both sizes. |
| D4 | Room Setup footer cut off all three texts when open | Holds | Only the third chip (the room issue) may truncate; it carries the full text as a tooltip. With wall B at 2462: 1366 shows "Room open · 8 walls" and "6 features placed" in full and "The room isn't closed yet (open by 62 m…"; 1440 shows all three in full. |
| D5 | After approval the Quote screen still said "Needs manager approval" | **Partly** (fixed in pass 3) | The checks summary reads "Approved by Store Manager" (`ChecksSummary` with `approvedBy`). But the Totals card's discount note still read "above 5% · needs approval" after approval, at both sizes. Pass 3 hides it once approved. |
| D6 | Activity details squeezed to three lines at 1366; empty log showed nothing | Holds | Time and name are stacked in a 150 px column. Detail width 300 px at 1366 and 374 px at 1440; every entry in the main script fits on two lines. The empty log shows "Nothing yet. Discount changes, approvals and sharing are logged here." |
| D7 | Quote small plan: overlapping cut-out and ceiling labels | Holds | `DesignPlan compact` drops dimensions, the ceiling label and the cut-out labels. The Quote small plan has no `<text>` at all. |
| D8 | "THREE.Clock" deprecation warning on every 3D view | Holds | `kitchen-scene.tsx` drops exactly that message through `THREE.setConsoleFunction` (R3F 9 still creates a `THREE.Clock`). The console guard sees no warning on any 3D screen. Comes back if three's message text changes. |
| D9 | A save that wasn't valid JSON left the loading screen on forever | Holds | `safeJSONStorage` turns a parse error into an empty save, which `merge` replaces with the empty Mehta room. Reload with `{{{ not json`: no skeleton, toast "The saved project couldn't be opened". |

## Brief: section 6 main script (`e2e/main-script.spec.ts`)

One test, Reset demo to the PDF and the activity log, in one page with no reload (no `load` event after the first, and a marker set on `window` at the start is still there at the end). It runs at 1366×768 and 1440×900 and passes at both. Every "Expect" line in the brief is an assertion. The console guard fails it on any error or warning, and a screenshot of each stage goes to the test's output folder.

How each line is checked, where it isn't obvious:

- Snapping: each drop is aimed 20–40 mm off its place and must land exactly there (HU900 300, SU900 1200, BC1000 2200 from 20 mm short of the wall end, BD600 560 and 1160). Positions are read from the saved project in localStorage.
- The blocked card: the title says tall unit and window, "+1 more blocking issue", the fix "Move to Wall B, 1760–2360 mm", and nothing placed. After the fix: T600OM at B 1760, and a 40 mm gap warning on Wall B.
- Filler: a filler at A 2100 +100, then a single check left (the 40 mm warning), and Review Quote enabled.
- Appliances: green hosts (`data-host`) for the sink, hob and oven while dragging. Sink, hob, oven and microwave fitted into the right units; chimney at A 300, above the hob; "5 appliances". Cut-outs in the elevation ("Sink cut-out", "Hob cut-out") and the plan (`data-cutout`).
- Finish: with the unit still selected, the elevation's finish tint, the 3D picture, the unit price, the running total and the footer delta all change; the delta equals the change in the total.
- Customer view: fills the viewport, project name, wall height, presets, and no buttons beyond the view controls. Esc leaves it, and so does Exit. Project and footer are unchanged.
- Quote: no number before sending; 0147 after; "needs approval" note while pending; manager banner and buttons; "Approved by Store Manager" and no "needs approval" note. The clipboard holds the quote number and the grand total. `window.print` is stubbed and must be called once. The print page has 0147, Approved, a decoded 3D image, a plan with both cut-outs, elevations A and B, unit codes, totals and no watermark. With print media the toast and the screen controls are hidden. Activity has six entries in order (discount, created, sent, approved, shared, shared), each with seconds. `nextQuoteSeq` is 148 at the end: one number used.

What the test cannot see: the native print dialog and the saved PDF file; whether the 3D cut-outs are *right* (it checks only that the 3D picture changed after the drops); real full screen (headless). In the test, Esc is a synthetic key, so the test leaves browser full screen itself, as a real Esc would.

Test-only waits (not app bugs): dnd-kit swallows clicks for 50 ms after a drop, so the test waits 100 ms after each drop; and it waits for each drop to be saved before the next step.

Findings from writing it:

| ID | Severity | Finding |
|---|---|---|
| M1 | Demo risk (fixed in pass 3) | **BC1000 can snap onto SU900 at 1366.** Neighbour edges win over the wall end, and the snap distance is 8 px: 87 mm at 1366, 79 mm at 1440. Dropped 13–87 mm short of the end of wall A at 1366, BC1000 lands at 2100 against SU900. The 100 mm gap, its warning and the filler step of the script then never happen. Dropped at the end or past it, it lands at 2200. Pass 3: a free wall end now wins. |
| M2 | Minor (fixed in pass 3) | **A finish change doesn't show in the elevation while the unit is selected.** The elevation fills a selected unit with the selection colour (`--mk-accent-soft`). The brief says "elevation, 3D and price change together"; the 3D view and price do, but the elevation shows the new finish only after Esc or clicking away. Pass 3: the selected unit is an outline over its finish tint. |
| M3 | Brief (fixed in pass 3) | **"Shared twice" needed Download PDF from the Share dialog.** That button logs a share; the footer's Download PDF doesn't. The brief says "Click Download PDF" right after Copy, with the dialog still open, so the test uses the dialog's button. Pass 3: the footer button logs the same entry. |
| M4 | Minor (D5, fixed in pass 3) | After approval the Totals note still read "above 5% · needs approval" (see D5). |

## Brief: section 7 focused tests (`e2e/focused.spec.ts`)

Twelve of the thirteen rows, at both sizes. "WebGL off" is not written: it needs Chrome restarted with WebGL disabled.

| Row | Result | Notes |
|---|---|---|
| Quote number not used by loading | Pass | Two sample loads and two Quote visits stay "Draft quote · Version 1"; sending gives 0147. |
| Download assigns a number | Pass | Print page and Quote header both 0147 (`window.print` stubbed). |
| Share in "Only when flagged" | Pass | Share enabled at discount 0 before approval; opening it assigns 0147. |
| Clipboard unavailable | Pass | Box focused, fully selected, highlighted, "Press ⌘C / Ctrl+C to copy". ⌘C shows the toast and logs one share. |
| Corrupted save | Pass | Both saves from the brief: empty Mehta room, toast, never stuck. |
| /spike hidden | Pass | 404. The test allows Chrome's own "Failed to load resource … 404" console line. |
| Performance mode (manual) | Pass | The 3D picture changes, the canvas draws at pixel ratio 1, and the setting survives a reload. |
| Performance mode (automatic) | **Skipped** | The fast-machine half passes (3 s of orbiting leaves it off). With CPU 20× slower, the brief's trick, frames stay under 33 ms on this M4, so the switch, toast, "once" and Reset parts skip with that reason instead of being forced. Needs a slow machine or a person. |
| Edit after approval | Pass | Toast "…(Version 2)"; Quote shows Version 2, Draft. |
| Undo | Pass | Finish change and a delete undo and redo; status, quote and activity are identical before and after. |
| Page title and icon | Pass | Title, and `icon.svg` is served with an "M". The icon's look is not checked. |
| Screen error page | Pass | Error page, then Reload gives Design with the same project. The test allows only React's report of the thrown "test" error. |

## Open items

- Section 7 still needs a person for: WebGL off (Chrome restart), automatic performance mode on a slow machine, the native print dialog and saved PDF, real full screen, and the icon's look.
- #1: install, build and run `npm start` once offline on the demo laptop.
- **Same build on both Macs** (Feedback 2, item 1): a project saved after a wall was drawn from a free end carries `gapMm` or `room.start`. An older build can't read it and loads the empty Mehta room with "couldn't be opened".
- **TO CONFIRM WITH MAKWANA**: the corner handle clearance (Feedback 2, item 4). `CORNER_CLEARANCE_MM` in `src/domain/rules/corner.ts` is 50 mm for "Standard with handle" and 50 mm for "Handleless profile". Both are placeholders, not from Makwana's hardware spec. The corner filler uses the existing FIL "Filler panel" (1–100 mm), so a figure over 100 mm needs a change. Since 2026-11-17 (step 1) the same figure is also the handle allowance in a door's swing (door width + clearance), so it now decides when a door next to a corner is Blocked too.
- **TO CONFIRM WITH MAKWANA**: hinge sides at a corner (step 1). The catalogue has no hinge side. The hidden-front rule assumes double doors hinge at the unit's two ends, and a single door (B300, B450, BC1000's door) is hinged on whichever side lets it open. Nothing in the quote or PDF tells the factory which side that is.
- Shared JS grew from 195 kB to 239 kB: the error pages pull the project store into the root chunk (233 kB), then Feedback 1 and 2 (239 kB).

## Decisions

- **No tab sync.** A second tab is blocked, not kept in sync. One live tab means one writer for the save and the quote counter. To switch tabs, close the first one and reload the second.
- **DRAFT watermark.** Download PDF stays available before approval, so the salesperson can send a preview, but every page is marked DRAFT until the quote is final: approved, or in "Only when flagged" mode with nothing that needs approval (`isQuoteFinal`). A draft download is logged as "Draft PDF downloaded · Version N", not as a share. A final quote that isn't approved prints its status as "Final" on the PDF only; it stays Draft in the project and on the Quote screen.
- **Playwright on real Chrome GPU.** Tests use the installed Google Chrome (`channel: "chrome"`) with no SwiftShader flags. Software WebGL logs "GPU stall due to ReadPixels" warnings, which would trip the rule that fails a test on any console error or warning. The demo machine needs Google Chrome installed.

## Lockfile note

npm 11.5.2 removed other platforms' optional bindings (rolldown, lightningcss) from `package-lock.json` when installing `@playwright/test`, even with `--package-lock-only`. That broke vitest. The committed lockfile is the original plus only the four Playwright entries, checked with a clean `npm ci`. Use `npm ci`, not `npm install`, and check the lockfile diff after adding any dependency.

# Feedback 1

Branch: `feedback-1` (from `main` at `7ebdeee`, after `hardening-1` was fast-forwarded into `main`). One commit per item. Not merged.

| Item | Status | Commit |
|---|---|---|
| 1 Deleting a wall leaves a gap | Done | `b95cef1` |
| 2 Choose which wall a unit faces | Done | `ce30c9c` |
| 3 3D "Auto" wall mode | Done | `ccb1449` |
| 4 Wall labels on the Design 3D floor | Done | `b01dcae` |
| 5 Full screen opens the active view | Done | `7afe5dd` |

## Item 1: Deleting a wall leaves a gap

- **Cause.** Walls are a chain of heading plus length from Wall A. Removing one from the list moved every wall after it.
- **Model.** `removeWall` marks the wall `open: true`. The open segment keeps its letter, length and heading, so every corner stays where it was. Its features and units are still removed, as one undoable step. When no standing wall is left, the room is cleared.
- **Geometry.**
  - `wallSegments` carries `open`. `wallFrames`, `findWall` and `solidWalls` skip open segments; frames keep their chain `index`.
  - `isChainClosed` is the old closed test. `isRoomClosed` also requires no open segment.
  - The outline gives an open segment no thickness. The 3D wall extents and the corner rule treat it as neither a wall nor a corner.
- **Validation.** Each gap is reported as "Wall C is open: draw a wall in the 1600 mm gap between Wall B and Wall D." `closingHint` still covers an open end. Design stays locked until the room closes.
- **Room Setup.**
  - The plan draws the gap dashed, labelled "C · 1600 · open". Clicking it selects it and shows a "+ Draw Wall C" button.
  - The walls list shows the row as Open, with a Draw wall button.
  - The footer reads "Room open · 7 walls · 1 gap".
  - "Close room" (`closeRoom`) fills every gap and adds the closing walls for an open end, as one undo step.
  - Templates replace gaps. A new wall skips letters that gaps still hold.
- **Elsewhere.** Wall tabs, wall pickers and the quote's wall count list standing walls only. A save with `open` passes validation.
- **Tests.**
  - Unit (`src/domain/open-segments.test.ts`, store): corners unchanged; frames, `findWall` and the standing-wall count; open vs. chain closed; gap messages, including Wall A's wrap and two gaps side by side; outline; no 3D wall; save validation; an open end plus a gap. Store: letter, length and heading kept; units and features removed; draw back with undo; Close room fills two gaps and an open end in one step; letters; last wall; template.
  - e2e: every other wall's plan polygon is unchanged; the gap is dashed with its label; footer, message and Start Designing disabled; the plan's Draw button restores the exact plan; so do the list button and Close room (two gaps); the "Open by 62 mm" path still works; a template replaces a gap; a wall with units asks to confirm, its units go, the rest stay, and Undo restores it.

## Item 2: Choose which wall a unit faces

**How the wall was chosen before.**
- Drops land only on the elevation, on the wall it shows: the selected wall tab, or the last selected unit's wall.
- On the Plan tab, a drag switches to an elevation (the active wall, or Wall A).
- The 3D view is display only, so a drop there does nothing.
- After placing, dragging and arrow keys kept the wall. Only the inspector's Wall picker (units only; it searched for the nearest free spot and showed a toast if there was none) or a Blocked-card "Move to Wall X" fix could change it.

**Now.** A unit stands with its back to a wall, so turning it means moving it to another wall. The model stays wall, layer and offset. The 3D view turns units about the vertical only (`unitPose`: position and yaw).
- **Domain (`src/domain/turn.ts`, pure).**
  - Picks the next or previous wall in A→Z order, wrapping round, skipping open segments and walls shorter than the unit.
  - The position is the unit's footprint centre projected onto the new wall, kept within it. So a unit at a corner stays at that corner.
  - A blind corner unit's blind side faces the new wall's nearer end. A fitted appliance turns its host.
- **Store.** `turnPlacement(id, 1 | -1 | wallId)` runs the normal checks and commits as one undoable step. When blocked, nothing moves, and every blocked result leads with "Move to nearest free spot on Wall X" (`nearestFreeOffset`, which replaces `nearestValidOffset`). When no other wall fits, a toast says so and nothing moves.
- **While dragging** (from the catalogue, or a unit along the elevation): R / Shift+R switch the target wall. The elevation and the 3D ghost show the unit there before the drop, with a "Facing from Wall B · R next wall · ⇧R previous" hint. The elevation is no longer remounted per wall, so a unit drag carries on; panning is kept per wall.
- **After placing:** R / Shift+R, a round turn button on the selected unit in the elevation, and the inspector's Wall picker plus turn button (units and free appliances; only the walls it fits on are offered) all use `turnSelected`.
  - Placed: the elevation follows the unit, and any warnings show.
  - Blocked: the Blocked card, over the target wall.
  - No wall fits: a toast.
- `movePlacement` now re-defaults a blind corner unit's blind side when it changes wall.
- **Tests.**
  - Unit (`src/domain/turn.test.ts`, store): next/previous order with wrap; skipping the 450 and 600 mm duct walls and open segments; none fits; the corner projection (A 2600 → B 0, A 2600 → H 1800); unchanged fields; blind side; fitted vs. free subject; the first fix "Move to nearest free spot on Wall H" (H 1500) clears the block. Store: commit, undo/redo, Shift+R back, blocked with nothing moved and the fix placing it, the picker and its refusals, nothing fits, a sink turns its host, yaw-only quarter turn.
  - e2e: R, R, Shift+R mid-drag switch the elevation and hint, and the drop lands on B; after placing, R moves A 2600 to B 0 with ⌘Z / ⇧⌘Z, Shift+R into the column shows the Blocked card with the new first fix (H 1500), and the turn button blocks at A and fixes to A 300; the picker offers only walls it fits on, then turns; a 3200 mm unit gets the "No other wall fits" toast and stays.

## Item 3: Auto wall mode

- `WallHeightMode` is `"cut" | "full" | "auto"`. Auto builds the walls at full height and hides the walls between the camera and the room. Units stay, including those on hidden walls.
- `wallsInFront` (`src/domain/three-model.ts`) decides which walls to hide. A wall hides if the camera looks through it (cosine above 0.25 with its inward normal), or if its midpoint is on the camera's side of the room centre. The second rule catches duct-box and notch walls whose room face points at the camera (wall F in the Mehta room). It uses the plan part of the camera's unit view direction, so a view from above (Top) hides nothing.
- `RoomMesh` applies it in `scene.onBeforeRender`, which three.js runs before culling on every `gl.render`. That covers orbiting, presets and the PDF snapshot, which renders directly. It replaces the old per-frame fade. Full height fades with the same rule, so Top in Full height no longer fades C, E and G.
- Design keeps Cut at 450 by default, and Reset demo still sets it. Show customer and the Quote screen share `ui.presentWallHeight` (Auto by default, not persisted) and offer Auto, Cut at 450 and Full height. The PDF picture is taken from the Quote view. The print page's own fallback snapshot uses the same mode.
- Tests. Unit: Auto at full height; hidden walls from the 3D preset (C, D, E, F, G, H), half a turn round (A, B, F), facing A, from above and at a glancing angle. e2e (`e2e/feedback.spec.ts`): Design options and default, Auto hides C–H then A, B, F after two quarter turns, Top hides nothing, back to Cut; Show customer opens in Auto and leaving it restores Design's Cut; Quote defaults to Auto; Auto and Cut give different PDF pictures. The canvas carries `data-wall-mode` and `data-hidden-walls` for these tests.
- Main script: the customer view expects Auto checked (and allows the Auto button); the Quote step expects Auto, Cut at 450 and Full height with Auto checked.

## Item 4: Wall labels

**Removed in Feedback 2, item 2.** The text below is kept as a record of what was built.

- `wallLabelSpots` (`src/domain/three-model.ts`) places each label at the middle of its wall's base, 650 mm into the room (just past the 600 mm countertop), or halfway across a shallower room (wall F: 500 mm).
- `WallLabels` (`src/components/three/wall-labels.tsx`) draws flat badges from a canvas texture, so there's no web font to fetch offline. Each badge turns about the vertical to read upright from the camera.
- `KitchenScene` takes a `wallLabels` prop, which is on only in the Design panel. Show customer, the Quote view and the print page don't show labels, so neither does the PDF picture.
- Tests. Unit: one label per wall, in order, at mid-wall, at the right depth, inside the floor; the shallow-room case. e2e: Design shows A–H (`data-wall-labels`); Show customer shows none, and they return on Exit; the Quote canvas has none; the PDF picture renders.

## Item 5: Full screen

- **Cause.** The Room Setup button called `section.requestFullscreen()` and nothing else. A browser that refuses full screen rejects the promise with "not granted". Refusals come from embedded and preview browsers, iframes without `allow="fullscreen"`, an unfocused window, and Playwright's Chrome, headless or headed. The rejection was uncaught and the screen didn't change.
  - In a focused tab of a normal Chrome (started by hand, driven over CDP) it was granted. Even then, only the plan section was full screen, so menus and tooltips, which portal to `<body>`, couldn't open over it (Column / beam / duct).
  - Design had no full-screen control for its plan, elevation or 3D view.
- **Fix.** `useFullView` (`src/components/shell/full-view.tsx`) makes the view fill the window as an overlay (`fixed inset-0 z-40`). This always works and keeps menus visible. It also asks the browser for full screen through `requestBrowserFullscreen` (`src/lib/full-screen.ts`), which never throws or rejects.
  - Esc closes it, unless a menu or dialog has focus; so does the button again, or leaving browser full screen.
  - Used in three places: the Room Setup plan; the Design views panel (the active Plan or Wall tab, and the tabs still switch); the Design 3D panel (keeps its preset, Top or 3D, the selection and the wall letters).
  - Show customer now has a presentation icon, so it doesn't look like a second full-screen button.
  - Layout: below 1600 px the elevation size label is hidden, and below 1440 px the "3D view" heading, so the wall tabs and 3D controls keep their room.
- **Tests.** Unit: a refusal or a missing API resolves false; exit only when in full screen, and failures are swallowed. e2e: Room Setup fills the window, the menu still opens, Esc closes the menu first, then the view, and so does the button; Design plan then Wall B inside full screen; 3D keeps Top and its labels, and isn't the customer view. The old button failed the console guard here with "not granted".
- **Not covered by automation.** Real browser full screen, because Playwright's Chrome refuses it. Check it by hand in Chrome.

## Checks (all five items)

`npm test` 219/219, `npx tsc --noEmit` and `npm run lint` clean, `npm run build` passes (`/design` 343 kB, `/setup` 308 kB, `/quote` 311 kB, shared 235 kB). `npx playwright test`: 64 passed, 2 skipped (the automatic performance mode half, as before), across both sizes. The count includes the console guard's expected-failure self-check.

The main script needed no step changes for items 1, 2, 4 and 5. Item 3 changed two of its checks (Auto in Show customer and on the Quote screen).

## Auto vs. Full height

Both build the walls at full height. Full height fades the walls in front of the camera to 15%; Auto hides them completely. Both use the same rule.

# Feedback 2

Branch: `feedback-1` (continued). One commit per item. Not merged.

| Item | Status | Commit |
|---|---|---|
| 2 Remove the 3D wall labels | Done | `8b52877` |
| 3 Move button replaces the round turn button | Done | `a222088` |
| `insideCorners` helper | Done (no behaviour change) | `690f095` |
| 4 Inside-corner door clash rule | Done | `c676de5` |
| 1 Start a new wall from the end of any wall | Done | see "Item 1" below |

## Item 2: Remove the 3D wall labels

- **Decision.** Deleted, not hidden: `src/components/three/wall-labels.tsx`, `wallLabelSpots` and `WALL_LABEL_DEPTH_MM` (`src/domain/three-model.ts`), `KitchenScene`'s `wallLabels` prop (and its `Invalidate` dependency), and the Design panel's `wallLabels={!customer}`. There was no toggle or stored setting, so nothing in the save or the settings changes.
- **Reason.** The owner asked for them gone. Feedback 1, item 4 kept them out of Show customer, the Quote view and the PDF already; with the code gone no 3D view can draw them, so those snapshots can't either.
- **Kept.** The 2D labels: the Room Setup plan's wall letters and lengths, the Design plan, elevation titles and wall tabs. The 3D unit code sprites (`unit-mesh.tsx`) are unit labels, not wall labels, and stay.
- **Tests.** Removed the `wallLabelSpots` unit tests and the Feedback 1, item 4 e2e test. The full-screen e2e no longer expects `data-wall-labels` on the 3D canvas. Nothing else referred to them (`grep -ri "wall.\?label" src e2e` finds only the Room Setup list's own wall label field).
- **Checks.** `npm test` 216/216 (219 less the three label tests), `tsc` and `lint` clean, build passes (`/design` 343 kB, `/quote` 311 kB, `/setup` 308 kB, shared 235 kB). `npm run e2e`: 62 passed, 2 skipped (automatic performance mode), across both sizes: 64 less the label test at each size.

## Item 3: Move button replaces the round turn button

- **UI.** The round turn button above the selected unit in the elevation is gone. In its place is a "Move" pill (`src/components/design/elevation/move-button.tsx`, `data-move-button`). It opens a list (`data-move-menu`) titled "Move B600 to" with the walls the unit fits on, in A→Z order and with their lengths. The unit's own wall is shown as "Current" and is disabled. When no other wall fits, the list says "No other wall has space" (`data-move-none`) and shows no walls. Esc closes the list and keeps the unit selected. A fitted appliance moves its host, as R does.
- **One fit check.** `wallsUnitFits(project, catalogue, unit)` in `src/domain/turn.ts` (renamed from `wallsThatFit`) is the only one. R / Shift+R (`nextWall`), the inspector's Wall picker, the Move list and `turnPlacement`'s check of a chosen wall all call it. A wall fits if it is a standing wall (not an open segment) and has at least one spot where `checkPlacementFast` passes. That is the same set of placement rules every drop and turn runs: inside the wall, no overlap in the unit's height band (units on this wall and round the corners, the column, doors), clear of windows, the beam and the ceiling, plus the sink/hob rules. The unit's own wall always counts. No new rule was written.
- **One placement.** Picking a wall calls `turnSelected(id, wallId)`, the same call as the Wall picker, so it goes through `turnPlacement` and `turnedTo`. The unit lands at its footprint centre projected onto that wall. If that spot is blocked, the Blocked card leads with "Move to nearest free spot on Wall X".
- **Behaviour change (decision).** The fit check used to be "the wall is at least as long as the unit". It now also needs a free spot. Reason: the brief defines "fits" as free run length with no clash, and the old check offered walls where every spot was blocked. Such a wall gave a Blocked card with no "nearest free spot" fix. Effects, all in R / Shift+R and the Wall picker as well as Move:
  - In the empty Mehta room a base unit is no longer offered Wall G (1000 mm): every spot on G runs in front of the door on H.
  - In the sample design B is full for base units, so R on HU900 goes A → C, not A → B.
  - SU900 with its sink fits only on A (the sink must stay near the plumbing). R on it now shows "No other wall fits SU900 (900 mm)" instead of a Blocked card on B.
- **Finding a gap.** `nearestFreeOffset` used to try 10 mm steps and the far end only. It now also tries flush against each thing already in the unit's band on that wall. Otherwise a gap exactly the unit's width that doesn't start on a 10 mm step (e.g. 605–1205 for a 600) was reported as no space.
- **Toast for a chosen wall with no spot.** `turnSelected` now says "No free spot for B600 on Wall C" when the wall is long enough but full, and "B600 (600 mm) doesn't fit on Wall D (450 mm)" when it is too short. The list never offers such a wall, so this toast is only reachable if the project changes under the list.
- **Bug found while testing.** The list is portalled to `<body>`, but React events still bubble through the React tree into the elevation `<svg>`. Its pointer handlers started a pan on the list's pointerdown and deselected the unit on pointerup, so a pick did nothing. The popup now stops pointer and wheel events.
- **Cost.** `wallsUnitFits` takes about 5–16 ms per unit on the sample design. It runs only when the list opens, when R is pressed, and (memoised on the project) in the inspector.
- **Kept.** R / Shift+R (while dragging and after placing), the inspector's Wall picker and its square turn button.
- **Tests.**
  - Unit (`turn.test.ts`): a long-enough wall with no free spot isn't offered, but a wall unit still gets it (height band); an exact off-grid gap is found (C 605); its own wall always counts and open segments never do; the G/door case.
  - Store (`project-store.test.ts`): for every unit in the sample design, R and Shift+R give exactly the same result and project as picking that wall. Every listed wall either places the unit or gives the Blocked card leading with that wall's nearest free spot, and both outcomes occur. Walls not on the list are refused with `no-wall`. The fitted hob turns its unit to C; the fitted sink's unit has nowhere else to go.
  - e2e (`e2e/feedback.spec.ts`, "Feedback 2 · item 3"): no round button; Move lists A (Current, disabled), B, C, E, H; Esc closes it and keeps the selection; pick C: the save has the unit on C, elevation C shows, and the Quote line and layout read Wall C. The Feedback 1 item 2 tests now use Move → Wall A where they used the turn button (blocked at the column, fix to A 300); the picker no longer offers G; the 3200 mm unit's Move says "No other wall has space".
- **Checks.** `npm test` 223/223, `tsc` and `lint` clean, build passes (`/design` 344 kB, `/quote` 311 kB, `/setup` 309 kB, shared 235 kB). `npm run e2e`: 64 passed, 2 skipped (automatic performance mode), across both sizes.

## Items 1 and 4: plan only (`docs/PLAN-wall-start.md`)

No code. The plan doc has the current model, the options, the effects, the UI, risks, estimates, tests and the open questions.

- **Item 1, decision proposed.**
  - Free ends only (chain ends and wall ends at a gap). No branches/T-junctions: they turn the room into a graph and would take weeks, not days.
  - Storage stays one ordered list. A gap may carry its own offset (`gapMm`), and the room gets an optional start point, so every existing vertex stays put.
  - Reason: Design, 3D, the quote and the PDF only ever run on one closed loop. The save change is additive, so there is no migration and nothing is discarded by `migrate`.
  - About 3.5–4 days.
- **Item 4, decisions proposed.**
  - Cover both "front hidden behind the neighbour's side" and "fronts meeting at the corner (handles)", each with the fix that works for it.
  - Blocked keeps its current meaning (can't be placed; one-click fix). It is not "DRAFT PDF only", because blocked already stops the Quote screen and the PDF entirely.
  - Build `insideCorners` first, then item 4, then item 1.
  - About 2–2.5 days once the questions are answered.
- **Facts recorded.**
  - There is no corner filler SKU. FIL is 1–100 mm, with its price worked out from area × finish rate, and it already shows in the quote and PDF.
  - The repo has no handle clearance figure: it must come from Makwana.
  - As planned, the rule would fire on the sample design and the main script at the A/B corner.

## Decisions 2026-11-16

Also written into `docs/PLAN-wall-start.md` ("Decisions 2026-11-16"). Build order: the `insideCorners` helper, item 4, item 1. One commit per item; every gate before each commit. Not merged.

- **Item 4.**
  - Case a), a hidden front (part of a front behind a neighbour's side): Blocked for every unit type. Fix "Move clear of corner"; no button, and the reason in the message, when no spot exists.
  - Case b), a handle clash (two fronts meet at the corner): Blocked if either unit is tall, a Warning for base and wall units. Fix "Add corner filler": a FIL "Filler panel" at the clearance width, and the unit moves along its wall by that width. No button, and the reason, when the wall has no room.
  - Blocked keeps its meaning (can't be placed; hides the quote and the PDF). No new severity.
  - Height bands decide clashes: same band, loft with loft, tall with every band. Base next to a wall unit doesn't clash.
  - Clearance: one constant per handle type, 50 mm each, **TO CONFIRM WITH MAKWANA** (open items). No new "Corner filler" SKU.
  - The old corner rule merges into case a): one message per unit per corner.
  - The sample design's A/B corner is fixed so the sample is clean. The demo script and the brief gain one step: make a clash, see the warning, "Add corner filler", the quote shows the filler.
- **Item 1.**
  - Free ends only, no branches. A new wall joins only when it exactly closes its own gap; otherwise it stays open.
  - Tabs and lists in room order (A B C J D…), not alphabetical; walls are not renamed.
  - No click: the first free end in room order (today's behaviour).
  - Old saves load with no migration; a test loads a save from before the change.
- **Kept**: the inspector's square turn button.

## Item 4: Inside-corner door clash rule

`src/domain/rules/corner.ts`. Both rules read one analysis per rules run (`analyseCorners`), over every inside corner from `insideCorners`. Positions are distances from the corner along each wall, so it works whichever end of a wall the corner is at.

- **Which units meet.** Catalogue units only (not fillers, not appliances). Height bands decide (`bandsClash`): the same layer meets, so do two lofts; a tall unit meets every layer; base next to a wall unit, or a loft next to a wall unit, doesn't. Units standing in each other's footprint are the overlap rule's business and are skipped.
- **Case a), hidden front (`corner`, Blocked).** Part of a unit's front (its opening part: a BC1000's blind section doesn't count) is within the other unit's depth of the corner, and the other unit's side stands closer to that front than the unit's own depth (the room a drawer needs to pull out). Message: "W600's front is behind the side of W900 at the corner of Wall A and Wall B. 350 mm of it can't open: move W600 along Wall A until its front is clear."
  - Fix "Move clear of corner": the nearest spot along its own wall where its front starts past the other unit's front, plus the clearance if the other front starts right there (so the move doesn't make a clash). Clear of its band and, above base, of windows. If no spot is safe there is no button and the message ends "There is no free spot on Wall A where its front is clear."
  - **The old corner rule is merged in.** "No corner solution" (base units on both walls, no BC1000) and "blind side facing away" are both this case, now Blocked rather than a warning. Their fixes are kept after "Move clear of corner": "Replace B600 on Wall A with BC1000 in the corner" and "Make the blind side right". One hidden-front message per unit per corner (the nearest neighbour), and no clash message for a unit whose front is hidden. A BC1000 with no blind side is left to the blind-side rule.
- **Case b), handle clash (`corner-clash`).** Neither front is hidden, and each front starts less than the clearance past the other unit's front. Blocked if either unit is tall, a Warning otherwise. Message: "Handles clash where BC1000 and BD600 meet at the corner of Wall A and Wall B. The fronts need 50 mm between them: add a corner filler."
  - Fix "Add corner filler" (new `addCornerFiller` fix action, `src/domain/fixes.ts`): a FIL "Filler panel" at the clearance width, and the unit moves along its wall so its front starts the clearance past the other front (by the clearance width when they touch). Units in the same layer it would run into are pushed on. It is tried first on the unit that already stands off the other (the filler fills that gap), otherwise on the unit nearer the corner: a blind corner unit is pulled out of the corner with the filler behind it. Only one "Add corner filler" is shown: the first that the engine proves safe. If neither works there is no button and the message ends "Neither Wall A nor Wall B has room to move a unit 50 mm along."
  - The leftover-gap rule leaves a gap inside a clash to this rule, so it doesn't offer "Add a 20 mm filler", which would close the gap and leave the handles clashing.
- **Clearance.** `CORNER_CLEARANCE_MM = { handle: 50, handleless: 50 }`, from the shutter type ("Handleless profile" or anything else); a pair uses the larger. **TO CONFIRM WITH MAKWANA** (open items).
- **Blocked means what it meant.** Both rules are in `PLACEMENT_RULES`, so the drag preview, R / Shift+R, the Move list and the Wall picker (`wallsUnitFits`) agree with the drop. No new severity; a blocked corner hides Review Quote and the PDF as before.
- **"Say why" when there is no fix.** A rule result can carry `noFixReason` (`{ label, reason }`); when no safe fix with that label is kept, the reason is added to the message.
- **Sample design.** The A/B corner had both cases: BD600's drawers started right at BC1000's door (warning), and W600's front was behind W900's side (blocked). Now: BC1000 is pulled 50 mm out of the corner (A 2150) with a 50 mm corner filler behind it (A 3150), the filler before it is 50 mm (A 2100), and W600 is at A 2200, clear of W900 and just past the window. Still 14 units; all checks pass.
- **Demo script and brief.** New step after the first BD600 on wall B: the amber note "Handles clash where BC1000 and BD600…", click "Add corner filler": BC1000 moves to 2150, a 50 mm filler goes in at A 3150. The later filler step is now "50 mm gap … Add a 50 mm filler" (was 100). The Quote step checks the two "Filler panel" lines on Wall A (50 × 720 × 20).
- **Behaviour changes to check by hand.**
  - A base unit butted into a corner next to another base unit is now Blocked (was a warning), as is any wall unit, loft or tall unit whose front is behind a neighbour's side.
  - A corner where both runs stop short with room between the fronts gets no message (the old rule warned "no corner solution" for any base units within 1000 mm of the corner).
  - In the sample design HU900 can no longer go to Wall C: anywhere on C it would stand in front of the T600OM's doors at the B/C corner. The Move list, R and the Wall picker offer A and H only; R from wall A goes to H.
- **Tests.**
  - Unit (`src/domain/rules/corner.test.ts`, 17): the band table; base next to a wall unit, loft next to a wall unit (no clash); two lofts; wall units hidden and moved clear to A 2200; a base unit and a wall unit in front of a tall unit's doors, and one a unit's depth away (clear); no spot, with the reason; one message for a plain base corner, no gap or clash too; refused when placed, and the fast check agrees; the BC1000/BD600 warning and its filler; passes at the clearance; the run pushed along on B when A is full; the old sample with no room on either wall; tall blocked, refused, fast check, fixed; the 20 mm gap left to the clash rule; the filler priced as a FIL quote line; the clearance constants; the sample clean. Updated: the two old corner tests (now Blocked), the corner anchors, the sample's BC1000 position, the quote's base lines, the hob unit's turn (H, not C) and its fit list (A, H). Store: the tall unit refused, then placed with the filler as one undo step; the base unit's warning fix.
  - e2e (`e2e/corners.spec.ts`, both sizes): a) blocked, "Move clear of corner" places it at A 1990; b) a tall unit blocked, "Add corner filler" places it with BC1000 at 2150 and the filler at A 3150; b) a base unit warned, fixed, and the Quote lists the filler; a base unit and a wall unit in the corner: no card, all checks passed. The main script has the new step. The drag helpers moved to `e2e/drag.ts`.
- **Checks.** `npm test` 245/245, `tsc` and `lint` clean, build passes (`/design` 346 kB, `/quote` 313 kB, `/setup` 311 kB, shared 237 kB). `npm run e2e`: 72 passed, 2 skipped (automatic performance mode), across both sizes: 64 plus the four corner tests at each size. The two ✘ lines in the output are the console guard's expected-failure self-check, which counts as passed.

## Item 1: Start a new wall from any free end

`src/domain/wall-ends.ts` (pure), the store's `drawWall` and `closeGap`, Room Setup's walls panel and plan. As planned in `docs/PLAN-wall-start.md`, with the decisions of 2026-11-16.

- **Model (additive, no migration).** The room stays one ordered list of walls and gaps.
  - A gap a wall has been drawn into carries its own vector, `gapMm: { dx, dy }`, which replaces length and heading for the room's shape (a deleted wall's own gap has none and is drawn back as before).
  - `room.start` (default (0, 0)) moves only when a wall is drawn back from Wall A's start.
  - `roomVertices` and `isChainClosed` read both; nothing else in Design, 3D, the quote or the PDF changes.
  - The save check accepts both fields when well formed (`gapMm` only on an open segment, whole mm, not zero; `start` whole mm). `PERSIST_VERSION` stays 2.
- **Free ends only.** A free end is the end of a standing wall where no standing wall meets it: the open chain's start and end, and both sides of every gap (`freeEnds`, in room order). Joined ends have no handle; no branches or T-junctions.
- **Drawing** (`drawFromEnd`, one undo step). The new wall goes next to the clicked end. Every existing corner stays put, so features and units don't move.

  | Clicked end | The new wall | What else changes |
  |---|---|---|
  | The chain's end | Appended, as before | Nothing |
  | The end of a wall before a gap | Inserted before the gap | The gap shrinks |
  | The start of a wall after a gap | Inserted after the gap, stored travelling back to that wall | The gap shrinks |
  | Wall A's start (open chain) | Inserted first, stored travelling back to Wall A | `room.start` moves |

  The direction buttons offer the two at right angles to the wall at that end, drawn away from it.
- **Joining.** A new wall joins only when it ends exactly on its own gap's other end: the gap is removed and the right-angle check applies at the new joint. Closing the open chain works as before. Anything else stays open. A wall that touches or crosses another standing wall where they aren't neighbours is reported: "Wall I runs into Wall D." This check is new (`crossingWalls`); nothing detected crossing walls before.
- **Gaps drawn into.**
  - Reported as "The room is open between Wall B and Wall I (1000 mm)." and labelled "C · 600 × 1000 · open" on the plan.
  - Their row and plan button say "Close gap", not "Draw wall": one or two right-angle walls from the gap's start to its end (`gapClosure`), turning off the wall before and into the wall after, with new letters. Disabled when they don't fit, e.g. a straight gap left after drawing straight on (the existing rule: two walls in a row turn a right angle).
  - Close room fills every gap it can and the open end, still in one step.
- **Order and letters.** A new wall takes the next free letter (gap letters stay held) and sits in room order. The walls list, the plan, the Design tabs, R / Shift+R and the Move list read A B I D… Walls are never renamed.
- **The start of the next wall** is Room Setup view state (`setup-ui.ts` `wallStart`), not project data, so it isn't undone.
  - With no click it is the chain's end when the chain is open (as before), otherwise the first free end in room order.
  - After a draw it moves to the new wall's far end; after a join, back to the default.
  - Esc, Done, or clicking the picked handle again clears it. If an undo joins the picked end, the default is used.
- **UI.**
  - While adding walls, each free end is a handle: 10 px, accent ring, a 12 px hit area, bigger on hover, with a tooltip such as "Start from the end of Wall B" (since step 2: "Start from Wall B's free end"). The current start is filled.
  - The panel reads "Wall I · from the start of Wall D · pick a direction and type its length" (since step 2: "Wall I · from Wall D's free end · …"). A dashed preview shows the new wall at the typed length.
  - A closed room with no gaps shows no handles, and the panel says "The room is closed. Delete a wall to open it."
- **Behaviour changes to check by hand.**
  - Add wall in a closed room with no gaps no longer appends a wall (that used to open the room at Wall A's start). Delete a wall first.
  - The right-angle check no longer compares a gap with its neighbours, only walls that meet.
  - "Runs into" can flag a room that used to pass if two walls touched or crossed. No seed or template does.
  - "Start" and "end" of a wall in the panel and tooltips follow the wall's drawing direction (the arrow in the walls list), which a salesperson may not think about. **Fixed 2026-11-17 (step 2):** ends are named by what meets them.
- **Tests.**
  - Unit (`src/domain/wall-ends.test.ts`, 14): free ends for a closed room, a gap, an open chain, two gaps, a gap at A; the default end; drawing from each of the four kinds of end leaves every old vertex and wall frame unchanged; joins from either side give a closed, valid room; past the gap's end: "runs into", no join; an L-shaped gap that Close gap fills; a drawn-into gap that can't be closed straight; the inside corner made by a drawn wall; save validation of the new fields. `open-segments.test.ts` adds the two new gap fields.
  - Store: a draw is one undo step, its letter skips the gap's, and a join closes the room. No free end means nothing is drawn. Draw wall leaves a drawn-into gap alone; Close room and Close gap fill an L-shaped gap in one step. A project saved before this change (`src/store/fixtures/save-2026-11-16-before-wall-ends.json`, written by the build before it: Walls C and G deleted, one unit) loads unchanged with no notice, and its gaps work with the new tools.
  - Item 4 again: all corner unit and e2e tests re-run after item 1 and pass. A new unit test draws Wall I back from D's start (the clicked end) to close C's gap. A BC1000 and a BD600 at the new B/I corner give the clash warning and its filler, and two base units there give the hidden-front block.
  - e2e (`e2e/wall-ends.spec.ts`, both sizes): click D's start, draw east 600. The wall runs from (2200, 2400) to D's start, sits in the list after the gap, the other walls are unchanged, the next start is the new wall's far end, and Esc goes back to the default. Clicking the joined A/B corner changes nothing (no handle, same start, same walls). Drawing west 1600 from B's end closes the gap: "Room closed · 8 walls", the new wall's outline is exactly the old Wall C's, Start Designing opens Design, and the tabs read A B I D E F G H.
- **Checks.** `npm test` 264/264, `tsc` and `lint` clean, build passes (`/design` 348 kB, `/quote` 315 kB, `/setup` 313 kB, shared 239 kB). `npm run e2e`: 78 passed, 2 skipped (automatic performance mode), across both sizes: 72 plus the three wall-end tests at each size. The two ✘ lines are the console guard's expected-failure self-check.

# Before the merge, 2026-11-17

Branch: `feedback-1` (continued). One commit per step, every gate before each commit. Merged into `main` afterwards (see "Merge" below).

| Step | Status | Commit |
|---|---|---|
| 1 Hidden-front threshold for door units | Done (rule changed) | `a02904b` |
| 2 Wall end wording | Done | `22eeb86` |
| 3 Docs (this section, the open items, the brief) | Done | see `git log` |

## Step 1: Hidden-front threshold for door units

- **Test first.** `src/domain/rules/corner.test.ts`, "a) hidden front: a door needs its swing, a drawer its depth". A door base unit on Wall A next to the A/B corner, and a B600 on Wall B whose side stands 200–300 mm past the unit's front. Each row's expected result comes from an independent sweep in the test (`doorsOpen`): each door, plus a 50 mm handle allowance, turns from shut to 90° in 0.25° steps, and the test checks whether it enters the B600. Rows: B300 520 mm from the corner at 200/250/300 mm, B450 at 250/300 mm, B600 in the corner at 200/300 mm, B600 250 mm from the corner at 250 mm.
- **It failed** on the old rule in exactly the three rows where the door opens fully (B300 at 250 and 300, B450 at 300): all three were Blocked. So the rule changed.
- **Rule** (`hiddenBy` and the new `doorsOpen`, `src/domain/rules/corner.ts`). A front still has to stand partly behind the neighbour's side to count (unchanged). Then:
  - **Drawers** (BD, HU): blocked when the neighbour's side is closer than the unit's depth. Same as before.
  - **Doors**: blocked only if a door's swing reaches the neighbour. The swing is a quarter circle round the hinge, as wide as the door plus the handle clearance (`CORNER_CLEARANCE_MM`, 50 mm, **TO CONFIRM WITH MAKWANA**). Door width is the opening part's width ÷ the number of shutters.
  - **Hinge side.** Double doors hinge at the unit's two ends. A door hinged on the corner side swings away from the corner, so it needs (door + clearance) between the front and the neighbour's side. A door hinged on the far side swings its edge round towards the corner, so it needs that much from its hinge to the neighbour's front corner. The catalogue has no hinge side, so a single door may hinge on either side, and the rule takes the side that opens. **TO CONFIRM WITH MAKWANA** (open items).
  - **Units with both** doors and drawers must pass both tests: the stricter wins. No catalogue unit has both today. The test uses a made-up BX600.
- **Effect.** Only door units can now pass where they were Blocked, and only in two cases. A B600 needs 350 mm between its front and the neighbour (was 560). A single door that only just reaches behind the neighbour can open if it hinges on the far side. Drawer units, the message, the fixes ("Move clear of corner", the BC1000 and blind-side fixes) and the handle-clash rule are unchanged. Every existing corner case has the neighbour flush against the front (0 mm), so all still give the same result. The sample design and the main script are unchanged and pass every check.
- **More tests.** B600 at 349 mm Blocked and at 350 and 400 mm clear (the sweep agrees at 349/350). BD600 Blocked at 200, 300, 400 and 559 mm, clear at 560. BX600 (doors + drawer) Blocked at 400, clear at 560. `checkPlacementFast` and `checkCandidate` agree: the B300 that opens is placed, and a B600 in the corner is refused.
- **Checks.** `npm test` 276/276, `tsc` and `lint` clean, build passes (`/design` 348 kB, `/quote` 315 kB, `/setup` 313 kB, shared 239 kB). `npm run e2e`: 78 passed, 2 skipped (automatic performance mode). The two ✘ lines are the console guard's expected-failure self-check.

## Step 2: Wall end wording

- **Cause.** "Start" and "end" of a wall followed its drawing direction, which a salesperson can't see.
- **Now.** `endName(room, end)` (pure, `src/domain/wall-ends.ts`) names an end by the wall that meets it there: "End at Wall B". An end at a gap, or at the open end of the room, is a "Free end". When both ends of one wall are free (Wall D after deleting C and E, or a room of one wall), the compass side tells them apart: "Free end (north)", "Free end (south)". `endPhrase` puts it in a sentence: "Wall D's free end", "Wall B's end at Wall A".
- **Where.** Only free ends are named in the UI: the plan's handles, and the panel line for the picked one. Joined ends have no handle. So "End at Wall B" is in the helper and its tests, but nothing on screen shows it today.
  - The panel: "Wall I · from Wall D's free end · pick a direction and type its length" (was "from the start of Wall D").
  - The plan handles' tooltip and aria-label: "Start from Wall D's free end" (was "Start from the start of Wall D").
- **Not changed.** The data model (`EndRef` still says `start` / `end`), the `data-free-end="D:start"` and `data-wall-start` test hooks, and every behaviour.
- **Tests.** Unit (`wall-ends.test.ts`, 3): joined ends by neighbour, including A/H across the closing corner; free ends at a gap and at an open chain's ends; both ends free on D and on a single wall. e2e (`wall-ends.spec.ts`): the default panel line ("from Wall B's free end"), both handles' tooltip and aria-label, the line after clicking D's free end, and after the draw ("Wall J · from Wall I's free end").
- **Checks.** `npm test` 279/279, `tsc` and `lint` clean, build passes (same sizes). `npm run e2e`: 78 passed, 2 skipped (automatic performance mode).

## Step 3: The brief's main script against this build

Each step of section 6 was checked against `e2e/main-script.spec.ts`, which asserts every "Expect" line and passes at both sizes. Two lines were out of date, both since Feedback 1, and are fixed in `docs/handover-brief.md`:
- Customer view. The button is a presentation icon now, not an expand icon (item 5). The wall-height toggle has Auto, Cut at 450 and Full height, with Auto on (item 3).
- Quote. The 3D view opens in Auto. The script also checks the two 50 mm "Filler panel" lines on Wall A.

Also corrected in the brief: install with `npm ci` (the lockfile note), the test count, `npm run e2e`, the git history line, the 3D row, and "two tabs can overwrite each other" (a second tab has been blocked since hardening #4). Every other step matched.

# feedback-1: every change, in one place

Branched from `main` at `7ebdeee`. In commit order:

| # | Change | Commit | Details |
|---|---|---|---|
| F1.3 | 3D "Auto" wall mode: walls in front hidden; the default in Show customer, on the Quote screen and in the PDF picture | `ccb1449` | Feedback 1, item 3 |
| F1.4 | Wall letters on the Design 3D floor (removed again in F2.2) | `b01dcae` | Feedback 1, item 4 |
| F1.5 | Full screen opens the active view (Room Setup plan, Design plan/elevation, 3D) as an overlay; Show customer gets a presentation icon | `7afe5dd` | Feedback 1, item 5 |
| — | HARDENING: Feedback 1 section | `38fb655` | |
| F1.1 | Deleting a wall leaves a gap; the other walls don't move; Close room | `b95cef1` | Feedback 1, item 1 |
| F1.2 | Choose which wall a unit faces: R / Shift+R, turn button, Wall picker | `ce30c9c` | Feedback 1, item 2 |
| — | HARDENING: Feedback 1, items 1 and 2 and the final run | `6ff5d57` | |
| F2.2 | 3D wall labels removed completely | `8b52877` | Feedback 2, item 2 |
| F2.3 | Move button lists the walls a unit fits on (replaces the round turn button); one fit check | `a222088` | Feedback 2, item 3 |
| — | Plan for F2.1 and F2.4 | `bdd6395` | `docs/PLAN-wall-start.md` |
| — | Decisions 2026-11-16; `insideCorners` helper (no behaviour change) | `690f095` | |
| F2.4 | Inside-corner rules: hidden front Blocked; handle clash a warning (Blocked with a tall unit); "Add corner filler"; sample design fixed; one new main-script step | `c676de5` | Feedback 2, item 4 |
| F2.1 | Start a new wall from any free end, by clicking it on the plan; gaps carry their own vector; "runs into" check | `d43ff24` | Feedback 2, item 1 |
| S1 | Hidden front: a door needs its swing, a drawer its depth | `a02904b` | Step 1 above |
| S2 | Wall ends named by what meets them ("Free end", "End at Wall B") | `22eeb86` | Step 2 above |

**Save format.** F1.1 adds `open` on a wall; F2.1 adds `gapMm` on an open segment and `room.start`. All are additive: `PERSIST_VERSION` stays 2 and old saves load unchanged. An older build can't read a save that uses them (open items: same build on both Macs).

**Behaviour changes a presenter may notice.**
- A deleted wall leaves a dashed gap. Design stays locked until the room is closed again (Draw wall, Close gap or Close room).
- Add wall in a closed room with no gaps does nothing; delete a wall first. The next wall starts at the clicked free end, or by default the chain's end or the first free end.
- Tabs, lists, R / Shift+R and the Move list follow room order (A B I D…), not the alphabet.
- R / Shift+R, the Move list and the Wall picker only offer walls with a free spot for the unit.
- A base unit butted into a corner next to another base unit is Blocked (it was a warning). Two fronts meeting at a corner warn, and offer "Add corner filler". A door unit with room to swing is not Blocked (S1).
- 3D: Auto wall mode in Show customer, on the Quote screen and in the PDF; Design keeps Cut at 450. No wall labels in 3D.
- Full screen fills the window, and also asks the browser for full screen.

**Checks on `feedback-1` before the merge** (after S2): `npm test` 279/279, `tsc` and `lint` clean, build passes, `npm run e2e` 78 passed and 2 skipped (automatic performance mode), across both sizes.
