// Turns campus.json buildings into merged meshes: extruded blocks with windows, a visible door,
// a roof and a name sign, coloured by type. Everything is baked into a few merged geometries.
import * as THREE from 'three';
import { TYPE_STYLE, FLOOR_HEIGHT, BAY_WIDTH } from '../config.js';
import {
  boxGeo, wallsGeo, gableGeo, flatQuad, signQuad, cylGeo, place, paint, merge, DEG, vary, rng, hashString,
} from './geo.js';
import { signAtlas, courtTexture, fieldTexture } from './textures.js';

const SHORT_H = 6.5; // below this height a building uses the single-storey facade

export function createBuildings(data, T) {
  const acc = {
    wallsBlock: [], wallsShed: [], wallsPlain: [], roofFlat: [], roofTile: [], solid: [], concrete: [], fence: [],
  };
  const courts = []; // individually textured meshes
  const signReq = [];
  const colliders = [];
  const labels = [];
  const solar = []; // instanced solar panels
  const doorFrames = []; // outward door frames, used for forecourts and benches
  const tmpM = new THREE.Matrix4();

  const fencePlane = (L, H) => {
    const g = signQuad(L, H, [0, 0, L / 1.2, H / 1.2]);
    return g;
  };

  function addBuilding(b) {
    const style = TYPE_STYLE[b.type] ?? TYPE_STYLE.other;
    const wallCol = vary(style.wall, b.id);
    const roofCol = vary(style.roof, b.id, 0.03);
    const trimCol = style.trim;
    const rotY = -b.rotationDeg * DEG; // three.js: positive = counter-clockwise from above
    const M = new THREE.Matrix4().makeTranslation(b.position.x, 0, b.position.z).multiply(tmpM.clone().makeRotationY(rotY));
    const h = b.heightM;
    const { w, d } = b.size;

    const put = (list, geo, color) => {
      paint(geo, color);
      geo.applyMatrix4(M);
      list.push(geo);
    };
    const obbOf = (r) => {
      const c = new THREE.Vector3(r.x, 0, r.z).applyMatrix4(M);
      colliders.push({ id: b.id, cx: c.x, cz: c.z, hw: r.w / 2, hd: r.d / 2, rot: rotY });
    };

    const mass = (rects, height, { towers = true } = {}) => {
      const short = height <= SHORT_H;
      for (const r of rects) {
        const wg = wallsGeo(r.w, height, r.d, { floorH: short ? height : FLOOR_HEIGHT, bayW: BAY_WIDTH });
        place(wg, r.x, 0, r.z);
        put(short ? acc.wallsShed : acc.wallsBlock, wg, wallCol);
        const rg = boxGeo(r.w + 0.7, 0.5, r.d + 0.7, { scale: 4, y: height });
        place(rg, r.x, 0, r.z);
        put(acc.roofFlat, rg, roofCol);
      }
      if (towers && height >= 10 && rects.length) {
        const r = rects[0];
        const tg = boxGeo(3.6, 2.8, 3.6, { y: height + 0.5 });
        place(tg, r.x + r.w / 2 - 3.5, 0, r.z - r.d / 2 + 3.5);
        put(acc.wallsPlain, tg, trimCol);
        const tank = cylGeo(1.0, 1.0, 1.6, 8, height + 0.5);
        place(tank, r.x - r.w / 2 + 4, 0, r.z + r.d / 2 - 4);
        put(acc.solid, tank, 0x2a3a4c);
      }
    };

    const door = (hasPortico) => {
      const inv = M.clone().invert();
      const l = new THREE.Vector3(b.doorPosition.x, 0, b.doorPosition.z).applyMatrix4(inv);
      const hw = w / 2, hd = d / 2;
      const ds = [Math.abs(l.x - hw), Math.abs(l.x + hw), Math.abs(l.z - hd), Math.abs(l.z + hd)];
      const k = ds.indexOf(Math.min(...ds));
      const ln = [[1, 0], [-1, 0], [0, 1], [0, -1]][k];
      const n = new THREE.Vector3(ln[0], 0, ln[1]).applyMatrix4(tmpM.clone().makeRotationY(rotY));
      const theta = Math.atan2(n.x, n.z);
      const px = b.doorPosition.x + n.x * 0.06, pz = b.doorPosition.z + n.z * 0.06;
      const porch = b.porch ?? null;
      if (porch) entrancePorch(porch, n, theta, px, pz);
      else {
        const leaf = boxGeo(1.9, 2.5, 0.14);
        place(leaf, px, 0, pz, theta);
        paint(leaf, 0x7a3f28);
        acc.solid.push(leaf);
        const frame = boxGeo(2.4, 2.9, 0.1);
        place(frame, px - n.x * 0.04, 0, pz - n.z * 0.04, theta);
        paint(frame, trimCol);
        acc.solid.push(frame);
        if (hasPortico) {
          const slab = boxGeo(4.8, 0.28, 2.4, { y: 3.05 });
          place(slab, px + n.x * 1.1, 0, pz + n.z * 1.1, theta);
          paint(slab, trimCol);
          acc.solid.push(slab);
          for (const sx of [-2.2, 2.2]) {
            const col = boxGeo(0.34, 3.05, 0.34);
            const o = new THREE.Vector3(sx, 0, 2.15).applyMatrix4(tmpM.clone().makeRotationY(theta));
            place(col, px + o.x, 0, pz + o.z, theta);
            paint(col, trimCol);
            acc.solid.push(col);
          }
        }
      }
      // reach/half: how far a porch stands out from the door and half its width (lamps, benches and trees keep clear of it)
      doorFrames.push({ id: b.id, x: px, z: pz, nx: n.x, nz: n.z, theta, portico: hasPortico, type: b.type, form: b.form, h, reach: porch?.d ?? 0, half: porch ? porch.w / 2 : 0 });
      return { n, theta, px, pz, porch };
    };

    /**
     * The entrance porch (`porch: {w, d, h, doorW}` in campus.json): a flat concrete roof on square columns, two low steps, a wide
     * glass entrance in the facade. w across the face, d out from it, h to the top of the roof slab. Drawn in the door's frame:
     * `lat` runs along the facade, `out` away from it.
     */
    function entrancePorch({ w, d, h, doorW = 4.8 }, n, theta, px, pz) {
      const side = new THREE.Vector3(1, 0, 0).applyMatrix4(tmpM.clone().makeRotationY(theta));
      const at = (lat, out) => ({ x: px + side.x * lat + n.x * out, z: pz + side.z * lat + n.z * out });
      const slab = (lat0, lat1, out0, out1, y0, y1, color) => {
        const g = boxGeo(lat1 - lat0, y1 - y0, out1 - out0, { y: y0 });
        const c = at((lat0 + lat1) / 2, (out0 + out1) / 2);
        place(g, c.x, 0, c.z, theta);
        paint(g, color);
        acc.solid.push(g);
        return c;
      };
      /** the underside of the roof: wound to face down but lit as if it faced up, so it reads as pale concrete in shade, not green from the ground light */
      const soffit = (lat0, lat1, out0, out1, y, color) => {
        const P = [at(lat0, out0), at(lat1, out0), at(lat1, out1), at(lat0, out1)];
        const up = (P[1].z - P[0].z) * (P[2].x - P[0].x) - (P[1].x - P[0].x) * (P[2].z - P[0].z) > 0; // is this winding facing up?
        const order = up ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(order.flatMap((i) => [P[i].x, y - 0.012, P[i].z]), 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(order.flatMap(() => [0, 1, 0]), 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(order.flatMap(() => [0, 0]), 2));
        paint(g, color);
        acc.solid.push(g);
      };
      const PARAPET = 1.5;
      const concrete = 0xd8d2c4, light = 0xf6f2e6, post = 0xf3eee2, steel = 0x34414a, glass = 0x8fb2c6;
      const hw = w / 2;
      // two steps up to the porch floor
      slab(-hw - 0.3, hw + 0.3, 0, d, 0, 0.15, concrete);
      slab(-hw, hw, 0, d - 0.55, 0.15, 0.3, concrete);
      // flat roof slab with a low lip along the sides and a tall front parapet that carries the name board
      slab(-hw - 0.4, hw + 0.4, 0, d + 0.5, h - 0.5, h, light);
      soffit(-hw - 0.4, hw + 0.4, 0, d + 0.5, h - 0.5, 0xf3eee2);
      slab(-hw - 0.4, hw + 0.4, d + 0.2, d + 0.5, h, h + PARAPET, light);
      slab(-hw - 0.4, -hw - 0.15, 0, d + 0.2, h, h + 0.3, light);
      slab(hw + 0.15, hw + 0.4, 0, d + 0.2, h, h + 0.3, light);
      // six square columns along the front; the middle bay stays open to frame the doors
      for (const f of [-0.95, -0.57, -0.19, 0.19, 0.57, 0.95]) {
        const lat = f * hw;
        const c = slab(lat - 0.28, lat + 0.28, d - 0.78, d - 0.22, 0.3, h - 0.5, post);
        slab(lat - 0.38, lat + 0.38, d - 0.88, d - 0.12, 0.3, 0.55, concrete);
        colliders.push({ id: b.id, cx: c.x, cz: c.z, hw: 0.3, hd: 0.3, rot: rotY });
      }
      // wide glass entrance in the facade: steel frame, glass, three mullions
      const dw = doorW / 2;
      slab(-dw - 0.25, dw + 0.25, 0, 0.14, 0.3, 3.1, steel);
      slab(-dw, dw, 0.1, 0.2, 0.3, 2.95, glass);
      for (const m of [-dw / 2, 0, dw / 2]) slab(m - 0.05, m + 0.05, 0.1, 0.24, 0.3, 2.95, steel);
      slab(-dw, dw, 0.1, 0.24, 2.2, 2.28, steel); // transom
    }

    const sign = (text, info, { wide = false, high = 3.7, width: w0 = null, out = 0.13 } = {}) => {
      const width = w0 ?? (wide ? 7.2 : 5.0);
      signReq.push({
        text, x: info.px + info.n.x * out, y: high, z: info.pz + info.n.z * out, theta: info.theta, width, height: (width * 96) / 512,
      });
    };
    const postSign = (text, info) => {
      const width = 2.9, height = (width * 96) / 512;
      const cx = info.px + info.n.x * 2.2, cz = info.pz + info.n.z * 2.2;
      const side = new THREE.Vector3(1, 0, 0).applyMatrix4(tmpM.clone().makeRotationY(info.theta));
      for (const s of [-1.25, 1.25]) {
        const p = cylGeo(0.05, 0.05, 2.3, 5);
        place(p, cx + side.x * s, 0, cz + side.z * s);
        paint(p, 0x3a3f45);
        acc.solid.push(p);
      }
      signReq.push({ text, x: cx, y: 1.75, z: cz, theta: info.theta, width, height });
    };

    switch (b.form) {
      case 'ring': {
        const t = b.ring.thickness;
        mass(
          [
            { x: 0, z: -(d - t) / 2, w, d: t },
            { x: 0, z: (d - t) / 2, w, d: t },
            { x: -(w - t) / 2, z: 0, w: t, d: d - 2 * t },
            { x: (w - t) / 2, z: 0, w: t, d: d - 2 * t },
          ],
          h,
        );
        obbOf({ x: 0, z: 0, w, d });
        const info = door(true);
        // with a porch the name board is on the front parapet of its roof
        if (info.porch) sign(b.shortName, info, { width: 7.2, high: info.porch.h + 0.08, out: info.porch.d + 0.53 });
        else sign(b.shortName, info, { wide: true, high: 3.75 });
        break;
      }
      case 'block': {
        const rects = b.parts?.length ? b.parts.map((p) => ({ x: p.x, z: p.z, w: p.w, d: p.d })) : [{ x: 0, z: 0, w, d }];
        mass(rects, h);
        for (const r of rects) obbOf(r);
        const info = door(h >= 8 && w >= 14);
        if (w >= 12 && h >= 3.5) sign(b.shortName, info, { wide: w >= 40, high: h >= 8 ? 3.75 : Math.min(h - 0.9, 3.2) });
        else postSign(b.shortName, info);
        break;
      }
      case 'shed': {
        if (b.type === 'parking') {
          // open shed: concrete floor, roof slab on columns, parked vehicles
          const fl = flatQuad(w, d, 0.03, w / 4, d / 4);
          put(acc.concrete, fl, 0xffffff);
          const roofH = 3.6;
          const rg = boxGeo(w + 0.6, 0.3, d + 0.6, { y: roofH });
          put(acc.roofFlat, rg, roofCol);
          const nx = Math.max(2, Math.round(w / 5) + 1), nz = Math.max(2, Math.round(d / 5) + 1);
          for (let i = 0; i < nx; i++) {
            for (let j = 0; j < nz; j++) {
              if (i > 0 && i < nx - 1 && j > 0 && j < nz - 1) continue;
              const col = boxGeo(0.34, roofH, 0.34);
              place(col, -w / 2 + 0.4 + (i * (w - 0.8)) / (nx - 1), 0, -d / 2 + 0.4 + (j * (d - 0.8)) / (nz - 1));
              put(acc.solid, col, 0x7f858c);
            }
          }
          parkVehicles(b, w, d, put, acc);
          const info = door(false);
          postSign(b.shortName, info);
        } else {
          // closed gable shed (e.g. laboratory sheds)
          const wallsH = Math.max(2.8, h - 1.6);
          const wg = wallsGeo(w, wallsH, d, { floorH: wallsH, bayW: BAY_WIDTH });
          put(acc.wallsShed, wg, wallCol);
          const rg = gableGeo(w, d, 1.6, 0.5);
          place(rg, 0, wallsH, 0);
          put(acc.roofTile, rg, roofCol);
          obbOf({ x: 0, z: 0, w, d });
          const info = door(false);
          if (w >= 12) sign(b.shortName, info, { wide: false, high: Math.min(wallsH - 0.4, 3.0) });
          else postSign(b.shortName, info);
        }
        break;
      }
      case 'kiosk': {
        const wg = wallsGeo(w, h, d, { floorH: h, bayW: BAY_WIDTH });
        put(acc.wallsShed, wg, wallCol);
        const rg = boxGeo(w + 0.5, 0.3, d + 0.5, { y: h });
        put(acc.roofFlat, rg, roofCol);
        obbOf({ x: 0, z: 0, w, d });
        const info = door(false);
        postSign(b.shortName, info);
        break;
      }
      case 'canopy': {
        const fl = flatQuad(w, d, 0.03, w / 4, d / 4);
        put(acc.concrete, fl, 0xffffff);
        const cw = w - 5, cd = d - 9;
        const slab = boxGeo(cw, 0.7, cd, { y: h - 0.7 });
        put(acc.solid, slab, 0xf3f3f3);
        const band = boxGeo(cw + 0.1, 0.35, cd + 0.1, { y: h - 0.55 });
        put(acc.solid, band, 0xc9302c);
        for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const col = boxGeo(0.5, h - 0.7, 0.5);
          place(col, (sx * (cw - 2)) / 2, 0, (sz * (cd - 2)) / 2);
          put(acc.solid, col, 0xe4e4e4);
        }
        for (const sx of [-1, 1]) {
          const disp = boxGeo(0.8, 1.6, 0.6);
          place(disp, sx * (cw / 4), 0, 0);
          put(acc.solid, disp, 0xd04a3a);
        }
        const cabin = { x: w / 2 - 3.2, z: -d / 2 + 3, w: 5, d: 4 };
        const wg = wallsGeo(cabin.w, 3.2, cabin.d, { floorH: 3.2, bayW: BAY_WIDTH });
        place(wg, cabin.x, 0, cabin.z);
        put(acc.wallsShed, wg, 0xe9e6dc);
        const rg = boxGeo(cabin.w + 0.4, 0.3, cabin.d + 0.4, { y: 3.2 });
        place(rg, cabin.x, 0, cabin.z);
        put(acc.roofFlat, rg, 0x9aa0a6);
        obbOf(cabin);
        const info = door(false);
        postSign(b.shortName, info);
        break;
      }
      case 'plant': {
        const fl = flatQuad(w, d, 0.03, w / 4, d / 4);
        put(acc.concrete, fl, 0xffffff);
        for (const sx of [-1, 1]) {
          const tank = cylGeo(4, 4, h - 0.5, 14, 0.03);
          place(tank, sx * (w / 4), 0, d / 6);
          put(acc.solid, tank, 0xb9bfc4);
          const lid = cylGeo(4.1, 4.1, 0.3, 14, h - 0.5);
          place(lid, sx * (w / 4), 0, d / 6);
          put(acc.solid, lid, 0x6f7a82);
        }
        const hut = { x: 0, z: -d / 4, w: w * 0.4, d: 5 };
        const wg = wallsGeo(hut.w, 3.4, hut.d, { floorH: 3.4, bayW: BAY_WIDTH });
        place(wg, hut.x, 0, hut.z);
        put(acc.wallsShed, wg, wallCol);
        const rg = boxGeo(hut.w + 0.5, 0.3, hut.d + 0.5, { y: 3.4 });
        place(rg, hut.x, 0, hut.z);
        put(acc.roofFlat, rg, roofCol);
        obbOf({ x: 0, z: 0, w, d });
        const info = door(false);
        postSign(b.shortName, info);
        break;
      }
      case 'court': {
        const geo = flatQuad(w, d, 0.05);
        const mat = new THREE.MeshLambertMaterial({ map: courtTexture(b.sport, w, d) });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(b.position.x, 0, b.position.z);
        mesh.rotation.y = rotY;
        courts.push(mesh);
        // chain-link fence on four sides
        for (const [lx, lz, len, ry] of [[0, d / 2, w, 0], [0, -d / 2, w, 0], [w / 2, 0, d, Math.PI / 2], [-w / 2, 0, d, Math.PI / 2]]) {
          const f = fencePlane(len, 3.2);
          place(f, lx, 0.0, lz, ry);
          f.applyMatrix4(M);
          acc.fence.push(f);
        }
        courtDetails(b, w, d, put, acc);
        const info = door(false);
        postSign(b.shortName, info);
        break;
      }
      case 'field': {
        const geo = flatQuad(w, d, 0.04);
        const mat = new THREE.MeshLambertMaterial({ map: fieldTexture(w, d) });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(b.position.x, 0, b.position.z);
        mesh.rotation.y = rotY;
        courts.push(mesh);
        // goal posts at both ends of the infield
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            const p = cylGeo(0.07, 0.07, 3.2, 5);
            place(p, sx * (w / 2 - 20), 0, sz * 3.6);
            put(acc.solid, p, 0xf2f2f2);
          }
          const bar = boxGeo(0.1, 0.1, 7.3, { y: 2.5 });
          place(bar, sx * (w / 2 - 20), 0, 0);
          put(acc.solid, bar, 0xf2f2f2);
        }
        const info = door(false);
        postSign(b.shortName, info);
        break;
      }
      default:
        break;
    }

    labels.push({ id: b.id, number: b.number, text: b.shortName, type: b.type, x: b.position.x, z: b.position.z, y: Math.max(h, 2) + 3 });
  }

  function addSolar(points, buildingsById) {
    for (const p of points) {
      if (p.kind !== 'solar-pv') continue;
      const par = buildingsById.get(p.parent);
      const roofY = (par?.heightM ?? 8) + 0.55;
      const rot = -(par?.rotationDeg ?? 0) * DEG;
      const c = Math.cos(rot), s = Math.sin(rot);
      for (let i = -2; i <= 2; i++) {
        for (let j = -1; j <= 1; j++) {
          const lx = i * 2.3, lz = j * 1.6;
          // rotation about Y by `rot`: x' = x cos + z sin ; z' = -x sin + z cos
          solar.push({ x: p.position.x + lx * c + lz * s, y: roofY, z: p.position.z - lx * s + lz * c, rot });
        }
      }
    }
  }

  function finalize(buildingsData, pointsData) {
    const group = new THREE.Group();
    group.name = 'buildings';
    const meshes = [];
    const mk = (geoList, material, name) => {
      const g = merge(geoList);
      if (!g) return null;
      const m = new THREE.Mesh(g, material);
      m.name = name;
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
      meshes.push(m);
      return m;
    };
    const lambert = (map) => new THREE.MeshLambertMaterial({ map, vertexColors: true });
    mk(acc.wallsBlock, lambert(T.facadeBlock), 'walls-block');
    mk(acc.wallsShed, lambert(T.facadeShed), 'walls-shed');
    mk(acc.wallsPlain, lambert(T.facadePlain), 'walls-plain');
    mk(acc.roofFlat, lambert(T.roofFlat), 'roof-flat');
    mk(acc.roofTile, lambert(T.roofTile), 'roof-tile');
    mk(acc.concrete, lambert(T.concrete), 'concrete');
    mk(acc.solid, new THREE.MeshLambertMaterial({ vertexColors: true }), 'details');
    const fence = merge(acc.fence);
    if (fence) {
      const fm = new THREE.Mesh(
        fence,
        new THREE.MeshLambertMaterial({ map: T.fence, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }),
      );
      fm.name = 'fences';
      group.add(fm);
    }
    for (const c of courts) {
      c.receiveShadow = true;
      group.add(c);
    }
    // signs (one atlas, one draw call)
    const items = signReq.map((s) => ({ text: s.text, style: s.style ?? 'blue' }));
    if (items.length) {
      const atlas = signAtlas(items);
      const geos = signReq.map((s, i) => {
        const g = signQuad(s.width, s.height, atlas.uv[i]);
        // double-sided look: plane faces +z; rotate to the building normal
        g.applyMatrix4(new THREE.Matrix4().makeRotationY(s.theta));
        g.translate(s.x, s.y, s.z);
        return g;
      });
      const sm = new THREE.Mesh(merge(geos), new THREE.MeshBasicMaterial({ map: atlas.texture, side: THREE.DoubleSide }));
      sm.name = 'signs';
      group.add(sm);
      meshes.push(sm);
    }
    // solar panels
    const byId = new Map(buildingsData.map((b) => [b.id, b]));
    addSolar(pointsData, byId);
    if (solar.length) {
      const pg = boxGeo(2.0, 0.06, 1.3, { scale: 2, grounded: false });
      pg.rotateX(-0.35);
      const im = new THREE.InstancedMesh(
        pg,
        new THREE.MeshLambertMaterial({ color: 0x1f3f8a, emissive: 0x0a1633 }),
        solar.length,
      );
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      solar.forEach((s, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.rot);
        m4.compose(new THREE.Vector3(s.x, s.y + 0.3, s.z), q, new THREE.Vector3(1, 1, 1));
        im.setMatrixAt(i, m4);
      });
      im.name = 'solar';
      group.add(im);
    }
    return { group, colliders, labels, meshes, doorFrames };
  }

  return { addBuilding, finalize };
}

