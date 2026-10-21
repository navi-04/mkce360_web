// Interior textures, all drawn on a canvas (no downloads). The look follows the photos supplied for block 1:
// polished red granite in the corridors, pale marble in the entrance hall, green flooring in the classrooms,
// white walls with a tan dado, brown parapets with slots, steel-blue doors.
import { rng } from './geo.js';
import { mk, tex, speckle } from './textures.js';

/** height in metres that the wall textures are drawn for (one storey) */
export const STOREY = 3.6;
export const DADO = 1.25;

function blotches(g, w, h, n, seed, palette, rMin, rMax) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const c = palette[Math.floor(r() * palette.length)];
    g.fillStyle = `rgba(${c},${0.05 + r() * 0.12})`;
    g.beginPath();
    g.ellipse(r() * w, r() * h, rMin + r() * (rMax - rMin), (rMin + r() * (rMax - rMin)) * (0.4 + r() * 0.6), r() * 3, 0, Math.PI * 2);
    g.fill();
  }
}

/** polished red granite, 4 slabs of 0.9 m per tile (tile = 1.8 m) */
export function graniteFloor() {
  const [c, g] = mk(256, 256);
  g.fillStyle = '#94776c';
  g.fillRect(0, 0, 256, 256);
  blotches(g, 256, 256, 110, 41, ['176,120,104', '140,134,134', '110,74,66', '204,156,138', '160,150,146'], 10, 46);
  speckle(g, 256, 256, 2600, 0.45, 42, '236,196,178', '52,24,20');
  // grey veins, as in the photographed granite
  const r = rng(43);
  g.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    g.strokeStyle = `rgba(${r() > 0.5 ? '150,150,155' : '70,40,36'},${0.12 + r() * 0.12})`;
    g.beginPath();
    const x = r() * 256, y = r() * 256;
    g.moveTo(x, y);
    g.bezierCurveTo(x + 40, y + (r() - 0.5) * 60, x + 80, y + (r() - 0.5) * 60, x + 120 + r() * 60, y + (r() - 0.5) * 80);
    g.stroke();
  }
  g.fillStyle = '#4d2a22'; // joints every 0.9 m
  g.fillRect(0, 0, 256, 2);
  g.fillRect(0, 127, 256, 2);
  g.fillRect(0, 0, 2, 256);
  g.fillRect(127, 0, 2, 256);
  g.fillStyle = 'rgba(255,225,210,0.16)';
  g.fillRect(0, 2, 256, 1);
  g.fillRect(2, 0, 1, 256);
  return tex(c, { aniso: 8 });
}

/** pale marble of the entrance hall (one slab = 1.2 m) */
export function marbleFloor() {
  const [c, g] = mk(256, 256);
  g.fillStyle = '#e0dbd2';
  g.fillRect(0, 0, 256, 256);
  blotches(g, 256, 256, 22, 51, ['255,255,255', '190,182,172', '214,202,188'], 18, 60);
  const r = rng(52);
  for (let i = 0; i < 6; i++) {
    g.strokeStyle = `rgba(${r() > 0.5 ? '120,105,95' : '170,160,152'},${0.05 + r() * 0.07})`;
    g.lineWidth = 1 + r() * 2;
    g.beginPath();
    const x = r() * 256, y = r() * 256;
    g.moveTo(x, y);
    g.bezierCurveTo(x + 50, y + (r() - 0.5) * 70, x + 100, y + (r() - 0.5) * 70, x + 140, y + (r() - 0.5) * 90);
    g.stroke();
  }
  speckle(g, 256, 256, 900, 0.14, 53, '255,255,255', '90,80,70');
  g.fillStyle = '#9c968c';
  g.fillRect(0, 0, 256, 2);
  g.fillRect(0, 0, 2, 256);
  return tex(c, { aniso: 8 });
}

