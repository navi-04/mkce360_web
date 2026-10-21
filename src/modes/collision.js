// Simple 2D collision for the walking player: a circle against oriented boxes (buildings) and
// against the campus boundary polygon (convex). Pushes the player out and so slides along walls.

/** an obstacle box with its turn worked out (a parked car is added and removed at run time, see Collider.extra) */
export const obstacle = (o) => ({ ...o, cos: Math.cos(o.rot), sin: Math.sin(o.rot) });

export class Collider {
  constructor(obbs, boundary) {
    this.obbs = obbs.map(obstacle);
    this.extra = []; // obstacles that come and go, shared by every Collider of a world (WorldGround.extras)
    // boundary: array of {x,z}; edges get an inward normal (polygon is convex)
    const pts = boundary;
    let cx = 0, cz = 0;
    for (const p of pts) { cx += p.x; cz += p.z; }
    cx /= pts.length;
    cz /= pts.length;
    this.edges = pts.map((a, i) => {
      const b = pts[(i + 1) % pts.length];
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
      let nx = -dz / len, nz = dx / len;
      if ((cx - a.x) * nx + (cz - a.z) * nz < 0) { nx = -nx; nz = -nz; }
      return { ax: a.x, az: a.z, nx, nz };
    });
  }

  /** Move `pos` ({x,z}) out of anything it overlaps. Returns true if it was moved. */
  resolve(pos, radius) {
    let moved = false;
    for (let pass = 0; pass < 3; pass++) {
      let any = false;
      const obbs = this.obbs, extra = this.extra;
      for (let i = 0; i < obbs.length; i++) if (this._push(obbs[i], pos, radius)) any = true;
      for (let i = 0; i < extra.length; i++) if (this._push(extra[i], pos, radius)) any = true;
      for (const e of this.edges) {
        const sd = (pos.x - e.ax) * e.nx + (pos.z - e.az) * e.nz;
        if (sd < radius) {
          pos.x += e.nx * (radius - sd);
          pos.z += e.nz * (radius - sd);
          any = true;
        }
      }
      if (!any) break;
      moved = true;
    }
    return moved;
  }

  /** push the circle at pos out of one box; true when it was moved */
  _push(o, pos, radius) {
    const dx = pos.x - o.cx, dz = pos.z - o.cz;
    const reach = o.hw + o.hd + radius;
    if (dx * dx + dz * dz > reach * reach) return false; // too far to touch
    // world -> local (inverse of rotation about Y by o.rot)
    let lx = dx * o.cos - dz * o.sin;
    let lz = dx * o.sin + dz * o.cos;
    const qx = Math.max(-o.hw, Math.min(o.hw, lx));
    const qz = Math.max(-o.hd, Math.min(o.hd, lz));
    const ex = lx - qx, ez = lz - qz;
    const d2 = ex * ex + ez * ez;
    if (d2 >= radius * radius) return false;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2), k = (radius - d) / d;
      lx += ex * k;
      lz += ez * k;
    } else {
      const px = o.hw - Math.abs(lx), pz = o.hd - Math.abs(lz);
      if (px < pz) lx = Math.sign(lx || 1) * (o.hw + radius);
      else lz = Math.sign(lz || 1) * (o.hd + radius);
    }
    pos.x = o.cx + lx * o.cos + lz * o.sin;
    pos.z = o.cz - lx * o.sin + lz * o.cos;
    return true;
  }

  insideBoundary(x, z, margin = 0) {
    return this.edges.every((e) => (x - e.ax) * e.nx + (z - e.az) * e.nz >= margin);
  }
}
