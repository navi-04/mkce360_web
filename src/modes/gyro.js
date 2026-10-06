// Optional gyroscope look. Permission must be requested from a user tap (required on iOS).
import * as THREE from 'three';

const DEG = Math.PI / 180;
const zee = new THREE.Vector3(0, 0, 1);
const q0 = new THREE.Quaternion();
const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -90 deg about X
const euler = new THREE.Euler();
const quat = new THREE.Quaternion();
const out = new THREE.Euler();

export class Gyro {
  constructor() {
    this.active = false;
    this.has = false;
    this.alpha = 0;
    this.beta = 0;
    this.gamma = 0;
    this._on = (e) => {
      if (e.alpha == null && e.beta == null) return;
      this.has = true;
      this.alpha = e.alpha ?? 0;
      this.beta = e.beta ?? 0;
      this.gamma = e.gamma ?? 0;
    };
  }

  static get supported() {
    return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
  }

  /** Call from a click/tap handler. Resolves true when sensor data is flowing (or likely to). */
  async enable() {
    if (!Gyro.supported) return false;
    const DOE = window.DeviceOrientationEvent;
    if (typeof DOE.requestPermission === 'function') {
      const res = await DOE.requestPermission(); // iOS 13+: must come from a user gesture
      if (res !== 'granted') return false;
    }
    window.addEventListener('deviceorientation', this._on);
    this.active = true;
    // wait briefly for a first reading
    await new Promise((r) => setTimeout(r, 400));
    if (!this.has) {
      this.disable();
      return false;
    }
    return true;
  }

  disable() {
    window.removeEventListener('deviceorientation', this._on);
    this.active = false;
    this.has = false;
  }

  /** Current device orientation as { yaw, pitch } (radians, three.js sense: yaw 0 faces -z). */
  read() {
    const orient = ((screen.orientation?.angle ?? window.orientation ?? 0) | 0) * DEG;
    euler.set(this.beta * DEG, this.alpha * DEG, -this.gamma * DEG, 'YXZ');
    quat.setFromEuler(euler);
    quat.multiply(q1);
    quat.multiply(q0.setFromAxisAngle(zee, -orient));
    out.setFromQuaternion(quat, 'YXZ');
    return { yaw: out.y, pitch: out.x };
  }
}
