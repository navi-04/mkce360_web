// Scenery: trees, coconut palms, lamp posts, benches (all instanced), boundary wall and gates.
import * as THREE from 'three';
import { cylGeo, boxGeo, paint, merge, place, rng, signQuad, DEG } from './geo.js';
import { signAtlas } from './textures.js';

const smooth = (x, a, b) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function ni(g) {
  return g.index ? g.toNonIndexed() : g;
}

function treeGeometry() {
  const trunk = paint(cylGeo(0.16, 0.27, 2.8, 5), 0x6b4b34);
  const blob = (r, x, y, z, sy, col) => {
    const g = ni(new THREE.IcosahedronGeometry(r, 0));
    g.scale(1, sy, 1);
    g.translate(x, y, z);
    return paint(g, col);
  };
  return merge([trunk, blob(1.9, 0, 3.9, 0, 0.8, 0x4d8a3a), blob(1.35, 1.0, 4.7, 0.4, 0.85, 0x5b9c45), blob(1.25, -0.9, 4.3, -0.5, 0.85, 0x45803a)]);
}

function palmGeometry(fronds) {
  const parts = [paint(cylGeo(0.13, 0.24, 9.6, 5), 0x8c7655)];
  if (fronds) {
    for (let i = 0; i < 8; i++) {
      const L = 3.4 + (i % 3) * 0.35;
      const pos = [
        0, 9.5, 0, L * 0.5, 10.25, 0.55, L, 8.95, 0,
        0, 9.5, 0, L, 8.95, 0, L * 0.5, 10.25, -0.55,
      ];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(12).fill(0), 2));
      g.computeVertexNormals();
      g.rotateY((i / 8) * Math.PI * 2 + (i % 2) * 0.25);
      parts.push(paint(g, i % 2 ? 0x3f8a36 : 0x4b9a3d));
    }
  } else {
    const cone = ni(new THREE.ConeGeometry(2.2, 2.6, 6));
    cone.translate(0, 10.6, 0);
    parts.push(paint(cone, 0x428a3a));
  }
  return merge(parts);
}

function lampGeometry() {
  const pole = paint(cylGeo(0.07, 0.1, 5.2, 5), 0x4a5058);
  const arm = paint(boxGeo(0.9, 0.08, 0.08, { y: 5.2, x: 0.4 }), 0x4a5058);
  const head = paint(boxGeo(0.5, 0.14, 0.26, { y: 5.12, x: 0.85 }), 0xfff1c2);
  return merge([pole, arm, head]);
}

function benchGeometry() {
  const seat = paint(boxGeo(1.7, 0.07, 0.46, { y: 0.45 }), 0x8a5a3a);
  const back = paint(boxGeo(1.7, 0.4, 0.06, { y: 0.78, z: -0.2 }), 0x8a5a3a);
  const l1 = paint(boxGeo(0.08, 0.45, 0.4, { x: -0.7 }), 0x3b4046);
  const l2 = paint(boxGeo(0.08, 0.45, 0.4, { x: 0.7 }), 0x3b4046);
  return merge([seat, back, l1, l2]);
}

