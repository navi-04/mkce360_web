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
import { buildPlan, floorShortLabel, floorLabel, DOOR, WALL_T, PARAPET_H, PLINTH } from './plan.js';

const DEG = Math.PI / 180;
// open-air look: the courtyard shows the sky, so the fog is a light haze rather than a dark void
const INDOOR = { bg: 0xdbe6ee, hemi: 1.4, sun: 0.65, fogNear: 45, fogFar: 200, sky: true, hemiSky: 0xfff7ea, hemiGround: 0xf3eee4 };
const PROMPT_R = 2.4;
const EXIT_R = 3.0;
const ENTER_R = 8; // how close to a door the "Enter" prompt appears
const ROOM_SHOW_R = 15; // furniture of a room is built and shown within this distance
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
            if (b.topUv && n[1]) { uv[q] = b.topUv[0]; uv[q + 1] = b.topUv[1]; }
            else if (n[0]) { uv[q] = z / ut; uv[q + 1] = y / vt; }
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


// ---------- garden geometry ----------

class MeshBuf {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.uv = []; }

  vert(p, n, c, u, v) {
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    this.col.push(c[0], c[1], c[2]);
    this.uv.push(u, v);
  }

  build() {
    if (!this.pos.length) return null;
    return toGeometry(new Float32Array(this.pos), new Float32Array(this.nor), new Float32Array(this.col), new Float32Array(this.uv));
  }
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** a tapered tube from p0 to p1 (smooth radial normals), uv: u round, v along */
function tube(buf, p0, r0, p1, r1, sides, tint, uTile = 0.5, vTile = 1) {
  const d = norm(sub(p1, p0));
  const ref = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = norm(cross(d, ref)), w = cross(d, u);
  const len = Math.hypot(...sub(p1, p0));
  const ring = (c, r, k) => {
    const a = (k / sides) * Math.PI * 2;
    const nrm = [u[0] * Math.cos(a) + w[0] * Math.sin(a), u[1] * Math.cos(a) + w[1] * Math.sin(a), u[2] * Math.cos(a) + w[2] * Math.sin(a)];
    return { p: [c[0] + nrm[0] * r, c[1] + nrm[1] * r, c[2] + nrm[2] * r], n: nrm };
  };
  for (let k = 0; k < sides; k++) {
    const a0 = ring(p0, r0, k), a1 = ring(p0, r0, k + 1), b0 = ring(p1, r1, k), b1 = ring(p1, r1, k + 1);
    const cu0 = ((k / sides) * Math.PI * 2 * r0) / uTile, cu1 = (((k + 1) / sides) * Math.PI * 2 * r0) / uTile, vv = len / vTile;
    for (const [q, uu, vq] of [[a0, cu0, 0], [a1, cu1, 0], [b1, cu1, vv], [a0, cu0, 0], [b1, cu1, vv], [b0, cu0, vv]]) buf.vert(q.p, q.n, tint, uu, vq);
  }
}

/** a flat hexagon-ish disc of leaves, tilted, with uv in world metres so leaflets keep their size */
function leafDisc(buf, c, radius, tiltX, tiltZ, tint, uOff, tile = 1.6, segs = 11) {
  const ct = Math.cos(tiltX), st = Math.sin(tiltX), cz = Math.cos(tiltZ), sz = Math.sin(tiltZ);
  const at = (a, rr) => {
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    // tilt about x then z
    const y1 = z * st, z1 = z * ct;
    const x2 = x * cz - y1 * sz, y2 = x * sz + y1 * cz;
    return [c[0] + x2, c[1] + y2, c[2] + z1];
  };
  const n = norm([-sz * ct, cz * ct, st]);
  const ctr = [c[0], c[1], c[2]];
  for (let k = 0; k < segs; k++) {
    // an uneven rim so the crowns do not read as polygons
    const j1 = 0.8 + 0.38 * hashf(k + uOff * 13, 1.7), j2 = 0.8 + 0.38 * hashf(((k + 1) % segs) + uOff * 13, 1.7);
    const p1 = at((k / segs) * Math.PI * 2, radius * j1), p2 = at(((k + 1) / segs) * Math.PI * 2, radius * j2);
    for (const q of [ctr, p1, p2]) buf.vert(q, n, tint, (q[0] + uOff) / tile, (q[2] + uOff * 0.7) / tile);
  }
}

