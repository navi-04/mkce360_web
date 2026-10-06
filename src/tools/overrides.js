// Calibration edits are kept in localStorage (try/catch everywhere) so a reload keeps them,
// and are applied on top of campus.json only when the page is opened with ?calibrate=1.
import { relinkDoor } from '../data/graph.js';

const KEY = 'mkce360.calibration.v1';

export function loadOverrides() {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return o && typeof o === 'object' ? o : { buildings: {}, points: {} };
  } catch {
    return { buildings: {}, points: {} };
  }
}

export function saveOverrides(o) {
  try {
    localStorage.setItem(KEY, JSON.stringify(o));
    return true;
  } catch {
    return false;
  }
}

export function clearOverrides() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export const EDITABLE = ['position', 'size', 'rotationDeg', 'doorPosition'];

/** Apply saved edits to `data` (mutates and returns it). Doors that moved are re-linked to the path graph. */
export function applyOverrides(data) {
  const o = loadOverrides();
  for (const b of data.buildings) {
    const e = o.buildings?.[b.id];
    if (!e) continue;
    for (const k of EDITABLE) if (e[k] !== undefined) b[k] = structuredClone(e[k]);
    if (e.doorPosition) relinkDoor(data, b);
    b.verified = { ...b.verified, position: true, size: e.size ? true : b.verified.size, door: e.doorPosition ? true : b.verified.door };
  }
  for (const p of data.points) {
    const e = o.points?.[p.id];
    if (e?.position) p.position = structuredClone(e.position);
  }
  return data;
}
