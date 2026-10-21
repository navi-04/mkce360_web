import './style.css';
import './nav.css';
import './ux.css';
import rawData from './data/campus.json';
import { App } from './core/app.js';
import { showWelcome } from './ui/welcome.js';

const params = new URLSearchParams(location.search);
const loader = document.getElementById('loader');
const fill = document.getElementById('loader-fill');
const msg = document.getElementById('loader-msg');

function progress(f, text) {
  fill.style.width = `${Math.round(f * 100)}%`;
  if (text) msg.textContent = text;
}

function fail(text, detail) {
  loader.classList.add('error');
  msg.textContent = text;
  if (detail) console.error(detail);
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

// the app container never scrolls (focusing a field inside a sliding sheet could otherwise scroll it away)
for (const id of ['app', 'hud']) {
  const n = document.getElementById(id);
  n?.addEventListener('scroll', () => {
    n.scrollTop = 0;
    n.scrollLeft = 0;
  });
}

// block page-level gestures on touch devices (pinch/double-tap zoom, pull-to-refresh)
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

async function boot() {
  if (!webglAvailable()) {
    fail('Your browser does not support WebGL, which MKCE 360 needs. Try a recent Chrome, Edge, Firefox or Safari.');
    return;
  }
  let data = structuredClone(rawData);
  const debug = params.get('debug') === '1';
  const calibrate = params.get('calibrate') === '1';

  if (calibrate) {
    const { applyOverrides } = await import('./tools/overrides.js');
    data = applyOverrides(data);
  }

  const app = new App({ canvas: document.getElementById('scene'), data, params });
  try {
    await app.start(progress);
  } catch (e) {
    fail('Something went wrong while building the campus. Please reload the page.', e);
    return;
  }

  if (debug) (await import('./tools/debug.js')).initDebug(app);
  if (calibrate) (await import('./tools/calibrate.js')).initCalibrate(app, rawData);

  // test / automation hook (see scripts/perf-test.mjs)
  window.__mkce = {
    app,
    nav: app.nav,
    interiors: app.interiors,
    ready: Promise.resolve(true),
    setMode: (m) => app.setMode(m, { instant: true }),
    stats: () => app.stats(),
    drive: app.drive,
    input: (v) => {
      if (app.mode === 'drive') app.drive.sim = v; // { throttle, brake, steer, handbrake }
      else app.walk.sim = v; // { forward, strafe, turn }
    },
  };

  loader.classList.add('done');
  setTimeout(() => loader.remove(), 500);
  // first visit: the welcome screen (skipped for tests and tools with ?welcome=0)
  if (params.get('welcome') !== '0') showWelcome(app);
}

boot();
