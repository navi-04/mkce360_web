// All textures are generated on a canvas at start-up: no image downloads except the satellite photo.
import * as THREE from 'three';
import { COLORS } from '../config.js';
import { rng } from './geo.js';

export function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

export function tex(canvas, { repeat = true, repeatS = true, srgb = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (repeat) {
    t.wrapS = repeatS ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

export function speckle(g, w, h, n, alpha, seed, light = '255,255,255', dark = '0,0,0') {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, s = 1 + r() * 1.6;
    g.fillStyle = r() > 0.5 ? `rgba(${light},${alpha * r()})` : `rgba(${dark},${alpha * r()})`;
    g.fillRect(x, y, s, s);
  }
}

// ---------- facades (grayscale; the wall colour comes from vertex colours) ----------

export function facadeBlock() {
  const [c, g] = mk(128, 128);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  speckle(g, 128, 128, 260, 0.05, 11);
  // floor slab band (top of the tile = floor level of the storey above)
  g.fillStyle = '#e2ddcf';
  g.fillRect(0, 0, 128, 8);
  g.fillStyle = '#c9c4b6';
  g.fillRect(0, 8, 128, 2);
  // sunshade above the window
  g.fillStyle = '#f6f4ee';
  g.fillRect(26, 40, 76, 7);
  g.fillStyle = '#b9b5a8';
  g.fillRect(26, 47, 76, 3);
  // window: frame + glass
  g.fillStyle = '#f8f8f8';
  g.fillRect(31, 50, 66, 54);
  const grd = g.createLinearGradient(0, 53, 0, 101);
  grd.addColorStop(0, '#6b8399');
  grd.addColorStop(1, '#2d3d4e');
  g.fillStyle = grd;
  g.fillRect(34, 53, 60, 48);
  g.fillStyle = '#e8ecef';
  g.fillRect(63, 53, 3, 48);
  g.fillRect(34, 76, 60, 3);
  // sill
  g.fillStyle = '#d8d3c4';
  g.fillRect(28, 104, 72, 4);
  return tex(c);
}

export function facadeShed() {
  const [c, g] = mk(128, 128);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  speckle(g, 128, 128, 240, 0.05, 12);
  g.fillStyle = '#d6c0a8'; // brown dado, as in the corridor photos
  g.fillRect(0, 92, 128, 36);
  g.fillStyle = '#e2ddcf';
  g.fillRect(0, 0, 128, 10);
  for (const x of [14, 70]) {
    g.fillStyle = '#f8f8f8';
    g.fillRect(x, 32, 44, 40);
    const grd = g.createLinearGradient(0, 35, 0, 69);
    grd.addColorStop(0, '#6b8399');
    grd.addColorStop(1, '#2d3d4e');
    g.fillStyle = grd;
    g.fillRect(x + 3, 35, 38, 34);
    g.fillStyle = '#e8ecef';
    g.fillRect(x + 20, 35, 2, 34);
  }
  return tex(c);
}

export function facadePlain() {
  const [c, g] = mk(64, 64);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 64);
  speckle(g, 64, 64, 120, 0.06, 13);
  return tex(c);
}

export function roofFlat() {
  const [c, g] = mk(128, 128);
  g.fillStyle = '#e4e1da';
  g.fillRect(0, 0, 128, 128);
  speckle(g, 128, 128, 500, 0.09, 14);
  g.strokeStyle = 'rgba(0,0,0,0.08)';
  for (let i = 0; i < 128; i += 16) {
    g.beginPath();
    g.moveTo(0, i);
    g.lineTo(128, i);
    g.stroke();
  }
  return tex(c);
}

export function roofTile() {
  const [c, g] = mk(128, 128);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(0,0,0,0.22)';
  g.lineWidth = 2;
  for (let x = 0; x < 128; x += 10) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 128);
    g.stroke();
  }
  speckle(g, 128, 128, 300, 0.12, 15);
  return tex(c);
}

// ---------- ground & paving ----------

export function grassTexture() {
  const [c, g] = mk(256, 256);
  g.fillStyle = COLORS.grass;
  g.fillRect(0, 0, 256, 256);
  const r = rng(21);
  for (let i = 0; i < 160; i++) {
    g.fillStyle = r() > 0.5 ? 'rgba(130,175,70,0.16)' : 'rgba(30,80,30,0.14)';
    g.beginPath();
    g.arc(r() * 256, r() * 256, 6 + r() * 22, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 2200; i++) {
    g.strokeStyle = r() > 0.5 ? 'rgba(160,200,90,0.35)' : 'rgba(25,70,25,0.3)';
    const x = r() * 256, y = r() * 256;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 4, y - 2 - r() * 4);
    g.stroke();
  }
  return tex(c, { aniso: 8 });
}

