// Driving: a small car you steer with the keys (W A S D or the arrows, Space for the handbrake, C for the view) or, on a phone, with
// the pedals and steering buttons of the drive controls (ui/drive-ui.js). It goes anywhere the walking viewer goes and the walls
// allow, in through the entrance of a building too (ground.js gives it the height of the floor and the obstacles of that floor).
// The car mirrors its place into the walking viewer (position, heading, height), so the mini-map, the route and the buildings
// treat a driver like a walker. Leaving the car parks it where it stands (it stays, and blocks the way like a parked car).
import * as THREE from 'three';
import { Car, CAR } from './car.js';
import { Collider, obstacle } from './collision.js';
import { boxGeo, cylGeo, paint, merge } from '../world/geo.js';

const DEG = Math.PI / 180;
const TWO_PI = Math.PI * 2;
const wrapPi = (a) => { a = (a + Math.PI) % TWO_PI; if (a < 0) a += TWO_PI; return a - Math.PI; };

/** the car: one body mesh (merged, vertex colours, the same shader as the buildings' details) and four wheels. Built facing -z. */
function buildCar() {
  const group = new THREE.Group();
  group.name = 'car';
  const parts = [];
  const add = (w, h, d, x, y, z, color) => {
    const g = boxGeo(w, h, d, { x, y, z });
    parts.push(paint(g, color));
  };
  const BODY = 0xc63a2f, GLASS = 0x233648, DARK = 0x33363b, LIGHT = 0xfff3c4, RED = 0xd62a2a;
  add(1.72, 0.52, 3.76, 0, 0.3, 0, BODY); // lower body
  add(1.5, 0.52, 1.95, 0, 0.82, 0.18, GLASS); // cabin (glass)
  add(1.54, 0.07, 2.0, 0, 1.34, 0.18, BODY); // roof
  for (const sx of [-0.78, 0.78]) add(0.06, 0.5, 0.1, sx, 0.82, -0.82, BODY); // windscreen pillars
  add(1.46, 0.5, 0.06, 0, 0.82, -0.8, GLASS); // windscreen
  add(1.74, 0.2, 0.14, 0, 0.26, -1.9, DARK); // bumpers
  add(1.74, 0.2, 0.14, 0, 0.26, 1.9, DARK);
  for (const sx of [-0.58, 0.58]) {
    add(0.34, 0.14, 0.05, sx, 0.62, -1.88, LIGHT); // headlights
    add(0.34, 0.14, 0.05, sx, 0.62, 1.88, RED); // tail lights
  }
  add(1.4, 0.04, 1.0, 0, 0.58, -1.15, 0xb53228); // bonnet shading
  const body = new THREE.Mesh(merge(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
  body.name = 'car-body';
  group.add(body);

  // wheels: a tyre with a light hub, spinning about their axle; the front ones also turn with the steering
  const tyre = new THREE.CylinderGeometry(CAR.wheel, CAR.wheel, 0.22, 14).rotateZ(Math.PI / 2).toNonIndexed();
  const hub = new THREE.CylinderGeometry(CAR.wheel * 0.55, CAR.wheel * 0.55, 0.24, 8).rotateZ(Math.PI / 2).toNonIndexed();
  const wheelGeo = merge([paint(tyre, 0x1b1d20), paint(hub, 0xb8bfc6)]);
  const mat = body.material;
  const wheels = [];
  for (const [sx, z, front] of [[-0.78, -CAR.wheelbase / 2, true], [0.78, -CAR.wheelbase / 2, true], [-0.78, CAR.wheelbase / 2, false], [0.78, CAR.wheelbase / 2, false]]) {
    const steerer = new THREE.Group();
    steerer.position.set(sx, CAR.wheel, z);
    const spin = new THREE.Mesh(wheelGeo, mat);
    spin.name = 'car-wheel';
    steerer.add(spin);
    group.add(steerer);
    wheels.push({ steerer, spin, front });
  }
  group.userData.wheels = wheels;
  return group;
}

export class DriveMode {
  constructor({ camera, canvas, world, ground, walk, reducedMotion }) {
    this.camera = camera;
    this.walk = walk; // the walking viewer: the car mirrors its place into it
    this.canvas = canvas;
    this.world = world;
    this.ground = ground;
    this.reducedMotion = reducedMotion;
    this.car = new Car();
    this.mesh = buildCar();
    this.mesh.visible = false;
    world.scene.add(this.mesh);
    this.collider = null; // set every frame by the interiors: the obstacles of the floor the car is on
    this.scenery = new Collider([], world.boundary); // trunks, lamp posts and benches (only the car bumps into them)
    this.active = false;
    this.parked = false; // the car stands somewhere after the driver got out
    this.view = 'chase'; // 'chase' | 'cockpit'
    this.keys = new Set();
    this.pad = { gas: false, brake: false, left: false, right: false, hand: false }; // the pedals and buttons of a phone
    this.sim = null; // test input { throttle, brake, steer, handbrake }
    this.ceilingAt = null; // (x, z, y) => height of the ceiling above that spot (or null in the open): keeps the camera under it
    this._cam = { yaw: 0, x: 0, y: 0, z: 0, fresh: true };
    this._baseFov = 60;
    this._obstacle = null;
    this._bind();
  }

  /** km/h, for the speedometer */
  get kmh() {
    return Math.abs(this.car.speed) * 3.6;
  }

  // ---------- lifecycle ----------

  /**
   * Get in. At a spot (x, z, yaw, y): the car appears there. When the car was parked within a few metres of the spot, it is the same
   * car, where it was left.
   */
  enter({ x, z, yaw = 0, y = 0 }) {
    const c = this.car;
    const near = this.parked && Math.hypot(c.x - x, c.z - z) < 14;
    this._unpark();
    if (!near) c.place(x, z, yaw, y);
    else c.speed = 0;
    this.mesh.visible = true;
    this.active = true;
    this._cam.fresh = true;
    this._sync(0);
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);
    window.addEventListener('blur', this._blur);
  }

  /** Get out: the car is parked where it is. Returns where the driver stands (beside the car, facing along it). */
  exit() {
    this.active = false;
    this.keys.clear();
    for (const k of Object.keys(this.pad)) this.pad[k] = false;
    window.removeEventListener('keydown', this._kd);
    window.removeEventListener('keyup', this._ku);
    window.removeEventListener('blur', this._blur);
    const c = this.car;
    c.speed = 0;
    c.steer = 0;
    this._park();
    // the driver's door is on the right (traffic keeps left)
    const px = c.x - c.lx * 2.0, pz = c.z - c.lz * 2.0;
    return { x: px, z: pz, yaw: c.yaw, y: c.y };
  }

  _park() {
    this.parked = true;
    this._obstacle = obstacle({ id: 'car', cx: this.car.x, cz: this.car.z, hw: CAR.width / 2, hd: CAR.length / 2, rot: this.car.yaw });
    this.ground.extras.push(this._obstacle);
  }

  _unpark() {
    if (this._obstacle) {
      const i = this.ground.extras.indexOf(this._obstacle);
      if (i >= 0) this.ground.extras.splice(i, 1);
    }
    this._obstacle = null;
    this.parked = false;
  }

  toggleView() {
    this.view = this.view === 'chase' ? 'cockpit' : 'chase';
    this._cam.fresh = true;
    this.mesh.visible = true;
  }

  // ---------- per frame ----------

  /** what the driver asks for this frame, from the keys, the pedals of a phone and (in tests) the simulated input */
  inputs() {
    const k = this.keys, p = this.pad, s = this.sim ?? {};
    const throttle = k.has('KeyW') || k.has('ArrowUp') || p.gas ? 1 : s.throttle ?? 0;
    const brake = k.has('KeyS') || k.has('ArrowDown') || p.brake ? 1 : s.brake ?? 0;
    const left = k.has('KeyA') || k.has('ArrowLeft') || p.left ? 1 : 0, right = k.has('KeyD') || k.has('ArrowRight') || p.right ? 1 : 0;
    const steer = Math.max(-1, Math.min(1, left - right + (s.steer ?? 0)));
    return { throttle, brake, steer, handbrake: k.has('Space') || p.hand || !!s.handbrake };
  }

  update(dt) {
    if (!this.active) return;
    dt = Math.min(dt, 0.05);
    if (this.collider) this.car.step(dt, this.inputs(), { collider: this.collider, colliders: [this.collider, this.scenery], heightAt: (x, z, y) => this.ground.heightAt(x, z, y) });
    this._sync(dt);
  }

  /** the car's mesh and the camera follow the car; the walking viewer mirrors it (map, route and buildings use that) */
  _sync(dt) {
    const c = this.car, m = this.mesh;
    m.position.set(c.x, c.y, c.z);
    m.rotation.set(c.pitch, c.yaw, -c.roll, 'YXZ');
    for (const w of m.userData.wheels) {
      w.spin.rotation.x = -c.wheelSpin;
      w.steerer.rotation.y = w.front ? c.steer : 0;
    }
    const wk = this.walk;
    if (wk) {
      wk.pos.x = c.x;
      wk.pos.z = c.z;
      wk.yaw = c.yaw;
      wk.groundY = c.y;
      wk.pitch = 0;
    }
    this._camera(dt);
  }

  _camera(dt) {
    const c = this.car, cam = this.camera, st = this._cam;
    const fx = c.fx, fz = c.fz;
    if (this.view === 'cockpit') {
      // the head of the driver, on the right-hand seat, looking along the car
      cam.position.set(c.x + fx * 0.05 - c.lx * 0.4, c.y + 1.12, c.z + fz * 0.05 - c.lz * 0.4);
      cam.rotation.set(c.pitch * 0.5 - 0.03, c.yaw, 0, 'YXZ');
      this.mesh.visible = false;
      this._fov(c);
      return;
    }
    this.mesh.visible = true;
    // the camera follows from behind and a little above, turning after the car with some delay; pulled in where a wall is in the way
    st.yaw = st.fresh ? c.yaw : st.yaw + wrapPi(c.yaw - st.yaw) * Math.min(1, 5 * (dt || 1));
    const back = 6.0 + Math.min(2.5, Math.abs(c.speed) * 0.09), rise = 2.3 + Math.min(1.0, Math.abs(c.speed) * 0.04);
    const bx = Math.sin(st.yaw), bz = Math.cos(st.yaw); // from the car backwards (the camera's yaw is the direction it looks in)
    let t = 1;
    if (this.collider) {
      for (; t > 0.2; t -= 0.1) {
        const q = { x: c.x + bx * back * t, z: c.z + bz * back * t };
        if (!this.collider.resolve(q, 0.35)) break;
      }
    }
    const want = { x: c.x + bx * back * t, y: c.y + 0.9 + (rise - 0.9) * Math.max(0.3, t), z: c.z + bz * back * t };
    const ceil = this.ceilingAt?.(want.x, want.z, c.y);
    if (ceil != null) want.y = Math.min(want.y, ceil - 0.25);
    if (st.fresh) { st.x = want.x; st.y = want.y; st.z = want.z; st.fresh = false; }
    else {
      const k = 1 - Math.exp(-9 * (dt || 1));
      st.x += (want.x - st.x) * k;
      st.y += (want.y - st.y) * k;
      st.z += (want.z - st.z) * k;
    }
    cam.position.set(st.x, st.y, st.z);
    // look at a point a little ahead of the car, so the road shows
    const lx = c.x + fx * 2.5, lz = c.z + fz * 2.5, ly = c.y + 0.9;
    const dx = lx - st.x, dz = lz - st.z, dy = ly - st.y;
    cam.rotation.set(Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0, 'YXZ');
    this._fov(c);
  }

  /** a little wider at speed */
  _fov(c) {
    if (this.reducedMotion) return;
    const f = this.view === 'cockpit' ? this._baseFov : this._baseFov + Math.min(9, Math.abs(c.speed) * 0.4);
    if (Math.abs(this.camera.fov - f) > 0.05) {
      this.camera.fov = f;
      this.camera.updateProjectionMatrix();
    }
  }

  /** the trunks, lamp posts and benches that are drawn (they change with the graphics quality) */
  setObstacles(list) {
    this.scenery.obbs = list.map(obstacle);
  }

  setBaseFov(fov) {
    this._baseFov = fov;
  }

  // ---------- keyboard ----------

  _bind() {
    this._blur = () => this.keys.clear();
    this._kd = (e) => {
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (e.code === 'KeyC' && !e.repeat) this.toggleView();
      this.keys.add(e.code);
    };
    this._ku = (e) => this.keys.delete(e.code);
  }
}
