// Application shell: renderer, quality manager (with automatic fallback), modes, HUD.
import * as THREE from 'three';
import { QUALITY, QUALITY_LEVELS, AUTO_QUALITY, PLAYER } from '../config.js';
import { createWorld } from '../world/world.js';
import { OverviewMode } from '../modes/overview.js';
import { WalkMode } from '../modes/walk.js';
import { Collider } from '../modes/collision.js';
import { createHud } from '../ui/hud.js';

const DEG = Math.PI / 180;
const STORE_KEY = 'mkce360.settings.v1';

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}
function saveSettings(s) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* storage may be blocked (private mode, WebView settings): the app works without it */
  }
}

export class App {
  constructor({ canvas, data, params }) {
    this.canvas = canvas;
    this.data = data;
    this.params = params;
    this.mode = 'overview';
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.coarse = matchMedia('(pointer: coarse)').matches;

    const saved = loadSettings();
    this.settings = {
      quality: saved.quality ?? 'auto',
      shadows: saved.shadows ?? false,
      headBob: saved.headBob ?? !this.reducedMotion,
      invertLook: saved.invertLook ?? false,
    };
    // Start phones one step lower; auto mode raises nothing, it only lowers when needed.
    this.level = this.settings.quality === 'auto' ? (this.coarse ? 1 : 0) : Math.max(0, QUALITY_LEVELS.indexOf(this.settings.quality));
    this._fpsEma = 60;
    this._frameMsEma = 16.7;
    this._auto = { t: 0, acc: 0, n: 0 };
    this.walkTouched = false;
    this.extra = []; // per-frame callbacks from debug/calibrate tools
  }

  async start(onProgress) {
    const canvas = this.canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.world = await createWorld(this.data, { onProgress });

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.2, 4200);
    this.hud = createHud(this);
    this.overview = new OverviewMode({ camera: this.camera, canvas, world: this.world, reducedMotion: this.reducedMotion });
    this.walk = new WalkMode({ camera: this.camera, canvas, world: this.world, joystick: this.hud.joystick, reducedMotion: this.reducedMotion });
    this.walk.headBob = this.settings.headBob;
    this.walk.invertLook = this.settings.invertLook;

    this.overview.onTap = (x, z) => {
      if (this.calibrator?.handleTap(x, z)) return;
      this.overview.setTap(x, z);
      this.hud.showChip(true);
    };

    this._applyQuality();
    this.world.setShadows(this.settings.shadows);
    this._applyShadowFlag();

    // Compile every shader for both modes now, so nothing hitches the first time it comes into view.
    onProgress?.(0.93, 'Preparing graphics');
    this.onResize();
    for (const m of ['walk', 'overview']) {
      this.world.setMode(m);
      this.world.update(this.camera);
      try {
        await this.renderer.compileAsync(this.world.scene, this.camera);
      } catch {
        this.renderer.compile(this.world.scene, this.camera);
      }
    }
    onProgress?.(1, 'Ready');

    this._resize = () => this.onResize();
    window.addEventListener('resize', this._resize);
    window.addEventListener('orientationchange', () => setTimeout(this._resize, 200));
    window.visualViewport?.addEventListener('resize', this._resize);
    this.onResize();

