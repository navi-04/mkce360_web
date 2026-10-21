# MKCE 360

A frontend-only 3D campus digital twin of **M. Kumarasamy College of Engineering (MKCE)**, Thalavapalayam, Karur, Tamil Nadu, India.

Walk through the campus in first person from your phone, or orbit over it from above. No backend, no login, no API calls: everything is static files.

> **Map content:** only the structures marked in `docs/satellite-candidates.png` are placed on the map (15 buildings). The other places on the college layout board are listed under `unplaced` in `src/data/campus.json` and appear in search as "Not mapped yet" until their location is confirmed.

> **Status:** under construction (all 9 steps done; the campus data is still being verified, see below). Campus data was extracted from the college layout signboard and a satellite image and is **not yet verified on site**. Anything marked `verified: false` in `src/data/campus.json` is a first estimate. Use calibration mode (below) to correct positions.

## Stack

- [Vite](https://vite.dev/) + vanilla JavaScript
- [Three.js](https://threejs.org/)

## Getting started

```bash
npm install
npm run dev       # http://localhost:5173 (also reachable from your phone on the same Wi-Fi)
npm run build     # validates src/data/campus.json, then builds into dist/
npm run preview   # serve dist/ locally
```

Requires Node 20.19+ (or 22.12+).

## Using the app

| | Phone | Desktop |
| --- | --- | --- |
| **Overview** | one finger rotates, two fingers pinch to zoom and pan, **Reset** returns to the start view; tap the ground, then **Walk here** | left drag rotates, wheel zooms, right drag pans |
| **Walk: move** | left thumb (floating joystick) | `W A S D` or arrow keys |
| **Walk: look** | drag on the right half, or **Gyro** (turn the phone) | drag the mouse, or `←` `→` |
| **Walk: run** | **Run** button | hold `Shift` or use the **Run** button |
| **Walk: go to a spot** | tap the ground | click the ground |

**Search and directions:** the gold **Search** button (bottom right) opens a bottom sheet with a search field and category chips. Tapping a result (or a building in Overview) opens its card with **Directions**. Directions plan the shortest walk over the campus paths from your position or from a gate (distance, walking time, turn-by-turn steps), draw a glowing line on the ground and a beacon at the door. **Start guided walk** moves the camera along the route; **Pause**, **Resume** or **Take control** at any time (moving the joystick, using the keys or tapping the ground also takes control). **Walk it myself** shows the line and live hints ("Go straight for 60 m, then turn left") while you walk. On arrival a card appears at the door.

**Interiors (look from photos, layout is sample):** block 1 can be entered: walk up to its door and tap **Enter**, or use **Go inside** on its building card, the arrival card, or **Go to room** on a room found in Search. Inside you walk the verandahs round the tree courtyard, the entrance hall, the corridors and the classrooms, with the look of the photos supplied for the block. On the ground floor you can step down from the roofed walkway onto the lawn and walk the paver paths between the trees; the lawn, pavers and bark are cut out of your photos (`scripts/make-interior-photo-textures.py`). A floor selector (G, 1, 2, 3), the corner stairs and the lift change floors, and tapping a door or a room sign opens a room card with type, capacity, department, faculty, equipment and a live **Now in session** status from the timetable. **Exit** puts you back outside at the door. Which room is where, and every room name, number and timetable, is **sample data** until the college provides real plans; see [docs/interiors.md](docs/interiors.md).

**Welcome, mini-map and updates:** the first visit shows a welcome screen (email, college, location, all optional; only this college is available and any other shows "Not available yet"). The details stay in this browser only and can be edited or cleared in Settings. In Walk mode a mini-map shows your position and heading; tap it for the full campus map (drag to move, tap a numbered building for its card). Tap the **MKCE 360** pill for About and the college updates (read from `campus.json`). Every control is at least 48 px, landscape is supported, and `prefers-reduced-motion` turns animations off.

Walking speed is about 1.4 m/s (run about 3.2 m/s) at an eye height of 1.6 m. The player collides with buildings and cannot leave the campus boundary. Settings (graphics quality, shadows, head bob, invert look) are in the **Settings** sheet. Graphics quality is **Auto** by default and drops a level if the frame rate stays under 30 fps. Shadows are off by default.

## Developer tools (query flags)

- `?debug=1`: draws the extracted footprints, paths, doors and gates over the satellite ground, shows live stats (fps, draw calls, triangles) and offers a **2D alignment map** that overlays everything on the satellite image and on the signboard photo.
- `?welcome=0`: skips the welcome screen (used by the test scripts).
- `?calibrate=1`: tap the ground to read `x / z`, tap a building to select it, then nudge, rotate, resize, set its centre or door, undo, and **Export** a corrected `campus.json` (also copied to the clipboard). Edits are applied live and kept in this browser's local storage; to make them permanent, replace `src/data/campus.json` with the exported file.

Both can be combined: `?debug=1&calibrate=1`.

## Tests

```bash
npm run build
npm run test:nav  # search and routing on the real campus.json, no browser (28 checks)
npm run test:interiors  # floor plans: walls, doors, walkability of the whole ring, courtyard, timetable (72 checks)
npm run e2e       # 118 checks with real touch events: speed, joystick + look together, tap-to-walk,
                  # collisions, gyro (simulated), search, directions, guided walk, calibration, debug map.
                  # Needs Microsoft Edge or Chrome.
npm run perf      # frame rate at 390x844 (GPU WebGL, with and without a 4x CPU slowdown)
```

`npm run build` also runs `npm run validate`, which fails the build if `campus.json` is invalid (unknown types, broken path graph, doors not on the building outline, and so on).

## Project layout

| Path | Purpose |
| --- | --- |
| `assets/` | Source images: satellite map and signboard photos (inputs only). Reference photos of the real campus are kept local and are git-ignored |
| `docs/` | Blueprint extraction notes (`blueprint-extraction.md`), alignment check image |
| `public/` | Static files: satellite texture, signboard photo for the debug overlay, `CNAME`, favicon |
| `scripts/` | `validate-campus.mjs`, `e2e.mjs`, `perf-test.mjs`, `satellite-mosaic.py` (optional dev tool that rebuilds the overview ground texture from the satellite crops; needs Python and OpenCV) |
| `src/data/campus.json` | All campus content; code contains no campus facts |
| `src/world/` | Scene: textures, buildings, roads, scenery, sky and lighting |
| `src/modes/` | Overview orbit, first-person walk, collision, gyro |
| `src/nav/` | Search, route planning, route line, guided walk |
| `src/interiors/` | Floor plans to walls, rooms, furniture, stairs and the courtyard garden; enter/exit, floors |
| `src/ui/`, `src/core/`, `src/tools/` | HUD and sheets, app shell and quality manager, debug and calibration |
| `privacy-policy/` | Static privacy policy page (served at `/privacy-policy`) |

See [CLAUDE.md](CLAUDE.md) for the full constraints and conventions.

## Deployment (GitHub Pages, custom domain `mkce360.nraj.me`)

The build uses a relative base path, so `dist/` works on GitHub Pages, Netlify and inside an Android WebView. `public/CNAME` contains `mkce360.nraj.me` and `.github/workflows/deploy.yml` builds and deploys on every push to `main`.

One-time setup:

1. **GitHub:** repository *Settings → Pages → Build and deployment → Source: GitHub Actions*.
2. **DNS** (at the provider that manages `nraj.me`): add a `CNAME` record for host `mkce360` pointing to `<github-username>.github.io` (the account or organisation that owns this repository).
3. **GitHub:** *Settings → Pages → Custom domain* = `mkce360.nraj.me`, wait for the DNS check, then tick **Enforce HTTPS**.

The privacy policy is then available at `https://mkce360.nraj.me/privacy-policy`. `public/404.html` is the page GitHub Pages
shows for unknown addresses.

### Netlify (alternative host)

`netlify.toml` is included: build command `npm run build`, publish folder `dist`, Node 22, long-lived caching for the hashed files and
security headers (a strict Content-Security-Policy, Permissions-Policy that allows device motion for the page itself, no referrer).
Connect the repository in Netlify and deploy; no other settings are needed. The whole test suite also passes when the build is
served with these headers. GitHub Pages cannot set response headers, so the policy only applies on Netlify.

### Android

See [docs/android-webview.md](docs/android-webview.md): the WebView settings the app needs (JavaScript, DOM storage, hardware
acceleration, fullscreen, orientation, sensors), a Kotlin sample for loading the live site or the bundled files, and a test checklist.
The page hides its own Fullscreen button when it detects a WebView (`; wv)` in the user agent, or `?embedded=1`). Before publishing, replace the two highlighted placeholders (contact email, operator name) at the bottom of `privacy-policy/index.html`.