export function createScenery(data, T, { doorFrames, colliders }) {
  const group = new THREE.Group();
  group.name = 'scenery';
  const R = rng(20261006);

  // ---------- exclusion tests ----------
  const obbs = data.buildings.map((b) => ({
    cx: b.position.x, cz: b.position.z, hw: b.size.w / 2, hd: b.size.d / 2, rot: -b.rotationDeg * DEG,
  }));
  const inObb = (o, x, z, m) => {
    const dx = x - o.cx, dz = z - o.cz, c = Math.cos(o.rot), s = Math.sin(o.rot);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.abs(lx) < o.hw + m && Math.abs(lz) < o.hd + m;
  };
  const nodes = new Map(data.paths.nodes.map((n) => [n.id, n]));
  const segs = data.paths.edges.map((e) => ({ a: nodes.get(e.from), b: nodes.get(e.to), hw: e.width / 2 }));
  const segDist = (px, pz, a, b) => {
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(a.x + t * dx - px, a.z + t * dz - pz);
  };
  const bp = data.boundary.points;
  const minX = Math.min(...bp.map((p) => p.x)), maxX = Math.max(...bp.map((p) => p.x));
  const minZ = Math.min(...bp.map((p) => p.z)), maxZ = Math.max(...bp.map((p) => p.z));
  const free = (x, z, margin = 2) => {
    if (x < minX + 4 || x > maxX - 4 || z < minZ + 4 || z > maxZ - 4) return false;
    for (const o of obbs) if (inObb(o, x, z, margin)) return false;
    for (const o of data.openAreas ?? []) {
      if (Math.abs(x - o.position.x) < o.size.w / 2 + margin && Math.abs(z - o.position.z) < o.size.d / 2 + margin) return false;
    }
    for (const s of segs) if (segDist(x, z, s.a, s.b) < s.hw + margin) return false;
    return true;
  };

  // ---------- trees & palms ----------
  const trees = []; // {x,z,s,r}
  const palms = [];
  const palmDensity = (x, z) => {
    let d = smooth(-x, 130, 250);
    if (z > 130 && x < -55) d = Math.max(d, 0.75);
    return d;
  };
  const STEP = 7.2;
  for (let x = minX + 8; x < maxX - 6; x += STEP) {
    for (let z = minZ + 8; z < maxZ - 6; z += STEP) {
      const jx = x + (R() - 0.5) * STEP * 0.8, jz = z + (R() - 0.5) * STEP * 0.8;
      if (R() > palmDensity(jx, jz) * 0.9) continue;
      if (!free(jx, jz, 3)) continue;
      palms.push({ x: jx, z: jz, s: 0.8 + R() * 0.55, r: R() * 6.28 });
    }
  }
  // tree-lined roads: broadleaf trees and palms alternate along the main roads
  for (const e of data.paths.edges) {
    if (e.type !== 'road') continue;
    const a = nodes.get(e.from), b = nodes.get(e.to);
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 12) continue;
    const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
    let side = 1, i = 0;
    for (let t = 6; t < len - 4; t += 15, i++) {
      const off = e.width / 2 + 3.6 + R() * 1.2;
      const x = a.x + ux * t - uz * off * side, z = a.z + uz * t + ux * off * side;
      side = -side;
      if (!free(x, z, 1.6)) continue;
      (i % 3 === 2 ? palms : trees).push({ x, z, s: 0.9 + R() * 0.4, r: R() * 6.28 });
    }
  }
  // inner courtyard of ring-shaped blocks
  for (const b of data.buildings) {
    if (b.form !== 'ring') continue;
    const iw = b.size.w - 2 * b.ring.thickness, id = b.size.d - 2 * b.ring.thickness;
    const rot = -b.rotationDeg * DEG, c = Math.cos(rot), s = Math.sin(rot);
    for (let k = 0; k < 26; k++) {
      const lx = (R() - 0.5) * (iw - 5), lz = (R() - 0.5) * (id - 5);
      trees.push({ x: b.position.x + lx * c + lz * s, z: b.position.z - lx * s + lz * c, s: 0.8 + R() * 0.5, r: R() * 6.28 });
    }
  }
  // scattered shade trees near the buildings
  for (let k = 0, placed = 0; k < 4000 && placed < 140; k++) {
    const x = minX + 10 + R() * (maxX - minX - 20), z = minZ + 10 + R() * (maxZ - minZ - 20);
    if (palmDensity(x, z) > 0.45 || !free(x, z, 4)) continue;
    trees.push({ x, z, s: 0.8 + R() * 0.6, r: R() * 6.28 });
    placed++;
  }

  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(R() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  shuffle(trees);
  shuffle(palms);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  const fill = (mesh, list, scaleXZ) => {
    list.forEach((t, i) => {
      q.setFromAxisAngle(up, t.r);
      m4.compose(new THREE.Vector3(t.x, 0, t.z), q, new THREE.Vector3(t.s * scaleXZ, t.s, t.s * scaleXZ));
      mesh.setMatrixAt(i, m4);
      const v = 0.82 + R() * 0.3;
      mesh.setColorAt(i, col.setRGB(v * (0.95 + R() * 0.1), v, v * (0.9 + R() * 0.15)));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };
  const treeMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const treeMesh = new THREE.InstancedMesh(treeGeometry(), treeMat, trees.length);
  fill(treeMesh, trees, 1);
  treeMesh.name = 'trees';
  treeMesh.castShadow = true;
  group.add(treeMesh);

  const palmGeoFull = palmGeometry(true);
  const palmGeoLow = palmGeometry(false);
  const palmMesh = new THREE.InstancedMesh(
    palmGeoFull,
    new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    palms.length,
  );
  fill(palmMesh, palms, 1);
  palmMesh.name = 'palms';
  palmMesh.castShadow = true;
  group.add(palmMesh);

  // ---------- lamp posts ----------
  const lamps = [];
  for (const e of data.paths.edges) {
    if (e.type !== 'road') continue;
    const a = nodes.get(e.from), b = nodes.get(e.to);
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 20) continue;
    const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
    let side = 1;
    for (let t = 10; t < len - 6; t += 32) {
      const off = e.width / 2 + 1.3;
      lamps.push({ x: a.x + ux * t - uz * off * side, z: a.z + uz * t + ux * off * side, r: Math.atan2(-uz * side, -ux * side) * -1 });
      side = -side;
    }
  }
  // lamps at the gate and in front of the larger blocks' doors
  for (const f of doorFrames) {
    if (f.portico) lamps.push({ x: f.x + f.nx * 5 + f.nz * 4, z: f.z + f.nz * 5 - f.nx * 4, r: f.theta });
  }
  shuffle(lamps);
  const lampMesh = new THREE.InstancedMesh(lampGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), lamps.length);
  lamps.forEach((l, i) => {
    q.setFromAxisAngle(up, l.r);
    m4.compose(new THREE.Vector3(l.x, 0, l.z), q, new THREE.Vector3(1, 1, 1));
    lampMesh.setMatrixAt(i, m4);
  });
  lampMesh.name = 'lamps';
  group.add(lampMesh);

  // ---------- benches ----------
  const benches = [];
  for (const f of doorFrames) {
    if (!['block', 'ring'].includes(f.form) || f.h < 6) continue;
    for (const s of [-1, 1]) {
      benches.push({
        x: f.x + f.nx * 8 + f.nz * 4.2 * s * -1,
        z: f.z + f.nz * 8 + f.nx * 4.2 * s,
        r: f.theta,
      });
    }
  }
  const benchMesh = new THREE.InstancedMesh(benchGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), Math.max(1, benches.length));
  benches.forEach((b, i) => {
    q.setFromAxisAngle(up, b.r);
    m4.compose(new THREE.Vector3(b.x, 0, b.z), q, new THREE.Vector3(1, 1, 1));
    benchMesh.setMatrixAt(i, m4);
  });
  benchMesh.count = benches.length;
  benchMesh.name = 'benches';
  group.add(benchMesh);

  // ---------- boundary wall and gates ----------
  const wallGeos = [];
  const H = 2.4, TH = 0.35;
  const gates = data.gates;
  for (let i = 0; i < bp.length; i++) {
    const a = bp[i], b = bp[(i + 1) % bp.length];
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len;
    // gaps where a gate sits on this edge
    const gaps = [];
    for (const g of gates) {
      const t = (g.position.x - a.x) * ux + (g.position.z - a.z) * uz;
      const off = Math.abs((g.position.x - a.x) * -uz + (g.position.z - a.z) * ux);
      if (off < 3 && t > 0 && t < len) gaps.push([t - g.width / 2, t + g.width / 2]);
    }
    gaps.sort((p, r) => p[0] - r[0]);
    const spans = [];
    let cur = 0;
    for (const [g0, g1] of gaps) {
      if (g0 > cur) spans.push([cur, g0]);
      cur = Math.max(cur, g1);
    }
    if (cur < len) spans.push([cur, len]);
    const rotY = -Math.atan2(dz, dx);
    for (const [s0, s1] of spans) {
      const L = s1 - s0;
      if (L < 0.2) continue;
      const mid = (s0 + s1) / 2;
      const seg = paint(boxGeo(L, H, TH, { scale: 3 }), 0xe3d9c4);
      const base = paint(boxGeo(L + 0.02, 0.5, TH + 0.06, { scale: 3 }), 0x8d9096);
      for (const g of [seg, base]) place(g, a.x + ux * mid, 0, a.z + uz * mid, rotY);
      wallGeos.push(seg, base);
      for (let t = s0 + 3; t < s1 - 1; t += 12) {
        const pil = paint(boxGeo(0.7, H + 0.5, 0.7, { scale: 3 }), 0xd6cbb2);
        place(pil, a.x + ux * t, 0, a.z + uz * t, rotY);
        wallGeos.push(pil);
      }
    }
  }
  // gate pillars, open gate leaves and the name board (inside face of the wall, facing into the campus)
  const boardItems = [];
  const boardReq = [];
  for (const g of gates) {
    const dirX = g.facing === 'east' ? 1 : g.facing === 'west' ? -1 : 0;
    const dirZ = g.facing === 'south' ? 1 : g.facing === 'north' ? -1 : 0;
    const tx = -dirZ, tz = dirX; // along the wall
    const outTheta = Math.atan2(dirX, dirZ);
    const leafLen = g.width / 2 - 0.5;
    for (const s of [-1, 1]) {
      const px = g.position.x + tx * s * (g.width / 2 + 0.3), pz = g.position.z + tz * s * (g.width / 2 + 0.3);
      const pil = paint(boxGeo(0.95, 3.6, 0.95, { scale: 3 }), 0xe8dfca);
      place(pil, px, 0, pz);
      wallGeos.push(pil);
      const cap = paint(boxGeo(1.15, 0.25, 1.15, { y: 3.6, scale: 3 }), 0xb9ad94);
      place(cap, px, 0, pz);
      wallGeos.push(cap);
      // gate leaf folded open flat against the inside of the wall, beyond the pillar
      const leaf = paint(boxGeo(0.08, 2.2, leafLen, { scale: 3 }), 0x2f5d3a);
      place(
        leaf,
        g.position.x - dirX * 0.55 + tx * s * (g.width / 2 + 0.9 + leafLen / 2),
        0,
        g.position.z - dirZ * 0.55 + tz * s * (g.width / 2 + 0.9 + leafLen / 2),
        Math.atan2(tx, tz),
      );
      wallGeos.push(leaf);
    }
    if (g.type === 'main') {
      boardItems.push({ text: data.name.toUpperCase(), style: 'black' });
      boardReq.push({ g, dirX, dirZ, tx, tz });
    }
  }
  const wallMat = new THREE.MeshLambertMaterial({ map: T.facadePlain, vertexColors: true });
  const wallMesh = new THREE.Mesh(merge(wallGeos), wallMat);
  wallMesh.name = 'boundary-wall';
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  group.add(wallMesh);

  if (boardItems.length) {
    const atlas = signAtlas(boardItems);
    const geos = boardReq.map(({ g, dirX, dirZ, tx, tz }, i) => {
      const gg = signQuad(6.6, 1.24, atlas.uv[i]);
      gg.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.atan2(-dirX, -dirZ)));
      gg.translate(
        g.position.x + tx * (g.width / 2 + 5.5) - dirX * 0.4,
        1.1,
        g.position.z + tz * (g.width / 2 + 5.5) - dirZ * 0.4,
      );
      return gg;
    });
    const board = new THREE.Mesh(merge(geos), new THREE.MeshBasicMaterial({ map: atlas.texture, side: THREE.DoubleSide }));
    board.name = 'gate-board';
    group.add(board);
  }

  // ---------- quality ----------
  const totals = { trees: trees.length, palms: palms.length, lamps: lamps.length };
  function setQuality(q) {
    treeMesh.count = Math.floor(totals.trees * q.trees);
    palmMesh.count = Math.floor(totals.palms * q.palms);
    lampMesh.count = Math.floor(totals.lamps * q.lamps);
    palmMesh.geometry = q.fronds ? palmGeoFull : palmGeoLow;
  }

  return { group, setQuality, totals };
}