    this.overview.enter();
    this.hud.sync();
    this._last = performance.now();
    this.renderer.setAnimationLoop((t) => this._frame(t));
    return this;
  }

  /** After calibration edits: rebuild buildings/roads and refresh everything that caches them. */
  refreshBuildings() {
    this.world.rebuild();
    this.walk.collider = new Collider(this.world.colliders, this.world.boundary);
    this.overview.labels.setLabels(this.world.labels);
  }

  // ---------- modes ----------

  /** Gate spawn for Walk mode: inside the main gate, facing into the campus. */
  gateSpawn() {
    const g = this.data.gates.find((x) => x.type === 'main');
    return { x: g.spawn.x, z: g.spawn.z, yaw: -g.spawn.headingDeg * DEG };
  }

  async setMode(mode, { spawn = null, instant = false } = {}) {
    if (mode === this.mode || this._switching) return;
    this._switching = true;
    this.hud.sheet.close();
    const swap = () => {
      if (mode === 'walk') {
        this.overview.exit();
        this.hud.showChip(false);
        let s = spawn;
        if (s) {
          // face the campus centre from a tapped point
          const c = this.overview.home.target;
          s = { x: s.x, z: s.z, yaw: Math.atan2(-(c.x - s.x), -(c.z - s.z)) };
        } else s = this.gateSpawn();
        this.world.setMode('walk');
        this.mode = 'walk';
        this.walk.enter(s);
      } else {
        this.walk.exit();
        this.world.setMode('overview');
        this.mode = 'overview';
        this.overview.enter();
      }
      this.onResize();
      this.hud.sync();
    };
    await this.hud.transition(swap, this.reducedMotion || instant);
    this._switching = false;
  }

  toggleFullscreen() {
    const d = document, e = d.documentElement;
    const fs = d.fullscreenElement || d.webkitFullscreenElement;
    if (fs) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    else (e.requestFullscreen || e.webkitRequestFullscreen)?.call(e).catch?.(() => {});
  }

  // ---------- settings ----------

  setSetting(key, value) {
    this.settings[key] = value;
    if (key === 'shadows') {
      this.world.setShadows(value);
      this._applyShadowFlag();
    } else if (key === 'headBob') this.walk.headBob = value;
    else if (key === 'invertLook') this.walk.invertLook = value;
    saveSettings(this.settings);
  }

  setQuality(q) {
    this.settings.quality = q;
    if (q !== 'auto') this.level = QUALITY_LEVELS.indexOf(q);
    this._auto.t = 0;
    this._applyQuality();
    saveSettings(this.settings);
  }

  get qualityName() {
    return QUALITY_LEVELS[this.level];
  }

  _applyQuality() {
    const q = QUALITY[this.qualityName];
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, q.pixelRatio, 2); // never above 2
    this.renderer.setPixelRatio(this.pixelRatio);
    this.world.setQuality(q);
    this.onResize();
  }

  _applyShadowFlag() {
    const on = this.settings.shadows;
    this.renderer.shadowMap.enabled = on;
    this.renderer.shadowMap.needsUpdate = true;
    this.world.sun.shadow.mapSize.set(this.coarse ? 1024 : 2048, this.coarse ? 1024 : 2048);
    if (this.world.sun.shadow.map) {
      this.world.sun.shadow.map.dispose();
      this.world.sun.shadow.map = null;
    }
  }

  // ---------- frame loop ----------

  onResize() {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;
    if (this.mode === 'walk') {
      // wide horizontal view on phones: aim for ~75 deg horizontally, capped vertically
      const fov = 2 * Math.atan(Math.tan((75 * DEG) / 2) / Math.max(aspect, 0.3)) / DEG;
      this.camera.fov = Math.min(95, Math.max(62, fov));
    } else this.camera.fov = aspect < 0.8 ? 58 : 45; // wider on portrait phones so more of the campus fits
    this.camera.updateProjectionMatrix();
  }

  _frame(now) {
    const dt = Math.min(0.25, (now - this._last) / 1000);
    this._last = now;
    if (dt > 0) {
      this._frameMsEma += (dt * 1000 - this._frameMsEma) * 0.05;
      this._fpsEma = 1000 / this._frameMsEma;
    }

    if (this.mode === 'walk') this.walk.update(dt);
    else this.overview.update(dt);
    for (const fn of this.extra) fn(dt);
    this.world.update(this.camera);
    this.renderer.render(this.world.scene, this.camera);
    this._autoQuality(dt);
  }

  _autoQuality(dt) {
    if (this.settings.quality !== 'auto' || dt > 0.2 || document.hidden) return;
    const a = this._auto;
    a.t += dt;
    if (a.t < AUTO_QUALITY.graceSeconds) return;
    a.acc += dt;
    a.n++;
    if (a.acc < AUTO_QUALITY.windowSeconds) return;
    const fps = a.n / a.acc;
    a.acc = 0;
    a.n = 0;
    if (fps < AUTO_QUALITY.fpsFloor && this.level < QUALITY_LEVELS.length - 1) {
      this.level++;
      a.t = AUTO_QUALITY.graceSeconds - 1.5; // re-measure soon after the change
      this._applyQuality();
      this.hud.toast(`Frame rate was ${Math.round(fps)} fps, so graphics were set to ${this.qualityName}.`);
    }
  }

  stats() {
    const i = this.renderer.info.render;
    return {
      fps: Math.round(this._fpsEma * 10) / 10,
      frameMs: Math.round(this._frameMsEma * 100) / 100,
      drawCalls: i.calls,
      triangles: i.triangles,
      quality: this.qualityName,
      qualitySetting: this.settings.quality,
      mode: this.mode,
      pixelRatio: this.pixelRatio,
      eyeHeight: PLAYER.eyeHeight,
    };
  }
}
