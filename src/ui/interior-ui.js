// Interior HUD: the room card. Tapping a door or a room sign opens it. There are no buttons for entering, leaving or changing floor:
// the building is part of the world, so the viewer walks in, up the stairs and out again.
import { sessionNow, ROOM_TYPE_LABEL, floorLabel } from '../interiors/plan.js';
import { el, button, badge } from './nav-ui.js';

const pad2 = (n) => String(n).padStart(2, '0');

export function createInteriorUi(app) {
  const sheets = app.navUi.sheets;
  const interiors = app.interiors;
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
    if (type === 'room') roomCard(data);
    if (type === 'enter' || type === 'exit') sheets.close('room');
  });

  return { roomCard };
}
