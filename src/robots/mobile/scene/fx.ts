import * as THREE from 'three';
import { canvas, canvasTexture } from './textures';

/**
 * GPU sparkles: a ring buffer of particles whose motion is evaluated in the
 * vertex shader, so spawning a burst only touches a few attribute slots.
 */
export class Sparkles {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private start: THREE.InstancedBufferAttribute;
  private vel: THREE.InstancedBufferAttribute;
  private meta: THREE.InstancedBufferAttribute;
  private color: THREE.InstancedBufferAttribute;
  private cursor = 0;
  private uniforms: { uTime: { value: number } };

  constructor(private capacity = 320) {
    const { c, ctx } = canvas(64, 64);
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.18, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.18)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    // four-point star flare
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.moveTo(32, 2);
    ctx.quadraticCurveTo(35, 29, 62, 32);
    ctx.quadraticCurveTo(35, 35, 32, 62);
    ctx.quadraticCurveTo(29, 35, 2, 32);
    ctx.quadraticCurveTo(29, 29, 32, 2);
    ctx.fill();
    const tex = canvasTexture(c, { srgb: false });

    const base = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = base.index;
    this.geo.setAttribute('position', base.getAttribute('position'));
    this.geo.setAttribute('uv', base.getAttribute('uv'));
    this.start = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.vel = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.meta = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4).fill(-100), 4); // birth, life, size, spin
    this.color = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    for (const a of [this.start, this.vel, this.meta, this.color]) a.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aStart', this.start);
    this.geo.setAttribute('aVel', this.vel);
    this.geo.setAttribute('aMeta', this.meta);
    this.geo.setAttribute('aColor', this.color);
    this.geo.instanceCount = capacity;

    this.uniforms = { uTime: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, uMap: { value: tex } },
      vertexShader: /* glsl */ `
        attribute vec3 aStart; attribute vec3 aVel; attribute vec4 aMeta; attribute vec3 aColor;
        uniform float uTime;
        varying vec2 vUv; varying vec3 vColor; varying float vAlpha;
        void main() {
          vUv = uv;
          float age = uTime - aMeta.x;
          float life = aMeta.y;
          float k = clamp(age / life, 0.0, 1.0);
          float alive = step(0.0, age) * step(age, life);
          vec3 p = aStart + aVel * age * (1.0 - 0.45 * k) + vec3(0.0, -0.9, 0.0) * age * age * 0.5;
          float size = aMeta.z * (1.0 - k * k) * alive;
          float a = aMeta.w * age;
          vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * position.xy;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          mv.xy += q * size;
          vColor = aColor;
          vAlpha = (1.0 - k) * alive;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying vec2 vUv; varying vec3 vColor; varying float vAlpha;
        void main() {
          float m = texture2D(uMap, vUv).a;
          float a = m * vAlpha;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor * a, a);
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
  }

  emit(p: THREE.Vector3, v: THREE.Vector3, color: THREE.Color, life: number, size: number, time: number, spin = 2) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.start.setXYZ(i, p.x, p.y, p.z);
    this.vel.setXYZ(i, v.x, v.y, v.z);
    this.meta.setXYZW(i, time, life, size, spin);
    this.color.setXYZ(i, color.r, color.g, color.b);
    for (const a of [this.start, this.vel, this.meta, this.color]) a.needsUpdate = true;
  }

  /** Radial burst around a point (landing celebration). */
  burst(center: THREE.Vector3, radius: number, color: THREE.Color, time: number, count = 60) {
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = (Math.random() - 0.35) * 1.2;
      const dir = new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e) + 0.25, Math.sin(a) * Math.cos(e) * 0.6);
      const p = center.clone().addScaledVector(dir, radius * (0.55 + Math.random() * 0.3));
      const v = dir.multiplyScalar(radius * (1.2 + Math.random() * 1.8));
      const c = Math.random() < 0.35 ? white : color;
      this.emit(p, v, c, 0.55 + Math.random() * 0.55, radius * (0.08 + Math.random() * 0.1), time, (Math.random() - 0.5) * 8);
    }
  }

  update(time: number) {
    this.uniforms.uTime.value = time;
  }
}

/** An expanding ring of light (pedestal shockwave). */
export class Shockwave {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private t = 1;

  constructor(color = '#8fb2ff') {
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uT: { value: 1 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uT; varying vec2 vUv;
        void main() {
          float r = length(vUv - 0.5) * 2.0;
          float radius = mix(0.25, 1.0, 1.0 - pow(1.0 - uT, 3.0));
          float w = mix(0.05, 0.14, uT);
          float ring = exp(-pow((r - radius) / w, 2.0));
          float a = ring * (1.0 - uT) * 1.6;
          gl_FragColor = vec4(uColor * a, a);
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.visible = false;
  }

  fire() {
    this.t = 0;
    this.mesh.visible = true;
  }

  update(dt: number) {
    if (this.t >= 1) return;
    this.t = Math.min(1, this.t + dt / 0.9);
    this.mat.uniforms.uT.value = this.t;
    if (this.t >= 1) this.mesh.visible = false;
  }
}

/** A soft comet trail that follows the flying shell (camera-facing strip, additive). */
export class Ribbon {
  readonly mesh: THREE.Mesh;
  private pts: THREE.Vector3[] = [];
  private pos: THREE.BufferAttribute;
  private alpha: THREE.BufferAttribute;
  private mat: THREE.ShaderMaterial;
  private width = 0.1;
  private active = false;
  private readonly max = 30;
  private t = new THREE.Vector3();
  private v = new THREE.Vector3();
  private side = new THREE.Vector3();

  constructor() {
    const n = this.max;
    const geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3);
    this.alpha = new THREE.BufferAttribute(new Float32Array(n * 2), 1);
    const sideAttr = new THREE.BufferAttribute(new Float32Array(n * 2), 1);
    for (let i = 0; i < n; i++) {
      sideAttr.setX(i * 2, 1);
      sideAttr.setX(i * 2 + 1, -1);
    }
    this.pos.setUsage(THREE.DynamicDrawUsage);
    this.alpha.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.pos);
    geo.setAttribute('aAlpha', this.alpha);
    geo.setAttribute('aSide', sideAttr);
    const idx: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color('#ffffff') } },
      vertexShader: /* glsl */ `
        attribute float aAlpha; attribute float aSide;
        varying float vA; varying float vS;
        void main() { vA = aAlpha; vS = aSide; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; varying float vA; varying float vS;
        void main() {
          float edge = 1.0 - vS * vS;
          float a = vA * edge * edge;
          vec3 c = mix(uColor, vec3(1.0), edge * edge * 0.55);
          gl_FragColor = vec4(c * a, a);
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
  }

  start(color: THREE.Color, width: number) {
    this.pts.length = 0;
    this.mat.uniforms.uColor.value.copy(color);
    this.width = width;
    this.active = true;
  }

  push(p: THREE.Vector3) {
    if (!this.active) return;
    this.pts.unshift(p.clone());
    if (this.pts.length > this.max) this.pts.pop();
  }

  stop() {
    this.active = false;
  }

  update(camera: THREE.Camera) {
    if (!this.active && this.pts.length) this.pts.splice(-2, 2);
    const n = this.pts.length;
    const geo = this.mesh.geometry;
    if (n < 2) {
      geo.setDrawRange(0, 0);
      return;
    }
    for (let i = 0; i < n; i++) {
      const p = this.pts[i];
      const a = this.pts[Math.max(0, i - 1)];
      const b = this.pts[Math.min(n - 1, i + 1)];
      this.t.copy(a).sub(b);
      if (this.t.lengthSq() < 1e-8) this.t.set(1, 0, 0);
      this.v.copy(camera.position).sub(p);
      this.side.crossVectors(this.t, this.v).normalize();
      const k = i / (this.max - 1);
      const w = this.width * (1 - k) * (0.35 + 0.65 * Math.min(1, i / 3));
      this.pos.setXYZ(i * 2, p.x + this.side.x * w, p.y + this.side.y * w, p.z + this.side.z * w);
      this.pos.setXYZ(i * 2 + 1, p.x - this.side.x * w, p.y - this.side.y * w, p.z - this.side.z * w);
      const al = Math.pow(1 - k, 1.6) * 0.85;
      this.alpha.setX(i * 2, al);
      this.alpha.setX(i * 2 + 1, al);
    }
    this.pos.needsUpdate = true;
    this.alpha.needsUpdate = true;
    geo.setDrawRange(0, (n - 1) * 6);
  }
}
