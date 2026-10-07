// Floor plan -> geometry description (pure data, no three.js) so it can be unit-tested in Node.
//
// A floor is { level, outline {x0,z0,x1,z1}, court?, height, entrance?, rooms[], stairs[], lifts[] } in metres (x east, z south).
//  - `outline` is the outer rectangle, `court` an optional open courtyard inside it. What is left is the ring of wings;
//    the part of the ring that no room covers is verandah, corridor or lobby.
//  - Every room gets its own four walls inside its rectangle (so the rectangle keeps its size): the face towards the room
//    is "room" painted, the face towards the corridor carries the white-and-tan dado. Doors and wide openings are cut into them.
//  - The edge of the courtyard is an open arcade: a brown parapet with slots, columns and a slab edge, no wall.

export const WALL_T = 0.2;
export const DOOR = { w: 1.2, h: 2.1 };
export const ENTRANCE_W = 2.4;
export const PARAPET_H = 1.0;
const TYPE_ROOMS = new Set(['classroom', 'lab', 'office', 'seminar', 'library', 'washroom', 'store', 'lobby', 'other']);
const FLOOR_KIND = { classroom: 'green', lab: 'green', seminar: 'green', office: 'marble', library: 'marble', lobby: 'marble', washroom: 'marble', store: 'concrete', other: 'granite' };

const r2 = (v) => Math.round(v * 100) / 100;
const near = (a, b, e = 1e-3) => Math.abs(a - b) < e;

export function floorHeight(floor) {
  return floor.height ?? 3.6;
}

export function floorShortLabel(floor) {
  return floor.short ?? (floor.level === 0 ? 'G' : String(floor.level));
}

export function floorLabel(floor) {
  return floor.label ?? (floor.level === 0 ? 'Ground floor' : `Floor ${floor.level}`);
}

/** the doors of a room as a list: `doors` wins, else the single `door` (the first one carries the sign) */
export function roomDoors(room) {
  if (Array.isArray(room.doors) && room.doors.length) return room.doors;
  return room.door ? [room.door] : [];
}

/** run of a wall edge: orientation, the line the outer face sits on, run range, and the normal pointing out of the room */
function edgeOf(b, side) {
  switch (side) {
    case 'n': return { orient: 'h', coord: b.z0, lo: b.x0, hi: b.x1, nx: 0, nz: -1 };
    case 's': return { orient: 'h', coord: b.z1, lo: b.x0, hi: b.x1, nx: 0, nz: 1 };
    case 'w': return { orient: 'v', coord: b.x0, lo: b.z0, hi: b.z1, nx: -1, nz: 0 };
    default: return { orient: 'v', coord: b.x1, lo: b.z0, hi: b.z1, nx: 1, nz: 0 };
  }
}

function mergeIntervals(list) {
  const s = list.map((i) => [Math.min(i[0], i[1]), Math.max(i[0], i[1]), i[2]]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const iv of s) {
    const last = out[out.length - 1];
    if (last && iv[0] <= last[1] + 1e-6) last[1] = Math.max(last[1], iv[1]);
    else out.push([iv[0], iv[1], iv[2]]);
  }
  return out;
}

/** parts of [a,b] not covered by the intervals */
function subtractIntervals(a, b, cover) {
  const out = [];
  let cur = a;
  for (const [s, e] of mergeIntervals(cover)) {
    if (e <= cur) continue;
    if (s >= b) break;
    if (s > cur) out.push([cur, Math.min(s, b)]);
    cur = Math.max(cur, e);
  }
  if (cur < b - 1e-6) out.push([cur, b]);
  return out.filter(([s, e]) => e - s > 0.05);
}

/**
 * Build the description of one floor.
 */
