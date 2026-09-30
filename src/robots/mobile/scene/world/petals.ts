import * as THREE from 'three';
import { rng } from '../geometry';
import { canvas, canvasTexture } from '../textures';

/**
 * Falling sakura petals, simulated entirely in the vertex shader:
 * each petal loops through a box of air, drifting with the breeze and tumbling
 * (the tumble also drives a two-tone "lit side / shadow side" shade).
 */
export function createPetals(count = 150, box = { x: [-7, 7], y: [-1.6, 3.4], z: [-9.5, -2.2] }) {
  const { c, ctx } = canvas(64, 64);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(32, 60);
  ctx.bezierCurveTo(6, 44, 6, 14, 24, 6);
  ctx.lineTo(32, 13);
  ctx.lineTo(40, 6);
  ctx.bezierCurveTo(58, 14, 58, 44, 32, 60);
  ctx.fill();
  const tex = canvasTexture(c, { srgb: false });

  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.getAttribute('position'));
  geo.setAttribute('uv', base.getAttribute('uv'));
  const rand = rng(2024);
  const seeds = new Float32Array(count * 4);
  const extra = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    seeds[i * 4] = rand();
    seeds[i * 4 + 1] = rand();
    seeds[i * 4 + 2] = rand();
    seeds[i * 4 + 3] = rand();
    const near = rand() < 0.1;
    extra[i * 4] = near ? 0.13 + rand() * 0.05 : 0.055 + rand() * 0.045; // size
    extra[i * 4 + 1] = 0.035 + rand() * 0.03; // loop speed
    extra[i * 4 + 2] = rand() * Math.PI * 2; // tumble phase
    extra[i * 4 + 3] = near ? 1 : 0;
  }
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  geo.setAttribute('aExtra', new THREE.InstancedBufferAttribute(extra, 4));
  geo.instanceCount = count;

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uMap: { value: tex },
      uLit: { value: new THREE.Color('#ffd3e4') },
      uShade: { value: new THREE.Color('#e892bb') },
      uMin: { value: new THREE.Vector3(box.x[0], box.y[0], box.z[0]) },
      uSize: { value: new THREE.Vector3(box.x[1] - box.x[0], box.y[1] - box.y[0], box.z[1] - box.z[0]) },
      uWind: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      attribute vec4 aExtra;
      uniform float uTime;
      uniform vec3 uMin;
      uniform vec3 uSize;
      uniform float uWind;
      varying vec2 vUv;
      varying float vShade;
      mat3 rotXYZ(vec3 a) {
        vec3 s = sin(a), c = cos(a);
        return mat3(c.y*c.z, c.y*s.z, -s.y,
                    s.x*s.y*c.z - c.x*s.z, s.x*s.y*s.z + c.x*c.z, s.x*c.y,
                    c.x*s.y*c.z + s.x*s.z, c.x*s.y*s.z - s.x*c.z, c.x*c.y);
      }
      void main() {
        vUv = uv;
        float life = fract(aSeed.w + uTime * aExtra.y * uWind);
        vec3 p = uMin + aSeed.xyz * uSize;
        p.y = uMin.y + uSize.y * (1.0 - life);
        p.x = uMin.x + fract(aSeed.x + life * 0.35) * uSize.x;
        p.x += sin(uTime * 0.7 + aSeed.z * 12.0) * 0.25;
        p.z += sin(uTime * 0.5 + aSeed.x * 9.0) * 0.2;
        float tp = aExtra.z + uTime * (1.2 + aSeed.y * 1.6);
        // flutter, but never turn fully edge-on (edge-on petals read as scratches on the screen)
        mat3 R = rotXYZ(vec3(sin(tp) * 1.05, sin(tp * 0.7 + aSeed.x * 3.0) * 0.9, tp * 0.45));
        vec3 local = R * (vec3(position.xy * vec2(0.75, 1.0), 0.0) * aExtra.x);
        vec3 n = R * vec3(0.0, 0.0, 1.0);
        vShade = abs(n.z);
        float edgeFade = smoothstep(0.0, 0.08, life) * smoothstep(1.0, 0.9, life);
        vec4 mv = modelViewMatrix * vec4(p + local * edgeFade, 1.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform vec3 uLit;
      uniform vec3 uShade;
      varying vec2 vUv;
      varying float vShade;
      void main() {
        float a = texture2D(uMap, vUv).a;
        if (a < 0.5) discard;
        vec3 col = mix(uShade, uLit, step(0.45, vShade));
        col = mix(col, vec3(1.0, 0.93, 0.96), smoothstep(0.35, 0.0, vUv.y) * 0.3);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  return mesh;
}
