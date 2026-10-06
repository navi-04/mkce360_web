// The glowing route line on the ground and the destination beacon. One ribbon mesh (one draw call) plus a beam.
// The shaders scale the line with the camera distance, so it reads from the Overview and from eye height alike.
import * as THREE from 'three';

const GOLD = 0xffc83d;
const Y = 0.1;

const ribbonVert = /* glsl */ `
  uniform float uWidth;
  attribute float aSide;
  attribute float aDist;
  attribute vec2 aNorm;
  varying float vDist;
  varying float vSide;
  #include <fog_pars_vertex>
  void main() {
    vec3 p = position + vec3(aNorm.x, 0.0, aNorm.y) * aSide * uWidth * 0.5;
    vDist = aDist;
    vSide = aSide;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const ribbonFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uWidth;
  uniform float uFrom;
  uniform float uOpacity;
  varying float vDist;
  varying float vSide;
  #include <fog_pars_fragment>
  void main() {
    float a = abs(vSide);
    float edge = smoothstep(1.0, 0.8, a);
    float period = max(2.6, uWidth * 1.7);
    float phase = (vDist - a * uWidth * 0.42) / period - uTime;
    float f = fract(phase);
    float chev = smoothstep(0.0, 0.07, f) * (1.0 - smoothstep(0.3, 0.38, f));
    vec3 col = mix(uColor, vec3(1.0, 0.97, 0.82), chev * 0.9);
    col = mix(col, vec3(0.05, 0.11, 0.2), smoothstep(0.72, 0.95, a) * 0.6); // dark rim keeps it readable on any ground
    float behind = smoothstep(uFrom - 1.5, uFrom + 0.5, vDist);             // the part already walked fades away
    float alpha = edge * uOpacity * (0.8 + 0.2 * chev) * behind;
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

const beamVert = /* glsl */ `
  varying float vH;
  varying vec3 vW;
  #include <fog_pars_vertex>
  void main() {
    vH = uv.y;
    vW = (modelMatrix * vec4(position, 1.0)).xyz;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const beamFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uFade;
  uniform vec2 uAxis;
  varying float vH;
  varying vec3 vW;
  #include <fog_pars_fragment>
  void main() {
    float pulse = 0.78 + 0.22 * sin(uTime * 9.0);
    float a = mix(0.55, pow(1.0 - vH, 1.6) * 0.8, uFade) * pulse;
    a *= smoothstep(3.0, 9.0, distance(cameraPosition.xz, uAxis)); // never flood the view when standing next to it
    gl_FragColor = vec4(uColor, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

function emptyRibbon() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  g.setAttribute('aSide', new THREE.BufferAttribute(new Float32Array(3), 1));
  g.setAttribute('aDist', new THREE.BufferAttribute(new Float32Array(3), 1));
  g.setAttribute('aNorm', new THREE.BufferAttribute(new Float32Array(6), 2));
  return g;
}

export class RouteLayer {
  constructor(scene, { reducedMotion = false } = {}) {
    this.reducedMotion = reducedMotion;
    this.group = new THREE.Group();
    this.group.name = 'route';
    this.time = 0;
    this.route = null;
    this.width = 1.35;

    this.ribbonMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { uColor: { value: new THREE.Color(GOLD) }, uTime: { value: 0 }, uWidth: { value: 1.35 }, uFrom: { value: -10 }, uOpacity: { value: 0.95 } },
      ]),
      vertexShader: ribbonVert,
      fragmentShader: ribbonFrag,
      transparent: true,
      depthWrite: false,
      fog: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.ribbon = new THREE.Mesh(emptyRibbon(), this.ribbonMat);
    this.ribbon.frustumCulled = false;
    this.ribbon.renderOrder = 40;

    const beamUniforms = () =>
      THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: new THREE.Color(GOLD) }, uTime: { value: 0 }, uFade: { value: 1 }, uAxis: { value: new THREE.Vector2() } }]);
    const mk = (fade) => {
      const u = beamUniforms();
      u.uFade.value = fade;
      return new THREE.ShaderMaterial({ uniforms: u, vertexShader: beamVert, fragmentShader: beamFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true });
    };
    this.beamMat = mk(1);
    this.ringMat = mk(0);
    this.beam = new THREE.Group();
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 18, 14, 1, true).translate(0, 9, 0), this.beamMat);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.45, 36).rotateX(-Math.PI / 2).translate(0, 0.14, 0), this.ringMat);
    cyl.renderOrder = ring.renderOrder = 41;
    this.beam.add(cyl, ring);

    this.group.add(this.ribbon, this.beam);
    scene.add(this.group);
    // Hidden, but part of the scene so the start-up shader precompile covers both materials.
    this.group.visible = false;
    this.beam.position.set(0, -50, 0);
  }

  /** @param route object from planRoute() */
  setRoute(route) {
    this.route = route;
    const p = route.poly.p, cum = route.poly.cum, n = p.length;
    const pos = new Float32Array(n * 2 * 3), side = new Float32Array(n * 2), dist = new Float32Array(n * 2), norm = new Float32Array(n * 2 * 2);
    const segN = [];
    for (let i = 0; i < n - 1; i++) {
      const dx = p[i + 1].x - p[i].x, dz = p[i + 1].z - p[i].z, l = Math.hypot(dx, dz) || 1;
      segN.push([-dz / l, dx / l]);
    }
    for (let i = 0; i < n; i++) {
      const a = segN[Math.max(0, i - 1)], b = segN[Math.min(n - 2, i)];
      let nx = a[0] + b[0], nz = a[1] + b[1];
      const l = Math.hypot(nx, nz);
      if (l < 1e-3) { nx = a[0]; nz = a[1]; } else { nx /= l; nz /= l; }
      const k = Math.min(2, 1 / Math.max(0.5, nx * b[0] + nz * b[1]));
      for (let s = 0; s < 2; s++) {
        const v = i * 2 + s;
        pos.set([p[i].x, Y, p[i].z], v * 3);
        side[v] = s === 0 ? -1 : 1;
        dist[v] = cum[i];
        norm.set([nx * k, nz * k], v * 2);
      }
    }
    const idx = [];
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    g.setAttribute('aDist', new THREE.BufferAttribute(dist, 1));
    g.setAttribute('aNorm', new THREE.BufferAttribute(norm, 2));
    g.setIndex(idx);
    this.ribbon.geometry.dispose();
    this.ribbon.geometry = g;

    // beacon at the destination, just outside the door
    const end = p[n - 1], prev = p[n - 2] ?? end;
    const dx = prev.x - end.x, dz = prev.z - end.z, l = Math.hypot(dx, dz) || 1;
    this.beam.position.set(end.x + (dx / l) * 0.8, 0, end.z + (dz / l) * 0.8);
    this.ribbonMat.uniforms.uFrom.value = -10;
    this.group.visible = true;
  }

  clear() {
    this.route = null;
    this.group.visible = false;
    this.beam.position.set(0, -50, 0);
  }

  /** hide the part of the line behind the walker (s in metres along the route) */
  setProgress(s) {
    this.ribbonMat.uniforms.uFrom.value = s;
  }

  update(dt, camera, mode) {
    if (!this.group.visible) return;
    if (!this.reducedMotion) this.time += dt;
    const walk = mode === 'walk';
    // a ribbon of fixed width vanishes from far away: widen it with the camera height in Overview
    const w = walk ? 1.35 : Math.min(16, Math.max(2.2, camera.position.y * 0.011));
    this.ribbonMat.uniforms.uWidth.value = w;
    this.ribbonMat.uniforms.uTime.value = this.time * 0.55;
    this.ribbonMat.depthTest = walk; // from far above, depth precision would fight with the ground; draw on top
    this.beamMat.uniforms.uTime.value = this.time;
    this.ringMat.uniforms.uTime.value = this.time;
    this.beamMat.uniforms.uAxis.value.set(this.beam.position.x, this.beam.position.z);
    this.ringMat.uniforms.uAxis.value.set(this.beam.position.x, this.beam.position.z);
    const d = Math.hypot(camera.position.x - this.beam.position.x, camera.position.y, camera.position.z - this.beam.position.z);
    const k = walk ? 1 : Math.min(14, Math.max(1, d / 85));
    this.beam.scale.set(k, walk ? 1 : k * 0.8, k);
    this.beamMat.depthTest = walk;
    this.ringMat.depthTest = walk;
  }
}