export function buildPlan(floor) {
  const H = floorHeight(floor);
  const o = floor.outline;
  const c = floor.court ?? null;
  const T = WALL_T;
  const walls = []; // { x0,z0,x1,z1,y0,y1, solid, inner:[nx,nz]|null }  inner = normal of the face that looks into a room
  const colliders = [];
  const addCollider = (x0, z0, x1, z1, id = 'wall') => colliders.push({ id, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, hw: (x1 - x0) / 2, hd: (z1 - z0) / 2, rot: 0 });

  /** a straight wall run with openings. band = the two coordinates across the wall, run = [a,b] along it. */
  const wallRun = (orient, c0, c1, a, b, cuts, inner) => {
    let segs = [[a, b]];
    for (const [oa, ob, top] of mergeIntervals(cuts.filter((k) => k[1] > a && k[0] < b))) {
      const next = [];
      for (const s of segs) {
        if (ob <= s[0] || oa >= s[1]) { next.push(s); continue; }
        if (oa > s[0]) next.push([s[0], oa]);
        if (ob < s[1]) next.push([ob, s[1]]);
      }
      segs = next;
      const lintel = orient === 'h' ? { x0: Math.max(oa, a), x1: Math.min(ob, b), z0: c0, z1: c1 } : { x0: c0, x1: c1, z0: Math.max(oa, a), z1: Math.min(ob, b) };
      walls.push({ ...lintel, y0: top ?? DOOR.h, y1: H, solid: false, inner });
    }
    for (const [s, e] of segs) {
      if (e - s < 0.01) continue;
      const box = orient === 'h' ? { x0: s, x1: e, z0: c0, z1: c1 } : { x0: c0, x1: c1, z0: s, z1: e };
      walls.push({ ...box, y0: 0, y1: H, solid: true, inner });
      addCollider(box.x0, box.z0, box.x1, box.z1);
    }
  };

  // ---------- the entrance: an opening cut into whichever wall it lies on ----------
  const ent = floor.entrance ?? null;
  let entrance = null;
  const entranceCut = (orient, coord, lo, hi) => {
    if (!ent) return [];
    const facing = ent.facing ?? 'east';
    const vertical = facing === 'east' || facing === 'west';
    if ((orient === 'v') !== vertical) return [];
    const line = vertical ? ent.x : ent.z, along = vertical ? ent.z : ent.x;
    if (!near(line, coord, 0.05) || along < lo || along > hi) return [];
    return [[along - ENTRANCE_W / 2, along + ENTRANCE_W / 2, 2.4]];
  };
  if (ent) {
    const facing = ent.facing ?? 'east';
    const dir = { east: [1, 0], west: [-1, 0], north: [0, -1], south: [0, 1] }[facing] ?? [1, 0];
    entrance = { x: ent.x, z: ent.z, width: ENTRANCE_W, facing, nx: dir[0], nz: dir[1] };
  }

  // ---------- rooms: walls, doors, signs, windows ----------
  const doors = [], signs = [], picks = [], windows = [], decor = [];
  const roomOf = new Map();
  const furniture = {}; // roomId -> { boxes, decor }
  const bandOf = (b, side) => {
    switch (side) {
      case 'n': return ['h', b.z0, b.z0 + T];
      case 's': return ['h', b.z1 - T, b.z1];
      case 'w': return ['v', b.x0, b.x0 + T];
      default: return ['v', b.x1 - T, b.x1];
    }
  };
  for (const r of floor.rooms) {
    roomOf.set(r.id, r);
    const b = r.bounds;
    const list = roomDoors(r);
    for (const side of ['n', 's', 'w', 'e']) {
      const e = edgeOf(b, side);
      const [orient, c0, c1] = bandOf(b, side);
      const cuts = [];
      list.forEach((d, i) => {
        if (d.side !== side) return;
        const w = d.w ?? DOOR.w;
        cuts.push([d.at - w / 2, d.at + w / 2, d.h ?? DOOR.h]);
      });
      cuts.push(...entranceCut(orient, e.coord, e.lo, e.hi));
      const inner = [-e.nx, -e.nz];
      // vertical walls stop at the horizontal walls so the corners are not doubled
      const a = orient === 'h' ? e.lo : e.lo + T, z = orient === 'h' ? e.hi : e.hi - T;
      wallRun(orient, c0, c1, a, z, cuts, inner);
    }
    list.forEach((d, i) => {
      const e = edgeOf(b, d.side);
      const x = e.orient === 'h' ? d.at : e.coord, z = e.orient === 'h' ? e.coord : d.at;
      const rec = { roomId: r.id, side: d.side, width: d.w ?? DOOR.w, height: d.h ?? DOOR.h, open: !!d.open, x, z, nx: e.nx, nz: e.nz, main: i === 0 };
      doors.push(rec);
      if (i !== 0) return;
      signs.push({ roomId: r.id, text: String(r.number), sub: r.name, x: x + e.nx * 0.03, y: 2.5, z: z + e.nz * 0.03, nx: e.nx, nz: e.nz, w: 1.5, h: 0.4 });
      picks.push({ roomId: r.id, kind: 'sign', x: x + e.nx * 0.05, y: 2.7, z: z + e.nz * 0.05, w: 1.6, h: 0.6, d: 0.3 });
      if (!d.open) picks.push({ roomId: r.id, kind: 'door', x: x + e.nx * 0.12, y: DOOR.h / 2, z: z + e.nz * 0.12, w: (d.w ?? DOOR.w) + 0.2, h: DOOR.h, d: 0.5, nx: e.nx, nz: e.nz });
    });
  }

  // ---------- the outline: wall where no room stands ----------
  if (floor.outlineWalls !== false) {
    const sides = {
      n: [o.z0, o.z0 + T, o.x0, o.x1, (b) => near(b.z0, o.z0), (b) => [b.x0, b.x1]],
      s: [o.z1 - T, o.z1, o.x0, o.x1, (b) => near(b.z1, o.z1), (b) => [b.x0, b.x1]],
      w: [o.x0, o.x0 + T, o.z0 + T, o.z1 - T, (b) => near(b.x0, o.x0), (b) => [b.z0, b.z1]],
      e: [o.x1 - T, o.x1, o.z0 + T, o.z1 - T, (b) => near(b.x1, o.x1), (b) => [b.z0, b.z1]],
    };
    for (const [side, [c0, c1, a, z, flush, span]] of Object.entries(sides)) {
      const cover = floor.rooms.filter((r) => flush(r.bounds)).map((r) => span(r.bounds));
      const orient = side === 'n' || side === 's' ? 'h' : 'v';
      const coord = side === 'n' ? o.z0 : side === 's' ? o.z1 : side === 'w' ? o.x0 : o.x1;
      for (const [s, e] of subtractIntervals(a, z, cover)) wallRun(orient, c0, c1, s, e, entranceCut(orient, coord, s, e), null);
    }
  }

  // ---------- floors and ceilings ----------
  const floors = []; // { x0,z0,x1,z1, kind, y }
  const ceilings = [];
  const ringParts = c
    ? [
        { x0: o.x0, z0: o.z0, x1: o.x1, z1: c.z0 },
        { x0: o.x0, z0: c.z1, x1: o.x1, z1: o.z1 },
        { x0: o.x0, z0: c.z0, x1: c.x0, z1: c.z1 },
        { x0: c.x1, z0: c.z0, x1: o.x1, z1: c.z1 },
      ]
    : [{ ...o }];
  const corridorKind = floor.corridorFloor ?? 'granite';
  for (const p of ringParts) {
    floors.push({ ...p, kind: corridorKind, y: 0 });
    ceilings.push({ ...p });
  }
  for (const r of floor.rooms) floors.push({ ...r.bounds, kind: r.floor ?? FLOOR_KIND[r.type] ?? 'granite', y: 0.03 });

  // ---------- the courtyard arcade ----------
  const parapets = [], columns = [], fascia = [];
  if (c) {
    // [side, orientation, line of the court edge, run from, run to, normal pointing from the court towards the ring]
    const sides = [
      ['n', 'h', c.z0, c.x0, c.x1, 0, -1],
      ['s', 'h', c.z1, c.x0, c.x1, 0, 1],
      ['w', 'v', c.x0, c.z0, c.z1, -1, 0],
      ['e', 'v', c.x1, c.z0, c.z1, 1, 0],
    ];
    const PT = 0.25, CW = 0.42;
    for (const [side, orient, coord, lo, hi, nx, nz] of sides) {
      const len = hi - lo;
      const bays = Math.max(1, Math.round(len / 3.7));
      const step = len / bays;
      // parapet and columns stand on the verandah side of the court edge
      const band = orient === 'h'
        ? { x0: lo, x1: hi, z0: Math.min(coord, coord + nz * PT), z1: Math.max(coord, coord + nz * PT) }
        : { x0: Math.min(coord, coord + nx * PT), x1: Math.max(coord, coord + nx * PT), z0: lo, z1: hi };
      for (let i = 0; i <= bays; i++) {
        const q = lo + i * step;
        columns.push(orient === 'h' ? { x: r2(q), z: r2(coord + nz * PT / 2), w: CW, d: CW } : { x: r2(coord + nx * PT / 2), z: r2(q), w: CW, d: CW });
      }
      parapets.push({ ...band, orient, side, nx, nz, h: PARAPET_H });
      fascia.push({ ...band, y0: H - 0.5, y1: H });
      // the blocker reaches a little into the court so nobody slips past the parapet
      const reach = 0.3; // metres into the court
      addCollider(
        orient === 'h' ? band.x0 : Math.min(band.x0, coord - reach),
        orient === 'h' ? Math.min(band.z0, coord - reach) : band.z0,
        orient === 'h' ? band.x1 : Math.max(band.x1, coord + reach),
        orient === 'h' ? Math.max(band.z1, coord + reach) : band.z1,
        'parapet',
      );
    }
  }

  // ---------- doors' signs aside: windows ----------
  const inCourtOrOutline = (side, b) => {
    const e = edgeOf(b, side);
    if (e.orient === 'h') return near(e.coord, o.z0) || near(e.coord, o.z1);
    return near(e.coord, o.x0) || near(e.coord, o.x1);
  };
  const oppositeSide = { n: 's', s: 'n', e: 'w', w: 'e' };
  const addWindow = (b, side, centre, w, both) => {
    const e = edgeOf(b, side);
    const along = e.orient === 'h' ? { x: centre, z: e.coord } : { x: e.coord, z: centre };
    const base = { w, h: 1.5, y: 1.05 };
    // face towards the room (inside), and when asked the face towards the corridor
    windows.push({ ...base, x: along.x - e.nx * (T + 0.012), z: along.z - e.nz * (T + 0.012), nx: -e.nx, nz: -e.nz });
    if (both) windows.push({ ...base, x: along.x + e.nx * 0.012, z: along.z + e.nz * 0.012, nx: e.nx, nz: e.nz });
  };
  for (const r of floor.rooms) {
    const b = r.bounds;
    const main = roomDoors(r)[0];
    if (!main || r.type === 'lobby') continue;
    const outerSide = oppositeSide[main.side];
    if (inCourtOrOutline(outerSide, b)) {
      const e = edgeOf(b, outerSide), len = e.hi - e.lo;
      for (const f of [0.27, 0.73]) addWindow(b, outerSide, e.lo + len * f, 1.9, false);
    }
    // corridor side: up to two windows next to the door
    const e = edgeOf(b, main.side);
    const w = 1.7, dw = main.w ?? DOOR.w;
    const picks2 = [-2.2, 2.2, -4.3, 4.3].map((o2) => main.at + o2).filter((cx) => Math.abs(cx - main.at) > dw / 2 + w / 2 + 0.35 && cx - w / 2 > e.lo + T + 0.5 && cx + w / 2 < e.hi - T - 0.5);
    for (const cx of picks2.slice(0, 2)) addWindow(b, main.side, cx, w, true);
  }

  // ---------- furniture and decor ----------
  const cd = (roomId) => (furniture[roomId] ??= { boxes: [], decor: [] });
  for (const r of floor.rooms) {
    const slot = cd(r.id);
    furnish(r, slot, addCollider, T, H);
  }

  // ---------- corridor props: notice boards, fire extinguishers, water coolers (seen in the corridor photos) ----------
  const props = { boxes: [], decor: [] };
  floor.rooms.forEach((r, i) => {
    const main = roomDoors(r)[0];
    if (!main || r.type === 'lobby' || i % 3 !== 1) return;
    const e = edgeOf(r.bounds, main.side);
    const dw = main.w ?? DOOR.w;
    const dir = main.at - e.lo > e.hi - main.at ? -1 : 1; // towards the room's far end
    const at = (off) => (e.orient === 'h' ? { x: main.at + dir * off, z: e.coord } : { x: e.coord, z: main.at + dir * off });
    const nb = at(dw / 2 + 1.3), fe = at(dw / 2 + 0.55);
    const lo = e.lo + T + 0.5, hi = e.hi - T - 0.5;
    const along = (q) => (e.orient === 'h' ? q.x : q.z);
    if (along(nb) > lo && along(nb) < hi) props.decor.push({ cell: 'notice', x: r2(nb.x + e.nx * 0.012), z: r2(nb.z + e.nz * 0.012), y: 1.15, w: 0.8, h: 0.8, nx: e.nx, nz: e.nz });
    if (along(fe) > lo && along(fe) < hi) props.boxes.push({ x: r2(fe.x + e.nx * 0.1), z: r2(fe.z + e.nz * 0.1), w: 0.16, d: 0.16, h: 0.5, y: 0.95, color: 0xb02a22 });
  });
  for (const s of (floor.stairs ?? []).filter((_, i, a) => i === 0 || i === a.length - 1)) {
    // a steel water cooler beside the foot of the stairs, on the courtyard side
    const toward = Math.sign((c ?? o).x0 + ((c ?? o).x1 - (c ?? o).x0) / 2 - s.landing.x) || 1;
    const cx = s.landing.x + toward * 1.4, cz = s.landing.z;
    props.boxes.push({ x: r2(cx), z: r2(cz), w: 0.55, d: 0.5, h: 1.45, y: 0, color: COLORS.cooler });
    addCollider(cx - 0.3, cz - 0.28, cx + 0.3, cz + 0.28, 'furniture');
  }

  // ---------- stairs and lifts ----------
  const stairs = [], lifts = [];
  for (const s of floor.stairs ?? []) {
    const boxes = stairBoxes(s, H);
    addCollider(Math.min(...boxes.map((q) => q.x0)), Math.min(...boxes.map((q) => q.z0)), Math.max(...boxes.map((q) => q.x1)), Math.max(...boxes.map((q) => q.z1)), `stairs:${s.id}`);
    stairs.push({ ...s, boxes });
  }
  for (const l of floor.lifts ?? []) {
    const b = l.bounds;
    addCollider(b.x0, b.z0, b.x1, b.z1, `lift:${l.id}`);
    lifts.push({ ...l });
  }

  // ---------- door-side props and lights ----------
  const lights = [];
  for (const p of ringParts) {
    const alongX = p.x1 - p.x0 >= p.z1 - p.z0;
    const len = alongX ? p.x1 - p.x0 : p.z1 - p.z0;
    const n = Math.max(1, Math.floor(len / 6));
    for (let i = 0; i < n; i++) {
      const t = ((i + 0.5) / n) * len;
      lights.push(alongX ? { x: r2(p.x0 + t), z: r2((c ? (p.z0 < c.z0 ? c.z0 - 1.6 : c.z1 + 1.6) : (p.z0 + p.z1) / 2)), w: 1.2, d: 0.14 } : { x: r2(c ? (p.x0 < c.x0 ? c.x0 - 1.6 : c.x1 + 1.6) : (p.x0 + p.x1) / 2), z: r2(p.z0 + t), w: 0.14, d: 1.2 });
    }
  }
  for (const r of floor.rooms) {
    const b = r.bounds;
    const horiz = b.x1 - b.x0 >= b.z1 - b.z0;
    for (const f of [0.28, 0.72]) {
      lights.push(horiz ? { x: r2(b.x0 + (b.x1 - b.x0) * f), z: r2((b.z0 + b.z1) / 2), w: 0.14, d: 1.2 } : { x: r2((b.x0 + b.x1) / 2), z: r2(b.z0 + (b.z1 - b.z0) * f), w: 1.2, d: 0.14 });
    }
  }

  // ---------- garden inside the courtyard ----------
  const garden = c ? gardenOf(c) : null;

  const spawn = entrance
    ? { x: r2(entrance.x - entrance.nx * 2.6), z: r2(entrance.z - entrance.nz * 2.6), yaw: Math.atan2(entrance.nx, entrance.nz) }
    : stairs[0] ? { x: stairs[0].landing.x, z: stairs[0].landing.z, yaw: 0 } : { x: (o.x0 + o.x1) / 2, z: (o.z0 + o.z1) / 2, yaw: 0 };

  return {
    height: H, slabs: walls, walls, floors, ceilings, parapets, columns, fascia, doors, signs, windows, decor, furniture, colliders, stairs, lifts, picks,
    lights, garden, entrance, ringParts, props,
    boundary: [{ x: o.x0, z: o.z0 }, { x: o.x1, z: o.z0 }, { x: o.x1, z: o.z1 }, { x: o.x0, z: o.z1 }],
    spawn, outline: o, court: c,
  };
}

