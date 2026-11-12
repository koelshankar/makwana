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
| 7 | Demo risk | Quote counter reset on save-version change; silent failed saves | Fixed (gap below) |
| 8 | Minor | Empty discount field meant 0% | Fixed |
| 9 | Minor | A restore error left the loading skeleton up for good | Fixed |
| 10 | Minor | PDF waited forever for the 3D picture | Fixed |
| 11 | Minor | Draft PDFs looked final | Fixed |
| 12 | Minor | "Sent back" toast named Rohan Desai | Fixed |

## Fixes and tests

- **#2** Error page has Start over: `startOver()` clears `makwana:project` and runs Reset demo. Test: store unit.
- **#3** The canvas reports `webglcontextlost`/`webglcontextrestored`. The panel shows while lost; the canvas remounts on restore (`scene-health.ts`). Tests: unit + e2e.
- **#4** BroadcastChannel tab guard (`src/lib/tab-guard.ts`). The newer tab shows "This demo is open in another tab." Tests: unit + e2e.
- **#5** `app/error.tsx` and `app/global-error.tsx` use the shared error screen. Test: none (no way to force a crash); build passes.
- **#6** `designChanged` includes name, customerName, siteAddress and kitchenType. Tests: domain + store unit, e2e.
- **#7** `migrate` keeps `nextQuoteSeq`. `guardedStorage` reports the first failed save; the shell shows a toast. Test: store unit.
- **#8** `parseDiscountInput` returns null for empty or non-numeric text. Tests: unit + e2e.
- **#9** `onRehydrateStorage` error loads the empty Mehta room. Screens wait on `isRestored()`. Test: store unit.
- **#10** `snapshotStep` gives up after 3 s and prints without the picture. Test: unit.
- **#11** `quoteModel` sets `header.watermark = "DRAFT"` unless approved; the print page repeats it on every page. Tests: domain unit + e2e.
- **#12** The toast uses `project.preparedBy`. Test: e2e (seeded with another preparer).

Final run: `npm test` 172/172, `tsc` and `lint` clean, build passes (`/design` 339 kB), `npm run e2e` 12/12.

## Open items

- The handover brief was not available: "Fixed on Day 10" is not checked, and the section 6 and 7 Playwright tests are not written.
- #1: install, build and run `npm start` once offline on the demo laptop.
- #7 gap: a save-version change still replaces the saved project with the sample design without a toast.
- #3: the remount logs about 84 harmless WebGL "object does not belong to this context" warnings. The e2e test allows only these. Three.js restores cleanly without a remount, which is an alternative.
- Shared JS grew from 195 kB to 233 kB: the error pages pull the project store into the root chunk.

## Decisions

- **No tab sync.** A second tab is blocked, not kept in sync. One live tab means one writer for the save and the quote counter. To switch tabs, close the first one and reload the second.
- **DRAFT watermark.** Download PDF stays available before approval, so the salesperson can send a preview, but every page is marked DRAFT until the quote is approved.
- **Playwright on real Chrome GPU.** Tests use the installed Google Chrome (`channel: "chrome"`) with no SwiftShader flags. Software WebGL logs "GPU stall due to ReadPixels" warnings, which would trip the rule that fails a test on any console error or warning. The demo machine needs Google Chrome installed.

## Lockfile note

npm 11.5.2 removed other platforms' optional bindings (rolldown, lightningcss) from `package-lock.json` when installing `@playwright/test`, even with `--package-lock-only`. That broke vitest. The committed lockfile is the original plus only the four Playwright entries, checked with a clean `npm ci`. Use `npm ci`, not `npm install`, and check the lockfile diff after adding any dependency.
