// Validates src/data/campus.json. Exits with code 1 (failing `npm run build`) on bad data.
// Warnings (unverified values, overlaps) are printed but do not fail the build.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { insideFootprint } from '../src/data/footprint.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = resolve(root, process.argv[2] ?? 'src/data/campus.json');

const BUILDING_TYPES = ['department', 'lab', 'library', 'canteen', 'parking', 'sports', 'admin', 'hostel', 'other'];
const FORMS = ['ring', 'block', 'shed', 'court', 'field', 'kiosk', 'canopy', 'plant'];
const POINT_KINDS = ['room-marker', 'biogas', 'solar-pv', 'assembly', 'well'];
const PATH_TYPES = ['road', 'walkway'];
const ROOM_TYPES = ['classroom', 'lab', 'office', 'seminar', 'library', 'washroom', 'store', 'lobby', 'other'];
const FLOOR_KINDS = ['granite', 'marble', 'green', 'concrete'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_COORD = 5000;

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isXZ = (p) => p && isNum(p.x) && isNum(p.z) && Math.abs(p.x) <= MAX_COORD && Math.abs(p.z) <= MAX_COORD;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

let data;
try {
  data = JSON.parse(readFileSync(file, 'utf8'));
} catch (e) {
  console.error(`campus.json: cannot read or parse ${file}\n  ${e.message}`);
  process.exit(1);
}

// ---------- campus ----------
if (data.schemaVersion !== 1) err(`schemaVersion must be 1 (got ${data.schemaVersion})`);
for (const k of ['id', 'name', 'shortName', 'appName']) if (!isStr(data[k])) err(`campus.${k} must be a non-empty string`);
if (data.appName !== 'MKCE 360') err(`campus.appName must be "MKCE 360" (got "${data.appName}")`);
if (!data.location || !isStr(data.location.city)) err('campus.location.city is required');
if (!isNum(data.meta?.scaleMetresPerPixel) || data.meta.scaleMetresPerPixel <= 0) err('meta.scaleMetresPerPixel must be a positive number');

// satellite
const sat = data.satellite;
if (!sat || !isStr(sat.url) || !isXZ(sat.centre) || !isNum(sat.size?.w) || !isNum(sat.size?.d)) {
  err('campus.satellite needs url, centre {x,z}, size {w,d}');
} else if (!existsSync(resolve(root, 'public', sat.url))) {
  err(`campus.satellite.url "${sat.url}" not found under public/`);
}

// boundary
const boundary = data.boundary?.points;
if (!Array.isArray(boundary) || boundary.length < 3 || !boundary.every(isXZ)) err('campus.boundary.points needs >= 3 {x,z} points');

function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

// ---------- gates ----------
const gateIds = new Set();
if (!Array.isArray(data.gates) || data.gates.length === 0) err('campus.gates must contain at least one gate');
for (const g of data.gates ?? []) {
  if (!isStr(g.id)) err('gate without id');
  else if (gateIds.has(g.id)) err(`duplicate gate id "${g.id}"`);
  else gateIds.add(g.id);
  if (!isXZ(g.position)) err(`gate "${g.id}": invalid position`);
  if (!isStr(g.name)) err(`gate "${g.id}": name required`);
}
const mainGate = (data.gates ?? []).find((g) => g.type === 'main');
if (!mainGate) err('there must be one gate with type "main"');
else if (!isXZ(mainGate.spawn) || !isNum(mainGate.spawn.headingDeg)) err('main gate needs spawn {x,z,headingDeg}');

// ---------- paths graph ----------
const nodes = new Map();
for (const n of data.paths?.nodes ?? []) {
  if (!isStr(n.id)) err('path node without id');
  else if (nodes.has(n.id)) err(`duplicate path node "${n.id}"`);
  else nodes.set(n.id, n);
  if (!isXZ(n)) err(`path node "${n.id}": invalid x/z`);
}
if (nodes.size === 0) err('campus.paths.nodes is empty');
const adj = new Map([...nodes.keys()].map((k) => [k, []]));
const edgeIds = new Set();
for (const e of data.paths?.edges ?? []) {
  if (!isStr(e.id) || edgeIds.has(e.id)) err(`edge id missing or duplicate: "${e.id}"`);
  edgeIds.add(e.id);
  if (!nodes.has(e.from) || !nodes.has(e.to)) {
    err(`edge "${e.id}" references missing node (${e.from} -> ${e.to})`);
    continue;
  }
  if (!PATH_TYPES.includes(e.type)) err(`edge "${e.id}": type must be one of ${PATH_TYPES.join('|')}`);
  if (!isNum(e.width) || e.width <= 0) err(`edge "${e.id}": width must be > 0`);
  const len = dist(nodes.get(e.from), nodes.get(e.to));
  if (len < 0.05) err(`edge "${e.id}" has zero length`);
  adj.get(e.from).push({ to: e.to, d: len });
  adj.get(e.to).push({ to: e.from, d: len });
}

// Dijkstra from the main gate node (node id "gate" by convention, else nearest node to main gate)
let startId = nodes.has('gate') ? 'gate' : null;
if (!startId && mainGate && isXZ(mainGate.position)) {
  let best = Infinity;
  for (const n of nodes.values()) {
    const d = dist(n, mainGate.position);
    if (d < best) { best = d; startId = n.id; }
  }
}
const pathDist = new Map();
if (startId) {
  pathDist.set(startId, 0);
  const queue = [startId];
  while (queue.length) {
    queue.sort((a, b) => pathDist.get(a) - pathDist.get(b));
    const u = queue.shift();
    for (const { to, d } of adj.get(u) ?? []) {
      const nd = pathDist.get(u) + d;
      if (nd < (pathDist.get(to) ?? Infinity)) { pathDist.set(to, nd); queue.push(to); }
    }
  }
  const unreachable = [...nodes.keys()].filter((k) => !pathDist.has(k));
  if (unreachable.length) err(`paths graph is not connected; unreachable nodes: ${unreachable.join(', ')}`);
}

// ---------- buildings ----------
const bIds = new Set();
const buildings = data.buildings ?? [];
if (!Array.isArray(data.buildings) || buildings.length === 0) err('campus.buildings is empty');

function obbCorners(b) {
  const r = ((b.rotationDeg ?? 0) * Math.PI) / 180;
  const e = [Math.cos(r), Math.sin(r)];
  const s = [-Math.sin(r), Math.cos(r)];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => ({
    x: b.position.x + sx * (b.size.w / 2) * e[0] + sz * (b.size.d / 2) * s[0],
    z: b.position.z + sx * (b.size.w / 2) * e[1] + sz * (b.size.d / 2) * s[1],
  }));
}
function distToBoundary(b, p) {
  const c = obbCorners(b);
  let best = Infinity;
  for (let i = 0; i < 4; i++) {
    const a = c[i], d = c[(i + 1) % 4];
    const dx = d.x - a.x, dz = d.z - a.z;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(a.x + t * dx - p.x, a.z + t * dz - p.z));
  }
  return best;
}
function overlap(c1, c2) {
  const axes = [];
  for (const c of [c1, c2]) for (let i = 0; i < 2; i++) axes.push([-(c[i + 1].z - c[i].z), c[i + 1].x - c[i].x]);
  for (const ax of axes) {
    const l = Math.hypot(ax[0], ax[1]);
    const n = [ax[0] / l, ax[1] / l];
    const pr = (c) => c.map((p) => p.x * n[0] + p.z * n[1]);
    const a = pr(c1), b = pr(c2);
    if (Math.max(...a) < Math.min(...b) - 0.5 || Math.max(...b) < Math.min(...a) - 0.5) return false;
  }
  return true;
}