// ---------- stairs ----------

/** a straight flight inside `bounds` rising towards `rise` (n|s|e|w); treads and nosings as boxes, side walls, and the wall above the top */
export function stairBoxes(s, H) {
  const b = s.bounds;
  const rise = s.rise ?? 'w';
  const alongX = rise === 'e' || rise === 'w';
  const len = alongX ? b.x1 - b.x0 : b.z1 - b.z0;
  const width = alongX ? b.z1 - b.z0 : b.x1 - b.x0;
  const n = Math.max(6, Math.round(len / 0.27));
  const run = len / n;
  const stepH = Math.min(0.18, (H - 0.7) / n);
  const dir = rise === 'e' || rise === 's' ? 1 : -1; // direction of travel along the axis
  const start = alongX ? (dir > 0 ? b.x0 : b.x1) : (dir > 0 ? b.z0 : b.z1);
  const boxes = [];
  const rect = (a0, a1, w0, w1, y0, y1, color) => {
    const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
    boxes.push(alongX ? { x0: lo, x1: hi, z0: w0, z1: w1, y0, y1, color } : { x0: w0, x1: w1, z0: lo, z1: hi, y0, y1, color });
  };
  const w0 = alongX ? b.z0 : b.x0, w1 = alongX ? b.z1 : b.x1;
  for (let i = 0; i < n; i++) {
    const a0 = start + dir * i * run, a1 = a0 + dir * run;
    const h = stepH * (i + 1);
    rect(a0, a1, w0 + 0.25, w1 - 0.25, 0, h, i % 2 ? 0xa8a59e : 0xb2afa7);
    rect(a0, a0 + dir * 0.05, w0 + 0.25, w1 - 0.25, h - 0.03, h, 0x5f8eb0); // the blue nosing line on every tread
  }
  for (const [p0, p1] of [[w0, w0 + 0.25], [w1 - 0.25, w1]]) rect(start, start + dir * len, p0, p1, 0, 1.15, 0x8c6b55); // brown side walls
  const end = start + dir * len;
  rect(end, end + dir * 0.3, w0, w1, 0, H - 0.4, 0xf0eadb); // the wall the flight runs into
  return boxes;
}

