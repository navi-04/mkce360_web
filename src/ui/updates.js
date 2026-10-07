// "About and updates" sheet: the college's updates from campus.json, what the app is, and the details kept on this device.
import { loadProfile, clearProfile, seenUpdateId, markUpdateSeen } from '../core/profile.js';
import { el, button } from './nav-ui.js';
import { showWelcome } from './welcome.js';

export function profileSummary() {
  const p = loadProfile();
  if (!p || p.skipped) return 'Nothing saved on this device';
  return [p.email, p.location].filter(Boolean).join(' · ') || 'Saved on this device (no details given)';
}

export function createUpdatesUi(app) {
  const data = app.data;
  const sheets = app.navUi.sheets;
  const sorted = () => [...(data.updates ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const newest = () => sorted().find((u) => !u.placeholder) ?? null;
  const dot = () => !!newest() && seenUpdateId() !== newest().id;

  const fmt = (iso) => {
    const d = new Date(`${iso}T00:00:00`);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  };

  function render() {
    const root = el('div', 'about');

    const head = el('div', 'a-head');
    head.append(el('h3', null, data.name), el('small', null, data.tagline), el('small', null, data.accreditation));
    const loc = data.location;
    head.append(el('small', null, `${loc.locality}, ${loc.city}, ${loc.state}, ${loc.country}`));
    root.appendChild(head);

    const updates = sorted();
    root.appendChild(el('h4', 'a-h', 'College updates'));
    const list = el('div', 'a-updates');
    if (!updates.length) list.appendChild(el('p', 'a-empty', 'No updates yet.'));
    for (const u of updates) {
      const item = el('article', 'a-update');
      const meta = el('div', 'a-meta');
      meta.append(el('span', null, fmt(u.date)));
      if (u.placeholder) meta.append(el('em', null, 'Placeholder'));
      item.append(meta, el('b', null, u.title), el('p', null, u.body));
      list.appendChild(item);
    }
    root.appendChild(list);

    root.appendChild(el('h4', 'a-h', 'Your details'));
    const mine = el('div', 'a-mine');
    mine.append(el('p', null, profileSummary()));
    const row = el('div', 'cacts');
    row.append(
      button('btn', null, 'Edit', async () => {
        sheets.close('updates');
        await showWelcome(app, { force: true });
        updatesOpen();
      }),
      button('btn', null, 'Clear', () => {
        clearProfile();
        app.hud.toast('Saved details cleared from this device.');
        updatesOpen();
      }),
    );
    mine.appendChild(row);
    root.appendChild(mine);

    root.appendChild(el('h4', 'a-h', 'About this app'));
    root.appendChild(
      el('p', 'a-about', 'MKCE 360 is a 3D walkthrough of the campus that runs entirely in your browser: no account, no server, no tracking. Building positions, sizes and floor counts are first estimates unless the building card says otherwise, and the interior of block 1 is sample data.'),
    );
    const link = el('a', 'a-link', 'Privacy policy');
    link.href = 'privacy-policy/';
    link.target = '_blank';
    link.rel = 'noopener';
    root.appendChild(link);
    return root;
  }

  function updatesOpen() {
    sheets.show({ id: 'updates', title: 'About and updates', node: render(), modal: true });
    if (newest()) markUpdateSeen(newest().id);
    refreshDot();
  }

  const brand = app.hud.root.querySelector('.brand');
  function refreshDot() {
    brand?.classList.toggle('has-new', dot());
  }
  brand?.addEventListener('click', updatesOpen);
  refreshDot();

  return { open: updatesOpen, refreshDot };
}
