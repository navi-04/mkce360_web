// First-person walking: eye height 1.6 m, ~1.4 m/s (Run toggle), virtual joystick (left) + drag-look (right)
// with true multi-touch, WASD/arrow keys + mouse drag, tap-to-walk, optional gyroscope and head-bob.
import * as THREE from 'three';
import { PLAYER } from '../config.js';
import { Collider } from './collision.js';
import { Gyro } from './gyro.js';

const DEG = Math.PI / 180;
const TWO_PI = Math.PI * 2;
const TAP_MAX_MS = 320;
const TAP_MAX_MOVE = 10;

const wrapPi = (a) => {
  a = (a + Math.PI) % TWO_PI;
  if (a < 0) a += TWO_PI;
  return a - Math.PI;
};

export class WalkMode {
  constructor({ camera, canvas, world, joystick, reducedMotion }) {
    this.camera = camera;
    this.canvas = canvas;
    this.world = world;
    this.joystick = joystick;
    this.collider = new Collider(world.colliders, world.boundary);

    this.pos = { x: -3, z: 0 };
    this.vel = { x: 0, z: 0 };
    this.yaw = 0;
    this.pitch = 0;
    this.speed = 0; // actual speed this frame (m/s)
    this.groundY = 0; // height of the ground under the viewer (the courtyard lawn is lower than the walkway)
    this.groundFn = null; // (x, z, yHint) => height of the ground under the viewer (floors, stairs, steps); set by the app

    this.run = false;
    this.headBob = !reducedMotion;
    this.invertLook = false;
    this.lookSensitivity = 1;
    this.bobPhase = 0;

    this.active = false;
    this.keys = new Set();
    this.joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.look = { id: null, lx: 0, ly: 0, sx: 0, sy: 0, t: 0, moved: 0, mouse: false };
    this.sim = null; // test/automation input {forward, strafe, turn}
    this.target = null;
    this.turnAssist = false;
    this.driver = null; // guided walk (src/nav/navigator.js): { step(dt), interrupt(reason) } moves the player along a route
    this.lastLookAt = 0; // when the user last turned the view (the guide leaves the view alone for a moment)

    this.gyro = new Gyro();
    this.gyroOn = false; // true only once the sensor works AND the offset to the current view is captured
    this.gyroBase = { yaw: 0, pitch: 0 };

    this.onTap = null; // (x, z, event) => void  (calibration hook)
    this.onRawTap = null; // (event) => boolean: handle a tap before the ground is picked (interiors)

    // tap-to-walk marker
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.55, 28).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.95, depthTest: false }),
    );
    this.marker.position.y = 0.08;
    this.marker.renderOrder = 50;
    this.marker.visible = false;
    world.scene.add(this.marker);

    this._ray = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._bind();
  }

  // ---------- lifecycle ----------

  enter({ x, z, yaw = 0, y = 0 }) {
    this.pos.x = x;
    this.pos.z = z;
    this.groundY = y; // the height they arrive at (a floor of a building), the ground function takes it from there
    this.collider.resolve(this.pos, PLAYER.radius);
    this.vel.x = this.vel.z = 0;
    this.yaw = yaw;
    this.pitch = -6 * DEG; // look slightly down at the path
    this.target = null;
    this.marker.visible = false;
    this.active = true;
    this._apply(0);
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);
    window.addEventListener('blur', this._blur);
    this.canvas.addEventListener('pointerdown', this._pd);
    this.canvas.addEventListener('pointermove', this._pm);
    this.canvas.addEventListener('pointerup', this._pu);
    this.canvas.addEventListener('pointercancel', this._pu);
    this.canvas.addEventListener('lostpointercapture', this._pu);
    this.canvas.addEventListener('contextmenu', this._noMenu);
  }

  exit() {
    this.driver?.interrupt('exit');
    this.active = false;
    this.keys.clear();
    this._endJoy();
    this.look.id = null;
    this.marker.visible = false;
    window.removeEventListener('keydown', this._kd);
    window.removeEventListener('keyup', this._ku);
    window.removeEventListener('blur', this._blur);
    this.canvas.removeEventListener('pointerdown', this._pd);
    this.canvas.removeEventListener('pointermove', this._pm);
    this.canvas.removeEventListener('pointerup', this._pu);
    this.canvas.removeEventListener('pointercancel', this._pu);
    this.canvas.removeEventListener('lostpointercapture', this._pu);
    this.canvas.removeEventListener('contextmenu', this._noMenu);
  }

  get running() {
    return this.run || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  /** Heading in degrees clockwise from north (for compass and mini-map). */
  get headingDeg() {
    return ((-this.yaw / DEG) % 360 + 360) % 360;
  }

  async setGyro(on) {
    if (!on) {
      this.gyroOn = false;
      this.gyro.disable();
      return false;
    }
    const y0 = this.yaw, p0 = this.pitch; // keep the current view: no jump when the sensor starts
    const ok = await this.gyro.enable();
    if (ok) {
      const r = this.gyro.read();
      this.gyroBase.yaw = y0 - r.yaw;
      this.gyroBase.pitch = p0 - r.pitch;
      this.gyroOn = true;
    }
    return ok;
  }

  /** stand at a spot, facing yaw, on the ground at height y (0 in the open, the floor in a building); no walking in between */
  placeAt(x, z, yaw, { y = 0, pitch = -6 * DEG } = {}) {
    this.pos.x = x;
    this.pos.z = z;
    this.groundY = y;
    this.collider.resolve(this.pos, PLAYER.radius);
    this.vel.x = this.vel.z = 0;
    this.yaw = yaw;
    this.pitch = pitch;
    this.cancelTarget();
    this._apply(0);
  }

  walkTo(x, z) {
    this.driver?.interrupt('tap');
    const p = { x, z };
    this.collider.resolve(p, PLAYER.radius + 0.1);
    this.target = p;
    this.turnAssist = !this.gyroOn;
    this.marker.position.set(p.x, this.groundY + 0.08, p.z);
    this.marker.visible = true;
  }

  cancelTarget() {
    this.target = null;
    this.marker.visible = false;
  }

  /** Where the ground point under a screen position is (or null when aiming above the horizon). */
  pickGround(clientX, clientY, maxDist = 400) {
    const r = this.canvas.getBoundingClientRect();
    this._ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this._ray.setFromCamera(this._ndc, this.camera);
    const { origin, direction } = this._ray.ray;
    if (direction.y > -0.005) return null;
    const t = (this.groundY - origin.y) / direction.y;
    if (t > maxDist) return null;
    return { x: origin.x + direction.x * t, z: origin.z + direction.z * t };
  }

  // ---------- per-frame ----------

  update(dt) {
    if (!this.active) return;
    dt = Math.min(dt, 0.05);

    // keyboard turning
    const turnKey = (this.keys.has('ArrowLeft') ? 1 : 0) - (this.keys.has('ArrowRight') ? 1 : 0);
    const turn = turnKey + (this.sim?.turn ?? 0);
    if (turn) this._addLook(turn * 1.7 * dt, 0);

    // gyro drives yaw/pitch
    if (this.gyroOn && this.gyro.has) {
      const r = this.gyro.read();
      this.yaw = r.yaw + this.gyroBase.yaw;
      this.pitch = this._clampPitch(r.pitch + this.gyroBase.pitch);
    }

    // movement intent
    const kf = (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
    const ks = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    let fwd = this.joy.y + kf + (this.sim?.forward ?? 0);
    let str = this.joy.x + ks + (this.sim?.strafe ?? 0);
    let mag = Math.hypot(fwd, str);
    const manual = mag > 0.06;
    if (this.driver) {
      if (manual) this.driver.interrupt('manual'); // joystick or keys: the user takes over
      else {
        this.driver.step(dt); // guided walk places the player and steers the view
        this._apply(dt);
        return;
      }
    }
    if (mag > 1) {
      fwd /= mag;
      str /= mag;
      mag = 1;
    }
    const vmax = this.running ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let dx = 0, dz = 0;
    if (manual) {
      if (this.target) this.cancelTarget();
      const m = Math.min(1, mag) * vmax;
      const nf = fwd / mag, ns = str / mag;
      dx = (-sy * nf + cy * ns) * m;
      dz = (-cy * nf - sy * ns) * m;
    } else if (this.target) {
      const tx = this.target.x - this.pos.x, tz = this.target.z - this.pos.z;
      const dist = Math.hypot(tx, tz);
      if (dist < 0.45) {
        this.cancelTarget();
      } else {
        if (this.turnAssist) {
          const want = Math.atan2(-tx, -tz);
          const diff = wrapPi(want - this.yaw);
          if (Math.abs(diff) > 0.02) this.yaw += Math.sign(diff) * Math.min(Math.abs(diff), 3.2 * dt);
          this.pitch += (0 - this.pitch) * Math.min(1, 4 * dt);
        }
        const slow = Math.min(1, dist / 2);
        dx = (tx / dist) * vmax * slow;
        dz = (tz / dist) * vmax * slow;
        this.marker.scale.setScalar(1 + 0.15 * Math.sin(performance.now() / 160));
      }
    }

    const k = 1 - Math.exp(-dt / PLAYER.accelTime);
    this.vel.x += (dx - this.vel.x) * k;
    this.vel.z += (dz - this.vel.z) * k;
    const px = this.pos.x, pz = this.pos.z;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.collider.resolve(this.pos, PLAYER.radius);
    this.speed = dt > 0 ? Math.hypot(this.pos.x - px, this.pos.z - pz) / dt : 0;
    if (this.target && this.speed < 0.05 && Math.hypot(dx, dz) > 0.2) this.cancelTarget(); // blocked by a wall
    this._apply(dt);
  }

  _apply(dt) {
    let bob = 0, sway = 0;
    if (this.headBob && this.speed > 0.1) {
      this.bobPhase += (this.speed * dt * TWO_PI) / PLAYER.bobStepLength;
      const f = Math.min(1, this.speed / PLAYER.walkSpeed);
      bob = Math.sin(this.bobPhase) * PLAYER.bobAmplitude * f;
      sway = Math.cos(this.bobPhase * 0.5) * 0.012 * f;
    }
    const gy = this.groundFn ? this.groundFn(this.pos.x, this.pos.z, this.groundY) : 0;
    this.groundY = dt > 0 ? this.groundY + (gy - this.groundY) * Math.min(1, 12 * dt) : gy; // eased, so steps are not jolts
    this.camera.position.set(this.pos.x, this.groundY + PLAYER.eyeHeight + bob, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, sway, 'YXZ');
  }

  // ---------- input ----------

  _clampPitch(p) {
    const lim = PLAYER.pitchLimitDeg * DEG;
    return Math.max(-lim, Math.min(lim, p));
  }

  _addLook(dyaw, dpitch) {
    this.lastLookAt = performance.now();
    if (this.gyroOn) {
      this.gyroBase.yaw += dyaw;
      this.gyroBase.pitch += dpitch;
    } else {
      this.yaw += dyaw;
      this.pitch = this._clampPitch(this.pitch + dpitch);
    }
  }

  _endJoy() {
    this.joy.id = null;
    this.joy.x = this.joy.y = 0;
    this.joystick?.hide();
  }

  _bind() {
    this._noMenu = (e) => e.preventDefault();
    this._blur = () => this.keys.clear();
    this._kd = (e) => {
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
    };
    this._ku = (e) => this.keys.delete(e.code);

    this._pd = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const r = this.canvas.getBoundingClientRect();
      const left = e.clientX - r.left < r.width * 0.5;
      if (e.pointerType !== 'mouse' && left && this.joy.id === null) {
        this.joy.id = e.pointerId;
        this.joy.ox = e.clientX;
        this.joy.oy = e.clientY;
        this.joystick?.show(e.clientX, e.clientY);
        this.canvas.setPointerCapture(e.pointerId);
        return;
      }
      if (this.look.id === null) {
        this.look = { id: e.pointerId, lx: e.clientX, ly: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: 0, mouse: e.pointerType === 'mouse' };
        this.canvas.setPointerCapture(e.pointerId);
      }
    };
    this._pm = (e) => {
      if (e.pointerId === this.joy.id) {
        const R = this.joystick?.radius ?? 56;
        let dx = e.clientX - this.joy.ox, dy = e.clientY - this.joy.oy;
        const len = Math.hypot(dx, dy);
        if (len > R) {
          dx = (dx / len) * R;
          dy = (dy / len) * R;
        }
        this.joy.x = dx / R;
        this.joy.y = -dy / R;
        this.joystick?.move(dx, dy);
      } else if (e.pointerId === this.look.id) {
        const dx = e.clientX - this.look.lx, dy = e.clientY - this.look.ly;
        this.look.lx = e.clientX;
        this.look.ly = e.clientY;
        this.look.moved = Math.max(this.look.moved, Math.hypot(e.clientX - this.look.sx, e.clientY - this.look.sy));
        const s = (this.look.mouse ? 0.0034 : 0.0042) * this.lookSensitivity * (this.invertLook ? -1 : 1);
        this._addLook(-dx * s, -dy * s);
      }
    };
    this._pu = (e) => {
      if (e.pointerId === this.joy.id) {
        this._endJoy();
      } else if (e.pointerId === this.look.id) {
        const l = this.look;
        this.look = { id: null, lx: 0, ly: 0, sx: 0, sy: 0, t: 0, moved: 0, mouse: false };
        if (e.type === 'pointerup' && performance.now() - l.t < TAP_MAX_MS && l.moved < TAP_MAX_MOVE) this._tap(e);
      }
    };
  }

  _tap(e) {
    if (this.onRawTap?.(e)) return; // e.g. interiors: a tap on a door or sign
    const g = this.pickGround(e.clientX, e.clientY);
    if (!g) return;
    if (this.onTap) this.onTap(g.x, g.z, e);
    else this.walkTo(g.x, g.z);
  }
}
