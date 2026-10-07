// Floor plan -> geometry description (pure data, no three.js) so it can be unit-tested in Node.
// A floor is { level, outline {x0,z0,x1,z1}, height, entrance?, rooms[], stairs[], lifts[] } in metres (x east, z south).
// Walls are generated from the room rectangles and the outline: shared edges are merged, doors cut openings.

export const WALL_T = 0.2;
export const DOOR = { w: 1.2, h: 2.1 };
export const ENTRANCE_W = 1.8;
const TYPE_ROOMS = new Set(['classroom', 'lab', 'office', 'seminar', 'library', 'washroom', 'store', 'other']);

const r2 = (v) => Math.round(v * 100) / 100;

export function floorHeight(floor) {
  return floor.height ?? 3.4;
}

export function floorShortLabel(floor) {
  return floor.short ?? (floor.level === 0 ? 'G' : String(floor.level));
}

export function floorLabel(floor) {
  return floor.label ?? (floor.level === 0 ? 'Ground floor' : `Floor ${floor.level}`);
}

function mergeIntervals(list) {
  const s = list.map((i) => [Math.min(i[0], i[1]), Math.max(i[0], i[1])]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const iv of s) {
    const last = out[out.length - 1];
    if (last && iv[0] <= last[1] + 1e-6) last[1] = Math.max(last[1], iv[1]);
    else out.push([iv[0], iv[1]]);
  }
  return out;
}

/** which wall of the rect the door is on: 'n' (z0), 's' (z1), 'w' (x0), 'e' (x1) */
function doorOnRoom(room) {
  const b = room.bounds, d = room.door;
  if (!d) return null;
  const side = d.side;
  if (side === 'n') return { orient: 'h', c: b.z0, at: d.at, nx: 0, nz: -1 }; // opens toward -z
  if (side === 's') return { orient: 'h', c: b.z1, at: d.at, nx: 0, nz: 1 };
  if (side === 'w') return { orient: 'v', c: b.x0, at: d.at, nx: -1, nz: 0 };
  return { orient: 'v', c: b.x1, at: d.at, nx: 1, nz: 0 };
}

/**
 * Build the description of one floor.
 * @returns {{
 *   height:number, slabs:{x0:number,z0:number,x1:number,z1:number,y0:number,y1:number,solid:boolean}[],
 *   doors:object[], signs:object[], windows:object[], furniture:object[], colliders:object[], stairs:object[], lifts:object[],
 *   boundary:{x:number,z:number}[], spawn:{x:number,z:number,yaw:number}, entrance:object|null, picks:object[]
 * }}
 */
