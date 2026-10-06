// Route planning on the campus path graph (Dijkstra), turn detection and live guidance hints. Pure functions,
// no DOM and no three.js, so they can be tested in Node (scripts/test-nav.mjs).
import { buildGraph, dijkstra } from '../data/graph.js';
import { distToBounds } from '../data/footprint.js';
import { PLAYER } from '../config.js';

const RAD = 180 / Math.PI;
const wrap180 = (a) => ((((a + 180) % 360) + 360) % 360) - 180;
/** compass bearing in degrees, clockwise from north (+x east, +z south) */
export const bearing = (dx, dz) => ((Math.atan2(dx, -dz) * RAD) % 360 + 360) % 360;
const CARDINAL = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export const cardinal = (deg) => CARDINAL[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

export function formatDistance(m) {
  if (m < 1) return '0 m';
  if (m < 100) return `${Math.round(m)} m`;
  if (m < 1000) return `${Math.round(m / 5) * 5} m`;
  return `${(m / 1000).toFixed(1)} km`;
}
export function formatDuration(sec) {
  const min = Math.max(1, Math.round(sec / 60));
  return min === 1 ? 'about 1 min' : `about ${min} min`;
}

/** A walkable polyline with cumulative distance helpers. */
export class Polyline {
  constructor(points) {
    this.p = [];
    for (const q of points) {
      const last = this.p[this.p.length - 1];
      if (!last || Math.hypot(q.x - last.x, q.z - last.z) > 0.3) this.p.push({ x: q.x, z: q.z });
    }
    if (this.p.length === 1) this.p.push({ x: this.p[0].x + 0.01, z: this.p[0].z });
    this.cum = [0];
    for (let i = 1; i < this.p.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(this.p[i].x - this.p[i - 1].x, this.p[i].z - this.p[i - 1].z));
    this.length = this.cum[this.cum.length - 1];
  }

  /** point and unit direction at distance s along the line (clamped) */
  at(s) {
    s = Math.max(0, Math.min(this.length, s));
    let lo = 0, hi = this.cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] <= s) lo = mid;
      else hi = mid;
    }
    const a = this.p[lo], b = this.p[lo + 1];
    const seg = this.cum[lo + 1] - this.cum[lo] || 1;
    const t = (s - this.cum[lo]) / seg;
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, dx: (b.x - a.x) / seg, dz: (b.z - a.z) / seg, i: lo };
  }

  /** nearest point on the line to (x, z), searching only s in [from, to] */
  project(x, z, from = 0, to = this.length) {
    let best = null;
    for (let i = 0; i < this.p.length - 1; i++) {
      if (this.cum[i + 1] < from || this.cum[i] > to) continue;
      const a = this.p[i], b = this.p[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const L2 = dx * dx + dz * dz || 1e-9;
      let t = ((x - a.x) * dx + (z - a.z) * dz) / L2;
      t = Math.max(0, Math.min(1, t));
      let s = this.cum[i] + t * Math.sqrt(L2);
      s = Math.max(from, Math.min(to, s));
      const q = this.at(s);
      const d = Math.hypot(x - q.x, z - q.z);
      if (!best || d < best.d) best = { s, d, x: q.x, z: q.z };
    }
    return best;
  }

  bearingAt(s, ahead = 0) {
    const a = this.at(s), b = this.at(s + Math.max(ahead, 0.5));
    return bearing(b.x - a.x, b.z - a.z);
  }

  bounds() {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of this.p) {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
    }
    return { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, size: Math.max(x1 - x0, z1 - z0) };
  }
}

// ---------- turns ----------

