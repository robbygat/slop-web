import * as THREE from 'three';

/** Sky colours, shared with the fog and the haze so distant things dissolve into the sky itself. */
export const SKY = {
  zenith: '#2c69e3',
  upper: '#5294f3',
  mid: '#8dbcf9',
  low: '#c8dafb',
  horizon: '#f3dde8',
  below: '#e2daf3',
  glow: '#ffd6c0',
  haze: '#e8def2',
};

/**
 * Gradient sky dome drawn at the far plane (never fogged, never clipped).
 * Deep cerulean up top for the headline, a clean luminous blue where the shells
 * orbit, and a warm dawn glow on the horizon right behind the stage.
 */
export function createSky() {
  const c = (hex: string) => new THREE.Color(hex);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uZenith: { value: c(SKY.zenith) },
      uUpper: { value: c(SKY.upper) },
      uMid: { value: c(SKY.mid) },
      uLow: { value: c(SKY.low) },
      uHorizon: { value: c(SKY.horizon) },
      uBelow: { value: c(SKY.below) },
      uGlow: { value: c(SKY.glow) },
      uGlowDir: { value: new THREE.Vector3(0.25, 0, -1).normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith, uUpper, uMid, uLow, uHorizon, uBelow, uGlow;
      uniform vec3 uGlowDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float e = d.y;
        vec3 col = mix(uBelow, uHorizon, smoothstep(-0.1, 0.0, e));
        col = mix(col, uLow, smoothstep(0.0, 0.07, e));
        col = mix(col, uMid, smoothstep(0.05, 0.2, e));
        col = mix(col, uUpper, smoothstep(0.17, 0.4, e));
        col = mix(col, uZenith, smoothstep(0.36, 0.8, e));
        // a breath of violet drifting in from the right, so the blue never feels flat
        col = mix(col, col * vec3(1.04, 0.96, 1.02), smoothstep(-0.1, 0.6, d.x) * smoothstep(0.02, 0.3, e) * 0.6);
        // dawn glow on the horizon behind the stage: wide, low and warm
        vec3 g = normalize(uGlowDir);
        float az = dot(normalize(d.xz), normalize(g.xz));
        float glow = pow(max(az, 0.0), 40.0) * (1.0 - smoothstep(-0.02, 0.24, e)) * smoothstep(-0.14, 0.0, e);
        float wide = pow(max(az, 0.0), 6.0) * (1.0 - smoothstep(0.0, 0.12, e)) * smoothstep(-0.1, 0.0, e);
        col = mix(col, uGlow, clamp(glow * 0.85 + wide * 0.35, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), mat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  return sky;
}