const rectOk = (r) => r && isNum(r.x0) && isNum(r.z0) && isNum(r.x1) && isNum(r.z1) && r.x1 > r.x0 && r.z1 > r.z0;
const inRect = (p, r, m = 0) => p.x >= r.x0 - m && p.x <= r.x1 + m && p.z >= r.z0 - m && p.z <= r.z1 + m;
const rectsOverlap = (a, b) => a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.z0 < b.z1 - 1e-6 && b.z0 < a.z1 - 1e-6;

function validateFloor(f, where) {
  if (!Number.isInteger(f.level)) err(`${where}: floor.level must be an integer`);
  if (!Array.isArray(f.rooms)) err(`${where}: floor.rooms must be an array`);
  if (!Array.isArray(f.stairs)) err(`${where}: floor.stairs must be an array`);
  if (f.sample != null && typeof f.sample !== 'boolean') err(`${where}: floor.sample must be true or false`);
  const outlineOk = rectOk(f.outline);
  if (!outlineOk) err(`${where} floor ${f.level}: outline {x0,z0,x1,z1} is required`);
  const court = f.court ?? null;
  if (court) {
    if (!rectOk(court)) err(`${where} floor ${f.level}: court needs {x0,z0,x1,z1}`);
    else if (outlineOk && !(inRect({ x: court.x0, z: court.z0 }, f.outline) && inRect({ x: court.x1, z: court.z1 }, f.outline))) err(`${where} floor ${f.level}: court leaves the outline`);
  }
  if (f.groundCanopy != null && !(isNum(f.groundCanopy) && f.groundCanopy >= 0 && f.groundCanopy < 6)) err(`${where} floor ${f.level}: groundCanopy must be 0 to 6 metres`);
  if (f.corridorFloor != null && !FLOOR_KINDS.includes(f.corridorFloor)) err(`${where} floor ${f.level}: corridorFloor must be one of ${FLOOR_KINDS.join('|')}`);
  const parts = [];
  const roomIds = new Set();
  for (const r of f.rooms ?? []) {
    const w = `${where} room "${r.id}"`;
    if (!rectOk(r.bounds)) err(`${w}: bounds {x0,z0,x1,z1} required`);
    else {
      if (outlineOk && !(inRect({ x: r.bounds.x0, z: r.bounds.z0 }, f.outline, 0.01) && inRect({ x: r.bounds.x1, z: r.bounds.z1 }, f.outline, 0.01))) err(`${w}: bounds leave the floor outline`);
      for (const q of parts) if (rectsOverlap(r.bounds, q.bounds)) err(`${w}: overlaps room "${q.id}"`);
      if (rectOk(court) && rectsOverlap(r.bounds, court)) err(`${w}: stands in the courtyard`);
      parts.push(r);
      const doors = Array.isArray(r.doors) && r.doors.length ? r.doors : r.door ? [r.door] : [];
      if (!doors.length) err(`${w}: a door {side: n|s|e|w, at} is required`);
      for (const d of doors) {
        if (!['n', 's', 'e', 'w'].includes(d.side) || !isNum(d.at)) err(`${w}: door {side: n|s|e|w, at} required`);
        else {
          const [lo, hi] = d.side === 'n' || d.side === 's' ? [r.bounds.x0, r.bounds.x1] : [r.bounds.z0, r.bounds.z1];
          const half = (d.w ?? 1.2) / 2;
          if (d.at - half < lo + 0.2 || d.at + half > hi - 0.2) err(`${w}: door does not fit on its wall`);
        }
      }
    }
    if (r.department != null && !isStr(r.department)) err(`${w}: department must be text or null`);
    if (r.faculty != null && !isStr(r.faculty)) err(`${w}: faculty must be text or null`);
    if (!isStr(r.id) || roomIds.has(r.id)) err(`${w}: id missing or duplicate`);
    roomIds.add(r.id);
    if (!isStr(r.number) && !isNum(r.number)) err(`${w}: number required`);
    if (!isStr(r.name)) err(`${w}: name required`);
    if (!ROOM_TYPES.includes(r.type)) err(`${w}: type must be one of ${ROOM_TYPES.join('|')}`);
    if (r.capacity != null && !(Number.isInteger(r.capacity) && r.capacity >= 0)) err(`${w}: capacity must be a non-negative integer or null`);
    if (!Array.isArray(r.equipment)) err(`${w}: equipment must be an array`);
    if (!Array.isArray(r.timetable)) err(`${w}: timetable must be an array`);
    for (const t of r.timetable ?? []) {
      if (!DAYS.includes(t.day)) err(`${w}: timetable day must be one of ${DAYS.join('|')}`);
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t.start ?? '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(t.end ?? '') || t.start >= t.end) {
        err(`${w}: timetable entry needs start < end as HH:MM`);
      }
      if (!isStr(t.title)) err(`${w}: timetable title required`);
    }
  }
  for (const [kind, list] of [['stairs', f.stairs ?? []], ['lifts', f.lifts ?? []]]) {
    for (const x of list) {
      const w = `${where} ${kind} "${x.id}"`;
      if (!isStr(x.id)) err(`${where}: a ${kind} entry has no id`);
      if (!rectOk(x.bounds)) err(`${w}: bounds required`);
      if (x.rise != null && !['n', 's', 'e', 'w'].includes(x.rise)) err(`${w}: rise must be n|s|e|w`);
      if (x.facing != null && !['n', 's', 'e', 'w'].includes(x.facing)) err(`${w}: facing must be n|s|e|w`);
      if (x.arrive != null && !['n', 's', 'e', 'w'].includes(x.arrive)) err(`${w}: arrive must be n|s|e|w`);
      if (!isXZ(x.landing)) err(`${w}: landing {x,z} required`);
      else {
        if (outlineOk && !inRect(x.landing, f.outline)) err(`${w}: landing is outside the floor`);
        for (const r of f.rooms ?? []) if (rectOk(r.bounds) && inRect(x.landing, r.bounds)) err(`${w}: landing is inside room "${r.id}"`);
        if (rectOk(court) && inRect(x.landing, court)) err(`${w}: landing is in the courtyard`);
        if (rectOk(x.bounds) && inRect(x.landing, x.bounds)) err(`${w}: landing is inside its own block`);
      }
    }
  }
  if (f.entrance && !(isXZ(f.entrance) && outlineOk)) err(`${where}: entrance {x,z} required and the outline too`);
  if (f.entrance && outlineOk && isXZ(f.entrance)) {
    const e = f.entrance, o = f.outline, facing = e.facing ?? 'east';
    const wall = { east: ['x', o.x1], west: ['x', o.x0], north: ['z', o.z0], south: ['z', o.z1] }[facing];
    if (!wall) err(`${where} floor ${f.level}: entrance.facing must be north|south|east|west`);
    else {
      if (Math.abs(e[wall[0]] - wall[1]) > 0.05) err(`${where} floor ${f.level}: the entrance must stand on the ${facing} wall of the outline`);
      const along = wall[0] === 'x' ? e.z : e.x, [lo, hi] = wall[0] === 'x' ? [o.z0, o.z1] : [o.x0, o.x1];
      if (e.width != null && !(isNum(e.width) && e.width >= 1.2 && e.width <= 8)) err(`${where} floor ${f.level}: entrance.width must be 1.2 to 8 metres`);
      if (along - (e.width ?? 2.4) / 2 < lo + 0.2 || along + (e.width ?? 2.4) / 2 > hi - 0.2) err(`${where} floor ${f.level}: the entrance does not fit on its wall`);
    }
  }
}

