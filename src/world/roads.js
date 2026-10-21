// Generated roads and walkways from the paths graph (campus.paths), paver forecourts in front of the
// big blocks, and a stand-in highway outside the east wall. Hidden in Overview mode (the satellite
// photo already shows the real roads there).
import * as THREE from 'three';
import { ribbonGeo, discGeo, flatQuad, merge, paint, place } from './geo.js';

const Y_ROAD = 0.03;
const Y_WALK = 0.026;
const Y_KERB = 0.05;

function lit(map, extra = {}) {
  return new THREE.MeshLambertMaterial({
    map,
    vertexColors: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    ...extra,
  });
}

export function createRoads(data, T, doorFrames) {
  const group = new THREE.Group();
  group.name = 'roads';
  const nodes = new Map(data.paths.nodes.map((n) => [n.id, n]));

  const road = [], roadJoint = [], walk = [], walkJoint = [], kerb = [], pads = [];
  const roadAt = new Map(); // node id -> max road width
  const walkAt = new Map();

  for (const e of data.paths.edges) {
    const a = nodes.get(e.from), b = nodes.get(e.to);
    if (e.type === 'road') {
      const g = ribbonGeo(a.x, a.z, b.x, b.z, e.width, Y_ROAD, { vMetres: 8 });
      road.push(paint(g, 0xffffff));
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len, nz = dx / len;
      for (const s of [-1, 1]) {
        const o = s * (e.width / 2 + 0.2);
        const k = ribbonGeo(a.x + nx * o, a.z + nz * o, b.x + nx * o, b.z + nz * o, 0.4, Y_KERB, { vMetres: 2 });
        kerb.push(paint(k, 0xffffff));
      }
      roadAt.set(a.id, Math.max(roadAt.get(a.id) ?? 0, e.width));
      roadAt.set(b.id, Math.max(roadAt.get(b.id) ?? 0, e.width));
    } else {
      const g = ribbonGeo(a.x, a.z, b.x, b.z, e.width, Y_WALK, { vMetres: 2, uScale: e.width / 2 });
      walk.push(paint(g, 0xffffff));
      walkAt.set(a.id, Math.max(walkAt.get(a.id) ?? 0, e.width));
      walkAt.set(b.id, Math.max(walkAt.get(b.id) ?? 0, e.width));
    }
  }
  for (const [id, wd] of roadAt) {
    const n = nodes.get(id);
    roadJoint.push(paint(place(discGeo(wd / 2, Y_ROAD + 0.001, 16, 8), n.x, 0, n.z), 0xffffff));
  }
  for (const [id, wd] of walkAt) {
    if (roadAt.has(id)) continue;
    const n = nodes.get(id);
    walkJoint.push(paint(place(discGeo(wd / 2, Y_WALK + 0.001, 10, 2), n.x, 0, n.z), 0xffffff));
  }

  // paver forecourts in front of the larger blocks
  for (const f of doorFrames) {
    if (!['block', 'ring'].includes(f.form) || f.h < 8) continue;
    const w = f.half ? f.half * 2 + 4 : f.portico ? 14 : 8, d = 9;
    const g = flatQuad(w, d, Y_WALK + 0.002, w / 2, d / 2);
    const out = (f.reach ?? 0) + d / 2 + 0.2; // beyond the porch, when there is one
    place(g, f.x + f.nx * out, 0, f.z + f.nz * out, f.theta);
    pads.push(paint(g, 0xffffff));
  }

  const add = (geos, mat, name) => {
    const g = merge(geos);
    if (!g) return;
    const m = new THREE.Mesh(g, mat);
    m.name = name;
    m.receiveShadow = true;
    group.add(m);
  };
  add(road, lit(T.asphaltRoad), 'asphalt');
  add(roadJoint, lit(T.asphaltPlain), 'asphalt-joints');
  add(walk, lit(T.paver), 'walkways');
  add(walkJoint, lit(T.paver), 'walkway-joints');
  add(pads, lit(T.paver), 'forecourts');
  add(kerb, lit(T.kerb), 'kerbs');

  // stand-in highway (visual only; the boundary wall keeps the player inside)
  const hwG = ribbonGeo(14, -420, 14, 600, 18, 0.02, { vMetres: 8 });
  paint(hwG, 0xffffff);
  const hw = new THREE.Mesh(hwG, lit(T.asphaltRoad));
  hw.name = 'highway';
  group.add(hw);

  return { group };
}
