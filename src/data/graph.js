// Path-graph utilities shared by calibration now and by routing in Step 6.
// A graph is built from campus.paths: { nodes: [{id,x,z,kind}], edges: [{id,from,to,type,width}] }.

export function buildGraph(paths) {
  const nodes = new Map(paths.nodes.map((n) => [n.id, n]));
  const adj = new Map([...nodes.keys()].map((k) => [k, []]));
  for (const e of paths.edges) {
    const a = nodes.get(e.from), b = nodes.get(e.to);
    if (!a || !b) continue;
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    adj.get(e.from).push({ to: e.to, d, edge: e });
    adj.get(e.to).push({ to: e.from, d, edge: e });
  }
  return { nodes, adj };
}

/** Shortest path by distance (Dijkstra). Returns { dist, path: [nodeIds] } or null when unreachable. */
export function dijkstra(graph, from, to) {
  const dist = new Map([[from, 0]]);
  const prev = new Map();
  const open = [from];
  const done = new Set();
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (dist.get(open[i]) < dist.get(open[bi])) bi = i;
    const u = open.splice(bi, 1)[0];
    if (done.has(u)) continue;
    done.add(u);
    if (u === to) break;
    for (const { to: v, d } of graph.adj.get(u) ?? []) {
      const nd = dist.get(u) + d;
      if (nd < (dist.get(v) ?? Infinity)) {
        dist.set(v, nd);
        prev.set(v, u);
        open.push(v);
      }
    }
  }
  if (!dist.has(to)) return null;
  const path = [to];
  while (path[0] !== from) path.unshift(prev.get(path[0]));
  return { dist: dist.get(to), path };
}

function segNearest(px, pz, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const L2 = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / L2));
  return { x: a.x + t * dx, z: a.z + t * dz, t };
}

const numSuffix = (id) => {
  const m = /(\d+)$/.exec(id);
  return m ? parseInt(m[1], 10) : 0;
};

/**
 * (Re)attach a building's door to the nearest road or walkway. Updates the door node position, removes the old
 * spur edge, splits the nearest edge if needed and adds a new spur. Mutates `data.paths`.
 */
export function relinkDoor(data, building) {
  const paths = data.paths;
  const doorId = building.doorNode ?? `door-${building.id}`;
  building.doorNode = doorId;
  let node = paths.nodes.find((n) => n.id === doorId);
  if (!node) {
    node = { id: doorId, x: 0, z: 0, kind: 'door' };
    paths.nodes.push(node);
  }
  node.x = Math.round(building.doorPosition.x * 10) / 10;
  node.z = Math.round(building.doorPosition.z * 10) / 10;
  paths.edges = paths.edges.filter((e) => e.from !== doorId && e.to !== doorId);

  const byId = new Map(paths.nodes.map((n) => [n.id, n]));
  const doorIds = new Set(paths.nodes.filter((n) => n.kind === 'door').map((n) => n.id));
  let best = null;
  for (const e of paths.edges) {
    if (doorIds.has(e.from) || doorIds.has(e.to)) continue; // do not attach to other doors' spurs
    const a = byId.get(e.from), b = byId.get(e.to);
    const q = segNearest(node.x, node.z, a, b);
    const d = Math.hypot(q.x - node.x, q.z - node.z);
    if (!best || d < best.d) best = { d, q, e, a, b };
  }
  if (!best) return;
  let attach;
  const near = [best.a, best.b].find((n) => Math.hypot(n.x - best.q.x, n.z - best.q.z) < 3);
  if (near) attach = near.id;
  else {
    let next = 0;
    for (const n of paths.nodes) next = Math.max(next, numSuffix(n.id));
    attach = `p${next + 1}`;
    paths.nodes.push({ id: attach, x: Math.round(best.q.x * 10) / 10, z: Math.round(best.q.z * 10) / 10, kind: 'path' });
    const oldTo = best.e.to;
    best.e.to = attach;
    let ne = 0;
    for (const e of paths.edges) ne = Math.max(ne, numSuffix(e.id));
    paths.edges.push({ id: `e${ne + 1}`, from: attach, to: oldTo, type: best.e.type, width: best.e.width });
  }
  let ne2 = 0;
  for (const e of paths.edges) ne2 = Math.max(ne2, numSuffix(e.id));
  paths.edges.push({ id: `e${ne2 + 1}`, from: attach, to: doorId, type: 'walkway', width: 2.5 });
}

/** Nearest point on the outline of a (rotated) building footprint. rot is clockwise-from-north degrees. */
export function nearestOnFootprint(b, x, z) {
  const r = (b.rotationDeg * Math.PI) / 180;
  const e = [Math.cos(r), Math.sin(r)], s = [-Math.sin(r), Math.cos(r)];
  const hw = b.size.w / 2, hd = b.size.d / 2;
  const toWorld = (lx, lz) => ({ x: b.position.x + lx * e[0] + lz * s[0], z: b.position.z + lx * e[1] + lz * s[1] });
  const dx = x - b.position.x, dz = z - b.position.z;
  const lx = dx * e[0] + dz * e[1], lz = dx * s[0] + dz * s[1];
  const cx = Math.max(-hw, Math.min(hw, lx)), cz = Math.max(-hd, Math.min(hd, lz));
  if (Math.abs(lx) <= hw && Math.abs(lz) <= hd) {
    // inside: project to the nearest side
    const dxs = [hw - lx, lx + hw, hd - lz, lz + hd];
    const k = dxs.indexOf(Math.min(...dxs));
    if (k === 0) return toWorld(hw, lz);
    if (k === 1) return toWorld(-hw, lz);
    if (k === 2) return toWorld(lx, hd);
    return toWorld(lx, -hd);
  }
  return toWorld(cx, cz);
}