/** the green classroom flooring (tile = 2.4 m) */
export function greenFloor() {
  const [c, g] = mk(128, 128);
  g.fillStyle = '#36907a';
  g.fillRect(0, 0, 128, 128);
  blotches(g, 128, 128, 60, 61, ['20,80,66', '70,150,128', '18,60,50'], 6, 26);
  speckle(g, 128, 128, 700, 0.25, 62, '150,210,190', '8,40,32');
  return tex(c, { aniso: 4 });
}

/** bare concrete corridor floor (tile = 2.4 m) */
export function concreteFloor() {
  const [c, g] = mk(128, 128);
  g.fillStyle = '#8b8a86';
  g.fillRect(0, 0, 128, 128);
  blotches(g, 128, 128, 70, 71, ['60,60,58', '170,168,160', '100,98,94'], 6, 30);
  speckle(g, 128, 128, 800, 0.22, 72, '210,208,200', '40,40,38');
  return tex(c, { aniso: 4 });
}

/** white wall with the tan dado seen in every corridor (drawn for one storey; u = 2 m) */
export function corridorWall() {
  const [c, g] = mk(64, 256);
  g.fillStyle = '#f4f0e7';
  g.fillRect(0, 0, 64, 256);
  speckle(g, 64, 256, 140, 0.035, 81);
  const dado = 256 - Math.round((DADO / STOREY) * 256);
  g.fillStyle = '#c99f7b';
  g.fillRect(0, dado, 64, 256 - dado);
  speckle(g, 64, 256, 110, 0.05, 82, '255,232,205', '80,50,30');
  g.fillStyle = '#a98363';
  g.fillRect(0, dado, 64, 3);
  g.fillStyle = '#8a6e5a';
  g.fillRect(0, 249, 64, 7);
  return tex(c, { aniso: 8 });
}

/** plain cream classroom wall */
export function roomWall() {
  const [c, g] = mk(64, 256);
  g.fillStyle = '#f7f0df';
  g.fillRect(0, 0, 64, 256);
  speckle(g, 64, 256, 200, 0.04, 83, '255,250,235', '120,100,70');
  g.fillStyle = '#b9aa8d';
  g.fillRect(0, 249, 64, 7);
  return tex(c, { aniso: 8 });
}

/** the brown verandah parapet with slots (tile = 2.4 m wide, 1.28 m high; the wall is 1.0 m) */
export function parapetWall() {
  const [c, g] = mk(256, 128);
  g.fillStyle = '#6a4b3e';
  g.fillRect(0, 0, 256, 128);
  speckle(g, 256, 128, 260, 0.06, 91, '200,160,130', '30,16,10');
  // cap (the top ledge is plastered white)
  g.fillStyle = '#ebe5d9';
  g.fillRect(0, 0, 256, 14);
  g.fillStyle = '#b5ab9b';
  g.fillRect(0, 14, 256, 3);
  const hole = (x, y, w, h) => {
    g.fillStyle = '#4d392f';
    g.fillRect(x - 2, y - 2, w + 4, h + 4);
    g.fillStyle = '#f1ecdf';
    g.fillRect(x, y, w, h);
  };
  // square hole, two thin slots, square hole, two thin slots (per 2.4 m)
  hole(24, 40, 30, 40);
  hole(86, 36, 9, 48);
  hole(104, 36, 9, 48);
  hole(150, 40, 30, 40);
  hole(210, 36, 9, 48);
  hole(228, 36, 9, 48);
  return tex(c, { aniso: 4 });
}

/**
 * The wings seen across the courtyard (photos 2.34.14 PM and 2.34.15 PM): cream parapet with X-shaped and slot openings, a thick
 * white slab edge above, white columns, a shaded verandah with doors and windows behind. One tile is two bays (7.4 m) wide and
 * one storey (3.6 m) high.
 */
