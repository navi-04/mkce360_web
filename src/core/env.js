// Where the app is running. Only used for small adaptations (for example the Fullscreen button).

/** Android WebView announces itself with "; wv)" in the user agent; ?embedded=1 forces the same behaviour for tests. */
export function isEmbedded() {
  try {
    return /; wv\)/.test(navigator.userAgent) || new URLSearchParams(location.search).get('embedded') === '1';
  } catch {
    return false;
  }
}
