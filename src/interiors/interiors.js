// Building interiors: enter with a fade, one floor at a time (verandahs round a courtyard, corridors and rooms),
// stairs and lift change floors, door and sign taps open a room card, exit puts the viewer back outside at the door.
// Geometry comes from plan.js (pure data); everything static is merged into a handful of meshes per floor, the furniture
// of a room is built the first time the viewer comes near it.
import * as THREE from 'three';
import { PLAYER } from '../config.js';
import { Collider } from '../modes/collision.js';
import { boxGeo, signQuad, merge, paint } from '../world/geo.js';
import { signAtlas, grassTexture } from '../world/textures.js';
import * as IT from '../world/interior-textures.js';
import { buildPlan, floorShortLabel, floorLabel, DOOR, WALL_T, PARAPET_H } from './plan.js';

const DEG = Math.PI / 180;
// open-air look: the courtyard shows the sky, so the fog is a light haze rather than a dark void
const INDOOR = { bg: 0xdbe6ee, hemi: 1.4, sun: 0.65, fogNear: 45, fogFar: 200, sky: true, hemiSky: 0xfff7ea, hemiGround: 0xf3eee4 };
const PROMPT_R = 2.4;
const EXIT_R = 3.0;
const ENTER_R = 8; // how close to a door the "Enter" prompt appears
const ROOM_SHOW_R = 15; // furniture of a room is built and shown within this distance
const PLINTH = 0.45; // the verandah floor stands this far above the garden
const TILE = { granite: 1.8, marble: 1.2, green: 2.4, concrete: 2.4 };
const ARRIVE_YAW = { n: 0, e: -Math.PI / 2, s: Math.PI, w: Math.PI / 2 }; // which way the viewer faces after stairs or lift

// ---------- geometry helpers ----------

// Boxes are plain descriptions {x0,z0,x1,z1,y0,y1,color,uvT?,faces?} that are written straight into typed arrays,
// which is several times cheaper than one BoxGeometry per box (a floor has about a thousand of them).
// uvT = [uTile, vTile]: uv follow world metres so a texture keeps its scale; faces: bit mask 1 << (0:+x 1:-x 2:+y 3:-y 4:+z 5:-z).
const ALL_FACES = 63;
const FACE_DEFS = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];
const _col = new THREE.Color();

class BoxBatch {
  constructor(list = []) {
    this.list = list;
  }

  push(...items) {
    for (const it of items) if (it) this.list.push(it);
    return this.list.length;
  }

  build() {
    let faces = 0;
    for (const b of this.list) {
      const m = b.faces ?? ALL_FACES;
      for (let f = 0; f < 6; f++) if (m & (1 << f)) faces++;
    }
    if (!faces) return null;
    const pos = new Float32Array(faces * 18), nor = new Float32Array(faces * 18), col = new Float32Array(faces * 18), uv = new Float32Array(faces * 12);
    let p = 0, q = 0;
    for (const b of this.list) {
      _col.set(b.color ?? 0xffffff);
      const m = b.faces ?? ALL_FACES;
      const X = [b.x0, b.x1], Y = [b.y0, b.y1], Z = [b.z0, b.z1];
      for (let f = 0; f < 6; f++) {
        if (!(m & (1 << f))) continue;
        const { n, c } = FACE_DEFS[f];
        for (const k of [0, 1, 2, 0, 2, 3]) {
          const x = X[c[k][0]], y = Y[c[k][1]], z = Z[c[k][2]];
          pos[p] = x; pos[p + 1] = y; pos[p + 2] = z;
          nor[p] = n[0]; nor[p + 1] = n[1]; nor[p + 2] = n[2];
          col[p] = _col.r; col[p + 1] = _col.g; col[p + 2] = _col.b;
          p += 3;
          if (b.uvT) {
            const [ut, vt] = b.uvT;
            if (n[0]) { uv[q] = z / ut; uv[q + 1] = y / vt; }
            else if (n[2]) { uv[q] = x / ut; uv[q + 1] = y / vt; }
            else { uv[q] = x / ut; uv[q + 1] = z / ut; }
          }
          q += 2;
        }
      }
    }
    return toGeometry(pos, nor, col, uv);
  }
}

/** flat pictures {uv:[u0,v0,u1,v1], w, h, x, y, z, nx, nz}: bottom centre at (x,y,z), facing (nx,nz) */
class QuadBatch {
  constructor(list = []) {
    this.list = list;
  }

