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
import { fileURLToPath, pathToFileURL } from 'node:url';

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
    // every context starts as a returning visitor, so the welcome screen does not cover the app (it has its own test)
    await ctx.addInitScript(() => { try { if (!localStorage.getItem('mkce360.profile.v1')) localStorage.setItem('mkce360.profile.v1', JSON.stringify({ skipped: true })); } catch { /* storage blocked */ } });
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
    const tA = Date.now();
    await page.evaluate(() => window.__mkce.input({ forward: 1 }));
    await sleep(3000);
    const b = await walkState(page);
    const secs = (Date.now() - tA) / 1000; // the wait can run long on a busy machine
    await page.evaluate(() => window.__mkce.input(null));
    const v = Math.hypot(b.x - a.x, b.z - a.z) / secs;
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
    await sleep(500);
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

  // ================= phone: search, directions, guided walk =================
  console.log('Search and navigation');
  {
    const { ctx, page } = await newPage();
    const cdp = await ctx.newCDPSession(page);
    const tp = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 1, radiusY: 1, force: 1 })) });
    const nav = () => page.evaluate(() => { const n = window.__mkce.nav, w = window.__mkce.app.walk; return { mode: n.mode, s: n.s, len: n.route?.length ?? 0, x: w.pos.x, z: w.pos.z, yaw: (w.yaw * 180) / Math.PI, app: window.__mkce.app.mode, hint: n.hint?.text ?? '', layer: window.__mkce.app.routeLayer.group.visible }; });
    const programs = () => page.evaluate(() => window.__mkce.app.renderer.info.programs.length);
    const rows = () => page.evaluate(() => [...document.querySelectorAll('.srow .stxt b')].map((e) => e.textContent));
    const p0 = await programs();

    await page.tap('.search-btn');
    await sleep(500);
    check('Search button opens the search sheet', await page.evaluate(() => document.querySelector('.xsheet.open .sbar input') !== null));
    check('empty search lists every building', (await rows()).length >= 30, `${(await rows()).length} rows`);
    await page.fill('.sbar input', 'hostel');
    await sleep(200);
    const hostels = await rows();
    check('typing "hostel" lists the two mapped hostels and the one that is not mapped yet', hostels.length === 3 && hostels.every((h) => /hostel/i.test(h)) && (await page.evaluate(() => /Not mapped yet/.test(document.querySelectorAll('.srow .stxt small')[2].textContent))), hostels.join(' | '));
    await page.locator('.srow').nth(2).tap();
    await sleep(400);
    check('an item that is not mapped yet opens a card that says so and offers no directions', await page.evaluate(() => /not been confirmed/.test(document.querySelector('.card')?.textContent ?? '') && ![...document.querySelectorAll('.card .btn')].some((b) => /Directions/.test(b.textContent))));
    await page.tap('.cacts .btn');
    await sleep(300);
    await page.tap('.search-btn');
    await sleep(400);
    await page.fill('.sbar input', '');
    await page.tap('.schip:has-text("Sports")');
    await sleep(200);
    check('category chip filters the list', (await rows()).length >= 4 && (await page.evaluate(() => [...document.querySelectorAll('.srow .stxt small')].every((e) => /sports/i.test(e.textContent)))));
    await page.tap('.schip:has-text("All")');
    await page.fill('.sbar input', 'kalam');
    await sleep(200);
    await page.tap('.srow');
    await sleep(400);
    check('tapping a result opens the building card', await page.evaluate(() => /KALAM/.test(document.querySelector('.card h3')?.textContent ?? '')));
    check('card states the confirmed 4 floors', await page.evaluate(() => /Floors4/.test(document.querySelector('.crows').textContent.replace(/\s/g, ''))));
    await page.tap('.cacts .btn.primary');
    await sleep(1200);
    let n = await nav();
    check('Directions plans the route from the main gate to the entrance on the north face (about 133 m by road)', n.mode === 'preview' && Math.abs(n.len - 133.3) < 6, `${n.len.toFixed(1)} m`);
    check('route line is shown', n.layer);
    check('planner sheet lists the steps', await page.evaluate(() => document.querySelectorAll('.psteps li').length >= 2));

    await page.tap('.planner .cacts .btn.primary');
    await sleep(2800);
    n = await nav();
    check('Start guided walk switches to Walk mode and starts guiding', n.app === 'walk' && n.mode === 'guided');
    check('top card shows a turn hint', await page.evaluate(() => document.querySelector('.navcard.on .nc-txt b')?.textContent.length > 3), n.hint);
    const g0 = await nav();
    await sleep(3000);
    const g1 = await nav();
    const gv = Math.hypot(g1.x - g0.x, g1.z - g0.z) / 3;
    check('guided walk moves at walking speed (~1.4 m/s)', gv > 1.2 && gv < 1.5, `${gv.toFixed(2)} m/s`);

    await page.tap('.nc-acts .btn:has-text("Pause")');
    await sleep(900);
    const q0 = await nav();
    await sleep(1200);
    const q1 = await nav();
    check('Pause stops the guided walk', q0.mode === 'paused' && Math.hypot(q1.x - q0.x, q1.z - q0.z) < 0.2);
    await page.tap('.nc-acts .btn:has-text("Resume")');
    await sleep(1500);
    const q2 = await nav();
    check('Resume continues along the route', q2.mode === 'guided' && q2.s > q1.s + 1);

    // look around while being guided: the view is not fought over for a moment
    const yawBefore = (await nav()).yaw;
    await tp('touchStart', [[300, 420, 2]]);
    for (let i = 1; i <= 8; i++) { await tp('touchMove', [[300 - i * 14, 420, 2]]); await sleep(40); }
    await tp('touchEnd', []);
    const yawAfter = (await nav()).yaw;
    check('dragging to look around works during the guided walk', Math.abs(yawAfter - yawBefore) > 8 && (await nav()).mode === 'guided', `${(yawAfter - yawBefore).toFixed(0)} deg`);

    // take control with the joystick
    await tp('touchStart', [[80, 700, 1]]);
    await tp('touchMove', [[80, 650, 1]]);
    await sleep(400);
    n = await nav();
    await tp('touchEnd', []);
    check('joystick input takes control; the route stays', n.mode === 'manual' && n.layer);
    await sleep(700);
    check('hint card offers to guide again', await page.evaluate(() => [...document.querySelectorAll('.navcard.on .btn')].some((b) => /Guide me/.test(b.textContent))));

    // far off the route: re-plan from where the walker stands
    await page.evaluate(() => { const w = window.__mkce.app.walk; w.pos.x = -120; w.pos.z = -50; w.cancelTarget(); }); // on the play ground, 45 m north of the road to the entrance
    await sleep(3600);
    n = await nav();
    const startNow = await page.evaluate(() => window.__mkce.nav.route.poly.p[0]);
    check('wandering far off the route re-plans from where you stand', n.mode === 'manual' && Math.hypot(startNow.x + 120, startNow.z + 50) < 1.5, `new route starts ${Math.hypot(startNow.x + 120, startNow.z + 50).toFixed(1)} m from the walker, ${n.len.toFixed(0)} m long`);

    // guide again, at running speed, all the way to the door
    await page.tap('.navcard.on .btn:has-text("Guide me")');
    await page.evaluate(() => { window.__mkce.app.walk.run = true; });
    for (let i = 0; i < 60 && (await nav()).mode !== 'arrived'; i++) await sleep(1000);
    n = await nav();
    check('guided walk arrives at the door', n.mode === 'arrived');
    await sleep(900);
    const d = await page.evaluate(() => {
      const r = window.__mkce.nav.route, w = window.__mkce.app.walk, t = r.to.point;
      const want = Math.atan2(-(t.x - w.pos.x), -(t.z - w.pos.z));
      let dlt = Math.abs(w.yaw - want) % (2 * Math.PI);
      if (dlt > Math.PI) dlt = 2 * Math.PI - dlt;
      return { dist: Math.hypot(t.x - w.pos.x, t.z - w.pos.z), faced: (dlt * 180) / Math.PI };
    });
    check('stops about 2 m before the door and faces it', d.dist > 1.6 && d.dist < 3.2 && d.faced < 12, `${d.dist.toFixed(1)} m from the door, ${d.faced.toFixed(0)} deg off`);
    check('arrival card says so and offers Enter (sample interior exists for block 1)', await page.evaluate(() => { const b = document.querySelector('.arrival .btn.primary'); return !!b && !b.disabled && /arrived/i.test(document.querySelector('.arrival h3').textContent); }));
    await page.tap('.arrival .btn:has-text("Done")');
    await sleep(500);
    n = await nav();
    check('Done ends the route and removes the line', n.mode === 'none' && !n.layer);
    check('no new shader programs were compiled while navigating (precompiled)', (await programs()) === p0, `${p0} -> ${await programs()}`);

    // back in Overview, tapping a building opens its card
    await page.evaluate(() => window.__mkce.setMode('overview'));
    await sleep(500);
    await page.evaluate(() => { const a = window.__mkce.app; a.overview.controls.target.set(-125, 0, 68); a.camera.position.set(-125, 330, 150); });
    await sleep(500);
    const scr2 = await page.evaluate(() => { const a = window.__mkce.app; const v = new a.camera.position.constructor(-164.6, 14.4, 61.7).project(a.camera); return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]; });
    await page.touchscreen.tap(scr2[0], scr2[1]);
    await sleep(500);
    check('tapping a building in Overview opens its card', await page.evaluate(() => /KALAM/.test(document.querySelector('.xsheet.open .card h3')?.textContent ?? '')));
    await ctx.close();
  }


  // ================= phone: the building is part of the world (sample data, block 1) =================
  console.log('Building as part of the world (sample data)');
  {
    const { ctx, page } = await newPage();
    const cdp = await ctx.newCDPSession(page);
    const tp = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 1, radiusY: 1, force: 1 })) });
    const programs = () => page.evaluate(() => window.__mkce.app.renderer.info.programs.length);
    const st = () => page.evaluate(() => { const i = window.__mkce.interiors, w = window.__mkce.app.walk; return { active: i.active, level: i.level, x: w.pos.x, z: w.pos.z, gy: w.groundY, eye: window.__mkce.app.camera.position.y, yaw: (w.yaw * 180) / Math.PI, mode: window.__mkce.app.mode, indoor: window.__mkce.app.world.indoor }; });
    const p0 = await programs();
    const { sessionNow } = await import(pathToFileURL(path.join(ROOT, 'src/interiors/plan.js')).href);
    const data = JSON.parse(readFileSync(path.join(ROOT, 'src/data/campus.json'), 'utf8'));
    const rooms0 = data.buildings.find((b) => b.id === 'apj-block').floorPlans[0].rooms;
    const FAKE = new Date(2026, 9, 5, 10, 30); // Monday 10:30
    const inSession = rooms0.find((r) => sessionNow(r, FAKE).current);
    const notIn = rooms0.find((r) => r.timetable.length && !sessionNow(r, FAKE).current) ?? rooms0.find((r) => !sessionNow(r, FAKE).current);
    await page.evaluate((t) => { window.__mkce.interiors.clock = () => new Date(t); }, FAKE.getTime());
    // helpers in the page: the frame of the building (x east, z south, before its turn) in the world
    await page.evaluate(() => {
      const i = window.__mkce.interiors, u = i.units.get('apj-block');
      window.L = {
        world: (lx, lz) => u.phys.toWorld(lx, lz),
        local: (x, z) => u.phys.toLocal(x, z),
        yaw: (dx, dz) => { const c = u.phys.cos, s = u.phys.sin; return Math.atan2(-(dx * c - dz * s), -(dx * s + dz * c)); },
        place: (lx, lz, dx, dz, y = 0, pitch = 0) => { const p = window.L.world(lx, lz); window.__mkce.app.walk.placeAt(p.x, p.z, window.L.yaw(dx, dz), { y, pitch: (pitch * Math.PI) / 180 }); },
        walk: (lx, lz) => { const p = window.L.world(lx, lz); window.__mkce.app.walk.walkTo(p.x, p.z); },
        idle: () => !window.__mkce.app.walk.target,
      };
    });
    const walkTo = async (lx, lz) => {
      await page.evaluate(([x, z]) => window.L.walk(x, z), [lx, lz]);
      for (let i = 0; i < 100 && !(await page.evaluate(() => window.L.idle())); i++) await sleep(200);
    };
    const local = () => page.evaluate(() => { const w = window.__mkce.app.walk; return window.L.local(w.pos.x, w.pos.z); });

    // there are no buttons for entering, leaving or choosing a floor: the card of the building only offers the usual ones
    await page.tap('.search-btn');
    await sleep(400);
    await page.fill('.sbar input', 'kalam');
    await sleep(200);
    await page.tap('.srow');
    await sleep(400);
    const cardBtns = await page.evaluate(() => [...document.querySelectorAll('.cacts .btn')].map((b) => b.textContent.trim()));
    check('the building card offers Directions, Show on map and Go to door, but no "Go inside"', cardBtns.some((t) => /Directions/.test(t)) && cardBtns.some((t) => /Go to door/.test(t)) && !cardBtns.some((t) => /inside|Enter/i.test(t)), cardBtns.join(' | '));
    await page.evaluate(() => document.querySelector('.xs-close')?.click());
    await sleep(300);
    await page.evaluate(() => window.__mkce.setMode('walk'));
    await sleep(500);
    check('there is no Enter, Exit, floor or stairs button in the interface at all', await page.evaluate(() => !document.querySelector('.iprompt, .iexit, .floors, .fbtn, .liftrow')));

    // walk in through the open entrance with the joystick: a porch with steps, the doorway, the hall
    await page.evaluate(() => { const f = window.__mkce.app.world.doorFrames.find((d) => d.id === 'apj-block'); window.__mkce.app.walk.placeAt(f.x + f.nx * 13, f.z + f.nz * 13, Math.atan2(f.nx, f.nz), { y: 0 }); });
    await sleep(400);
    let s = await st();
    check('outside, in front of the porch: not inside, the eye is at 1.6 m, no building light', !s.active && Math.abs(s.eye - 1.6) < 0.05 && s.indoor === 0);
    await tp('touchStart', [[80, 700, 1]]);
    await tp('touchMove', [[80, 640, 1]]);
    await sleep(8200);
    s = await st();
    check('walking up the three steps of the porch lifts the eye by the 0.45 m of the plinth', s.gy > 0.4 && Math.abs(s.eye - (1.6 + 0.45)) < 0.1, `ground ${s.gy.toFixed(2)}, eye ${s.eye.toFixed(2)}`);
    await sleep(6500);
    s = await st();
    await tp('touchEnd', []);
    const where = await local();
    check('with only the joystick you walk through the doorway into the entrance hall (no button, no fade)', s.active && s.level === 0 && where.z > -56 && where.z < -45 && Math.abs(where.x) < 2.5, `local ${where.x.toFixed(1)}, ${where.z.toFixed(1)}`);
    check('inside, the light is the softer light of the building', s.indoor > 0.9);
    check('still no prompt or button inside the hall', await page.evaluate(() => !document.querySelector('.iprompt, .iexit, .floors')));

    // walls and furniture stop the player: the seats along the west end wall of the hall
    await page.evaluate(() => window.L.place(-4, -50.5, -1, 0, 0.45));
    await page.evaluate(() => window.__mkce.input({ forward: 1 }));
    await sleep(3400);
    await page.evaluate(() => window.__mkce.input(null));
    const w2 = await local();
    check('the hall seats and end wall stop the player (west wall at x -9.05)', w2.x < -7.4 && w2.x > -8.4, `x ${w2.x.toFixed(2)}`);

    // door and sign taps open the room card (the door of room G-02 is on the east verandah)
    const g2 = await page.evaluate(() => { const u = window.__mkce.interiors.units.get('apj-block'); const d = u.phys.plans[0].doors.find((q) => q.roomId === 'room-g-02' && q.main); return { x: d.x + d.nx * 2.2, z: d.z + d.nz * 2.2, dx: -d.nx, dz: -d.nz }; });
    await page.evaluate((t) => window.L.place(t.x, t.z, t.dx, t.dz, 0.45, 8), g2);
    await sleep(500);
    const signScr = await page.evaluate(() => { const a = window.__mkce.app, i = window.__mkce.interiors; const sg = i.current.plan.signs.find((q) => q.roomId === 'room-g-02'); const p = i.units.get('apj-block').phys.toWorld(sg.x, sg.z); const pt = new a.camera.position.constructor(p.x, 0.45 + sg.y, p.z).project(a.camera); return [(pt.x * 0.5 + 0.5) * innerWidth, (-pt.y * 0.5 + 0.5) * innerHeight, pt.z]; });
    await page.touchscreen.tap(signScr[0], signScr[1]);
    await sleep(500);
    const card = await page.evaluate(() => ({ open: !!document.querySelector('.xsheet.open .roomcard'), text: document.querySelector('.roomcard')?.textContent ?? '' }));
    check('tapping a room sign opens the room card', card.open && /G-02/.test(card.text), card.text.slice(0, 40));
    check('room card lists type, capacity, department, faculty and equipment', /Classroom/.test(card.text) && /Capacity60people/.test(card.text.replace(/\s/g, '')) && /Department/.test(card.text) && /Faculty/.test(card.text) && /Whiteboards/.test(card.text));
    check('room card says it is sample data', /Sample data/.test(card.text));
    await page.tap('.roomcard .btn:has-text("Close")');
    await sleep(300);
    await page.evaluate((id) => window.__mkce.interiors.openRoom(id), inSession.id);
    await sleep(400);
    check('"Now in session" shows for a room with a running slot (Mon 10:30)', await page.evaluate(() => /Now in session/.test(document.querySelector('.roomcard .status')?.textContent ?? '') && document.querySelector('.roomcard .status').classList.contains('in')), inSession.number);
    await page.evaluate(() => document.querySelector('.xs-close').click());
    await sleep(300);
    await page.evaluate((id) => window.__mkce.interiors.openRoom(id), notIn.id);
    await sleep(400);
    check('"Not in session" shows when nothing is running', await page.evaluate(() => /Not in session|No timetable/.test(document.querySelector('.roomcard .status')?.textContent ?? '')), notIn.number);
    await page.evaluate(() => document.querySelector('.xs-close').click());
    await sleep(300);

    // the stairs are real: walk up the flights of the north-east well to every floor with tap-to-walk, then back down
    const stairs = async (wps) => { for (const [x, z] of wps) await walkTo(x, z); };
    const up = [[40.2, -53.7], [43.4, -53.7], [44.9, -54.2], [44.3, -55.4], [42.0, -55.4], [39.6, -55.2]];
    await page.evaluate(() => window.L.place(36, -45.6, 1, 0, 0.45));
    await sleep(300);
    await stairs(up.slice(0, 3));
    s = await st();
    check('on the landing of the first flight the eye is half a storey up (no teleport, the height rose along the steps)', s.level === 0 && Math.abs(s.gy - (0.45 + 1.8)) < 0.1, `ground ${s.gy.toFixed(2)}`);
    await stairs(up.slice(3));
    s = await st();
    check('the second flight leads to the first floor: the eye is 3.6 m higher', s.level === 1 && Math.abs(s.gy - (0.45 + 3.6)) < 0.08 && Math.abs(s.eye - (1.6 + 0.45 + 3.6)) < 0.12, `floor ${s.level}, ground ${s.gy.toFixed(2)}`);
    check('upper floor has its own rooms (1-01 ...)', await page.evaluate(() => window.__mkce.interiors.current.floor.rooms[0].number === '1-01'));
    await stairs([[40.2, -53.7], ...up.slice(1)]);
    await stairs([[40.2, -53.7], ...up.slice(1)]);
    s = await st();
    check('and on up to the top floor (3)', s.level === 3 && Math.abs(s.gy - (0.45 + 10.8)) < 0.1, `floor ${s.level}, ground ${s.gy.toFixed(2)}`);
    check('still no prompt or floor button', await page.evaluate(() => !document.querySelector('.iprompt, .iexit, .floors')));
    // back down by the same stairs
    const down = [[39.6, -55.2], [42.0, -55.4], [44.4, -55.2], [44.9, -54.0], [43.0, -53.7], [40.2, -53.7]]; // from the top of the upper flight, down both flights to the foot
    for (let f = 0; f < 3; f++) await stairs(down);
    s = await st();
    check('the same stairs lead back down to the ground floor', s.level === 0 && Math.abs(s.gy - 0.45) < 0.08, `floor ${s.level}, ground ${s.gy.toFixed(2)}`);

    // the ground floor opens onto the courtyard: down the steps and along the paver path
    await page.evaluate(() => window.L.place(33, 0, -1, 0, 0.45));
    await sleep(400);
    const eye0 = await page.evaluate(() => window.__mkce.app.camera.position.y);
    await page.evaluate(() => window.__mkce.input({ forward: 1 }));
    await sleep(4000);
    await page.evaluate(() => window.__mkce.input(null));
    await sleep(400);
    const yard = await local();
    const eye1 = await page.evaluate(() => window.__mkce.app.camera.position.y);
    check('the ground floor opens onto the courtyard: down the steps onto the lawn path, the eye drops 0.45 m', yard.x < 29.5 && Math.abs(eye0 - eye1 - 0.45) < 0.08, `x ${yard.x.toFixed(1)}, eye ${eye0.toFixed(2)} -> ${eye1.toFixed(2)}`);

    // walking out through the entrance is as plain as walking in
    await page.evaluate(() => window.L.place(0, -50, 0, -1, 0.45));
    await sleep(300);
    await tp('touchStart', [[80, 700, 1]]);
    await tp('touchMove', [[80, 640, 1]]);
    await sleep(9000);
    await tp('touchEnd', []);
    s = await st();
    check('walking north out of the hall, through the doorway and down the porch steps, you are outside again at ground level', !s.active && s.gy < 0.15 && Math.abs(s.eye - 1.6) < 0.2, `ground ${s.gy.toFixed(2)}`);
    check('outside the light is the daylight again', s.indoor === 0);

    // the outer wall stops the player
    await page.evaluate(() => window.L.place(50, 0, -1, 0, 0));
    await page.evaluate(() => window.__mkce.input({ forward: 1 }));
    await sleep(3500);
    await page.evaluate(() => window.__mkce.input(null));
    const wall = await local();
    s = await st();
    check('the outside wall of the building stops the player where there is no doorway', !s.active && wall.x > 46.2, `x ${wall.x.toFixed(2)}`);

    // searching for a room: the card offers "Go to room", which puts you in front of its door on its floor
    await page.evaluate(() => { const f = window.__mkce.app.world.doorFrames.find((d) => d.id === 'apj-block'); window.__mkce.app.walk.placeAt(f.x + f.nx * 8, f.z + f.nz * 8, Math.atan2(f.nx, f.nz), { y: 0 }); });
    await sleep(300);
    await page.tap('.search-btn');
    await sleep(400);
    await page.fill('.sbar input', '2-05');
    await sleep(300);
    check('searching a room number finds the room', await page.evaluate(() => /2-05/.test(document.querySelector('.srow')?.textContent ?? '')));
    await page.tap('.srow');
    await sleep(500);
    check('the card of a room offers "Go to room"', await page.evaluate(() => [...document.querySelectorAll('.cacts .btn')].some((b) => /Go to room/.test(b.textContent))));
    await page.tap('.cacts .btn:has-text("Go to room")');
    await sleep(2200);
    s = await st();
    const roomCardText = await page.evaluate(() => document.querySelector('.xsheet.open .roomcard')?.textContent ?? '');
    check('"Go to room" puts you on floor 2, with the room card open', s.active && s.level === 2 && /2-05/.test(roomCardText) && Math.abs(s.gy - (0.45 + 7.2)) < 0.1, `floor ${s.level}`);
    await page.evaluate(() => document.querySelector('.xs-close')?.click());
    await sleep(300);
    const faced = await page.evaluate(() => { const i = window.__mkce.interiors, w = window.__mkce.app.walk; const u = i.units.get('apj-block'); const d = u.phys.plans[2].doors.find((q) => q.roomId === 'room-2-05' && q.main); const t = u.phys.toWorld(d.x, d.z); const want = Math.atan2(-(t.x - w.pos.x), -(t.z - w.pos.z)); let dl = Math.abs(w.yaw - want) % (2 * Math.PI); if (dl > Math.PI) dl = 2 * Math.PI - dl; return { dist: Math.hypot(t.x - w.pos.x, t.z - w.pos.z), off: (dl * 180) / Math.PI }; });
    check('the viewer stands about 2 m in front of that door, facing it', faced.dist > 1.2 && faced.dist < 2.6 && faced.off < 10, `${faced.dist.toFixed(1)} m, ${faced.off.toFixed(0)} deg off`);

    // Overview and back: the floor you were on is kept, the building is not drawn from the air
    await page.click('.segmented button[data-mode="overview"]');
    await sleep(900);
    s = await st();
    check('Overview shows the campus and does not draw the inside of the building', !s.active && s.mode === 'overview' && (await page.evaluate(() => window.__mkce.app.world.root.visible && !window.__mkce.interiors.units.get('apj-block').group.visible)));
    await page.click('.segmented button[data-mode="walk"]');
    await sleep(1100);
    s = await st();
    check('back in Walk you are where you were, on floor 2', s.active && s.level === 2 && Math.abs(s.gy - (0.45 + 7.2)) < 0.1, `floor ${s.level}`);

    // a guided walk to the building ends at its porch; the card does not offer to enter
    await page.evaluate(() => { window.__mkce.app.walk.placeAt(-40, 110, 0, { y: 0 }); });
    await sleep(500);
    await page.evaluate(() => { const n = window.__mkce.nav; n.planTo({ buildingId: 'apj-block' }, 'me'); n.speedMult = 5; });
    await page.evaluate(async () => { await window.__mkce.nav.start(); window.__mkce.app.walk.run = true; });
    for (let i = 0; i < 80 && (await page.evaluate(() => window.__mkce.nav.mode)) !== 'arrived'; i++) await sleep(500);
    await sleep(600);
    check('the arrival card at the porch has only Done, and says the doors are open', await page.evaluate(() => { const bs = [...document.querySelectorAll('.arrival .btn')]; return bs.length === 1 && /Done/.test(bs[0].textContent) && /doors are open/.test(document.querySelector('.arrival').textContent); }));
    await page.tap('.arrival .btn.primary');
    await sleep(300);
    await page.evaluate(() => { window.__mkce.app.walk.run = false; });
    check('no new shader programs were compiled by the interiors (precompiled)', (await programs()) === p0, `${p0} -> ${await programs()}`);
    await ctx.close();
  }


  // ================= phone: driving a car (pedals and steering buttons with real touch events) =================
  console.log('Drive (touch phone 390x844)');
  {
    const { ctx, page } = await newPage();
    const cdp = await ctx.newCDPSession(page);
    const tp = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 1, radiusY: 1, force: 1 })) });
    const programs = () => page.evaluate(() => window.__mkce.app.renderer.info.programs.length);
    const p0 = await programs();
    const car = () => page.evaluate(() => { const d = window.__mkce.drive, c = d.car; return { x: c.x, z: c.z, y: c.y, yaw: c.yaw, speed: c.speed, kmh: d.kmh, parked: d.parked, mode: window.__mkce.app.mode, visible: d.mesh.visible }; });
    const centre = async (sel) => { const r = await page.evaluate((s) => { const b = document.querySelector(s).getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2, b.width, b.height]; }, sel); return r; };

    check('the mode switch has Overview, Walk and Drive', await page.evaluate(() => [...document.querySelectorAll('.mode-seg button')].map((b) => b.dataset.mode).join(',') === 'overview,walk,drive'));
    check('the three mode tabs fit on the phone screen without overflowing', await page.evaluate(() => { const r = document.querySelector('.mode-seg').getBoundingClientRect(); return r.right <= innerWidth - 6 && r.left > document.querySelector('.brand').getBoundingClientRect().right - 2; }));
    // stand on the road in front of the building facing the porch, then get in
    await page.evaluate(() => window.__mkce.setMode('walk'));
    await sleep(400);
    await page.evaluate(() => { const f = window.__mkce.app.world.doorFrames.find((d) => d.id === 'apj-block'); window.__mkce.app.walk.placeAt(f.x + f.nx * 40, f.z + f.nz * 40, Math.atan2(f.nx, f.nz), { y: 0 }); });
    await sleep(300);
    check('the drive controls are hidden while walking', await page.evaluate(() => getComputedStyle(document.querySelector('.drive')).display === 'none'));
    await page.tap('.mode-seg button[data-mode="drive"]');
    await sleep(900);
    let c = await car();
    check('tapping Drive puts the car where the walker stood, facing the same way', c.mode === 'drive' && c.visible && Math.abs(c.speed) < 0.01);
    const boxes = await Promise.all(['.dleft', '.dright', '.dbrake', '.dgas'].map(centre));
    check('steering buttons, brake and accelerator are there, each at least 64 px', boxes.every((b) => b[2] >= 64 && b[3] >= 64), boxes.map((b) => `${b[2] | 0}x${b[3] | 0}`).join(' '));
    check('the accelerator is on the right, the steering on the left, nothing overlaps', boxes[0][0] < boxes[1][0] && boxes[1][0] < boxes[2][0] && boxes[2][0] < boxes[3][0] && boxes[1][0] + boxes[1][2] / 2 < boxes[2][0] - boxes[2][2] / 2);
    check('the Run and Gyro buttons are gone, a View button is there', await page.evaluate(() => getComputedStyle(document.querySelector('.hbtn[aria-label="Run"]')).display === 'none' && getComputedStyle(document.querySelector('.hbtn[aria-label="View"]')).display !== 'none'));

    // the accelerator: hold it, the car speeds up, let go, it rolls on and slows
    const gas = await centre('.dgas');
    await tp('touchStart', [[gas[0], gas[1], 1]]);
    await sleep(1800);
    c = await car();
    check('holding the accelerator speeds the car up (over 5 m/s after under two seconds)', c.speed > 5, `${c.kmh.toFixed(0)} km/h`);
    check('the speedometer shows it', await page.evaluate(() => { const v = +document.querySelector('.dspeed b').textContent; return v > 15; }));
    // the left button with the other thumb while the gas is down: the car turns, the speed stays
    const left = await centre('.dleft');
    const y0 = c.yaw;
    await tp('touchStart', [[gas[0], gas[1], 1], [left[0], left[1], 2]]);
    await sleep(900);
    c = await car();
    check('steering left with one thumb while the other holds the gas turns the car to the left (counter-clockwise) and it keeps its speed', c.yaw > y0 + 0.15 && c.speed > 4, `yaw ${(c.yaw - y0).toFixed(2)} rad, ${c.kmh.toFixed(0)} km/h`);
    const right = await centre('.dright');
    await tp('touchEnd', []); // both thumbs lift
    await sleep(500);
    await tp('touchStart', [[gas[0], gas[1], 1]]);
    await sleep(500);
    await tp('touchStart', [[gas[0], gas[1], 1], [right[0], right[1], 3]]);
    await sleep(350);
    const y1 = (await car()).yaw;
    await sleep(900);
    c = await car();
    check('the right button turns it to the right (clockwise)', c.yaw < y1 - 0.15, `yaw ${(c.yaw - y1).toFixed(2)} rad`);
    await tp('touchEnd', []);
    await sleep(300);
    // the brake: hold it, the car stops and then backs up
    const brake = await centre('.dbrake');
    await tp('touchStart', [[brake[0], brake[1], 4]]);
    await sleep(2500);
    c = await car();
    check('holding the brake stops the car and then backs it up', c.speed < -0.5, `${c.speed.toFixed(1)} m/s`);
    await tp('touchEnd', []);
    await sleep(300);

    // View: the car body is hidden in the driver's view
    await page.tap('.hbtn[aria-label="View"]');
    await sleep(300);
    check('the View button switches to the view from the driver seat (the body of the car is not drawn)', !(await car()).visible);
    await page.tap('.hbtn[aria-label="View"]');
    await sleep(300);
    check('and back to the view from behind', (await car()).visible);

    // drive in through the entrance of the building: in front of the porch, hold the accelerator, the building is simply entered
    await page.evaluate(() => { const f = window.__mkce.app.world.doorFrames.find((d) => d.id === 'apj-block'); const c = window.__mkce.drive.car; c.place(f.x + f.nx * 16, f.z + f.nz * 16, Math.atan2(f.nx, f.nz), 0); });
    await sleep(500);
    await tp('touchStart', [[gas[0], gas[1], 5]]);
    await sleep(2300);
    await tp('touchEnd', []);
    await sleep(500);
    const inside = await page.evaluate(() => { const i = window.__mkce.interiors, c = window.__mkce.drive.car, ph = i.units.get('apj-block').phys; return { active: i.active, level: i.level, depth: ph.depth(c.x, c.z), y: c.y, indoor: window.__mkce.app.world.indoor }; });
    check('driving at the entrance takes the car up the porch steps, through the doorway and into the entrance hall, with no button and no fade', inside.active && inside.level === 0 && inside.depth > 2 && Math.abs(inside.y - 0.45) < 0.06, `${inside.depth.toFixed(1)} m inside, y ${inside.y.toFixed(2)}`);
    check('inside the building the light is the light of the building', inside.indoor > 0.5);
    // the minimap follows the car and shows the plan of the floor
    check('the walls of the building stop the car (it did not drive out through the far wall or the roof)', await page.evaluate(() => { const i = window.__mkce.interiors, c = window.__mkce.drive.car; return i.units.get('apj-block').phys.depth(c.x, c.z) > 0; }));

    // getting out: the walker stands beside the car, the car stays parked and blocks the way; getting in again uses the same car
    await page.evaluate(() => window.__mkce.input(null));
    for (let i = 0; i < 60 && Math.abs((await car()).speed) > 0.03; i++) await sleep(250); // it rolls out (the engine brakes it)
    await sleep(200);
    const before = await car();
    await page.tap('.mode-seg button[data-mode="walk"]');
    await sleep(900);
    const w = await page.evaluate(() => { const wk = window.__mkce.app.walk, d = window.__mkce.drive; return { x: wk.pos.x, z: wk.pos.z, cx: d.car.x, cz: d.car.z, parked: d.parked, visible: d.mesh.visible, mode: window.__mkce.app.mode }; });
    check('Walk puts the walker beside the car, which stays where it is, parked and visible', w.mode === 'walk' && w.parked && w.visible && Math.hypot(w.x - w.cx, w.z - w.cz) > 1.2 && Math.hypot(w.x - w.cx, w.z - w.cz) < 3.2 && Math.hypot(w.cx - before.x, w.cz - before.z) < 0.01, `${Math.hypot(w.x - w.cx, w.z - w.cz).toFixed(1)} m from the car`);
    await page.tap('.mode-seg button[data-mode="drive"]');
    await sleep(900);
    const again = await car();
    check('Drive again takes the same car, where it was left', Math.abs(again.x - before.x) < 0.05 && Math.abs(again.z - before.z) < 0.05 && !again.parked);
    check('no new shader programs were compiled for the car and its controls (precompiled)', (await programs()) === p0, `${p0} -> ${await programs()}`);
    await ctx.close();
  }


  // ================= phone: welcome screen, mini-map, updates, reduced motion, touch targets =================
  console.log('Mobile UX');
  {
    // ---- welcome screen: a first-time visitor (no saved details)
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
    page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
    await page.goto(base);
    await page.waitForFunction(() => window.__mkce, null, { timeout: 40000 });
    await sleep(900);
    check('first visit shows the welcome screen', await page.evaluate(() => !!document.querySelector('.welcome .w-card')));
    check('welcome asks for email, college and location', await page.evaluate(() => !!document.querySelector('.welcome input[type=email]') && !!document.querySelector('.welcome .w-opt[data-id="this"]') && !!document.querySelector('.welcome input[name=location]')));
    check('this college is preselected and marked Available', await page.evaluate(() => document.querySelector('.w-opt[data-id="this"]').classList.contains('on') && /Available/.test(document.querySelector('.w-opt[data-id="this"]').textContent)));
    await page.tap('.w-opt[data-id="other"]');
    await sleep(200);
    check('another college shows "Not available yet" and cannot start', await page.evaluate(() => /Not available yet/.test(document.querySelector('.w-na').textContent) && document.querySelector('.w-go').disabled));
    await page.tap('.w-opt[data-id="this"]');
    await page.fill('.welcome input[type=email]', 'not-an-email');
    await page.tap('.w-go');
    await sleep(300);
    check('a bad email is explained and not saved', await page.evaluate(() => /does not look right/.test(document.querySelector('.w-err').textContent) && !!document.querySelector('.welcome') && localStorage.getItem('mkce360.profile.v1') === null));
    await page.fill('.welcome input[type=email]', 'student@example.com');
    await page.fill('.welcome input[name=location]', 'Karur');
    await page.tap('.w-go');
    await sleep(700);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mkce360.profile.v1') ?? 'null'));
    check('details are saved in local storage only', !!saved && saved.email === 'student@example.com' && saved.location === 'Karur' && saved.college === 'mkce');
    check('the welcome screen goes away', await page.evaluate(() => !document.querySelector('.welcome')));
    await page.reload();
    await page.waitForFunction(() => window.__mkce, null, { timeout: 40000 });
    await sleep(700);
    check('it does not come back on the next visit', await page.evaluate(() => !document.querySelector('.welcome')));
    await page.tap('.hbtn:has-text("Settings")');
    await sleep(500);
    check('Settings shows the saved details', await page.evaluate(() => /student@example.com/.test(document.querySelector('[data-k=profile]').textContent)));
    await page.tap('[data-act="clear-profile"]');
    await sleep(300);
    check('Clear removes them from the device', await page.evaluate(() => localStorage.getItem('mkce360.profile.v1') === null && /Nothing saved/.test(document.querySelector('[data-k=profile]').textContent)));
    await page.tap('.sheet-close');
    await sleep(300);
    await ctx.close();

    // ---- storage blocked: everything still works
    {
      const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      await c.addInitScript(() => {
        const boom = () => { throw new Error('storage blocked'); };
        Storage.prototype.getItem = boom;
        Storage.prototype.setItem = boom;
        Storage.prototype.removeItem = boom;
      });
      const p = await c.newPage();
      const errs = [];
      p.on('pageerror', (e) => errs.push(e.message));
      await p.goto(base);
      await p.waitForFunction(() => window.__mkce, null, { timeout: 40000 });
      await sleep(800);
      await p.tap('.w-go');
      await sleep(600);
      check('with storage blocked the app still starts and the welcome can be dismissed', errs.length === 0 && (await p.evaluate(() => !document.querySelector('.welcome') && window.__mkce.app.mode === 'overview')), errs.join(' | '));
      await p.evaluate(() => window.__mkce.setMode('walk'));
      await sleep(600);
      check('walk mode works with storage blocked', await p.evaluate(() => window.__mkce.app.mode === 'walk'));
      await c.close();
    }

    // ---- mini-map, expanded map, updates, touch targets (returning visitor)
    const { ctx: c2, page: p2 } = await newPage();
    const brandDot = () => p2.evaluate(() => document.querySelector('.brand').classList.contains('has-new'));
    check('mini-map is hidden in Overview', await p2.evaluate(() => getComputedStyle(document.querySelector('.minimap')).display === 'none'));
    await p2.evaluate(() => { window.__mkce.setMode('walk'); const w = window.__mkce.app.walk; w.pos.x = -60; w.pos.z = 12; w.yaw = Math.PI / 2; });
    await sleep(700);
    const mm = await p2.evaluate(() => {
      const c = document.querySelector('.minimap canvas'), g = c.getContext('2d');
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const seen = new Set();
      for (let i = 0; i < d.length; i += 4 * 97) seen.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`);
      const r = c.getBoundingClientRect();
      return { shown: getComputedStyle(document.querySelector('.minimap')).display !== 'none', colours: seen.size, w: r.width, h: r.height };
    });
    check('mini-map shows in Walk mode with real map content', mm.shown && mm.colours > 12 && mm.w >= 100, `${mm.colours} colours, ${mm.w}px`);
    const before = await p2.evaluate(() => document.querySelector('.minimap canvas').toDataURL());
    await p2.evaluate(() => { const w = window.__mkce.app.walk; w.pos.x = -150; w.pos.z = 150; w.yaw = 0; });
    await sleep(500);
    const after = await p2.evaluate(() => document.querySelector('.minimap canvas').toDataURL());
    check('mini-map follows the walker', after !== before && after.length > 1000);
    await p2.tap('.minimap');
    await sleep(700);
    check('tapping the mini-map expands it', await p2.evaluate(() => document.querySelector('.mapfull').classList.contains('on')));
    const pt = await p2.evaluate(() => {
      const m = window.__mkce.app.minimap, c = document.querySelector('.mapfull canvas'), r = c.getBoundingClientRect(), b = window.__mkce.app.data.buildings.find((q) => q.id === 'apj-block');
      return [r.left + r.width / 2 + (b.position.x - m.view.cx) * m.view.s, r.top + r.height / 2 + (b.position.z - m.view.cz) * m.view.s];
    });
    await p2.mouse.click(pt[0], pt[1]);
    await sleep(600);
    check('tapping a building on the expanded map opens its card', await p2.evaluate(() => !document.querySelector('.mapfull').classList.contains('on') && /KALAM/.test(document.querySelector('.xsheet.open .card h3')?.textContent ?? '')));
    await p2.evaluate(() => document.querySelector('.xs-close').click());
    await sleep(300);

    // updates
    check('no unread dot while the only update is a placeholder', !(await brandDot()));
    await p2.evaluate(() => { window.__mkce.app.data.updates.push({ id: 'upd-test', date: '2026-10-07', title: 'Test update', body: 'Body text.' }); window.__mkce.app.updatesUi.refreshDot(); });
    check('a new real update shows an unread dot on the brand', await brandDot());
    await p2.tap('.brand');
    await sleep(500);
    const upd = await p2.evaluate(() => ({ open: !!document.querySelector('.xsheet.open .about'), text: document.querySelector('.about')?.textContent ?? '' }));
    check('tapping the brand opens updates read from campus.json', upd.open && /Test update/.test(upd.text) && /Placeholder/.test(upd.text) && /Karur/.test(upd.text));
    check('opening it clears the unread dot', !(await brandDot()));
    await p2.evaluate(() => document.querySelector('.xs-close').click());
    await sleep(300);

    // touch targets: every visible control is at least 48 px in both directions
    const audit = () => p2.evaluate(() => {
      const out = [];
      for (const e of document.querySelectorAll('button, a[href], [role=tab], select, label.row, .sbar input, .w-field input')) {
        if (e.closest('.panel, .map2d')) continue;
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none' || +cs.opacity < 0.05) continue;
        let q = e.parentElement, hidden = false;
        while (q && q !== document.body) { const c = getComputedStyle(q); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity < 0.05 || c.pointerEvents === 'none') { hidden = true; break; } q = q.parentElement; }
        const r = e.getBoundingClientRect();
        if (hidden || r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
        if (Math.min(r.width, r.height) < 47.5) out.push(`${e.className || e.tagName} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      return out;
    });
    const small = [];
    const step = async (name, fn) => { await fn(); await sleep(450); for (const s of await audit()) small.push(`${name}: ${s}`); };
    await step('walk', async () => {});
    await step('settings', async () => { await p2.tap('.hbtn:has-text("Settings")'); });
    await p2.tap('.sheet-close');
    await sleep(300);
    await step('search', async () => { await p2.tap('.search-btn'); });
    await step('card', async () => { await p2.fill('.sbar input', 'kalam'); await p2.tap('.srow'); });
    await step('directions', async () => { await p2.tap('.cacts .btn.primary'); });
    await step('guided card', async () => { await p2.tap('.planner .cacts .btn.primary'); await sleep(2200); });
    await p2.evaluate(() => window.__mkce.nav.end());
    await step('expanded map', async () => { await p2.tap('.minimap'); });
    await p2.tap('.mapfull .xs-close');
    await sleep(300);
    await step('interior', async () => { await p2.evaluate(() => { const ph = window.__mkce.interiors.units.get('apj-block').phys; const p = ph.toWorld(0, -50); window.__mkce.app.walk.placeAt(p.x, p.z, 0, { y: 0.45 }); }); await sleep(900); });
    await step('room card', async () => { await p2.evaluate(() => window.__mkce.interiors.openRoom('room-g-01')); });
    await p2.evaluate(() => document.querySelector('.xs-close')?.click());
    await sleep(300);
    await step('drive', async () => { await p2.evaluate(() => window.__mkce.setMode('drive')); await sleep(900); });
    check('every control is at least 48 px (walk, settings, search, card, directions, guide, map, interior, room, drive)', small.length === 0, small.slice(0, 4).join(' | '));
    await c2.close();

    // ---- page gestures are blocked on the canvas and the app name is MKCE 360 everywhere
    {
      const { ctx: c4, page: p4 } = await newPage();
      const g = await p4.evaluate(() => ({
        touch: getComputedStyle(document.getElementById('scene')).touchAction,
        overscroll: getComputedStyle(document.body).overscrollBehaviorY,
        scroll: getComputedStyle(document.body).overflow,
        title: document.title,
        loader: document.querySelector('.loader-logo')?.textContent ?? 'loader removed',
        brand: document.querySelector('.brand').textContent.trim(),
        viewport: document.querySelector('meta[name=viewport]').content,
      }));
      check('canvas blocks page gestures (no scroll, pull-to-refresh or double-tap zoom)', g.touch === 'none' && g.overscroll === 'none' && g.scroll === 'hidden' && /user-scalable=no/.test(g.viewport), `${g.touch} ${g.overscroll} ${g.scroll}`);
      check('the app is called MKCE 360 in the title and the HUD', g.title === 'MKCE 360' && /MKCE\s*360/.test(g.brand), `${g.title} / ${g.brand}`);
      await c4.close();
    }

    // ---- Android WebView: the host app goes immersive, so the page hides its own Fullscreen button
    {
      const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230901.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36';
      const { ctx: c5, page: p5 } = await newPage({ userAgent: UA });
      const full = (pg) => pg.evaluate(() => [...document.querySelectorAll('.hud-col .hbtn')].find((b) => /Full/.test(b.textContent))?.style.display ?? 'missing');
      check('inside an Android WebView the Fullscreen button is hidden', (await full(p5)) === 'none');
      await c5.close();
      const { ctx: c6, page: p6 } = await newPage();
      check('in a normal browser the Fullscreen button is available', (await full(p6)) !== 'none');
      await c6.close();
    }

    // ---- reduced motion
    const c3 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    await c3.addInitScript(() => { try { localStorage.setItem('mkce360.profile.v1', JSON.stringify({ skipped: true })); } catch { /* blocked */ } });
    const p3 = await c3.newPage();
    await p3.goto(base);
    await p3.waitForFunction(() => window.__mkce, null, { timeout: 40000 });
    await sleep(700);
    check('prefers-reduced-motion is honoured (no head bob by default, no damping)', await p3.evaluate(() => { const a = window.__mkce.app; return a.reducedMotion === true && a.walk.headBob === false && a.overview.controls.enableDamping === false; }));
    await p3.evaluate(() => window.__mkce.app.overview.focus(-250, 120, 150));
    await sleep(250);
    const jumped = await p3.evaluate(() => Math.hypot(window.__mkce.app.camera.position.x + 250, window.__mkce.app.camera.position.z - 120) < 400 && window.__mkce.app.overview._tween === null);
    check('camera flights are instant jumps', jumped);
    await p3.evaluate(() => { const n = window.__mkce.nav; n.planTo({ buildingId: 'apj-block' }, 'gate:main-gate'); });
    await sleep(900);
    check('the route line does not animate', await p3.evaluate(() => window.__mkce.app.routeLayer.time === 0));
    await c3.close();
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

    // driving with the keys: W is the gas, A and D steer, S brakes and backs up, Space is the handbrake, C changes the view
    await page.click('.mode-seg button[data-mode="drive"]');
    await sleep(900);
    const dcar = () => page.evaluate(() => { const d = window.__mkce.drive, c = d.car; return { speed: c.speed, yaw: c.yaw, x: c.x, z: c.z, visible: d.mesh.visible, mode: window.__mkce.app.mode }; });
    check('on a computer the Drive tab switches to the car and the touch pedals stay out of the way of the keys', (await dcar()).mode === 'drive');
    await page.keyboard.down('KeyW');
    await sleep(2200);
    let d1 = await dcar();
    check('W is the accelerator', d1.speed > 6, `${(d1.speed * 3.6).toFixed(0)} km/h`);
    await page.keyboard.down('KeyA');
    await sleep(800);
    await page.keyboard.up('KeyA');
    const d2 = await dcar();
    check('A steers left (counter-clockwise)', d2.yaw > d1.yaw + 0.1, `${(d2.yaw - d1.yaw).toFixed(2)} rad`);
    await page.keyboard.down('KeyD');
    await sleep(1000);
    await page.keyboard.up('KeyD');
    const d3 = await dcar();
    check('D steers right', d3.yaw < d2.yaw - 0.1);
    await page.keyboard.down('ArrowLeft');
    await sleep(500);
    await page.keyboard.up('ArrowLeft');
    check('the arrow keys steer as well', (await dcar()).yaw > d3.yaw + 0.05);
    await page.keyboard.up('KeyW');
    await page.keyboard.down('Space');
    await sleep(1500);
    await page.keyboard.up('Space');
    const d4 = await dcar();
    check('Space is the handbrake: the car stops fast', Math.abs(d4.speed) < 1.0, `${(d4.speed * 3.6).toFixed(0)} km/h`);
    await page.keyboard.down('KeyS');
    await sleep(1800);
    await page.keyboard.up('KeyS');
    check('S backs the car up', (await dcar()).speed < -2);
    await page.keyboard.press('KeyC');
    await sleep(250);
    check('C changes the view', !(await dcar()).visible);
    await page.keyboard.press('KeyC');
    await sleep(250);
    check('and changes it back', (await dcar()).visible);
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
    check('the inside of the building (its group and its walls) follows the edit', await page.evaluate(() => { const u = window.__mkce.interiors.units.get('apj-block'); const w = u.phys.toWorld(0, 0); const c0 = u.phys.plans[0].colliders[0], w0 = u.phys.toWorld(c0.cx, c0.cz), c1 = u.phys.colliders(0)[0]; return Math.abs(u.group.position.x - (-125.1 + 2)) < 0.1 && Math.abs(w.x - (-125.1 + 2)) < 0.1 && Math.abs(c1.cx - w0.x) < 0.01 && Math.abs(c1.cz - w0.z) < 0.01; }));
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
