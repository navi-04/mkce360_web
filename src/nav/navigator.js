// Navigation controller: plans a route, shows it, follows the walker with hints and runs the guided walk.
//
//   none -> preview (route planned) -> guided <-> paused -> arrived
//                                         \-> manual (the user took control; route and hints stay)
//
// The guided walk drives WalkMode through its `driver` hook; any joystick, key or tap input hands control back.
import { PLAYER } from '../config.js';
import { planRoute, hintAt } from './route.js';

const DEG = Math.PI / 180;
const wrapPi = (a) => {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
};
const OFF_ROUTE_M = 14;
const REROUTE_AFTER_S = 2.5;
const ARRIVE_M = 3.2;

export class Navigator {
  constructor(app) {
    this.app = app;
    this.layer = null; // RouteLayer, set by the app
    this.route = null;
    this.spec = null; // { target, fromId }
    this.mode = 'none';
    this.s = 0;
    this.v = 0;
    this.off = 0;
    this.hint = null;
    this.speedMult = 1;
    this._listeners = new Set();
    this._tick = 0;
    this._offTime = 0;
    this._face = null;
    this._lastHintKey = '';
    this.driver = { step: (dt) => this._step(dt), interrupt: (why) => this._interrupted(why) };
  }

  // ---------- observers ----------

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  emit(type = 'change') {
    for (const fn of this._listeners) fn(type, this);
  }

  get active() {
    return this.mode !== 'none';
  }

  /** remaining distance (m), time (s) */
  get remaining() {
    return this.route ? Math.max(0, this.route.length - this.s) : 0;
  }

  get eta() {
    const v = this.mode === 'guided' && this.v > 0.3 ? this.v : PLAYER.walkSpeed;
    return this.remaining / v;
  }

  // ---------- planning ----------

  /** where a route could start from, with availability */
  fromOptions() {
    const app = this.app;
    const opts = [{ id: 'me', label: 'My position', available: app.inWorld || !!app.lastWalk }];
    for (const g of app.data.gates) opts.push({ id: `gate:${g.id}`, label: g.name, available: true });
    return opts;
  }

  _startSpec(fromId) {
    const app = this.app;
    if (fromId === 'me') {
      const p = app.inWorld ? app.walk.pos : app.lastWalk;
      if (p) return { x: p.x, z: p.z, label: 'My position' };
      fromId = 'gate:main-gate';
    }
    return { gate: fromId.slice(5) };
  }

  defaultFromId() {
    const app = this.app;
    if (app.inWorld) return 'me';
    return 'gate:main-gate';
  }

  /** Plan a route to {buildingId} | {pointId} | {x,z,label}. Shows it on the ground. Returns the route or null. */
  planTo(target, fromId = null) {
    const id = fromId ?? this.spec?.fromId ?? this.defaultFromId();
    const route = planRoute(this.app.data, this._startSpec(id), target);
    if (!route) {
      this.app.hud.toast('No walkable route to that place was found.');
      return null;
    }
    this._detach();
    this.spec = { target, fromId: id };
    this.route = route;
    this.mode = 'preview';
    this.s = 0;
    this.v = 0;
    this.off = 0;
    this._offTime = 0;
    this._face = null;
    this.layer?.setRoute(route);
    this.app.overview?.labels.setHighlight(route.to.buildingId ?? null);
    this.hint = hintAt(route, 0);
    this.emit('route');
    return route;
  }

  /** the walker is off the line: plan again from where they stand and keep walking by hand */
  reroute() {
    if (this.replan()) {
      this.mode = 'manual';
      this.emit();
    }
  }

  setFrom(fromId) {
    if (!this.spec) return null;
    return this.planTo(this.spec.target, fromId);
  }

  replan() {
    if (!this.spec) return null;
    const fromId = this.app.inWorld ? 'me' : this.spec.fromId;
    return this.planTo(this.spec.target, fromId);
  }

