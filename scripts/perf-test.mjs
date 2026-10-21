#!/usr/bin/env node
/**
 * MKCE 360 - DEV-ONLY performance + screenshot harness.
 *
 * Drives the locally installed Microsoft Edge (or Chrome) with playwright-core
 * (no browsers are downloaded), emulates a phone (390x844, DPR 3, touch, mobile
 * UA), measures frame rate in-page with requestAnimationFrame timestamps, takes
 * one screenshot per scenario and writes a markdown table + results.json.
 *
 * Usage (expects `npm run build` to have produced dist/ unless --url is used):
 *   npm run perf
 *   npm run perf -- --seconds 8 --scenarios overview,walk-move
 *   npm run perf -- --url http://localhost:5173 --query "debug=1"
 *   node scripts/perf-test.mjs --help
 *
 * App test API (optional, feature-detected; window.__mkce):
 *   ready: Promise                         resolves when the world is built
 *   setMode('overview' | 'walk')
 *   stats() -> { fps, frameMs, drawCalls, triangles, quality, mode, pixelRatio }
 *   input({ forward, strafe, turn } | null)  simulated held movement (null = release)
 * Without it the script only measures the raw rAF rate (and says so).
 *
 * Exit code: 0 ok, 1 harness failure, 2 ran fine but the page logged errors.
 */
import { chromium } from 'playwright-core';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const VIEWPORT = { width: 390, height: 844 };
const DEVICE_SCALE_FACTOR = 3;
const CPU_RATES = [1, 4]; // 4x slowdown only approximates a mid-range phone CPU

/** Scenario name -> app mode + optional continuous action while measuring. */
const SCENARIOS = {
  overview: { mode: 'overview', action: null },
  'overview-orbit': { mode: 'overview', action: 'orbit' },
  'walk-idle': { mode: 'walk', action: null },
  'walk-move': { mode: 'walk', action: 'move' },
  // step 6: the glowing route line is drawn, and in walk-guided the app also drives the camera along it
  'overview-route': { mode: 'overview', action: 'route' },
  'walk-guided': { mode: 'walk', action: 'guide' },
  // step 7: inside the sample interior of block 1, walking along the verandah beside the courtyard
  'interior-move': { mode: 'walk', action: 'interior' },
  // the car: from the gate along the road with the gas held down (a third of full)
  'drive-move': { mode: 'drive', action: 'drive' },
  // the car in the hall of block 1, then driven slowly through the entrance, hall, verandah and into the courtyard
  'drive-inside': { mode: 'drive', action: 'drive-inside' },
};

/** GPU-related launch args tried first (headless). */
const GPU_ARGS = [
  '--use-angle=d3d11',
  '--enable-gpu-rasterization',
  '--ignore-gpu-blocklist',
  '--enable-webgl',
];

const SOFTWARE_RE = /swiftshader|software|basic render|llvmpipe|softpipe/i;
const isSoftware = (renderer) => !renderer || SOFTWARE_RE.test(renderer);

const HELP = `MKCE 360 perf harness (dev only)

  node scripts/perf-test.mjs [options]        (or: npm run perf -- [options])

  --url <url>          Test an already-running URL (skip serving dist/)
  --port <n>           Port for the built-in "vite preview" server (default 4173)
  --query <q>          Query string appended to the URL, e.g. "debug=1"
  --out <dir>          Output dir for PNGs + results.json (default tmp/perf)
  --seconds <n>        Measuring time per scenario run (default 5)
  --warmup <n>         Seconds to run the scenario before measuring (default 2)
  --scenarios <list>   Comma list of: ${Object.keys(SCENARIOS).join(', ')} (default all)
  --drag <touch|mouse> Input used for overview-orbit (default touch, via CDP)
  --browser <path>     Explicit msedge.exe / chrome.exe path
  --headed             Run a visible browser window from the start
  --shot-scale <s>     Screenshot scale: css (390x844, default) or device (1170x2532)
  --help               This text
`;

