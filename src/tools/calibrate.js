// ?calibrate=1 : tap the ground to read x/z, tap a building to select it, then nudge / rotate / resize it
// and move its door. Edits are applied live, kept in localStorage, and exported as a corrected campus.json.
import * as THREE from 'three';
import { footprintCorners } from './debug.js';
import { loadOverrides, saveOverrides, clearOverrides, EDITABLE } from './overrides.js';
import { relinkDoor, nearestOnFootprint } from '../data/graph.js';

const DEG = Math.PI / 180;
const r1 = (v) => Math.round(v * 10) / 10;

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

export function initCalibrate(app, rawData) {
  const { data, world, hud } = app;
  const sat = data.satellite;
  const overrides = loadOverrides();
  const history = [];
  const state = { id: null, mode: 'select', step: 1 };

  // ---------- selection highlight ----------
  const hl = new THREE.Group();
  hl.renderOrder = 950;
  const outline = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([0, 1, 2, 3].map(() => new THREE.Vector3())),
    new THREE.LineBasicMaterial({ color: 0xffe14d, depthTest: false }),
  );
  outline.renderOrder = 951;
  const fillGeo = new THREE.BufferGeometry();
  fillGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3));
  const fill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.3, depthTest: false, side: THREE.DoubleSide }));
  fill.renderOrder = 950;
  const doorMark = new THREE.Mesh(new THREE.SphereGeometry(1.8, 12, 10), new THREE.MeshBasicMaterial({ color: 0xff7a00, depthTest: false }));
  doorMark.renderOrder = 952;
  hl.add(fill, outline, doorMark);
  hl.visible = false;
  world.scene.add(hl);

  const sel = () => data.buildings.find((b) => b.id === state.id) ?? null;

  function updateHighlight() {
    const b = sel();
    hl.visible = !!b;
    if (!b) return;
    const cs = footprintCorners(b);
    outline.geometry.setFromPoints(cs.map((p) => new THREE.Vector3(p.x, 0.7, p.z)));
    const arr = fill.geometry.attributes.position.array;
    [cs[0], cs[1], cs[2], cs[0], cs[2], cs[3]].forEach((p, i) => {
      arr[i * 3] = p.x;
      arr[i * 3 + 1] = 0.65;
      arr[i * 3 + 2] = p.z;
    });
    fill.geometry.attributes.position.needsUpdate = true;
    doorMark.position.set(b.doorPosition.x, 1.5, b.doorPosition.z);
  }

  // ---------- editing ----------
  let refreshTimer = 0;
  const scheduleRefresh = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => app.refreshBuildings(), 120);
  };

  const snapshot = (b) => structuredClone(Object.fromEntries(EDITABLE.map((k) => [k, b[k]])));

  function edit(fn, { doorOnly = false } = {}) {
    const b = sel();
    if (!b) return hud.toast('Tap a building first.');
    history.push({ id: b.id, snap: snapshot(b) });
    if (history.length > 100) history.shift();
    fn(b);
    for (const k of ['x', 'z']) {
      b.position[k] = r1(b.position[k]);
      b.doorPosition[k] = r1(b.doorPosition[k]);
    }
    b.size.w = r1(b.size.w);
    b.size.d = r1(b.size.d);
    b.rotationDeg = r1(((b.rotationDeg % 360) + 360) % 360);
    relinkDoor(data, b);
    b.verified.position = b.verified.position || !doorOnly;
    b.verified.door = true;
    overrides.buildings[b.id] = snapshot(b);
    if (!saveOverrides(overrides)) hud.toast('Could not save in this browser (storage blocked). Export soon.');
    updateHighlight();
    updatePanel();
    scheduleRefresh();
  }

  const move = (dx, dz) => edit((b) => {
    b.position.x += dx;
    b.position.z += dz;
    b.doorPosition.x += dx;
    b.doorPosition.z += dz;
  });
  const rotate = (deg) => edit((b) => {
    const r = deg * DEG, c = Math.cos(r), s = Math.sin(r);
    const dx = b.doorPosition.x - b.position.x, dz = b.doorPosition.z - b.position.z;
    b.doorPosition.x = b.position.x + dx * c - dz * s; // clockwise seen from above (x east, z south)
    b.doorPosition.z = b.position.z + dx * s + dz * c;
    b.rotationDeg += deg;
  });
  const resize = (dw, dd) => edit((b) => {
    b.size.w = Math.max(2, b.size.w + dw);
    b.size.d = Math.max(2, b.size.d + dd);
    const q = nearestOnFootprint(b, b.doorPosition.x, b.doorPosition.z);
    b.doorPosition.x = q.x;
    b.doorPosition.z = q.z;
  });
  const undo = () => {
    const h = history.pop();
    if (!h) return hud.toast('Nothing to undo.');
    const b = data.buildings.find((x) => x.id === h.id);
    for (const k of EDITABLE) b[k] = structuredClone(h.snap[k]);
    relinkDoor(data, b);
    overrides.buildings[b.id] = snapshot(b);
    saveOverrides(overrides);
    state.id = b.id;
    updateHighlight();
    updatePanel();
    scheduleRefresh();
  };

  // ---------- taps ----------
  function readout(x, z) {
    const px = sat.gatePixel[0] + x / sat.metresPerPixel, py = sat.gatePixel[1] + z / sat.metresPerPixel;
    const b = world.buildingAt(x, z);
    tapEl.textContent = `Tap: x ${x.toFixed(1)}  z ${z.toFixed(1)}  (satellite px ${px.toFixed(0)}, ${py.toFixed(0)})${b ? '  in ' + b.shortName : ''}`;
    return b;
  }

  function handleTap(x, z) {
    const hit = readout(x, z);
    const b = sel();
    if (state.mode === 'pos' && b) {
      state.mode = 'select';
      edit((bb) => {
        const dx = x - bb.position.x, dz = z - bb.position.z;
        bb.position.x = x;
        bb.position.z = z;
        bb.doorPosition.x += dx;
        bb.doorPosition.z += dz;
      });
      return true;
    }
    if (state.mode === 'door' && b) {
      state.mode = 'select';
      edit((bb) => {
        const q = nearestOnFootprint(bb, x, z);
        bb.doorPosition.x = q.x;
        bb.doorPosition.z = q.z;
      }, { doorOnly: true });
      return true;
    }
    let pick = hit;
    if (!pick) {
      let best = null;
      for (const bb of data.buildings) {
        const q = nearestOnFootprint(bb, x, z);
        const d = Math.hypot(q.x - x, q.z - z);
        if (d < 8 && (!best || d < best.d)) best = { d, bb };
      }
      pick = best?.bb ?? null;
    }
    if (pick) {
      state.id = pick.id;
      updateHighlight();
      updatePanel();
    }
    syncModeButtons();
    return true;
  }
  app.calibrator = { handleTap };
  app.walk.onTap = (x, z) => {
    readout(x, z);
    app.walk.walkTo(x, z);
  };

  // ---------- export ----------
  function exportJson() {
    const out = structuredClone(data);
    for (const b of out.buildings) {
      if (overrides.buildings[b.id]) b.verified = { ...b.verified, position: true };
    }
    const text = JSON.stringify(out, null, 2) + '\n';
    try {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'campus.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      /* download blocked: clipboard below */
    }
    navigator.clipboard?.writeText(text).then(
      () => hud.toast('campus.json downloaded and copied to the clipboard.'),
      () => hud.toast('campus.json downloaded. Copy to clipboard was not allowed.'),
    );
  }

  // ---------- panel ----------
  const panel = el('div', 'panel top');
  panel.innerHTML = `
    <h3 data-k="title">Calibrate</h3>
    <div class="mono" data-k="tap">Tap the ground to read x / z. Tap a building to select it.</div>
    <div class="mono" data-k="vals"></div>
    <div class="rowline">
      <label>Step <select data-k="step"><option>0.5</option><option selected>1</option><option>5</option><option>20</option></select> m</label>
      <button data-k="mpos">Set position</button><button data-k="mdoor">Set door</button><button data-k="hide">Hide</button>
    </div>
    <div class="grid6">
      <button data-k="w" aria-label="Move west">&larr;</button><button data-k="n" aria-label="Move north">&uarr;</button>
      <button data-k="s" aria-label="Move south">&darr;</button><button data-k="e" aria-label="Move east">&rarr;</button>
      <button data-k="rl" aria-label="Rotate anticlockwise">&#10226;</button><button data-k="rr" aria-label="Rotate clockwise">&#10227;</button>
      <button data-k="wm" aria-label="Narrower">W&minus;</button><button data-k="wp" aria-label="Wider">W+</button>
      <button data-k="dm" aria-label="Shallower">D&minus;</button><button data-k="dp" aria-label="Deeper">D+</button>
      <button data-k="undo">Undo</button><button class="primary" data-k="export">Export</button>
    </div>
    <button class="linkbtn" data-k="reset">Reset all edits</button>`;
  hud.root.appendChild(panel);
  const q = (k) => panel.querySelector(`[data-k="${k}"]`);
  const tapEl = q('tap'), valsEl = q('vals'), titleEl = q('title');

  q('step').addEventListener('change', (e) => (state.step = parseFloat(e.target.value)));
  const step = () => state.step;
  q('n').onclick = () => move(0, -step());
  q('s').onclick = () => move(0, step());
  q('e').onclick = () => move(step(), 0);
  q('w').onclick = () => move(-step(), 0);
  q('rl').onclick = () => rotate(-Math.max(0.5, step() > 5 ? 5 : step()));
  q('rr').onclick = () => rotate(Math.max(0.5, step() > 5 ? 5 : step()));
  q('wm').onclick = () => resize(-step(), 0);
  q('wp').onclick = () => resize(step(), 0);
  q('dm').onclick = () => resize(0, -step());
  q('dp').onclick = () => resize(0, step());
  q('undo').onclick = undo;
  q('export').onclick = exportJson;
  q('reset').onclick = () => {
    if (confirm('Discard all calibration edits stored in this browser?')) {
      clearOverrides();
      location.reload();
    }
  };
  const pill = el('button', 'hbtn', '<small>Calibrate</small>');
  pill.style.display = 'none';
  pill.style.position = 'absolute';
  pill.style.top = 'calc(66px + var(--safe-top))';
  pill.style.left = 'calc(10px + var(--safe-left))';
  pill.addEventListener('click', () => {
    panel.style.display = '';
    pill.style.display = 'none';
  });
  hud.root.appendChild(pill);
  q('hide').onclick = () => {
    panel.style.display = 'none';
    pill.style.display = '';
  };
  const syncModeButtons = () => {
    q('mpos').classList.toggle('on', state.mode === 'pos');
    q('mdoor').classList.toggle('on', state.mode === 'door');
  };
  q('mpos').onclick = () => {
    state.mode = state.mode === 'pos' ? 'select' : 'pos';
    if (state.mode === 'pos') hud.toast('Tap where the building centre should be.');
    syncModeButtons();
  };
  q('mdoor').onclick = () => {
    state.mode = state.mode === 'door' ? 'select' : 'door';
    if (state.mode === 'door') hud.toast('Tap where the main door is (it snaps to the wall).');
    syncModeButtons();
  };

  function updatePanel() {
    const b = sel();
    titleEl.textContent = b ? `Calibrate: ${b.number ?? '?'} ${b.shortName}` : 'Calibrate: tap a building';
    valsEl.textContent = b
      ? `centre ${b.position.x}, ${b.position.z}  rot ${b.rotationDeg}°  size ${b.size.w} x ${b.size.d}\ndoor ${b.doorPosition.x}, ${b.doorPosition.z} (${b.doorFacing ?? '?'})  edits ${Object.keys(overrides.buildings).length}`
      : `edits saved in this browser: ${Object.keys(overrides.buildings).length}`;
    valsEl.style.whiteSpace = 'pre-wrap';
  }

  // desktop shortcuts: arrows nudge, [ ] rotate (overview only, not while typing)
  window.addEventListener('keydown', (e) => {
    if (app.mode !== 'overview' || !sel() || e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) return;
    const s = state.step;
    const m = { ArrowUp: [0, -s], ArrowDown: [0, s], ArrowLeft: [-s, 0], ArrowRight: [s, 0] }[e.key];
    if (m) {
      e.preventDefault();
      move(m[0], m[1]);
    } else if (e.key === '[') rotate(-1);
    else if (e.key === ']') rotate(1);
    else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) undo();
  });

  updatePanel();
  hud.toast('Calibration mode: tap a building to select it.', 4500);
}
