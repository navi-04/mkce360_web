// Drive controls for a phone, like a car game: two steering buttons on the left thumb, a brake and an accelerator pedal on the
// right thumb, a speedometer, and a button for the view. Each control is a pointer target of its own, so steering and a pedal work
// at the same moment (two thumbs). On a computer (a mouse and a keyboard) the buttons are hidden and the keys do the same (W A S D or
// the arrows, Space, C; a hint says so), see modes/drive.js.
// Everything is at least 64 px; the controls only exist in Drive mode.

const ICON = {
  left: '<path d="M14.5 5.5L7.5 12l7 6.5"/>',
  right: '<path d="M9.5 5.5l7 6.5-7 6.5"/>',
  gas: '<path d="M12 4v12M6.5 10.5L12 5l5.5 5.5M7 20h10"/>',
  brake: '<path d="M12 20V8M6.5 13.5L12 19l5.5-5.5M7 4h10"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
};
const svg = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${ICON[n]}</svg>`;

export function createDriveUi(app) {
  const root = app.hud.root;
  const wrap = document.createElement('div');
  wrap.className = 'drive';
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', 'Drive controls');

  const control = (cls, key, icon, label) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `dbtn ${cls}`;
    b.dataset.key = key;
    b.setAttribute('aria-label', label);
    b.innerHTML = `${svg(icon)}<span>${label}</span>`;
    // a pointer of its own: holding one control does not stop another (steer with one thumb, press a pedal with the other)
    const press = (e) => {
      e.preventDefault();
      b.setPointerCapture?.(e.pointerId);
      app.drive.pad[key] = true;
      b.classList.add('down');
    };
    const release = (e) => {
      if (e) e.preventDefault();
      app.drive.pad[key] = false;
      b.classList.remove('down');
    };
    b.addEventListener('pointerdown', press);
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(t, release);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    return b;
  };

  const steer = document.createElement('div');
  steer.className = 'dsteer';
  steer.append(control('dleft', 'left', 'left', 'Left'), control('dright', 'right', 'right', 'Right'));
  const pedals = document.createElement('div');
  pedals.className = 'dpedals';
  pedals.append(control('dbrake', 'brake', 'brake', 'Brake'), control('dgas', 'gas', 'gas', 'Gas'));

  const speedo = document.createElement('div');
  speedo.className = 'dspeed';
  speedo.setAttribute('role', 'status');
  speedo.innerHTML = '<b>0</b><small>km/h</small>';
  const num = speedo.querySelector('b');

  const keys = document.createElement('div');
  keys.className = 'dkeys';
  keys.innerHTML = '<b>W A S D</b> or the arrows to drive &middot; <b>Space</b> handbrake &middot; <b>C</b> view';

  wrap.append(steer, pedals, speedo, keys);
  root.appendChild(wrap);

  // the speedometer
  let last = -1;
  app.extra.push(() => {
    if (app.mode !== 'drive') return;
    const v = Math.round(app.drive.kmh);
    if (v !== last) {
      last = v;
      num.textContent = String(v);
    }
  });
  return { wrap };
}
