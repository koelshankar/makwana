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
- **#11** `quoteModel` sets `header.watermark = "DRAFT"` unless approved; the print page repeats it on every page. Tests: domain unit + e2e.
- **#12** The toast uses `project.preparedBy`. Test: e2e (seeded with another preparer).

Final run: `npm test` 172/172, `tsc` and `lint` clean, build passes (`/design` 339 kB), `npm run e2e` 12/12.

## Brief: "Fixed on Day 10" check

Checked in the code, then measured in Chrome against the production build at 1366×768 and 1440×900 (sample design; a temporary Playwright script, not kept).

| # | Day 10 fix | Result | Evidence |
|---|---|---|---|
| D1 | Quote table: description into size column, cost tags touching amount, filler rows indented | Holds | `quote-groups.tsx`: `pr-4` on the description, `whitespace-nowrap` on size, `pr-4` on the tags cell. 16 rows at both sizes: no description runs past the size column, tag-to-amount gap ≥ 8 px. Filler text starts at the same x as the other rows' code. |
| D2 | Group cost tags hidden below 1400 px | Holds | `data-group-tags="below"` shows under `min-[1400px]`. 1366: all four groups show tags on a second line. 1440: tags inline. |
| D3 | Design wall tabs cut off ("Wal…") at 1366 | Holds | Tabs are `shrink-0 whitespace-nowrap` in a scrolling tab list with a fade at the right edge below 1440. All nine tabs measure full width at both sizes. |
| D4 | Room Setup footer cut off all three texts when open | Holds | Only the third chip (the room issue) may truncate; it carries the full text as a tooltip. With wall B at 2462: 1366 shows "Room open · 8 walls" and "6 features placed" in full and "The room isn't closed yet (open by 62 m…"; 1440 shows all three in full. |
| D5 | After approval the Quote screen still said "Needs manager approval" | **Partly** | The checks summary reads "Approved by Store Manager" (`ChecksSummary` with `approvedBy`). But the Totals card's discount note (`quote-cards.tsx:95`) still reads "above 5% · needs approval" after approval, at both sizes. Not fixed in this pass; see Open items. |
| D6 | Activity details squeezed to three lines at 1366; empty log showed nothing | Holds | Time and name are stacked in a 150 px column. Detail width 300 px at 1366 and 374 px at 1440; every entry in the main script fits on two lines. The empty log shows "Nothing yet. Discount changes, approvals and sharing are logged here." |
| D7 | Quote small plan: overlapping cut-out and ceiling labels | Holds | `DesignPlan compact` drops dimensions, the ceiling label and the cut-out labels. The Quote small plan has no `<text>` at all. |
| D8 | "THREE.Clock" deprecation warning on every 3D view | Holds | `kitchen-scene.tsx` drops exactly that message through `THREE.setConsoleFunction` (R3F 9 still creates a `THREE.Clock`). The console guard sees no warning on any 3D screen. Comes back if three's message text changes. |
| D9 | A save that wasn't valid JSON left the loading screen on forever | Holds | `safeJSONStorage` turns a parse error into an empty save, which `merge` replaces with the empty Mehta room. Reload with `{{{ not json`: no skeleton, toast "The saved project couldn't be opened". |

## Brief: section 6 main script (`e2e/main-script.spec.ts`)

One test, Reset demo to the PDF and the activity log, in one page with no reload (no `load` event after the first, and a marker set on `window` at the start is still there at the end). It runs at 1366×768 and 1440×900 and passes at both. Every "Expect" line in the brief is an assertion. The console guard fails it on any error or warning, and a screenshot of each stage goes to the test's output folder.

How each line is checked, where it isn't obvious:

- Snapping: each drop is aimed 20–40 mm off its place and must land exactly there (HU900 300, SU900 1200, BC1000 2200, BD600 560 and 1160). Positions are read from the saved project in localStorage.
- The blocked card: the title says tall unit and window, "+1 more blocking issue", the fix "Move to Wall B, 1760–2360 mm", and nothing placed. After the fix: T600OM at B 1760, and a 40 mm gap warning on Wall B.
- Filler: a filler at A 2100 +100, then a single check left (the 40 mm warning), and Review Quote enabled.
- Appliances: green hosts (`data-host`) for the sink, hob and oven while dragging. Sink, hob, oven and microwave fitted into the right units; chimney at A 300, above the hob; "5 appliances". Cut-outs in the elevation ("Sink cut-out", "Hob cut-out") and the plan (`data-cutout`).
- Finish: 3D picture, unit price, running total and footer delta change; the footer delta equals the change in the total.
- Customer view: fills the viewport, project name, wall height, presets, and no buttons beyond the view controls. Esc leaves it, and so does Exit. Project and footer are unchanged.
- Quote: no number before sending; 0147 after; manager banner and buttons; "Approved by Store Manager". The clipboard holds the quote number and the grand total. `window.print` is stubbed and must be called once. The print page has 0147, Approved, a decoded 3D image, a plan with both cut-outs, elevations A and B, unit codes, totals and no watermark. With print media the toast and the screen controls are hidden. Activity has six entries in order (discount, created, sent, approved, shared, shared), each with seconds. `nextQuoteSeq` is 148 at the end: one number used.

What the test cannot see: the native print dialog and the saved PDF file; whether the 3D cut-outs are *right* (it checks only that the 3D picture changed after the drops); real full screen (headless). In the test, Esc is a synthetic key, so the test leaves browser full screen itself, as a real Esc would.

Test-only waits (not app bugs): dnd-kit swallows clicks for 50 ms after a drop, so the test waits 100 ms after each drop; and it waits for each drop to be saved before the next step.

Findings from writing it:

| ID | Severity | Finding |
|---|---|---|
| M1 | Demo risk | **BC1000 can snap onto SU900 at 1366.** Neighbour edges win over the wall end, and the snap distance is 8 px: 87 mm at 1366, 79 mm at 1440. Dropped 13–87 mm short of the end of wall A at 1366, BC1000 lands at 2100 against SU900. The 100 mm gap, its warning and the filler step of the script then never happen. Dropped at the end or past it, it lands at 2200. The test drops 20 mm past the end. Options: try the nearest target across neighbour and run-end classes, or have the presenter drag past the wall end. |
| M2 | Minor | **A finish change doesn't show in the elevation while the unit is selected.** The elevation fills a selected unit with the selection colour (`--mk-accent-soft`). The brief says "elevation, 3D and price change together"; the 3D view and price do, but the elevation shows the new finish only after Esc or clicking away. The test checks the elevation after Esc. |
| M3 | Brief | **"Shared twice" needs Download PDF from the Share dialog.** That button logs a share; the footer's Download PDF doesn't. The brief says "Click Download PDF" right after Copy, with the dialog still open, so the test uses the dialog's button. A presenter using the footer button gets five entries, not six. |
| M4 | Minor (D5) | After approval the Totals note still reads "above 5% · needs approval" (see D5). The test doesn't assert it either way. |

## Open items

- D5: after approval, the Totals discount note still reads "above 5% · needs approval". A presenter would see it right after approving. Fix: pass the approval to `TotalsCard` and read "above 5% · approved by Store Manager".
- M1: BC1000 snapping at 1366 (see the main script findings).
- The section 7 Playwright tests are not written.
- #1: install, build and run `npm start` once offline on the demo laptop.
- Shared JS grew from 195 kB to 233 kB: the error pages pull the project store into the root chunk.

## Decisions

- **No tab sync.** A second tab is blocked, not kept in sync. One live tab means one writer for the save and the quote counter. To switch tabs, close the first one and reload the second.
- **DRAFT watermark.** Download PDF stays available before approval, so the salesperson can send a preview, but every page is marked DRAFT until the quote is approved.
- **Playwright on real Chrome GPU.** Tests use the installed Google Chrome (`channel: "chrome"`) with no SwiftShader flags. Software WebGL logs "GPU stall due to ReadPixels" warnings, which would trip the rule that fails a test on any console error or warning. The demo machine needs Google Chrome installed.

## Lockfile note

npm 11.5.2 removed other platforms' optional bindings (rolldown, lightningcss) from `package-lock.json` when installing `@playwright/test`, even with `--package-lock-only`. That broke vitest. The committed lockfile is the original plus only the four Playwright entries, checked with a clean `npm ci`. Use `npm ci`, not `npm install`, and check the lockfile diff after adding any dependency.