// ---- decorative details ----

function parkVehicles(b, w, d, put, acc) {
  const r = rng(hashString(b.id));
  const colors = [0xd9d9d9, 0x2f4b7c, 0xa83232, 0x2a2a2a, 0xe8e0c8, 0x6b7d8f];
  const four = b.id.includes('four');
  const alongX = w >= d;
  const L = alongX ? w : d, Wd = alongX ? d : w;
  if (four) {
    // a few yellow college buses, then cars
    let pos = -L / 2 + 2.5;
    let row = 0;
    while (pos < L / 2 - 2.5 && row < 2) {
      const bus = r() > 0.55;
      const len = bus ? 10.5 : 4.2;
      const bw = bus ? 2.5 : 1.8, bh = bus ? 3.0 : 1.45;
      if (pos + len > L / 2 - 1) break;
      const lat = (row === 0 ? -1 : 1) * (Wd / 4);
      const body = boxGeo(bus ? bw : bw, bh, len, { y: bus ? 0.35 : 0.2 });
      const glass = boxGeo(bw + 0.04, bus ? 0.9 : 0.5, len * (bus ? 0.9 : 0.5), { y: bus ? 1.6 : 0.85 });
      const dx = alongX ? pos + len / 2 : lat, dz = alongX ? lat : pos + len / 2;
      const rot = alongX ? Math.PI / 2 : 0;
      place(body, dx, 0, dz, rot);
      place(glass, dx, 0, dz, rot);
      put(acc.solid, body, bus ? 0xf2c200 : colors[Math.floor(r() * colors.length)]);
      put(acc.solid, glass, 0x1d2a38);
      pos += len + 1.2;
      if (pos >= L / 2 - 6 && row === 0) {
        row = 1;
        pos = -L / 2 + 2.5;
      }
    }
  } else {
    // rows of two-wheelers
    const rowsN = Math.max(2, Math.floor(Wd / 3));
    const perRow = Math.max(3, Math.floor(L / 1.1));
    for (let j = 0; j < rowsN; j++) {
      for (let i = 0; i < perRow; i++) {
        if (r() < 0.35) continue;
        const bike = boxGeo(0.55, 1.0, 1.7, { y: 0.0 });
        const a = -L / 2 + 1 + (i * (L - 2)) / perRow;
        const lat = -Wd / 2 + 1.5 + (j * (Wd - 3)) / Math.max(1, rowsN - 1);
        place(bike, alongX ? a : lat, 0, alongX ? lat : a, alongX ? Math.PI / 2 : 0);
        put(acc.solid, bike, colors[Math.floor(r() * colors.length)]);
      }
    }
  }
}

