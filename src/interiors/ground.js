// Where a viewer (walking or driving) stands in the world: the height of the ground under them, which floor of a building they
// are on, and the walls that stop them. A building is part of the world; there is no entering or leaving, only a floor under
// your feet. Pure code (no three.js), so it runs in the Node tests and in the browser.
import { buildPlan, PLINTH } from './plan.js';
import { Collider } from '../modes/collision.js';

const DEG = Math.PI / 180;
export const STEP_UP = 0.6; // the highest step a viewer climbs without a ramp (the steps of a porch are 0.15 m, the plinth 0.45 m)
export const PORCH_STEPS = 0.9; // the porch steps down over this many metres

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** the surface the viewer stands on: the highest one that is not more than a step above the height they are at */
export function pickSurface(surfaces, yHint) {
  let best = -Infinity, low = Infinity;
  for (const y of surfaces) {
    if (y <= yHint + STEP_UP && y > best) best = y;
    if (y < low) low = y;
  }
  return best === -Infinity ? low : best;
}

/** the porch of a door: three low steps up to a platform at the height of the ground floor (doorFrames carry `reach` and `half`) */
export function porchHeight(frames, x, z) {
  for (const f of frames) {
    if (!f.reach) continue;
    const dx = x - f.x, dz = z - f.z;
    const out = dx * f.nx + dz * f.nz; // away from the door
    const lat = Math.abs(dx * f.nz - dz * f.nx); // along the face
    if (lat > f.half + 0.3 || out < -0.5 || out > f.reach) continue;
    const from = f.reach - PORCH_STEPS;
    return out <= from ? PLINTH : PLINTH * clamp((f.reach - out) / PORCH_STEPS, 0, 1);
  }
  return 0;
}

/**
 * One building with floor plans, placed in the world (position and rotation of the building). Its own frame is the one of the floor
 * plans: x east, z south, origin at the middle of the building, before the rotation.
 */
export class BuildingPhysics {
  constructor(building) {
    this.building = building;
    this.id = building.id;
    const floors = [...building.floorPlans].sort((a, b) => a.level - b.level);
    this.floors = floors; // the data of every floor, by level
    this.levels = floors.length;
    this.plans = floors.map((f) => buildPlan(f, { levels: this.levels }));
    this.H = this.plans[0].height;
    this.outline = this.plans[0].outline;
    this._key = '';
    this._cols = new Map();
    this.refresh();
  }

  /** follow the building if it was moved or turned (calibration) */
  refresh() {
    const b = this.building;
    const key = `${b.position.x}|${b.position.z}|${b.rotationDeg}`;
    if (key === this._key) return false;
    this._key = key;
    const r = (b.rotationDeg ?? 0) * DEG;
    this.cos = Math.cos(r);
    this.sin = Math.sin(r);
    this.rotY = -r; // the rotation of its group in the scene (three.js turns the other way)
    this._cols.clear();
    return true;
  }

  toLocal(x, z) {
    const dx = x - this.building.position.x, dz = z - this.building.position.z;
    return { x: dx * this.cos + dz * this.sin, z: -dx * this.sin + dz * this.cos };
  }

  toWorld(lx, lz) {
    return { x: this.building.position.x + lx * this.cos - lz * this.sin, z: this.building.position.z + lx * this.sin + lz * this.cos };
  }

  /** metres inside the outline of the building (negative outside) */
  depth(x, z) {
    const l = this.toLocal(x, z), o = this.outline;
    return Math.min(l.x - o.x0, o.x1 - l.x, l.z - o.z0, o.z1 - l.z);
  }

  inside(x, z, margin = 0) {
    return this.depth(x, z) > -margin;
  }

  baseY(level) {
    return PLINTH + level * this.H;
  }

  /** the floor a viewer at height y is on: a viewer within 0.6 m below a floor already counts as being on it */
  levelAt(y) {
    return clamp(Math.floor((y - PLINTH + 0.6) / this.H + 1e-9), 0, this.levels - 1);
  }

  /** the height of the ground under (x, z) for a viewer at height yHint, or null when (x, z) is not inside the building */
  heightAt(x, z, yHint) {
    const l = this.toLocal(x, z), o = this.outline;
    if (!(l.x >= o.x0 && l.x <= o.x1 && l.z >= o.z0 && l.z <= o.z1)) return null;
    const all = [];
    this.plans.forEach((p, i) => {
      const base = this.baseY(i);
      for (const h of p.heightsAt(l.x, l.z)) all.push(base + h);
    });
    return all.length ? pickSurface(all, yHint) : null;
  }

  /** the obstacles of one floor in world coordinates, as boxes {cx, cz, hw, hd, rot} for the Collider */
  colliders(level) {
    let list = this._cols.get(level);
    if (!list) {
      list = this.plans[level].colliders.map((c) => {
        const p = this.toWorld(c.cx, c.cz);
        return { id: c.id, cx: p.x, cz: p.z, hw: c.hw, hd: c.hd, rot: this.rotY };
      });
      this._cols.set(level, list);
    }
    return list;
  }
}

/**
 * Everything a viewer stands on and bumps into: the open campus plus any number of buildings. `outdoor` are the obstacles of the
 * campus (buildings that cannot be entered, and so on).
 */
export class WorldGround {
  constructor({ buildings = [], doorFrames = [], outdoor = [], boundary }) {
    this.buildings = buildings;
    this.doorFrames = doorFrames;
    this.outdoor = outdoor;
    this.boundary = boundary;
    this.extras = []; // obstacles that come and go (a parked car), shared by every Collider this makes
    this._sets = new Map();
  }

  setOutdoor(outdoor, doorFrames) {
    this.outdoor = outdoor;
    if (doorFrames) this.doorFrames = doorFrames;
    this._sets.clear();
  }

  /** the building the point is inside, or null */
  buildingAt(x, z) {
    for (const b of this.buildings) if (b.inside(x, z)) return b;
    return null;
  }

  heightAt(x, z, yHint = 0) {
    for (const b of this.buildings) {
      const h = b.heightAt(x, z, yHint);
      if (h !== null) return h;
    }
    return porchHeight(this.doorFrames, x, z);
  }

  /** the floor of the building the viewer is on, or 0 in the open */
  levelAt(x, z, y) {
    const b = this.buildingAt(x, z);
    return b ? b.levelAt(y) : 0;
  }

  /**
   * The Collider for a viewer at (x, z, y): the campus plus the walls of the floor they are on in the building that is near.
   * One Collider per building and floor, built the first time and kept.
   */
  colliderFor(x, z, y) {
    let near = null;
    for (const b of this.buildings) if (b.inside(x, z, 6)) { near = b; break; }
    const level = near ? near.levelAt(y) : 0;
    const key = near ? `${near.id}:${level}:${near._key}` : 'open';
    let c = this._sets.get(key);
    if (!c) {
      // one set per building: its floor and the floors of the others on the ground (their outer walls)
      const list = [...this.outdoor];
      for (const b of this.buildings) list.push(...b.colliders(b === near ? level : 0));
      c = new Collider(list, this.boundary);
      c.extra = this.extras;
      this._sets.set(key, c);
    }
    return c;
  }
}