function nearestLandmark(data, x, z, skipId, within = 24) {
  let best = null, bd = within;
  for (const b of data.buildings) {
    if (b.id === skipId || b.form === 'field') continue;
    const d = distToBounds(b, x, z);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

/** Turns along the line: smoothed heading change over a 7 m window, curves merge into a single turn. */
export function findManeuvers(poly, { window = 7, threshold = 32, minGap = 9, edge = 5 } = {}) {
  const n = Math.floor(poly.length);
  const turn = new Float32Array(n + 2);
  for (let i = 1; i < n; i++) {
    const a = poly.at(i - window), b = poly.at(i), c = poly.at(i + window);
    turn[i] = wrap180(bearing(c.x - b.x, c.z - b.z) - bearing(b.x - a.x, b.z - a.z));
  }
  const out = [];
  let i = 1;
  while (i < n) {
    if (Math.abs(turn[i]) < threshold) { i++; continue; }
    let j = i, peak = i;
    while (j < n && Math.abs(turn[j]) >= 14) {
      if (Math.abs(turn[j]) > Math.abs(turn[peak])) peak = j;
      j++;
    }
    const before = poly.at(Math.max(0, i - window)), mid = poly.at(i), after = poly.at(j), far = poly.at(Math.min(poly.length, j + window));
    const total = wrap180(bearing(far.x - after.x, far.z - after.z) - bearing(mid.x - before.x, mid.z - before.z));
    const s = poly.at(peak);
    const sPeak = Math.min(poly.length, peak);
    if (Math.abs(total) >= threshold && sPeak > edge && sPeak < poly.length - edge) {
      const last = out[out.length - 1];
      if (last && sPeak - last.s < minGap) {
        last.turn = wrap180(last.turn + total); // two quick turns act as one
        last.s = (last.s + sPeak) / 2;
      } else out.push({ s: sPeak, turn: total, x: s.x, z: s.z });
    }
    i = j + 1;
  }
  return out.filter((m) => Math.abs(m.turn) >= threshold);
}

function describeTurn(turn) {
  const a = Math.abs(turn);
  const dir = turn > 0 ? 'right' : 'left';
  if (a < 55) return { dir, kind: 'slight', text: `Bear ${dir}` };
  if (a > 135) return { dir, kind: 'sharp', text: `Make a sharp ${dir}` };
  return { dir, kind: 'turn', text: `Turn ${dir}` };
}

// ---------- planning ----------

function projectOnGraph(paths, nodeMap, p) {
  let best = null;
  for (const e of paths.edges) {
    const a = nodeMap.get(e.from), b = nodeMap.get(e.to);
    if (!a || !b) continue;
    const dx = b.x - a.x, dz = b.z - a.z;
    const L2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2));
    const q = { x: a.x + t * dx, z: a.z + t * dz };
    const d = Math.hypot(p.x - q.x, p.z - q.z);
    if (!best || d < best.d) best = { d, q, t, edge: e, a, b, len: Math.sqrt(L2) };
  }
  return best;
}

/** Describe where somebody wants to go: building (door), point of interest, or a free spot. */
export function resolveTarget(data, target) {
  if (target.buildingId && !target.pointId) {
    const b = data.buildings.find((x) => x.id === target.buildingId);
    if (!b) return null;
    return { label: b.name, shortLabel: b.shortName, number: b.number ?? null, type: b.type, buildingId: b.id, node: b.doorNode, point: { ...b.doorPosition }, stop: 2.2, facing: b.doorFacing ?? null };
  }
  if (target.pointId) {
    const p = (data.points ?? []).find((x) => x.id === target.pointId);
    if (!p) return null;
    const parent = p.parent ? data.buildings.find((x) => x.id === p.parent) : null;
    if (parent) {
      return { label: p.name, shortLabel: p.name, number: p.number ?? null, type: parent.type, buildingId: parent.id, node: parent.doorNode, point: { ...parent.doorPosition }, stop: 2.2, via: parent.shortName, facing: parent.doorFacing ?? null };
    }
    return { label: p.name, shortLabel: p.name, number: p.number ?? null, type: 'place', buildingId: null, node: null, point: { ...p.position }, stop: 1.5 };
  }
  if (Number.isFinite(target.x) && Number.isFinite(target.z)) {
    return { label: target.label ?? 'Chosen spot', shortLabel: target.label ?? 'Chosen spot', number: null, type: 'place', buildingId: null, node: null, point: { x: target.x, z: target.z }, stop: 1.5 };
  }
  return null;
}

export function resolveStart(data, from) {
  if (from.gate) {
    const g = data.gates.find((x) => x.id === from.gate);
    if (!g) return null;
    const node = g.node && data.paths.nodes.find((n) => n.id === g.node);
    return { label: g.name, node: node ? node.id : null, point: node ? { x: node.x, z: node.z } : { ...g.position }, gateId: g.id };
  }
  return { label: from.label ?? 'My position', node: null, point: { x: from.x, z: from.z } };
}

/**
 * Plan a walking route.
 * @param data   campus.json content
 * @param from   { gate: id } | { x, z, label? }
 * @param target { buildingId } | { pointId } | { x, z, label? }
 * @returns route object or null when unreachable
 */