for (const b of buildings) {
  const w = `building "${b.id}"`;
  if (!isStr(b.id)) { err('building without id'); continue; }
  if (bIds.has(b.id)) err(`duplicate building id "${b.id}"`);
  bIds.add(b.id);
  if (!isStr(b.name)) err(`${w}: name required`);
  if (!BUILDING_TYPES.includes(b.type)) err(`${w}: type "${b.type}" must be one of ${BUILDING_TYPES.join('|')}`);
  if (!FORMS.includes(b.form)) err(`${w}: form "${b.form}" must be one of ${FORMS.join('|')}`);
  if (!isXZ(b.position)) err(`${w}: invalid position`);
  if (!(isNum(b.size?.w) && isNum(b.size?.d) && b.size.w > 0 && b.size.d > 0)) err(`${w}: size.w and size.d must be > 0`);
  if (!isNum(b.rotationDeg)) err(`${w}: rotationDeg must be a number`);
  if (!Number.isInteger(b.floors) || b.floors < 1) err(`${w}: floors must be an integer >= 1`);
  if (!(isNum(b.heightM) && b.heightM >= 0 && b.heightM <= 200)) err(`${w}: heightM must be 0..200`);
  if (!isXZ(b.doorPosition)) err(`${w}: invalid doorPosition`);
  if (!isStr(b.description)) err(`${w}: description required (placeholder text is fine)`);
  if (!b.verified || ['position', 'size', 'door', 'floors', 'height'].some((k) => typeof b.verified[k] !== 'boolean')) {
    err(`${w}: verified must have boolean position/size/door/floors/height flags`);
  }
  if (!Array.isArray(b.floorPlans)) err(`${w}: floorPlans must be an array`);
  for (const f of b.floorPlans ?? []) validateFloor(f, w);
  if (b.floorPlans?.length) {
    const levels = b.floorPlans.map((f) => f.level).sort((a, c) => a - c);
    if (new Set(levels).size !== levels.length) err(`${w}: duplicate floor levels`);
    if (!levels.includes(0)) err(`${w}: floorPlans need a level 0 (ground floor)`);
    if (b.verified?.floors && b.floorPlans.length !== b.floors) warn(`${w}: ${b.floorPlans.length} floor plans but floors is ${b.floors}`);
    if (!b.floorPlans.some((f) => f.entrance)) warn(`${w}: no floor has an entrance, so there is no way in`);
    if (b.floorPlans.some((f) => f.sample)) warn(`${w}: floor plans are SAMPLE data`);
  }
  if (b.porch != null) {
    const p = b.porch;
    const okDims = isNum(p.w) && p.w > 0 && isNum(p.d) && p.d > 0 && isNum(p.h) && p.h > 2.5 && p.h < b.heightM;
    if (!okDims || (p.doorW != null && !(isNum(p.doorW) && p.doorW > 0 && p.doorW < p.w))) err(`${w}: porch needs w, d and h in metres (h above 2.5 and below the building height) and an optional doorW narrower than w`);
  }
  if (b.doorFacing != null && b.floorPlans?.length) {
    for (const f of b.floorPlans) if (f.entrance && (f.entrance.facing ?? 'east') !== b.doorFacing) err(`${w}: floor ${f.level} entrance faces ${f.entrance.facing ?? 'east'} but doorFacing is ${b.doorFacing}`);
  }
  if (b.form === 'ring' && !(isNum(b.ring?.thickness) && b.ring.thickness > 0)) err(`${w}: ring form needs ring.thickness`);
  if (b.sport != null && !isStr(b.sport)) err(`${w}: sport must be a non-empty string when present`);
  for (const [i, p] of (b.parts ?? []).entries()) {
    if (!(isNum(p.x) && isNum(p.z) && isNum(p.w) && isNum(p.d) && p.w > 0 && p.d > 0)) err(`${w}: parts[${i}] invalid`);
  }
  if (isXZ(b.position) && b.size && isXZ(b.doorPosition)) {
    const dd = distToBoundary(b, b.doorPosition);
    if (dd > 2) err(`${w}: doorPosition is ${dd.toFixed(1)} m from the building outline (must be on or within 2 m of it)`);
    if (boundary && !pointInPoly(b.position, boundary)) err(`${w}: lies outside the campus boundary`);
  }
  // door -> path graph link
  const dn = b.doorNode;
  if (!dn || !nodes.has(dn)) err(`${w}: doorNode "${dn}" missing from paths graph`);
  else {
    const n = nodes.get(dn);
    if (dist(n, b.doorPosition) > 0.25) err(`${w}: doorNode position differs from doorPosition`);
    if (!pathDist.has(dn)) err(`${w}: door is not reachable from the main gate`);
    if ((adj.get(dn) ?? []).length === 0) err(`${w}: door node has no edges`);
  }
}

