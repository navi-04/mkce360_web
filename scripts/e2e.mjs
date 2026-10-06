#!/usr/bin/env node
/**
 * MKCE 360 end-to-end checks (dev only). Drives the installed Microsoft Edge with playwright-core at a
 * 390x844 phone viewport using REAL touch events (via CDP) and asserts the behaviour that matters for the
 * Walk mode: movement speed, run, joystick + look at the same time, tap-to-walk, wall and boundary collision,
 * gyro (simulated sensor), calibration (select, nudge, door, export, persistence) and the debug 2D map.
 *
 *   npm run build && npm run e2e
 *   npm run e2e -- --url http://127.0.0.1:4173/     (test an already running server)
 *
 * Exit code 0 = all passed, 1 = a check failed or the harness broke.
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const args = process.argv.slice(2);
const argOf = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const port = Number(argOf('--port') ?? 4199);
let base = argOf('--url');

const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find(existsSync);

let passed = 0;
const failed = [];
function check(name, ok, detail = '') {
  if (ok) {
    passed++;
    console.log(`  ok    ${name}${detail ? '  (' + detail + ')' : ''}`);
  } else {
    failed.push(name);
    console.log(`  FAIL  ${name}${detail ? '  (' + detail + ')' : ''}`);
  }
}

function waitPort(url, tries = 60) {
  return new Promise((resolve, reject) => {
    const t = () =>
      http.get(url, (res) => { res.resume(); resolve(); }).on('error', () => (--tries > 0 ? setTimeout(t, 250) : reject(new Error('server did not start'))));
    t();
  });
}

let server;
async function startServer() {
  if (base) return;
  if (!existsSync(path.join(ROOT, 'dist/index.html'))) throw new Error('dist/ not found: run `npm run build` first');
  server = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  base = `http://127.0.0.1:${port}/`;
  await waitPort(base);
}

async function main() {
  if (!EDGE) throw new Error('Edge/Chrome not found');
  await startServer();
  const browser = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const errors = [];
  const newPage = async (opts = {}, query = '') => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true, ...opts });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
    page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
    await page.goto(base + query);
    await page.waitForFunction(() => window.__mkce, null, { timeout: 40000 });
    await page.waitForTimeout(500);
    return { ctx, page };
  };
  const walkState = (page) => page.evaluate(() => { const w = window.__mkce.app.walk; return { x: w.pos.x, z: w.pos.z, yaw: (w.yaw * 180) / Math.PI, pitch: (w.pitch * 180) / Math.PI, speed: w.speed, target: w.target }; });
  const put = (page, x, z, hdg) => page.evaluate(([x, z, hdg]) => { const w = window.__mkce.app.walk; w.pos.x = x; w.pos.z = z; w.yaw = (-hdg * Math.PI) / 180; w.pitch = 0; w.vel.x = w.vel.z = 0; w.cancelTarget(); }, [x, z, hdg]);

  // ================= phone: walk mode =================
  console.log('Walk mode (touch phone 390x844)');
  {
    const { ctx, page } = await newPage();
    const cdp = await ctx.newCDPSession(page);
    const tp = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 1, radiusY: 1, force: 1 })) });

    check('stats API reports quality and draw calls', await page.evaluate(() => { const s = window.__mkce.stats(); return s.drawCalls > 0 && s.pixelRatio <= 2; }));
    await page.evaluate(() => window.__mkce.setMode('walk'));
    await sleep(400);
    const sp = await walkState(page);
    check('spawns inside the main gate facing west', Math.abs(sp.x + 3) < 0.1 && Math.abs(sp.z) < 0.1 && Math.abs(((sp.yaw % 360) + 360) % 360 - 90) < 1, `x ${sp.x.toFixed(1)} yaw ${sp.yaw.toFixed(0)}`);
    check('eye height is 1.6 m', await page.evaluate(() => Math.abs(window.__mkce.app.camera.position.y - 1.6) < 0.05));

    // keyboard-like walking speed ~1.4 m/s
    await put(page, -3, 0, 270);
    const a = await walkState(page);
    await page.evaluate(() => window.__mkce.input({ forward: 1 }));
    await sleep(3000);
    const b = await walkState(page);
    await page.evaluate(() => window.__mkce.input(null));
    const v = Math.hypot(b.x - a.x, b.z - a.z) / 3;
    check('walks west at about 1.4 m/s', v > 1.1 && v < 1.5, `${v.toFixed(2)} m/s average incl. start-up`);

    // run toggle
    await page.click('.hbtn:has-text("Run")');
    await put(page, -3, 0, 270);
    const r0 = await walkState(page);
    await page.evaluate(() => window.__mkce.input({ forward: 1 }));
    await sleep(2500);
    const r1 = await walkState(page);
    await page.evaluate(() => window.__mkce.input(null));
    await page.click('.hbtn:has-text("Run")');
    check('Run toggle roughly doubles the speed', Math.hypot(r1.x - r0.x, r1.z - r0.z) / 2.5 > 2.2, `${(Math.hypot(r1.x - r0.x, r1.z - r0.z) / 2.5).toFixed(2)} m/s`);

    // joystick (left thumb) and look-drag (right thumb) at the same time
    await put(page, -3, 0, 270);
    const m0 = await walkState(page);
    await tp('touchStart', [[80, 700, 1], [300, 420, 2]]);
    await tp('touchMove', [[80, 640, 1], [300, 420, 2]]);
    for (let i = 1; i <= 10; i++) { await tp('touchMove', [[80, 640, 1], [300 - i * 12, 420, 2]]); await sleep(100); }
    const m1 = await walkState(page);
    await tp('touchEnd', []);
    check('multi-touch: joystick moves the player', Math.hypot(m1.x - m0.x, m1.z - m0.z) > 1, `${Math.hypot(m1.x - m0.x, m1.z - m0.z).toFixed(1)} m`);
    check('multi-touch: look drag turns the view at the same time', Math.abs(m1.yaw - m0.yaw) > 15, `${(m1.yaw - m0.yaw).toFixed(0)} deg`);

    // tap to walk
    await put(page, -3, 0, 270);
    await tp('touchStart', [[260, 620, 7]]);
    await sleep(60);
    await tp('touchEnd', []);
    await sleep(250);
    const t1 = await walkState(page);
    check('tap on the ground sets a walk target', !!t1.target);
    await sleep(3500);
    const t2 = await walkState(page);
    check('player arrives at the tapped point', !t2.target && Math.hypot(t2.x - t1.target.x, t2.z - t1.target.z) < 1, `error ${Math.hypot(t2.x - t1.target.x, t2.z - t1.target.z).toFixed(2)} m`);

    // collisions
    await put(page, -60, 31, 270);
    await page.evaluate(() => window.__mkce.input({ forward: 1 }));
    await sleep(11000);
    await page.evaluate(() => window.__mkce.input(null));
    const w1 = await walkState(page);
    check('block 1 wall stops the player (door side, x about -72.9)', w1.x > -73.2 && w1.x < -71.8, `x ${w1.x.toFixed(2)}`);
    await put(page, -3, 0, 90);
    await page.evaluate(() => window.__mkce.input({ forward: 1 }));
    await sleep(3000);
    await page.evaluate(() => window.__mkce.input(null));
    const w2 = await walkState(page);
    check('boundary wall keeps the player inside, even at the gate', w2.x <= -0.3, `x ${w2.x.toFixed(2)}`);

    // pitch limits
    await page.evaluate(() => { const w = window.__mkce.app.walk; w._addLook(0, 5); });
    check('pitch is limited to 75 degrees', (await walkState(page)).pitch <= 75.01);

    // gyro with a simulated sensor
    await page.evaluate(() => { window.DeviceOrientationEvent.requestPermission = async () => 'granted'; });
    await put(page, -3, 0, 270);
    const y0 = (await walkState(page)).yaw;
    await page.click('.hbtn:has-text("Gyro")');
    await sleep(150);
    await page.evaluate(() => { for (let i = 0; i < 4; i++) window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 10, beta: 90, gamma: 0 })); });
    await sleep(600);
    const g0 = await walkState(page);
    await page.evaluate(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 40, beta: 90, gamma: 0 })));
    await sleep(250);
    const g1 = await walkState(page);
    check('gyro: enabling keeps the current view (no jump)', Math.abs(g0.yaw - y0) < 1.5, `${y0.toFixed(1)} -> ${g0.yaw.toFixed(1)}`);
    check('gyro: turning the phone 30 deg turns the view 30 deg', Math.abs(g1.yaw - g0.yaw - 30) < 1.5, `${(g1.yaw - g0.yaw).toFixed(1)} deg`);
    await ctx.close();
  }

  // ================= phone: overview -> walk here =================
  console.log('Overview');
  {
    const { ctx, page } = await newPage();
    await page.evaluate(() => { const a = window.__mkce.app; a.overview.controls.target.set(-60, 0, 60); a.camera.position.set(-60, 300, 200); });
    await sleep(400);
    const scr = await page.evaluate(() => { const a = window.__mkce.app; const v = new a.camera.position.constructor(-40, 0, 5).project(a.camera); return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]; });
    await page.touchscreen.tap(scr[0], scr[1]);
    await sleep(350);
    check('tapping the ground shows the "Walk here" chip', await page.evaluate(() => document.querySelector('.chip').classList.contains('on')));
    await page.click('.chip-go');
    await sleep(900);
    const s = await page.evaluate(() => { const a = window.__mkce.app; return { mode: a.mode, x: a.walk.pos.x, z: a.walk.pos.z }; });
    check('"Walk here" drops the player at the tapped point', s.mode === 'walk' && Math.hypot(s.x + 40, s.z - 5) < 1, `${s.x.toFixed(1)}, ${s.z.toFixed(1)}`);
    await page.click('.segmented button[data-mode="overview"]');
    await sleep(700);
    check('back to Overview works', (await page.evaluate(() => window.__mkce.app.mode)) === 'overview');
    check('camera stays above ground in Overview', await page.evaluate(() => window.__mkce.app.camera.position.y >= 5));
    await ctx.close();
  }

  // ================= desktop =================
  console.log('Desktop');
  {
    const { ctx, page } = await newPage({ viewport: { width: 1280, height: 720 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });
    await page.evaluate(() => window.__mkce.setMode('walk'));
    await sleep(400);
    const y0 = (await walkState(page)).yaw;
    await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.move(540, 330, { steps: 6 }); await page.mouse.up();
    const y1 = await walkState(page);
    check('mouse drag turns the view', Math.abs(y1.yaw - y0) > 10 && !y1.target, `${(y1.yaw - y0).toFixed(1)} deg`);
    await put(page, -3, 0, 270);
    const k0 = await walkState(page);
    await page.keyboard.down('KeyW'); await sleep(1500); await page.keyboard.up('KeyW');
    const k1 = await walkState(page);
    check('W key walks forward', Math.hypot(k1.x - k0.x, k1.z - k0.z) > 1.2);
    await page.keyboard.down('ArrowLeft'); await sleep(500); await page.keyboard.up('ArrowLeft');
    check('left arrow turns', Math.abs((await walkState(page)).yaw - k1.yaw) > 30);
    await ctx.close();
  }

  // ================= calibration =================
  console.log('Calibration (?calibrate=1)');
  {
    const { ctx, page } = await newPage({}, '?calibrate=1');
    await page.evaluate(() => { const a = window.__mkce.app; a.overview.controls.target.set(-125, 0, 68); a.camera.position.set(-125, 420, 208); });
    await sleep(400);
    const scr = await page.evaluate(() => { const a = window.__mkce.app; const v = new a.camera.position.constructor(-125.1, 0, 67.7).project(a.camera); return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]; });
    await page.touchscreen.tap(scr[0], scr[1]);
    await sleep(300);
    const title = await page.evaluate(() => document.querySelector('.panel h3').textContent);
    check('tapping a building selects it', /Kalam/.test(title), title);
    const b0 = await page.evaluate(() => structuredClone(window.__mkce.app.data.buildings[0]));
    await page.click('[data-k=e]');
    await page.click('[data-k=e]');
    await sleep(500);
    const b1 = await page.evaluate(() => structuredClone(window.__mkce.app.data.buildings[0]));
    check('nudge moves the building and its door together', Math.abs(b1.position.x - b0.position.x - 2) < 0.01 && Math.abs(b1.doorPosition.x - b0.doorPosition.x - 2) < 0.01);
    check('the 3D collider follows the edit', await page.evaluate(() => Math.abs(window.__mkce.app.world.colliders.find((c) => c.id === 'apj-block').cx - (-125.1 + 2)) < 0.1));
    check('door stays linked to the path graph', await page.evaluate(() => { const d = window.__mkce.app.data; const b = d.buildings[0]; return d.paths.edges.filter((e) => e.from === b.doorNode || e.to === b.doorNode).length === 1; }));
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), page.click('[data-k=export]')]);
    let exported = null;
    if (dl) exported = JSON.parse(readFileSync(await dl.path(), 'utf8'));
    check('export downloads campus.json with the edit', !!exported && dl.suggestedFilename() === 'campus.json' && Math.abs(exported.buildings[0].position.x - (-123.1)) < 0.05);
    await page.goto(base + '?calibrate=1');
    await page.waitForFunction(() => window.__mkce, null, { timeout: 30000 });
    check('edits persist after a reload', await page.evaluate(() => Math.abs(window.__mkce.app.data.buildings[0].position.x - (-123.1)) < 0.05));
    await page.evaluate(() => localStorage.clear());
    await ctx.close();
  }

  // ================= debug =================
  console.log('Debug (?debug=1)');
  {
    const { ctx, page } = await newPage({}, '?debug=1');
    await page.click('.hbtn:has-text("Debug")');
    await page.click('[data-k=map]');
    await sleep(800);
    check('2D alignment map opens', await page.evaluate(() => !!document.querySelector('.map2d canvas')));
    await page.click('.map2d .bar button:has-text("Signboard")');
    await sleep(700);
    check('signboard overlay renders', await page.evaluate(() => !!document.querySelector('.map2d canvas')));
    await ctx.close();
  }

  const real = errors.filter((e) => !/favicon/.test(e));
  check('no console errors or warnings', real.length === 0, real.slice(0, 3).join(' | '));
  await browser.close();
}

try {
  await main();
} catch (e) {
  console.error('e2e harness failed:', e.message);
  failed.push('harness');
} finally {
  server?.kill();
}
console.log(`\n${passed} passed, ${failed.length} failed${failed.length ? ': ' + failed.join(', ') : ''}`);
process.exit(failed.length ? 1 : 0);
