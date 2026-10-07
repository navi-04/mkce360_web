// Building interiors: enter with a fade, one floor at a time (corridor and rooms), stairs and lift change floors,
// door and sign taps open a room card, exit puts the viewer back outside at the door.
// Geometry comes from plan.js (pure data); everything here is merged into a handful of meshes per floor.
import * as THREE from 'three';
import { PLAYER } from '../config.js';
import { Collider } from '../modes/collision.js';
import { boxGeo, flatQuad, signQuad, merge, paint, place } from '../world/geo.js';
import { graniteFloor, interiorWall, ceilingTile, signAtlas } from '../world/textures.js';
import { buildPlan, floorShortLabel, floorLabel, DOOR, WALL_T } from './plan.js';

const DEG = Math.PI / 180;
const WALL_V = 3.4; // the wall texture is drawn for a 3.4 m storey
const INDOOR = { bg: 0x1e232a, hemi: 1.45, sun: 0.5, fogNear: 40, fogFar: 140 };
const PROMPT_R = 2.4;
const EXIT_R = 3.0;

/** box between two corners; uv follow world metres so the brown dado stays 1 m high on every wall */
function slabBox(s) {
  const w = s.x1 - s.x0, h = s.y1 - s.y0, d = s.z1 - s.z0;
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.translate((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, (s.z0 + s.z1) / 2);
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (Math.abs(nor.getX(i)) > 0.5) uv.setXY(i, z / 2, y / WALL_V);
    else if (Math.abs(nor.getZ(i)) > 0.5) uv.setXY(i, x / 2, y / WALL_V);
    else uv.setXY(i, x / 2, z / 2);
  }
  return paint(g, 0xffffff);
}

const box = (cx, cz, w, d, h, y, color, rotY = 0) => {
  const g = boxGeo(w, h, d, { y });
  place(g, cx, 0, cz, rotY);
  return paint(g, color);
};

