// Floating mini-map (position and heading) and the expanded campus map. Plain 2D canvas over the satellite image.
// Inside a building the same widgets show the current floor plan instead.
import { TYPE_ACCENT } from '../config.js';
import { insideFootprint } from '../data/footprint.js';
import { el, button, svg, ICONS } from './nav-ui.js';

ICONS.plus = '<path d="M12 5v14M5 12h14"/>';
ICONS.minus = '<path d="M5 12h14"/>';
ICONS.locate = '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>';

const DEG = Math.PI / 180;
const MINI = 112; // CSS px
const MINI_SPAN_M = 190; // metres across the mini-map

function sizeCanvas(canvas, w, h) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = Math.round(w * dpr), H = Math.round(h * dpr);
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  return dpr;
}

export function createMinimap(app) {
  const hud = app.hud;
  const data = app.data;
  const sat = data.satellite;
  const xL = sat.centre.x - sat.size.w / 2, zT = sat.centre.z - sat.size.d / 2;

  // ---------------------------------------------------------------- the small one
  const mini = el('button', 'minimap');
  mini.type = 'button';
  mini.setAttribute('aria-label', 'Mini-map showing where you are. Tap to expand.');
  const miniCanvas = el('canvas');
  mini.appendChild(miniCanvas);
  const miniN = el('span', 'mm-n', 'N');
  mini.appendChild(miniN);
  hud.root.appendChild(mini);

  // ---------------------------------------------------------------- the expanded one
  const full = el('div', 'mapfull');
  full.setAttribute('role', 'dialog');
  full.setAttribute('aria-label', 'Campus map');
  const head = el('div', 'mf-head');
  const title = el('h2', null, 'Campus map');
  const closeBtn = el('button', 'xs-close');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Close the map');
  closeBtn.innerHTML = svg('close');
  head.append(title, closeBtn);
  const fullCanvas = el('canvas');
  const tools = el('div', 'mf-tools');
  const zoomIn = button('hbtn', 'plus', '', () => zoomBy(1.5));
  zoomIn.setAttribute('aria-label', 'Zoom in');
  const zoomOut = button('hbtn', 'minus', '', () => zoomBy(1 / 1.5));
  zoomOut.setAttribute('aria-label', 'Zoom out');
  const locate = button('hbtn', 'locate', '', () => recenter());
  locate.setAttribute('aria-label', 'Centre on me');
  tools.append(locate, zoomIn, zoomOut);
  const hint = el('p', 'mf-hint', 'Drag to move the map. Tap a numbered building for details.');
  full.append(head, fullCanvas, tools, hint);
  hud.root.appendChild(full);

  const view = { cx: 0, cz: 0, s: 1, minS: 0.5, maxS: 8, open: false };
  let lastKey = '', lastDraw = 0, dirty = true;

  // ---------------------------------------------------------------- drawing
  const heading = () => (app.walk.headingDeg ?? 0) * DEG;

  function marker(ctx, x, y, rot, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(scale, scale);
    // field of view wedge
    ctx.fillStyle = 'rgba(242,194,48,0.28)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 30, -Math.PI / 2 - 0.65, -Math.PI / 2 + 0.65);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6.5, 7);
    ctx.lineTo(0, 3.5);
    ctx.lineTo(-6.5, 7);
    ctx.closePath();
    ctx.fillStyle = '#f2c230';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }

  function drawCampus(ctx, w, h, v, { labels }) {
    ctx.fillStyle = '#26402f';
    ctx.fillRect(0, 0, w, h);
    const img = app.world.satelliteImage;
    const sx = (x) => (x - v.cx) * v.s + w / 2, sz = (z) => (z - v.cz) * v.s + h / 2;
    if (img) {
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx(xL), sz(zT), sat.size.w * v.s, sat.size.d * v.s);
    }
    if (labels) {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      for (const b of data.buildings) {
        if (b.form === 'field' || b.form === 'court') continue;
        const r = (b.rotationDeg ?? 0) * DEG, c = Math.cos(r), s = Math.sin(r);
        ctx.beginPath();
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, d], i) => {
          const lx = (a * b.size.w) / 2, lz = (d * b.size.d) / 2;
          const x = sx(b.position.x + lx * c - lz * s), z = sz(b.position.z + lx * s + lz * c);
          if (i === 0) ctx.moveTo(x, z);
          else ctx.lineTo(x, z);
        });
        ctx.closePath();
        ctx.stroke();
      }
    }
    // route
    const route = app.nav.route;
    if (route) {
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      route.poly.p.forEach((p, i) => (i ? ctx.lineTo(sx(p.x), sz(p.z)) : ctx.moveTo(sx(p.x), sz(p.z))));
      ctx.strokeStyle = 'rgba(11,29,51,0.85)';
      ctx.lineWidth = labels ? 7 : 5;
      ctx.stroke();
      ctx.strokeStyle = '#ffc83d';
      ctx.lineWidth = labels ? 4 : 3;
      ctx.stroke();
      const end = route.poly.p[route.poly.p.length - 1];
      ctx.fillStyle = '#ffc83d';
      ctx.strokeStyle = '#0b1d33';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx(end.x), sz(end.z), 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (labels) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '700 12px system-ui, sans-serif';
      for (const b of data.buildings) {
        if (b.number == null) continue;
        const x = sx(b.position.x), z = sz(b.position.z);
        if (x < -20 || z < -20 || x > w + 20 || z > h + 20) continue;
        ctx.fillStyle = TYPE_ACCENT[b.type] ?? '#9aa0a6';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, z, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.fillText(String(b.number), x, z + 0.5);
      }
    }
    // me (only meaningful outdoors; the last position is shown from Overview too)
    const me = app.inWorld ? app.walk.pos : app.lastWalk;
    if (me) marker(ctx, sx(me.x), sz(me.z), app.inWorld ? heading() : (app.lastWalk?.yaw ?? 0) * -1, labels ? 1.15 : 1);
    // north
    ctx.save();
    ctx.fillStyle = 'rgba(11,29,51,0.8)';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', w - 14, 16);
    ctx.restore();
  }

  function drawFloor(ctx, w, h, big) {
    const cur = app.interiors.current;
    ctx.fillStyle = '#17212c';
    ctx.fillRect(0, 0, w, h);
    if (!cur) return;
    const o = cur.plan.outline, c = cur.plan.court;
    const pad = big ? 36 : 10;
    const s = Math.min((w - pad * 2) / (o.x1 - o.x0), (h - pad * 2) / (o.z1 - o.z0));
    const sx = (x) => w / 2 + (x - (o.x0 + o.x1) / 2) * s, sz = (z) => h / 2 + (z - (o.z0 + o.z1) / 2) * s;
    ctx.fillStyle = '#7a4a3c'; // verandah and corridors
    ctx.fillRect(sx(o.x0), sz(o.z0), (o.x1 - o.x0) * s, (o.z1 - o.z0) * s);
    if (c) {
      ctx.fillStyle = '#3f6b3a'; // the courtyard garden
      ctx.fillRect(sx(c.x0), sz(c.z0), (c.x1 - c.x0) * s, (c.z1 - c.z0) * s);
    }
    for (const r of cur.floor.rooms) {
      const b = r.bounds;
      ctx.fillStyle = r.type === 'lobby' ? '#d9d2c2' : '#e9e2cf';
      ctx.fillRect(sx(b.x0) + 0.5, sz(b.z0) + 0.5, (b.x1 - b.x0) * s - 1, (b.z1 - b.z0) * s - 1);
      if (big) {
        ctx.fillStyle = '#0b1d33';
        ctx.font = '700 10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(r.number, sx((b.x0 + b.x1) / 2), sz((b.z0 + b.z1) / 2) + 3);
      }
    }
    for (const q of [...cur.plan.stairs, ...cur.plan.lifts]) {
      const b = q.bounds;
      ctx.fillStyle = '#9db4c9';
      ctx.fillRect(sx(b.x0), sz(b.z0), Math.max(3, (b.x1 - b.x0) * s), Math.max(3, (b.z1 - b.z0) * s));
    }
    const e = cur.plan.entrance;
    if (e) {
      ctx.fillStyle = '#f2c230';
      const across = e.nz !== 0; // an entrance on the north or south wall is drawn wide, on the east or west wall tall
      ctx.fillRect(sx(e.x) - (across ? 5 : 3), sz(e.z) - (across ? 3 : 5), across ? 10 : 6, across ? 6 : 10);
    }
    marker(ctx, sx(app.walk.pos.x), sz(app.walk.pos.z), heading(), big ? 1.1 : 0.8);
  }

  function render(canvas, ctx, w, h, big) {
    const dpr = sizeCanvas(canvas, w, h);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (app.interiors.active) drawFloor(ctx, w, h, big);
    else drawCampus(ctx, w, h, big ? view : { cx: app.walk.pos.x, cz: app.walk.pos.z, s: MINI / MINI_SPAN_M }, { labels: big });
  }

  const miniCtx = miniCanvas.getContext('2d');
  const fullCtx = fullCanvas.getContext('2d');
  miniCanvas.style.width = `${MINI}px`;
  miniCanvas.style.height = `${MINI}px`;

  // ---------------------------------------------------------------- expanded map interaction
  function fit() {
    const w = full.clientWidth, h = fullCanvas.clientHeight || full.clientHeight;
    view.minS = Math.min(w / sat.size.w, h / sat.size.d) * 0.9;
    view.s = Math.max(view.minS, Math.min(view.s, view.maxS));
  }

  function openFull() {
    app.navUi.sheets.close();
    view.open = true;
    full.classList.add('on');
    hud.root.classList.add('map-open');
    const w = full.clientWidth, h = full.clientHeight - 64;
    view.minS = Math.min(w / sat.size.w, h / sat.size.d) * 0.9;
    view.s = Math.max(view.minS, Math.min(w / 260, view.maxS));
    recenter();
    dirty = true;
  }

  function closeFull() {
    view.open = false;
    full.classList.remove('on');
    hud.root.classList.remove('map-open');
  }

  function recenter() {
    const me = app.inWorld ? app.walk.pos : app.lastWalk;
    if (me && !app.interiors.active) {
      view.cx = me.x;
      view.cz = me.z;
    } else {
      view.cx = sat.centre.x;
      view.cz = sat.centre.z;
      view.s = view.minS;
    }
    dirty = true;
  }

  function zoomBy(k) {
    view.s = Math.max(view.minS, Math.min(view.maxS, view.s * k));
    dirty = true;
  }

  mini.addEventListener('click', openFull);
  closeBtn.addEventListener('click', closeFull);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && view.open) closeFull();
  });

  const drag = { id: null, x: 0, y: 0, sx: 0, sy: 0, moved: 0, t: 0 };
  fullCanvas.addEventListener('pointerdown', (e) => {
    if (drag.id !== null) return;
    fullCanvas.setPointerCapture(e.pointerId);
    Object.assign(drag, { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: 0, t: performance.now() });
  });
  fullCanvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== drag.id) return;
    view.cx -= (e.clientX - drag.x) / view.s;
    view.cz -= (e.clientY - drag.y) / view.s;
    drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy));
    drag.x = e.clientX;
    drag.y = e.clientY;
    dirty = true;
  });
  const up = (e) => {
    if (e.pointerId !== drag.id) return;
    drag.id = null;
    if (e.type === 'pointerup' && drag.moved < 8 && performance.now() - drag.t < 450 && !app.interiors.active) {
      const r = fullCanvas.getBoundingClientRect();
      const x = view.cx + (e.clientX - r.left - r.width / 2) / view.s, z = view.cz + (e.clientY - r.top - r.height / 2) / view.s;
      const b = data.buildings.find((q) => insideFootprint(q, x, z, -1.5)) ?? nearestNumbered(x, z, 16 / view.s);
      if (b) {
        closeFull();
        app.navUi.openBuilding(b.id);
      }
    }
  };
  fullCanvas.addEventListener('pointerup', up);
  fullCanvas.addEventListener('pointercancel', up);
  fullCanvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1.2 : 1 / 1.2);
  }, { passive: false });

  function nearestNumbered(x, z, within) {
    let best = null, bd = within;
    for (const b of data.buildings) {
      if (b.number == null) continue;
      const d = Math.hypot(b.position.x - x, b.position.z - z);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  // ---------------------------------------------------------------- per frame
  function update() {
    const interior = app.interiors.active;
    const showMini = app.inWorld;
    mini.classList.toggle('on', showMini);
    if (!showMini && !view.open) return;
    const p = app.walk.pos;
    const key = `${view.open}|${interior}|${app.interiors.level}|${Math.round(p.x * 2)}|${Math.round(p.z * 2)}|${Math.round(heading() / (3 * DEG))}|${app.nav.route?.length ?? 0}|${app.nav.mode}|${view.cx | 0}|${view.cz | 0}|${view.s.toFixed(2)}`;
    const now = performance.now();
    if ((key === lastKey && !dirty) || now - lastDraw < 90) return;
    lastKey = key;
    dirty = false;
    lastDraw = now;
    if (showMini) render(miniCanvas, miniCtx, MINI, MINI, false);
    if (view.open) render(fullCanvas, fullCtx, fullCanvas.clientWidth, fullCanvas.clientHeight, true);
    miniN.style.display = interior ? 'none' : '';
  }
  app.extra.push(update);
  window.addEventListener('resize', () => {
    if (view.open) {
      fit();
      dirty = true;
    }
  });

  return { openFull, closeFull, mini, view, get open() { return view.open; } };
}