function parseArgs(argv) {
  const o = {
    url: null, port: 4173, query: '', out: path.join(ROOT, 'tmp', 'perf'),
    seconds: 5, warmup: 2, scenarios: Object.keys(SCENARIOS), drag: 'touch',
    browser: null, headed: false, shotScale: 'css', help: false,
  };
  const flags = new Set(['headed', 'help']);
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    if (!a.startsWith('--')) throw new Error(`Unexpected argument: ${a}`);
    let key = a.slice(2), val;
    const eq = key.indexOf('=');
    if (eq >= 0) { val = key.slice(eq + 1); key = key.slice(0, eq); }
    const camel = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (!(camel in o)) throw new Error(`Unknown option: --${key}`);
    if (flags.has(camel)) { o[camel] = true; continue; }
    if (val === undefined) {
      val = argv[++i];
      if (val === undefined) throw new Error(`Option --${key} needs a value`);
    }
    switch (camel) {
      case 'port': case 'seconds': case 'warmup': {
        const n = Number(val);
        if (!Number.isFinite(n) || n < 0) throw new Error(`--${key} must be a non-negative number`);
        o[camel] = n; break;
      }
      case 'out': o.out = path.resolve(process.cwd(), val); break;
      case 'scenarios': o.scenarios = val.split(',').map((s) => s.trim()).filter(Boolean); break;
      default: o[camel] = val;
    }
  }
  const bad = o.scenarios.filter((s) => !SCENARIOS[s]);
  if (bad.length) throw new Error(`Unknown scenario(s): ${bad.join(', ')} (valid: ${Object.keys(SCENARIOS).join(', ')})`);
  if (!['touch', 'mouse'].includes(o.drag)) throw new Error('--drag must be touch or mouse');
  if (!['css', 'device'].includes(o.shotScale)) throw new Error('--shot-scale must be css or device');
  if (o.seconds <= 0) throw new Error('--seconds must be > 0');
  return o;
}

// ---------------------------------------------------------------------------
// Process cleanup (server tree + browser), also on errors and Ctrl-C
// ---------------------------------------------------------------------------

let serverProc = null;
let activeBrowsers = new Set();

/** Kill a child and everything it spawned. Synchronous so it works in 'exit'. */
function killTree(proc) {
  if (!proc || proc.pid == null || proc.killed) return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } else {
      process.kill(-proc.pid, 'SIGKILL'); // detached => own process group
    }
  } catch { /* already gone */ }
  proc.killed = true;
}

async function closeBrowsers() {
  const list = [...activeBrowsers];
  activeBrowsers.clear();
  await Promise.all(list.map((b) =>
    Promise.race([b.close().catch(() => {}), sleep(5000)])));
}

let shuttingDown = false;
process.on('exit', () => killTree(serverProc));
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, async () => {
    if (shuttingDown) return;
    shuttingDown = true; // main() stops starting new runs; this handler owns the exit
    console.error(`\n${sig} received, cleaning up...`);
    await closeBrowsers();
    killTree(serverProc);
    process.exit(130);
  });
}

// ---------------------------------------------------------------------------
// Static server: `vite preview` on dist/
// ---------------------------------------------------------------------------

