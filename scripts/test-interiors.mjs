#!/usr/bin/env node
// Unit checks for the interior floor plans in campus.json: walls, doors, walkability, the courtyard arcade, the stair wells, a viewer
// that walks in through the entrance and up to the top floor, and the "now in session" logic.
//   npm run test:interiors
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(resolve(root, 'src/data/campus.json'), 'utf8'));
const { buildPlan, sessionNow, floorShortLabel, WALL_T, PLINTH } = await import(pathToFileURL(resolve(root, 'src/interiors/plan.js')).href);
const { BuildingPhysics, WorldGround, porchHeight } = await import(pathToFileURL(resolve(root, 'src/interiors/ground.js')).href);
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
check('the building is a ring with a courtyard on every floor', b.floorPlans.every((f) => f.court));
check('the outside follows the plan: wings as thick as the plan\'s, four storeys of 3.6 m', Math.abs(b.ring.thickness - (b.floorPlans[0].court.x0 - b.floorPlans[0].outline.x0)) < 0.05 && Math.abs(b.heightM - 4 * 3.6) < 0.05, `${b.ring.thickness} m thick, ${b.heightM} m high`);

const levels = b.floorPlans.length;
const R = 0.35;
const plans = b.floorPlans.map((f) => buildPlan(f, { levels }));
for (const floor of b.floorPlans) {
  console.log(`Floor ${floor.level}`);
  const plan = plans[floor.level];
  const hasUp = floor.level < levels - 1, hasDown = floor.level > 0;
  const col = new Collider(plan.colliders, plan.boundary);
  const blocked = (x, z) => col.resolve({ x, z }, R);

  check('walls and furniture produce colliders', plan.colliders.length > 100, `${plan.colliders.length} colliders, ${plan.walls.length} wall boxes`);
  check('every room has a door and a sign', plan.doors.filter((d) => d.main).length === floor.rooms.length && plan.signs.length === floor.rooms.length);
  const wallAt = (x, z) => plan.walls.some((s) => s.solid && x > s.x0 + 1e-6 && x < s.x1 - 1e-6 && z > s.z0 + 1e-6 && z < s.z1 - 1e-6);
  check('door openings are free of wall', plan.doors.every((d) => !wallAt(d.x - d.nx * WALL_T / 2, d.z - d.nz * WALL_T / 2)));
  check('the wall beside each door is solid', plan.doors.filter((d) => !d.open).every((d) => {
    const tx = d.nz !== 0 ? 1 : 0, tz = d.nx !== 0 ? 1 : 0; // along the wall
    const k = d.width / 2 + 0.3;
    return wallAt(d.x - d.nx * WALL_T / 2 + tx * k, d.z - d.nz * WALL_T / 2 + tz * k) || wallAt(d.x - d.nx * WALL_T / 2 - tx * k, d.z - d.nz * WALL_T / 2 - tz * k);
  }));
  check('wall thickness is the standard 0.2 m', Math.abs(WALL_T - 0.2) < 1e-9);
  if (floor.level === 0) {
    check('ground floor: the verandah opens onto a roofed walkway with a granite curb, posts, steel columns and steps (no parapet)', plan.walkway && plan.parapets.length === 0 && plan.garden.canopy.coping.length >= 12 && plan.garden.canopy.columns.length > 40 && plan.garden.canopy.steps.length === 8 && plan.garden.canopy.roof.length === 4);
  } else {
    check('the courtyard edge is an open arcade: four parapets and columns, no wall', plan.parapets.length === 4 && plan.columns.length > 20 && !wallAt(plan.court.x0 + 0.5, 0));
  }
  check('the courtyard has trees, shrubs and paths, none on a path', plan.garden.trees.length > 30 && plan.garden.shrubs.length > 8 && plan.garden.paths.length >= 2 && [...plan.garden.trees, ...plan.garden.shrubs].every((t) => !plan.garden.paths.some((p) => t.x > p.x0 && t.x < p.x1 && t.z > p.z0 && t.z < p.z1)));
  check('the ground drops 0.45 m from the walkway down the steps to the lawn (and is level elsewhere)', floor.level === 0 ? Math.abs(plan.groundAt(0, 0) + 0.45) < 1e-6 && plan.groundAt(plan.yard.x1 + 1, 0) === 0 && plan.groundAt(plan.yard.x1 - 0.45, 0) < -0.2 && plan.groundAt(plan.yard.x1 - 0.45, 0) > -0.3 : plan.groundAt(0, 0) === 0);
  check('every room has furniture or is a plain room, furniture stays inside its room', floor.rooms.every((r) => (plan.furniture[r.id]?.boxes ?? []).every((f) => f.x > r.bounds.x0 && f.x < r.bounds.x1 && f.z > r.bounds.z0 && f.z < r.bounds.z1)));

  // ----- the stair wells: four of them, stacked, with holes in the slabs for the flights -----
  check('a stair well in every corner, each with two flights (when the floor has one above), walls, a landing and a sign spot', plan.stairs.length === 4 && plan.stairs.every((s) => s.walls.length >= 2 && (hasUp ? s.ramps.length === 2 && s.platforms.length === 1 && s.boxes.length > 30 : s.ramps.length === 0)));
  const inRect = (r, x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
  const laneN = (s) => s.holeBelow[0]; // the wall-side lane: the upper flight arrives here from below
  check('the floor has holes where flights arrive from below (not on the ground floor), the ceiling where they go up', plan.stairs.every((s) => {
    const c = { x: (laneN(s).x0 + laneN(s).x1) / 2, z: (laneN(s).z0 + laneN(s).z1) / 2 };
    const inFloor = plan.floors.some((f) => f.kind && inRect(f, c.x, c.z) && f.y === 0), inCeil = plan.ceilings.some((q) => inRect(q, c.x, c.z));
    return (hasDown ? !inFloor : inFloor) && (hasUp ? !inCeil : inCeil);
  }));
  check('the heights of the flights stack: the lower flight climbs half a storey to the landing, the upper one the other half to the next floor', plan.stairs.every((s) => {
    if (!hasUp) return true;
    const [a, u] = s.ramps;
    return a.y0 === 0 && Math.abs(a.y1 - plan.height / 2) < 1e-9 && Math.abs(u.y0 - plan.height) < 1e-9 && Math.abs(u.y1 - plan.height / 2) < 1e-9 && Math.abs(s.platforms[0].y - plan.height / 2) < 1e-9;
  }));
  // the lane of the upper flight is closed at its foot on the ground floor (nothing arrives from below), the other lane on the top floor
  const centre = (r) => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 });
  const into = (s, r, d) => ({ x: centre(r).x + s.u.x * d, z: centre(r).z + s.u.z * d }); // d metres from the mouth rect into the well
  check('the lane of the upper flight is closed at its foot on the ground floor and open above; the lane of the lower flight is closed on the top floor and open below', plan.stairs.every((s) => {
    const a = into(s, s.mouths.upper, 0.45), c = into(s, s.mouths.lower, 0.45); // on the mouth wall, if there is one
    const upperClosed = blocked(a.x, a.z), lowerClosed = blocked(c.x, c.z);
    return upperClosed === !hasDown && lowerClosed === !hasUp;
  }));

  // flood fill on a grid from the spawn point
  const o = plan.outline, step = 0.3;
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
  const bad = plan.doors.filter((d) => d.main && !(reach(d.x - d.nx * 1.2, d.z - d.nz * 1.2) && reach(d.x + d.nx * 1.0, d.z + d.nz * 1.0)));
  check('every room can be reached from the spawn', bad.length === 0, bad.map((d) => d.roomId).join(','));
  check('the foot of every stair well can be reached (the whole ring is connected)', plan.stairs.every((s) => reach(s.landing.x, s.landing.z)));
  const yardCentre = reach((plan.court.x0 + plan.court.x1) / 2 + 3.7, (plan.court.z0 + plan.court.z1) / 2 + 3.7); // beside the crossing of the paths
  if (floor.level === 0) {
    check('ground floor: the whole yard can be reached down the steps (lawn and paths), and nobody can leave the building', yardCentre && reach(plan.yard.x1 - 3, 0) && reach(0, plan.yard.z0 + 3) && blocked(o.x1 + 1, 0));
    check('trees and curbs block the way: a trunk and the curb are not walkable', plan.garden.trees.every((t) => blocked(t.x, t.z)) && blocked(plan.yard.x1 + 0.1, plan.yard.z0 + 6));
  } else {
    check('upper floors: nobody can step into the courtyard or leave the building', !yardCentre && blocked(o.x1 + 1, 0));
  }
  if (floor.level === 0) {
    const e = plan.entrance, hall = floor.rooms.find((r) => r.type === 'lobby');
    check('the entrance door can be reached (from inside, one step before the door)', reach(e.x - e.nx * 1.5, e.z - e.nz * 1.5));
    check('the entrance is in the middle of the north wall and opens into the entrance hall', e.facing === 'north' && Math.abs(e.x) < 0.5 && Math.abs(e.z - o.z0) < 0.05 && hall && e.x > hall.bounds.x0 && e.x < hall.bounds.x1 && Math.abs(hall.bounds.z0 - o.z0) < 0.05, `${e.facing} at ${e.x}, ${e.z}`);
    check('the entrance is an open doorway in the wall, 4.8 m wide and 2.6 m high, the walls beside it are solid', !wallAt(e.x, e.z + 0.1) && !wallAt(e.x + e.width / 2 - 0.1, e.z + 0.1) && wallAt(e.x + e.width / 2 + 0.6, e.z + 0.1) && wallAt(e.x - e.width / 2 - 0.6, e.z + 0.1) && e.width === 4.8 && e.height === 2.6);
    check('the entrance hall opens wide onto the verandah (an opening, not a door) and a sign hangs above it', plan.doors.some((d) => d.roomId === hall.id && d.open && d.width >= 5) && plan.signs.find((s) => s.roomId === hall.id).y > 2.8);
    check('the spawn is inside the hall, 2.6 m in from the entrance, facing south into the building', Math.abs(plan.spawn.z - (e.z + 2.6)) < 0.01 && Math.abs(plan.spawn.yaw - Math.PI) < 1e-9 && plan.spawn.x === 0);
  }
  let free = 0;
  for (let i = 0; i < seen.length; i++) free += seen[i];
  check('a good share of the floor is walkable', free * step * step > 1500, `${(free * step * step).toFixed(0)} m2`);
}

