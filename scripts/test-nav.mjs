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

console.log('Map content (docs/satellite-candidates.png is the reference)');
const IMAGE_SET = ['apj-block', 'radhakrishnan-block', 'laboratories-shed-1', 'laboratories-shed-2', 'veda-hostel', 'muthulakshmi-reddy-hostel', 'play-ground', 'basket-ball-court', 'volley-ball-court', 'tennis-court', 'olympia-block', 'unlabelled-6', 'four-wheeler-parking', 'two-wheeler-parking', 'fuel-station'].sort();
check('only structures marked in the satellite candidate image are on the map', JSON.stringify(data.buildings.map((b) => b.id).sort()) === JSON.stringify(IMAGE_SET), data.buildings.map((b) => b.id).filter((i) => !IMAGE_SET.includes(i)).join(','));
check('image labels: 5 = west C-shaped block, 3 and 4 = the twin wings, Unlabelled-6 has no legend number', (() => {
  const g = (id) => data.buildings.find((b) => b.id === id);
  return g('veda-hostel').number === 5 && g('veda-hostel').position.x < -300 && g('laboratories-shed-1').number === 3 && g('laboratories-shed-2').number === 4 && g('laboratories-shed-1').position.x < g('laboratories-shed-2').position.x && g('unlabelled-6').number == null;
})());
check('everything else from the board is listed as unplaced, none of it has a position', data.unplaced.length >= 20 && data.unplaced.every((u) => u.position === undefined));
check('all legend numbers 1 to 33 are accounted for (mapped or unplaced)', (() => {
  const nums = new Set([...data.buildings, ...data.unplaced.filter((u) => u.kind === 'building')].map((b) => b.number).filter((n) => n != null));
  const missing = []; for (let n = 1; n <= 33; n++) if (!nums.has(n) && ![21, 22].includes(n)) missing.push(n);
  return missing.length === 0;
})());

console.log('Search');
const index = buildSearchIndex(data);
const first = (q, o) => searchIndex(index, q, o)[0]?.item;
check('"kalam" finds block 1', first('kalam')?.buildingId === 'apj-block');
check('"apj" finds block 1 (dots in the printed name)', first('apj')?.buildingId === 'apj-block');
check('"1" finds legend item 1 first', first('1')?.buildingId === 'apj-block');
check('"7" finds the Muthulakshmi Reddy hostel', first('7')?.buildingId === 'muthulakshmi-reddy-hostel');
check('"hostel" lists the mapped hostels first, then the unmapped one', (() => {
  const r = searchIndex(index, 'hostel').map((x) => x.item);
  return r.length === 3 && r.slice(0, 2).every((i) => i.kind === 'building') && r[2].kind === 'unplaced';
})());
check('category filter: sports only', searchIndex(index, '', { category: 'sports' }).every((r) => r.item.category === 'sports'));
check('typo-free partial words work ("radha")', first('radha')?.buildingId === 'radhakrishnan-block');
check('a legend item that is not mapped yet is still findable ("boys mess") and says so', (() => { const r = first('boys mess'); return r?.kind === 'unplaced' && /Not mapped yet/.test(r.subtitle); })());
check('unmapped items have no distance and sort after mapped places', (() => {
  const r = searchIndex(index, '', { from: { x: -3, z: 0 }, limit: 500 });
  const firstU = r.findIndex((x) => x.item.kind === 'unplaced');
  return r.filter((x) => x.item.kind === 'unplaced').every((x) => x.distance === null) && r.slice(firstU).every((x) => x.item.kind === 'unplaced');
})());
check('no route can be planned to an unmapped item', planRoute(data, { gate: 'main-gate' }, { pointId: 'well-48' }) === null && planRoute(data, { gate: 'main-gate' }, { buildingId: 'canteen' }) === null);
check('no match gives an empty list', searchIndex(index, 'zzzzqq').length === 0);
check('empty query lists everything, nearest first when a position is given', (() => {
  const r = searchIndex(index, '', { from: { x: -3, z: 0 }, limit: 500 });
  const placed = r.filter((x) => x.distance !== null);
  return r.length === index.items.length && placed[0].distance <= placed[placed.length - 1].distance;
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
const toPoint = planRoute(data, { gate: 'main-gate' }, { x: -90, z: 110, label: 'Test spot' });
check('route to a free spot ends at the spot', !!toPoint && Math.hypot(toPoint.poly.p.at(-1).x + 90, toPoint.poly.p.at(-1).z - 110) < 0.5);
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
