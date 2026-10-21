// Arcade car physics: a bicycle model for the steering and three circles for the collisions. Pure code (no three.js, no DOM),
// so it runs in the Node tests as well as in the browser. Units are metres and seconds. `yaw` is the one of the walking viewer:
// the car moves along (-sin yaw, -cos yaw), so yaw 0 faces north and a positive yaw turns to the left (x east, z south).

export const CAR = {
  length: 3.9, width: 1.75, wheelbase: 2.45, track: 1.48, wheel: 0.33, // a small hatchback: the verandahs of the building are 3.2 m wide
  radius: 0.88, // the three collision circles (about the width of the car) ...
  circles: [1.0, 0, -1.0], // ... and where they sit along the car, from its middle
  maxSpeed: 25, maxReverse: 6, // m/s (90 km/h forward)
  accel: 8, brake: 20, reverseAccel: 4, engineBrake: 2.5, drag: 0.002,
  maxSteer: 0.72, steerRate: 3, steerFade: 11, // front wheel angle (rad), how fast it turns, how much less of it at speed
  pivot: 1.0, // rad/s: with the gas or the brake on, a car that creeps (under 2 m/s) also swings round on the spot, to get round corners
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Car {
  constructor() {
    this.place(0, 0, 0, 0);
  }

  /** put the car somewhere, standing still, on the ground at height y */
  place(x, z, yaw, y = 0) {
    this.x = x;
    this.z = z;
    this.y = y;
    this.yaw = yaw;
    this.speed = 0; // m/s along the heading, negative when reversing
    this.steer = 0; // front wheel angle (rad), positive to the left
    this.pitch = 0; // nose up
    this.roll = 0; // left side up
    this.wheelSpin = 0; // rad
    this.bump = 0; // 0..1, after hitting something
    this.slip = 0; // 0..1, sliding with the handbrake on
  }

  get fx() { return -Math.sin(this.yaw); }
  get fz() { return -Math.cos(this.yaw); }
  /** the unit vector to the left of the car */
  get lx() { return -Math.cos(this.yaw); }
  get lz() { return Math.sin(this.yaw); }

  /** the three circles that bump into walls, as [x, z] */
  circleCentres() {
    return CAR.circles.map((o) => [this.x + this.fx * o, this.z + this.fz * o]);
  }

  /**
   * One step. input = { throttle 0..1, brake 0..1, steer -1..1 (positive turns left), handbrake }.
   * env = { collider, colliders?, heightAt(x, z, yHint) }: the obstacles (a Collider, or a list of them in `colliders`) and the ground
   * under a spot.
   * Returns { bumped }.
   */
  step(dt, input, env) {
    const C = CAR;
    dt = Math.min(dt, 0.05);
    const th = clamp(input.throttle ?? 0, 0, 1), br = clamp(input.brake ?? 0, 0, 1), st = clamp(input.steer ?? 0, -1, 1), hb = !!input.handbrake;

    // speed: gas, brake (which backs the car up once it stands still), coasting, air drag, handbrake
    let v = this.speed;
    if (br > 0 && v > 0.4) v = Math.max(0, v - C.brake * br * dt);
    else if (br > 0) v = Math.max(-C.maxReverse, v - C.reverseAccel * br * (1 - Math.abs(v) / C.maxReverse) * dt);
    else if (th > 0 && v >= -0.3) v += C.accel * th * Math.max(0.04, 1 - (Math.max(0, v) / C.maxSpeed) ** 2) * dt;
    else if (th > 0) v = Math.min(0, v + C.brake * th * dt); // gas while backing up: brake first
    else {
      const k = C.engineBrake * dt;
      v = Math.abs(v) <= k ? 0 : v - Math.sign(v) * k;
    }
    v -= C.drag * v * Math.abs(v) * dt;
    if (hb) {
      const k = 16 * dt;
      v = Math.abs(v) <= k ? 0 : v - Math.sign(v) * k;
    }
    v = clamp(v, -C.maxReverse, C.maxSpeed);

    // steering: the front wheels turn towards the wanted angle (less of it at speed); the car turns about its rear axle
    const target = st * (C.maxSteer / (1 + Math.abs(v) / C.steerFade));
    const back = Math.abs(target) < Math.abs(this.steer) || Math.sign(target) !== Math.sign(this.steer);
    const rate = C.steerRate * (back ? 1.7 : 1) * dt;
    this.steer += clamp(target - this.steer, -rate, rate);
    this.yaw += (v / C.wheelbase) * Math.tan(this.steer) * (hb ? 1.4 : 1) * dt;
    if ((th > 0 || br > 0) && Math.abs(v) < 2) this.yaw += st * C.pivot * (1 - Math.abs(v) / 2) * dt;
    this.slip += ((hb ? Math.min(1, Math.abs(v) / 9) : 0) - this.slip) * Math.min(1, 6 * dt);

    this.x += this.fx * v * dt;
    this.z += this.fz * v * dt;

    // walls and furniture: each circle is pushed out of what it overlaps; the car moves by the mean push, loses the speed it had
    // into the obstacle, and a corner pushed aside turns the nose away
    let n = 0, dx = 0, dz = 0, torque = 0;
    const cols = env.colliders ?? [env.collider];
    for (const o of C.circles) {
      const q = { x: this.x + this.fx * o, z: this.z + this.fz * o };
      const x0 = q.x, z0 = q.z;
      let hit = false;
      for (const col of cols) hit = col.resolve(q, C.radius) || hit;
      if (hit) {
        const ddx = q.x - x0, ddz = q.z - z0;
        dx += ddx;
        dz += ddz;
        torque += this.fx * o * ddz - this.fz * o * ddx;
        n++;
      }
    }
    if (n) {
      dx /= n;
      dz /= n;
      this.x += dx;
      this.z += dz;
      const len = Math.hypot(dx, dz);
      if (len > 1e-6) {
        const nx = dx / len, nz = dz / len;
        const vn = this.fx * v * nx + this.fz * v * nz;
        if (vn < 0) {
          v = (this.fx * v - 1.12 * vn * nx) * this.fx + (this.fz * v - 1.12 * vn * nz) * this.fz;
          this.bump = Math.min(1, Math.max(this.bump, -vn / 10));
        }
      }
      this.yaw -= clamp(0.18 * torque, -0.06, 0.06);
    }
    this.speed = v;
    this.bump *= Math.exp(-6 * dt);

    // the ground under the four wheels: height (floors, steps, ramps), nose up or down, one side up
    const hl = C.wheelbase / 2, hw = C.track / 2;
    const at = (a, b) => env.heightAt(this.x + this.fx * a + this.lx * b, this.z + this.fz * a + this.lz * b, this.y);
    const fl = at(hl, hw), fr = at(hl, -hw), rl = at(-hl, hw), rr = at(-hl, -hw);
    const front = (fl + fr) / 2, rear = (rl + rr) / 2, left = (fl + rl) / 2, right = (fr + rr) / 2;
    const k = Math.min(1, 14 * dt);
    this.y += ((front + rear) / 2 - this.y) * k;
    this.pitch += (Math.atan2(front - rear, C.wheelbase) - this.pitch) * k;
    this.roll += (Math.atan2(left - right, C.track) - this.roll) * k;
    this.wheelSpin += (v * dt) / C.wheel;
    return { bumped: n > 0 };
  }
}