  end() {
    this._detach();
    this.route = null;
    this.spec = null;
    this.mode = 'none';
    this.hint = null;
    this.s = this.v = 0;
    this._face = null;
    this.layer?.clear();
    this.app.overview?.labels.setHighlight(null);
    this.emit('end');
  }

  // ---------- guided walk ----------

  _attach() {
    this.app.walk.driver = this.driver;
  }

  _detach() {
    if (this.app.walk?.driver === this.driver) this.app.walk.driver = null;
  }

  /** Begin the guided walk (switches to Walk mode, moving the viewer to the start when needed). */
  async start() {
    const app = this.app;
    if (!this.route) return false;
    const fromMe = this.spec.fromId === 'me';
    if (fromMe && app.inWorld) this.replan(); // the walker may have moved since the route was drawn
    const r = this.route;
    const spawn = { x: r.poly.p[0].x, z: r.poly.p[0].z, yaw: -r.poly.bearingAt(0, 6) * DEG };
    if (app.mode !== 'walk') await app.setMode('walk', { spawn: fromMe && app.lastWalk ? { ...app.lastWalk } : spawn });
    else if (!fromMe) await app.teleportWalk(spawn);
    this._face = null;
    this.s = fromMe ? (r.poly.project(app.walk.pos.x, app.walk.pos.z)?.s ?? 0) : 0;
    this.v = 0;
    this._offTime = 0;
    this.mode = 'guided';
    this._attach();
    this.emit('start');
    return true;
  }

  /** Go to the start in Walk mode and follow the line yourself (hints only, no guided movement). */
  async startManual() {
    const app = this.app;
    if (!this.route) return false;
    const fromMe = this.spec.fromId === 'me';
    if (fromMe && app.inWorld) this.replan();
    const r = this.route;
    const spawn = { x: r.poly.p[0].x, z: r.poly.p[0].z, yaw: -r.poly.bearingAt(0, 6) * DEG };
    if (app.mode !== 'walk') await app.setMode('walk', { spawn: fromMe && app.lastWalk ? { ...app.lastWalk } : spawn });
    else if (!fromMe) await app.teleportWalk(spawn);
    this._face = null;
    this.s = fromMe ? (r.poly.project(app.walk.pos.x, app.walk.pos.z)?.s ?? 0) : 0;
    this.mode = 'manual';
    this.emit('start');
    return true;
  }

  pause() {
    if (this.mode !== 'guided') return;
    this.mode = 'paused';
    this.emit();
  }

  /** continue after pause or after the user had taken control */
  async resume() {
    if (!this.route) return;
    const app = this.app;
    if (app.mode !== 'walk') await app.setMode('walk', { spawn: app.lastWalk ? { ...app.lastWalk } : undefined });
    if (this.mode === 'manual' || this.mode === 'preview') {
      const p = app.walk.pos;
      const g = this.route.poly.project(p.x, p.z);
      if (g.d > OFF_ROUTE_M) this.replan();
      else this.s = g.s;
    }
    this.v = 0;
    this._offTime = 0;
    this.mode = 'guided';
    this._attach();
    this.emit();
  }

  takeControl() {
    if (this.mode !== 'guided' && this.mode !== 'paused') return;
    this._interrupted('manual');
  }

  _interrupted(why) {
    this._detach();
    if (why === 'exit') {
      if (this.mode === 'guided') this.mode = 'paused'; // leaving Walk mode pauses the guide, the route stays
    } else if (this.mode === 'guided' || this.mode === 'paused') {
      this.mode = 'manual';
      this.app.hud.toast('You are in control. The route stays on the ground.');
    }
    this.emit();
  }

