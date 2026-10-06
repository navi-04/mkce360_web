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

- `assets/campus-map.png`: satellite image. Visual reference and cross-check only.
- `assets/layout/*.jpeg`: photos of the printed "COLLEGE LAYOUT" signboard. **Primary** source for what exists on campus and how it relates spatially. It is an oblique perspective illustration, not a top-down plan, so it has no uniform scale. See `docs/blueprint-extraction.md` for what was read from it and how confident each reading is.

## Conventions

- Units: metres. Axes: +x east-ish (to be fixed in calibration), +z toward the viewer, +y up. Origin at the main gate.
- Locale-specific text (labels) is copied exactly as printed on the blueprint.
- localStorage is only for per-user conveniences (welcome-screen details). Every access is wrapped in try/catch.
- Mobile first: 360-430 px portrait, touch targets at least 48 px, pixel ratio capped at 2, low-poly assets, instanced meshes for repeated scenery, shadows off by default.

## Folder structure

```
assets/                 Input images (satellite map, signboard photos). Not served by the app.
docs/                   blueprint-extraction.md, android-webview.md, ...
public/                 Static files copied as-is into the build (textures used at runtime)
scripts/                Node scripts (campus.json validator)
src/
  data/campus.json      The only place campus facts live
  main.js               Entry point
  style.css
  (world/, modes/, ui/, nav/, interiors/ added in later steps)
index.html
vite.config.js          base './' (relative) for GitHub Pages / Netlify / WebView
```

## Commands

```
npm install        install dependencies
npm run dev        dev server (reachable on LAN for phone testing), http://localhost:5173
npm run build      production build into dist/
npm run preview    serve the production build locally
```

Debug query flags (added in Step 4): `?debug=1` (alignment overlay), `?calibrate=1` (position calibration and export).

## Steps (see the project brief)

1. Setup  2. Blueprint analysis (STOP)  3. Data schema  4. Campus world  5. Walk mode (STOP)
6. Search, navigation, guided walk  7. Interiors (sample data, one building)  8. Mobile UX  9. Deployment and Android

Current progress is tracked in git history; one commit per step.
