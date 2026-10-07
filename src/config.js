// Tunable constants. No campus facts live here (those are in src/data/campus.json).

export const PLAYER = {
  eyeHeight: 1.6, // m
  walkSpeed: 1.4, // m/s
  runSpeed: 3.2, // m/s
  radius: 0.35, // m, collision radius
  pitchLimitDeg: 75,
  accelTime: 0.12, // s, smoothing time constant for velocity
  bobAmplitude: 0.035, // m
  bobStepLength: 0.75, // m per bob cycle
};

export const FLOOR_HEIGHT = 3.6; // m, drives facade tiling only
export const BAY_WIDTH = 3.6; // m

// Wall/roof colours by building type (inspired by the campus photos: lavender-blue and cream blocks,
// white hostels, terracotta tile roofs on sheds). Purely visual.
export const TYPE_STYLE = {
  department: { wall: 0xa9b5de, roof: 0xd9d3c5, trim: 0xf1ead6 },
  lab: { wall: 0xf1ede3, roof: 0xcdbca4, trim: 0xe8dfcb },
  library: { wall: 0xe9dfc8, roof: 0xd9d3c5, trim: 0xf1ead6 },
  canteen: { wall: 0xf0dcae, roof: 0xc2694a, trim: 0xf6ecd0 },
  parking: { wall: 0x9aa0a6, roof: 0x6e8199, trim: 0xb9bec4 },
  sports: { wall: 0xcfd3d6, roof: 0xb9bec4, trim: 0xe6e8ea },
  admin: { wall: 0xe9dfc8, roof: 0xc8c2b4, trim: 0xf1ead6 },
  hostel: { wall: 0xe6ecf2, roof: 0xd0cfc8, trim: 0xf6f1e4 },
  other: { wall: 0xe6dfd0, roof: 0xc8c2b4, trim: 0xf1ead6 },
};

// Overview/debug overlay colours by type.
export const TYPE_ACCENT = {
  department: '#6f86d6',
  lab: '#d9743d',
  library: '#9b6ed3',
  canteen: '#e0a526',
  parking: '#7a8794',
  sports: '#2fae6a',
  admin: '#c7a15b',
  hostel: '#4aa3d8',
  other: '#9aa0a6',
};

export const QUALITY_LEVELS = ['high', 'medium', 'low'];
export const QUALITY = {
  high: { pixelRatio: 2, palms: 1, trees: 1, lamps: 1, fronds: true, fogFar: 650 },
  medium: { pixelRatio: 1.5, palms: 0.55, trees: 0.7, lamps: 0.6, fronds: true, fogFar: 520 },
  low: { pixelRatio: 1, palms: 0.25, trees: 0.4, lamps: 0.3, fronds: false, fogFar: 420 },
};

export const AUTO_QUALITY = {
  fpsFloor: 30, // drop one level when average fps stays below this
  graceSeconds: 4, // ignore the first seconds (shader compile, texture upload)
  windowSeconds: 2.5,
};

export const OVERVIEW = {
  minDistance: 40,
  maxDistance: 1500,
  maxPolarDeg: 80,
  minHeight: 6,
};

export const COLORS = {
  skyTop: '#3f86d4',
  skyHorizon: '#d4e8f6',
  fog: 0xd4e8f6,
  grass: '#5c8f3a',
};