function courtDetails(b, w, d, put, acc) {
  const alongX = w >= d;
  const L = alongX ? w : d;
  const rotAlong = alongX ? 0 : Math.PI / 2;
  const post = (x, z, hgt, col = 0x30353b) => {
    const p = cylGeo(0.06, 0.06, hgt, 6);
    place(p, x, 0, z);
    put(acc.solid, p, col);
  };
  const lx = (a) => (alongX ? [a, 0] : [0, a]); // along-axis offset -> local x/z
  if (b.sport === 'basketball') {
    for (const s of [-1, 1]) {
      const [x, z] = lx(s * (L / 2 - 2.2));
      post(x, z, 3.05);
      const board = boxGeo(1.8, 1.05, 0.06, { y: 2.6 });
      place(board, x, 0, z, rotAlong + Math.PI / 2);
      put(acc.solid, board, 0xf4f4f4);
    }
  } else if (['volleyball', 'tennis', 'ball-badminton'].includes(b.sport)) {
    const wid = alongX ? d : w;
    const net = boxGeo(0.03, 0.9, Math.min(wid - 3, 11), { y: 0.9 });
    place(net, 0, 0, 0, rotAlong);
    put(acc.solid, net, 0xf2f2f2);
    for (const s of [-1, 1]) {
      const o = Math.min(wid - 3, 11) / 2 + 0.3;
      const [x, z] = alongX ? [0, s * o] : [s * o, 0];
      post(x, z, 2.4);
    }
  }
}