export function arcadeFacade() {
  const W = 512, Hh = 256, ppm = 69; // 69 px per metre
  const [c, g] = mk(W, Hh);
  // shaded verandah behind the openings
  const grd = g.createLinearGradient(0, 0, 0, Hh);
  grd.addColorStop(0, '#a79d90');
  grd.addColorStop(1, '#7d746a');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, Hh);
  speckle(g, W, Hh, 500, 0.06, 101);
  g.fillStyle = '#c4b49f'; // a tan dado on the back wall, as in the corridors
  g.fillRect(0, 176, W, 40);
  // back-wall openings: a door in the first bay, windows in both
  const dark = '#3a342e', blue = '#4d6d8a', glass = '#6c7f86';
  g.fillStyle = dark;
  g.fillRect(70, 78, 60, 138);
  g.fillStyle = blue;
  g.fillRect(74, 82, 52, 130);
  for (const x of [150, 330, 410]) {
    g.fillStyle = '#e9e4da';
    g.fillRect(x, 96, 80, 62);
    g.fillStyle = glass;
    g.fillRect(x + 4, 100, 72, 54);
    g.fillStyle = '#e9e4da';
    g.fillRect(x + 38, 100, 4, 54);
    g.fillRect(x + 4, 124, 72, 4);
  }
  // slab edge: a wide white band with a shadow line under it
  g.fillStyle = '#efeae1';
  g.fillRect(0, 0, W, 40);
  g.fillStyle = '#cfc7ba';
  g.fillRect(0, 40, W, 4);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(0, 44, W, 10);
  // parapet (bottom 1.0 m): cream with X squares and slot pairs
  const top = Hh - ppm;
  g.fillStyle = '#e6dac9';
  g.fillRect(0, top, W, ppm);
  g.fillStyle = '#f3eee6';
  g.fillRect(0, top, W, 6);
  g.fillStyle = '#cbbfae';
  g.fillRect(0, top + 6, W, 2);
  const xsq = (x, y, n) => {
    g.fillStyle = '#4a433b';
    g.fillRect(x, y, n, n);
    g.strokeStyle = '#e6dac9';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + n, y + n);
    g.moveTo(x + n, y);
    g.lineTo(x, y + n);
    g.stroke();
  };
  const slots = (x, y) => {
    g.fillStyle = '#4a433b';
    g.fillRect(x, y, 5, 20);
    g.fillRect(x + 11, y, 5, 20);
  };
  for (const [kind, x] of [['x', 40], ['s', 100], ['x', 160], ['x', 210], ['s', 290], ['x', 346], ['s', 400], ['x', 456]]) {
    if (kind === 'x') xsq(x, top + 22, 20);
    else slots(x, top + 22);
  }
  // columns (cream-white), one at each bay edge
  for (const x of [0, 256]) {
    g.fillStyle = '#f0ebe2';
    g.fillRect(x - 15, 40, 31, Hh - 40);
    g.fillStyle = '#d2c9bb';
    g.fillRect(x + 14, 40, 2, Hh - 40);
  }
  g.fillStyle = '#efeae1';
  g.fillRect(W - 16, 40, 16, Hh - 40);
  return tex(c, { aniso: 4 });
}

/** the parapet seen from the courtyard: cream, X squares and slot pairs (tile = 2.4 m wide, 1.28 m high; the wall is 1.0 m) */
export function parapetOuter() {
  const [c, g] = mk(256, 128);
  g.fillStyle = '#e8dccb';
  g.fillRect(0, 0, 256, 128);
  speckle(g, 256, 128, 260, 0.05, 92, '255,250,240', '90,70,50');
  g.fillStyle = '#f4efe7'; // plastered top ledge
  g.fillRect(0, 0, 256, 14);
  g.fillStyle = '#c9bdac';
  g.fillRect(0, 14, 256, 3);
  const xsq = (x, y, n) => {
    g.fillStyle = '#4a433b';
    g.fillRect(x, y, n, n);
    g.strokeStyle = '#e8dccb';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + n, y + n);
    g.moveTo(x + n, y);
    g.lineTo(x, y + n);
    g.stroke();
  };
  const slots = (x, y) => {
    g.fillStyle = '#4a433b';
    g.fillRect(x, y, 8, 38);
    g.fillRect(x + 18, y, 8, 38);
  };
  xsq(26, 42, 34);
  slots(94, 38);
  xsq(150, 42, 34);
  slots(212, 38);
  return tex(c, { aniso: 4 });
}

