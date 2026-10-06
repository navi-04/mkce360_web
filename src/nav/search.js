// Search over buildings, points of interest and (once floor plans exist) rooms. Pure functions, no DOM.
// Everything searched comes from campus.json; the labels here are UI wording only.

export const CATEGORY_LABEL = {
  department: 'Departments',
  lab: 'Labs',
  library: 'Library',
  canteen: 'Canteens',
  parking: 'Parking',
  sports: 'Sports',
  admin: 'Admin',
  hostel: 'Hostels',
  other: 'Other',
  place: 'Places',
  room: 'Rooms',
};

export const TYPE_NOUN = {
  department: 'Academic block',
  lab: 'Laboratory',
  library: 'Library',
  canteen: 'Food',
  parking: 'Parking',
  sports: 'Sports',
  admin: 'Administration',
  hostel: 'Hostel',
  other: 'Campus facility',
};

const POINT_NOUN = {
  'room-marker': 'Inside a building',
  assembly: 'Safety point',
  well: 'Utility',
  biogas: 'Utility',
};

const CATEGORY_ORDER = ['department', 'lab', 'library', 'hostel', 'canteen', 'sports', 'parking', 'admin', 'place', 'room', 'other'];

/** lower case, no accents, letters and digits only, words separated by single spaces */
export function normalise(s) {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const floorLabel = (level) => (level === 0 ? 'Ground floor' : `Floor ${level}`);

function prepare(item, extra = '') {
  const text = normalise(`${item.title} ${item.alt ?? ''} ${extra}`);
  item.text = text;
  item.tokens = text.split(' ');
  item.squashed = text.replace(/ /g, '');
  item.titleNorm = normalise(item.title);
  return item;
}

/** nearest building (by centre) for "near X" sub-titles */
function nearestBuilding(buildings, x, z) {
  let best = null, bd = Infinity;
  for (const b of buildings) {
    const d = Math.hypot(b.position.x - x, b.position.z - z) - Math.max(b.size.w, b.size.d) / 2;
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

export function buildSearchIndex(data) {
  const items = [];
  const byId = new Map(data.buildings.map((b) => [b.id, b]));

  for (const b of data.buildings) {
    items.push(
      prepare(
        {
          id: `b:${b.id}`,
          kind: 'building',
          category: b.type,
          title: b.name,
          shortTitle: b.shortName,
          alt: b.shortName,
          subtitle: TYPE_NOUN[b.type] ?? 'Building',
          number: b.number ?? null,
          x: b.position.x,
          z: b.position.z,
          buildingId: b.id,
        },
        `${CATEGORY_LABEL[b.type] ?? ''} ${TYPE_NOUN[b.type] ?? ''} ${b.sport ?? ''} ${b.number ?? ''}`,
      ),
    );
    for (const f of b.floorPlans ?? []) {
      for (const r of f.rooms ?? []) {
        items.push(
          prepare(
            {
              id: `r:${b.id}:${r.id}`,
              kind: 'room',
              category: 'room',
              title: `${r.number} ${r.name}`.trim(),
              subtitle: `${b.shortName} · ${f.label ?? floorLabel(f.level)}`,
              number: null,
              x: b.position.x,
              z: b.position.z,
              buildingId: b.id,
              roomId: r.id,
              level: f.level,
            },
            `${r.type ?? ''} ${(r.equipment ?? []).join(' ')} ${r.department ?? ''}`,
          ),
        );
      }
    }
  }

  for (const p of data.points ?? []) {
    if (p.kind === 'solar-pv') continue; // roof equipment, not somewhere to go
    const parent = p.parent ? byId.get(p.parent) : null;
    const near = parent ?? nearestBuilding(data.buildings, p.position.x, p.position.z);
    items.push(
      prepare(
        {
          id: `p:${p.id}`,
          kind: 'point',
          category: 'place',
          title: p.name,
          subtitle: parent ? `In ${parent.shortName}` : near ? `${POINT_NOUN[p.kind] ?? 'Place'} · near ${near.shortName}` : (POINT_NOUN[p.kind] ?? 'Place'),
          number: p.number ?? null,
          x: p.position.x,
          z: p.position.z,
          buildingId: parent?.id ?? null,
          pointId: p.id,
        },
        `${CATEGORY_LABEL.place} ${p.kind}`,
      ),
    );
  }

  const present = new Set(items.map((i) => i.category));
  const categories = CATEGORY_ORDER.filter((c) => present.has(c)).map((c) => ({ id: c, label: CATEGORY_LABEL[c] }));
  return { items, categories };
}

/** Score one item for a query (0 = no match). Every query word has to match something. */
function score(item, qTokens, qSquashed, qRaw) {
  let total = 0;
  for (const q of qTokens) {
    let best = 0;
    for (const t of item.tokens) {
      if (t === q) best = Math.max(best, 4);
      else if (t.startsWith(q)) best = Math.max(best, 3);
      else if (q.length >= 2 && t.includes(q)) best = Math.max(best, 1.5);
    }
    if (!best && q.length >= 2 && item.squashed.includes(q)) best = 1; // "apj" inside "dr a p j abdul..."
    if (!best) return 0;
    total += best;
  }
  if (item.number != null && qRaw === String(item.number)) total += 12; // typing "7" finds legend item 7
  if (item.titleNorm.startsWith(qTokens.join(' '))) total += 3;
  if (item.squashed.includes(qSquashed)) total += 1;
  return total;
}

/**
 * @param {{items:any[]}} index
 * @param {string} query
 * @param {{category?:string, from?:{x:number,z:number}, limit?:number}} opts
 */
export function searchIndex(index, query, { category = 'all', from = null, limit = 80 } = {}) {
  const qNorm = normalise(query);
  const qTokens = qNorm ? qNorm.split(' ') : [];
  const qSquashed = qNorm.replace(/ /g, '');
  const dist = (it) => (from ? Math.hypot(it.x - from.x, it.z - from.z) : 0);
  const out = [];
  for (const it of index.items) {
    if (category !== 'all' && it.category !== category) continue;
    const s = qTokens.length ? score(it, qTokens, qSquashed, qNorm) : 1;
    if (s > 0) out.push({ item: it, score: s, distance: from ? dist(it) : null });
  }
  out.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (!qTokens.length && from) return a.distance - b.distance; // empty query: nearest first
    const an = a.item.number ?? 1e9, bn = b.item.number ?? 1e9;
    if (an !== bn) return an - bn;
    return a.item.title.localeCompare(b.item.title);
  });
  return out.slice(0, limit);
}