function hashf(a, b) {
  const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/** the lawn as a grid of quads whose vertex colours carry the shade of the trees and the building edges, and bare soil under the trunks */
function lawnGeo(g, y) {
  const r = g.rect, m = 0.4, STEP = 2.5;
  const x0 = r.x0 - m, x1 = r.x1 + m, z0 = r.z0 - m, z1 = r.z1 + m;
  const nx = Math.ceil((x1 - x0) / STEP), nz = Math.ceil((z1 - z0) / STEP);
  const colorAt = (x, z) => {
    let f = 1, soil = 0;
    for (const t of g.trees) {
      const d = Math.hypot(x - t.x, z - t.z), R = t.s * 1.7;
      if (d < R) { const k = 1 - d / R; f -= 0.38 * k * k * (3 - 2 * k); }
      if (d < 1.9) soil = Math.max(soil, 1 - d / 1.9);
    }
    const de = Math.min(x - r.x0, r.x1 - x, z - r.z0, r.z1 - z);
    if (de < 3.5) f *= 0.8 + 0.2 * Math.max(0, de) / 3.5;
    f *= 0.9 + 0.2 * hashf(Math.floor(x * 0.45), Math.floor(z * 0.45));
    f = Math.max(0.35, f);
    return [f * (1 - 0.18 * soil), f * (1 - 0.34 * soil), f * (1 - 0.46 * soil)];
  };
  const buf = new MeshBuf();
  const up = [0, 1, 0];
  const T = 3.5; // texture tile in metres
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const xa = x0 + (i * (x1 - x0)) / nx, xb = x0 + ((i + 1) * (x1 - x0)) / nx, za = z0 + (j * (z1 - z0)) / nz, zb = z0 + ((j + 1) * (z1 - z0)) / nz;
      const A = [xa, za], B = [xa, zb], C = [xb, zb], D = [xb, za];
      for (const q of [A, B, C, A, C, D]) buf.vert([q[0], y, q[1]], up, colorAt(q[0], q[1]), q[0] / T, q[1] / T);
    }
  }
  return buf.build();
}

