// Search, building cards, directions, the live navigation card and the arrival card. Plain DOM, bottom sheets.
// All campus text is inserted with textContent (never parsed as HTML).
import { buildSearchIndex, searchIndex, TYPE_NOUN } from '../nav/search.js';
import { planRoute, formatDistance, formatDuration } from '../nav/route.js';
import { TYPE_ACCENT } from '../config.js';
import { createSheets } from './sheets.js';

export const ICONS = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/>',
  straight: '<path d="M12 20V5M6.5 10.5L12 5l5.5 5.5"/>',
  start: '<path d="M12 20V5M6.5 10.5L12 5l5.5 5.5"/>',
  left: '<path d="M17 20v-7a3 3 0 0 0-3-3H6M10 5.5L6 10l4 4.5"/>',
  right: '<path d="M7 20v-7a3 3 0 0 1 3-3h8M14 5.5L18 10l-4 4.5"/>',
  'slight-left': '<path d="M16 20v-6L9 7M9 12V7h5"/>',
  'slight-right': '<path d="M8 20v-6l7-7M15 12V7h-5"/>',
  'sharp-left': '<path d="M17 20V9a3 3 0 0 0-6 0v6M8 12l3.5 4 3.5-4"/>',
  'sharp-right': '<path d="M7 20V9a3 3 0 0 1 6 0v6M10 12l3.5 4 3.5-4"/>',
  arrive: '<path d="M12 21s6-5.5 6-11a6 6 0 0 0-12 0c0 5.5 6 11 6 11z"/><circle cx="12" cy="10" r="2.2"/>',
  pause: '<path d="M9 6v12M15 6v12"/>',
  play: '<path d="M8 5l11 7-11 7z"/>',
  hand: '<circle cx="12" cy="8" r="3"/><path d="M12 11v4M7 20h10M9 20v-3h6v3"/>',
  route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h6.5a3.5 3.5 0 0 0 0-7h-5a3.5 3.5 0 0 1 0-7H16"/>',
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
  enter: '<path d="M10 17l5-5-5-5M15 12H4M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  walk: '<circle cx="13" cy="4.5" r="2"/><path d="M10 21l2.2-6.5-2.4-3 1.8-4.2 3.6 1.2 2 3.2 2.4.6M12.2 14.5l3.8 2.2 1 4.3"/>',
  door: '<path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M3 21h18M14 12v.01"/>',
  pin: '<path d="M12 21s6-5.5 6-11a6 6 0 0 0-12 0c0 5.5 6 11 6 11z"/><circle cx="12" cy="10" r="2"/>',
};
export const svg = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] ?? ''}</svg>`;

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
export function button(cls, icon, label, onClick) {
  const b = el('button', cls);
  b.type = 'button';
  if (icon) b.insertAdjacentHTML('beforeend', svg(icon));
  b.append(el('span', null, label));
  b.addEventListener('click', onClick);
  return b;
}
/** write text only when it changed (skips needless DOM work while the guide ticks) */
const setText = (node, text) => {
  if (node.textContent !== text) node.textContent = text;
};
const accentOf = (type) => TYPE_ACCENT[type] ?? '#9aa0a6';

export function badge(number, type) {
  const b = el('span', 'badge', number != null ? String(number) : '');
  b.style.setProperty('--accent', accentOf(type));
  if (number == null) b.insertAdjacentHTML('beforeend', svg('pin'));
  return b;
}

export function createNavUi(app) {
  const hud = app.hud;
  const nav = app.nav;
  const data = app.data;
  const sheets = createSheets(hud, app);
  const index = buildSearchIndex(data);
  const byId = new Map(data.buildings.map((b) => [b.id, b]));
  const mainGate = data.gates.find((g) => g.type === 'main') ?? data.gates[0];

  const here = () =>
    app.mode === 'walk'
      ? { x: app.walk.pos.x, z: app.walk.pos.z, label: 'you' }
      : { x: mainGate.position.x, z: mainGate.position.z, label: `the ${mainGate.name.toLowerCase()}` };

  // ---------------------------------------------------------------- search
  const search = { category: 'all' };
  const sRoot = el('div', 'search');
  const bar = el('label', 'sbar');
  bar.insertAdjacentHTML('beforeend', svg('search'));
  const input = el('input');
  input.type = 'search';
  input.placeholder = 'Search buildings and places';
  input.autocomplete = 'off';
  input.autocapitalize = 'off';
  input.spellcheck = false;
  input.enterKeyHint = 'search';
  input.setAttribute('aria-label', 'Search buildings and places');
  const clear = el('button', 'sclear');
  clear.type = 'button';
  clear.setAttribute('aria-label', 'Clear search');
  clear.innerHTML = svg('close');
  bar.append(input, clear);
  const chips = el('div', 'schips');
  chips.setAttribute('role', 'tablist');
  chips.setAttribute('aria-label', 'Categories');
  const note = el('p', 'snote');
  const list = el('ul', 'slist');
  sRoot.append(bar, chips, note, list);

  const chipEls = new Map();
  for (const c of [{ id: 'all', label: 'All' }, ...index.categories]) {
    const b = el('button', 'schip', c.label);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.addEventListener('click', () => {
      search.category = c.id;
      renderResults();
    });
    chips.appendChild(b);
    chipEls.set(c.id, b);
  }

  function renderResults() {
    const from = here();
    const results = searchIndex(index, input.value, { category: search.category, from });
    for (const [id, b] of chipEls) {
      b.classList.toggle('on', id === search.category);
      b.setAttribute('aria-selected', String(id === search.category));
    }
    clear.style.display = input.value ? '' : 'none';
    note.textContent = results.length ? `Straight-line distance from ${from.label}` : '';
    list.replaceChildren();
    if (!results.length) {
      const li = el('li', 'sempty');
      li.append(el('b', null, 'No match'), el('span', null, input.value ? `Nothing found for "${input.value}". Try a block number, a name or a category.` : 'Nothing in this category.'));
      list.appendChild(li);
      return;
    }
    const frag = document.createDocumentFragment();
    for (const r of results) {
      const it = r.item;
      const li = el('li');
      const b = el('button', 'srow');
      b.type = 'button';
      const type = it.kind === 'building' ? it.category : it.kind === 'unplaced' ? it.type : (byId.get(it.buildingId)?.type ?? 'other');
      const txt = el('span', 'stxt');
      txt.append(el('b', null, it.title), el('small', null, it.subtitle));
      b.append(badge(it.number, type), txt, el('span', 'sdist', r.distance == null ? '' : formatDistance(r.distance)));
      b.addEventListener('click', () => openItem(it));
      li.appendChild(b);
      frag.appendChild(li);
    }
    list.appendChild(frag);
  }
  input.addEventListener('input', renderResults);
  clear.addEventListener('click', () => {
    input.value = '';
    renderResults();
    input.focus();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const first = searchIndex(index, input.value, { category: search.category, from: here() })[0];
    if (first) {
      e.preventDefault();
      input.blur();
      openItem(first.item);
    }
  });

  function openSearch({ category = 'all', query = '' } = {}) {
    search.category = category;
    input.value = query;
    renderResults();
    sheets.show({ id: 'search', title: 'Search', node: sRoot, modal: true, keyboard: true });
    // on phones the keyboard would cover half the list, so only desktop focuses the field; preventScroll: the page must never scroll
    if (!app.coarse) setTimeout(() => input.focus({ preventScroll: true }), 320);
  }

  // ---------------------------------------------------------------- cards
  function openItem(it) {
    if (it.kind === 'building') openBuilding(it.buildingId);
    else if (it.kind === 'unplaced') openUnplaced(it);
    else openPlace(it);
  }

  /** a legend item whose place on the map is not confirmed: say so plainly, no directions */
  function openUnplaced(it) {
    const root = el('div', 'card');
    const top = el('div', 'chead');
    const t = el('div', 'ctitle');
    t.append(el('h3', null, it.title), el('small', null, it.subtitle));
    top.append(badge(it.number, it.type), t);
    root.appendChild(top);
    root.appendChild(el('p', 'cwarn', 'This place is on the college layout board, but its position on the map has not been confirmed yet, so there are no directions to it.'));
    if (it.reason) root.appendChild(el('p', 'cdesc', it.reason));
    const act = el('div', 'cacts');
    act.append(button('btn primary', 'close', 'Close', () => sheets.close('card')));
    root.appendChild(act);
    sheets.show({ id: 'card', title: 'Not mapped yet', node: root, modal: true, label: it.title });
  }

  function row(label, value, muted = false) {
    const r = el('div', 'crow');
    r.append(el('span', 'clabel', label), el('span', muted ? 'cval muted' : 'cval', value));
    return r;
  }

  function walkInfo(buildingId) {
    const r = planRoute(data, { gate: mainGate.id }, { buildingId });
    return r ? `${formatDistance(r.length)} from the ${mainGate.name.toLowerCase()}, ${formatDuration(r.duration)}` : 'No walkable route found';
  }

  function openBuilding(id) {
    const b = byId.get(id);
    if (!b) return;
    const root = el('div', 'card');
    const top = el('div', 'chead');
    const t = el('div', 'ctitle');
    t.append(el('h3', null, b.name), el('small', null, `${TYPE_NOUN[b.type] ?? 'Building'}${b.number != null ? ` · Legend item ${b.number}` : ''}`));
    top.append(badge(b.number, b.type), t);
    root.appendChild(top);

    const rows = el('div', 'crows');
    rows.append(
      row('Walk', walkInfo(b.id)),
      row('Floors', b.verified?.floors ? String(b.floors) : 'Not confirmed yet', !b.verified?.floors),
      row('Inside', b.floorPlans?.length ? (b.floorPlans.some((f) => f.sample) ? 'Sample floor plans' : 'Floor plans available') : 'Not available yet', !b.floorPlans?.length),
    );
    root.appendChild(rows);
    if (b.description) root.appendChild(el('p', 'cdesc', b.description));
    if (!b.verified?.position) root.appendChild(el('p', 'cwarn', 'Position and size are estimates from the layout board and satellite images.'));

    const act = el('div', 'cacts');
    act.append(
      button('btn primary', 'route', 'Directions', () => directionsTo({ buildingId: b.id })),
      button('btn', 'map', 'Show on map', () => showOnMap(b)),
      button('btn', 'door', 'Go to door', () => goToDoor(b)),
    );
    if (app.interiors?.has(b.id)) act.append(button('btn', 'enter', 'Go inside', () => { sheets.close(); app.interiors.enter(b.id); }));
    root.appendChild(act);
    sheets.show({ id: 'card', title: 'Building', node: root, modal: true, label: b.name });
  }

  function openPlace(it) {
    const root = el('div', 'card');
    const top = el('div', 'chead');
    const t = el('div', 'ctitle');
    t.append(el('h3', null, it.title), el('small', null, it.subtitle));
    const parent = it.buildingId ? byId.get(it.buildingId) : null;
    top.append(badge(it.number, parent?.type ?? 'other'), t);
    root.appendChild(top);
    const rows = el('div', 'crows');
    if (parent) rows.appendChild(row('Walk', walkInfo(parent.id)));
    root.appendChild(rows);
    const act = el('div', 'cacts');
    const target = it.pointId ? { pointId: it.pointId } : { buildingId: it.buildingId };
    act.append(
      button('btn primary', 'route', 'Directions', () => directionsTo(target)),
      button('btn', 'map', 'Show on map', () => showOnMap(parent ?? { position: { x: it.x, z: it.z }, id: null })),
    );
    root.appendChild(act);
    sheets.show({ id: 'card', title: 'Place', node: root, modal: true, label: it.title });
  }

  async function showOnMap(b) {
    sheets.close();
    if (app.mode !== 'overview') await app.setMode('overview');
    app.overview.focus(b.position.x, b.position.z, 190);
    if (b.id && !nav.route) {
      app.overview.labels.setHighlight(b.id);
      setTimeout(() => !nav.route && app.overview.labels.setHighlight(null), 6000);
    }
  }

  async function goToDoor(b) {
    sheets.close();
    const f = app.world.doorFrames.find((d) => d.id === b.id);
    const x = f ? f.x + f.nx * 4.5 : b.doorPosition.x, z = f ? f.z + f.nz * 4.5 : b.doorPosition.z;
    const yaw = f ? Math.atan2(f.nx, f.nz) : 0;
    if (app.mode === 'walk') await app.teleportWalk({ x, z, yaw });
    else await app.setMode('walk', { spawn: { x, z, yaw } });
  }

  // ---------------------------------------------------------------- directions
  const pRoot = el('div', 'planner');

  function showPlanner() {
    renderPlanner();
    sheets.show({ id: 'planner', title: 'Directions', node: pRoot, modal: false, label: nav.route ? `Directions to ${nav.route.to.label}` : 'Directions' });
  }

  function directionsTo(target) {
    sheets.close('card');
    sheets.close('search');
    const route = nav.planTo(target);
    if (!route) return;
    if (app.mode === 'overview') app.overview.frame(route.poly.bounds(), 0.46);
    showPlanner();
  }

  function renderPlanner() {
    const r = nav.route;
    pRoot.replaceChildren();
    if (!r) return;
    const dest = el('div', 'pdest');
    const t = el('div', 'ctitle');
    t.append(el('h3', null, r.to.label), el('small', null, r.to.via ? `Inside ${r.to.via}` : (TYPE_NOUN[r.to.type] ?? 'Place')));
    dest.append(badge(r.to.number, r.to.type), t);
    pRoot.appendChild(dest);

    const from = el('div', 'pfrom');
    from.append(el('span', 'clabel', 'From'));
    const seg = el('div', 'segmented pseg');
    for (const o of nav.fromOptions()) {
      const b = el('button', nav.spec.fromId === o.id ? 'on' : '', o.label);
      b.type = 'button';
      b.disabled = !o.available;
      b.addEventListener('click', () => {
        const route = nav.setFrom(o.id);
        if (route && app.mode === 'overview') app.overview.frame(route.poly.bounds(), 0.46);
        renderPlanner();
      });
      seg.appendChild(b);
    }
    from.appendChild(seg);
    pRoot.appendChild(from);

    const sum = el('div', 'psum');
    sum.append(el('b', null, formatDistance(r.length)), el('span', null, `${formatDuration(r.duration)} on foot`));
    pRoot.appendChild(sum);

    const steps = el('ol', 'psteps');
    const keep = r.steps.length > 4 ? 3 : r.steps.length;
    r.steps.forEach((s, i) => {
      const li = el('li');
      if (i >= keep && i < r.steps.length - 1) li.className = 'more';
      li.insertAdjacentHTML('beforeend', svg(s.icon));
      const txt = el('div', 'ptxt');
      txt.append(el('b', null, s.text + (s.near ? ` near ${s.near}` : '')));
      if (s.distance > 0) txt.append(el('small', null, formatDistance(s.distance)));
      li.appendChild(txt);
      steps.appendChild(li);
    });
    pRoot.appendChild(steps);
    if (r.steps.length > 4) {
      steps.classList.add('collapsed');
      const tb = el('button', 'linkbtn', `Show all ${r.steps.length} steps`);
      tb.type = 'button';
      tb.addEventListener('click', () => {
        const c = steps.classList.toggle('collapsed');
        tb.textContent = c ? `Show all ${r.steps.length} steps` : 'Show fewer steps';
      });
      pRoot.appendChild(tb);
    }

    const act = el('div', 'cacts');
    act.append(
      button('btn primary', 'play', 'Start guided walk', async () => {
        sheets.close('planner');
        await nav.start();
      }),
      button('btn', 'walk', 'Walk it myself', async () => {
        sheets.close('planner');
        await nav.startManual();
      }),
    );
    pRoot.appendChild(act);
    const rm = el('button', 'linkbtn clear-route', 'Clear route');
    rm.type = 'button';
    rm.addEventListener('click', () => {
      sheets.close('planner');
      nav.end();
    });
    pRoot.appendChild(rm);
  }

  // ---------------------------------------------------------------- navigation card (top of the screen)
  const card = el('div', 'navcard');
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'Route guidance');
  hud.root.appendChild(card);
  const nc = { key: '', icon: '', ico: null, title: null, sub: null, meta: null, metaSpans: [] };

  function renderNavCard() {
    const r = nav.route;
    const m = nav.mode;
    const showable = !!r && m !== 'none' && m !== 'arrived' && sheets.currentId !== 'planner';
    card.classList.toggle('on', showable);
    if (!showable) {
      nc.key = '';
      hud.root.style.setProperty('--nav-h', '0px');
      return;
    }
    const preview = m === 'preview' && app.mode !== 'walk';
    const key = `${m}|${preview}|${nav.offRoute}|${r.length}`;
    const hint = nav.hint;

    if (key !== nc.key) {
      nc.key = key;
      nc.icon = '';
      card.dataset.mode = m;
      card.replaceChildren();
      const main = el('div', 'nc-main');
      nc.ico = el('span', 'nc-ico');
      const txt = el('div', 'nc-txt');
      nc.title = el('b');
      nc.sub = el('small');
      txt.append(nc.title, nc.sub);
      const x = el('button', 'nc-x');
      x.type = 'button';
      x.setAttribute('aria-label', 'End route');
      x.innerHTML = svg('close');
      x.addEventListener('click', () => nav.end());
      main.append(nc.ico, txt, x);
      nc.meta = el('div', 'nc-meta');
      nc.metaSpans = [el('span'), el('span'), el('span')];
      nc.meta.append(...nc.metaSpans);
      const acts = el('div', 'nc-acts');
      if (preview) {
        acts.append(button('btn small', 'route', 'Directions', showPlanner), button('btn small primary', 'play', 'Start', () => nav.start()));
      } else if (m === 'guided') {
        acts.append(button('btn small', 'pause', 'Pause', () => nav.pause()), button('btn small', 'hand', 'Take control', () => nav.takeControl()));
      } else if (m === 'paused') {
        acts.append(button('btn small primary', 'play', 'Resume', () => nav.resume()), button('btn small', 'hand', 'Take control', () => nav.takeControl()));
      } else {
        if (nav.offRoute) acts.append(button('btn small primary', 'route', 'Reroute', () => nav.reroute()));
        acts.append(button(`btn small${nav.offRoute ? '' : ' primary'}`, 'play', 'Guide me', () => nav.resume()));
      }
      card.append(main, nc.meta, acts);
    }

    // text that changes every few frames is updated in place so buttons are never replaced under a finger
    const icon = preview ? 'route' : m === 'paused' ? 'pause' : (hint?.icon ?? 'straight');
    if (nc.icon !== icon) {
      nc.icon = icon;
      nc.ico.innerHTML = svg(icon);
    }
    if (preview) {
      setText(nc.title, `Route to ${r.to.shortLabel}`);
      setText(nc.sub, `${formatDistance(r.length)} · ${formatDuration(r.duration)}`);
    } else if (m === 'paused') {
      setText(nc.title, 'Paused');
      setText(nc.sub, hint?.text ?? '');
    } else if (nav.offRoute) {
      setText(nc.title, 'Off the route');
      setText(nc.sub, 'Tap Reroute to plan from here');
    } else {
      setText(nc.title, hint?.text ?? '');
      setText(nc.sub, hint?.kind === 'turn' && hint.distance > 3 ? `in ${formatDistance(hint.distance)}` : (hint?.sub ?? ''));
    }
    setText(nc.metaSpans[0], r.to.shortLabel);
    setText(nc.metaSpans[1], `${formatDistance(nav.remaining)} left`);
    setText(nc.metaSpans[2], formatDuration(nav.eta));
    hud.root.style.setProperty('--nav-h', `${Math.round(card.offsetHeight + 8)}px`); // the mini-map sits below the card
  }

  // ---------------------------------------------------------------- arrival
  function showArrival() {
    const r = nav.route;
    if (!r) return;
    const b = r.to.buildingId ? byId.get(r.to.buildingId) : null;
    const root = el('div', 'arrival');
    const top = el('div', 'chead');
    const t = el('div', 'ctitle');
    t.append(el('h3', null, 'You have arrived'), el('small', null, r.to.label));
    top.append(badge(r.to.number, r.to.type), t);
    root.appendChild(top);
    const canEnter = !!(b && app.interiors?.has?.(b.id));
    const act = el('div', 'cacts');
    if (b) {
      const e = button('btn primary', 'enter', 'Enter building', () => {
        sheets.close('arrival');
        app.interiors.enter(b.id);
      });
      e.disabled = !canEnter;
      act.appendChild(e);
    }
    act.appendChild(button(b ? 'btn' : 'btn primary', 'close', 'Done', () => sheets.close('arrival')));
    root.appendChild(act);
    if (b && !canEnter) root.appendChild(el('p', 'cwarn', 'The inside of this building is not available yet.'));
    sheets.show({ id: 'arrival', title: 'Arrived', node: root, modal: false, onClose: () => nav.end() });
  }

  nav.subscribe((type) => {
    if (type === 'arrived') showArrival();
    if (type === 'end') sheets.close('planner');
    renderNavCard();
  });
  sheets.onChange = renderNavCard;

  return {
    sheets,
    openSearch,
    openBuilding,
    directionsTo,
    closeSheets: () => sheets.close(),
    renderNavCard,
  };
}
