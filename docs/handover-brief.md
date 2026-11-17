# **Makwana Kitchen Configurator V1 — Project & Testing Brief**

Nov 12, 2026 · @Koel Shankar

## **Summary**

The V1 demo is feature-complete and hardened for a live demo. The full sales flow runs end to end on a production build with no reloads and no console errors, including with 3D switched off.

The Makwana Kitchen Configurator is a demo tool for Makwana Modular Kulture showrooms. A salesperson (Rohan Desai in the sample data) works through three screens:

1. **Room Setup:** enter the customer's room wall by wall, with windows, doors, plumbing, a column, a beam and a duct box.  
2. **Design:** drag catalogue units and appliances onto wall elevations, pick finishes and hardware, and fix problems the rules flag. A live price and a 3D view update as they go.  
3. **Quote:** review line items, apply a discount, send for manager approval, then share a WhatsApp message and a PDF with the customer.

All data is sample data. There is no backend, login or database: the project is saved in the browser's localStorage. Day 10 added no features. It added demo controls (reset, performance mode), error handling, layout polish and a production check.

**What we want from testing:** confirm the demo cannot break in front of a customer. Run the main script in section 6 and the focused tests in section 7, at 1366×768 and 1440×900, against a production build.

## **What has been built**

Everything is committed on `main`. The demo build of 2026-11-17 is tagged `demo-2026-11-17` and includes the Feedback 1 and 2 changes (listed in `docs/HARDENING.md`, "feedback-1: every change, in one place"). Ask the owner which build you are testing.

| Area | What it does | Where to see it |
| ----- | ----- | ----- |
| Room setup | Any-shape room built wall by wall (length \+ heading), ceiling height, features: window, door, plumbing, column, beam, duct box. Templates, "Close room" hint, live plan drawn to scale. Design is locked until the room closes. | /setup |
| Design: placement | Drag units from the catalogue onto a wall elevation. Units snap to neighbours and walls; Alt disables snapping. Arrow keys nudge (Shift \= 100 mm), Delete removes, Esc deselects. Undo/redo with ⌘Z / ⇧⌘Z. | /design, middle panel |
| Design: rules | Each drop is checked before it commits. Blocked drops show a card with suggested fixes; warnings show a note. Checks include overlap, outside wall, covers window, blocks door, above ceiling, beam (short lofts), column, leftover gap, corners (a front hidden behind a neighbour, handles clashing where two fronts meet) and blind side, appliance fit, custom size, discount. | Blocked card; footer checks popover |
| Design: appliances | Sink and hob fit into a sink or hob unit, with countertop cut-outs. Oven and microwave fit into a tall unit. Chimney, dishwasher and fridge space are placed freely. Each can be marked as the customer's own. | Appliances tab |
| Design: finishes | Carcass, finish, shutter type and hardware per unit. New units inherit the last finish used in their group (base, wall and loft, tall). | Inspector (right panel) |
| Plan view | Top view with unit footprints and countertop cut-outs; click to select. | Plan tab |
| 3D (Level 1\) | Display only: rotate, zoom, click to select, presets 3D / Top / Facing wall, walls Auto (the walls in front hidden), cut at 450 or full height, "Show customer" full screen. | Design right-centre panel, Quote screen |
| Pricing | Live running total in Indian format (₹4,12,800), GST 18%, change since last edit. | Design footer |
| Quote | Units grouped Base / Wall / Loft / Tall with carcass and shutter cost tags, hardware, appliances and countertop, discount, totals, activity log. | /quote |
| Approval | Salesperson sends for approval; manager approves or sends back with a comment. A design change after approval returns the quote to draft as a new version. | Avatar menu to switch role |
| Sharing and PDF | WhatsApp message to copy; A4 print page with 3D picture, plan, elevations, line items, totals and sample terms. | Share dialog; Download PDF |
| Day 10: demo controls | Reset demo, performance mode (manual and automatic), quote numbers only assigned when the quote leaves the salesperson. | Avatar menu |
| Day 10: resilience | 3D failure fallback, screen-level error page with Reload, clipboard fallback, validation of the saved project, /spike hidden in production. | Section 7 |
| Day 10: polish | Layout fixes at 1366×768 and 1440×900, seconds in activity times, page title and "M" favicon. | Section 8 lists the fixes |

