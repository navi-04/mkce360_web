# MKCE 360

Frontend-only 3D campus digital twin of **M. Kumarasamy College of Engineering (MKCE), Thalavapalayam, Karur, Tamil Nadu, India**.
Core experience: a mobile-first, first-person walkthrough of the campus. It must run well in a mobile browser and inside an Android WebView. Desktop must also work.

App name shown everywhere in the UI: **MKCE 360**.

## Hard constraints

- Static frontend only: no backend, no database, no login, no API calls.
- Stack: Vite + vanilla JavaScript + Three.js. No heavy UI framework (no React/Vue/etc.).
- All campus content lives in `src/data/campus.json`. Code never contains campus facts.
- Never invent real campus details (building names, room names, faculty, timetables, floor counts). Use clearly labelled placeholders and flag unverified values (for example `"floors": 1` with `"floorsVerified": false`).
- If something is unclear, ask the user before assuming. Do not guess scale, door sides, or building identities.
- Work step by step. After each step: run the build, fix errors, summarise, commit. Respect the STOP points; do not continue past one until the user replies.
- Test at a 390x844 mobile viewport and report the frame rate.

## Source material (inputs, read-only)

- `assets/campus-map.png`: satellite image (north up, 0.792 m per pixel). `assets/satellite/*.png` (git-ignored): zoomed satellite crops and Street View frames of the gate. `scripts/satellite-mosaic.py` registers the crops to the base image and writes the overview ground texture `public/textures/campus-map.jpg`. Visual reference and cross-check for building footprints.
- `assets/layout/*.jpeg`: photos of the printed "COLLEGE LAYOUT" signboard (1-5 the board, 6-7 the legend). **Primary** source for what exists on campus and how it relates spatially. It is an oblique perspective illustration, not a top-down plan, so it has no uniform scale. The board is viewed from the gate looking West (board front = East, left = South). See `docs/blueprint-extraction.md` for what was read from it and how confident each reading is.

## Conventions

- Units: metres. Origin at the main gate. Axes: **+x = East, +z = South, +y = up** (so a top-down view has north at the top). The main gate faces East onto NH-44 and the campus extends toward negative x. Satellite pixel (px, py) in `assets/campus-map.png` converts to `x = (px - 497) * 0.792`, `z = (py - 128) * 0.792` (scale from building 1 = 113 x 92 m; gate pixel is a candidate until the user confirms it).
- Locale-specific text (labels) is copied exactly as printed on the blueprint.
- localStorage is only for per-user conveniences (welcome-screen details). Every access is wrapped in try/catch.
- Mobile first: 360-430 px portrait, touch targets at least 48 px, pixel ratio capped at 2, low-poly assets, instanced meshes for repeated scenery, shadows off by default.

## Folder structure

```
assets/                 Input images (satellite map, signboard photos). Not served by the app.
                        Reference photos of the real campus live here too but are git-ignored (they show people).
docs/                   blueprint-extraction.md, interiors.md, satellite-candidates.png, android-webview.md (step 9)
public/                 Static files copied as-is: textures/campus-map.jpg (mosaic), debug/signboard.jpg, CNAME, favicon
scripts/                validate-campus.mjs (build gate), e2e.mjs, perf-test.mjs, satellite-mosaic.py (dev tool, needs Python + OpenCV)
privacy-policy/         Static page served at /privacy-policy
src/
  data/campus.json     The only place campus facts live
  data/graph.js        Path-graph helpers (Dijkstra, door linking)
  data/footprint.js    Footprint geometry shared by picking, routing checks and the validator
  config.js            Tunables: player speeds, quality presets, type colours (no campus facts)
  core/app.js          App shell: renderer, auto quality fallback, mode switching
  world/               textures (canvas-generated), geo helpers, buildings, roads, scenery, world assembler
  modes/               overview (orbit), walk (first person), collision, gyro
  ui/                  hud, joystick, sheets (one bottom sheet), nav-ui (search, cards, directions, nav card, arrival)
  nav/                 search (index + scoring), route (plan, turns, hints), routeLayer (3D line + beacon), navigator (state machine, guided walk)
  tools/               debug (?debug=1), calibrate (?calibrate=1), overrides (calibration storage)
  interiors/           plan (floor plan to walls, doors, furniture; pure), interiors (meshes, enter/exit, floors, stairs, lift)
index.html, vite.config.js   base './' (relative) for GitHub Pages / Netlify / WebView; two HTML entries
```

## Commands

```
npm install        install dependencies
npm run dev        dev server (reachable on LAN for phone testing), http://localhost:5173
npm run build      validate campus.json, then production build into dist/
npm run validate   campus.json validation only
npm run preview    serve the production build locally
npm run test:nav   search and routing unit checks on the real campus.json (no browser)
npm run test:interiors   floor plan checks (walls, doors, walkability, timetable) on the real campus.json
npm run e2e        end-to-end checks with real touch events (needs Edge/Chrome; run build first)
npm run perf       frame-rate measurement at 390x844
```

Debug query flags: `?debug=1` (alignment overlay, stats, 2D map), `?calibrate=1` (position calibration and export).
Test hook: `window.__mkce` (`setMode`, `stats`, `input`, `nav`, `app`), used by the scripts.

Interiors (step 7): `buildings[].floorPlans` in campus.json (format in docs/interiors.md). Only block 1 has them and it is SAMPLE data (flagged `sample: true`, shown as such on the room card). Entering hides the outdoor scene (`world.setInterior`), swaps the walk collider and fades; no new shader programs (the interior materials are precompiled at start-up).

Navigation (step 6): `Navigator` states are none, preview, guided, paused, manual, arrived. The guided walk drives `WalkMode` through its `driver` hook; joystick, keys or a tap hand control back. Routes only run on `campus.paths` edges and the validator warns when an edge crosses a building. Guidance never invents campus facts: turn hints use building names from campus.json.

## Performance rules (keep when adding features)

- Merge static geometry (few draw calls); use instanced meshes for repeated scenery.
- All shaders are precompiled for both modes at start-up (`compileAsync`), so nothing hitches the first time it appears. New material types must be reachable from `world.scene` at start-up.
- Pixel ratio is capped at 2 and drops with the quality level; the app lowers quality automatically below 30 fps.

## Steps (see the project brief)

1. Setup  2. Blueprint analysis (STOP)  3. Data schema  4. Campus world  5. Walk mode (STOP)
6. Search, navigation, guided walk  7. Interiors (sample data, one building)  8. Mobile UX  9. Deployment and Android

Current progress is tracked in git history; one commit per step.
