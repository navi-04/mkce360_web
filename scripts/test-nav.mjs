#!/usr/bin/env node
// Unit checks for search and routing on the real campus.json (no browser needed): npm run test:nav
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(resolve(root, 'src/data/campus.json'), 'utf8'));
const { buildSearchIndex, searchIndex } = await import(pathToFileURL(resolve(root, 'src/nav/search.js')).href);
const { planRoute, hintAt, formatDistance, formatDuration } = await import(pathToFileURL(resolve(root, 'src/nav/route.js')).href);

let passed = 0;
const failed = [];
const check = (name, ok, detail = '') => {
  if (ok) { passed++; console.log(`  ok    ${name}${detail ? '  (' + detail + ')' : ''}`); }
  else { failed.push(name); console.log(`  FAIL  ${name}${detail ? '  (' + detail + ')' : ''}`); }
};

console.log('Search');
const index = buildSearchIndex(data);
const first = (q, o) => searchIndex(index, q, o)[0]?.item;
check('"kalam" finds block 1', first('kalam')?.buildingId === 'apj-block');
check('"apj" finds block 1 (dots in the printed name)', first('apj')?.buildingId === 'apj-block');
check('"1" finds legend item 1 first', first('1')?.buildingId === 'apj-block');
check('"7" finds the Muthulakshmi Reddy hostel', first('7')?.buildingId === 'muthulakshmi-reddy-hostel');
check('"hostel" lists all hostels', searchIndex(index, 'hostel').filter((r) => r.item.category === 'hostel').length === data.buildings.filter((b) => b.type === 'hostel').length);
check('category filter: sports only', searchIndex(index, '', { category: 'sports' }).every((r) => r.item.category === 'sports'));
check('typo-free partial words work ("radha")', first('radha')?.buildingId === 'radhakrishnan-block');
check('multi-word query ("boys mess")', first('boys mess')?.buildingId === 'boys-mess');
check('no match gives an empty list', searchIndex(index, 'zzzzqq').length === 0);
check('empty query lists everything, nearest first when a position is given', (() => {
  const r = searchIndex(index, '', { from: { x: -3, z: 0 }, limit: 500 });
  return r.length === index.items.length && r[0].distance <= r[r.length - 1].distance;
})());
check('categories only for types that exist', index.categories.every((c) => index.items.some((i) => i.category === c.id)));
check('solar PV markers are not search results', !index.items.some((i) => i.pointId?.startsWith('solar')));
check('gym marker is searchable and sits in a building', (() => { const g = first('gym'); return g?.kind === 'point' && g.buildingId === 'olympia-block'; })());

console.log('Routes');
const gateRoute = planRoute(data, { gate: 'main-gate' }, { buildingId: 'apj-block' });
check('main gate to block 1 exists', !!gateRoute);
check('gate to block 1 door is about 102 m (user supplied)', Math.abs(gateRoute.length - 102) < 4, `${gateRoute.length.toFixed(1)} m`);
check('walking time at 1.4 m/s', Math.abs(gateRoute.duration - gateRoute.length / 1.4) < 0.01, formatDuration(gateRoute.duration));
check('route ends at the door', Math.hypot(gateRoute.poly.p.at(-1).x - data.buildings[0].doorPosition.x, gateRoute.poly.p.at(-1).z - data.buildings[0].doorPosition.z) < 0.5);
check('steps start with a heading and end with arrival', gateRoute.steps[0].text.startsWith('Head ') && gateRoute.steps.at(-1).kind === 'arrive');

let worst = 0, bad = [];
for (const b of data.buildings) {
  for (const g of ['main-gate', 'side-gate']) {
    const r = planRoute(data, { gate: g }, { buildingId: b.id });
    if (!r || !Number.isFinite(r.length)) { bad.push(`${g} -> ${b.id}`); continue; }
    worst = Math.max(worst, r.length);
    if (r.steps.some((s) => !Number.isFinite(s.s))) bad.push(`${g} -> ${b.id} (bad step)`);
  }
}
check('every building is reachable from both gates', bad.length === 0, bad.slice(0, 3).join('; '));
check('no route is absurdly long', worst < 900, `longest ${worst.toFixed(0)} m`);

const far = planRoute(data, { x: -190, z: 120, label: 'Test spot' }, { buildingId: 'olympia-block' });
check('route from a spot off the paths connects through the nearest path', !!far && far.length > 40, far ? `${far.length.toFixed(0)} m` : 'none');
const same = planRoute(data, { x: data.buildings[0].doorPosition.x, z: data.buildings[0].doorPosition.z }, { buildingId: 'apj-block' });
check('already at the door gives a (near) zero-length route', !!same && same.length < 6, same ? `${same.length.toFixed(1)} m` : 'none');
const toPoint = planRoute(data, { gate: 'main-gate' }, { pointId: 'well-48' });
check('route to a free point (well) ends at the point', !!toPoint && Math.hypot(toPoint.poly.p.at(-1).x + 215, toPoint.poly.p.at(-1).z - 38) < 0.5);
const toRoom = planRoute(data, { gate: 'main-gate' }, { pointId: 'gym-21' });
check('route to a marker inside a building goes to that building door', !!toRoom && toRoom.to.buildingId === 'olympia-block');

console.log('Guidance');
const r = planRoute(data, { gate: 'main-gate' }, { buildingId: 'radhakrishnan-block' });
check('longer route has turn instructions', r.maneuvers.length >= 1, r.steps.map((s) => s.text).join(' > '));
let prev = -1, monotonic = true, kinds = new Set();
for (let s = 0; s <= r.length; s += 1) {
  const h = hintAt(r, s);
  kinds.add(h.kind);
  if (!Number.isFinite(h.remaining) || !h.text) monotonic = false;
  if (h.remaining > prev && prev >= 0) monotonic = false;
  prev = h.remaining;
}
check('hints stay finite and remaining distance only decreases', monotonic);
check('hints cover straight, turn and arrive', kinds.has('straight') && kinds.has('arrive') && (r.maneuvers.length === 0 || kinds.has('turn')), [...kinds].join(','));
check('distance formatting', formatDistance(102.4) === '100 m' || formatDistance(102.4) === '102 m' || formatDistance(102.4) === '100 m', formatDistance(102.4));

console.log(`\n${passed} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
