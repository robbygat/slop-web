import * as THREE from 'three';
import { bevelPuck } from '../geometry';
import { glowMaterial } from '../shells/common';
import { addOutline, toon } from '../toon';

/** The charging pedestal the equipped shell floats above. */
export class Pedestal {
  readonly group = new THREE.Group();
  private ringMat: THREE.MeshBasicMaterial;
  private haloMat: THREE.ShaderMaterial;
  private beamMat: THREE.ShaderMaterial;
  private spillMat: THREE.ShaderMaterial;
  private beam: THREE.Mesh;
  private pulseV = 0;
  readonly radius = 0.57;
  readonly height = 0.24;

  constructor() {
    const r = this.radius;
    const h = this.height;

    // soft contact shadow so it sits on the painted desk
    const shadowMat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          float d = length(vUv - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.35, d) * 0.4;
          gl_FragColor = vec4(0.05, 0.03, 0.1, a);
        }
      `,
      transparent: true,
      depthWrite: false,
    });
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(r * 2.9, r * 2.9), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.002;
    shadow.renderOrder = -1;
    this.group.add(shadow);

    const bodyMat = toon({
      color: '#44435a',
      shade: '#8584b0',
      bright: 1.05,
      spec: 0.9,
      specSize: 0.93,
      rim: 0.95,
      rimColor: '#ffd3e6',
      terminator: -0.05,
      bottomDark: 0.3,
    });
    const body = new THREE.Mesh(bevelPuck(r, h, 0.06, 72, 6), bodyMat);
    body.position.y = h / 2;
    addOutline(body, { color: '#0a0911', thickness: 1.6 });
    this.group.add(body);

    // machined bands on the side
    const bandMat = toon({ color: '#55546c', shade: '#8584ac', spec: 0.8, specSize: 0.92 });
    for (const y of [h * 0.3, h * 0.62]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.004, r * 1.004, 0.012, 72, 1, true), bandMat);
      band.position.y = y;
      this.group.add(band);
    }
    // bright bevel edge catching the window light
    const lip = new THREE.Mesh(new THREE.TorusGeometry(r * 0.955, 0.022, 10, 96), toon({ color: '#b9b8d2', shade: '#8a89b0', spec: 0.9, specSize: 0.9 }));
    lip.rotation.x = -Math.PI / 2;
    lip.position.y = h - 0.012;
    this.group.add(lip);

    const top = new THREE.Mesh(new THREE.CircleGeometry(r * 0.9, 72), toon({ color: '#12121b', shade: '#5f5d85', spec: 0.8, specSize: 0.9 }));
    top.rotation.x = -Math.PI / 2;
    top.position.y = h + 0.002;
    this.group.add(top);

    this.ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#a7c6ff'), toneMapped: false, fog: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.78, 0.018, 10, 128), this.ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = h + 0.012;
    this.group.add(ring);

    this.haloMat = glowMaterial('#4f7dff', 1.1, 'ring', 0.78 / 1.15, 0.13);
    const halo = new THREE.Mesh(new THREE.CircleGeometry(r * 1.15, 96), this.haloMat);
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = h + 0.014;
    this.group.add(halo);

    this.beamMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color('#6f9bff') }, uStrength: { value: 0.3 }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main() {
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uStrength; uniform float uTime;
        varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main() {
          float up = vUv.y;
          float fade = pow(1.0 - up, 2.4);
          float edge = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.5);
          float scan = 0.75 + 0.25 * sin(up * 40.0 - uTime * 3.0);
          float a = fade * (0.25 + edge * 0.9) * scan * uStrength;
          gl_FragColor = vec4(uColor * a, a);
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r * 0.78, 1, 48, 1, true), this.beamMat);
    this.beam.position.y = h + 0.5;
    this.group.add(this.beam);

    // blue light spilling onto the desk around the base
    this.spillMat = glowMaterial('#5d7fff', 0.42, 'ring', 0.42, 0.3);
    const spill = new THREE.Mesh(new THREE.CircleGeometry(r * 2.3, 64), this.spillMat);
    spill.rotation.x = -Math.PI / 2;
    spill.position.y = 0.004;
    this.group.add(spill);
  }

  /** Beam reaches up toward the floating bot. */
  setBeamHeight(hgt: number) {
    const hh = Math.max(0.1, hgt);
    this.beam.scale.y = hh;
    this.beam.position.y = this.height + hh / 2;
  }

  pulse() {
    this.pulseV = 1;
  }

  update(dt: number, t: number) {
    this.pulseV = Math.max(0, this.pulseV - dt * 1.4);
    const p = this.pulseV;
    const breathe = 0.5 + 0.5 * Math.sin(t * 1.8);
    this.ringMat.color.setRGB(0.6 + 0.4 * p, 0.76 + 0.24 * p, 1.0);
    this.haloMat.uniforms.uStrength.value = 0.95 + breathe * 0.25 + p * 1.6;
    this.beamMat.uniforms.uStrength.value = 0.2 + breathe * 0.06 + p * 0.9;
    this.beamMat.uniforms.uTime.value = t;
    this.spillMat.uniforms.uStrength.value = 0.36 + breathe * 0.08 + p * 0.5;
  }
}