// ----- one viewer, in the world: in through the open doorway and up to the top floor and down again -----
console.log('A viewer in the world');
{
  const phys = new BuildingPhysics(b);
  const d = b.doorPosition, rr = (b.rotationDeg * Math.PI) / 180;
  const frame = { id: b.id, x: d.x, z: d.z, nx: Math.sin(rr), nz: -Math.cos(rr), reach: b.porch.d, half: b.porch.w / 2 };
  const ground = new WorldGround({ buildings: [phys], doorFrames: [frame], outdoor: [], boundary: data.boundary.points });
  const W = (lx, lz) => phys.toWorld(lx, lz);
  const walk = (start, y0, path) => {
    const pos = { ...start };
    let gy = y0, level = 0, maxStep = 0;
    const dt = 1 / 60, speed = 1.4;
    for (const w of path) {
      for (let i = 0; i < 6000; i++) {
        const dx = w.x - pos.x, dz = w.z - pos.z, dist = Math.hypot(dx, dz);
        if (dist < 0.25) break;
        const sp = Math.min(speed, dist / dt);
        pos.x += (dx / dist) * sp * dt;
        pos.z += (dz / dist) * sp * dt;
        ground.colliderFor(pos.x, pos.z, gy).resolve(pos, R);
        const tgt = ground.heightAt(pos.x, pos.z, gy);
        maxStep = Math.max(maxStep, Math.abs(tgt - gy));
        gy += (tgt - gy) * Math.min(1, 12 * dt);
        level = ground.levelAt(pos.x, pos.z, gy);
        if (i === 5999) return { pos, gy, level, stuck: w };
      }
    }
    return { pos, gy, level, maxStep };
  };
  // outside: the porch steps lead up to the floor of the hall
  check('the porch steps lead up to the height of the ground floor', Math.abs(porchHeight([frame], d.x + frame.nx * (frame.reach + 0.5), d.z + frame.nz * (frame.reach + 0.5))) === 0 && Math.abs(porchHeight([frame], d.x + frame.nx * 2, d.z + frame.nz * 2) - PLINTH) < 1e-9 && porchHeight([frame], d.x + frame.nx * (frame.reach - 0.45), d.z + frame.nz * (frame.reach - 0.45)) > 0.2);
  const start = W(0, -66);
  const inHall = walk(start, 0, [W(0, -62), W(0, -52)]);
  check('walking south from the forecourt, through the open doorway, you are in the entrance hall on the ground floor, on the floor level', !inHall.stuck && inHall.level === 0 && Math.abs(inHall.gy - PLINTH) < 0.02 && phys.inside(inHall.pos.x, inHall.pos.z), `y ${inHall.gy.toFixed(2)}, ${phys.depth(inHall.pos.x, inHall.pos.z).toFixed(1)} m inside`);
  // every stair, from the ground floor to the top floor and back down
  const plan0 = plans[0];
  for (const s of plan0.stairs) {
    const [low, up] = s.ramps;
    const along = (r, u) => W((r.rect.x0 + r.rect.x1) / 2 + r.ux * (u - r.len / 2), (r.rect.z0 + r.rect.z1) / 2 + r.uz * (u - r.len / 2)); // a point on the centre line of a flight, in the world

    const plat = s.platforms[0], pc = W((plat.x0 + plat.x1) / 2, (plat.z0 + plat.z1) / 2);
    const upPath = [along(low, -1.4), along(low, low.len * 0.5), along(low, low.len - 0.1), pc, along(up, up.len - 0.1), along(up, up.len * 0.5), along(up, -1.2)];
    // from the foot of the well to the top floor
    let state = { pos: along(low, -3), gy: PLINTH, level: 0 };
    let ok = true;
    for (let lv = 0; lv < levels - 1 && ok; lv++) {
      state = walk(state.pos, state.gy, upPath);
      ok = !state.stuck && state.level === lv + 1 && Math.abs(state.gy - (PLINTH + (lv + 1) * 3.6)) < 0.05;
    }
    check(`${s.id}: up the flights from the ground floor to the top floor, level by level`, ok && state.level === levels - 1, `level ${state.level}, y ${state.gy.toFixed(2)}`);
    // and back down: the same way in reverse
    const downPath = [along(up, -1.0), along(up, up.len * 0.5), along(up, up.len - 0.1), pc, along(low, low.len - 0.1), along(low, low.len * 0.5), along(low, -1.6)];
    let down = state;
    for (let lv = levels - 1; lv > 0 && ok; lv--) down = walk(down.pos, down.gy, downPath);
    check(`${s.id}: and back down to the ground floor`, !down.stuck && down.level === 0 && Math.abs(down.gy - PLINTH) < 0.05, `level ${down.level}, y ${down.gy.toFixed(2)}`);
  }
  // the wells keep people on the stairs: on the ground floor nobody walks in under the upper flight
  const s0 = plan0.stairs[0];
  const cc = (r) => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 });
  const mouth = cc(s0.mouths.upper);
  const under = walk(W(mouth.x, mouth.z), PLINTH, [W(mouth.x + s0.u.x * 2.2, mouth.z + s0.u.z * 2.2)]);
  check('on the ground floor nobody walks in under the upper flight (the foot of its lane is closed)', !!under.stuck, under.stuck ? 'stopped at the wall' : `got in to ${under.pos.x.toFixed(1)}, ${under.pos.z.toFixed(1)}`);
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