// points
const pIds = new Set();
for (const p of data.points ?? []) {
  const w = `point "${p.id}"`;
  if (!isStr(p.id) || pIds.has(p.id)) err(`point id missing or duplicate: "${p.id}"`);
  pIds.add(p.id);
  if (!POINT_KINDS.includes(p.kind)) err(`${w}: kind must be one of ${POINT_KINDS.join('|')}`);
  if (!isXZ(p.position)) err(`${w}: invalid position`);
  if (!isStr(p.name)) err(`${w}: name required`);
  if (p.parent && !bIds.has(p.parent)) err(`${w}: parent "${p.parent}" is not a building id`);
}

// unplaced legend items: listed on the board, but not marked in docs/satellite-candidates.png, so they have no map position
const uIdsUnplaced = new Set();
for (const u of data.unplaced ?? []) {
  const w = `unplaced "${u.id}"`;
  if (!isStr(u.id) || uIdsUnplaced.has(u.id) || bIds.has(u.id) || pIds.has(u.id)) err(`${w}: id missing, duplicated or already used by a building or point`);
  uIdsUnplaced.add(u.id);
  if (!isStr(u.name)) err(`${w}: name required`);
  if (!['building', 'point'].includes(u.kind)) err(`${w}: kind must be building or point`);
  if (u.number != null && !Number.isInteger(u.number)) err(`${w}: number must be an integer or null`);
  if (!isStr(u.reason)) err(`${w}: reason required (why it is not on the map)`);
  if (u.position != null) err(`${w}: unplaced items must not have a "position" (keep an old guess under lastEstimate)`);
}
if (data.unplaced != null && !Array.isArray(data.unplaced)) err('campus.unplaced must be an array');
if ((data.unplaced ?? []).length) warn(`${data.unplaced.length} legend items are not on the map yet (listed under "unplaced")`);

