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
    check('typing "hostel" lists the three hostels', hostels.length === 3 && hostels.every((h) => /hostel/i.test(h)), hostels.join(' | '));
    await page.fill('.sbar input', '');
    await page.tap('.schip:has-text("Sports")');
    await sleep(200);
    check('category chip filters the list', (await rows()).length >= 5 && (await page.evaluate(() => [...document.querySelectorAll('.srow .stxt small')].every((e) => /sports/i.test(e.textContent)))));
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
    check('Directions plans the route from the main gate to the door (~102 m)', n.mode === 'preview' && Math.abs(n.len - 102.5) < 3, `${n.len.toFixed(1)} m`);
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
    await page.evaluate(() => { const w = window.__mkce.app.walk; w.pos.x = -40; w.pos.z = 110; w.cancelTarget(); });
    await sleep(3600);
    n = await nav();
    const startNow = await page.evaluate(() => window.__mkce.nav.route.poly.p[0]);
    check('wandering far off the route re-plans from where you stand', n.mode === 'manual' && Math.hypot(startNow.x + 40, startNow.z - 110) < 1.5, `new route starts ${Math.hypot(startNow.x + 40, startNow.z - 110).toFixed(1)} m from the walker, ${n.len.toFixed(0)} m long`);

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
    const scr2 = await page.evaluate(() => { const a = window.__mkce.app; const v = new a.camera.position.constructor(-150, 15, 60).project(a.camera); return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]; });
    await page.touchscreen.tap(scr2[0], scr2[1]);
    await sleep(500);
    check('tapping a building in Overview opens its card', await page.evaluate(() => /KALAM/.test(document.querySelector('.xsheet.open .card h3')?.textContent ?? '')));
    await ctx.close();
  }


  // ================= phone: interiors (sample data, block 1) =================
  console.log('Interiors (sample data)');
  {
    const { ctx, page } = await newPage();
    const cdp = await ctx.newCDPSession(page);
    const tp = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 1, radiusY: 1, force: 1 })) });
    const programs = () => page.evaluate(() => window.__mkce.app.renderer.info.programs.length);
    const st = () => page.evaluate(() => { const i = window.__mkce.interiors, w = window.__mkce.app.walk; return { active: i.active, level: i.level, x: w.pos.x, z: w.pos.z, yaw: (w.yaw * 180) / Math.PI, mode: window.__mkce.app.mode, prompt: i.prompt?.kind ?? null, outdoors: window.__mkce.app.world.root.visible }; });
    const p0 = await programs();
    const { sessionNow } = await import(pathToFileURL(path.join(ROOT, 'src/interiors/plan.js')).href);
    const data = JSON.parse(readFileSync(path.join(ROOT, 'src/data/campus.json'), 'utf8'));
    const rooms0 = data.buildings.find((b) => b.id === 'apj-block').floorPlans[0].rooms;
    const FAKE = new Date(2026, 9, 5, 10, 30); // Monday 10:30
    const inSession = rooms0.find((r) => sessionNow(r, FAKE).current);
    const notIn = rooms0.find((r) => r.timetable.length && !sessionNow(r, FAKE).current) ?? rooms0.find((r) => !sessionNow(r, FAKE).current);
    await page.evaluate((t) => { window.__mkce.interiors.clock = () => new Date(t); }, FAKE.getTime());

    // enter from the building card
    await page.tap('.search-btn');
    await sleep(400);
    await page.fill('.sbar input', 'kalam');
    await sleep(200);
    await page.tap('.srow');
    await sleep(400);
    check('building card offers "Go inside" for the sample building', await page.evaluate(() => [...document.querySelectorAll('.cacts .btn')].some((b) => /Go inside/.test(b.textContent))));
    await page.tap('.cacts .btn:has-text("Go inside")');
    await sleep(2800);
    let s = await st();
    check('"Go inside" walks to the door, fades and enters on the ground floor', s.active && s.level === 0 && s.mode === 'walk', `floor ${s.level}`);
    check('outdoor scene is hidden inside', s.outdoors === false);
    check('floor selector shows G 1 2 3', await page.evaluate(() => [...document.querySelectorAll('.floors .fbtn')].map((b) => b.textContent).join(',') === '3,2,1,G'));
    check('Exit button is visible and Search is hidden inside', await page.evaluate(() => getComputedStyle(document.querySelector('.iexit')).display !== 'none' && getComputedStyle(document.querySelector('.search-btn')).display === 'none'));
    check('starts in the entrance hall facing the corridor', s.x > 15 && Math.abs(s.z) < 1 && Math.abs(((s.yaw % 360) + 360) % 360 - 90) < 3, `${s.x.toFixed(1)}, ${s.z.toFixed(1)}`);

    // walking and collisions with real input
    await page.evaluate(() => window.__mkce.input({ forward: 1 }));
    await sleep(3000);
    await page.evaluate(() => window.__mkce.input(null));
    const w1 = await st();
    check('walks down the corridor (west)', w1.x < s.x - 3 && Math.abs(w1.z) < 1.2, `x ${w1.x.toFixed(1)}`);
    await page.evaluate(() => { const w = window.__mkce.app.walk; w.pos.x = 2; w.pos.z = 0; w.yaw = 0; w.cancelTarget(); });
    await page.evaluate(() => window.__mkce.input({ forward: 1 }));
    await sleep(2500);
    await page.evaluate(() => window.__mkce.input(null));
    const w2 = await st();
    check('walls stop the player (corridor wall at z -1.4)', w2.z > -1.25 && w2.z < -0.85, `z ${w2.z.toFixed(2)}`);

    // door and sign taps open the room card
    await page.evaluate(([x, z]) => { const w = window.__mkce.app.walk; w.pos.x = x; w.pos.z = z; w.yaw = 0; w.pitch = (4 * Math.PI) / 180; w.cancelTarget(); }, [-9.5, 0]);
    await sleep(400);
    const signScr = await page.evaluate(() => { const a = window.__mkce.app, i = window.__mkce.interiors; const s = i.current.plan.signs.find((q) => q.roomId === 'room-g-01'); const v = new a.camera.position.constructor(s.x, s.y, s.z).project(a.camera); return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight, v.z]; });
    await page.touchscreen.tap(signScr[0], signScr[1]);
    await sleep(500);
    const card = await page.evaluate(() => ({ open: !!document.querySelector('.xsheet.open .roomcard'), text: document.querySelector('.roomcard')?.textContent ?? '' }));
    check('tapping a room sign opens the room card', card.open && /G-01/.test(card.text), card.text.slice(0, 40));
    check('room card lists type, capacity, department, faculty and equipment', /Classroom/.test(card.text) && /Capacity60people/.test(card.text.replace(/\s/g, '')) && /Department/.test(card.text) && /Faculty/.test(card.text) && /Projector/.test(card.text));
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

    // floors: selector
    await page.tap('.fbtn:has-text("3")');
    await sleep(1200);
    s = await st();
    check('floor selector changes the floor', s.level === 3 && (await page.evaluate(() => document.querySelector('.fbtn.on')?.textContent)) === '3');
    check('upper floor has its own rooms (3-01 ...)', await page.evaluate(() => window.__mkce.interiors.current.floor.rooms[0].number === '3-01'));
    // stairs prompt
    await page.evaluate(() => { const w = window.__mkce.app.walk; w.pos.x = -15.4; w.pos.z = -5.2; w.yaw = (-90 * Math.PI) / 180; w.cancelTarget(); });
    await sleep(500);
    check('standing at the stairs shows the stairs prompt', await page.evaluate(() => /Stairs down/.test(document.querySelector('.iprompt.on')?.textContent ?? '')));
    await page.tap('.iprompt .btn:has-text("Stairs down")');
    await sleep(1200);
    s = await st();
    check('stairs take you one floor down', s.level === 2, `floor ${s.level}`);
    // lift prompt
    await page.evaluate(() => { const w = window.__mkce.app.walk; w.pos.x = -18.2; w.pos.z = 4.75; w.cancelTarget(); });
    await sleep(500);
    check('standing at the lift shows the lift buttons', await page.evaluate(() => document.querySelectorAll('.iprompt.on .liftrow .btn').length === 3));
    await page.tap('.iprompt .liftrow .btn:has-text("G")');
    await sleep(1200);
    s = await st();
    check('the lift goes to any floor', s.level === 0, `floor ${s.level}`);

    // exit puts you back outside at the door
    await page.tap('.iexit');
    await sleep(1500);
    s = await st();
    const doorDist = await page.evaluate(() => { const f = window.__mkce.app.world.doorFrames.find((d) => d.id === 'apj-block'); const w = window.__mkce.app.walk; return Math.hypot(w.pos.x - f.x, w.pos.z - f.z); });
    check('Exit returns outside at the building door', !s.active && s.outdoors === true && doorDist > 1.5 && doorDist < 4, `${doorDist.toFixed(1)} m from the door`);
    check('the Search button is back outside', await page.evaluate(() => getComputedStyle(document.querySelector('.search-btn')).display !== 'none'));

    // arrival card -> Enter
    await page.evaluate(() => { const n = window.__mkce.nav; n.planTo({ buildingId: 'apj-block' }, 'gate:main-gate'); n.speedMult = 5; });
    await page.evaluate(async () => { await window.__mkce.nav.start(); window.__mkce.app.walk.run = true; });
    for (let i = 0; i < 40 && (await page.evaluate(() => window.__mkce.nav.mode)) !== 'arrived'; i++) await sleep(500);
    await sleep(600);
    check('arrival card now has an enabled Enter button', await page.evaluate(() => { const b = document.querySelector('.arrival .btn.primary'); return !!b && !b.disabled && /Enter/.test(b.textContent); }));
    await page.tap('.arrival .btn.primary');
    await sleep(2200);
    s = await st();
    check('Enter on the arrival card goes inside and ends the route', s.active && (await page.evaluate(() => window.__mkce.nav.mode)) === 'none');
    await page.evaluate(() => { window.__mkce.app.walk.run = false; });

    // leaving to Overview from inside exits cleanly
    await page.click('.segmented button[data-mode="overview"]');
    await sleep(1000);
    s = await st();
    check('switching to Overview from inside leaves the building', !s.active && s.mode === 'overview' && s.outdoors);
    check('no new shader programs were compiled by the interiors (precompiled)', (await programs()) === p0, `${p0} -> ${await programs()}`);
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