  build() {
    const n = this.list.length;
    if (!n) return null;
    const pos = new Float32Array(n * 18), nor = new Float32Array(n * 18), col = new Float32Array(n * 18).fill(1), uv = new Float32Array(n * 12);
    let p = 0, q = 0;
    for (const d of this.list) {
      const rx = (d.nz * d.w) / 2, rz = (-d.nx * d.w) / 2;
      const [u0, v0, u1, v1] = d.uv;
      const BL = [d.x - rx, d.y, d.z - rz, u0, v0], BR = [d.x + rx, d.y, d.z + rz, u1, v0];
      const TR = [d.x + rx, d.y + d.h, d.z + rz, u1, v1], TL = [d.x - rx, d.y + d.h, d.z - rz, u0, v1];
      for (const v of [BL, BR, TR, BL, TR, TL]) {
        pos[p] = v[0]; pos[p + 1] = v[1]; pos[p + 2] = v[2];
        nor[p] = d.nx; nor[p + 1] = 0; nor[p + 2] = d.nz;
        p += 3;
        uv[q] = v[3]; uv[q + 1] = v[4];
        q += 2;
      }
    }
    return toGeometry(pos, nor, col, uv);
  }
}

function toGeometry(pos, nor, col, uv) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** horizontal rectangle, uv in world metres / tile, facing up or down */
function flatRect(x0, z0, x1, z1, y, tile, down = false) {
  const p = down ? [[x0, z0], [x1, z1], [x0, z1], [x0, z0], [x1, z0], [x1, z1]] : [[x0, z0], [x0, z1], [x1, z1], [x0, z0], [x1, z1], [x1, z0]];
  const pos = [], nor = [], uv = [];
  for (const [x, z] of p) {
    pos.push(x, y, z);
    nor.push(0, down ? -1 : 1, 0);
    uv.push(x / tile, z / tile);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** a quad from four corners (counter-clockwise seen from the front) with a uv per corner */
function quad(c, uvs) {
  const [a, b, d] = [new THREE.Vector3(...c[0]), new THREE.Vector3(...c[1]), new THREE.Vector3(...c[2])];
  const n = b.clone().sub(a).cross(d.clone().sub(b)).normalize();
  const order = [0, 1, 2, 0, 2, 3];
  const pos = [], nor = [], uv = [];
  for (const i of order) {
    pos.push(...c[i]);
    nor.push(n.x, n.y, n.z);
    uv.push(...uvs[i]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

const box = (cx, cz, w, d, h, y, color) => ({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, y0: y, y1: y + h, color });
const boxAB = (x0, z0, x1, z1, y0, y1, color) => ({ x0, x1, z0, z1, y0, y1, color });

/** a flat picture from the decor atlas, bottom edge at y, facing (nx, nz) */
const decorQuad = (uv, w, h, x, y, z, nx, nz) => ({ uv, w, h, x, y, z, nx, nz });

/** the lift shaft: a cream block with a wood-panelled front and a steel door (photographed style) */
function liftBoxes(l, H) {
  const b = l.bounds, f = l.facing ?? 's';
  const out = [];
  const body = H - 0.3;
  out.push(boxAB(b.x0, b.z0, b.x1, b.z1, 0, body, 0xe8dfcf));
  const vertical = f === 'e' || f === 'w'; // the face is a wall running along z
  const sgn = f === 's' || f === 'e' ? 1 : -1;
  const face = vertical ? (f === 'e' ? b.x1 : b.x0) : (f === 's' ? b.z1 : b.z0);
  const lo = vertical ? b.z0 : b.x0, hi = vertical ? b.z1 : b.x1, mid = (lo + hi) / 2;
  const put = (a0, a1, off0, off1, y0, y1, color) => {
    const p0 = face + sgn * off0, p1 = face + sgn * off1;
    out.push(vertical ? boxAB(Math.min(p0, p1), a0, Math.max(p0, p1), a1, y0, y1, color) : boxAB(a0, Math.min(p0, p1), a1, Math.max(p0, p1), y0, y1, color));
  };
  const dw = 0.55;
  put(lo, mid - dw - 0.1, 0, 0.07, 0, body, 0xb4602d); // wood panels
  put(mid + dw + 0.1, hi, 0, 0.07, 0, body, 0xb4602d);
  put(mid - dw - 0.1, mid + dw + 0.1, 0, 0.07, 2.2, body, 0xb4602d);
  put(mid - dw, mid + dw, 0, 0.09, 0, 2.2, 0xa8aeb4); // steel doors
  put(mid, mid + 0.02, 0.09, 0.1, 0, 2.2, 0x6f777e);
  put(mid + dw + 0.18, mid + dw + 0.3, 0.07, 0.1, 1.0, 1.25, 0x2b3036); // call button panel
  return out;
}

export class Interiors {
  constructor(app) {
    this.app = app;
    this.active = false;
    this.buildingId = null;
    this.level = 0;
    this.floors = new Map(); // `${buildingId}:${level}` -> built floor
    this.gardens = new Map(); // buildingId -> garden group
    this.clock = () => new Date(); // overridable in tests
    this.prompt = null;
    this._listeners = new Set();
    this._saved = null;

    const world = app.world;
    this.group = new THREE.Group();
    this.group.name = 'interior';
    this.group.visible = false;
    world.scene.add(this.group);

    const lam = (map) => new THREE.MeshLambertMaterial({ map, vertexColors: true });
    const decor = IT.decorAtlas();
    this.decorCells = decor.cells;
    const grass = grassTexture();
    this.mats = {
      wallCorr: lam(IT.corridorWall()),
      wallRoom: lam(IT.roomWall()),
      granite: lam(IT.graniteFloor()),
      marble: lam(IT.marbleFloor()),
      green: lam(IT.greenFloor()),
      concrete: lam(IT.concreteFloor()),
      ceiling: lam(IT.ceilingTile()),
      parapet: lam(IT.parapetWall()),
      facade: lam(IT.arcadeFacade()),
      paver: lam(IT.hexPaver()),
      grass: lam(grass),
      decor: lam(decor.texture),
      detail: new THREE.MeshLambertMaterial({ vertexColors: true }),
    };
    this.mats.ceiling.emissive.set(0x6c685f); // the ceiling only sees the ground half of the light; keep it white
    this.pickMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });

    // Hidden stand-ins so the start-up shader precompile covers every material the interiors will use.
    const warm = new THREE.Group();
    warm.position.y = -200;
    const tiny = () => paint(boxGeo(0.01, 0.01, 0.01), 0xffffff);
    for (const m of Object.values(this.mats)) warm.add(new THREE.Mesh(tiny(), m));
    const sign = signAtlas([{ text: '0', style: 'green' }]);
    this.warmSign = new THREE.MeshBasicMaterial({ map: sign.texture });
    warm.add(new THREE.Mesh(signQuad(0.01, 0.01), this.warmSign));
    this.group.add(warm);
    warm.visible = true;
  }

  /** upload the interior textures to the GPU at start-up (the first draw would otherwise stall) */
  warmTextures(renderer) {
    for (const m of Object.values(this.mats)) if (m.map) renderer.initTexture(m.map);
  }

  // ---------- data ----------

  building(id = this.buildingId) {
    return this.app.data.buildings.find((b) => b.id === id) ?? null;
  }

  has(id) {
    return !!this.building(id)?.floorPlans?.length;
  }

  get floorPlans() {
    return this.building()?.floorPlans ?? [];
  }

  get currentFloor() {
    return this.floorPlans.find((f) => f.level === this.level) ?? null;
  }

  get current() {
    return this.active ? this.floors.get(`${this.buildingId}:${this.level}`) ?? null : null;
  }

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  emit(type = 'change', data = null) {
    for (const fn of this._listeners) fn(type, data, this);
  }

  // ---------- the courtyard garden (one per building, moved down with the floor) ----------

  _garden(buildingId, plan) {
    if (this.gardens.has(buildingId)) return this.gardens.get(buildingId);
    const g = plan.garden;
    const group = new THREE.Group();
    group.name = 'garden';
    const r = g.rect;
    const y = -PLINTH;
    const m = 0.4; // tuck the lawn under the parapet
    const lawn = flatRect(r.x0 - m, r.z0 - m, r.x1 + m, r.z1 + m, y, 4);
    group.add(new THREE.Mesh(paint(lawn, 0xffffff), this.mats.grass));
    const paths = merge(g.paths.map((p) => flatRect(p.x0, p.z0, p.x1, p.z1, y + 0.03, 1.2)));
    group.add(new THREE.Mesh(paint(paths, 0xffffff), this.mats.paver));
    // trees: a trunk and two low-poly crowns, merged into one mesh
    const TONES = [0x4f8f3a, 0x5e9d40, 0x417f34, 0x6aa748];
    const parts = [];
    for (const t of g.trees) {
      const trunkH = t.h * 0.55;
      const trunk = new THREE.CylinderGeometry(0.18, 0.3, trunkH, 5).toNonIndexed();
      trunk.translate(t.x, y + trunkH / 2, t.z);
      parts.push(paint(trunk, 0x6b4f3a));
      for (const [dx, dz, k, up] of [[0, 0, 1, 0.85], [t.s * 0.35, t.s * 0.2, 0.7, 0.62]]) {
        const crown = new THREE.IcosahedronGeometry(t.s * k, 0);
        crown.scale(1, 0.8, 1);
        crown.translate(t.x + dx, y + trunkH + t.s * 0.5 * up, t.z + dz);
        parts.push(paint(crown, TONES[(t.tone + (k < 1 ? 1 : 0)) % TONES.length]));
      }
    }
    group.add(new THREE.Mesh(merge(parts), this.mats.detail));
    group.visible = false;
    this.group.add(group);
    this.gardens.set(buildingId, group);
    return group;
  }

  // ---------- building a floor ----------

  _floor(buildingId, level) {
    const key = `${buildingId}:${level}`;
    if (this.floors.has(key)) return this.floors.get(key);
    const b = this.building(buildingId);
    const floor = b.floorPlans.find((f) => f.level === level);
    const plan = buildPlan(floor);
    const H = plan.height;
    const group = new THREE.Group();
    group.name = `floor-${level}`;
    group.visible = false;
    const add = (geo, mat, name) => {
      if (!geo) return null;
      const m = new THREE.Mesh(geo, mat);
      m.name = name;
      group.add(m);
      return m;
    };

    // walls: the face towards a room is cream, every other face carries the white wall with the tan dado
    const corr = new BoxBatch(), room = new BoxBatch();
    for (const w of plan.walls) {
      const inner = w.inner ? (w.inner[0] > 0 ? 0 : w.inner[0] < 0 ? 1 : w.inner[1] > 0 ? 4 : 5) : -1;
      const d = { x0: w.x0, x1: w.x1, z0: w.z0, z1: w.z1, y0: w.y0, y1: w.y1, uvT: [2, IT.STOREY] };
      corr.push({ ...d, faces: inner >= 0 ? ALL_FACES & ~(1 << inner) : ALL_FACES });
      if (inner >= 0) room.push({ ...d, faces: 1 << inner });
    }
    add(corr.build(), this.mats.wallCorr, 'walls-corridor');
    add(room.build(), this.mats.wallRoom, 'walls-rooms');

    // floors by kind, ceilings
    for (const kind of ['granite', 'marble', 'green', 'concrete']) {
      const list = plan.floors.filter((f) => f.kind === kind).map((f) => paint(flatRect(f.x0, f.z0, f.x1, f.z1, f.y, TILE[kind]), 0xffffff));
      add(merge(list), this.mats[kind], `floor-${kind}`);
    }
    add(merge(plan.ceilings.map((c) => paint(flatRect(c.x0, c.z0, c.x1, c.z1, H, 2, true), 0xffffff))), this.mats.ceiling, 'ceiling');

    // the open arcade towards the courtyard: parapets with slots, columns and the slab edge
    add(new BoxBatch(plan.parapets.map((p) => ({ x0: p.x0, x1: p.x1, z0: p.z0, z1: p.z1, y0: 0, y1: p.h, uvT: [2.4, 1.28] }))).build(), this.mats.parapet, 'parapets');

    const det = new BoxBatch();
    for (const col of plan.columns) det.push(box(col.x, col.z, col.w, col.d, H, 0, 0xf1ede5));
    for (const f of plan.fascia) det.push(boxAB(f.x0, f.z0, f.x1, f.z1, f.y0, f.y1, 0xf1ede5));

    // what is seen across the courtyard: the other wings' storeys above and below this one
    if (plan.court) {
      const c = plan.court;
      const topY = (b.floors - level) * H + PARAPET_H;
      const botY = -(level * H + PLINTH);
      const sides = [
        { orient: 'h', coord: c.z0, lo: c.x0, hi: c.x1, face: 1 }, // north wing seen from the court: faces +z
        { orient: 'h', coord: c.z1, lo: c.x0, hi: c.x1, face: -1 },
        { orient: 'v', coord: c.x0, lo: c.z0, hi: c.z1, face: 1 },
        { orient: 'v', coord: c.x1, lo: c.z0, hi: c.z1, face: -1 },
      ];
      const facade = [];
      for (const s of sides) {
        const len = s.hi - s.lo, bays = Math.max(1, Math.round(len / 3.7));
        for (const [ya, yb] of [[botY, 0], [H, topY]]) {
          if (yb - ya < 0.01) continue;
          const va = ya / H, vb = yb / H;
          // corners left to right as seen from the court
          const [l, r] = (s.orient === 'h') === (s.face > 0) ? [s.lo, s.hi] : [s.hi, s.lo];
          const pt = (a, y) => (s.orient === 'h' ? [a, y, s.coord] : [s.coord, y, a]);
          const ul = ((l - s.lo) / len) * bays, ur = ((r - s.lo) / len) * bays;
          facade.push(paint(quad([pt(l, ya), pt(r, ya), pt(r, yb), pt(l, yb)], [[ul, va], [ur, va], [ur, vb], [ul, vb]]), 0xffffff));
        }
      }
      add(merge(facade), this.mats.facade, 'courtyard-facade');
    }

    // doors: jambs and a leaf swung open into the room so the opening stays clear
    const along = (nx, nz) => [-nz, nx];
    for (const d of plan.doors) {
      if (d.open) continue;
      const [ax, az] = along(d.nx, d.nz);
      const inset = WALL_T / 2;
      const jamb = (sgn) => box(d.x - d.nx * inset + ax * sgn * (d.width / 2 + 0.04), d.z - d.nz * inset + az * sgn * (d.width / 2 + 0.04), ax !== 0 ? 0.08 : 0.24, az !== 0 ? 0.08 : 0.24, DOOR.h, 0, 0x35545f);
      det.push(jamb(-1), jamb(1));
      const hinge = { x: d.x - ax * (d.width / 2 - 0.03), z: d.z - az * (d.width / 2 - 0.03) };
      const lx = hinge.x - d.nx * (WALL_T + 0.55), lz = hinge.z - d.nz * (WALL_T + 0.55);
      det.push(box(lx, lz, ax !== 0 ? 0.05 : d.width - 0.12, az !== 0 ? 0.05 : d.width - 0.12, DOOR.h - 0.08, 0, 0x5f8fae));
    }

    for (const f of plan.props.boxes) det.push(box(f.x, f.z, f.w, f.d, f.h, f.y, f.color));

    // ceiling lights
    for (const l of plan.lights) det.push(box(l.x, l.z, l.w, l.d, 0.06, H - 0.06, 0xfff8e6));

    // stairs and the lift
    for (const s of plan.stairs) for (const q of s.boxes) det.push(boxAB(q.x0, q.z0, q.x1, q.z1, q.y0, q.y1, q.color));
    for (const l of plan.lifts) det.push(...liftBoxes(l, H));

    // entrance door frame and glass doors (ground floor)
    if (plan.entrance) {
      const e = plan.entrance;
      const vertical = e.nx !== 0;
      const s = vertical ? e.nx : e.nz;
      const c = vertical ? e.z : e.x;
      const at = (a, depth, w, d, h, y, color) => (vertical ? box(e.x - s * depth, a, w, d, h, y, color) : box(a, e.z - s * depth, d, w, h, y, color));
      det.push(at(c - e.width / 2 - 0.05, 0.1, 0.16, 0.1, 2.4, 0, 0x35545f), at(c + e.width / 2 + 0.05, 0.1, 0.16, 0.1, 2.4, 0, 0x35545f));
      det.push(at(c, 0.1, 0.16, e.width + 0.2, 0.1, 2.3, 0x35545f));
      det.push(at(c, 0.03, 0.04, e.width - 0.1, 2.3, 0, 0xc9e3f1)); // glass doors
    }
    add(det.build(), this.mats.detail, 'details');

    // windows (steel frame, bright pane) as flat pictures on the walls
    const win = [
      ...plan.windows.map((w) => decorQuad(this.decorCells.window, w.w, w.h, w.x, w.y, w.z, w.nx, w.nz)),
      ...plan.props.decor.map((d) => decorQuad(this.decorCells[d.cell], d.w, d.h, d.x, d.y, d.z, d.nx, d.nz)),
    ];
    add(new QuadBatch(win).build(), this.mats.decor, 'windows');

    // signs: one atlas per floor (room numbers, stairs, lift, exit)
    const items = plan.signs.map((s) => ({ text: s.text, sub: s.sub, style: 'green' }));
    const extra = [];
    const hang = (label, landing, id) => {
      // a sign hung from the ceiling over the landing, facing the courtyard
      const c = plan.court ?? plan.outline;
      const fx = (c.x0 + c.x1) / 2 - landing.x, fz = (c.z0 + c.z1) / 2 - landing.z, fl = Math.hypot(fx, fz) || 1;
      extra.push({ text: label, style: 'green', x: landing.x, y: 3.0, z: landing.z, nx: fx / fl, nz: fz / fl, w: 1.5, h: 0.3, id });
    };
    for (const s of plan.stairs) hang(s.label ?? 'Stairs', s.landing, `stairs:${s.id}`);
    for (const l of plan.lifts) hang(l.label ?? 'Lift', l.landing, `lift:${l.id}`);
    if (plan.entrance) {
      const e = plan.entrance;
      extra.push({ text: 'EXIT', style: 'green', x: e.x - e.nx * 0.25, y: 2.75, z: e.z - e.nz * 0.25, nx: -e.nx, nz: -e.nz, w: 1.6, h: 0.3, id: 'exit' });
    }
    const all = [...plan.signs, ...extra];
    const atlas = signAtlas([...items, ...extra.map((x) => ({ text: x.text, style: x.style }))]);
    const geos = all.map((s, i) => {
      const g = signQuad(s.w, s.h, atlas.uv[i]);
      g.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.atan2(s.nx, s.nz)));
      g.translate(s.x, s.y - s.h / 2, s.z);
      return g;
    });
    const signMesh = new THREE.Mesh(merge(geos), new THREE.MeshBasicMaterial({ map: atlas.texture }));
    signMesh.name = 'signs';
    group.add(signMesh);

    // invisible pick volumes for doors, signs and the exit
    const picks = [];
    const pk = (p, data) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), this.pickMat);
      m.position.set(p.x, p.y, p.z);
      if (p.nx || p.nz) m.rotation.y = Math.atan2(p.nx, p.nz);
      m.visible = false;
      m.userData = data;
      group.add(m);
      picks.push(m);
    };
    for (const p of plan.picks) pk(p, { roomId: p.roomId, kind: p.kind });
    if (plan.entrance) {
      const e = plan.entrance;
      pk({ x: e.x - 0.2 * e.nx, y: 1.2, z: e.z - 0.2 * e.nz, w: e.nx ? 0.6 : e.width + 0.4, h: 2.4, d: e.nx ? e.width + 0.4 : 0.6 }, { kind: 'exit' });
    }

    const rooms = new Map(floor.rooms.map((r) => [r.id, r]));
    const roomMeshes = new Map(); // roomId -> Group (built when the viewer comes near)
    const built = {
      level, floor, plan, group, picks, rooms, roomMeshes,
      centres: floor.rooms.map((r) => ({ id: r.id, x: (r.bounds.x0 + r.bounds.x1) / 2, z: (r.bounds.z0 + r.bounds.z1) / 2 })),
      collider: new Collider(plan.colliders, plan.boundary),
    };
    this.group.add(group);
    this.floors.set(key, built);
    return built;
  }

  /** furniture and wall pictures of one room, built the first time it is needed */
  _roomMesh(built, id) {
    let g = built.roomMeshes.get(id);
    if (g) return g;
    g = new THREE.Group();
    g.name = `room-${id}`;
    const slot = built.plan.furniture[id];
    if (slot?.boxes.length) g.add(new THREE.Mesh(new BoxBatch(slot.boxes.map((f) => box(f.x, f.z, f.w, f.d, f.h, f.y, f.color))).build(), this.mats.detail));
    if (slot?.decor.length) g.add(new THREE.Mesh(new QuadBatch(slot.decor.map((d) => decorQuad(this.decorCells[d.cell], d.w, d.h, d.x, d.y, d.z, d.nx, d.nz))).build(), this.mats.decor));
    built.group.add(g);
    built.roomMeshes.set(id, g);
    return g;
  }

  // ---------- enter / exit / floors ----------

  async enter(buildingId, { level = 0 } = {}) {
    const app = this.app;
    if (this.active || !this.has(buildingId)) return false;
    app.nav.end();
    app.navUi.closeSheets();
    if (app.mode !== 'walk') {
      const f = app.world.doorFrames.find((d) => d.id === buildingId);
      await app.setMode('walk', f ? { spawn: { x: f.x + f.nx * 2.6, z: f.z + f.nz * 2.6, yaw: Math.atan2(f.nx, f.nz) } } : undefined); // facing the door
    }
    const built = this._floor(buildingId, level);
    this._garden(buildingId, built.plan);
    await app.hud.transition(() => this._swapIn(buildingId, built, built.plan.spawn), app.reducedMotion);
    return true;
  }

  _swapIn(buildingId, built, spawn) {
    const app = this.app, walk = app.walk, world = app.world;
    this._saved = { collider: walk.collider, onTap: walk.onTap, onRawTap: walk.onRawTap, pos: { x: walk.pos.x, z: walk.pos.z }, yaw: walk.yaw };
    this.buildingId = buildingId;
    this.level = built.level;
    this.active = true;
    this.prompt = null;
    world.setInterior(true, INDOOR);
    this.group.visible = true;
    built.group.visible = true;
    this._showGarden(built);
    walk.collider = built.collider;
    walk.onRawTap = (e) => this._rawTap(e);
    this._place(spawn);
    app.hud.root.dataset.interior = '1';
    app.hud.sync();
    this.emit('enter');
  }

  _showGarden(built) {
    const g = this.gardens.get(this.buildingId);
    if (!g) return;
    g.visible = true;
    g.position.y = -(built.level * built.plan.height);
  }

  _place({ x, z, yaw }) {
    const w = this.app.walk;
    w.pos.x = x;
    w.pos.z = z;
    w.collider.resolve(w.pos, PLAYER.radius);
    w.vel.x = w.vel.z = 0;
    w.yaw = yaw;
    w.pitch = 0;
    w.cancelTarget();
    w._apply(0);
  }

  /** Leave the building. `immediate`: no fade (used when another mode switch already fades). */
  async exit({ immediate = false } = {}) {
    if (!this.active) return;
    const app = this.app;
    const swap = () => this._swapOut();
    if (immediate) swap();
    else await app.hud.transition(swap, app.reducedMotion);
  }

  _swapOut() {
    const app = this.app, walk = app.walk, world = app.world;
    this.current?.group && (this.current.group.visible = false);
    const garden = this.gardens.get(this.buildingId);
    if (garden) garden.visible = false;
    this.group.visible = false;
    world.setInterior(false);
    walk.collider = this._saved.collider;
    walk.onTap = this._saved.onTap;
    walk.onRawTap = this._saved.onRawTap ?? null;
    const f = world.doorFrames.find((d) => d.id === this.buildingId);
    const b = this.building();
    const out = f ? { x: f.x + f.nx * 2.6, z: f.z + f.nz * 2.6 } : { x: b.doorPosition.x, z: b.doorPosition.z };
    // facing away from the door, as if you had just stepped out
    const w = walk;
    w.pos.x = out.x;
    w.pos.z = out.z;
    w.collider.resolve(w.pos, PLAYER.radius);
    w.vel.x = w.vel.z = 0;
    w.yaw = f ? Math.atan2(-f.nx, -f.nz) : 0;
    w.pitch = -6 * DEG;
    w.cancelTarget();
    w._apply(0);
    this.active = false;
    this.prompt = null;
    delete app.hud.root.dataset.interior;
    app.hud.sync();
    this.emit('exit');
  }

  /** Go to another floor. via: 'stairs' | 'lift' | 'selector' (the lift landing). `spotId`: the stairs the viewer is at. */
  async goToFloor(level, via = 'selector', spotId = null) {
    if (!this.active || level === this.level || !this.floorPlans.some((f) => f.level === level)) return false;
    const app = this.app;
    const built = this._floor(this.buildingId, level);
    const spot = via === 'stairs'
      ? built.plan.stairs.find((s) => s.id === spotId) ?? built.plan.stairs[0]
      : built.plan.lifts[0] ?? built.plan.stairs.find((s) => s.id === spotId) ?? built.plan.stairs[0];
    const swap = () => {
      this.current.group.visible = false;
      this.level = level;
      built.group.visible = true;
      this._showGarden(built);
      app.walk.collider = built.collider;
      this._place({ x: spot.landing.x, z: spot.landing.z, yaw: ARRIVE_YAW[spot.arrive] ?? 0 });
      this.prompt = null;
      this.emit('floor');
    };
    await app.hud.transition(swap, app.reducedMotion);
    return true;
  }

  // ---------- taps and prompts ----------

  /** screen tap: door or sign -> room card; the exit door -> leave. Returns true when handled. */
  _rawTap(e) {
    const cur = this.current;
    if (!cur) return false;
    const app = this.app;
    const r = app.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, app.camera);
    ray.far = 14;
    const hit = ray.intersectObjects(cur.picks, false)[0];
    if (!hit) return false;
    const d = hit.object.userData;
    if (d.kind === 'exit') {
      this.exit();
      return true;
    }
    this.emit('room', { room: cur.rooms.get(d.roomId), floor: cur.floor });
    return true;
  }

  openRoom(roomId) {
    const cur = this.current;
    const room = cur?.rooms.get(roomId);
    if (room) this.emit('room', { room, floor: cur.floor });
  }

  /** go inside (if needed), to the right floor, and stand in front of a room's door with its card open */
  async showRoom(buildingId, roomId, level = 0) {
    if (!this.has(buildingId)) return false;
    if (!this.active) await this.enter(buildingId, { level });
    else if (this.level !== level) await this.goToFloor(level, 'selector');
    const d = this.current?.plan.doors.find((x) => x.roomId === roomId && x.main);
    if (!d) return false;
    this._place({ x: d.x + d.nx * 1.8, z: d.z + d.nz * 1.8, yaw: Math.atan2(d.nx, d.nz) }); // facing the door
    this.openRoom(roomId);
    return true;
  }

  /** viewer walks to the corridor in front of a room door */
  walkToRoom(roomId) {
    const cur = this.current;
    const d = cur?.plan.doors.find((x) => x.roomId === roomId && x.main);
    if (d) this.app.walk.walkTo(d.x + d.nx * 1.3, d.z + d.nz * 1.3);
  }

  _setPrompt(best) {
    const key = best ? `${best.kind}:${best.id}` : '';
    if (key !== (this.prompt ? `${this.prompt.kind}:${this.prompt.id}` : '')) {
      this.prompt = best;
      this.emit('prompt');
    }
  }

  update() {
    const app = this.app;
    if (!this.active) {
      // outside: offer to go in when the viewer stands at the door of a building that has an interior
      let best = null;
      if (app.mode === 'walk' && app.walk?.active && app.nav.mode === 'none') {
        const p = app.walk.pos;
        let bd = ENTER_R;
        for (const f of app.world.doorFrames) {
          if (!this.has(f.id)) continue;
          const d = Math.hypot(p.x - f.x, p.z - f.z);
          if (d < bd) { bd = d; best = { kind: 'enter', id: f.id }; }
        }
      }
      this._setPrompt(best);
      return;
    }
    const cur = this.current;
    if (!cur) return;
    const p = app.walk.pos;
    let best = null, bd = Infinity;
    const consider = (kind, id, x, z, r) => {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < r && d < bd) { bd = d; best = { kind, id }; }
    };
    for (const s of cur.plan.stairs) consider('stairs', s.id, s.landing.x, s.landing.z, PROMPT_R);
    for (const l of cur.plan.lifts) consider('lift', l.id, l.landing.x, l.landing.z, PROMPT_R);
    if (cur.plan.entrance) consider('exit', 'exit', cur.plan.entrance.x, cur.plan.entrance.z, EXIT_R);
    this._setPrompt(best);

    // furniture only for the rooms around the viewer
    for (const c of cur.centres) {
      const near = Math.hypot(p.x - c.x, p.z - c.z) < ROOM_SHOW_R;
      const g = cur.roomMeshes.get(c.id);
      if (near && !g) this._roomMesh(cur, c.id);
      else if (g && g.visible !== near) g.visible = near;
    }
  }

  /** floors reachable with the stairs (one up or down) */
  stairTargets() {
    const levels = this.floorPlans.map((f) => f.level).sort((a, b) => a - b);
    const i = levels.indexOf(this.level);
    return { up: levels[i + 1] ?? null, down: levels[i - 1] ?? null };
  }

  floorInfo(level) {
    const f = this.floorPlans.find((x) => x.level === level);
    return f ? { level, short: floorShortLabel(f), label: floorLabel(f), sample: !!f.sample } : null;
  }
}
