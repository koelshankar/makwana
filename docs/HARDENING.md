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

Final run (pass 3, the fixes below, with `isQuoteFinal`): `npm test` 177/177, `tsc` and `lint` clean, build passes (`/design` 339 kB, `/quote` 308 kB, shared 233 kB). `npx playwright test`: 40 passed, 2 skipped (the same automatic performance mode half), 42 in all.

## Pass 3 fixes

| ID | Fix | Test |
|---|---|---|
| M1 | `snapOffset` tries a free wall end first, then neighbour edges, then the other run ends, then features. A wall end counts only if the unit there would overlap nothing, so the column in the A/H corner is never a target. | Unit: wall end beats a neighbour in reach; occupied end skipped. e2e: the main script drops BC1000 20 mm short of the end of wall A again; it lands at 2200 at both sizes. (With the old order it landed at 2100 at 1366.) |
| M2 | The elevation draws a selected unit as an accent outline over its normal finish tint. Blocked units keep their red fill. The plan is unchanged: it fills units by layer, not finish. | e2e: in the main script the tint (`data-finish-tint`) changes to the new finish while HU900 is still selected. |
| M3 | The download log moved into `useDownloadPdf`, which both the footer and the Share dialog use, so each download logs once. It calls `markPdfDownloaded` (`src/domain/quote.ts`). A final quote (see `isQuoteFinal` below) logs the share "Version N shared with … · PDF downloaded to send". Any other logs `draft_downloaded` "Draft PDF downloaded · Version N", which is not a share. | Unit: both approval modes, draft, pending, approved and version 2; no quote logs nothing. e2e (focused "download assigns a number", "Always"): the footer download of a draft logs "Draft PDF downloaded · Version 1" and no share; after approval the same button logs one share. The main script (approved, from the dialog) still sees exactly two shares. |
| Final | `isQuoteFinal(project, settings)` in `src/domain/quote.ts`: true if the quote is approved, or if the approval mode is "Only when flagged" and nothing needs approval (no `approval` rule results; computed from the project if not given). It decides the DRAFT watermark (`quoteModel` takes the settings; without them it assumes "Always") and the download entry. `canShare` now uses it too (final and nothing blocked), the same rule as before, written once. | Unit: `isQuoteFinal` in both modes; the watermark in "Only when flagged" with discount 0 and 8. e2e (focused): "Only when flagged", discount 0, Share → Download PDF: 0147, no watermark, one share logged, no draft entry. |
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
- Shared JS grew from 195 kB to 233 kB: the error pages pull the project store into the root chunk.

## Decisions

- **No tab sync.** A second tab is blocked, not kept in sync. One live tab means one writer for the save and the quote counter. To switch tabs, close the first one and reload the second.
- **DRAFT watermark.** Download PDF stays available before approval, so the salesperson can send a preview, but every page is marked DRAFT until the quote is final: approved, or in "Only when flagged" mode with nothing that needs approval (`isQuoteFinal`). A draft download is logged as "Draft PDF downloaded · Version N", not as a share.
- **Playwright on real Chrome GPU.** Tests use the installed Google Chrome (`channel: "chrome"`) with no SwiftShader flags. Software WebGL logs "GPU stall due to ReadPixels" warnings, which would trip the rule that fails a test on any console error or warning. The demo machine needs Google Chrome installed.

## Lockfile note

npm 11.5.2 removed other platforms' optional bindings (rolldown, lightningcss) from `package-lock.json` when installing `@playwright/test`, even with `--package-lock-only`. That broke vitest. The committed lockfile is the original plus only the four Playwright entries, checked with a clean `npm ci`. Use `npm ci`, not `npm install`, and check the lockfile diff after adding any dependency.