export function buildPlan(floor) {
  const H = floorHeight(floor);
  const o = floor.outline;
  const lines = new Map(); // 'h:z' | 'v:x' -> { orient, c, ivs:[], open:[] }
  const line = (orient, c) => {
    const k = `${orient}:${r2(c)}`;
    if (!lines.has(k)) lines.set(k, { orient, c: r2(c), ivs: [], open: [] });
    return lines.get(k);
  };
  const addRect = (b) => {
    line('h', b.z0).ivs.push([b.x0, b.x1]);
    line('h', b.z1).ivs.push([b.x0, b.x1]);
    line('v', b.x0).ivs.push([b.z0, b.z1]);
    line('v', b.x1).ivs.push([b.z0, b.z1]);
  };
  addRect(o);
  for (const r of floor.rooms) addRect(r.bounds);

  const doors = [];
  for (const r of floor.rooms) {
    const d = doorOnRoom(r);
    if (!d) continue;
    line(d.orient, d.c).open.push([d.at - DOOR.w / 2, d.at + DOOR.w / 2, 'door']);
    doors.push({
      roomId: r.id, side: r.door.side, width: DOOR.w,
      x: d.orient === 'h' ? d.at : d.c, z: d.orient === 'h' ? d.c : d.at,
      nx: d.nx, nz: d.nz, // pointing out of the room, into the corridor
    });
  }
  let entrance = null;
  if (floor.entrance) {
    const e = floor.entrance;
    line('v', e.x).open.push([e.z - ENTRANCE_W / 2, e.z + ENTRANCE_W / 2, 'entrance']);
    entrance = { x: e.x, z: e.z, width: ENTRANCE_W, facing: e.facing ?? 'east', nx: e.x >= (o.x0 + o.x1) / 2 ? 1 : -1, nz: 0 };
  }

  // walls: union of edges, minus openings; lintels over the openings
  const slabs = [];
  const T = WALL_T;
  for (const L of lines.values()) {
    for (const [a, b] of mergeIntervals(L.ivs)) {
      let segs = [[a, b, true, true]]; // from, to, extendStart, extendEnd
      for (const [oa, ob] of mergeIntervals(L.open.map((v) => [v[0], v[1]]))) {
        const next = [];
        for (const s of segs) {
          if (ob <= s[0] || oa >= s[1]) { next.push(s); continue; }
          if (oa > s[0]) next.push([s[0], oa, s[2], false]);
          if (ob < s[1]) next.push([ob, s[1], false, s[3]]);
        }
        segs = next;
        const y0 = (L.open.find((v) => Math.abs(v[0] - oa) < 1e-6 && Math.abs(v[1] - ob) < 1e-6)?.[2]) === 'entrance' ? 2.4 : DOOR.h;
        if (oa >= a - 1e-6 && ob <= b + 1e-6) {
          const lint = L.orient === 'h'
            ? { x0: oa, x1: ob, z0: L.c - T / 2, z1: L.c + T / 2 }
            : { x0: L.c - T / 2, x1: L.c + T / 2, z0: oa, z1: ob };
          slabs.push({ ...lint, y0, y1: H, solid: false });
        }
      }
      for (const [s0, s1, e0, e1] of segs) {
        const f0 = s0 - (e0 ? T / 2 : 0), f1 = s1 + (e1 ? T / 2 : 0);
        if (f1 - f0 < 0.01) continue;
        slabs.push(L.orient === 'h'
          ? { x0: f0, x1: f1, z0: L.c - T / 2, z1: L.c + T / 2, y0: 0, y1: H, solid: true }
          : { x0: L.c - T / 2, x1: L.c + T / 2, z0: f0, z1: f1, y0: 0, y1: H, solid: true });
      }
    }
  }

  const colliders = [];
  const addCollider = (x0, z0, x1, z1, id = 'wall') => colliders.push({ id, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, hw: (x1 - x0) / 2, hd: (z1 - z0) / 2, rot: 0 });
  for (const s of slabs) if (s.solid) addCollider(s.x0, s.z0, s.x1, s.z1);

  // door signs (on the corridor side, above the door) and pick volumes
  const signs = [], picks = [];
  for (const d of doors) {
    const room = floor.rooms.find((r) => r.id === d.roomId);
    signs.push({
      roomId: room.id, text: String(room.number), sub: room.name,
      x: d.x + d.nx * (T / 2 + 0.03), y: 2.5, z: d.z + d.nz * (T / 2 + 0.03), nx: d.nx, nz: d.nz, w: 1.5, h: 0.4,
    });
    picks.push({ roomId: room.id, kind: 'sign', x: d.x + d.nx * (T / 2 + 0.05), y: 2.7, z: d.z + d.nz * (T / 2 + 0.05), w: 1.6, h: 0.6, d: 0.3 });
    picks.push({ roomId: room.id, kind: 'door', x: d.x + d.nx * 0.12, y: DOOR.h / 2, z: d.z + d.nz * 0.12, w: DOOR.w + 0.2, h: DOOR.h, d: 0.5, nx: d.nx, nz: d.nz });
  }

  // windows on the outside walls, one per room that touches the outline
  const windows = [];
  const near = (a, b) => Math.abs(a - b) < 1e-3;
  for (const r of floor.rooms) {
    const b = r.bounds;
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    if (near(b.z0, o.z0) && r.door?.side !== 'n') windows.push({ x: cx, z: o.z0, nx: 0, nz: 1, w: 2.4, h: 1.3, y: 1.0 });
    if (near(b.z1, o.z1) && r.door?.side !== 's') windows.push({ x: cx, z: o.z1, nx: 0, nz: -1, w: 2.4, h: 1.3, y: 1.0 });
  }

  // furniture by room type
  const furniture = [];
  const box = (x, z, w, d, h, color, y = 0, solid = true, id = 'furniture') => {
    furniture.push({ x, z, w, d, h, y, color });
    if (solid) addCollider(x - w / 2, z - d / 2, x + w / 2, z + d / 2, id);
  };
  for (const r of floor.rooms) furnish(r, box);

  // stairs and lifts: solid blocks the player walks around
  const stairs = [], lifts = [];
  for (const s of floor.stairs ?? []) {
    const b = s.bounds;
    addCollider(b.x0, b.z0, b.x1, b.z1, `stairs:${s.id}`);
    stairs.push({ ...s });
  }
  for (const l of floor.lifts ?? []) {
    const b = l.bounds;
    addCollider(b.x0, b.z0, b.x1, b.z1, `lift:${l.id}`);
    lifts.push({ ...l });
  }

  const spawn = entrance
    ? { x: r2(entrance.x - entrance.nx * 2.6), z: entrance.z, yaw: entrance.nx > 0 ? Math.PI / 2 : -Math.PI / 2 }
    : stairs[0] ? { x: stairs[0].landing.x, z: stairs[0].landing.z, yaw: -Math.PI / 2 } : { x: (o.x0 + o.x1) / 2, z: (o.z0 + o.z1) / 2, yaw: 0 };

  return {
    height: H, slabs, doors, signs, windows, furniture, colliders, stairs, lifts, picks, entrance,
    boundary: [{ x: o.x0, z: o.z0 }, { x: o.x1, z: o.z0 }, { x: o.x1, z: o.z1 }, { x: o.x0, z: o.z1 }],
    spawn, outline: o,
  };
}

