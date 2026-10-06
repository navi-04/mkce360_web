// ?debug=1 : draws the extracted footprints, paths and gates semi-transparently over the satellite ground
// (3D), shows live stats, and offers a 2D map that overlays everything on the satellite image AND on the
// signboard photo (through the fitted homography) so alignment can be checked by eye.
import * as THREE from 'three';
import { TYPE_ACCENT } from '../config.js';
import { ribbonGeo } from '../world/geo.js';

const DEG = Math.PI / 180;

export function footprintCorners(b) {
  const r = b.rotationDeg * DEG;
  const e = [Math.cos(r), Math.sin(r)], s = [-Math.sin(r), Math.cos(r)];
  const hw = b.size.w / 2, hd = b.size.d / 2;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => ({
    x: b.position.x + sx * hw * e[0] + sz * hd * s[0],
    z: b.position.z + sx * hw * e[1] + sz * hd * s[1],
  }));
}

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

export function initDebug(app) {
  const { data, world } = app;
  const group = new THREE.Group();
  group.name = 'debug-overlay';
  world.scene.add(group);

  const layers = { footprints: new THREE.Group(), paths: new THREE.Group(), markers: new THREE.Group() };
  for (const g of Object.values(layers)) group.add(g);

  const overlayMat = (color, opacity) =>
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  const lineMat = (color) => new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false });

  // footprints
  for (const b of data.buildings) {
    const accent = new THREE.Color(TYPE_ACCENT[b.type] ?? '#9aa0a6');
    const cs = footprintCorners(b);
    const pos = new Float32Array([cs[0], cs[1], cs[2], cs[0], cs[2], cs[3]].flatMap((p) => [p.x, 0.4, p.z]));
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const fill = new THREE.Mesh(fg, overlayMat(accent, 0.32));
    fill.renderOrder = 900;
    const lg = new THREE.BufferGeometry().setFromPoints(cs.map((p) => new THREE.Vector3(p.x, 0.45, p.z)));
    const line = new THREE.LineLoop(lg, lineMat(accent));
    line.renderOrder = 901;
    layers.footprints.add(fill, line);
  }
  // paths (as thin ribbons so they stay visible on high-DPI screens) and nodes
  const nodes = new Map(data.paths.nodes.map((n) => [n.id, n]));
  for (const [type, color, w] of [['road', 0x00e5ff, 2.4], ['walkway', 0xff4de0, 1.4]]) {
    const geos = [];
    for (const e of data.paths.edges) {
      if (e.type !== type) continue;
      const a = nodes.get(e.from), b = nodes.get(e.to);
      geos.push(ribbonGeo(a.x, a.z, b.x, b.z, w, 0.5));
    }
    if (!geos.length) continue;
    const merged = new THREE.BufferGeometry();
    const arr = geos.flatMap((g) => Array.from(g.attributes.position.array));
    merged.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr), 3));
    const m = new THREE.Mesh(merged, overlayMat(color, 0.85));
    m.renderOrder = 902;
    layers.paths.add(m);
  }
  // doors, gates, boundary, points
  const dot = (x, z, color, r = 1.1, y = 1.2) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), overlayMat(color, 0.95));
    m.position.set(x, y, z);
    m.renderOrder = 903;
    return m;
  };
  for (const b of data.buildings) layers.markers.add(dot(b.doorPosition.x, b.doorPosition.z, 0xff9a2e));
  for (const p of data.points) layers.markers.add(dot(p.position.x, p.position.z, 0xffe14d, 0.8, 0.9));
  for (const g of data.gates) {
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 14, 14), overlayMat(0xff3b3b, 0.8));
    cyl.position.set(g.position.x, 7, g.position.z);
    cyl.renderOrder = 904;
    layers.markers.add(cyl);
  }
  const bl = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(data.boundary.points.map((p) => new THREE.Vector3(p.x, 0.6, p.z))),
    lineMat(0xffffff),
  );
  bl.renderOrder = 905;
  layers.markers.add(bl);

  // ---------- panel ----------
  const panel = el('div', 'panel');
  panel.innerHTML = `<h3>Debug overlay</h3>
    <div class="rowline" data-k="toggles"></div>
    <div class="rowline" style="margin-top:8px"><label>Satellite&nbsp;<input type="range" min="0" max="100" value="100" data-k="sat"></label></div>
    <div class="rowline" style="margin-top:8px"><button class="primary" data-k="map">2D alignment map</button></div>
    <div class="mono" data-k="legend">cyan = roads, magenta = walkways, orange = doors, yellow = points, red = gates, white = boundary</div>`;
  const rowT = panel.querySelector('[data-k=toggles]');
  for (const [k, label] of [['footprints', 'Footprints'], ['paths', 'Paths'], ['markers', 'Doors / gates']]) {
    const b = el('button', 'on', label);
    b.addEventListener('click', () => {
      layers[k].visible = !layers[k].visible;
      b.classList.toggle('on', layers[k].visible);
    });
    rowT.appendChild(b);
  }
  const satMat = world.parts.satellite.material;
  satMat.transparent = true;
  panel.querySelector('[data-k=sat]').addEventListener('input', (e) => {
    satMat.opacity = e.target.value / 100;
  });
  panel.querySelector('[data-k=map]').addEventListener('click', () => open2D(app));
  app.hud.root.appendChild(panel);
  panel.style.display = 'none'; // opened with the bug button so it never covers the controls by default
  app.hud.addDebugButton(() => (panel.style.display = panel.style.display === 'none' ? '' : 'none'));
  app.hud.toast('Debug overlay on. Tap the bug button for options.', 3500);

  // ---------- stats ----------
  const stats = el('div', 'stats');
  app.hud.root.appendChild(stats);
  let acc = 0;
  app.extra.push((dt) => {
    acc += dt;
    if (acc < 0.25) return;
    acc = 0;
    const s = app.stats();
    const c = app.camera.position;
    const w = app.mode === 'walk' ? `  pos ${app.walk.pos.x.toFixed(1)}, ${app.walk.pos.z.toFixed(1)}  hdg ${app.walk.headingDeg.toFixed(0)}` : '';
    stats.textContent = `${s.fps} fps ${s.frameMs} ms\ncalls ${s.drawCalls}  tris ${s.triangles}\nq ${s.quality} (${s.qualitySetting})  dpr ${s.pixelRatio}\n${s.mode} cam ${c.x.toFixed(0)},${c.y.toFixed(0)},${c.z.toFixed(0)}${w}`;
  });
}