/** white ribbed roof sheet seen from below and above (tile = 1.2 m; ribs every 0.2 m) */
export function roofSheet() {
  const [c, g] = mk(256, 256);
  g.fillStyle = '#ece8df';
  g.fillRect(0, 0, 256, 256);
  const rib = 256 / 6;
  for (let i = 0; i < 6; i++) {
    const x = i * rib;
    const grd = g.createLinearGradient(x, 0, x + rib, 0);
    grd.addColorStop(0, 'rgba(120,112,100,0.34)');
    grd.addColorStop(0.18, 'rgba(255,255,255,0.28)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.05)');
    grd.addColorStop(0.82, 'rgba(255,255,255,0.22)');
    grd.addColorStop(1, 'rgba(120,112,100,0.34)');
    g.fillStyle = grd;
    g.fillRect(x, 0, rib, 256);
  }
  speckle(g, 256, 256, 600, 0.07, 94, '255,255,255', '90,80,60');
  return tex(c, { aniso: 4 });
}

/** the curved, finely ribbed fascia hanging at the edge of the roof (tile = 0.64 m wide, 0.64 m high) */
export function fasciaRib() {
  const [c, g] = mk(128, 128);
  g.fillStyle = '#a49c8d';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 16; i++) {
    const x = i * 8;
    const grd = g.createLinearGradient(x, 0, x + 8, 0);
    grd.addColorStop(0, 'rgba(60,52,42,0.42)');
    grd.addColorStop(0.5, 'rgba(255,250,240,0.18)');
    grd.addColorStop(1, 'rgba(60,52,42,0.42)');
    g.fillStyle = grd;
    g.fillRect(x, 0, 8, 128);
  }
  const shade = g.createLinearGradient(0, 0, 0, 128);
  shade.addColorStop(0, 'rgba(0,0,0,0.0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.22)');
  g.fillStyle = shade;
  g.fillRect(0, 0, 128, 128);
  return tex(c, { aniso: 4 });
}

/** foliage for the tree crowns: many small leaflets on a transparent ground (alpha-tested; tile = 1.6 m). withFlowers: bougainvillea */
export function leafTexture(withFlowers = false) {
  const N = 256;
  const [c, g] = mk(N, N);
  g.clearRect(0, 0, N, N);
  const r = rng(withFlowers ? 133 : 131);
  const wrap = (fn, x, y) => {
    for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) {
      const px = x + dx, py = y + dy;
      if (px > -24 && px < N + 24 && py > -24 && py < N + 24) fn(px, py);
    }
  };
  // a dark mass behind, so the crown reads as dense from a distance
  for (let i = 0; i < 70; i++) {
    const x = r() * N, y = r() * N, rad = 14 + r() * 16;
    wrap((px, py) => { g.fillStyle = '#2c5a22'; g.beginPath(); g.arc(px, py, rad, 0, Math.PI * 2); g.fill(); }, x, y);
  }
  const palette = ['#3d7a2a', '#4c8d33', '#5c9e3a', '#356b26', '#69ab43', '#2f6224', '#8bbd4e'];
  for (let i = 0; i < 950; i++) {
    const x = r() * N, y = r() * N, a = r() * Math.PI, len = 10 + r() * 7, wid = 4 + r() * 3;
    const col = palette[Math.floor(r() * palette.length)];
    wrap((px, py) => {
      g.fillStyle = col;
      g.beginPath();
      g.ellipse(px, py, len / 2, wid / 2, a, 0, Math.PI * 2);
      g.fill();
    }, x, y);
  }
  if (withFlowers) {
    for (let i = 0; i < 60; i++) {
      const x = r() * N, y = r() * N;
      wrap((px, py) => {
        g.fillStyle = r() > 0.35 ? '#f4efe6' : '#f0d5e0';
        for (let k = 0; k < 4; k++) {
          g.beginPath();
          g.ellipse(px + Math.cos(k * 1.57) * 2.4, py + Math.sin(k * 1.57) * 2.4, 3, 2.2, k * 1.57, 0, Math.PI * 2);
          g.fill();
        }
      }, x, y);
    }
  }
  return tex(c, { aniso: 4 });
}