## **How it is built**

One store holds the project; every view, check and price is computed from it. That single rule explains most behaviour you will see while testing: if the plan, elevation, 3D view, checks and quote ever disagree, that is a bug.

\[embed: node/c3419336-4d9c\]

The right-hand column never keeps its own copy of the placements; the rule checks, pricing and quote are pure functions in `src/domain`.

**Stack:** Next.js 15 (App Router, Turbopack), TypeScript strict, Tailwind, shadcn/ui on Base UI, Zustand with Immer, dnd-kit for dragging, React Three Fiber \+ drei for 3D, Vitest for tests.

**Rules the code follows:**

* All dimensions are whole millimetres. Money is whole rupees.  
* Units are stored relative to a wall: wall, layer (base, wall, loft, tall) and offset along the wall. There are no free x/y positions.  
* `src/domain` is pure TypeScript with no React. Rules, pricing, geometry, quote workflow and validation live there, with Vitest tests.  
* Every rule returns a status (pass, warning, blocked, approval), a message and suggested fixes.  
* Plan and elevations are SVG drawn in millimetres. 3D is display only: no dragging in 3D.  
* Undo/redo covers design edits only. Quote paperwork (number, status, approvals, activity log) is never undone.  
* The project and settings are saved to localStorage on every change (key `makwana:project`). On load the save is validated; a bad save is replaced by the empty Mehta room with a warning toast.

**Key files:**

| Path | What lives there |
| ----- | ----- |
| `src/store/project-store.ts` | The store: project, view state, settings, undo history, every action, persistence |
| `src/domain/rules/` | The rule checks and their fixes |
| `src/domain/pricing/` | Prices, groups, GST |
| `src/domain/quote.ts` | Quote numbers, approval workflow, the quote model shared by screen and PDF |
| `src/domain/project-validation.ts` | Checks a restored save before use (Day 10\) |
| `src/domain/seed.ts` | Sample data: empty Mehta room, sample design, blank project |
| `src/components/setup/`, `design/`, `quote/` | The three screens |
| `src/components/three/` | 3D scene, camera, error boundary (`scene-boundary.tsx`) |
| `src/components/shell/` | Top bar, avatar demo menu, screen-level error page |
| `docs/mockups/` | The UI reference mockups |

## **Setup**

Test against a production build, not `npm run dev`. The dev server behaves differently: it is slower, shows extra React warnings and does not hide the /spike page.

1. Install Node.js 20 or later, then run `npm ci` in the project folder (not `npm install`, which can rewrite the lockfile; see `docs/HARDENING.md`, "Lockfile note").  
2. Run the checks. Each must finish clean before you test:  
   1. `npm test` (279 Vitest tests)  
   2. `npx tsc --noEmit` (type check)  
   3. `npm run lint`  
   4. `npm run build`  
   5. `npm run e2e` (builds, then runs the Playwright tests in Google Chrome at both sizes: 78 pass, 2 skip, the automatic performance mode)  
3. Start the server: `npm start` (port 3000), or `PORT=3100 npm start` if 3000 is taken.  
4. Open http\://localhost:3000 in Chrome. It redirects to /setup.  
5. Set the window to the size under test. In Chrome DevTools use the device toolbar with a responsive size of 1366×768, then 1440×900. The app needs at least 1280×740; below that it scrolls.  
6. Open the DevTools Console and keep it open. Any red error or yellow warning during a test is a finding.

**Browsers:** Chrome is the target. Safari and Firefox were not tested on Day 10\.

**Starting clean:** use "Reset demo" in the avatar menu. To wipe everything, including a broken save, run `localStorage.clear()` in the Console and reload.

## **Demo controls and sample data**

Everything a tester needs to set up a scenario is in the avatar menu (the round "RD" button, top right).