function httpGetOk(url, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

/** Path of vite's CLI entry so we can run it with plain `node` (no cmd/npx shell tree). */
function resolveViteBin() {
  try {
    const require = createRequire(path.join(ROOT, 'package.json'));
    const pkgPath = require.resolve('vite/package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const rel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.vite;
    const bin = rel && path.join(path.dirname(pkgPath), rel);
    if (bin && existsSync(bin)) return bin;
  } catch { /* fall through */ }
  return null;
}

async function startServer(port) {
  if (!existsSync(path.join(ROOT, 'dist', 'index.html'))) {
    throw new Error('dist/index.html not found. Run "npm run build" first (or pass --url).');
  }
  const base = `http://127.0.0.1:${port}/`;
  if (await httpGetOk(base)) {
    throw new Error(
      `Port ${port} already answers (stale preview server?). It might serve an old build. ` +
      `Stop it, pass --port <free port>, or pass --url ${base} to test it deliberately.`);
  }
  const viteArgs = ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'];
  const viteBin = resolveViteBin();
  // Equivalent of `npx vite preview --port N --strictPort`, minus the npx/cmd wrapper
  // processes. Falls back to npx (through a shell) if vite's bin can't be located.
  const [cmd, args, shell] = viteBin
    ? [process.execPath, [viteBin, ...viteArgs], false]
    : ['npx', ['vite', ...viteArgs], true];
  let log = '';
  const proc = spawn(cmd, args, {
    cwd: ROOT, shell, windowsHide: true,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProc = proc;
  const onData = (d) => { log = (log + d).slice(-4000); };
  proc.stdout.on('data', onData);
  proc.stderr.on('data', onData);
  let exited = false;
  proc.on('exit', (code) => { exited = true; log += `\n(vite preview exited with code ${code})`; });
  proc.on('error', (e) => { exited = true; log += `\n(spawn error: ${e.message})`; });

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (exited) throw new Error(`vite preview failed to start:\n${log.trim()}`);
    if (await httpGetOk(base)) return base;
    await sleep(150);
  }
  throw new Error(`vite preview did not answer on ${base} within 30 s:\n${log.trim()}`);
}

// ---------------------------------------------------------------------------
// Browser discovery / launch / GPU probe
// ---------------------------------------------------------------------------

function findBrowserExecutable(explicit) {
  if (explicit) {
    if (!existsSync(explicit)) throw new Error(`--browser path does not exist: ${explicit}`);
    return explicit;
  }
  const env = process.env;
  const roots = [env['ProgramFiles(x86)'], env.ProgramFiles, env.LOCALAPPDATA].filter(Boolean);
  const rels = [
    ['Microsoft', 'Edge', 'Application', 'msedge.exe'],
    ['Google', 'Chrome', 'Application', 'chrome.exe'],
  ];
  for (const rel of rels) {
    for (const root of roots) {
      const p = path.join(root, ...rel);
      if (existsSync(p)) return p;
    }
  }
  return null; // let playwright resolve channel 'msedge' / 'chrome'
}

async function launchBrowser(executablePath, headless) {
  const common = {
    headless,
    args: GPU_ARGS,
    // We handle signals ourselves so the server tree is always killed too.
    handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false,
  };
  let browser;
  if (executablePath) {
    browser = await chromium.launch({ ...common, executablePath });
  } else {
    try { browser = await chromium.launch({ ...common, channel: 'msedge' }); }
    catch { browser = await chromium.launch({ ...common, channel: 'chrome' }); }
  }
  activeBrowsers.add(browser);
  return browser;
}

/** Ask the browser which WebGL renderer it really gives us (+ GPU process info). */
async function probeGpu(browser) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const webgl = await page.evaluate(() => {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      if (!gl) return { error: 'WebGL is not available' };
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        webgl2: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext,
        renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      };
    });
    let system = null; // best effort: what the GPU process reports
    try {
      const s = await browser.newBrowserCDPSession();
      const info = await s.send('SystemInfo.getInfo');
      system = {
        device: info.gpu?.devices?.[0]?.deviceString || null,
        webglStatus: info.gpu?.featureStatus?.webgl || null,
        gpuCompositing: info.gpu?.featureStatus?.gpu_compositing || null,
      };
      await s.detach().catch(() => {});
    } catch { /* optional */ }
    return { ...webgl, system };
  } finally {
    await context.close().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// In-page measurement
// ---------------------------------------------------------------------------

/**
 * Runs inside the page. Collects requestAnimationFrame timestamps for `ms`
 * milliseconds and returns the frame-to-frame deltas plus the app's own stats()
 * read in the last frame. Never hangs: a timer resolves with whatever was
 * collected if rAF stops firing (hidden/stalled page).
 */
function inPageMeasure(ms) {
  return new Promise((resolve) => {
    const deltas = [];
    let first = null;
    let prev = null;
    let done = false;
    const readStats = async () => {
      try {
        const api = window.__mkce;
        if (api && typeof api.stats === 'function') return await api.stats();
      } catch (e) { return { error: String(e) }; }
      return null;
    };
    const finish = async (timedOut) => {
      if (done) return;
      done = true;
      const stats = await readStats();
      resolve({ deltas, elapsed: first === null ? 0 : prev - first, stats, timedOut });
    };
    const step = (t) => {
      if (done) return;
      if (first === null) { first = t; prev = t; }
      else { deltas.push(t - prev); prev = t; }
      if (t - first >= ms) finish(false);
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    setTimeout(() => finish(true), ms + 20000);
  });
}

/** Tiny fixed CPU benchmark (ms, best of 3) to prove CPU throttling is active. */
function inPageCpuProbe() {
  let best = Infinity;
  for (let r = 0; r < 3; r++) {
    const t0 = performance.now();
    let x = 0;
    for (let i = 0; i < 3e6; i++) x += Math.sqrt(i);
    if (x < 0) console.log(x); // keep the loop alive
    best = Math.min(best, performance.now() - t0);
  }
  return best;
}

function summarizeFrames(deltas) {
  const n = deltas.length;
  if (n === 0) return { frames: 0, avgFps: 0, low1Fps: 0, worstMs: 0, p50Ms: 0, p95Ms: 0 };
  const sum = deltas.reduce((a, b) => a + b, 0);
  const desc = [...deltas].sort((a, b) => b - a);
  const k = Math.max(1, Math.ceil(n * 0.01)); // slowest 1% of frames (at least one)
  const slow = desc.slice(0, k);
  const slowMean = slow.reduce((a, b) => a + b, 0) / k;
  const asc = [...desc].reverse();
  const pct = (p) => asc[Math.min(n - 1, Math.floor(p * n))];
  return {
    frames: n,
    avgFps: (1000 * n) / sum,
    low1Fps: 1000 / slowMean,
    worstMs: desc[0],
    p50Ms: pct(0.5),
    p95Ms: pct(0.95),
  };
}

// ---------------------------------------------------------------------------
// Synthetic input: a continuous touch/mouse drag that sweeps the camera
// ---------------------------------------------------------------------------

/**
 * Starts a finger/mouse drag that moves back and forth horizontally (triangle
 * wave, so one gesture can last many seconds without leaving the viewport) with a
 * slight vertical wobble. Returns { stop() } which releases the pointer.
 */
function startOrbitDrag(page, cdp, kind) {
  const cx = VIEWPORT.width / 2;
  const cy = VIEWPORT.height * 0.55;
  const amp = 140;        // px each side of centre
  const speed = 450;      // px/s
  const period = (4 * amp) / speed;
  const pos = (t) => {
    const ph = (t % period) / period;               // 0..1
    const tri = ph < 0.5 ? ph * 4 - 1 : 3 - ph * 4; // -1..1..-1
    return { x: cx + tri * amp, y: cy + 40 * Math.sin(t * 2 * Math.PI * 0.7) };
  };
  const touch = (type, p) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: p ? [{ x: p.x, y: p.y, id: 1, radiusX: 8, radiusY: 8, force: 0.5 }] : [],
  });
  let stopping = false;
  const loop = (async () => {
    const t0 = performance.now();
    let p = pos(0);
    if (kind === 'touch') await touch('touchStart', p);
    else { await page.mouse.move(p.x, p.y); await page.mouse.down(); }
    while (!stopping) {
      p = pos((performance.now() - t0) / 1000); // time based => constant speed
      if (kind === 'touch') await touch('touchMove', p);
      else await page.mouse.move(p.x, p.y);
      await sleep(10);
    }
    if (kind === 'touch') await touch('touchEnd', null);
    else await page.mouse.up();
  })();
  return {
    async stop() { stopping = true; await loop.catch(() => {}); },
  };
}

// ---------------------------------------------------------------------------
// One scenario run (fresh browser context => no state leaks between runs)
// ---------------------------------------------------------------------------

/** Console / page problems collected over the whole session. */
const issues = [];
let ignoredFavicon = 0;
let baselineProbeMs = null; // fastest unthrottled in-page CPU probe seen so far

async function runScenario({ browser, mobile, url, name, cpu, opts, shotPath, progress }) {
  const scen = SCENARIOS[name];
  const tag = `${name}@${cpu}x`;
  const result = {
    scenario: name, cpuThrottle: cpu, api: null, mode: scen.mode, notes: [], error: null,
  };
  const context = await browser.newContext(mobile);
  await context.addInitScript(() => { try { localStorage.setItem('mkce360.profile.v1', JSON.stringify({ skipped: true })); } catch { /* storage blocked */ } }); // no welcome screen
  const page = await context.newPage();
  const addIssue = (kind, text, location) => issues.push({ run: tag, kind, text, location: location || null });
  // The browser auto-requests /favicon.ico; a 404 there is harmless noise, so count it separately.
  const isFavicon = (u) => /\/favicon\.ico(\?|$)/.test(u || '');

  page.on('console', (m) => {
    const t = m.type();
    if (t === 'error' || t === 'warning') {
      const loc = m.location();
      if (isFavicon(loc?.url)) { ignoredFavicon++; return; }
      addIssue(`console.${t}`, m.text(), loc?.url ? `${loc.url}:${loc.lineNumber ?? ''}` : null);
    }
  });
  page.on('pageerror', (e) => addIssue('pageerror', e.stack || String(e)));
  page.on('crash', () => addIssue('crash', 'The page crashed'));
  page.on('requestfailed', (r) => { if (!isFavicon(r.url())) addIssue('requestfailed', `${r.failure()?.errorText || 'failed'}: ${r.url()}`); });
  page.on('response', (r) => { if (r.status() >= 400 && !isFavicon(r.url())) addIssue('http', `${r.status()} ${r.url()}`); });

  try {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.bringToFront();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu }); // re-assert after navigation

    // --- feature-detect the app test API --------------------------------
    const hasApi = await page.waitForFunction(() => !!window.__mkce, null, { timeout: 1500 })
      .then(() => true, () => false);
    const api = { present: hasApi, setMode: false, stats: false, input: false, ready: null };
    if (hasApi) {
      Object.assign(api, await page.evaluate(() => ({
        setMode: typeof window.__mkce.setMode === 'function',
        stats: typeof window.__mkce.stats === 'function',
        input: typeof window.__mkce.input === 'function',
      })));
      api.ready = await page.evaluate(async (limit) => {
        const a = window.__mkce;
        if (!a.ready) return 'no ready promise';
        try {
          await Promise.race([
            Promise.resolve(a.ready),
            new Promise((_, rej) => setTimeout(() => rej(new Error('ready timeout')), limit)),
          ]);
          return 'ok';
        } catch (e) { return `failed: ${e.message || e}`; }
      }, 90000);
      if (api.ready.startsWith('failed')) result.notes.push(`__mkce.ready ${api.ready}`);
    } else {
      result.notes.push('no window.__mkce: plain rAF rate only');
    }
    result.api = api;

    // Verify the CPU throttle is really active. The emulation is occasionally dropped
    // when the navigation swaps renderer processes, so re-apply and re-probe if the
    // fixed benchmark is not clearly slower than the unthrottled baseline.
    let probe = await page.evaluate(inPageCpuProbe);
    if (cpu > 1 && baselineProbeMs !== null) {
      const expectedAtLeast = baselineProbeMs * cpu * 0.5;
      for (let attempt = 0; attempt < 3 && probe < expectedAtLeast; attempt++) {
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
        probe = await page.evaluate(inPageCpuProbe);
      }
      if (probe < expectedAtLeast) {
        result.notes.push(`CPU throttle ${cpu}x may not be active (probe ${probe.toFixed(1)} ms vs ${baselineProbeMs.toFixed(1)} ms unthrottled)`);
      }
    }
    if (cpu === 1) baselineProbeMs = Math.min(baselineProbeMs ?? Infinity, probe);
    result.cpuProbeMs = Number(probe.toFixed(1));

    // --- put the app into the scenario's mode ---------------------------
    if (api.present && api.setMode) {
      try { await page.evaluate((m) => window.__mkce.setMode(m), scen.mode); }
      catch (e) { result.notes.push(`setMode failed: ${String(e.message || e).split('\n')[0]}`); }
    } else if (hasApi) {
      result.notes.push('__mkce.setMode missing');
    }
    await sleep(1000); // let camera transitions / adaptive quality settle

    // --- start the continuous action ------------------------------------
    let stopAction = async () => {};
    if (scen.action === 'orbit') {
      const drag = startOrbitDrag(page, cdp, opts.drag);
      stopAction = () => drag.stop();
    } else if (scen.action === 'route' || scen.action === 'guide') {
      try {
        await page.evaluate(async (guide) => {
          const n = window.__mkce.nav;
          n.planTo({ buildingId: 'radhakrishnan-block' }, 'gate:main-gate');
          if (guide) await n.start();
        }, scen.action === 'guide');
        stopAction = () => page.evaluate(() => window.__mkce.nav.end()).catch(() => {});
      } catch (e) { result.notes.push(`route setup failed: ${String(e.message || e).split(String.fromCharCode(10))[0]}`); }
    } else if (scen.action === 'interior') {
      try {
        // stand at the north end of the east verandah of block 1 (inside the building, which is part of the world) and walk south
        // along it (a 90 m run beside the courtyard)
        await page.evaluate(() => {
          const ph = window.__mkce.interiors.units.get('apj-block').phys;
          const p = ph.toWorld(35.4, -43);
          const fx = -ph.sin, fz = ph.cos; // south in the building's frame, in the world
          window.__mkce.app.walk.placeAt(p.x, p.z, Math.atan2(-fx, -fz), { y: 0.45, pitch: 0 });
        });
        await sleep(800);
        await page.evaluate(() => window.__mkce.input({ forward: 1, strafe: 0, turn: 0 }));
        stopAction = () => page.evaluate(() => window.__mkce.input(null)).catch(() => {});
      } catch (e) { result.notes.push('interior setup failed'); }
    } else if (scen.action === 'drive') {
      await page.evaluate(() => window.__mkce.input({ throttle: 0.35 }));
      stopAction = () => page.evaluate(() => window.__mkce.input(null)).catch(() => {});
    } else if (scen.action === 'drive-inside') {
      // the car in front of the porch, aimed at the entrance; a gentle gas for the whole run (it stops against the walls of the court)
      await page.evaluate(() => {
        const f = window.__mkce.app.world.doorFrames.find((d) => d.id === 'apj-block');
        window.__mkce.drive.car.place(f.x + f.nx * 12, f.z + f.nz * 12, Math.atan2(f.nx, f.nz), 0);
        window.__mkce.input({ throttle: 0.2 });
      });
      stopAction = () => page.evaluate(() => window.__mkce.input(null)).catch(() => {});
    } else if (scen.action === 'move') {
      if (api.present && api.input) {
        await page.evaluate(() => window.__mkce.input({ forward: 1, strafe: 0, turn: 0 }));
        stopAction = () => page.evaluate(() => window.__mkce.input(null)).catch(() => {});
      } else {
        result.notes.push('__mkce.input missing: measured standing still');
      }
    }

    try {
      await sleep(opts.warmup * 1000);
      progress(`measuring ${opts.seconds}s`);
      const m = await page.evaluate(inPageMeasure, opts.seconds * 1000);
      Object.assign(result, summarizeFrames(m.deltas));
      result.elapsedMs = Number(m.elapsed.toFixed(1));
      result.frameMs = m.deltas.map((d) => Number(d.toFixed(2)));
      result.appStats = m.stats;
      if (m.timedOut) result.notes.push('rAF stalled: measurement timed out');
    } finally {
      await stopAction();
    }

    // Screenshot only for the unthrottled run; taken after measuring so it can't skew it.
    if (cpu === 1 && shotPath) {
      await sleep(300);
      await page.screenshot({ path: shotPath, scale: opts.shotScale, timeout: 30000 });
      result.screenshot = shotPath;
    }
  } catch (e) {
    result.error = String(e.message || e).split('\n')[0];
    addIssue('harness', `${tag}: ${result.error}`);
  } finally {
    await context.close().catch(() => {});
  }
  return result;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function fmt(v, digits = 1) {
  return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : '-';
}
function fmtInt(v) {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v).toLocaleString('en-US') : '-';
}

