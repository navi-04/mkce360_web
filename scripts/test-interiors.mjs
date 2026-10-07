#!/usr/bin/env node
// Unit checks for the interior floor plans in campus.json: walls, doors, walkability and the "now in session" logic.
//   npm run test:interiors
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(resolve(root, 'src/data/campus.json'), 'utf8'));
const { buildPlan, sessionNow, floorShortLabel, WALL_T } = await import(pathToFileURL(resolve(root, 'src/interiors/plan.js')).href);
const { Collider } = await import(pathToFileURL(resolve(root, 'src/modes/collision.js')).href);

let passed = 0;
const failed = [];
const check = (name, ok, detail = '') => {
  if (ok) { passed++; console.log(`  ok    ${name}${detail ? '  (' + detail + ')' : ''}`); }
  else { failed.push(name); console.log(`  FAIL  ${name}${detail ? '  (' + detail + ')' : ''}`); }
};

const withPlans = data.buildings.filter((b) => b.floorPlans?.length);
check('exactly one building has floor plans (sample data for one building only)', withPlans.length === 1, withPlans.map((b) => b.id).join(','));
const b = withPlans[0];
check('the floor count matches the confirmed number of floors', b.floorPlans.length === b.floors, `${b.floorPlans.length} vs ${b.floors}`);
check('every floor is flagged as sample data', b.floorPlans.every((f) => f.sample === true));
check('floor labels are G, 1, 2, 3', b.floorPlans.map(floorShortLabel).join(',') === 'G,1,2,3');

const R = 0.35;
for (const floor of b.floorPlans) {
  console.log(`Floor ${floor.level}`);
  const plan = buildPlan(floor);
  const col = new Collider(plan.colliders, plan.boundary);
  const blocked = (x, z) => { const p = { x, z }; return col.resolve(p, R); };

  check('walls and furniture produce colliders', plan.colliders.length > 20, `${plan.colliders.length} colliders, ${plan.slabs.length} wall slabs`);
  check('every room has a door and a sign', plan.doors.length === floor.rooms.length && plan.signs.length === floor.rooms.length);
  const wallAt = (x, z) => plan.slabs.some((s) => s.solid && x > s.x0 + 1e-6 && x < s.x1 - 1e-6 && z > s.z0 + 1e-6 && z < s.z1 - 1e-6);
  check('door openings are free of wall', plan.doors.every((d) => !wallAt(d.x, d.z)));
  check('the wall beside each door is solid', plan.doors.every((d) => {
    const tx = d.nz !== 0 ? 1 : 0, tz = d.nx !== 0 ? 1 : 0; // along the wall
    return wallAt(d.x + tx * 0.9, d.z + tz * 0.9) || wallAt(d.x - tx * 0.9, d.z - tz * 0.9);
  }));
  check('wall thickness is the standard 0.2 m', Math.abs(WALL_T - 0.2) < 1e-9);

  // flood fill on a 0.2 m grid from the spawn point
  const o = plan.outline, step = 0.2;
  const nx = Math.ceil((o.x1 - o.x0) / step), nz = Math.ceil((o.z1 - o.z0) / step);
  const idx = (ix, iz) => iz * nx + ix;
  const seen = new Uint8Array(nx * nz);
  const cell = (ix, iz) => ({ x: o.x0 + (ix + 0.5) * step, z: o.z0 + (iz + 0.5) * step });
  const toCell = (x, z) => [Math.floor((x - o.x0) / step), Math.floor((z - o.z0) / step)];
  const [sx, sz] = toCell(plan.spawn.x, plan.spawn.z);
  check('the spawn point is free', !blocked(plan.spawn.x, plan.spawn.z), `${plan.spawn.x.toFixed(1)}, ${plan.spawn.z.toFixed(1)}`);
  const queue = [[sx, sz]];
  seen[idx(sx, sz)] = 1;
  while (queue.length) {
    const [ix, iz] = queue.pop();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const jx = ix + dx, jz = iz + dz;
      if (jx < 0 || jz < 0 || jx >= nx || jz >= nz || seen[idx(jx, jz)]) continue;
      const c = cell(jx, jz);
      if (blocked(c.x, c.z)) continue;
      seen[idx(jx, jz)] = 1;
      queue.push([jx, jz]);
    }
  }
  const reach = (x, z) => { const [ix, iz] = toCell(x, z); return ix >= 0 && iz >= 0 && ix < nx && iz < nz && seen[idx(ix, iz)] === 1; };
  check('every room can be reached from the spawn', plan.doors.every((d) => reach(d.x - d.nx * 1.2, d.z - d.nz * 1.2) && reach(d.x + d.nx * 1.0, d.z + d.nz * 1.0)),
    plan.doors.filter((d) => !(reach(d.x - d.nx * 1.2, d.z - d.nz * 1.2) && reach(d.x + d.nx * 1.0, d.z + d.nz * 1.0))).map((d) => d.roomId).join(','));
  check('stairs and lift landings can be reached', plan.stairs.every((s) => reach(s.landing.x, s.landing.z)) && plan.lifts.every((l) => reach(l.landing.x, l.landing.z)));
  if (floor.level === 0) check('the entrance door can be reached', reach(plan.entrance.x - 1.5, plan.entrance.z));
  let free = 0;
  for (let i = 0; i < seen.length; i++) free += seen[i];
  check('a good share of the floor is walkable', free * step * step > 120, `${(free * step * step).toFixed(0)} m2`);
}

console.log('Timetable');
const room = b.floorPlans[0].rooms.find((r) => r.timetable.length);
const mon10 = new Date(2026, 9, 5, 10, 30); // Monday 5 Oct 2026 10:30
const s1 = sessionNow(room, mon10);
check('"Now in session" finds the running slot on a weekday', s1.day === 'Mon' && (s1.current === null || (s1.current.start <= '10:30' && s1.current.end > '10:30')));
const sun = sessionNow(room, new Date(2026, 9, 4, 11, 0)); // Sunday
check('nothing is in session on Sunday', sun.current === null && sun.next === null);
const night = sessionNow(room, new Date(2026, 9, 5, 20, 0));
check('nothing is in session after the last slot', night.current === null && night.next === null);
const early = sessionNow(room, new Date(2026, 9, 5, 7, 0));
check('before the first slot the next one is reported', early.current === null && early.next !== null);
let anyIn = false;
for (const r of b.floorPlans.flatMap((f) => f.rooms)) for (let h = 9; h < 16 && !anyIn; h++) if (sessionNow(r, new Date(2026, 9, 5, h, 5)).current) anyIn = true;
check('some sample room is in session during the working day (so the feature can be seen)', anyIn);

console.log(`\n${passed} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