| Menu item | What it does |
| ----- | ----- |
| New project (empty) | A blank project with no walls, for building a room from scratch |
| Load Mehta room | The Mehta room with no units; goes to /setup |
| Load sample design | The Mehta room with a finished L kitchen (14 units, 5 appliances); goes to /setup. Does not use a quote number. |
| Reset demo… | After a confirm: empty Mehta room, role Salesperson (Rohan Desai), approval mode Always, quote sequence back to 0147, walls "Cut at 450", performance mode off, no undo history. Goes to /setup. |
| Switch to Manager / Salesperson | Changes who is acting. The manager is "Store Manager" and sees Approve and Send back on a pending quote. |
| Manager approval: Always / Only when flagged | Always: every quote needs approval before sharing. Only when flagged: a quote with nothing needing approval (e.g. discount 5% or less) can be shared straight away. |
| Performance mode (simpler 3D) | 3D at pixel ratio 1, without contact shadows or edge lines. Saved with the settings. |

**The Mehta room** (all lengths in mm): eight walls A to H. Wall A is 3200 with a window at 1300–2200 (sill 1050, top 2100\) and plumbing at 1750\. Wall B is 2400 with a beam whose underside is at 2400\. Walls D, E and F form a duct box notch. Wall H has an 800 door. A 300 × 300 column sits in the A/H corner. Ceiling 2850\.

**Quote numbers** look like MMK-AND-2026-0147. The number is assigned only when the quote is first sent for approval, shared, or downloaded as a PDF. Before that the Quote header reads "Draft quote · Version 1". Each assignment uses the next sequence number, so a full walkthrough after Reset uses exactly 0147\.

**Discount limit:** up to 5% is within the salesperson's limit; above 5% raises an approval item.

## **Main test script**

This is the demo as it will be given live. Run it from Reset to PDF without reloading the page; a reload anywhere is a finding. Run it three times: normally, with performance mode on, and with WebGL off (section 7). Take a screenshot at each stage.

Tips for dragging: units are dropped onto the **elevation** (the middle panel showing one wall). Use the search box to find a code quickly. A drop near a neighbour or a wall end snaps to it.

**Start**

* Avatar menu → Reset demo… → Reset demo. Expect: /setup, toast "Demo reset: empty Mehta room", eight walls, "Room closed · 8 walls" in the footer, "Rohan Desai" top right.

**Room Setup**

* Change wall B's length to 2462 and press Enter. Expect: the plan redraws; footer shows "Room open · 8 walls" and the open-by message; Start Designing is disabled with a tooltip.  
* Change wall B back to 2400\. Expect: "Room closed" and "Ready for design"; Start Designing is enabled.  
* Click Start Designing.

**Design: build an L kitchen**

* On Wall A, drag HU900 (hob unit) to just right of the column, then SU900 (sink unit) next to it, then BC1000 (blind corner) to the right end of wall A. Expect: each drop snaps; running total rises; a 100 mm gap between SU900 and BC1000 shows as a warning.  
* Click the Wall B tab. Drag a BD600 next to the corner. Expect: it starts at 560 mm (the corner unit takes the first 560 mm of wall B).

**Design: a corner clash and its corner filler**

* Expect: an amber note says "Handles clash where BC1000 and BD600 meet at the corner of Wall A and Wall B" (BD600's drawers start right at BC1000's door). It is a warning: BD600 stays.
* Click "Add corner filler" on the note. Expect: BC1000 moves 50 mm out of the corner and a 50 mm filler fills the corner behind it; the clash warning goes; the gap between SU900 and BC1000 is now 50 mm. The quote will list the filler as a "Filler panel" line on Wall A.
* Drag a second BD600 next to the first. Expect: it starts at 1160 mm.

**Design: trigger and fix a block**

* Back on Wall A, drag T600OM (tall oven and microwave unit) onto the window. Expect: nothing is placed; a red "Blocked" card says a tall unit cannot be placed over a window, with "+1 more blocking issue" and a fix "Move to Wall B, 1760–2360 mm".  
* Click that fix. Expect: the tall unit appears at the end of wall B; a 40 mm gap warning appears on wall B.

**Design: fix a gap with a filler**

* Click the warnings chip in the footer, open "50 mm gap between SU900 and BC1000 on Wall A", click "Add a 50 mm filler". Expect: a filler fills the gap; one warning left (the 40 mm on wall B). It doesn't block the quote.

**Design: appliances and finishes**

* Appliances tab. On Wall A drop the sink onto SU900, the hob onto HU900 and the chimney above the hob. On Wall B drop the oven and the microwave onto T600OM. Expect: while dragging, valid hosts glow green; cut-outs appear on the countertop in the elevation, plan and 3D; footer shows "5 appliances".  
* Click HU900 and pick a different finish swatch in the inspector. Expect: elevation, 3D and price change together; the footer shows the price change.