// ---------- garden ----------

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** trees and hex-paver paths for the courtyard (deterministic; the same on every floor) */
export function gardenOf(c) {
  const r = mulberry(7001);
  const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;
  const pathW = 2.4;
  const paths = [
    { x0: c.x0, x1: c.x1, z0: cz - pathW / 2, z1: cz + pathW / 2 },
    { x0: cx - pathW / 2, x1: cx + pathW / 2, z0: c.z0, z1: c.z1 },
  ];
  const onPath = (x, z, m) => paths.some((p) => x > p.x0 - m && x < p.x1 + m && z > p.z0 - m && z < p.z1 + m);
  const trees = [];
  const area = (c.x1 - c.x0) * (c.z1 - c.z0);
  const want = Math.round(area / 55);
  for (let tries = 0; tries < want * 6 && trees.length < want; tries++) {
    const M = 5; // keep the crowns away from the verandah
    const x = c.x0 + M + r() * (c.x1 - c.x0 - 2 * M), z = c.z0 + M + r() * (c.z1 - c.z0 - 2 * M);
    if (onPath(x, z, 2.2)) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 4.2)) continue;
    trees.push({ x: r2(x), z: r2(z), h: r2(5 + r() * 3.5), s: r2(2.6 + r() * 1.6), tone: Math.floor(r() * 4) });
  }
  return { rect: c, paths, trees };
}

