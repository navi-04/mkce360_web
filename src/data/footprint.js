// Footprint geometry shared by the app (picking, routing checks) and scripts/validate-campus.mjs.
// A building is a rotated rectangle; `parts` (rectangles in the building's own axes) or a `ring` carve out its real shape.

const DEG = Math.PI / 180;

/** building-local coordinates of a world point (x east, z south; rotationDeg is clockwise seen from above) */
export function toLocal(b, x, z) {
  const r = (b.rotationDeg ?? 0) * DEG;
  const dx = x - b.position.x, dz = z - b.position.z;
  return { x: dx * Math.cos(r) + dz * Math.sin(r), z: -dx * Math.sin(r) + dz * Math.cos(r) };
}

/** Is the world point inside the real outline (ring or parts), with the outline pulled in by `shrink` metres? */
export function insideFootprint(b, x, z, shrink = 0) {
  const l = toLocal(b, x, z);
  const inRect = (q) => Math.abs(l.x - q.x) <= q.w / 2 - shrink && Math.abs(l.z - q.z) <= q.d / 2 - shrink;
  if (b.form === 'ring' && b.ring) {
    const t = b.ring.thickness;
    const outer = Math.abs(l.x) <= b.size.w / 2 - shrink && Math.abs(l.z) <= b.size.d / 2 - shrink;
    const hole = Math.abs(l.x) < b.size.w / 2 - t + shrink && Math.abs(l.z) < b.size.d / 2 - t + shrink;
    return outer && !hole;
  }
  if (b.parts?.length) return b.parts.some(inRect);
  return inRect({ x: 0, z: 0, w: b.size.w, d: b.size.d });
}

/** distance from a world point to the bounding rectangle of the building (0 inside) */
export function distToBounds(b, x, z) {
  const l = toLocal(b, x, z);
  return Math.hypot(Math.max(0, Math.abs(l.x) - b.size.w / 2), Math.max(0, Math.abs(l.z) - b.size.d / 2));
}
