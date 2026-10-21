// Assembles the whole campus scene from campus.json.
import * as THREE from 'three';
import { COLORS, QUALITY } from '../config.js';
import * as TX from './textures.js';
import { createBuildings } from './buildings.js';
import { createRoads } from './roads.js';
import { createScenery } from './scenery.js';
import { DEG } from './geo.js';
import { insideFootprint } from '../data/footprint.js';

function loadTexture(url, onProgress) {
  return new Promise((resolve) => {
    new THREE.TextureLoader().load(
      url,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        resolve(t);
      },
      (e) => e.total && onProgress?.(e.loaded / e.total),
      () => resolve(null), // offline or missing: the app still works with a plain ground
    );
  });
}

export async function createWorld(data, { onProgress = () => {} } = {}) {
  onProgress(0.05, 'Preparing textures');
  const T = {
    facadeBlock: TX.facadeBlock(),
    facadeShed: TX.facadeShed(),
    facadePlain: TX.facadePlain(),
    roofFlat: TX.roofFlat(),
    roofTile: TX.roofTile(),
    concrete: TX.concreteTexture(),
    fence: TX.fenceTexture(),
    asphaltRoad: TX.asphaltRoad(),
    asphaltPlain: TX.asphaltPlain(),
    paver: TX.paverTexture(),
    kerb: TX.kerbTexture(),
    grass: TX.grassTexture(),
  };

  onProgress(0.15, 'Loading satellite image');
  const satTex = await loadTexture(import.meta.env.BASE_URL + data.satellite.url, (f) => onProgress(0.15 + f * 0.4, 'Loading satellite image'));

  onProgress(0.6, 'Building campus');
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  root.name = 'campus-root';
  scene.add(root);

  // ---------- ground ----------
  T.grass.repeat.set(250, 250);
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(2000, 2000).rotateX(-Math.PI / 2),
    // pushed back so the satellite plane (0.012 m above) never z-fights with it when seen from far away
    new THREE.MeshLambertMaterial({ map: T.grass, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }),
  );
  grass.position.set(-260, 0, 80);
  grass.receiveShadow = true;
  grass.name = 'ground';
  root.add(grass);

  const sat = new THREE.Mesh(
    new THREE.PlaneGeometry(data.satellite.size.w, data.satellite.size.d).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: satTex, color: satTex ? 0xffffff : 0x6b8a4a }),
  );
  sat.position.set(data.satellite.centre.x, 0.012, data.satellite.centre.z);
  sat.name = 'satellite';
  root.add(sat);

  // ---------- buildings & roads (rebuildable for calibration) ----------
  let built, roads;
  const disposeGroup = (g) => {
    g.traverse((o) => {
      o.geometry?.dispose?.();
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) m.dispose?.(); // shared canvas textures (T.*) are kept
    });
  };
  const buildBuildings = () => {
    const builder = createBuildings(data, T);
    for (const b of data.buildings) builder.addBuilding(b);
    built = builder.finalize(data.buildings, data.points);
    root.add(built.group);
  };
  const buildRoads = () => {
    roads = createRoads(data, T, built.doorFrames);
    root.add(roads.group);
  };
  buildBuildings();
  onProgress(0.75, 'Laying roads');
  buildRoads();

  onProgress(0.85, 'Planting trees');
  const scenery = createScenery(data, T, { doorFrames: built.doorFrames, colliders: built.colliders });
  root.add(scenery.group);

  // ---------- sky, light, fog ----------
  const skyTex = TX.skyTexture();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(2400, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(0xe6f2ff, 0x6a8a4c, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d4, 1.55);
  sun.position.set(-90, 260, 170);
  sun.target.position.set(0, 0, 0);
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -110;
  sc.right = 110;
  sc.top = 110;
  sc.bottom = -110;
  sc.near = 10;
  sc.far = 700;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.4;
  scene.add(sun, sun.target);

  scene.fog = new THREE.Fog(COLORS.fog, 100, 650);
  scene.background = new THREE.Color(COLORS.skyHorizon);

  // ---------- bounds ----------
  const bp = data.boundary.points;
  const bounds = {
    minX: Math.min(...bp.map((p) => p.x)), maxX: Math.max(...bp.map((p) => p.x)),
    minZ: Math.min(...bp.map((p) => p.z)), maxZ: Math.max(...bp.map((p) => p.z)),
  };

  let mode = 'overview';
  let indoorT = 0; // 0 in the open .. 1 deep inside a building (light and fog follow it smoothly)
  let indoor = null;
  const outdoorLights = { hemi: hemi.intensity, sun: sun.intensity, sky: hemi.color.getHex(), ground: hemi.groundColor.getHex() };
  const tmpCol = new THREE.Color();
  let quality = QUALITY.high;
  let shadows = false;

  const world = {
    scene, root, sun, hemi, sky, bounds,
    colliders: built.colliders,
    boundary: bp,
    labels: built.labels,
    doorFrames: built.doorFrames,
    data,
    satelliteImage: satTex?.image ?? null,
    parts: { grass, satellite: sat, roads: roads.group, buildings: built.group, scenery: scenery.group, courtWalls: built.courtWalls, courtTrees: scenery.courtTrees },
    get mode() { return mode; },

    /**
     * How far inside a building the viewer is, 0 (in the open) to 1 (inside): the light and the fog change gently with it, so walking
     * in through a door goes from the sun to the softer light of a hall (no shader changes, only uniforms). `look` is the indoor look.
     */
    setIndoor(t, look = null) {
      if (look) indoor = look;
      t = Math.round(t * 100) / 100;
      if (t === indoorT || !indoor) return;
      indoorT = t;
      hemi.intensity = outdoorLights.hemi + (indoor.hemi - outdoorLights.hemi) * t;
      sun.intensity = outdoorLights.sun + (indoor.sun - outdoorLights.sun) * t;
      hemi.color.set(outdoorLights.sky).lerp(tmpCol.set(indoor.hemiSky ?? 0xfff4e2), t); // warm indoor light, no green bounce from the lawn on the ceiling
      hemi.groundColor.set(outdoorLights.ground).lerp(tmpCol.set(indoor.hemiGround ?? 0xc9c1b2), t);
      this.applyFog();
    },
    get indoor() { return indoorT; },
    /** boxes for the car: the trunks, lamp posts and benches that are drawn */
    sceneryObstacles() {
      return scenery.obstacles();
    },
    /** deep inside a building the palms and trees cannot be seen (the walls and the roof are in the way): they are not drawn */
    setDeep(on) {
      for (const name of ['palms', 'trees']) {
        const m = scenery.group.getObjectByName(name);
        if (m) m.visible = !on;
      }
    },
    /** overview shows the satellite photo, the courtyard skin of the blocks and their courtyard trees; the ground-level modes (walk, drive) the roads */
    setMode(m) {
      mode = m;
      const low = m !== 'overview';
      sat.visible = !low;
      roads.group.visible = low;
      if (built.courtWalls) built.courtWalls.visible = !low;
      scenery.courtTrees.visible = !low;
      this.applyFog();
    },
    /** Rebuild buildings and roads from `data` (after calibration edits). Scenery is left as is. */
    rebuild() {
      root.remove(built.group);
      root.remove(roads.group);
      disposeGroup(built.group);
      disposeGroup(roads.group);
      buildBuildings();
      buildRoads();
      roads.group.visible = mode === 'walk';
      this.colliders = built.colliders;
      this.labels = built.labels;
      this.doorFrames = built.doorFrames;
      this.parts.buildings = built.group;
      this.parts.courtWalls = built.courtWalls;
      this.parts.roads = roads.group;
      if (built.courtWalls) built.courtWalls.visible = mode === 'overview';
      if (shadows) this.setShadows(true);
    },
    setQuality(q) {
      quality = q;
      scenery.setQuality(q);
      this.applyFog();
    },
    applyFog() {
      if (mode === 'overview') {
        scene.fog.near = 2600;
        scene.fog.far = 7000;
        return;
      }
      const near = 90, far = quality.fogFar, t = indoorT;
      scene.fog.near = indoor ? near + (indoor.fogNear - near) * t : near;
      scene.fog.far = indoor ? far + (indoor.fogFar - far) * t : far;
    },
    setShadows(on) {
      shadows = on;
      sun.castShadow = on;
      scene.traverse((o) => {
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true));
      });
    },
    get shadows() { return shadows; },
    /** Per-frame upkeep: keep the sky centred on the camera and the shadow window around the viewer. */
    update(camera) {
      sky.position.set(camera.position.x, 0, camera.position.z);
      if (shadows) {
        const p = camera.position;
        sun.target.position.set(p.x, 0, p.z);
        sun.position.set(p.x - 90, 260, p.z + 170);
        sun.target.updateMatrixWorld();
      }
    },
    /** Which building (by ground footprint) is at x/z, or null. */
    buildingAt(x, z) {
      for (const b of data.buildings) {
        const dx = x - b.position.x, dz = z - b.position.z, r = -b.rotationDeg * DEG;
        const c = Math.cos(r), s = Math.sin(r);
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        if (Math.abs(lx) <= b.size.w / 2 && Math.abs(lz) <= b.size.d / 2) return b;
      }
      return null;
    },
    /** The building a ray hits (roof plane first, then ground), or null. Used for taps in Overview. */
    pickBuilding(origin, dir) {
      let best = null, bt = Infinity;
      if (Math.abs(dir.y) < 1e-6) return null;
      for (const b of data.buildings) {
        const h = b.form === 'court' || b.form === 'field' ? 0.1 : Math.max(b.heightM ?? 3, 1);
        for (const y of [h, 0.05]) {
          const t = (y - origin.y) / dir.y;
          if (t <= 0 || t >= bt) continue;
          if (insideFootprint(b, origin.x + dir.x * t, origin.z + dir.z * t, -0.4)) {
            best = b;
            bt = t;
          }
        }
      }
      return best;
    },
    dispose() {
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const m of mats) {
          m.map?.dispose?.();
          m.dispose?.();
        }
      });
    },
  };
  world.setQuality(quality);
  world.setMode('overview');
  onProgress(1, 'Ready');
  return world;
}