export class Interiors {
  constructor(app) {
    this.app = app;
    this.active = false;
    this.buildingId = null;
    this.level = 0;
    this.floors = new Map(); // `${buildingId}:${level}` -> built floor
    this.clock = () => new Date(); // overridable in tests
    this.prompt = null;
    this._listeners = new Set();
    this._saved = null;

    const world = app.world;
    this.group = new THREE.Group();
    this.group.name = 'interior';
    this.group.visible = false;
    world.scene.add(this.group);

    this.mats = {
      wall: new THREE.MeshLambertMaterial({ map: interiorWall(), vertexColors: true }),
      floor: new THREE.MeshLambertMaterial({ map: graniteFloor(), vertexColors: true }),
      ceiling: new THREE.MeshLambertMaterial({ map: ceilingTile(), vertexColors: true }),
      detail: new THREE.MeshLambertMaterial({ vertexColors: true }),
    };
    this.mats.wall.map.wrapS = this.mats.wall.map.wrapT = THREE.RepeatWrapping;
    this.pickMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });

    // Hidden stand-ins so the start-up shader precompile covers every material the interiors will use.
    const warm = new THREE.Group();
    warm.position.y = -200;
    const tiny = () => paint(boxGeo(0.01, 0.01, 0.01), 0xffffff);
    for (const m of Object.values(this.mats)) warm.add(new THREE.Mesh(tiny(), m));
    const sign = signAtlas([{ text: '0', style: 'green' }]);
    this.warmSign = new THREE.MeshBasicMaterial({ map: sign.texture, side: THREE.DoubleSide });
    warm.add(new THREE.Mesh(signQuad(0.01, 0.01), this.warmSign));
    this.group.add(warm);
    warm.visible = true;
  }

  // ---------- data ----------

  building(id = this.buildingId) {
    return this.app.data.buildings.find((b) => b.id === id) ?? null;
  }

  has(id) {
    return !!this.building(id)?.floorPlans?.length;
  }

  get floorPlans() {
    return this.building()?.floorPlans ?? [];
  }

  get currentFloor() {
    return this.floorPlans.find((f) => f.level === this.level) ?? null;
  }

  get current() {
    return this.active ? this.floors.get(`${this.buildingId}:${this.level}`) ?? null : null;
  }

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  emit(type = 'change', data = null) {
    for (const fn of this._listeners) fn(type, data, this);
  }

  // ---------- building a floor ----------

  _floor(buildingId, level) {
    const key = `${buildingId}:${level}`;
    if (this.floors.has(key)) return this.floors.get(key);
    const b = this.building(buildingId);
    const floor = b.floorPlans.find((f) => f.level === level);
    const plan = buildPlan(floor);
    const H = plan.height;
    const o = plan.outline;
    const group = new THREE.Group();
    group.name = `floor-${level}`;
    group.visible = false;

    // walls (merged) and the lintels over the doors
    const wall = new THREE.Mesh(merge(plan.slabs.map(slabBox)), this.mats.wall);
    wall.name = 'walls';
    group.add(wall);

    // floor and ceiling
    const cx = (o.x0 + o.x1) / 2, cz = (o.z0 + o.z1) / 2, W = o.x1 - o.x0, D = o.z1 - o.z0;
    const fl = flatQuad(W, D, 0, W / 1.6, D / 1.6);
    fl.translate(cx, 0, cz);
    const floorMesh = new THREE.Mesh(paint(fl, 0xffffff), this.mats.floor);
    floorMesh.name = 'floor';
    const ce = flatQuad(W, D, 0, W, D);
    ce.rotateX(Math.PI); // face down
    ce.translate(cx, H, cz);
    const ceilMesh = new THREE.Mesh(paint(ce, 0xffffff), this.mats.ceiling);
    ceilMesh.name = 'ceiling';
    group.add(floorMesh, ceilMesh);

    // details: doors, windows, furniture, stairs, lift, lamps, entrance
    const det = [];
    const along = (nx, nz) => [-nz, nx]; // unit vector along the wall
    for (const d of plan.doors) {
      const [ax, az] = along(d.nx, d.nz);
      const jamb = (sgn) => box(d.x + ax * sgn * (DOOR.w / 2 + 0.04) + d.nx * 0.1, d.z + az * sgn * (DOOR.w / 2 + 0.04) + d.nz * 0.1, ax !== 0 ? 0.08 : 0.16, az !== 0 ? 0.08 : 0.16, DOOR.h, 0, 0x3f5f70);
      det.push(jamb(-1), jamb(1));
      // door leaf, swung open into the room so the opening stays clear
      const hinge = { x: d.x - ax * (DOOR.w / 2 - 0.03), z: d.z - az * (DOOR.w / 2 - 0.03) };
      const lx = hinge.x - d.nx * 0.55, lz = hinge.z - d.nz * 0.55;
      det.push(box(lx, lz, ax !== 0 ? 0.05 : 1.08, az !== 0 ? 0.05 : 1.08, DOOR.h - 0.08, 0, 0x4f7488));
    }
    for (const w of plan.windows) {
      const px = w.x + w.nx * (WALL_T / 2 + 0.02), pz = w.z + w.nz * (WALL_T / 2 + 0.02);
      const horiz = w.nz !== 0; // window on a wall running along x
      det.push(box(px, pz, horiz ? w.w : 0.05, horiz ? 0.05 : w.w, w.h, w.y, 0x9ec7dc));
      det.push(box(px + w.nx * 0.02, pz + w.nz * 0.02, horiz ? w.w + 0.14 : 0.05, horiz ? 0.05 : w.w + 0.14, 0.07, w.y - 0.07, 0x4b6a5c));
      det.push(box(px + w.nx * 0.02, pz + w.nz * 0.02, horiz ? w.w + 0.14 : 0.05, horiz ? 0.05 : w.w + 0.14, 0.07, w.y + w.h, 0x4b6a5c));
      det.push(box(px + w.nx * 0.02, pz + w.nz * 0.02, horiz ? 0.06 : 0.05, horiz ? 0.05 : 0.06, w.h, w.y, 0x4b6a5c));
    }
    for (const f of plan.furniture) det.push(box(f.x, f.z, f.w, f.d, f.h, f.y, f.color));

    // stairs: a rising block of steps with half-height side walls; lift: a door in a shaft
    for (const s of plan.stairs) {
      const b = s.bounds, n = 10, run = (b.x1 - b.x0) / n;
      for (let i = 0; i < n; i++) {
        const x1 = b.x1 - i * run, h = 0.22 * (i + 1);
        det.push(box(x1 - run / 2, (b.z0 + b.z1) / 2, run, b.z1 - b.z0 - 0.5, h, 0, i % 2 ? 0xa9a59a : 0xb4b0a4));
      }
      for (const zz of [b.z0 + 0.12, b.z1 - 0.12]) det.push(box((b.x0 + b.x1) / 2, zz, b.x1 - b.x0, 0.24, 1.1, 0, 0xbf8860));
      det.push(box(b.x0 + 0.15, (b.z0 + b.z1) / 2, 0.3, b.z1 - b.z0, H - 0.4, 0, 0xf0eadb)); // landing wall above the top step
    }
    for (const l of plan.lifts) {
      const b = l.bounds;
      det.push(box((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, b.x1 - b.x0, b.z1 - b.z0, H - 0.3, 0, 0xcfd4d8));
      det.push(box(b.x1 + 0.03, (b.z0 + b.z1) / 2, 0.06, 1.3, DOOR.h, 0, 0xaeb7be));
      det.push(box(b.x1 + 0.05, (b.z0 + b.z1) / 2, 0.02, 0.04, DOOR.h, 0, 0x6e7880));
    }
    // ceiling lights over the corridor, rooms and lobbies
    for (let x = o.x0 + 3; x < o.x1; x += 4.5) det.push(box(x, 0, 1.2, 0.35, 0.06, H - 0.06, 0xfff8e6));
    for (const r of floor.rooms) {
      const rc = { x: (r.bounds.x0 + r.bounds.x1) / 2, z: (r.bounds.z0 + r.bounds.z1) / 2 };
      for (const dx of [-2, 2]) det.push(box(rc.x + dx, rc.z, 1.2, 0.35, 0.06, H - 0.06, 0xfff8e6));
    }
    for (const lz of [-4, 4]) for (const lx of [o.x0 + 3, o.x1 - 3]) det.push(box(lx, lz, 1.2, 0.35, 0.06, H - 0.06, 0xfff8e6));

    // entrance door frame (ground floor)
    if (plan.entrance) {
      const e = plan.entrance, s = e.nx;
      det.push(box(e.x - s * 0.1, e.z - e.width / 2 - 0.05, 0.16, 0.1, 2.4, 0, 0x3f5f70));
      det.push(box(e.x - s * 0.1, e.z + e.width / 2 + 0.05, 0.16, 0.1, 2.4, 0, 0x3f5f70));
      det.push(box(e.x - s * 0.1, e.z, 0.16, e.width, 0.1, 2.3, 0x3f5f70));
      det.push(box(e.x - s * 0.03, e.z, 0.04, e.width - 0.1, 2.3, 0, 0xc9e3f1)); // glass doors (see-through look)
    }
    const detailMesh = new THREE.Mesh(merge(det), this.mats.detail);
    detailMesh.name = 'details';
    group.add(detailMesh);

    // signs: one atlas per floor (room numbers, stairs, lift, exit)
    const items = plan.signs.map((s) => ({ text: s.text, sub: s.sub, style: 'green' }));
    const extra = [];
    for (const s of plan.stairs) {
      const b = s.bounds;
      extra.push({ text: s.label ?? 'Stairs', style: 'green', x: b.x1 + 0.03, y: 2.55, z: (b.z0 + b.z1) / 2, nx: 1, nz: 0, w: 1.6, h: 0.3, id: `stairs:${s.id}` });
    }
    for (const l of plan.lifts) {
      const b = l.bounds;
      extra.push({ text: l.label ?? 'Lift', style: 'green', x: b.x1 + 0.05, y: 2.55, z: (b.z0 + b.z1) / 2, nx: 1, nz: 0, w: 1.6, h: 0.3, id: `lift:${l.id}` });
    }
    if (plan.entrance) {
      const e = plan.entrance;
      extra.push({ text: 'EXIT', style: 'green', x: e.x - e.nx * 0.25, y: 2.7, z: e.z, nx: -e.nx, nz: 0, w: 1.6, h: 0.3, id: 'exit' });
    }
    const all = [...plan.signs, ...extra];
    const atlas = signAtlas([...items, ...extra.map((x) => ({ text: x.text, style: x.style }))]);
    const geos = all.map((s, i) => {
      const g = signQuad(s.w, s.h, atlas.uv[i]);
      g.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.atan2(s.nx, s.nz)));
      g.translate(s.x, s.y - s.h / 2, s.z);
      return g;
    });
    const signMesh = new THREE.Mesh(merge(geos), new THREE.MeshBasicMaterial({ map: atlas.texture, side: THREE.DoubleSide }));
    signMesh.name = 'signs';
    group.add(signMesh);

    // invisible pick volumes for doors, signs and the exit
    const picks = [];
    const pk = (p, data) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), this.pickMat);
      m.position.set(p.x, p.y, p.z);
      if (p.nx) m.rotation.y = Math.atan2(p.nx, p.nz);
      m.visible = false;
      m.userData = data;
      group.add(m);
      picks.push(m);
    };
    for (const p of plan.picks) pk(p, { roomId: p.roomId, kind: p.kind });
    if (plan.entrance) pk({ x: plan.entrance.x - 0.2 * plan.entrance.nx, y: 1.2, z: plan.entrance.z, w: 0.6, h: 2.4, d: plan.entrance.width + 0.4 }, { kind: 'exit' });

    const built = {
      level, floor, plan, group, picks,
      collider: new Collider(plan.colliders, plan.boundary),
      rooms: new Map(floor.rooms.map((r) => [r.id, r])),
    };
    this.group.add(group);
    this.floors.set(key, built);
    return built;
  }

  // ---------- enter / exit / floors ----------

  async enter(buildingId, { level = 0 } = {}) {
    const app = this.app;
    if (this.active || !this.has(buildingId)) return false;
    app.nav.end();
    app.navUi.closeSheets();
    if (app.mode !== 'walk') {
      const f = app.world.doorFrames.find((d) => d.id === buildingId);
      await app.setMode('walk', f ? { spawn: { x: f.x + f.nx * 2.6, z: f.z + f.nz * 2.6, yaw: Math.atan2(f.nx, f.nz) } } : undefined); // facing the door
    }
    const built = this._floor(buildingId, level);
    await app.hud.transition(() => this._swapIn(buildingId, built, built.plan.spawn), app.reducedMotion);
    return true;
  }

  _swapIn(buildingId, built, spawn) {
    const app = this.app, walk = app.walk, world = app.world;
    this._saved = { collider: walk.collider, onTap: walk.onTap, onRawTap: walk.onRawTap, pos: { x: walk.pos.x, z: walk.pos.z }, yaw: walk.yaw };
    this.buildingId = buildingId;
    this.level = built.level;
    this.active = true;
    world.setInterior(true, INDOOR);
    this.group.visible = true;
    built.group.visible = true;
    walk.collider = built.collider;
    walk.onRawTap = (e) => this._rawTap(e);
    this._place(spawn);
    app.hud.root.dataset.interior = '1';
    app.hud.sync();
    this.emit('enter');
  }

  _place({ x, z, yaw }) {
    const w = this.app.walk;
    w.pos.x = x;
    w.pos.z = z;
    w.collider.resolve(w.pos, PLAYER.radius);
    w.vel.x = w.vel.z = 0;
    w.yaw = yaw;
    w.pitch = 0;
    w.cancelTarget();
    w._apply(0);
  }

  /** Leave the building. `immediate`: no fade (used when another mode switch already fades). */
  async exit({ immediate = false } = {}) {
    if (!this.active) return;
    const app = this.app;
    const swap = () => this._swapOut();
    if (immediate) swap();
    else await app.hud.transition(swap, app.reducedMotion);
  }

  _swapOut() {
    const app = this.app, walk = app.walk, world = app.world;
    this.current?.group && (this.current.group.visible = false);
    this.group.visible = false;
    world.setInterior(false);
    walk.collider = this._saved.collider;
    walk.onTap = this._saved.onTap;
    walk.onRawTap = this._saved.onRawTap ?? null;
    const f = world.doorFrames.find((d) => d.id === this.buildingId);
    const b = this.building();
    const out = f ? { x: f.x + f.nx * 2.6, z: f.z + f.nz * 2.6 } : { x: b.doorPosition.x, z: b.doorPosition.z };
    // facing away from the door, as if you had just stepped out
    const w = walk;
    w.pos.x = out.x;
    w.pos.z = out.z;
    w.collider.resolve(w.pos, PLAYER.radius);
    w.vel.x = w.vel.z = 0;
    w.yaw = f ? Math.atan2(-f.nx, -f.nz) : 0;
    w.pitch = -6 * DEG;
    w.cancelTarget();
    w._apply(0);
    this.active = false;
    this.prompt = null;
    delete app.hud.root.dataset.interior;
    app.hud.sync();
    this.emit('exit');
  }

  /** Go to another floor. via: 'stairs' | 'lift' | 'selector' (the lift landing). */
  async goToFloor(level, via = 'selector') {
    if (!this.active || level === this.level || !this.floorPlans.some((f) => f.level === level)) return false;
    const app = this.app;
    const built = this._floor(this.buildingId, level);
    const spot = via === 'stairs' ? built.plan.stairs[0] : built.plan.lifts[0] ?? built.plan.stairs[0];
    const swap = () => {
      this.current.group.visible = false;
      this.level = level;
      built.group.visible = true;
      app.walk.collider = built.collider;
      this._place({ x: spot.landing.x, z: spot.landing.z, yaw: -Math.PI / 2 });
      this.prompt = null;
      this.emit('floor');
    };
    await app.hud.transition(swap, app.reducedMotion);
    return true;
  }

  // ---------- taps and prompts ----------

  /** screen tap: door or sign -> room card; the exit door -> leave. Returns true when handled. */
  _rawTap(e) {
    const cur = this.current;
    if (!cur) return false;
    const app = this.app;
    const r = app.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, app.camera);
    ray.far = 14;
    const hit = ray.intersectObjects(cur.picks, false)[0];
    if (!hit) return false;
    const d = hit.object.userData;
    if (d.kind === 'exit') {
      this.exit();
      return true;
    }
    this.emit('room', { room: cur.rooms.get(d.roomId), floor: cur.floor });
    return true;
  }

  openRoom(roomId) {
    const cur = this.current;
    const room = cur?.rooms.get(roomId);
    if (room) this.emit('room', { room, floor: cur.floor });
  }

  /** viewer walks to the corridor in front of a room door */
  walkToRoom(roomId) {
    const cur = this.current;
    const d = cur?.plan.doors.find((x) => x.roomId === roomId);
    if (d) this.app.walk.walkTo(d.x + d.nx * 1.3, d.z + d.nz * 1.3);
  }

  update() {
    if (!this.active) return;
    const cur = this.current;
    if (!cur) return;
    const p = this.app.walk.pos;
    let best = null, bd = Infinity;
    const consider = (kind, id, x, z, r) => {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < r && d < bd) { bd = d; best = { kind, id }; }
    };
    for (const s of cur.plan.stairs) consider('stairs', s.id, s.landing.x, s.landing.z, PROMPT_R);
    for (const l of cur.plan.lifts) consider('lift', l.id, l.landing.x, l.landing.z, PROMPT_R);
    if (cur.plan.entrance) consider('exit', 'exit', cur.plan.entrance.x, cur.plan.entrance.z, EXIT_R);
    const key = best ? `${best.kind}:${best.id}` : '';
    if (key !== (this.prompt ? `${this.prompt.kind}:${this.prompt.id}` : '')) {
      this.prompt = best;
      this.emit('prompt');
    }
  }

  /** floors reachable with the stairs (one up or down) */
  stairTargets() {
    const levels = this.floorPlans.map((f) => f.level).sort((a, b) => a - b);
    const i = levels.indexOf(this.level);
    return { up: levels[i + 1] ?? null, down: levels[i - 1] ?? null };
  }

  floorInfo(level) {
    const f = this.floorPlans.find((x) => x.level === level);
    return f ? { level, short: floorShortLabel(f), label: floorLabel(f), sample: !!f.sample } : null;
  }
}
