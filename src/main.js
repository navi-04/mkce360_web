// Step 1 placeholder: proves the Vite + Three.js toolchain builds and renders.
// Replaced by the real campus world in Step 4.
import * as THREE from 'three';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b8e6);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
camera.position.set(8, 6, 8);
camera.lookAt(0, 0, 0);

scene.add(new THREE.GridHelper(40, 40, 0x1b4b7a, 0x3a77b0));
scene.add(new THREE.HemisphereLight(0xffffff, 0x446644, 1.2));

function resize() {
  const { clientWidth: w, clientHeight: h } = canvas;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

renderer.setAnimationLoop(() => renderer.render(scene, camera));
