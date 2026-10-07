// Per-user conveniences kept only in this browser (localStorage). Every access is wrapped in try/catch:
// storage can be blocked (private mode, WebView settings) and the app must work without it.
const PROFILE_KEY = 'mkce360.profile.v1';
const SEEN_KEY = 'mkce360.seenUpdate.v1';

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** { email, college, location, skipped, savedAt } or null when nothing was saved yet */
export function loadProfile() {
  const p = read(PROFILE_KEY);
  return p && typeof p === 'object' ? p : null;
}

export function saveProfile(p) {
  return write(PROFILE_KEY, { ...p, savedAt: Date.now() });
}

export function clearProfile() {
  try {
    localStorage.removeItem(PROFILE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** id of the newest update the person has opened */
export function seenUpdateId() {
  const v = read(SEEN_KEY);
  return typeof v === 'string' ? v : null;
}

export function markUpdateSeen(id) {
  return write(SEEN_KEY, id);
}

export function isValidEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}