// ---------------------------------------------------------------------------------------------
// 2D alignment map
// ---------------------------------------------------------------------------------------------

function invert3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

function open2D(app) {
  const { data } = app;
  const base = import.meta.env.BASE_URL;
  const scale = data.satellite.metresPerPixel, gp = data.satellite.gatePixel;
  const sb = data.debug?.signboard;
  const Hinv = sb ? invert3(sb.imageToMetres) : null;

  const views = {
    satellite: {
      src: base + data.satellite.url,
      toImg: (x, z) => [gp[0] + x / scale, gp[1] + z / scale],
    },
  };
  if (sb) {
    views.signboard = {
      src: base + sb.image,
      toImg: (x, z) => {
        const w = Hinv[6] * x + Hinv[7] * z + Hinv[8];
        return [(Hinv[0] * x + Hinv[1] * z + Hinv[2]) / w, (Hinv[3] * x + Hinv[4] * z + Hinv[5]) / w];
      },
    };
  }

  const root = el('div', 'map2d');
  const bar = el('div', 'bar');
  const canvas = document.createElement('canvas');
  root.append(bar, canvas);
  app.hud.root.appendChild(root);
  const ctx = canvas.getContext('2d');

  const st = { view: 'satellite', foot: true, paths: true, labels: true, alpha: 0.4, zoom: 1, ox: 0, oy: 0, img: null };
  const btn = (label, fn, on) => {
    const b = el('button', on ? 'on' : '', label);
    b.addEventListener('click', () => fn(b));
    bar.appendChild(b);
    return b;
  };
  const tabs = {};
  for (const k of Object.keys(views)) {
    tabs[k] = btn(k === 'satellite' ? 'Satellite' : 'Signboard', () => setView(k), k === st.view);
  }
  btn('Footprints', (b) => { st.foot = !st.foot; b.classList.toggle('on', st.foot); draw(); }, true);
  btn('Paths', (b) => { st.paths = !st.paths; b.classList.toggle('on', st.paths); draw(); }, true);
  btn('Labels', (b) => { st.labels = !st.labels; b.classList.toggle('on', st.labels); draw(); }, true);
  const range = el('input');
  range.type = 'range';
  range.min = 0;
  range.max = 100;
  range.value = st.alpha * 100;
  range.setAttribute('aria-label', 'Overlay opacity');
  range.addEventListener('input', () => { st.alpha = range.value / 100; draw(); });
  bar.appendChild(range);
  btn('Close', () => root.remove());

  function fit() {
    if (!st.img) return;
    const dpr = devicePixelRatio || 1;
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    st.zoom = Math.min(cw / st.img.width, ch / st.img.height);
    st.ox = (cw - st.img.width * st.zoom) / 2;
    st.oy = (ch - st.img.height * st.zoom) / 2;
    draw();
  }

  function setView(k) {
    st.view = k;
    for (const [n, b] of Object.entries(tabs)) b.classList.toggle('on', n === k);
    const img = new Image();
    img.onload = () => {
      st.img = img;
      fit();
    };
    img.src = views[k].src;
  }

  function draw() {
    if (!st.img) return;
    const dpr = devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#08121f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * st.zoom, 0, 0, dpr * st.zoom, dpr * st.ox, dpr * st.oy);
    ctx.drawImage(st.img, 0, 0);
    const T = views[st.view].toImg;
    const lw = 2 / st.zoom;
    const poly = (pts) => {
      ctx.beginPath();
      pts.forEach((p, i) => {
        const [u, v] = T(p.x, p.z);
        i ? ctx.lineTo(u, v) : ctx.moveTo(u, v);
      });
      ctx.closePath();
    };
    if (st.foot) {
      for (const b of data.buildings) {
        const col = TYPE_ACCENT[b.type] ?? '#9aa0a6';
        poly(footprintCorners(b));
        ctx.globalAlpha = st.alpha;
        ctx.fillStyle = col;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.lineWidth = lw;
        ctx.strokeStyle = col;
        ctx.stroke();
        const [du, dv] = T(b.doorPosition.x, b.doorPosition.z);
        ctx.fillStyle = '#ff9a2e';
        ctx.beginPath();
        ctx.arc(du, dv, 3.5 / st.zoom, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = '#ffffff';
      ctx.setLineDash([6 / st.zoom, 4 / st.zoom]);
      poly(data.boundary.points);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (st.paths) {
      const nodes = new Map(data.paths.nodes.map((n) => [n.id, n]));
      for (const e of data.paths.edges) {
        const a = nodes.get(e.from), b = nodes.get(e.to);
        const [u0, v0] = T(a.x, a.z), [u1, v1] = T(b.x, b.z);
        ctx.strokeStyle = e.type === 'road' ? '#00e5ff' : '#ff4de0';
        ctx.lineWidth = (e.type === 'road' ? 3 : 2) / st.zoom;
        ctx.beginPath();
        ctx.moveTo(u0, v0);
        ctx.lineTo(u1, v1);
        ctx.stroke();
      }
      for (const g of data.gates) {
        const [u, v] = T(g.position.x, g.position.z);
        ctx.fillStyle = '#ff3b3b';
        ctx.beginPath();
        ctx.arc(u, v, 6 / st.zoom, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (st.labels) {
      ctx.font = `700 ${13 / st.zoom}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const b of data.buildings) {
        const [u, v] = T(b.position.x, b.position.z);
        const t = b.number != null ? String(b.number) : '?';
        ctx.lineWidth = 3 / st.zoom;
        ctx.strokeStyle = '#000';
        ctx.strokeText(t, u, v);
        ctx.fillStyle = '#fff';
        ctx.fillText(t, u, v);
      }
    }
  }

  // pan / pinch / wheel
  const ptrs = new Map();
  let lastDist = 0;
  const zoomAt = (cx, cy, f) => {
    const nz = Math.min(12, Math.max(0.15, st.zoom * f));
    const k = nz / st.zoom;
    st.ox = cx - (cx - st.ox) * k;
    st.oy = cy - (cy - st.oy) * k;
    st.zoom = nz;
    draw();
  };
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lastDist = 0;
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    const r = canvas.getBoundingClientRect();
    if (ptrs.size === 1) {
      st.ox += e.clientX - p.x;
      st.oy += e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      draw();
    } else if (ptrs.size === 2) {
      p.x = e.clientX;
      p.y = e.clientY;
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (lastDist) zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, d / lastDist);
      lastDist = d;
    }
  });
  const up = (e) => { ptrs.delete(e.pointerId); lastDist = 0; };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.15 : 1 / 1.15);
  }, { passive: false });
  window.addEventListener('resize', fit);
  setView('satellite');
}
