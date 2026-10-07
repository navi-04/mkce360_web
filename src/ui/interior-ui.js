// Interior HUD: floor selector, exit button, stairs / lift / exit prompts and the room card.
import { sessionNow, ROOM_TYPE_LABEL, floorLabel } from '../interiors/plan.js';
import { el, button, badge, svg, ICONS } from './nav-ui.js';

ICONS.exit = '<path d="M10 17l-5-5 5-5M5 12h11M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5"/>';
ICONS.up = '<path d="M12 19V6M6.5 11.5L12 6l5.5 5.5"/>';
ICONS.down = '<path d="M12 5v13M6.5 12.5L12 18l5.5-5.5"/>';
ICONS.lift = '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M12 3v18M9 9l-1.5 2L9 13M15 13l1.5-2L15 9"/>';

const pad2 = (n) => String(n).padStart(2, '0');

export function createInteriorUi(app) {
  const hud = app.hud;
  const sheets = app.navUi.sheets;
  const interiors = app.interiors;

  // ---------------------------------------------------------------- floor selector and exit
  const floors = el('div', 'floors');
  floors.setAttribute('role', 'group');
  floors.setAttribute('aria-label', 'Floors');
  const exitBtn = button('btn iexit', 'exit', 'Exit', () => interiors.exit());
  exitBtn.setAttribute('aria-label', 'Exit the building');
  const prompt = el('div', 'iprompt');
  prompt.setAttribute('role', 'group');
  hud.root.append(floors, exitBtn, prompt);

  function renderFloors() {
    floors.replaceChildren();
    if (!interiors.active) return;
    floors.append(el('small', null, 'Floor'));
    const list = [...interiors.floorPlans].sort((a, b) => b.level - a.level);
    for (const f of list) {
      const info = interiors.floorInfo(f.level);
      const b = el('button', 'fbtn' + (f.level === interiors.level ? ' on' : ''), info.short);
      b.type = 'button';
      b.setAttribute('aria-label', info.label);
      b.setAttribute('aria-pressed', String(f.level === interiors.level));
      b.addEventListener('click', () => interiors.goToFloor(f.level, 'selector'));
      floors.appendChild(b);
    }
  }

  function renderPrompt() {
    prompt.replaceChildren();
    const p = interiors.prompt;
    prompt.classList.toggle('on', !!p && interiors.active);
    if (!p || !interiors.active) return;
    if (p.kind === 'exit') {
      prompt.append(button('btn primary', 'exit', 'Exit building', () => interiors.exit()));
    } else if (p.kind === 'stairs') {
      const t = interiors.stairTargets();
      if (t.up !== null) prompt.append(button('btn primary', 'up', `Stairs up to ${interiors.floorInfo(t.up).label}`, () => interiors.goToFloor(t.up, 'stairs')));
      if (t.down !== null) prompt.append(button('btn', 'down', `Stairs down to ${interiors.floorInfo(t.down).label}`, () => interiors.goToFloor(t.down, 'stairs')));
    } else if (p.kind === 'lift') {
      const row = el('div', 'liftrow');
      row.append(el('span', 'liftlabel', 'Lift to'));
      for (const f of [...interiors.floorPlans].sort((a, b) => a.level - b.level)) {
        if (f.level === interiors.level) continue;
        const info = interiors.floorInfo(f.level);
        const b = el('button', 'btn small', info.short);
        b.type = 'button';
        b.setAttribute('aria-label', `Lift to ${info.label}`);
        b.addEventListener('click', () => interiors.goToFloor(f.level, 'lift'));
        row.appendChild(b);
      }
      prompt.appendChild(row);
    }
  }

  // ---------------------------------------------------------------- room card
  function roomCard({ room, floor }) {
    const root = el('div', 'card roomcard');
    const head = el('div', 'chead');
    const t = el('div', 'ctitle');
    t.append(el('h3', null, room.name), el('small', null, `${room.number} · ${ROOM_TYPE_LABEL[room.type] ?? 'Room'} · ${floorLabel(floor)}`));
    head.append(badge(room.number, 'department'), t);
    root.appendChild(head);

    if (floor.sample) {
      root.appendChild(el('p', 'cwarn sample', 'Sample data. This room is a placeholder that demonstrates the interior; the real details will come from the college.'));
    }

    const now = interiors.clock();
    const s = sessionNow(room, now);
    const status = el('div', 'status ' + (s.current ? 'in' : 'out'));
    status.append(el('i'));
    const txt = el('div');
    if (s.current) {
      txt.append(el('b', null, 'Now in session'), el('small', null, `${s.current.title} until ${s.current.end}`));
    } else if (room.timetable?.length) {
      txt.append(el('b', null, 'Not in session'), el('small', null, s.next ? `Next today: ${s.next.title} at ${s.next.start}` : `No more sessions today (${s.day} ${pad2(now.getHours())}:${pad2(now.getMinutes())})`));
    } else {
      txt.append(el('b', null, 'No timetable'), el('small', null, 'This room has no scheduled sessions.'));
    }
    status.appendChild(txt);
    root.appendChild(status);

    const rows = el('div', 'crows');
    const row = (label, value, muted) => {
      const r = el('div', 'crow');
      r.append(el('span', 'clabel', label), el('span', muted ? 'cval muted' : 'cval', value));
      return r;
    };
    rows.append(
      row('Type', ROOM_TYPE_LABEL[room.type] ?? 'Room'),
      row('Capacity', room.capacity != null ? `${room.capacity} people` : 'Not listed', room.capacity == null),
      row('Department', room.department ?? 'Not listed', !room.department),
      row('Faculty', room.faculty ?? 'Not listed', !room.faculty),
      row('Equipment', room.equipment?.length ? room.equipment.join(', ') : 'None listed', !room.equipment?.length),
    );
    root.appendChild(rows);

    if (s.today.length) {
      const tt = el('div', 'ttable');
      tt.append(el('h4', null, `Today (${s.day})`));
      for (const e of s.today) {
        const li = el('div', 'tt' + (e === s.current ? ' now' : ''));
        li.append(el('span', null, `${e.start}–${e.end}`), el('span', null, e.title));
        tt.appendChild(li);
      }
      root.appendChild(tt);
    }

    const act = el('div', 'cacts');
    act.append(
      button('btn primary', 'walk', 'Walk to the door', () => {
        sheets.close('room');
        interiors.walkToRoom(room.id);
      }),
      button('btn', 'close', 'Close', () => sheets.close('room')),
    );
    root.appendChild(act);
    sheets.show({ id: 'room', title: 'Room', node: root, modal: true, label: `${room.number} ${room.name}` });
  }

  interiors.subscribe((type, data) => {
    if (type === 'enter' || type === 'floor' || type === 'exit') {
      renderFloors();
      renderPrompt();
      if (type !== 'floor') sheets.close('room');
    }
    if (type === 'prompt') renderPrompt();
    if (type === 'room') roomCard(data);
  });
  renderFloors();

  return { roomCard, renderFloors, renderPrompt };
}
