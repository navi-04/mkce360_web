// Welcome screen: email, college and location, all optional, kept only in this browser's local storage.
// Only this campus is available; any other college shows "Not available yet".
import { loadProfile, saveProfile, isValidEmail } from '../core/profile.js';
import { el, button } from './nav-ui.js';

/**
 * @param app  the App
 * @param {{force?: boolean}} opts  force: open it again from Settings (prefilled)
 * @returns {Promise<void>} resolves when the person continues or skips
 */
export function showWelcome(app, { force = false } = {}) {
  const data = app.data;
  const existing = loadProfile();
  if (existing && !force) return Promise.resolve();
  const root = document.getElementById('app');

  return new Promise((resolve) => {
    const wrap = el('div', 'welcome');
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'w-title');
    const card = el('form', 'w-card');
    card.noValidate = true;
    card.setAttribute('autocomplete', 'on');

    const logo = el('div', 'w-logo');
    logo.innerHTML = '<b>MKCE</b> 360';
    const title = el('h1', null, 'Welcome');
    title.id = 'w-title';
    card.append(logo, el('p', 'w-tag', data.shortName === 'MKCE' ? `${data.name}, ${data.location.city}` : data.name), title);
    card.append(el('p', 'w-sub', 'Everything here is optional and stays on this device. Nothing is sent anywhere.'));

    // email
    const emailF = el('label', 'w-field');
    emailF.append(el('span', null, 'Email'));
    const email = el('input');
    email.type = 'email';
    email.name = 'email';
    email.autocomplete = 'email';
    email.inputMode = 'email';
    email.placeholder = 'you@example.com';
    email.value = existing?.email ?? '';
    const emailErr = el('small', 'w-err');
    emailF.append(email, emailErr);

    // college: this campus, or somebody else's (not available yet)
    const collegeF = el('fieldset', 'w-field w-college');
    collegeF.append(el('legend', null, 'College'));
    let choice = existing?.college === 'other' ? 'other' : 'this';
    const opts = el('div', 'w-opts');
    const mkOpt = (id, label, tag) => {
      const b = el('button', 'w-opt');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.dataset.id = id;
      b.append(el('span', 'w-radio'), el('span', 'w-optname', label), tag ? el('em', tag.cls, tag.text) : '');
      b.addEventListener('click', () => {
        choice = id;
        sync();
      });
      return b;
    };
    const optThis = mkOpt('this', data.name, { cls: 'ok', text: 'Available' });
    const optOther = mkOpt('other', 'Another college', null);
    opts.append(optThis, optOther);
    const otherName = el('input');
    otherName.type = 'text';
    otherName.name = 'college-other';
    otherName.placeholder = 'Name of your college';
    otherName.autocomplete = 'organization';
    otherName.value = existing?.collegeName ?? '';
    const otherNote = el('p', 'w-na');
    otherNote.append(el('b', null, 'Not available yet. '), document.createTextNode(`MKCE 360 covers ${data.name} only for now.`));
    collegeF.append(opts, otherName, otherNote);

    // location
    const locF = el('label', 'w-field');
    locF.append(el('span', null, 'Location (city or area)'));
    const loc = el('input');
    loc.type = 'text';
    loc.name = 'location';
    loc.autocomplete = 'address-level2';
    loc.placeholder = data.location.city;
    loc.value = existing?.location ?? '';
    locF.appendChild(loc);

    const go = button('btn primary w-go', null, 'Start exploring', () => {});
    go.type = 'submit';
    const skip = el('button', 'linkbtn w-skip', existing ? 'Cancel' : 'Skip for now');
    skip.type = 'button';
    const fine = el('p', 'w-fine');
    fine.append(document.createTextNode('Saved only in this browser. '));
    const a = el('a', null, 'Privacy policy');
    a.href = 'privacy-policy/';
    a.target = '_blank';
    a.rel = 'noopener';
    fine.append(a);

    card.append(emailF, collegeF, locF, go, skip, fine);
    wrap.appendChild(card);
    root.appendChild(wrap);

    function sync() {
      for (const b of [optThis, optOther]) {
        const on = b.dataset.id === choice;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', String(on));
      }
      collegeF.classList.toggle('other', choice === 'other');
      go.disabled = choice === 'other';
      go.querySelector('span').textContent = choice === 'other' ? 'Not available yet' : 'Start exploring';
    }
    sync();

    const close = () => {
      wrap.classList.add('out');
      setTimeout(() => wrap.remove(), app.reducedMotion ? 0 : 260);
      resolve();
    };
    skip.addEventListener('click', () => {
      if (!existing) saveProfile({ skipped: true });
      close();
    });
    card.addEventListener('submit', (e) => {
      e.preventDefault();
      if (choice === 'other') return;
      const mail = email.value.trim();
      if (mail && !isValidEmail(mail)) {
        emailErr.textContent = 'That email address does not look right. You can also leave it empty.';
        email.focus();
        return;
      }
      emailErr.textContent = '';
      const ok = saveProfile({ skipped: false, email: mail, college: 'mkce', location: loc.value.trim() });
      if (!ok) app.hud.toast('Your browser blocked storage, so these details will not be remembered.');
      close();
    });
    card.focus?.();
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') skip.click();
    });
  });
}