// ---------- furniture ----------
const COLORS = {
  desk: 0x8fa4b0, deskDark: 0x6e8794, steel: 0x8f999f, wood: 0xc4a074, dark: 0x5a4632, table: 0xb9a07a, screen: 0x1d2630,
  stall: 0x7d8f9c, white: 0xe9ecef, bin: 0x2f6b3e, cooler: 0xaab2b6,
};

/**
 * Furniture of one room in a frame that follows the door: u runs along the corridor wall from the front end wall,
 * v from the corridor wall into the room. Everything is a box; the first colour/size are photographed classroom styles.
 */
function furnish(room, slot, addCollider, T, H) {
  const b = room.bounds;
  const main = roomDoors(room)[0];
  const side = main?.side ?? 's';
  const alongX = side === 'n' || side === 's';
  const lo = alongX ? b.x0 : b.z0, hi = alongX ? b.x1 : b.z1;
  const Lr = hi - lo - 2 * T; // usable length along the corridor wall
  const Dr = (alongX ? b.z1 - b.z0 : b.x1 - b.x0) - 2 * T; // usable depth
  const at = main?.at ?? (lo + hi) / 2;
  const frontLow = at - lo <= hi - at; // the front wall is the end nearer the door
  const sgn = frontLow ? 1 : -1;
  const toWorld = (u, v) => {
    const a = frontLow ? lo + T + u : hi - T - u;
    switch (side) {
      case 's': return { x: a, z: b.z1 - T - v };
      case 'n': return { x: a, z: b.z0 + T + v };
      case 'e': return { x: b.x1 - T - v, z: a };
      default: return { x: b.x0 + T + v, z: a };
    }
  };
  const normal = alongX ? { nx: sgn, nz: 0 } : { nx: 0, nz: sgn }; // out of the front wall into the room
  /** box between local corners; y0..y1 vertical */
  const box = (u0, u1, v0, v1, y0, y1, color, solid = false) => {
    const p = toWorld(u0, v0), q = toWorld(u1, v1);
    const x0 = Math.min(p.x, q.x), x1 = Math.max(p.x, q.x), z0 = Math.min(p.z, q.z), z1 = Math.max(p.z, q.z);
    slot.boxes.push({ x: r2((x0 + x1) / 2), z: r2((z0 + z1) / 2), w: r2(x1 - x0), d: r2(z1 - z0), h: r2(y1 - y0), y: r2(y0), color });
    if (solid) addCollider(x0, z0, x1, z1, 'furniture');
  };
  /** flat picture on the front wall (u = 0), centred at v, between y0 and y1 */
  const onFront = (cell, v, w, y0, y1) => {
    const p = toWorld(0.012, v);
    slot.decor.push({ cell, x: r2(p.x), z: r2(p.z), y: y0, w, h: y1 - y0, nx: normal.nx, nz: normal.nz });
  };
  /** a bench set: desk, seat, back rail and two side frames (u extent 0.95, v extent 1.6) */
  const benchSet = (u, v) => {
    box(u, u + 0.42, v, v + 1.6, 0.72, 0.77, COLORS.desk);
    box(u + 0.62, u + 0.9, v, v + 1.6, 0.42, 0.46, COLORS.desk);
    box(u + 0.88, u + 0.92, v, v + 1.6, 0.46, 0.84, COLORS.deskDark);
    for (const vv of [v + 0.04, v + 1.56]) box(u + 0.02, u + 0.92, vv - 0.02, vv + 0.02, 0, 0.72, COLORS.deskDark);
  };

  switch (room.type) {
    case 'classroom':
    case 'seminar': {
      // dais under the boards, two white boards with a wall panel between them, rows of bench sets in two groups
      box(0.05, 1.45, Math.min(1.7, Dr * 0.2), Dr - 0.05, 0, 0.15, COLORS.wood);
      const mid = (Math.min(1.7, Dr * 0.2) + Dr) / 2;
      onFront('whiteboard', mid - 2.3, 2.0, 1.0, 2.05);
      onFront('panel', mid, 1.3, 1.15, 1.9);
      onFront('whiteboard', mid + 2.3, 2.0, 1.0, 2.05);
      for (const f of [0.25, 0.5, 0.75]) fan(slot, toWorld(Lr * f, Dr / 2), H);
      const rowsU0 = 2.5, pitch = 1.15;
      const rows = Math.max(0, Math.floor((Lr - 0.3 - rowsU0 - 0.95) / pitch) + 1);
      const groupW = 3.2;
      const free = Dr - 2 * groupW;
      const aisle = Math.min(1.1, Math.max(0.6, free * 0.4));
      const side0 = Math.max(0.2, (free - aisle) / 2);
      for (let i = 0; i < rows; i++) {
        const u = rowsU0 + i * pitch;
        for (const g of [0, 1]) {
          const v0 = side0 + g * (groupW + aisle);
          for (let k = 0; k < 2; k++) benchSet(u, v0 + k * 1.6);
          addCollider(...worldRect(toWorld, u, u + 0.95, v0, v0 + groupW), 'furniture');
        }
      }
      break;
    }
    case 'lab': {
      for (let i = 0; i < 3; i++) {
        const u = 2.2 + i * 2.2;
        if (u + 0.9 > Lr - 0.3) break;
        box(u, u + 0.9, 2.0, Dr - 0.6, 0.78, 0.84, COLORS.table, true);
        for (let v = 2.4; v < Dr - 1.2; v += 1.1) box(u + 0.25, u + 0.6, v, v + 0.4, 0.84, 1.2, COLORS.screen);
      }
      box(0.05, 0.9, 2.0, Dr - 0.6, 0, 0.12, COLORS.wood);
      break;
    }
    case 'office': {
      box(1.2, 2.0, 1.8, 3.4, 0, 0.76, COLORS.dark, true);
      box(1.2, 2.0, Dr - 3.4, Dr - 1.8, 0, 0.76, COLORS.dark, true);
      box(Lr - 0.5, Lr - 0.05, 2.0, Math.min(Dr - 1.0, 4.4), 0, 1.8, COLORS.steel, true);
      break;
    }
    case 'washroom': {
      for (const u of [1.4, 3.0, 4.6, 6.2]) {
        if (u + 1.2 > Lr - 0.3 || Math.abs(u + 0.6 - (at - lo - T)) < 1.0) continue;
        box(u, u + 1.2, Dr - 1.6, Dr - 0.05, 0, 1.9, COLORS.stall, true);
      }
      break;
    }
    case 'store':
    case 'library': {
      const rows = room.type === 'library' ? 4 : 2;
      for (let i = 0; i < rows; i++) {
        const u = 2.2 + i * 1.7;
        if (u + 0.5 > Lr - 0.3) break;
        box(u, u + 0.5, 2.0, Dr - 0.4, 0, 1.9, COLORS.steel, true);
      }
      break;
    }
    case 'lobby': {
      // the entrance hall: bench rows along two walls, honour boards, a display, a directory board and a bin
      const x0 = b.x0 + T, x1 = b.x1 - T, z0 = b.z0 + T, z1 = b.z1 - T;
      const along = (nx, nz, px, pz, w, y0, y1, cell) => slot.decor.push({ cell, x: r2(px), z: r2(pz), y: y0, w, h: y1 - y0, nx, nz });
      // the hall is long north to south: benches along the north and south walls, boards above them
      const benchRow = (zc, towards) => {
        const xs = [];
        for (let k = 0; k < 11; k++) xs.push(x0 + 1.2 + k * 0.6);
        for (const x of xs) {
          if (x > x1 - 0.8) break;
          slot.boxes.push({ x: r2(x), z: r2(zc), w: 0.5, d: 0.46, h: 0.05, y: 0.45, color: COLORS.steel });
          slot.boxes.push({ x: r2(x), z: r2(zc - towards * 0.2), w: 0.5, d: 0.05, h: 0.34, y: 0.5, color: COLORS.steel });
          slot.boxes.push({ x: r2(x), z: r2(zc), w: 0.06, d: 0.4, h: 0.45, y: 0, color: COLORS.deskDark });
        }
        addCollider(x0 + 0.9, zc - 0.28, Math.min(x1 - 0.5, x0 + 1.2 + 10 * 0.6 + 0.3), zc + 0.28, 'furniture');
      };
      benchRow(z0 + 0.55, 1);
      benchRow(z1 - 0.55, -1);
      // honour boards on the north and south walls, a display on the south wall, a directory beside the opening
      for (let k = 0; k < 3; k++) along(0, 1, x0 + 1.6 + k * 2.4, z0 + 0.012, 1.5, 1.05, 2.85, 'honour');
      for (let k = 0; k < 2; k++) along(0, -1, x0 + 1.8 + k * 3.0, z1 - 0.012, 1.5, 1.05, 2.85, 'honour');
      along(0, -1, x0 + 6.8, z1 - 0.012, 0.9, 1.1, 2.3, 'display');
      slot.boxes.push({ x: r2(x1 - 0.6), z: r2(z0 + 0.8), w: 0.45, d: 0.45, h: 0.8, y: 0, color: COLORS.bin });
      // the black directory board on the hall wall beside the opening, and ceiling fans
      slot.decor.push({ cell: 'directory', x: r2(b.x0 + T + 0.012), z: r2(b.z0 + 2.2), y: 0.95, w: 0.95, h: 1.9, nx: 1, nz: 0 });
      for (const fz of [0.22, 0.5, 0.78]) fan(slot, { x: (b.x0 + b.x1) / 2, z: b.z0 + (b.z1 - b.z0) * fz }, H);
      break;
    }
    default:
      break;
  }
}