export function asphaltRoad() {
  // u runs across the road, v along it (one tile = 8 m). Edge lines and a dashed centre line.
  const [c, g] = mk(512, 512);
  g.fillStyle = '#4a4d52';
  g.fillRect(0, 0, 512, 512);
  speckle(g, 512, 512, 14000, 0.25, 31, '210,210,210', '10,10,10');
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.fillRect(28, 0, 10, 512);
  g.fillRect(474, 0, 10, 512);
  g.fillRect(252, 0, 8, 224);
  return tex(c, { repeatS: false, aniso: 8 });
}

export function asphaltPlain() {
  const [c, g] = mk(128, 128);
  g.fillStyle = '#4a4d52';
  g.fillRect(0, 0, 128, 128);
  speckle(g, 128, 128, 1500, 0.25, 32, '210,210,210', '10,10,10');
  return tex(c, { aniso: 8 });
}

export function paverTexture() {
  // Interlocking red/grey pavers as seen in front of the blocks (one tile = 2 m).
  const [c, g] = mk(128, 128);
  const r = rng(41);
  g.fillStyle = '#8b8d90';
  g.fillRect(0, 0, 128, 128);
  const rows = 16;
  const bh = 128 / rows;
  for (let j = 0; j < rows; j++) {
    const red = Math.floor(j / 2) % 2 === 0;
    const off = (j % 2) * 8;
    for (let i = -1; i < 9; i++) {
      const x = i * 16 + off;
      const shade = 0.88 + r() * 0.2;
      const base = red ? [163, 74, 67] : [150, 152, 155];
      g.fillStyle = `rgb(${base[0] * shade | 0},${base[1] * shade | 0},${base[2] * shade | 0})`;
      g.fillRect(x + 0.6, j * bh + 0.6, 14.8, bh - 1.2);
    }
  }
  return tex(c, { aniso: 8 });
}

export function concreteTexture() {
  const [c, g] = mk(128, 128);
  g.fillStyle = '#b4b6b8';
  g.fillRect(0, 0, 128, 128);
  speckle(g, 128, 128, 900, 0.18, 51, '240,240,240', '60,60,60');
  g.strokeStyle = 'rgba(0,0,0,0.12)';
  g.strokeRect(0.5, 0.5, 127, 127);
  return tex(c, { aniso: 8 });
}

export function kerbTexture() {
  // black / yellow striped kerb (one tile = 2 m along the road)
  const [c, g] = mk(128, 16);
  for (let i = 0; i < 4; i++) {
    g.fillStyle = i % 2 === 0 ? '#e8b800' : '#1b1b1b';
    g.fillRect(i * 32, 0, 32, 16);
  }
  return tex(c, { repeatS: true });
}

export function fenceTexture() {
  const [c, g] = mk(64, 64);
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(70,78,84,0.95)';
  g.lineWidth = 3;
  for (let i = -64; i < 128; i += 16) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 64, 64);
    g.stroke();
    g.beginPath();
    g.moveTo(i + 64, 0);
    g.lineTo(i, 64);
    g.stroke();
  }
  g.fillStyle = 'rgba(60,66,72,1)';
  g.fillRect(0, 0, 64, 4);
  g.fillRect(0, 60, 64, 4);
  return tex(c);
}

// ---------- sports surfaces ----------

const COURT_SPEC = {
  // surface colour, standard court size [length, width] in metres, drawer
  basketball: { base: '#3c8b58', size: [28, 15] },
  volleyball: { base: '#c47a52', size: [18, 9] },
  tennis: { base: '#4f8f6e', size: [23.8, 10.97] },
  kabaddi: { base: '#d6b98d', size: [13, 10] },
  'kho-kho': { base: '#d8bd90', size: [27, 16] },
  'ball-badminton': { base: '#d9b384', size: [24, 12] },
  'cricket-nets': { base: '#7a8b62', size: [26, 8] },
};

