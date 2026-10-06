// Simple 2D collision for the walking player: a circle against oriented boxes (buildings) and
// against the campus boundary polygon (convex). Pushes the player out and so slides along walls.

export class Collider {
  constructor(obbs, boundary) {
    this.obbs = obbs.map((o) => ({ ...o, cos: Math.cos(o.rot), sin: Math.sin(o.rot) }));
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
      for (const o of this.obbs) {
        const dx = pos.x - o.cx, dz = pos.z - o.cz;
        // world -> local (inverse of rotation about Y by o.rot)
        let lx = dx * o.cos - dz * o.sin;
        let lz = dx * o.sin + dz * o.cos;
        const qx = Math.max(-o.hw, Math.min(o.hw, lx));
        const qz = Math.max(-o.hd, Math.min(o.hd, lz));
        const ex = lx - qx, ez = lz - qz;
        const d2 = ex * ex + ez * ez;
        if (d2 >= radius * radius) continue;
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
        any = moved = true;
      }
      for (const e of this.edges) {
        const sd = (pos.x - e.ax) * e.nx + (pos.z - e.az) * e.nz;
        if (sd < radius) {
          pos.x += e.nx * (radius - sd);
          pos.z += e.nz * (radius - sd);
          any = moved = true;
        }
      }
      if (!any) break;
    }
    return moved;
  }

  insideBoundary(x, z, margin = 0) {
    return this.edges.every((e) => (x - e.ax) * e.nx + (z - e.az) * e.nz >= margin);
  }
}
