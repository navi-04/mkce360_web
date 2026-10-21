#!/usr/bin/env node
// Checks of the car: its physics, and that it can really be driven anywhere, in through the entrance of block 1, along the verandahs
// and out into the courtyard (a simple autopilot steers it along the way), without a browser:  npm run test:car
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(resolve(root, 'src/data/campus.json'), 'utf8'));
const { Car, CAR } = await import(pathToFileURL(resolve(root, 'src/modes/car.js')).href);
const { Collider } = await import(pathToFileURL(resolve(root, 'src/modes/collision.js')).href);
const { BuildingPhysics, WorldGround } = await import(pathToFileURL(resolve(root, 'src/interiors/ground.js')).href);

let passed = 0;
const failed = [];
const check = (name, ok, detail = '') => {
  if (ok) { passed++; console.log(`  ok    ${name}${detail ? '  (' + detail + ')' : ''}`); }
  else { failed.push(name); console.log(`  FAIL  ${name}${detail ? '  (' + detail + ')' : ''}`); }
};
const wrap = (a) => ((((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
const BIG = [{ x: -1e4, z: -1e4 }, { x: 1e4, z: -1e4 }, { x: 1e4, z: 1e4 }, { x: -1e4, z: 1e4 }];
const flat = { collider: new Collider([], BIG), heightAt: () => 0 };
const run = (car, seconds, input, env = flat, dt = 1 / 60) => { for (let t = 0; t < seconds; t += dt) car.step(dt, typeof input === 'function' ? input(t) : input, env); return car; };

console.log('Physics');
{
  const c = new Car();
  run(c, 5, { throttle: 1 });
  check('full throttle for 5 s reaches 60 to 80 km/h', c.speed > 16 && c.speed < 22, `${(c.speed * 3.6).toFixed(0)} km/h`);
  run(c, 60, { throttle: 1 });
  check('the top speed is about 85 km/h', c.speed > 21 && c.speed < 25, `${(c.speed * 3.6).toFixed(0)} km/h`);
  let stopT = 0;
  while (c.speed > 0.05 && stopT < 5) { c.step(1 / 60, { brake: 1 }, flat); stopT += 1 / 60; }
  check('braking from top speed stops the car within about a second and a half', stopT < 1.7, `${stopT.toFixed(2)} s`);
  run(c, 3, { brake: 1 });
  check('keeping the brake on backs the car up (to at most 6 m/s)', c.speed < -3 && c.speed >= -CAR.maxReverse - 1e-6, `${c.speed.toFixed(1)} m/s`);
  const c2 = new Car();
  run(c2, 2, { throttle: 1 });
  run(c2, 0.5, { throttle: 0 });
  check('coasting slows the car gently', c2.speed > 8 && c2.speed < 16);
  const c3 = new Car();
  run(c3, 3, { throttle: 0.6 });
  const y0 = c3.yaw;
  run(c3, 1.5, { throttle: 0.4, steer: 1 });
  check('steering left turns the car counter-clockwise (a positive yaw), and it keeps moving', c3.yaw > y0 + 0.3 && c3.speed > 4, `yaw ${(c3.yaw - y0).toFixed(2)} rad`);
  const c4 = new Car();
  run(c4, 3, { throttle: 0.5 });
  const y1 = c4.yaw;
  run(c4, 1.5, { throttle: 0.4, steer: -1 });
  check('steering right turns it clockwise', c4.yaw < y1 - 0.3);
  const c5 = new Car();
  c5.speed = 3;
  const start = { x: c5.x, z: c5.z };
  run(c5, 6, { throttle: 0.15, steer: 1 }, flat);
  check('at walking pace the car turns in a tight circle', Math.hypot(c5.x - start.x, c5.z - start.z) < 11);
  const cs = new Car();
  const before = { x: cs.x, z: cs.z };
  run(cs, 3, { steer: 1 });
  check('without gas the steering wheel does not move a car that stands still', Math.hypot(cs.x - before.x, cs.z - before.z) < 1e-9 && Math.abs(cs.yaw) < 1e-9);
  const wall = { collider: new Collider([{ id: 'wall', cx: 0, cz: -30, hw: 20, hd: 0.5, rot: 0 }], BIG), heightAt: () => 0 };
  const cw = new Car();
  let bumped = false;
  for (let t = 0; t < 6; t += 1 / 60) { const r = cw.step(1 / 60, { throttle: 1 }, wall); bumped ||= r.bumped; }
  check('a wall stops the car; it does not drive through it', bumped && cw.z > -30 + 0.5 + CAR.radius - 0.3 && cw.z < -20, `z ${cw.z.toFixed(2)}, ${(cw.speed * 3.6).toFixed(1)} km/h`);
  const slope = { collider: new Collider([], BIG), heightAt: (x, z) => Math.max(0, Math.min(2, (-z - 10) / 5)) };
  const cr = new Car();
  let maxPitch = 0;
  for (let t = 0; t < 4; t += 1 / 60) { cr.step(1 / 60, { throttle: 0.7 }, slope); maxPitch = Math.max(maxPitch, cr.pitch); }
  check('on a slope the car follows the ground and its nose goes up', cr.y > 0.5 && maxPitch > 0.1, `y ${cr.y.toFixed(2)}, pitch up to ${maxPitch.toFixed(2)} rad`);
  const cp = new Car();
  run(cp, 1.2, { throttle: 0.3, steer: 1 }, flat);
  check('with the gas on, a car that creeps swings round on the spot (to get round the corners of the verandahs)', cp.yaw > 0.8 && Math.hypot(cp.x, cp.z) < 2.5, `${((cp.yaw * 180) / Math.PI).toFixed(0)} deg, moved ${Math.hypot(cp.x, cp.z).toFixed(1)} m`);
}

console.log('Driving in block 1');
const b = data.buildings.find((x) => x.id === 'apj-block');
const phys = new BuildingPhysics(b);
const rr = (b.rotationDeg * Math.PI) / 180;
const rotY = -rr;
// the six columns of the porch (as in world/buildings.js) stand outside as obstacles
const door = { x: b.doorPosition.x + Math.sin(rr) * 0.06, z: b.doorPosition.z - Math.cos(rr) * 0.06 };
const n = { x: Math.sin(rr), z: -Math.cos(rr) };
const theta = Math.atan2(n.x, n.z), side = { x: Math.cos(theta), z: -Math.sin(theta) };
const columns = [-0.95, -0.57, -0.19, 0.19, 0.57, 0.95].map((f) => ({ id: b.id, cx: door.x + side.x * f * (b.porch.w / 2) + n.x * (b.porch.d - 0.5), cz: door.z + side.z * f * (b.porch.w / 2) + n.z * (b.porch.d - 0.5), hw: 0.3, hd: 0.3, rot: rotY }));
const frame = { id: b.id, x: door.x, z: door.z, nx: n.x, nz: n.z, reach: b.porch.d, half: b.porch.w / 2 };
const ground = new WorldGround({ buildings: [phys], doorFrames: [frame], outdoor: columns, boundary: data.boundary.points });
const W = (lx, lz) => phys.toWorld(lx, lz);

/** an autopilot: steer at the next waypoint (local building coordinates) and hold about `speed` m/s; returns the final state or where it got stuck */
function autopilot(car, points, { speed = 5, seconds = 120 } = {}) {
  const env = { get collider() { return ground.colliderFor(car.x, car.z, car.y); }, heightAt: (x, z, y) => ground.heightAt(x, z, y) };
  const log = [];
  let t = 0;
  for (const [i, p] of points.entries()) {
    const w = W(p[0], p[1]);
    let stuck = 0, best = Infinity;
    while (true) {
      const dx = w.x - car.x, dz = w.z - car.z, d = Math.hypot(dx, dz);
      if (d < 1.6) break;
      const err = wrap(Math.atan2(-dx, -dz) - car.yaw);
      const steer = Math.max(-1, Math.min(1, err * 2.2));
      const v = Math.max(1.2, speed * (1 - Math.min(0.6, Math.abs(err))));
      const input = { steer, throttle: car.speed < v ? 0.8 : 0, brake: car.speed > v + 1.5 ? 0.5 : 0 };
      car.step(1 / 60, input, env);
      t += 1 / 60;
      if (d < best - 0.01) { best = d; stuck = 0; } else stuck++;
      if (stuck > 180 || t > seconds) return { ok: false, at: i, point: p, car, local: phys.toLocal(car.x, car.z), t };
    }
    log.push(i);
  }
  return { ok: true, car, local: phys.toLocal(car.x, car.z), t };
}

{
  // from the forecourt through the porch and the entrance, the hall and its wide opening, along the verandah and out into the court
  const car = new Car();
  const s = W(0.4, -86);
  car.place(s.x, s.z, Math.atan2(-(W(0.4, -60).x - s.x), -(W(0.4, -60).z - s.z)), 0);
  const trip = autopilot(car, [[0.4, -66], [0.1, -57.5], [0, -50], [0, -45.6], [0, -41], [0, -36], [0, -20]], { speed: 4.5 });
  check('drive from the forecourt, between the columns of the porch, through the entrance, the hall, the verandah and the canopy, down the steps onto the lawn path', trip.ok, trip.ok ? `${trip.t.toFixed(0)} s, now at ${trip.local.x.toFixed(1)}, ${trip.local.z.toFixed(1)}` : `stuck before ${JSON.stringify(trip.point)} at ${trip.local.x.toFixed(1)}, ${trip.local.z.toFixed(1)}`);
  check('the car is in the courtyard, on the lawn level (the plinth is 0.45 m: the ground dropped back to 0)', phys.depth(car.x, car.z) > 12 && Math.abs(car.y) < 0.12, `depth ${phys.depth(car.x, car.z).toFixed(1)} m, y ${car.y.toFixed(2)}`);
}
{
  // round the whole ring on the ground floor: north verandah, east, south, west
  const car = new Car();
  const s = W(1.9, -45.9);
  car.place(s.x, s.z, Math.atan2(-(W(30, -45.9).x - s.x), -(W(30, -45.9).z - s.z)), 0.45);
  car.y = 0.45;
  const ring = autopilot(car, [[30, -45.9], [35.4, -45.9], [35.4, -35], [35.4, 40], [35.4, 45.9], [30, 45.9], [-30, 45.9], [-35.4, 45.9], [-35.4, 40], [-35.4, -40], [-35.4, -45.9], [-30, -45.9], [-10, -45.9]], { speed: 4.5, seconds: 400 });
  check('drive all the way round the ground floor verandahs (north, east, south, west, 330 m) and back to the hall, past the columns and round the corners', ring.ok, ring.ok ? `${ring.t.toFixed(0)} s` : `stuck before ${JSON.stringify(ring.point)} at ${ring.local.x.toFixed(1)}, ${ring.local.z.toFixed(1)}`);
}
{
  // the stairs are too narrow for the car: it stops at the foot
  const car = new Car();
  const s = W(37.5, -50);
  car.place(s.x, s.z, 0, 0.45);
  car.yaw = Math.atan2(-(W(43.6, -53.7).x - s.x), -(W(43.6, -53.7).z - s.z));
  const up = autopilot(car, [[39.0, -53.7], [43.6, -53.7]], { speed: 3, seconds: 25 });
  const l = phys.toLocal(car.x, car.z);
  check('the car cannot climb the stairs (the flights are narrower than the car)', !up.ok && l.x < 42 && car.y < 1.0, `stopped at ${l.x.toFixed(1)}, ${l.z.toFixed(1)}, y ${car.y.toFixed(2)}`);
}

console.log(`\n${passed} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
