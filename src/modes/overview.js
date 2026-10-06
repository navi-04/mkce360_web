// Overview: orbit camera over the satellite-textured ground (rotate, zoom, pan, reset), clamped above ground.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OVERVIEW, TYPE_ACCENT } from '../config.js';

const DEG = Math.PI / 180;

export class OverviewMode {
  constructor({ camera, canvas, world, reducedMotion }) {
    this.camera = camera;
    this.canvas = canvas;
    this.world = world;
    this.active = false;

    const b = world.bounds;
    this.home = {
      target: new THREE.Vector3((b.minX + b.maxX) / 2 + 60, 0, (b.minZ + b.maxZ) / 2 - 20),
      distance: 860,
      polar: 50 * DEG,
      azimuth: 0,
    };
    this.pose = null;

    const c = new OrbitControls(camera, canvas);
    c.enabled = false;
    c.enableDamping = !reducedMotion;
    c.dampingFactor = 0.09;
    c.screenSpacePanning = false; // pan along the ground, not into the sky
    c.minDistance = OVERVIEW.minDistance;
    c.maxDistance = OVERVIEW.maxDistance;
    c.maxPolarAngle = OVERVIEW.maxPolarDeg * DEG;
    c.minPolarAngle = 0.05;
    c.rotateSpeed = 0.7;
    c.zoomSpeed = 0.9;
    c.zoomToCursor = true;
    c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    c.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.controls = c;

    this.tapMarker = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 3.2, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffd34d, depthTest: false, transparent: true }),
    );
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 14, 8).translate(0, 7, 0),
      new THREE.MeshBasicMaterial({ color: 0xffd34d, depthTest: false }),
    );
    ring.renderOrder = pole.renderOrder = 60;
    this.tapMarker.add(ring, pole);
    this.tapMarker.visible = false;
    world.scene.add(this.tapMarker);
    this.tapPoint = null;

    this.onTap = null;
    this._ray = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._down = null;
    this._pd = (e) => {
      this._down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, n: (this._down?.n ?? 0) + 1 };
    };
    this._pu = (e) => {
      const d = this._down;
      this._down = null;
      if (!d || d.id !== e.pointerId) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (performance.now() - d.t < 320 && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8) this._tap(e);
    };

    this.labels = new OverviewLabels(world, camera, canvas);
  }

  enter() {
    this.active = true;
    this.controls.enabled = true;
    if (this.pose) {
      this.camera.position.copy(this.pose.pos);
      this.controls.target.copy(this.pose.target);
    } else this.reset(false);
    this.controls.update();
    this.canvas.addEventListener('pointerdown', this._pd);
    this.canvas.addEventListener('pointerup', this._pu);
    this.labels.show(true);
  }

  exit() {
    this.pose = { pos: this.camera.position.clone(), target: this.controls.target.clone() };
    this.active = false;
    this.controls.enabled = false;
    this.canvas.removeEventListener('pointerdown', this._pd);
    this.canvas.removeEventListener('pointerup', this._pu);
    this.labels.show(false);
    this.clearTap();
  }

  /** Back to the starting view of the whole campus. */
  reset(animate = true) {
    const h = this.home;
    const target = h.target.clone();
    const pos = new THREE.Vector3(
      target.x + h.distance * Math.sin(h.polar) * Math.sin(h.azimuth),
      target.y + h.distance * Math.cos(h.polar),
      target.z + h.distance * Math.sin(h.polar) * Math.cos(h.azimuth),
    );
    if (!animate) {
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.controls.update();
      return;
    }
    this._tween = {
      t: 0, dur: 0.7,
      fromPos: this.camera.position.clone(), toPos: pos,
      fromTarget: this.controls.target.clone(), toTarget: target,
    };
  }

  /** Fly to look at a point (used by search later). */
  focus(x, z, distance = 160) {
    const target = new THREE.Vector3(x, 0, z);
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this._tween = {
      t: 0, dur: 0.8,
      fromPos: this.camera.position.clone(), toPos: target.clone().add(dir.multiplyScalar(distance)),
      fromTarget: this.controls.target.clone(), toTarget: target,
    };
  }

  pickGround(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    this._ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this._ray.setFromCamera(this._ndc, this.camera);
    const { origin, direction } = this._ray.ray;
    if (direction.y > -0.002) return null;
    const t = -origin.y / direction.y;
    return { x: origin.x + direction.x * t, z: origin.z + direction.z * t };
  }

  setTap(x, z) {
    this.tapPoint = { x, z };
    this.tapMarker.position.set(x, 0.1, z);
    this.tapMarker.visible = true;
  }

  clearTap() {
    this.tapPoint = null;
    this.tapMarker.visible = false;
  }

  _tap(e) {
    const g = this.pickGround(e.clientX, e.clientY);
    if (!g) return;
    this.onTap?.(g.x, g.z, e);
  }

  update(dt) {
    if (!this.active) return;
    if (this._tween) {
      const tw = this._tween;
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      const k = tw.t * tw.t * (3 - 2 * tw.t);
      this.camera.position.lerpVectors(tw.fromPos, tw.toPos, k);
      this.controls.target.lerpVectors(tw.fromTarget, tw.toTarget, k);
      if (tw.t >= 1) this._tween = null;
    }
    // keep the pivot inside the campus (+ margin) and the camera above ground
    const b = this.world.bounds, m = 90;
    const t = this.controls.target;
    t.x = Math.min(b.maxX + m, Math.max(b.minX - m, t.x));
    t.z = Math.min(b.maxZ + m, Math.max(b.minZ - m, t.z));
    t.y = 0;
    this.controls.update();
    if (this.camera.position.y < OVERVIEW.minHeight) this.camera.position.y = OVERVIEW.minHeight;
    this.labels.update();
  }
}

