# MKCE 360

A frontend-only 3D campus digital twin of **M. Kumarasamy College of Engineering (MKCE)**, Thalavapalayam, Karur, Tamil Nadu, India.

Walk through the campus in first person from your phone, or orbit over it from above. No backend, no login, no API calls: everything is static files.

> **Status:** under construction (steps 1 to 5 of 9 done). Campus data was extracted from the college layout signboard and a satellite image and is **not yet verified on site**. Anything marked `verified: false` in `src/data/campus.json` is a first estimate. Use calibration mode (below) to correct positions.

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

Walking speed is about 1.4 m/s (run about 3.2 m/s) at an eye height of 1.6 m. The player collides with buildings and cannot leave the campus boundary. Settings (graphics quality, shadows, head bob, invert look) are in the **Settings** sheet. Graphics quality is **Auto** by default and drops a level if the frame rate stays under 30 fps. Shadows are off by default.

## Developer tools (query flags)

- `?debug=1`: draws the extracted footprints, paths, doors and gates over the satellite ground, shows live stats (fps, draw calls, triangles) and offers a **2D alignment map** that overlays everything on the satellite image and on the signboard photo.
- `?calibrate=1`: tap the ground to read `x / z`, tap a building to select it, then nudge, rotate, resize, set its centre or door, undo, and **Export** a corrected `campus.json` (also copied to the clipboard). Edits are applied live and kept in this browser's local storage; to make them permanent, replace `src/data/campus.json` with the exported file.

Both can be combined: `?debug=1&calibrate=1`.

## Tests

```bash
npm run build
npm run e2e       # 30 checks with real touch events: speed, joystick + look together, tap-to-walk,
                  # collisions, gyro (simulated), calibration, debug map. Needs Microsoft Edge or Chrome.
npm run perf      # frame rate at 390x844 (GPU WebGL, with and without a 4x CPU slowdown)
```

`npm run build` also runs `npm run validate`, which fails the build if `campus.json` is invalid (unknown types, broken path graph, doors not on the building outline, and so on).

## Project layout

| Path | Purpose |
| --- | --- |
| `assets/` | Source images: satellite map and signboard photos (inputs only). Reference photos of the real campus are kept local and are git-ignored |
| `docs/` | Blueprint extraction notes (`blueprint-extraction.md`), alignment check image |
| `public/` | Static files: satellite texture, signboard photo for the debug overlay, `CNAME`, favicon |
| `scripts/` | `validate-campus.mjs`, `e2e.mjs`, `perf-test.mjs` |
| `src/data/campus.json` | All campus content; code contains no campus facts |
| `src/world/` | Scene: textures, buildings, roads, scenery, sky and lighting |
| `src/modes/` | Overview orbit, first-person walk, collision, gyro |
| `src/ui/`, `src/core/`, `src/tools/` | HUD, app shell and quality manager, debug and calibration |
| `privacy-policy/` | Static privacy policy page (served at `/privacy-policy`) |

See [CLAUDE.md](CLAUDE.md) for the full constraints and conventions.

## Deployment (GitHub Pages, custom domain `mkce360.nraj.me`)

The build uses a relative base path, so `dist/` works on GitHub Pages, Netlify and inside an Android WebView. `public/CNAME` contains `mkce360.nraj.me` and `.github/workflows/deploy.yml` builds and deploys on every push to `main`.

One-time setup:

1. **GitHub:** repository *Settings → Pages → Build and deployment → Source: GitHub Actions*.
2. **DNS** (at the provider that manages `nraj.me`): add a `CNAME` record for host `mkce360` pointing to `<github-username>.github.io` (the account or organisation that owns this repository).
3. **GitHub:** *Settings → Pages → Custom domain* = `mkce360.nraj.me`, wait for the DNS check, then tick **Enforce HTTPS**.

The privacy policy is then available at `https://mkce360.nraj.me/privacy-policy`. Before publishing, replace the two highlighted placeholders (contact email, operator name) at the bottom of `privacy-policy/index.html`.