  _step(dt) {
    const app = this.app, walk = app.walk, r = this.route;
    if (!r) return;
    if (this.mode === 'paused') {
      this.v += (0 - this.v) * (1 - Math.exp(-dt / 0.25));
    } else {
      const target = (walk.running ? PLAYER.runSpeed : PLAYER.walkSpeed) * this.speedMult;
      const left = r.stopAt - this.s;
      const vt = Math.min(target, Math.max(0.45, left * 0.9)); // ease out before the door
      this.v += (vt - this.v) * (1 - Math.exp(-dt / 0.4));
    }
    this.s = Math.min(r.stopAt, this.s + this.v * dt);
    const q = r.poly.at(this.s);
    walk.pos.x = q.x;
    walk.pos.z = q.z;
    walk.vel.x = q.dx * this.v;
    walk.vel.z = q.dz * this.v;
    walk.speed = this.v;
    if (!walk.gyroOn && !walk.look.id && performance.now() - walk.lastLookAt > 2200) {
      const la = r.poly.at(Math.min(r.length, this.s + 5));
      const want = Math.atan2(-(la.x - q.x), -(la.z - q.z));
      const diff = wrapPi(want - walk.yaw);
      const step = diff * (1 - Math.exp(-dt / 0.3));
      walk.yaw += Math.sign(step) * Math.min(Math.abs(step), 2.6 * dt);
      walk.pitch += (-4 * DEG - walk.pitch) * (1 - Math.exp(-dt / 0.6));
    }
    if (this.mode === 'guided' && this.s >= r.stopAt - 0.01) this._arrive();
  }

  _arrive() {
    const walk = this.app.walk, r = this.route;
    this._detach();
    this.mode = 'arrived';
    this.s = r.stopAt;
    this.v = 0;
    walk.vel.x = walk.vel.z = 0;
    walk.speed = 0;
    const d = r.to.point;
    this._face = { yaw: Math.atan2(-(d.x - walk.pos.x), -(d.z - walk.pos.z)) };
    this.hint = hintAt(r, r.length);
    this.emit('arrived');
  }

  // ---------- per frame ----------

  update(dt) {
    const app = this.app;
    this.layer?.update(dt, app.camera, app.mode);
    const r = this.route;
    if (!r) return;

    if (app.inWorld) {
      const walk = app.walk;
      if (this.mode === 'arrived') {
        if (this._face && !walk.gyroOn) {
          const diff = wrapPi(this._face.yaw - walk.yaw);
          if (Math.abs(diff) < 0.01) this._face = null;
          else walk.yaw += Math.sign(diff) * Math.min(Math.abs(diff), 2.4 * dt);
        }
      } else if (this.mode !== 'guided' && this.mode !== 'paused') {
        // follow the walker along the line
        const p = walk.pos;
        let hit = r.poly.project(p.x, p.z, Math.max(0, this.s - 8), Math.min(r.length, this.s + 45));
        if (hit.d > 6) {
          const any = r.poly.project(p.x, p.z);
          if (any.d < hit.d - 3) hit = any;
        }
        this.s = hit.s;
        this.off = hit.d;
        if (hit.d > OFF_ROUTE_M) {
          this._offTime += dt;
          if (this._offTime > REROUTE_AFTER_S && this.mode !== 'preview') {
            this._offTime = 0;
            this.reroute();
            app.hud.toast('Route updated from where you are.');
          }
        } else this._offTime = 0;
        if ((this.mode === 'manual' || this.mode === 'preview') && r.length - this.s <= ARRIVE_M && hit.d < 8) this._arrive();
      }
      this.layer?.setProgress(this.mode === 'preview' && this.s < 1 ? -10 : this.s);
    } else {
      this.layer?.setProgress(-10);
    }

    if (this.mode !== 'arrived') this.hint = hintAt(r, this.s);
    this._tick += dt;
    if (this._tick > 0.2) {
      this._tick = 0;
      const key = `${this.mode}|${this.hint?.text}|${Math.round(this.remaining / 2)}|${this.off > OFF_ROUTE_M}`;
      if (key !== this._lastHintKey) {
        this._lastHintKey = key;
        this.emit('tick');
      }
    }
  }

  get offRoute() {
    return this.off > OFF_ROUTE_M && (this.mode === 'manual' || this.mode === 'preview');
  }
}