/** a horizontal quad (four corners) facing up or down, uv in world metres along (u,v) axes */
function slopeQuad(buf, pts, up, uvOf) {
  let order = [0, 1, 2, 3];
  const n = cross(sub(pts[1], pts[0]), sub(pts[2], pts[1]));
  if ((n[1] > 0) !== up) order = [3, 2, 1, 0];
  const nn = norm(n);
  const nrm = up ? (nn[1] > 0 ? nn : [-nn[0], -nn[1], -nn[2]]) : (nn[1] < 0 ? nn : [-nn[0], -nn[1], -nn[2]]);
  const w = [1, 1, 1];
  for (const k of [0, 1, 2, 0, 2, 3]) {
    const q = pts[order[k]];
    const [u, v] = uvOf(q);
    buf.vert(q, nrm, w, u, v);
  }
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
    this.quality = { trees: 1 };
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
      parapetOuter: lam(IT.parapetOuter()),
      roofSheet: lam(IT.roofSheet()),
      fascia: lam(IT.fasciaRib()),
      bark: lam(IT.barkTexture()),
      leaf: new THREE.MeshLambertMaterial({ map: IT.leafTexture(false), vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide }),
      shrub: new THREE.MeshLambertMaterial({ map: IT.leafTexture(true), vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide }),
      facade: lam(IT.arcadeFacade()),
      paver: lam(IT.hexPaver()),
      grass: lam(grass),
      decor: lam(decor.texture),
      detail: new THREE.MeshLambertMaterial({ vertexColors: true }),
    };
    this.mats.ceiling.emissive.set(0x6c685f); // the ceiling only sees the ground half of the light; keep it white
    this.mats.roofSheet.emissive.set(0x555049); // the same for the underside of the walkway roof
    this.mats.fascia.emissive.set(0x403c36);
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

  /** the automatic quality level: the hanging foliage of the trees is the first thing to go */
  setQuality(q) {
    this.quality = q;
    for (const g of this.gardens.values()) if (g.userData.extra) g.userData.extra.visible = q.trees >= 0.7;
  }

  /** upload the interior textures to the GPU at start-up (the first draw would otherwise stall) */
  warmTextures(renderer) {
    for (const m of Object.values(this.mats)) if (m.map) renderer.initTexture(m.map);
    this._loadPhotos(renderer);
  }

  /** the lawn, the pavers and the bark are cut out of the photos of the courtyard (public/textures/interior); the canvas textures stay if they are missing */
  _loadPhotos(renderer) {
    const base = import.meta.env.BASE_URL + 'textures/interior/';
    const take = (file, mat) => new THREE.TextureLoader().load(base + file, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      mat.map = t;
      renderer.initTexture(t);
    }, undefined, () => {});
    take('lawn.jpg', this.mats.grass);
    take('paver.jpg', this.mats.paver);
    take('bark.jpg', this.mats.bark);
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
    const y = -PLINTH;
    const mesh = (geo, mat, name) => {
      if (!geo) return;
      const m = new THREE.Mesh(geo, mat);
      m.name = name;
      group.add(m);
    };

    // lawn with baked shade, the hex-paver paths and their stone kerbs
    mesh(lawnGeo(g, y), this.mats.grass, 'lawn');
    mesh(merge(g.paths.map((q) => paint(flatRect(q.x0, q.z0, q.x1, q.z1, y + 0.03, 1.3), 0xffffff))), this.mats.paver, 'paths');
    const solid = new BoxBatch();
    for (const k of g.kerbs) solid.push({ x0: k.x0, x1: k.x1, z0: k.z0, z1: k.z1, y0: y, y1: y + 0.11, color: 0xb4b2ac });

    // the roofed walkway round the yard: granite floor, curb and posts, steel columns, beams, ribbed roof and fascia, steps
    const k = g.canopy;
    if (k) {
      mesh(merge(k.strips.map((q) => paint(flatRect(q.x0, q.z0, q.x1, q.z1, 0, TILE.granite), 0xffffff))), this.mats.granite, 'walkway-floor');
      for (const q of [...k.coping, ...k.copingTop, ...k.beams, ...k.steps]) solid.push(q);
      const cols = [];
      for (const c of k.columns) {
        const cyl = new THREE.CylinderGeometry(c.r, c.r, c.y1 - c.y0, 8).toNonIndexed();
        cyl.translate(c.x, (c.y0 + c.y1) / 2, c.z);
        cols.push(paint(cyl, 0x4a6468));
      }
      mesh(merge(cols), this.mats.detail, 'steel-columns');
      mesh(new BoxBatch(k.fascia.map((q) => ({ ...q, uvT: [0.64, 0.64], color: 0xffffff }))).build(), this.mats.fascia, 'fascia');
      const roof = new MeshBuf();
      for (const q of k.roof) {
        const pts = q.orient === 'h'
          ? [[q.x0, q.ya, q.za], [q.x1, q.ya, q.za], [q.x1, q.yb, q.zb], [q.x0, q.yb, q.zb]]
          : [[q.xa, q.ya, q.z0], [q.xa, q.ya, q.z1], [q.xb, q.yb, q.z1], [q.xb, q.yb, q.z0]];
        const uvOf = q.orient === 'h' ? (v) => [v[0] / 1.2, v[2] / 1.2] : (v) => [v[2] / 1.2, v[0] / 1.2];
        slopeQuad(roof, pts, true, uvOf);
        slopeQuad(roof, pts, false, uvOf);
      }
      mesh(roof.build(), this.mats.roofSheet, 'roof');
    }
    if (k) {
      // a strip of red laterite soil between the curb and the lawn, as in the photos
      for (const sd of g.sides) {
        const n = sd.orient === 'h' ? sd.nz : sd.nx;
        const w0 = 0.15, w1 = 1.0;
        for (const [a0, a1] of [[sd.lo, sd.mid - g.gap / 2], [sd.mid + g.gap / 2, sd.hi]]) {
          const c0 = sd.coord - n * w0, c1 = sd.coord - n * w1;
          const lo = Math.min(c0, c1), hi = Math.max(c0, c1);
          solid.push(sd.orient === 'h' ? { x0: a0, x1: a1, z0: lo, z1: hi, y0: y, y1: y + 0.02, color: 0xa9603f } : { x0: lo, x1: hi, z0: a0, z1: a1, y0: y, y1: y + 0.02, color: 0xa9603f });
        }
      }
    }
    mesh(solid.build(), this.mats.detail, 'curbs-steps');

    // trees: slender leaning trunks with a few branches under layered crowns of leaves
    const BARK = [[1, 0.96, 0.9], [0.92, 0.88, 0.84], [1.04, 1, 0.94]];
    const GREENS = [[0.78, 0.92, 0.62], [0.86, 1, 0.68], [0.7, 0.86, 0.58], [0.92, 1, 0.7]];
    const trunks = new MeshBuf(), crowns = new MeshBuf(), extras = new MeshBuf(), shrubs = new MeshBuf();
    for (const t of g.trees) {
      const rnd = (() => { let a = t.seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let x = a; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; })();
      const ht = t.h * 0.55, shift = t.lean * ht * 0.6;
      const dx = Math.cos(t.leanDir) * shift, dz = Math.sin(t.leanDir) * shift;
      const P0 = [t.x, y, t.z], P1 = [t.x + dx * 0.45, y + ht * 0.55, t.z + dz * 0.45], P2 = [t.x + dx, y + ht, t.z + dz];
      const bark = BARK[t.tone % BARK.length];
      tube(trunks, P0, 0.21, P1, 0.15, 6, bark);
      tube(trunks, P1, 0.15, P2, 0.11, 6, bark);
      const tips = [];
      for (let b = 0; b < 3; b++) {
        const ang = rnd() * Math.PI * 2, reach = 0.9 + rnd() * 1.2, rise = 0.9 + rnd() * 1.1;
        const from = b === 2 ? P1 : P2;
        const tip = [from[0] + Math.cos(ang) * reach, from[1] + rise, from[2] + Math.sin(ang) * reach];
        tube(trunks, from, 0.075, tip, 0.03, 4, bark);
        tips.push(tip);
      }
      const green = GREENS[t.tone % GREENS.length];
      const C = [P2[0], P2[1] + 0.6, P2[2]];
      for (let d = 0; d < 7; d++) {
        const f = d / 6;
        const ctr = [C[0] + (rnd() - 0.5) * t.s * 1.1, C[1] + 0.1 + f * 2.1, C[2] + (rnd() - 0.5) * t.s * 1.1];
        const rad = t.s * (1.05 - 0.3 * f) * (0.8 + rnd() * 0.35);
        const lum = 0.66 + 0.4 * f;
        leafDisc(crowns, ctr, rad, (rnd() - 0.5) * 0.55, (rnd() - 0.5) * 0.55, [green[0] * lum, green[1] * lum, green[2] * lum], rnd() * 5);
      }
      // foliage hanging round the rim of the crown
      for (let d = 0; d < 7; d++) {
        const ang = (d / 7) * Math.PI * 2 + rnd();
        const rim = t.s * (0.7 + rnd() * 0.3);
        const ctr = [C[0] + Math.cos(ang) * rim, C[1] + 0.2 + rnd() * 0.6, C[2] + Math.sin(ang) * rim];
        const lum = 0.62 + 0.15 * rnd();
        leafDisc(extras, ctr, t.s * (0.45 + rnd() * 0.25), Math.sin(ang) * 0.95, -Math.cos(ang) * 0.95, [green[0] * lum, green[1] * lum, green[2] * lum], rnd() * 5, 1.6, 9);
      }
      for (const tip of tips) leafDisc(extras, [tip[0], tip[1] + 0.1, tip[2]], t.s * 0.55, (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.5, [green[0] * 0.85, green[1] * 0.85, green[2] * 0.85], rnd() * 5);
    }
    for (const sh of g.shrubs) {
      const rnd = (() => { let a = sh.seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let x = a; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; })();
      for (let d = 0; d < 4; d++) {
        const f = d / 3;
        leafDisc(shrubs, [sh.x + (rnd() - 0.5) * sh.s * 0.8, y + 0.25 + f * 0.75, sh.z + (rnd() - 0.5) * sh.s * 0.8], sh.s * (1 - 0.3 * f), (rnd() - 0.5) * 0.7, (rnd() - 0.5) * 0.7, [0.85, 1, 0.75], rnd() * 5, 1.2, 8);
      }
    }
    mesh(trunks.build(), this.mats.bark, 'trunks');
    mesh(crowns.build(), this.mats.leaf, 'crowns');
    mesh(extras.build(), this.mats.leaf, 'crowns-extra'); // hanging foliage: dropped on slow devices
    group.userData.extra = group.children[group.children.length - 1];
    group.userData.extra.visible = this.quality.trees >= 0.7;
    mesh(shrubs.build(), this.mats.shrub, 'shrubs');

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
    // the face towards the courtyard (and the top) is cream with X and slot openings, the face towards the verandah is brown
    const pOut = new BoxBatch(), pIn = new BoxBatch();
    for (const q of plan.parapets) {
      const bit = -q.nx > 0 ? 0 : -q.nx < 0 ? 1 : -q.nz > 0 ? 4 : 5;
      const d = { x0: q.x0, x1: q.x1, z0: q.z0, z1: q.z1, y0: 0, y1: q.h, uvT: [2.4, 1.28], topUv: [0.5, 0.95] };
      pOut.push({ ...d, faces: (1 << bit) | (1 << 2) });
      pIn.push({ ...d, faces: ALL_FACES & ~((1 << bit) | (1 << 2)) });
    }
    add(pIn.build(), this.mats.parapet, 'parapets');
    add(pOut.build(), this.mats.parapetOuter, 'parapets-outside');

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
        const len = s.hi - s.lo, bays = 2 * Math.max(1, Math.round(len / 7.4)); // two bays per texture tile
        for (const [ya, yb] of [[botY, 0], [H, topY]]) {
          if (plan.walkway && ya === botY) continue; // hidden under the walkway floor
          if (yb - ya < 0.01) continue;
          const va = ya / H, vb = yb / H;
          // corners left to right as seen from the court
          const [l, r] = (s.orient === 'h') === (s.face > 0) ? [s.lo, s.hi] : [s.hi, s.lo];
          const pt = (a, y) => (s.orient === 'h' ? [a, y, s.coord] : [s.coord, y, a]);
          const ul = ((l - s.lo) / len) * (bays / 2), ur = ((r - s.lo) / len) * (bays / 2);
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
      // steel mullions between the door leaves (one leaf per 1.2 m) and a transom
      for (let k = 1; k < Math.round(e.width / 1.2); k++) det.push(at(c - e.width / 2 + (k * e.width) / Math.round(e.width / 1.2), 0.07, 0.06, 0.06, 2.3, 0, 0x6b7a84));
      if (e.width > 2.6) det.push(at(c, 0.07, 0.06, e.width - 0.1, 0.06, 2.15, 0x6b7a84));
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
    walk.groundFn = built.plan.walkway ? built.plan.groundAt : null; // the yard is lower than the walkway
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
    walk.groundFn = null;
    walk.groundY = 0;
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
      app.walk.groundFn = built.plan.walkway ? built.plan.groundAt : null;
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
          const d = Math.hypot(p.x - f.x, p.z - f.z) - (f.reach ?? 0) * 0.5; // a deep porch is noticed from a little further away
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
