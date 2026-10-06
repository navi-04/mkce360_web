# MKCE 360

A frontend-only 3D campus digital twin of **M. Kumarasamy College of Engineering (MKCE)**, Thalavapalayam, Karur, Tamil Nadu, India.

Walk through the campus in first person from your phone, or orbit over it from above. No backend, no login, no API calls: everything is static files.

> **Status:** under construction. Campus data is being extracted from the college layout signboard and is **not yet verified**. Anything marked `unverified` in `src/data/campus.json` is a placeholder.

## Stack

- [Vite](https://vite.dev/) + vanilla JavaScript
- [Three.js](https://threejs.org/)

## Getting started

```bash
npm install
npm run dev       # http://localhost:5173 (also reachable from your phone on the same Wi-Fi)
npm run build     # production build in dist/
npm run preview   # serve dist/ locally
```

Requires Node 20.19+ (or 22.12+).

## Project layout

| Path | Purpose |
| --- | --- |
| `assets/` | Source images: satellite map and signboard photos (inputs only) |
| `docs/` | Blueprint extraction notes, Android WebView guide |
| `scripts/` | Data validation |
| `src/data/campus.json` | All campus content; code contains no campus facts |
| `src/` | App code |

See [CLAUDE.md](CLAUDE.md) for the full constraints and conventions.

## Deployment

Static hosting only. The build uses a relative base path, so `dist/` works on Netlify, GitHub Pages and inside an Android WebView. Details are added in the deployment step.
