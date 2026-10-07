// On-screen controls. Plain DOM: no framework. All touch targets are at least 48 px.
import { Joystick } from './joystick.js';
import { Gyro } from '../modes/gyro.js';
import { clearProfile } from '../core/profile.js';
import { isEmbedded } from '../core/env.js';
import { profileSummary } from './updates.js';
import { showWelcome } from './welcome.js';

const ICON = {
  overview: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
  walk: '<circle cx="13" cy="4.5" r="2"/><path d="M10 21l2.2-6.5-2.4-3 1.8-4.2 3.6 1.2 2 3.2 2.4.6M12.2 14.5l3.8 2.2 1 4.3"/>',
  run: '<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>',
  gyro: '<rect x="8" y="5" width="8" height="14" rx="2"/><path d="M3.5 9.5A9 9 0 0 1 8 4M20.5 14.5A9 9 0 0 1 16 20"/>',
  full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  reset: '<path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/>',
  bug: '<path d="M8 8h8v8a4 4 0 0 1-8 0zM9 5l1.5 3M15 5l-1.5 3M4 12h4M16 12h4M5 18l3-2M19 18l-3-2"/>',
};

const svg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[name]}</svg>`;

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

export function createHud(app) {
  const root = document.getElementById('hud');
  root.innerHTML = '';

  // ----- top bar -----
  const top = el('div', 'hud-top');
  const brand = el('button', 'brand', '<b>MKCE</b> 360<i class="dot" aria-hidden="true"></i>');
  brand.type = 'button';
  brand.setAttribute('aria-label', 'MKCE 360: about the college, updates and your details');
  const seg = el('div', 'segmented mode-seg');
  seg.setAttribute('role', 'tablist');
  seg.setAttribute('aria-label', 'View mode');
  const bOver = el('button', null, `${svg('overview')}<span>Overview</span>`);
  const bWalk = el('button', null, `${svg('walk')}<span>Walk</span>`);
  for (const [b, m] of [[bOver, 'overview'], [bWalk, 'walk']]) {
    b.setAttribute('role', 'tab');
    b.dataset.mode = m;
    b.addEventListener('click', () => app.setMode(m));
    seg.appendChild(b);
  }
  top.append(brand, seg);

  // ----- right column (thumb zone) -----
  const col = el('div', 'hud-col');
  const mkBtn = (icon, label, onClick, extra = '') => {
    const b = el('button', `hbtn ${extra}`, `${svg(icon)}<small>${label}</small>`);
    b.setAttribute('aria-label', label);
    b.addEventListener('click', onClick);
    return b;
  };
  const bRun = mkBtn('run', 'Run', () => {
    app.walk.run = !app.walk.run;
    sync();
  }, 'walk-only');
  const bGyro = mkBtn('gyro', 'Gyro', async () => {
    if (app.walk.gyroOn) {
      await app.walk.setGyro(false);
    } else {
      const ok = await app.walk.setGyro(true);
      if (!ok) api.toast(Gyro.supported ? 'Motion sensors are unavailable or permission was denied. Drag to look instead.' : 'This device has no motion sensors. Drag to look instead.');
    }
    sync();
  }, 'walk-only');
  const bReset = mkBtn('reset', 'Reset', () => app.overview.reset(), 'over-only');
  const bSearch = mkBtn('search', 'Search', () => app.navUi?.openSearch(), 'search-btn');
  const bFull = mkBtn('full', 'Full', () => app.toggleFullscreen());
  const bSet = mkBtn('sliders', 'Settings', () => sheet.open());
  // inside an Android WebView the host Activity goes immersive (docs/android-webview.md); the Fullscreen API would do nothing there
  if ((!document.fullscreenEnabled && !document.webkitFullscreenEnabled) || isEmbedded()) bFull.style.display = 'none';
  col.append(bSearch, bRun, bGyro, bReset, bFull, bSet);

  // ----- toast, walk-here chip, fade -----
  const toastEl = el('div', 'toast');
  toastEl.setAttribute('role', 'status');
  toastEl.setAttribute('aria-live', 'polite');
  const chip = el('div', 'chip');
  const chipBtn = el('button', 'chip-go', `${svg('walk')}<span>Walk here</span>`);
  const chipX = el('button', 'chip-x', svg('close'));
  chipX.setAttribute('aria-label', 'Dismiss');
  chipBtn.addEventListener('click', () => {
    const p = app.overview.tapPoint;
    if (p) app.setMode('walk', { spawn: { x: p.x, z: p.z } });
  });
  chipX.addEventListener('click', () => app.overview.clearTap() || api.showChip(false));
  chip.append(chipBtn, chipX);
  const fade = el('div', 'fade');

  const joystick = new Joystick(root);

  // ----- settings sheet -----
  const sheetEl = el('div', 'sheet');
  sheetEl.setAttribute('role', 'dialog');
  sheetEl.setAttribute('aria-label', 'Settings');
  sheetEl.innerHTML = `
    <div class="sheet-grab"></div>
    <div class="sheet-head"><h2>Settings</h2></div>
    <div class="sheet-body">
      <div class="row"><div><b>Graphics quality</b><small>Auto lowers detail if the frame rate drops</small></div>
        <div class="segmented q-seg" data-k="quality"></div></div>
      <label class="row"><div><b>Shadows</b><small>Off by default; costs speed on phones</small></div><input type="checkbox" data-k="shadows" class="switch"></label>
      <label class="row"><div><b>Head bob</b><small>Gentle walking motion</small></div><input type="checkbox" data-k="headBob" class="switch"></label>
      <label class="row"><div><b>Invert look</b><small>Drag up to look down</small></div><input type="checkbox" data-k="invertLook" class="switch"></label>
      <div class="row"><div><b>Your details</b><small data-k="profile">Nothing saved on this device</small></div>
        <div class="btnrow"><button type="button" data-act="edit-profile">Edit</button><button type="button" data-act="clear-profile">Clear</button></div></div>
      <div class="row"><div><b>College updates and about</b><small>News from the college and what this app is</small></div>
        <div class="btnrow"><button type="button" data-act="open-updates">Open</button></div></div>
      <div class="help">
        <b>Controls</b>
        <p><span>Phone:</span> left thumb moves, drag on the right half to look, tap the ground to walk there. Gyro looks around by turning your phone.</p>
        <p><span>Desktop:</span> W A S D to move, arrow keys to move or turn, Shift to run, drag the mouse to look, click the ground to walk there.</p>
      </div>
      <div class="links"><a href="privacy-policy/">Privacy policy</a></div>
    </div>
    <button class="sheet-close" aria-label="Close">${svg('close')}</button>`;
  const scrim = el('div', 'scrim');
  const sheet = {
    open() {
      app.navUi?.closeSheets();
      sheetEl.classList.add('open');
      scrim.classList.add('on');
      sync();
    },
    close() {
      sheetEl.classList.remove('open');
      scrim.classList.remove('on');
    },
  };
  scrim.addEventListener('click', sheet.close);
  sheetEl.querySelector('.sheet-close').addEventListener('click', sheet.close);
  const qSeg = sheetEl.querySelector('.q-seg');
  for (const q of ['auto', 'high', 'medium', 'low']) {
    const b = el('button', null, q[0].toUpperCase() + q.slice(1));
    b.dataset.q = q;
    b.addEventListener('click', () => {
      app.setQuality(q);
      sync();
    });
    qSeg.appendChild(b);
  }
  for (const inp of sheetEl.querySelectorAll('input[data-k]')) {
    inp.addEventListener('change', () => {
      app.setSetting(inp.dataset.k, inp.checked);
      sync();
    });
  }

  sheetEl.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'open-updates') {
      sheet.close();
      app.updatesUi?.open();
    } else if (act === 'clear-profile') {
      clearProfile();
      app.updatesUi?.refreshDot();
      api.toast('Saved details cleared from this device.');
      sync();
    } else if (act === 'edit-profile') {
      sheet.close();
      await showWelcome(app, { force: true });
    }
  });

  root.append(top, col, toastEl, chip, joystick.hint, scrim, sheetEl, fade);

  // ----- state -> UI -----
  function sync() {
    const walk = app.mode === 'walk';
    root.dataset.mode = app.mode;
    bOver.setAttribute('aria-selected', String(!walk));
    bWalk.setAttribute('aria-selected', String(walk));
    bOver.classList.toggle('on', !walk);
    bWalk.classList.toggle('on', walk);
    bRun.classList.toggle('on', !!app.walk?.run);
    bRun.setAttribute('aria-pressed', String(!!app.walk?.run));
    bGyro.classList.toggle('on', !!app.walk?.gyroOn);
    bGyro.setAttribute('aria-pressed', String(!!app.walk?.gyroOn));
    if (!Gyro.supported) bGyro.style.display = 'none';
    for (const b of qSeg.children) b.classList.toggle('on', b.dataset.q === app.settings.quality);
    for (const inp of sheetEl.querySelectorAll('input[data-k]')) inp.checked = !!app.settings[inp.dataset.k];
    joystick.setHint(walk && !app.walk.joy.id && !app.walkTouched);
    const ps = sheetEl.querySelector('[data-k="profile"]');
    if (ps) ps.textContent = profileSummary();
  }

  let toastTimer = 0;
  const api = {
    root, joystick, sheet, sync,
    toast(msg, ms = 3200) {
      toastEl.textContent = msg;
      toastEl.classList.add('on');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('on'), ms);
    },
    showChip(on) {
      chip.classList.toggle('on', on);
    },
    /** Fade to black, run fn at the darkest point, fade back. */
    async transition(fn, reduced) {
      if (reduced) {
        await fn();
        return;
      }
      fade.classList.add('on');
      await new Promise((r) => setTimeout(r, 230));
      await fn();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      fade.classList.remove('on');
    },
    addDebugButton(onClick) {
      const b = mkBtn('bug', 'Debug', onClick);
      col.insertBefore(b, bFull);
      return b;
    },
    addToTop(node) {
      top.appendChild(node);
    },
  };
  return api;
}
