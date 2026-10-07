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

  // east wing, north to south (the entrance hall first on the ground floor)
  let z = ROOM_Z0;
  if (level === 0) {
    const lobbyD = 14.3;
    counter++;
    const number = `${prefix}-${String(counter).padStart(2, '0')}`;
    rooms.push({
      id: `room-${number.toLowerCase()}`, number, name: NAME.lobby, type: 'lobby', capacity: null, department: null, faculty: null,
      equipment: EQUIP.lobby, timetable: [],
      bounds: { x0: ROOM_X1, z0: r2(z), x1: O.x1, z1: r2(z + lobbyD) },
      door: { side: 'w', at: r2(z + lobbyD / 2), w: 5, h: 2.7, open: true },
    });
    z += lobbyD;
  }
  const eastCount = level === 0 ? 8 : 10;
  const ew = (ROOM_Z1 - z) / eastCount;
  for (let i = 0; i < eastCount; i++) add(typeAt(n++), { x0: ROOM_X1, z0: z + i * ew, x1: O.x1, z1: z + (i + 1) * ew }, 'w', i % 2 === 0);

  // south wing, east to west
  const sw = (ROOM_X1 - ROOM_X0) / 8;
  for (let i = 0; i < 8; i++) add(typeAt(n++), { x0: ROOM_X1 - (i + 1) * sw, z0: O.z1 - RD, x1: ROOM_X1 - i * sw, z1: O.z1 }, 'n', i % 2 === 1);

  // west wing, south to north
  const ww = (ROOM_Z1 - ROOM_Z0) / 10;
  for (let i = 0; i < 10; i++) add(typeAt(n++), { x0: O.x0, z0: ROOM_Z1 - (i + 1) * ww, x1: O.x0 + RD, z1: ROOM_Z1 - i * ww }, 'e', i % 2 === 1);

  // north wing, west to east
  for (let i = 0; i < 8; i++) add(typeAt(n++), { x0: ROOM_X0 + i * sw, z0: O.z0, x1: ROOM_X0 + (i + 1) * sw, z1: O.z0 + RD }, 's', i % 2 === 0);

  // stairs in every corner, a lift in the north-east one; the corner lobbies are open to the verandah
  const flight = 4.6;
  const stairs = [
    { id: 'stairs-ne', label: 'Stairs', rise: 'n', arrive: 'w', bounds: { x0: O.x1 - 2.4, z0: O.z0 + RD - 0.2 - flight, x1: O.x1 - 0.2, z1: O.z0 + RD - 0.2 }, landing: { x: O.x1 - 1.3, z: O.z0 + RD + 1.5 } },
    { id: 'stairs-nw', label: 'Stairs', rise: 'n', arrive: 'e', bounds: { x0: O.x0 + 0.2, z0: O.z0 + RD - 0.2 - flight, x1: O.x0 + 2.4, z1: O.z0 + RD - 0.2 }, landing: { x: O.x0 + 1.3, z: O.z0 + RD + 1.5 } },
    { id: 'stairs-se', label: 'Stairs', rise: 's', arrive: 'w', bounds: { x0: O.x1 - 2.4, z0: O.z1 - RD + 0.2, x1: O.x1 - 0.2, z1: O.z1 - RD + 0.2 + flight }, landing: { x: O.x1 - 1.3, z: O.z1 - RD - 1.5 } },
    { id: 'stairs-sw', label: 'Stairs', rise: 's', arrive: 'e', bounds: { x0: O.x0 + 0.2, z0: O.z1 - RD + 0.2, x1: O.x0 + 2.4, z1: O.z1 - RD + 0.2 + flight }, landing: { x: O.x0 + 1.3, z: O.z1 - RD - 1.5 } },
  ].map((s) => ({ ...s, bounds: Object.fromEntries(Object.entries(s.bounds).map(([k, v]) => [k, r2(v)])), landing: { x: r2(s.landing.x), z: r2(s.landing.z) } }));
  const lifts = [{ id: 'lift-ne', label: 'Lift', facing: 's', arrive: 's', bounds: { x0: ROOM_X1 + 0.4, z0: O.z0 + 0.8, x1: ROOM_X1 + 2.6, z1: O.z0 + 3.0 }, landing: { x: r2(ROOM_X1 + 1.5), z: r2(O.z0 + 5.2) } }];

  const floor = {
    level,
    label: level === 0 ? 'Ground floor' : `Floor ${level}`,
    short: level === 0 ? 'G' : String(level),
    sample: true,
    height: 3.6,
    corridorFloor: level === 3 ? 'concrete' : 'granite',
    outline: { ...O },
    court: { ...C },
    rooms,
    stairs,
    lifts,
  };
  if (level === 0) floor.entrance = { x: O.x1, z: r2(ROOM_Z0 + 7.15), facing: 'east', label: 'Main entrance (exit)' };
  return floor;
}

block.floorPlans = [0, 1, 2, 3].map(buildFloor);
block.interiorNote = 'SAMPLE interior. The ring shape, verandahs, courtyard, entrance hall, corridors, stairs, lift and classroom furnishing follow the photos supplied for this block; which room is where, the room numbers and names, capacities, faculty and timetables are placeholders. Only the four-floor count is confirmed.';
fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
console.log('floors', block.floorPlans.length, 'rooms per floor', block.floorPlans.map((f) => f.rooms.length).join('/'));