/** bark: vertical streaks (replaced by the photographed bark when it loads) */
export function barkTexture() {
  const [c, g] = mk(64, 128);
  g.fillStyle = '#8a7765';
  g.fillRect(0, 0, 64, 128);
  const r = rng(141);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = r() > 0.5 ? 'rgba(60,44,32,0.35)' : 'rgba(190,170,150,0.25)';
    g.fillRect(r() * 64, r() * 128, 1 + r() * 3, 16 + r() * 60);
  }
  return tex(c, { aniso: 4 });
}

/** grey hexagonal pavers of the courtyard paths (tile = 1.2 m) */
export function hexPaver() {
  const [c, g] = mk(128, 128);
  g.fillStyle = '#5d5c58';
  g.fillRect(0, 0, 128, 128);
  const r = rng(111);
  const R = 17, w = Math.sqrt(3) * R, h = 1.5 * R;
  for (let row = -1; row < 128 / h + 1; row++) {
    for (let col = -1; col < 128 / w + 1; col++) {
      const cx = col * w + (row % 2 ? w / 2 : 0), cy = row * h;
      const shade = 0.9 + r() * 0.22;
      g.fillStyle = `rgb(${(138 * shade) | 0},${(138 * shade) | 0},${(134 * shade) | 0})`;
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k + Math.PI / 6;
        const px = cx + (R - 1.6) * Math.cos(a), py = cy + (R - 1.6) * Math.sin(a);
        if (k === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      g.fill();
    }
  }
  return tex(c, { aniso: 8 });
}

export function ceilingTile() {
  const [c, g] = mk(128, 128);
  g.fillStyle = '#f6f3ec';
  g.fillRect(0, 0, 128, 128);
  speckle(g, 128, 128, 160, 0.04, 45);
  return tex(c);
}

// ---------- decor atlas: boards and screens drawn once, placed as flat quads ----------

const DECOR = {
  whiteboard: [0, 0, 256, 128],
  panel: [256, 0, 256, 128],
  honour: [0, 128, 128, 256],
  directory: [128, 128, 128, 256],
  display: [256, 128, 128, 256],
  notice: [384, 128, 128, 128],
  window: [384, 256, 128, 128],
  vent: [384, 384, 128, 64],
};

/** @returns {{texture:object, cells:Record<string, number[]>}} cells hold [u0, v0, u1, v1] */
export function decorAtlas() {
  const W = 512, Hh = 512;
  const [c, g] = mk(W, Hh);
  g.fillStyle = '#888';
  g.fillRect(0, 0, W, Hh);
  const cell = (name, fn) => {
    const [x, y, w, h] = DECOR[name];
    g.save();
    g.translate(x, y);
    g.beginPath();
    g.rect(0, 0, w, h);
    g.clip();
    fn(w, h);
    g.restore();
  };
  const r = rng(121);

  cell('whiteboard', (w, h) => {
    g.fillStyle = '#9aa0a4'; // aluminium frame
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#f4f6f7';
    g.fillRect(6, 6, w - 12, h - 12);
    g.strokeStyle = 'rgba(40,60,110,0.55)';
    g.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      const y = 22 + r() * (h - 50), x = 16 + r() * 90;
      g.moveTo(x, y);
      g.lineTo(x + 30 + r() * 120, y + (r() - 0.5) * 10);
      g.stroke();
    }
    g.strokeStyle = 'rgba(160,40,40,0.5)';
    g.strokeRect(150 + r() * 30, 30 + r() * 20, 60, 36);
  });

  cell('panel', (w, h) => {
    g.fillStyle = '#26282c';
    g.fillRect(0, 0, w, h);
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, '#3a3e45');
    grd.addColorStop(0.5, '#15171a');
    grd.addColorStop(1, '#2b2e33');
    g.fillStyle = grd;
    g.fillRect(8, 8, w - 16, h - 16);
  });

  cell('honour', (w, h) => {
    g.fillStyle = '#5b2e24';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#e6d7a8';
    g.fillRect(8, 8, w - 16, 3);
    for (let i = 0; i < 14; i++) {
      g.fillStyle = 'rgba(236,222,170,0.75)';
      g.fillRect(12, 24 + i * 15, 38 + r() * 40, 3);
      g.fillRect(w - 44, 24 + i * 15, 28, 3);
    }
  });

  cell('directory', (w, h) => {
    g.fillStyle = '#1d1f22';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 11; i++) {
      g.fillStyle = 'rgba(244,244,240,0.85)';
      g.fillRect(10, 20 + i * 21, 50 + r() * 44, 5);
      g.fillStyle = 'rgba(150,205,90,0.9)';
      g.fillRect(w - 28, 20 + i * 21, 16, 5);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(6, 33 + i * 21, w - 12, 1);
    }
  });

  cell('display', (w, h) => {
    g.fillStyle = '#10141a';
    g.fillRect(0, 0, w, h);
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#2f7fd0');
    grd.addColorStop(0.55, '#7a4fb8');
    grd.addColorStop(1, '#e08a3c');
    g.fillStyle = grd;
    g.fillRect(6, 6, w - 12, h - 12);
    g.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 6; i++) g.fillRect(16, 30 + i * 28, 40 + r() * 50, 6);
  });

  cell('notice', (w, h) => {
    g.fillStyle = '#7a4a28';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#d8d4c6';
    g.fillRect(8, 8, w - 16, h - 16);
    for (let i = 0; i < 6; i++) {
      g.fillStyle = ['#f4efe0', '#e4d27a', '#cfe0ec', '#ecc9c9'][i % 4];
      g.fillRect(14 + (i % 3) * 34, 14 + Math.floor(i / 3) * 50, 28, 40);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(18 + (i % 3) * 34, 22 + Math.floor(i / 3) * 50, 20, 2);
      g.fillRect(18 + (i % 3) * 34, 30 + Math.floor(i / 3) * 50, 16, 2);
    }
  });

  cell('window', (w, h) => {
    // steel-framed window: frame, a bright pane, a dark curtain at one side, a grille
    g.fillStyle = '#434f53';
    g.fillRect(0, 0, w, h);
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#dff0f2');
    grd.addColorStop(1, '#b7d4d6');
    g.fillStyle = grd;
    g.fillRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#434f53';
    g.fillRect(w / 2 - 2, 0, 4, h);
    g.fillRect(0, h * 0.32, w, 4);
    g.strokeStyle = 'rgba(70,86,92,0.85)';
    g.lineWidth = 2;
    for (let i = 1; i < 7; i++) {
      g.beginPath();
      g.moveTo(6, h * 0.32 + 4 + i * ((h * 0.68 - 10) / 7));
      g.lineTo(w - 6, h * 0.32 + 4 + i * ((h * 0.68 - 10) / 7));
      g.stroke();
    }
  });

  cell('vent', (w, h) => {
    // a plastered lattice (jali) ventilator, as above the corridor doors and windows
    g.fillStyle = '#ece7dc';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#3d3a36';
    g.fillRect(5, 5, w - 10, h - 10);
    g.strokeStyle = '#ece7dc';
    g.lineWidth = 3;
    for (let x = -h; x < w + h; x += 14) {
      g.beginPath();
      g.moveTo(x, 5);
      g.lineTo(x + h, h - 5);
      g.moveTo(x + h, 5);
      g.lineTo(x, h - 5);
      g.stroke();
    }
    g.fillStyle = '#ece7dc';
    g.fillRect(0, 0, w, 5);
    g.fillRect(0, h - 5, w, 5);
  });

  const texture = tex(c, { repeat: false, aniso: 8 });
  const cells = {};
  for (const [name, [x, y, w, h]] of Object.entries(DECOR)) {
    cells[name] = [x / W, 1 - (y + h) / Hh, (x + w) / W, 1 - y / Hh];
  }
  return { texture, cells };
}

