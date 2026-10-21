// Small geometry helpers. Everything is built non-indexed with position/normal/uv/color so that
// geometries can be merged into a handful of meshes (few draw calls on mobile).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const DEG = Math.PI / 180;

const _c = new THREE.Color();

/** Paint a geometry with one colour (hex, sRGB) as a vertex colour attribute. */
export function paint(geo, hex) {
  _c.set(hex);
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = _c.r;
    col[i * 3 + 1] = _c.g;
    col[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/** Box with world-aligned planar UVs (uv = metres / scale). Base sits at y=0 by default. */
export function boxGeo(w, h, d, { scale = 4, y = 0, x = 0, z = 0, grounded = true } = {}) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i));
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
    if (nx > 0.5) uv.setXY(i, pz / scale, py / scale);
    else if (ny > 0.5) uv.setXY(i, px / scale, pz / scale);
    else uv.setXY(i, px / scale, py / scale);
  }
  g.translate(x, y + (grounded ? h / 2 : 0), z);
  return g;
}

/**
 * Four walls of a box (no top/bottom). UVs are fitted so a whole number of window bays and floors
 * fit each face: u in [0,nBays], v in [0,nFloors] (use RepeatWrapping textures).
 */
export function wallsGeo(w, h, d, { floorH = 3.6, bayW = 3.6, tile = true } = {}) {
  const nF = tile ? Math.max(1, Math.round(h / floorH)) : 1;
  const faces = [
    // [from(x,z), to(x,z), normal(x,z), length]  (from -> to runs left->right seen from outside)
    [[-w / 2, d / 2], [w / 2, d / 2], [0, 1], w], // south (+z)
    [[w / 2, -d / 2], [-w / 2, -d / 2], [0, -1], w], // north (-z)
    [[w / 2, d / 2], [w / 2, -d / 2], [1, 0], d], // east (+x)
    [[-w / 2, -d / 2], [-w / 2, d / 2], [-1, 0], d], // west (-x)
  ];
  const pos = [], nor = [], uv = [];
  for (const [a, b, n, len] of faces) {
    const nB = tile ? Math.max(1, Math.round(len / bayW)) : 1;
    const v = [
      [a[0], 0, a[1], 0, 0],
      [b[0], 0, b[1], nB, 0],
      [b[0], h, b[1], nB, nF],
      [a[0], h, a[1], 0, nF],
    ];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      pos.push(v[i][0], v[i][1], v[i][2]);
      nor.push(n[0], 0, n[1]);
      uv.push(v[i][3], v[i][4]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/**
 * The four faces of a w x d box with window-bay uvs like wallsGeo (u in [0,nBays], v in [0,nFloors]), or with `inward` the four
 * faces of a hole of that size seen from inside it. `door` cuts a doorway into one outward face:
 * { face: 'n'|'s'|'e'|'w', lat, width, height } (lat = position along that face in the box frame: x for n and s, z for e and w).
 * Used for the skin of a building that has an inside to walk in (no faces between wings, nothing hidden behind another face).
 */
export function shellGeo(w, d, h, { floorH = 3.6, bayW = 3.6, inward = false, door = null } = {}) {
  const nF = Math.max(1, Math.round(h / floorH));
  const faces = [
    // [from(x,z), to(x,z), normal(x,z), length, key]  (from -> to runs left->right seen from outside)
    [[-w / 2, d / 2], [w / 2, d / 2], [0, 1], w, 's'],
    [[w / 2, -d / 2], [-w / 2, -d / 2], [0, -1], w, 'n'],
    [[w / 2, d / 2], [w / 2, -d / 2], [1, 0], d, 'e'],
    [[-w / 2, -d / 2], [-w / 2, d / 2], [-1, 0], d, 'w'],
  ];
  const pos = [], nor = [], uv = [];
  for (const [a0, b0, n0, len, key] of faces) {
    const a = inward ? b0 : a0, b = inward ? a0 : b0;
    const n = inward ? [-n0[0], -n0[1]] : n0;
    const nB = Math.max(1, Math.round(len / bayW));
    // pieces of the face as [t0, t1, y0, y1]: t is the share along the face from `a`
    let pieces = [[0, 1, 0, h]];
    if (door && !inward && door.face === key) {
      const t = key === 'n' ? (w / 2 - door.lat) / w : key === 's' ? (door.lat + w / 2) / w : key === 'e' ? (d / 2 - door.lat) / d : (door.lat + d / 2) / d;
      const t0 = Math.max(0, t - door.width / 2 / len), t1 = Math.min(1, t + door.width / 2 / len);
      pieces = [[0, t0, 0, h], [t1, 1, 0, h], [t0, t1, door.height, h]];
    }
    for (const [t0, t1, y0, y1] of pieces) {
      if (t1 - t0 < 1e-6 || y1 - y0 < 1e-6) continue;
      const at = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const p0 = at(t0), p1 = at(t1);
      const v = [
        [p0[0], y0, p0[1], t0 * nB, (y0 / h) * nF],
        [p1[0], y0, p1[1], t1 * nB, (y0 / h) * nF],
        [p1[0], y1, p1[1], t1 * nB, (y1 / h) * nF],
        [p0[0], y1, p0[1], t0 * nB, (y1 / h) * nF],
      ];
      for (const i of [0, 1, 2, 0, 2, 3]) {
        pos.push(v[i][0], v[i][1], v[i][2]);
        nor.push(n[0], 0, n[1]);
        uv.push(v[i][3], v[i][4]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** Gable roof (ridge along the longer side). Sits on y = 0; translate afterwards. */
export function gableGeo(w, d, rise, overhang = 0.5, scale = 2.5) {
  const W = w + overhang * 2, D = d + overhang * 2;
  const alongX = w >= d;
  const pos = [], uv = [];
  const tri = (a, b, c) => {
    for (const p of [a, b, c]) {
      pos.push(p[0], p[1], p[2]);
      uv.push(p[0] / scale, p[2] / scale);
    }
  };
  const hx = W / 2, hz = D / 2;
  if (alongX) {
    // ridge from (-hx,rise,0) to (hx,rise,0)
    tri([-hx, 0, hz], [hx, 0, hz], [hx, rise, 0]);
    tri([-hx, 0, hz], [hx, rise, 0], [-hx, rise, 0]);
    tri([hx, 0, -hz], [-hx, 0, -hz], [-hx, rise, 0]);
    tri([hx, 0, -hz], [-hx, rise, 0], [hx, rise, 0]);
    tri([hx, 0, hz], [hx, 0, -hz], [hx, rise, 0]); // gable ends
    tri([-hx, 0, -hz], [-hx, 0, hz], [-hx, rise, 0]);
  } else {
    // ridge along z at x = 0; every triangle wound counter-clockwise seen from outside
    tri([hx, 0, hz], [hx, 0, -hz], [0, rise, -hz]); // east slope
    tri([hx, 0, hz], [0, rise, -hz], [0, rise, hz]);
    tri([-hx, 0, -hz], [-hx, 0, hz], [0, rise, hz]); // west slope
    tri([-hx, 0, -hz], [0, rise, hz], [0, rise, -hz]);
    tri([hx, 0, -hz], [-hx, 0, -hz], [0, rise, -hz]); // north gable
    tri([-hx, 0, hz], [hx, 0, hz], [0, rise, hz]); // south gable
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Flat horizontal quad (w along x, d along z) at height y, uv in [0,1]. */
export function flatQuad(w, d, y = 0, uvRepeatX = 1, uvRepeatY = 1) {
  const g = new THREE.PlaneGeometry(w, d).toNonIndexed();
  g.rotateX(-Math.PI / 2); // normal +y, local +y (uv v=1) -> -z (north)
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvRepeatX, uv.getY(i) * uvRepeatY);
  g.translate(0, y, 0);
  return g;
}

/** Vertical plane facing +z (centre at origin, base at y=0) with explicit uv rect [u0,v0,u1,v1]. */
export function signQuad(w, h, uvRect = [0, 0, 1, 1]) {
  const [u0, v0, u1, v1] = uvRect;
  const hw = w / 2;
  const pos = [-hw, 0, 0, hw, 0, 0, hw, h, 0, -hw, 0, 0, hw, h, 0, -hw, h, 0];
  const uv = [u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1];
  const nor = new Array(6).fill([0, 0, 1]).flat();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/**
 * A ribbon (strip) along the segment a->b with the given width at height y.
 * u across the strip [0,1] (scaled by uScale), v along it (length / vMetres).
 */
export function ribbonGeo(ax, az, bx, bz, width, y, { vMetres = 8, uScale = 1 } = {}) {
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz) || 1e-6;
  const nx = -dz / len, nz = dx / len; // left normal (in x/z plane)
  const hw = width / 2;
  const p = [
    [ax - nx * hw, az - nz * hw, 0, 0],
    [ax + nx * hw, az + nz * hw, uScale, 0],
    [bx + nx * hw, bz + nz * hw, uScale, len / vMetres],
    [bx - nx * hw, bz - nz * hw, 0, len / vMetres],
  ];
  const order = [0, 1, 2, 0, 2, 3]; // counter-clockwise seen from above (+y normal)
  const pos = [], uv = [], nor = [];
  for (const i of order) {
    pos.push(p[i][0], y, p[i][1]);
    uv.push(p[i][2], p[i][3]);
    nor.push(0, 1, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

export function discGeo(radius, y, segments = 14, uvScale = 8) {
  const g = new THREE.CircleGeometry(radius, segments).toNonIndexed();
  g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv;
  const pos = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / uvScale, pos.getZ(i) / uvScale);
  g.translate(0, y, 0);
  return g;
}

export function cylGeo(rTop, rBottom, h, seg = 6, y = 0) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1).toNonIndexed();
  g.translate(0, y + h / 2, 0);
  return g;
}

/** Apply translation + rotation about Y (radians, three.js sense) to a geometry (in place). */
const _m = new THREE.Matrix4();
const _r = new THREE.Matrix4();
export function place(geo, x, y, z, rotY = 0) {
  _m.makeTranslation(x, y, z);
  if (rotY) _m.multiply(_r.makeRotationY(rotY));
  geo.applyMatrix4(_m);
  return geo;
}

/** Merge (non-indexed, same attributes). Returns null for an empty list. */
export function merge(list) {
  if (!list.length) return null;
  const norm = list.map((g) => {
    const x = g.index ? g.toNonIndexed() : g;
    if (!x.attributes.normal) x.computeVertexNormals();
    if (!x.attributes.uv) x.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(x.attributes.position.count * 2), 2));
    return x;
  });
  return mergeGeometries(norm, false);
}

/** Deterministic seeded RNG (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Slightly vary a hex colour by id (+-5% lightness) so identical types do not look cloned. */
export function vary(hex, id, amount = 0.05) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  const r = (hashString(id) % 1000) / 1000 - 0.5;
  c.setHSL(hsl.h, hsl.s, Math.min(0.98, Math.max(0.05, hsl.l + r * amount * 2)));
  return c.getHex();
}