/** a ceiling fan: rod, hub and two crossed blades */
function fan(slot, p, H) {
  const dark = 0x4a4540;
  slot.boxes.push({ x: r2(p.x), z: r2(p.z), w: 0.04, d: 0.04, h: 0.35, y: H - 0.35, color: dark });
  slot.boxes.push({ x: r2(p.x), z: r2(p.z), w: 0.22, d: 0.22, h: 0.09, y: H - 0.44, color: dark });
  slot.boxes.push({ x: r2(p.x), z: r2(p.z), w: 1.2, d: 0.15, h: 0.02, y: H - 0.42, color: 0x6a645c });
  slot.boxes.push({ x: r2(p.x), z: r2(p.z), w: 0.15, d: 1.2, h: 0.02, y: H - 0.42, color: 0x6a645c });
}

/** world rectangle [x0,z0,x1,z1] of a local rectangle */
function worldRect(toWorld, u0, u1, v0, v1) {
  const p = toWorld(u0, v0), q = toWorld(u1, v1);
  return [Math.min(p.x, q.x), Math.min(p.z, q.z), Math.max(p.x, q.x), Math.max(p.z, q.z)];
}

// ---------- timetable ----------
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const toMin = (hhmm) => parseInt(hhmm.slice(0, 2), 10) * 60 + parseInt(hhmm.slice(3, 5), 10);

/** Is something in session in this room at `date` (local device time)? */
export function sessionNow(room, date = new Date()) {
  const day = DAYS[date.getDay()];
  const minutes = date.getHours() * 60 + date.getMinutes();
  const today = (room.timetable ?? []).filter((t) => t.day === day).sort((a, b) => toMin(a.start) - toMin(b.start));
  const current = today.find((t) => toMin(t.start) <= minutes && minutes < toMin(t.end)) ?? null;
  const next = today.find((t) => toMin(t.start) > minutes) ?? null;
  return { day, current, next, today };
}

export const ROOM_TYPE_LABEL = {
  classroom: 'Classroom', lab: 'Laboratory', office: 'Office', seminar: 'Seminar hall', library: 'Library', washroom: 'Washroom', store: 'Store', lobby: 'Entrance hall', other: 'Room',
};
export { TYPE_ROOMS };