export function planRoute(data, from, target, { walkSpeed = PLAYER.walkSpeed } = {}) {
  const start = resolveStart(data, from);
  const dest = resolveTarget(data, target);
  if (!start || !dest) return null;

  const base = buildGraph(data.paths);
  const nodes = new Map(base.nodes);
  const adj = new Map([...base.adj].map(([k, v]) => [k, v.slice()]));
  const graph = { nodes, adj };

  const addVirtual = (id, p) => {
    const hit = projectOnGraph(data.paths, base.nodes, p);
    if (!hit) return null;
    nodes.set(id, { id, x: hit.q.x, z: hit.q.z, kind: 'virtual' });
    adj.set(id, []);
    const da = hit.t * hit.len, db = (1 - hit.t) * hit.len;
    adj.get(id).push({ to: hit.a.id, d: da }, { to: hit.b.id, d: db });
    adj.get(hit.a.id).push({ to: id, d: da });
    adj.get(hit.b.id).push({ to: id, d: db });
    return hit;
  };

  let startId = start.node, startHit = null;
  if (!startId) {
    startHit = addVirtual('~start', start.point);
    if (!startHit) return null;
    startId = '~start';
  }
  let endId = dest.node, endHit = null;
  if (!endId) {
    endHit = addVirtual('~end', dest.point);
    if (!endHit) return null;
    endId = '~end';
  }
  // both virtual points on the very same edge: allow walking straight between them
  if (startHit && endHit && startHit.edge.id === endHit.edge.id) {
    const d = Math.abs(startHit.t - endHit.t) * startHit.len;
    adj.get('~start').push({ to: '~end', d });
    adj.get('~end').push({ to: '~start', d });
  }

  const r = dijkstra(graph, startId, endId);
  if (!r) return null;

  const pts = [start.point];
  for (const id of r.path) pts.push({ x: nodes.get(id).x, z: nodes.get(id).z });
  pts.push(dest.point); // the door (or the spot) itself
  const poly = new Polyline(pts);

  const maneuvers = findManeuvers(poly);
  const steps = buildSteps(data, poly, maneuvers, dest);
  return {
    from: start, to: dest, poly, length: poly.length, duration: poly.length / walkSpeed, maneuvers, steps,
    nodeIds: r.path, stopAt: Math.max(0, poly.length - dest.stop),
  };
}

function buildSteps(data, poly, maneuvers, dest) {
  const steps = [];
  const first = cardinal(poly.bearingAt(0, 10));
  steps.push({ kind: 'start', icon: 'straight', text: `Head ${first}`, s: 0 });
  for (const m of maneuvers) {
    const d = describeTurn(m.turn);
    const near = nearestLandmark(data, m.x, m.z, dest.buildingId);
    steps.push({ kind: 'turn', icon: `${d.kind === 'slight' ? 'slight-' : d.kind === 'sharp' ? 'sharp-' : ''}${d.dir}`, text: d.text, near: near?.shortName ?? null, s: m.s });
  }
  steps.push({ kind: 'arrive', icon: 'arrive', text: `Arrive at ${dest.shortLabel}`, s: poly.length });
  for (let i = 0; i < steps.length - 1; i++) steps[i].distance = steps[i + 1].s - steps[i].s;
  steps[steps.length - 1].distance = 0;
  return steps;
}

// ---------- live guidance ----------

/** What to tell the walker standing s metres along the route. */
export function hintAt(route, s) {
  const remaining = Math.max(0, route.length - s);
  const next = route.maneuvers.find((m) => m.s > s - 1);
  const stepFor = (m) => route.steps.find((st) => st.kind === 'turn' && Math.abs(st.s - m.s) < 0.01);
  if (remaining < 12) {
    return { kind: 'arrive', icon: 'arrive', text: remaining < 5 ? 'Almost there' : `Destination ahead, ${formatDistance(remaining)}`, distance: remaining, remaining };
  }
  if (next && next.s - s < 14) {
    const d = describeTurn(next.turn);
    const st = stepFor(next);
    return { kind: 'turn', icon: `${d.kind === 'slight' ? 'slight-' : d.kind === 'sharp' ? 'sharp-' : ''}${d.dir}`, text: d.text + (st?.near ? ` near ${st.near}` : ''), distance: next.s - s, remaining };
  }
  if (next) {
    const d = describeTurn(next.turn);
    const toTurn = next.s - s;
    return { kind: 'straight', icon: 'straight', text: `Go straight for ${formatDistance(toTurn)}`, sub: `then ${d.text.toLowerCase()}`, distance: toTurn, remaining };
  }
  return { kind: 'straight', icon: 'straight', text: `Go straight for ${formatDistance(remaining)}`, sub: `to ${route.to.shortLabel}`, distance: remaining, remaining };
}