**Design: customer view**

* Click the presentation button in the 3D panel header ("Show customer"). Expect: full-screen 3D with the project name, the wall-height toggle (Auto, Cut at 450, Full height; Auto is on, so the walls in front are hidden), view presets and rotate/zoom only.  
* Click Exit (or press Esc). Expect: back to the Design screen, nothing changed.  
* Click Review Quote.

**Quote**

* Check the header. Expect: "Draft quote · Version 1", status Draft; no quote number yet. The 3D view is in Auto. The Base group lists two "Filler panel" lines on Wall A, 50 × 720 × 20 (the corner filler and the gap filler).  
* Set Discount to 8 and press Enter. Expect: "above 5% · needs approval" under the discount; totals recalculate.  
* Click Send for Approval. Expect: header becomes "Quote MMK-AND-2026-0147 · Version 1", status Pending manager approval.  
* Avatar menu → Switch to Manager (Store Manager). Expect: a blue "Waiting for your approval" banner; Approve and Send back buttons.  
* Click Approve, then switch back to Salesperson. Expect: status Approved; left column reads "Approved by Store Manager".  
* Click Share with Customer, then Copy WhatsApp message. Expect: toast "WhatsApp message copied"; pasting elsewhere gives the message with the quote number and total.  
* Click Download PDF. Expect: the A4 print page opens and the browser print dialog appears. The PDF shows 0147, Approved, the 3D picture, plan, elevations, line items and totals.  
* Click "Back to the quote" and open Activity. Expect: entries with times to the second (e.g. 11:50:02): discount change, quote created, sent, approved, shared twice.

## **Focused tests**

Each test below targets one Day 10 change. Most need a small trick in Chrome to simulate a failure; the trick is given with the test.

| Test | How to run it | Expected result |
| ----- | ----- | ----- |
| Quote number not used by loading | Reset demo, Load sample design, open Quote, go back, Load sample design again, open Quote | Header stays "Draft quote · Version 1". Then Send for Approval gives 0147, not 0148 |
| Download assigns a number | Fresh Reset, Load sample design, Quote, Download PDF | The PDF and the Quote header both show 0147 |
| Share in "Only when flagged" mode | Menu → Only when flagged; sample design, discount 0; Quote → Share with Customer | Share is enabled before approval; opening it assigns the number |
| WebGL off | Quit Chrome fully, then start it from Terminal: `open -na "Google Chrome" --args --disable-webgl --disable-3d-apis --user-data-dir=/tmp/mk-test` | Every 3D panel shows "3D view isn't available on this device". Room Setup, Design (2D), Quote and PDF all work; the PDF says 3D isn't available in place of the picture |
| Clipboard unavailable | With the Share dialog open, in the DevTools Console run `Object.defineProperty(Navigator.prototype, "clipboard", {get: () => undefined})` before clicking Copy | The message box is highlighted and fully selected with "Press ⌘C / Ctrl+C to copy". Pressing ⌘C copies it and logs the share |
| Corrupted save | On /setup run `localStorage.setItem("makwana:project", "{{{ not json")`, then reload. Repeat with `localStorage.setItem("makwana:project", JSON.stringify({version: 2, state: {project: {id: 1}}}))` | Never a blank or stuck screen. The empty Mehta room loads with a toast "The saved project couldn't be opened" |
| /spike hidden | Visit /spike on the production server | 404 page |
| Performance mode (manual) | Menu → Performance mode, then look at the 3D panel | Thin outline edges and soft floor shadows disappear; the setting survives a reload |
| Performance mode (automatic) | Only on a slow machine: on Design, keep orbiting the 3D view with the mouse for 3 seconds. To force it on a fast Mac, DevTools → Performance panel → CPU 20× slowdown may or may not be enough | If frames stay slower than 33 ms for 2 s while orbiting, performance mode switches on with the toast "Switched to performance mode for smoother 3D". It happens at most once until Reset demo |
| Edit after approval | Finish the main script to Approved, go back to Design, change any finish | Toast "Quote returned to draft — approval needed again (Version 2)"; Quote shows Version 2, Draft |
| Undo | In Design press ⌘Z / ⇧⌘Z a few times | Design edits undo and redo; quote status, number and activity are not undone |
| Page title and icon | Look at the browser tab | "Makwana Kitchen Configurator" with a dark square "M" icon |
| Screen error page | Load sample design. On /setup, in the Console run: window.ResizeObserver \= class { constructor() { throw new Error("test") } } — then click Design in the stepper (no reload) | A full-screen "Something went wrong on this screen" page with a Reload button. Reload brings back the Design screen with the project intact |