export function courtTexture(sport, w, d) {
  const spec = COURT_SPEC[sport] ?? { base: '#d2b48c', size: [Math.max(w, d) - 2, Math.min(w, d) - 2] };
  const k = 512 / Math.max(w, d);
  const cw = Math.max(32, Math.round(w * k)), ch = Math.max(32, Math.round(d * k));
  const [c, g] = mk(cw, ch);
  g.fillStyle = '#9a9c9e'; // apron
  g.fillRect(0, 0, cw, ch);
  // playing surface fitted inside a 1.2 m margin, long axis along the longer side
  const m = 1.2 * k;
  const horizontal = w >= d;
  let L = spec.size[0] * k, W = spec.size[1] * k;
  const availL = (horizontal ? cw : ch) - 2 * m, availW = (horizontal ? ch : cw) - 2 * m;
  const s = Math.min(1, availL / L, availW / W);
  L *= s;
  W *= s;
  const pw = horizontal ? L : W, ph = horizontal ? W : L;
  const px = (cw - pw) / 2, py = (ch - ph) / 2;
  g.fillStyle = spec.base;
  g.fillRect(px, py, pw, ph);
  g.strokeStyle = '#f4f4f4';
  g.lineWidth = Math.max(1.5, 0.08 * k);
  g.strokeRect(px, py, pw, ph);
  const line = (x0, y0, x1, y1) => {
    g.beginPath();
    g.moveTo(px + x0 * pw, py + y0 * ph);
    g.lineTo(px + x1 * pw, py + y1 * ph);
    g.stroke();
  };
  if (sport === 'basketball') {
    line(0.5, 0, 0.5, 1);
    g.beginPath();
    g.arc(px + pw / 2, py + ph / 2, Math.min(pw, ph) * 0.12, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#d9762b';
    const kw = pw * 0.17, kh = ph * 0.38;
    if (horizontal) {
      g.fillRect(px, py + (ph - kh) / 2, kw, kh);
      g.fillRect(px + pw - kw, py + (ph - kh) / 2, kw, kh);
    } else {
      g.fillRect(px + (pw - kh) / 2, py, kh, kw);
      g.fillRect(px + (pw - kh) / 2, py + ph - kw, kh, kw);
    }
  } else if (sport === 'volleyball') {
    line(0.5, 0, 0.5, 1);
    line(1 / 3, 0, 1 / 3, 1);
    line(2 / 3, 0, 2 / 3, 1);
  } else if (sport === 'tennis') {
    line(0.5, 0, 0.5, 1);
    line(0.25, 0.12, 0.75, 0.12);
    line(0.25, 0.88, 0.75, 0.88);
    line(0.25, 0.12, 0.25, 0.88);
    line(0.75, 0.12, 0.75, 0.88);
    line(0.25, 0.5, 0.75, 0.5);
  } else if (sport === 'kabaddi') {
    line(0.5, 0, 0.5, 1);
    line(0.22, 0, 0.22, 1);
    line(0.78, 0, 0.78, 1);
  } else if (sport === 'kho-kho') {
    line(0.08, 0.5, 0.92, 0.5);
    g.fillStyle = '#7a4a2a';
    g.fillRect(px + pw * 0.08 - 2, py + ph * 0.5 - 2, 4, 4);
    g.fillRect(px + pw * 0.92 - 2, py + ph * 0.5 - 2, 4, 4);
  } else if (sport === 'ball-badminton') {
    line(0.5, 0, 0.5, 1);
  } else if (sport === 'cricket-nets') {
    g.fillStyle = '#b98d5a';
    for (let i = 0; i < 3; i++) {
      const lx = px + pw * (0.1 + i * 0.3), lw = pw * 0.2;
      g.fillRect(lx, py + ph * 0.08, lw, ph * 0.84);
    }
  }
  return tex(c, { repeat: false, aniso: 8 });
}

export function fieldTexture(w, d) {
  const cw = 1024, ch = Math.max(256, Math.round((1024 * d) / w));
  const [c, g] = mk(cw, ch);
  const k = cw / w;
  g.fillStyle = '#c9a97a';
  g.fillRect(0, 0, cw, ch);
  speckle(g, cw, ch, 4000, 0.12, 61, '255,240,200', '90,60,30');
  const tw = (w - 12) * k, th = (d - 10) * k;
  const tx = (cw - tw) / 2, ty = (ch - th) / 2;
  const stadium = (x, y, W, H, fill) => {
    const r = H / 2;
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + W - r, y);
    g.arc(x + W - r, y + r, r, -Math.PI / 2, Math.PI / 2);
    g.lineTo(x + r, y + H);
    g.arc(x + r, y + r, r, Math.PI / 2, (3 * Math.PI) / 2);
    g.closePath();
    if (fill) {
      g.fillStyle = fill;
      g.fill();
    } else g.stroke();
  };
  stadium(tx, ty, tw, th, '#b5503f');
  const lane = 1.22 * k;
  g.strokeStyle = 'rgba(255,255,255,0.8)';
  g.lineWidth = Math.max(1, 0.06 * k);
  for (let i = 0; i <= 8; i++) {
    const o = i * lane;
    if (tw - 2 * o > 4 && th - 2 * o > 4) stadium(tx + o, ty + o, tw - 2 * o, th - 2 * o, null);
  }
  stadium(tx + 8 * lane, ty + 8 * lane, tw - 16 * lane, th - 16 * lane, '#5da245');
  speckle(g, cw, ch, 2500, 0.1, 62, '170,220,120', '20,70,20');
  return tex(c, { repeat: false, aniso: 8 });
}