// open areas (optional): kept free of trees
for (const o of data.openAreas ?? []) {
  if (!isStr(o.id) || !isXZ(o.position) || !(isNum(o.size?.w) && isNum(o.size?.d))) err(`openArea "${o.id}" needs id, position, size`);
}

// debug (optional)
const sb = data.debug?.signboard;
if (sb && !(Array.isArray(sb.imageToMetres) && sb.imageToMetres.length === 9 && sb.imageToMetres.every(isNum))) {
  err('debug.signboard.imageToMetres must be 9 numbers');
}
if (sb && !existsSync(resolve(root, 'public', sb.image ?? ''))) err(`debug.signboard.image "${sb.image}" not found under public/`);

// updates
const uIds = new Set();
for (const u of data.updates ?? []) {
  if (!isStr(u.id) || uIds.has(u.id)) err(`update id missing or duplicate: "${u.id}"`);
  uIds.add(u.id);
  if (!isStr(u.title) || !isStr(u.body)) err(`update "${u.id}": title and body required`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(u.date ?? '') || Number.isNaN(Date.parse(u.date))) err(`update "${u.id}": date must be YYYY-MM-DD`);
}
if (!Array.isArray(data.updates)) err('campus.updates must be an array');

// gates that name a path node (used as route start points)
for (const g of data.gates ?? []) {
  if (g.node != null && !nodes.has(g.node)) err(`gate "${g.id}": node "${g.node}" is not in the paths graph`);
  if (g.node != null && !pathDist.has(g.node)) err(`gate "${g.id}": node "${g.node}" is not reachable from the main gate`);
}

