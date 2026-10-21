#!/usr/bin/env node
// Writes the SAMPLE interior of block 1 (Dr. A.P.J. Abdul Kalam Block) into src/data/campus.json.
//
//   node scripts/generate-sample-interior.mjs
//
// What is based on the photos supplied for block 1 (assets/inside of APJ Block, assets/class rooms,
// assets/the floors and steps of all block): a ring of wings round a tree courtyard, an open verandah on the courtyard side
// of every wing with a parapet, columns and polished granite, rooms behind it, an entrance hall with marble floor,
// stairs and a lift in the corners, classrooms with green flooring, a dais, white boards and a wall panel.
//
// What is NOT known and therefore a placeholder: which room is where, room numbers and names, capacities, departments,
// faculty and timetables. Every floor carries "sample": true so the app says so on the room card. When the college
// provides the real floor plans, replace `floorPlans` in campus.json with real data (docs/interiors.md) and delete this script.
import fs from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = resolve(root, 'src/data/campus.json');
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const block = data.buildings.find((b) => b.id === 'apj-block');
if (!block) throw new Error('apj-block not found');

// ---- geometry (metres, floor frame: x east, z south), the ring is the footprint 92 x 113 m of block 1 ----
const O = { x0: -46, z0: -56.5, x1: 46, z1: 56.5 };
const WALL_IN = 0.2; // the outer walls are 0.2 m thick, inside the outline
const RD = 9.0; // depth of the room row
const VD = 3.2; // verandah
const C = { x0: O.x0 + RD + VD, z0: O.z0 + RD + VD, x1: O.x1 - RD - VD, z1: O.z1 - RD - VD }; // courtyard
const ROOM_X0 = O.x0 + RD, ROOM_X1 = O.x1 - RD; // north and south rows run between the corner lobbies
const ROOM_Z0 = C.z0, ROOM_Z1 = C.z1; // east and west rows run along the courtyard
const r2 = (v) => Math.round(v * 100) / 100;

const TYPES = ['classroom', 'classroom', 'lab', 'classroom', 'classroom', 'office', 'classroom', 'classroom', 'seminar', 'classroom', 'washroom', 'store'];
const NAME = { classroom: 'Sample classroom', lab: 'Sample laboratory', seminar: 'Sample seminar hall', office: 'Sample office', washroom: 'Sample washroom', store: 'Sample store', lobby: 'Sample entrance hall' };
const CAP = { classroom: 60, lab: 30, seminar: 40, office: null, washroom: null, store: null, lobby: null };
const EQUIP = { classroom: ['Whiteboards', 'Wall display panel'], lab: ['Workstations (sample)'], seminar: ['Wall display panel'], office: ['Desks (sample)'], washroom: [], store: [], lobby: ['Benches', 'Honour boards'] };
const SLOTS = [['09:00', '10:00'], ['10:00', '11:00'], ['11:15', '12:15'], ['13:15', '14:15'], ['14:15', '15:15']];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const LETTER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function timetable(index) {
  if (index % 3 !== 0) return [];
  return DAYS.map((day, d) => {
    const slot = SLOTS[(index + d) % SLOTS.length];
    return { day, start: slot[0], end: slot[1], title: `Sample session ${LETTER[(index + d) % 8]}` };
  });
}

