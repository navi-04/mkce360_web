// One reusable bottom sheet for search, building cards, directions, arrival and (later) rooms and updates.
// Modal sheets dim the scene; non-modal "peek" sheets leave the 3D view usable behind them.

const CLOSE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

export function createSheets(hud, app) {
  const root = hud.root;
  const scrim = el('div', 'scrim x-scrim');
  const sheet = el('div', 'xsheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'false');
  const grab = el('div', 'sheet-grab');
  const head = el('div', 'xs-head');
  const title = el('h2');
  const closeBtn = el('button', 'xs-close');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.innerHTML = CLOSE_SVG;
  head.append(title, closeBtn);
  const body = el('div', 'xs-body');
  sheet.append(grab, head, body);
  root.append(scrim, sheet);

  const landscape = window.matchMedia('(orientation: landscape) and (max-height: 520px)');
  let current = null;
  let vvHandler = null;
  const out = { onChange: null }; // set by the owner: called after every open/close

  const watchKeyboard = (on) => {
    const vv = window.visualViewport;
    if (!vv) return;
    if (vvHandler) {
      vv.removeEventListener('resize', vvHandler);
      vv.removeEventListener('scroll', vvHandler);
      vvHandler = null;
    }
    sheet.style.bottom = '';
    sheet.style.maxHeight = '';
    if (!on) return;
    // keep the sheet above the on-screen keyboard (it overlays the page on most phones)
    vvHandler = () => {
      const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      sheet.style.bottom = `${covered}px`;
      sheet.style.maxHeight = `${Math.max(240, vv.height - 24)}px`;
    };
    vv.addEventListener('resize', vvHandler);
    vv.addEventListener('scroll', vvHandler);
    vvHandler();
  };

  function close(id) {
    if (!current || (id && current.id !== id)) return;
    const c = current;
    current = null;
    sheet.classList.remove('open', 'peek');
    scrim.classList.remove('on');
    root.classList.remove('sheet-open');
    watchKeyboard(false);
    app?.setViewShift(0, 0);
    c.onClose?.();
    out.onChange?.();
  }

  /**
   * @param {{id:string, title:string, node:Node, modal?:boolean, peek?:boolean, keyboard?:boolean, onClose?:()=>void, label?:string}} o
   */
  function show(o) {
    hud.sheet.close(); // the settings sheet
    hud.showChip(false); // the Walk-here chip would sit on top of the sheet
    if (current && current.id !== o.id) {
      const prev = current;
      current = null;
      prev.onClose?.();
    }
    current = o;
    title.textContent = o.title;
    sheet.setAttribute('aria-label', o.label ?? o.title);
    body.replaceChildren(o.node);
    body.scrollTop = 0;
    const modal = o.modal !== false;
    sheet.classList.toggle('peek', !modal);
    sheet.classList.toggle('dock', landscape.matches); // landscape phones: a panel on the right keeps the scene visible
    scrim.classList.toggle('on', modal);
    root.classList.add('sheet-open');
    requestAnimationFrame(() => {
      sheet.classList.add('open');
      // a peek sheet covers the lower part of the view: lift the picture so the route stays in sight
      if (modal && !landscape.matches) app?.setViewShift(0, 0);
      else if (landscape.matches) app?.setViewShift(Math.round(sheet.offsetWidth / 2), 0);
      else app?.setViewShift(0, Math.round(Math.min(sheet.offsetHeight, window.innerHeight * 0.62) / 2));
    });
    watchKeyboard(!!o.keyboard);
    out.onChange?.();
  }

  closeBtn.addEventListener('click', () => close());
  scrim.addEventListener('click', () => close());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current) close();
  });

  out.show = show;
  out.close = close;
  Object.defineProperty(out, 'currentId', { get: () => current?.id ?? null });
  return out;
}