// ---------- routes must not cut through buildings ----------
// Buildings that block walking (see world/buildings.js): ring, block, closed shed, kiosk, plant. Courts, fields,
// open parking sheds and canopies can be crossed.
const OBSTACLE_FORMS = new Set(['ring', 'block', 'shed', 'kiosk', 'plant']);
{
  const doorOwner = new Map(buildings.map((b) => [b.doorNode, b]));
  const crossings = new Map();
  for (const e of data.paths?.edges ?? []) {
    const a = nodes.get(e.from), c = nodes.get(e.to);
    if (!a || !c) continue;
    const spurOf = doorOwner.get(e.from) ?? doorOwner.get(e.to);
    const len = dist(a, c);
    for (let s = 0; s <= len; s += 0.75) {
      const p = { x: a.x + ((c.x - a.x) * s) / len, z: a.z + ((c.z - a.z) * s) / len };
      for (const b of buildings) {
        if (!OBSTACLE_FORMS.has(b.form) || (b.form === 'shed' && b.type === 'parking')) continue;
        if (spurOf === b) {
          const dn = nodes.get(b.doorNode);
          if (dist(p, dn) < 4) continue; // the last few metres reach the door
        }
        if (insideFootprint(b, p.x, p.z, 0.8)) crossings.set(`${e.id} (${e.from} to ${e.to}) crosses "${b.id}"`, true);
      }
    }
  }
  for (const k of crossings.keys()) warn(`path ${k}`);
}

// ---------- warnings ----------
for (let i = 0; i < buildings.length; i++) {
  for (let j = i + 1; j < buildings.length; j++) {
    const a = buildings[i], b = buildings[j];
    if (isXZ(a.position) && isXZ(b.position) && a.size && b.size && overlap(obbCorners(a), obbCorners(b))) {
      warn(`buildings overlap: "${a.id}" and "${b.id}"`);
    }
  }
}
const unverified = (k) => buildings.filter((b) => b.verified && b.verified[k] === false).length;
warn(
  `${buildings.length} buildings: unverified position ${unverified('position')}, size ${unverified('size')}, ` +
    `door ${unverified('door')}, floors ${unverified('floors')}, height ${unverified('height')}`,
);

// ---------- report ----------
for (const w of warnings) console.warn(`  warn  ${w}`);
if (errors.length) {
  console.error(`\ncampus.json is INVALID (${errors.length} error${errors.length > 1 ? 's' : ''}):`);
  for (const e of errors) console.error(`  error ${e}`);
  process.exit(1);
}
console.log(
  `campus.json OK: ${buildings.length} buildings, ${(data.points ?? []).length} points, ` +
    `${nodes.size} path nodes, ${edgeIds.size} edges, ${(data.gates ?? []).length} gates`,
);