/** Building names as DOM labels over the canvas; greedy de-overlap so they stay readable. */
class OverviewLabels {
  constructor(world, camera, canvas) {
    this.camera = camera;
    this.canvas = canvas;
    this.root = document.createElement('div');
    this.root.className = 'labels';
    this.root.setAttribute('aria-hidden', 'true');
    canvas.parentElement.appendChild(this.root);
    this.root.style.display = 'none';
    this.visible = false;
    this._rects = [];
    this.items = [];
    this._lastCam = new Float32Array(18);
    this.setLabels(world.labels);
  }

  setLabels(labels) {
    this.root.replaceChildren();
    this.items = labels.map((l) => {
      const el = document.createElement('div');
      el.className = 'lbl';
      el.style.setProperty('--accent', TYPE_ACCENT[l.type] ?? '#9aa0a6');
      const num = document.createElement('b');
      num.textContent = l.number != null ? String(l.number) : '?';
      const txt = document.createElement('span');
      txt.textContent = l.text; // textContent: names come from data, never parsed as HTML
      el.append(num, txt);
      return { ...l, el, v: new THREE.Vector3() };
    });
    this.items.sort((a, b) => b.y - a.y); // taller buildings get label space first
    this._lastCam[0] = NaN; // force a layout on the next frame
    for (const it of this.items) this.root.appendChild(it.el);
  }

  show(on) {
    this.visible = on;
    this.root.style.display = on ? '' : 'none';
  }

  update() {
    if (!this.visible) return;
    const cam = this.camera;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    // nothing to do while the camera and canvas are unchanged (saves DOM writes on phones)
    const e = cam.matrixWorld.elements, last = this._lastCam;
    let same = last[16] === w && last[17] === h;
    for (let i = 0; i < 16 && same; i++) if (last[i] !== e[i]) same = false;
    if (same) return;
    for (let i = 0; i < 16; i++) last[i] = e[i];
    last[16] = w;
    last[17] = h;
    const showText = cam.position.y < 380;
    const placed = this._rects;
    placed.length = 0;
    for (const it of this.items) {
      it.v.set(it.x, it.y, it.z).project(cam);
      const sx = (it.v.x * 0.5 + 0.5) * w, sy = (-it.v.y * 0.5 + 0.5) * h;
      let ok = it.v.z > -1 && it.v.z < 1 && sx > -20 && sx < w + 20 && sy > -20 && sy < h + 20;
      let rect = null;
      if (ok) {
        const tw = showText ? 14 + it.text.length * 6.4 : 26;
        rect = [sx - tw / 2, sy - 13, sx + tw / 2, sy + 13];
        for (const r of placed) {
          if (rect[0] < r[2] && rect[2] > r[0] && rect[1] < r[3] && rect[3] > r[1]) {
            ok = false;
            break;
          }
        }
      }
      if (!ok) {
        it.el.style.display = 'none';
        continue;
      }
      placed.push(rect);
      it.el.style.display = '';
      it.el.classList.toggle('compact', !showText);
      it.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -50%)`;
    }
  }
}