function buildFloor(level) {
  const prefix = level === 0 ? 'G' : String(level);
  const rooms = [];
  let counter = 0;
  const add = (type, bounds, side, frontLow) => {
    counter++;
    const number = `${prefix}-${String(counter).padStart(2, '0')}`;
    const teach = type === 'classroom' || type === 'lab' || type === 'seminar';
    const lo = side === 'n' || side === 's' ? bounds.x0 : bounds.z0;
    const hi = side === 'n' || side === 's' ? bounds.x1 : bounds.z1;
    const at = r2(frontLow ? lo + 1.7 : hi - 1.7);
    rooms.push({
      id: `room-${number.toLowerCase()}`,
      number,
      name: `${NAME[type]} ${type === 'lab' ? counter : LETTER[(counter - 1) % 26]}`,
      type,
      capacity: CAP[type],
      department: teach || type === 'office' ? 'Sample department (placeholder)' : null,
      faculty: teach ? 'Sample faculty (placeholder)' : type === 'office' ? 'Sample staff (placeholder)' : null,
      equipment: EQUIP[type],
      timetable: teach ? timetable(counter) : [],
      bounds: Object.fromEntries(Object.entries(bounds).map(([k, v]) => [k, r2(v)])),
      door: { side, at },
    });
  };
  const typeAt = (i) => TYPES[(i + level * 3) % TYPES.length];
  let n = 0;
  const sw = (ROOM_X1 - ROOM_X0) / 8; // eight bays along the north and south wings

  // the entrance hall (ground floor): the middle two bays of the north wing, behind the entrance porch and the glass entrance
  // in the middle of the north face (the side facing the play ground); it opens wide onto the verandah and the courtyard
  if (level === 0) {
    counter++;
    const number = `${prefix}-${String(counter).padStart(2, '0')}`;
    const hx0 = ROOM_X0 + 3 * sw, hx1 = ROOM_X0 + 5 * sw;
    rooms.push({
      id: `room-${number.toLowerCase()}`, number, name: NAME.lobby, type: 'lobby', capacity: null, department: null, faculty: null,
      equipment: EQUIP.lobby, timetable: [],
      bounds: { x0: r2(hx0), z0: O.z0, x1: r2(hx1), z1: r2(O.z0 + RD) },
      door: { side: 's', at: r2((hx0 + hx1) / 2), w: 6, h: 2.7, open: true },
    });
  }

  // east wing, north to south
  const ew = (ROOM_Z1 - ROOM_Z0) / 10;
  for (let i = 0; i < 10; i++) add(typeAt(n++), { x0: ROOM_X1, z0: ROOM_Z0 + i * ew, x1: O.x1, z1: ROOM_Z0 + (i + 1) * ew }, 'w', i % 2 === 0);

  // south wing, east to west
  for (let i = 0; i < 8; i++) add(typeAt(n++), { x0: ROOM_X1 - (i + 1) * sw, z0: O.z1 - RD, x1: ROOM_X1 - i * sw, z1: O.z1 }, 'n', i % 2 === 1);

  // west wing, south to north
  const ww = (ROOM_Z1 - ROOM_Z0) / 10;
  for (let i = 0; i < 10; i++) add(typeAt(n++), { x0: O.x0, z0: ROOM_Z1 - (i + 1) * ww, x1: O.x0 + RD, z1: ROOM_Z1 - i * ww }, 'e', i % 2 === 1);

  // north wing, west to east (the ground floor leaves the two middle bays to the entrance hall)
  for (let i = 0; i < 8; i++) {
    if (level === 0 && (i === 3 || i === 4)) continue;
    add(typeAt(n++), { x0: ROOM_X0 + i * sw, z0: O.z0, x1: ROOM_X0 + (i + 1) * sw, z1: O.z0 + RD }, 's', i % 2 === 0);
  }

  // a stair well in every corner (two flights side by side and a landing, walled in against the outer walls; the viewer climbs them),
  // and a lift in the north-east corner (a closed steel door; it only stands there, as in the photos)
  const WELL_W = 3.4, WELL_L = 4.6, IN = WALL_IN; // the well: across the two flights, along them; IN = inner face of the outer walls
  const stairs = [
    { id: 'stairs-ne', label: 'Stairs', foot: 'w', bounds: { x0: O.x1 - IN - WELL_L, z0: O.z0 + IN, x1: O.x1 - IN, z1: O.z0 + IN + WELL_W } },
    { id: 'stairs-nw', label: 'Stairs', foot: 'e', bounds: { x0: O.x0 + IN, z0: O.z0 + IN, x1: O.x0 + IN + WELL_L, z1: O.z0 + IN + WELL_W } },
    { id: 'stairs-se', label: 'Stairs', foot: 'w', bounds: { x0: O.x1 - IN - WELL_L, z0: O.z1 - IN - WELL_W, x1: O.x1 - IN, z1: O.z1 - IN } },
    { id: 'stairs-sw', label: 'Stairs', foot: 'e', bounds: { x0: O.x0 + IN, z0: O.z1 - IN - WELL_W, x1: O.x0 + IN + WELL_L, z1: O.z1 - IN } },
  ].map((s) => ({ ...s, bounds: Object.fromEntries(Object.entries(s.bounds).map(([k, v]) => [k, r2(v)])) }));
  const liftZ0 = O.z0 + IN + WELL_W + 0.8;
  const lifts = [{ id: 'lift-ne', label: 'Lift', facing: 'w', bounds: { x0: r2(O.x1 - IN - 2.2), z0: r2(liftZ0), x1: r2(O.x1 - IN), z1: r2(liftZ0 + 2.2) }, landing: { x: r2(O.x1 - IN - 2.2 - 1.9), z: r2(liftZ0 + 1.1) } }];

  const floor = {
    level,
    label: level === 0 ? 'Ground floor' : `Floor ${level}`,
    short: level === 0 ? 'G' : String(level),
    sample: true,
    height: 3.6,
    corridorFloor: level === 3 ? 'concrete' : 'granite',
    verandahDepth: VD,
    groundCanopy: 3, // the ground floor walkway has a roofed extension (steel columns, ribbed roof) towards the courtyard
    outline: { ...O },
    court: { ...C },
    rooms,
    stairs,
    lifts,
  };
  // the entrance is in the middle of the north face, under the porch seen in the satellite crop of block 1 (the user asked for it on that side)
  if (level === 0) floor.entrance = { x: 0, z: O.z0, facing: 'north', width: 4.8, height: 2.6, label: 'Main entrance' };
  return floor;
}

block.floorPlans = [0, 1, 2, 3].map(buildFloor);
// the outside follows the plan: wings as thick as the plan's (rooms + verandah, the courtyard of the satellite image), four storeys,
// and the entrance opening of the porch as wide and high as the one in the plan
block.ring = { ...(block.ring ?? {}), thickness: RD + VD };
block.heightM = block.floorPlans.length * 3.6;
if (block.porch) block.porch = { ...block.porch, doorW: 4.8, doorH: 2.6 };
block.interiorNote = 'SAMPLE interior. The ring shape, verandahs, courtyard, entrance hall, corridors, stairs, lift and classroom furnishing follow the photos supplied for this block; which room is where, the room numbers and names, capacities, faculty and timetables are placeholders. Only the four-floor count is confirmed.';
fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
console.log('floors', block.floorPlans.length, 'rooms per floor', block.floorPlans.map((f) => f.rooms.length).join('/'));