// ---------- signs ----------

export const SIGN_CELL = { w: 512, h: 96 };

/**
 * Pack many signs into one texture so they render in a single draw call.
 * items: [{ text, style: 'blue' | 'black' }]  ->  { texture, uv: [[u0,v0,u1,v1], ...] }
 */
export function signAtlas(items) {
  const perCol = 16;
  const cols = Math.max(1, Math.ceil(items.length / perCol));
  const rows = Math.min(perCol, items.length) || 1;
  const [c, g] = mk(SIGN_CELL.w * cols, SIGN_CELL.h * rows);
  const uv = [];
  const STYLES = {
    blue: { bg: '#0e3a8c', line: '#f2c230', fg: '#ffffff', sub: '#cfd8ee' },
    black: { bg: '#141414', line: '#c9a24a', fg: '#e9c46a', sub: '#cdb683' },
    green: { bg: '#0f4a38', line: '#d9c27a', fg: '#f4f7f5', sub: '#c4dccf' },
  };
  const fit = (text, size, maxW, min) => {
    do {
      g.font = `700 ${size}px system-ui, "Segoe UI", Roboto, sans-serif`;
      size -= 2;
    } while (g.measureText(text).width > maxW && size > min);
  };
  items.forEach((it, i) => {
    const col = Math.floor(i / perCol), row = i % perCol;
    const x = col * SIGN_CELL.w, y = row * SIGN_CELL.h;
    const st = STYLES[it.style] ?? STYLES.blue;
    g.fillStyle = st.bg;
    g.fillRect(x, y, SIGN_CELL.w, SIGN_CELL.h);
    g.strokeStyle = st.line;
    g.lineWidth = 5;
    g.strokeRect(x + 5, y + 5, SIGN_CELL.w - 10, SIGN_CELL.h - 10);
    g.fillStyle = st.fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const maxW = SIGN_CELL.w - 40;
    if (it.sub) {
      // two lines: a big number (room signs) and a small description
      fit(it.text, 46, maxW, 20);
      g.fillText(it.text, x + SIGN_CELL.w / 2, y + SIGN_CELL.h * 0.38);
      fit(it.sub, 24, maxW, 12);
      g.fillStyle = st.sub;
      g.fillText(it.sub, x + SIGN_CELL.w / 2, y + SIGN_CELL.h * 0.76);
    } else {
      fit(it.text, 44, maxW, 14);
      g.fillText(it.text, x + SIGN_CELL.w / 2, y + SIGN_CELL.h / 2 + 2);
    }
    const u0 = x / c.width, u1 = (x + SIGN_CELL.w) / c.width;
    const vTop = 1 - y / c.height, vBot = 1 - (y + SIGN_CELL.h) / c.height;
    uv.push([u0, vBot, u1, vTop]);
  });
  const texture = tex(c, { repeat: false, aniso: 8 });
  return { texture, uv };
}

// ---------- sky ----------

export function skyTexture() {
  const [c, g] = mk(4, 256);
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, COLORS.skyTop);
  grd.addColorStop(0.55, '#8cc0ea');
  grd.addColorStop(1, COLORS.skyHorizon);
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 256);
  return tex(c, { repeat: false });
}