function markdownTable(rows) {
  const head = ['scenario', 'cpu throttle', 'avg fps', '1% low fps', 'worst frame ms',
    'draw calls', 'triangles', 'quality', 'pixelRatio', 'frames'];
  const body = rows.map((r) => {
    const s = r.appStats && !r.appStats.error ? r.appStats : {};
    return [
      r.scenario, `${r.cpuThrottle}x`,
      r.error ? 'ERROR' : fmt(r.avgFps), r.error ? '-' : fmt(r.low1Fps), r.error ? '-' : fmt(r.worstMs),
      fmtInt(s.drawCalls), fmtInt(s.triangles),
      s.quality !== undefined && s.quality !== null ? String(s.quality) : '-',
      s.pixelRatio !== undefined && s.pixelRatio !== null ? fmt(Number(s.pixelRatio), 2) : '-',
      r.error ? '-' : String(r.frames),
    ];
  });
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((b) => b[i].length)));
  const line = (cells) => `| ${cells.map((c, i) => c.padEnd(widths[i])).join(' | ')} |`;
  return [line(head), `| ${widths.map((w) => '-'.repeat(w)).join(' | ')} |`, ...body.map(line)].join('\n');
}

/** Collapse identical issues (same kind + text) across runs. */
function groupIssues(list) {
  const map = new Map();
  for (const i of list) {
    const key = `${i.kind}\u0000${i.text}`;
    const g = map.get(key) || { kind: i.kind, text: i.text, location: i.location, count: 0, runs: new Set() };
    g.count++;
    g.runs.add(i.run);
    map.set(key, g);
  }
  return [...map.values()].map((g) => ({ ...g, runs: [...g.runs] }));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { console.log(HELP); return 0; }

  // 1. What to test
  let baseUrl;
  if (opts.url) {
    baseUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(opts.url) ? opts.url : `http://${opts.url}`;
  } else {
    console.log(`Serving dist/ with "vite preview" on port ${opts.port} ...`);
    baseUrl = await startServer(opts.port);
  }
  let url = baseUrl;
  if (opts.query) {
    const q = opts.query.replace(/^[?&]/, '');
    url += (url.includes('?') ? '&' : '?') + q;
  }
  mkdirSync(opts.out, { recursive: true });

  // 2. Browser, preferring GPU-backed WebGL
  const exe = findBrowserExecutable(opts.browser);
  let headless = !opts.headed;
  let browser = await launchBrowser(exe, headless);
  let gpu = await probeGpu(browser);
  if (isSoftware(gpu.renderer) && headless) {
    console.log(`Headless WebGL renderer is "${gpu.renderer ?? gpu.error}" (software). Retrying headed ...`);
    try {
      const headed = await launchBrowser(exe, false);
      const gpu2 = await probeGpu(headed);
      if (!isSoftware(gpu2.renderer)) {
        activeBrowsers.delete(browser);
        await browser.close().catch(() => {});
        browser = headed; gpu = gpu2; headless = false;
      } else {
        console.log(`Headed run is software too ("${gpu2.renderer}"); staying headless.`);
        activeBrowsers.delete(headed);
        await headed.close().catch(() => {});
      }
    } catch (e) {
      console.log(`Headed retry failed (${String(e.message).split('\n')[0]}); staying headless.`);
    }
  }
  const software = isSoftware(gpu.renderer);
  const browserVersion = browser.version();
  const major = browserVersion.split('.')[0];
  const mobile = {
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    isMobile: true,
    hasTouch: true,
    userAgent: `Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Mobile Safari/537.36`,
  };

  console.log('');
  console.log(`URL:             ${url}`);
  console.log(`Browser:         ${browserVersion} (${exe || 'channel'}) ${headless ? 'headless' : 'headed'}`);
  console.log(`Viewport:        ${VIEWPORT.width}x${VIEWPORT.height} @${DEVICE_SCALE_FACTOR}x, mobile + touch`);
  console.log(`WebGL renderer:  ${gpu.renderer ?? gpu.error}${gpu.vendor ? `  [${gpu.vendor}]` : ''}`);
  if (gpu.system) console.log(`GPU process:     ${gpu.system.device ?? '?'} | webgl=${gpu.system.webglStatus ?? '?'} | compositing=${gpu.system.gpuCompositing ?? '?'}`);
  console.log(software
    ? 'RENDERING:       SOFTWARE RENDERING (not representative of a phone)'
    : 'RENDERING:       GPU-backed WebGL');
  console.log(`Scenarios:       ${opts.scenarios.join(', ')} x CPU ${CPU_RATES.map((r) => `${r}x`).join(' / ')}; ${opts.warmup}s warmup + ${opts.seconds}s measured`);
  console.log('');

  // 3. Run every scenario at every CPU throttle rate
  const results = [];
  const total = opts.scenarios.length * CPU_RATES.length;
  let n = 0;
  for (const name of opts.scenarios) {
    for (const cpu of CPU_RATES) {
      if (shuttingDown) throw new Error('interrupted');
      n++;
      const prefix = `[${n}/${total}] ${name} @ cpu ${cpu}x`;
      const progress = (msg) => console.log(`${prefix}: ${msg}`);
      progress('loading');
      const r = await runScenario({
        browser, mobile, url, name, cpu, opts, progress,
        shotPath: cpu === 1 ? path.join(opts.out, `${name}.png`) : null,
      });
      results.push(r);
      console.log(r.error
        ? `${prefix}: FAILED (${r.error})`
        : `${prefix}: ${fmt(r.avgFps)} fps avg, ${fmt(r.low1Fps)} fps 1% low, worst ${fmt(r.worstMs)} ms` +
          (r.cpuProbeMs ? ` (cpu probe ${r.cpuProbeMs} ms)` : ''));
    }
  }

  await closeBrowsers();

  // 4. Report
  const apiPresent = results.some((r) => r.api?.present);
  const table = markdownTable(results);
  const grouped = groupIssues(issues);
  const errorCount = grouped.filter((g) => g.kind !== 'console.warning').length;

  console.log('');
  console.log(`## MKCE 360 frame rate, ${VIEWPORT.width}x${VIEWPORT.height} @${DEVICE_SCALE_FACTOR}x, ${opts.seconds}s per run`);
  console.log('');
  console.log(table);
  console.log('');
  if (software) console.log('> **software rendering (not representative of a phone)**: ' +
    `WebGL renderer is "${gpu.renderer ?? gpu.error}". Use only to compare runs, not as phone numbers.`);
  console.log(apiPresent
    ? '> App test API window.__mkce detected: draw calls / triangles / quality / pixelRatio come from stats().'
    : '> window.__mkce NOT found: only the raw requestAnimationFrame rate was measured (draw calls etc. unavailable, ' +
      'walk/overview modes and movement input were not driven).');
  console.log('> CPU throttle 4x (CDP Emulation.setCPUThrottlingRate) only approximates a mid-range phone CPU; it does not slow the GPU.');
  console.log(`> Screenshots (CPU 1x): ${opts.out}`);
  for (const r of results) {
    for (const note of r.notes.filter((t) => !t.startsWith('no window.__mkce'))) {
      console.log(`> NOTE ${r.scenario} @ ${r.cpuThrottle}x: ${note}`);
    }
  }

  console.log('');
  console.log('## Page console errors / warnings / exceptions');
  if (!grouped.length) {
    console.log('none');
  }
  if (ignoredFavicon) console.log(`(ignored ${ignoredFavicon} favicon.ico 404 message(s): the app has no favicon)`);
  if (grouped.length) {
    for (const g of grouped) {
      const where = g.location ? `  (${g.location})` : '';
      console.log(`- [${g.kind}] x${g.count} in ${g.runs.join(', ')}: ${g.text.split('\n')[0]}${where}`);
      if (g.kind === 'pageerror') console.log(g.text.split('\n').slice(1, 6).map((l) => `    ${l.trim()}`).join('\n'));
    }
  }

  const json = {
    generatedAt: new Date().toISOString(),
    url,
    browser: { version: browserVersion, executable: exe, headless },
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    userAgent: mobile.userAgent,
    webgl: { ...gpu, softwareRendering: software },
    options: {
      seconds: opts.seconds, warmup: opts.warmup, scenarios: opts.scenarios,
      cpuRates: CPU_RATES, drag: opts.drag, shotScale: opts.shotScale,
    },
    apiDetected: apiPresent,
    results,
    issues: grouped,
    markdown: table,
  };
  const jsonPath = path.join(opts.out, 'results.json');
  writeFileSync(jsonPath, JSON.stringify(json, null, 2));
  console.log('');
  console.log(`Wrote ${jsonPath}`);

  if (results.some((r) => r.error)) return 1;
  return errorCount > 0 ? 2 : 0;
}

let exitCode = 1;
try {
  exitCode = await main();
} catch (e) {
  if (!shuttingDown) console.error(`\nperf-test failed: ${e.message || e}`);
  if (process.env.DEBUG) console.error(e.stack);
  exitCode = 1;
} finally {
  await closeBrowsers();
  killTree(serverProc);
}
// On Ctrl-C the signal handler is already exiting with 130; don't race it.
if (!shuttingDown) process.exit(exitCode);
else await sleep(10000);