**Layout sweep.** Repeat the main script once at 1366×768 and once at 1440×900. Look for text cut off or ending in "…" where it shouldn't, labels on top of each other, numbers not lined up in their column, and empty panels with no message. Pay most attention to: the Design wall tabs, the Room Setup footer when the room is open, the Quote unit table, group cost tags, and the Activity log.

## **Known limitations and things to watch for**

None of these block the demo, but each could surprise a presenter. Report anything beyond this list.

**Out of scope for V1 (not bugs):** placement along niches, columns or duct boxes; textures in 3D; dragging in 3D; catalogue editing; any backend, login or sync between devices; Safari and Firefox support.

**Watch closely:**

* **One browser, one project.** The save lives in that browser's localStorage. A different browser, profile or private window starts fresh. A second tab on the same project is blocked with a notice; close the first tab and reload the second to switch.  
* **"Show customer" full screen** was only partly tested by automation. Check that it enters full screen and that Esc and Exit both leave it.  
* **Print dialog.** The print page was verified; the native print dialog and the saved PDF were not. Check page breaks and that the 3D picture appears in the saved file.  
* **Automatic performance mode** fires once per demo. If it fires when it shouldn't, turn it off in the menu; it won't fire again until Reset demo.  
* **Screen error page loop.** If a save passes validation but still crashes a screen, Reload brings the crash back. The way out is `localStorage.clear()` in the Console, since the avatar menu is not on the error page.  
* **Simulated WebGL failures log errors.** When the 3D renderer throws, three.js and React log console errors. That is expected only in that test.  
* **40 mm warning on wall B** after the tall-unit fix in the main script. It is a warning, not a block; add a filler there for a clean "All checks passed".  
* **Toasts** sit over the bottom-centre of the screen for about 4 seconds and can cover content briefly.  
* **Dates and times** use the computer's clock and time zone.

**Fixed on Day 10 (check they stay fixed):**

* Quote table: descriptions ran into the size column, cost tags touched the amount, filler rows were indented.  
* Group cost tags were hidden below 1400 px wide; they now sit on a second line.  
* Design wall tabs were cut off ("Wal…") at 1366\.  
* Room Setup footer cut off all three status texts when the room was open.  
* After approval the Quote screen still said "Needs manager approval".  
* Activity details were squeezed to three lines at 1366; an empty Activity log showed nothing.  
* Quote small plan showed overlapping cut-out and ceiling labels.  
* A "THREE.Clock" deprecation warning appeared on every 3D view.  
* A save that wasn't valid JSON left the loading screen on forever.

## **Reference results and reporting**

On Day 10 every automated check passed on the production build. Use these numbers as a baseline; a big difference on your machine is worth reporting.

| Check | Day 10 result |
| ----- | ----- |
| Unit tests, type check, lint, build | All clean (150 tests) |
| Main script, normal / performance mode / WebGL off | Passed all three; no reload; no console errors or warnings; one quote number used (0147) |
| /design JavaScript, first load per `next build` | 329 kB |
| /design JavaScript actually transferred, including 3D | 664 kB compressed, 23 files |
| Load to the 3D panel's first frame at 1366×768 | 567 ms median of 5 cold loads (561–573 ms), Apple M4, local server |
| Auto performance mode | Switched on with \~77 ms frames after 2 s of orbiting; stayed off on a fast GPU and with slow, jerky mouse movement |

The automated runs used Chrome driven by Playwright with the real GPU. They cannot judge looks; a person still needs to watch the screens.

**When you find something, report:**

1. The step in section 6 or the test in section 7\.  
2. Window size, browser and version, and whether performance mode was on.  
3. What you expected and what happened.  
4. A screenshot, and any red or yellow lines from the DevTools Console.  
5. Whether it happens again after Reset demo.