// ---------- furniture ----------
const WOOD = 0x9b7447, DARK = 0x5a4632, STEEL = 0x8a949c, WHITE = 0xe9ecef, GREEN = 0x2f5d4a, SCREEN = 0x1d2630, TABLE = 0xb9a07a, STALL = 0x7d8f9c;

function furnish(room, box) {
  const b = room.bounds;
  const d = b.z1 - b.z0;
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  const doorAt = room.door?.at ?? cx;
  const clear = 0.95; // half-width of the free aisle in front of the door
  const farZ = room.door?.side === 'n' ? b.z1 : b.z0; // the wall opposite the door
  const toward = farZ === b.z0 ? 1 : -1; // from the far wall into the room
  switch (room.type) {
    case 'classroom': {
      // board on the west wall, a teacher's table, and benches in two groups with an aisle in front of the door
      box(b.x0 + 0.25, cz, 0.08, Math.min(4.2, d - 1), 1.2, GREEN, 1.0, false);
      box(b.x0 + 1.1, cz + d / 2 - 1.5, 0.7, 1.2, 0.76, DARK);
      for (const col of [b.x0 + 1.9, b.x0 + 3.0, b.x0 + 6.0, b.x0 + 7.1]) {
        if (col > b.x1 - 0.7 || Math.abs(col - doorAt) < clear + 0.25) continue;
        for (const zz of [cz - 2.0, cz, cz + 2.0]) {
          if (zz < b.z0 + 0.8 || zz > b.z1 - 0.8) continue;
          box(col, zz, 0.5, 1.7, 0.75, WOOD);
        }
      }
      break;
    }
    case 'lab': {
      for (const zz of [cz - 1.5, cz + 1.5]) {
        for (const [x0, x1] of [[b.x0 + 0.9, doorAt - clear], [doorAt + clear, b.x1 - 0.9]]) {
          if (x1 - x0 < 1.5) continue;
          const len = x1 - x0;
          box((x0 + x1) / 2, zz, len, 0.9, 0.85, TABLE);
          for (let i = 0; i < Math.floor(len / 1.2); i++) box(x0 + 0.6 + i * 1.2, zz, 0.45, 0.4, 0.4, SCREEN, 0.85, false);
        }
      }
      break;
    }
    case 'office': {
      box(cx - 2.3, b.z0 + 1.2, 1.6, 0.8, 0.76, DARK);
      box(cx + 2.3, b.z1 - 1.2, 1.6, 0.8, 0.76, DARK);
      box(b.x1 - 0.5, cz, 0.5, 2.4, 1.8, STEEL); // cabinet
      break;
    }
    case 'seminar': {
      box(b.x0 + 0.25, cz, 0.08, 4, 1.2, WHITE, 1.0, false);
      for (const x of [b.x0 + 1.8, b.x0 + 2.9, b.x0 + 6.0, b.x0 + 7.1]) {
        if (Math.abs(x - doorAt) < clear + 0.25) continue;
        for (const zz of [cz - 2.2, cz - 1.3, cz + 1.3, cz + 2.2]) {
          if (zz < b.z0 + 0.7 || zz > b.z1 - 0.7) continue;
          box(x, zz, 0.5, 0.5, 0.45, WOOD);
        }
      }
      break;
    }
    case 'washroom': {
      // cubicles along the far wall, wash basins along a side wall; the aisle in front of the door stays clear
      for (const x of [b.x0 + 1.0, b.x0 + 2.3, b.x1 - 2.3, b.x1 - 1.0]) {
        if (Math.abs(x - doorAt) < clear + 0.6) continue;
        box(x, farZ + toward * 0.8, 1.2, 1.4, 1.9, STALL, 0, true, 'partition');
      }
      box(b.x1 - 0.4, cz, 0.5, 2.0, 0.9, WHITE);
      break;
    }
    case 'store':
    case 'library': {
      const rows = room.type === 'library' ? 3 : 2;
      for (let i = 0; i < rows; i++) {
        const zz = farZ + toward * (1.0 + i * 1.7);
        if (zz < b.z0 + 0.6 || zz > b.z1 - 0.6) break;
        const a0 = b.x0 + 0.9, a1 = doorAt - clear;
        if (a1 - a0 > 1) box((a0 + a1) / 2, zz, a1 - a0, 0.5, 1.9, STEEL);
        const c0 = doorAt + clear, c1 = b.x1 - 0.9;
        if (c1 - c0 > 1) box((c0 + c1) / 2, zz, c1 - c0, 0.5, 1.9, STEEL);
      }
      break;
    }
    default:
      break;
  }
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
  classroom: 'Classroom', lab: 'Laboratory', office: 'Office', seminar: 'Seminar hall', library: 'Library', washroom: 'Washroom', store: 'Store', other: 'Room',
};
export { TYPE_ROOMS };
