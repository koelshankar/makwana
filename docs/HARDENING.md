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
- **TO CONFIRM WITH MAKWANA**: the corner handle clearance (Feedback 2, item 4). `CORNER_CLEARANCE_MM` in `src/domain/rules/corner.ts` is 50 mm for "Standard with handle" and 50 mm for "Handleless profile". Both are placeholders, not from Makwana's hardware spec. The corner filler uses the existing FIL "Filler panel" (1–100 mm), so a figure over 100 mm needs a change.
- Shared JS grew from 195 kB to 233 kB: the error pages pull the project store into the root chunk.

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
| 1 Start a new wall from the end of any wall | Plan only: `docs/PLAN-wall-start.md` | — |
| 4 Inside-corner door clash rule | Plan only: `docs/PLAN-wall-start.md` | — |

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
