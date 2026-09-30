import * as THREE from 'three';

/**
 * Cel-shading toolkit.
 *
 * Every lit surface in the scene uses `toon()`: a two-tone ramp with a crisp
 * terminator, a cool painted shadow tint, an optional hard specular "sticker"
 * highlight and a backlit rim — the look of anime key art rather than PBR.
 * `addOutline()` adds inverted-hull ink lines with a constant on-screen width.
 */

// Uniform objects shared by reference across every toon material, updated once per frame.
export const shared = {
  uLightDirV: { value: new THREE.Vector3(0, 0, 1) },
  uRimDirV: { value: new THREE.Vector3(0, 0, -1) },
  uUpV: { value: new THREE.Vector3(0, 1, 0) },
  uPixel: { value: 0.001 },
  uTime: { value: 0 },
  /** Global cel intensity (0 = JevBot's original look, 1 = bold). See TOON_LEVELS. */
  uToon: { value: 0 },
  /** Ink line weight multiplier. */
  uOutlineScale: { value: 1 },
};

/**
 * "A little more toon": one knob over the whole scene. Every addition in the
 * toon + outline shaders is multiplied by uToon, so level 0 is pixel-identical
 * to JevBot's original materials.
 *
 *  - crisper cel terminator (anti-aliased with fwidth, never a jaggy step)
 *  - hue-shifted, more saturated shadow tone + a darker core-shadow band
 *  - a crisp fresnel rim on the rim-light side
 *  - harder "sticker" specular with a second, smaller anime glint
 *  - ink outlines tinted from the part they surround (Genshin-style), heavier
 *    on the shadow side and in front, lighter at the back
 */
export const TOON_LEVELS = {
  off: { toon: 0, outline: 1, ink: 0 },
  // outline is relative to each part's authored width (2.2–2.5 output px):
  // hairline-to-medium ink, so small sprites get a crisp edge, not a cartoon border
  subtle: { toon: 0.4, outline: 0.5, ink: 0.45 },
  medium: { toon: 0.7, outline: 0.65, ink: 0.65 },
  bold: { toon: 1, outline: 0.85, ink: 0.85 },
} as const;
export type ToonLevel = keyof typeof TOON_LEVELS;
export let toonLevel: ToonLevel = 'medium';

export function setToonLevel(level: ToonLevel) {
  toonLevel = level;
  shared.uToon.value = TOON_LEVELS[level].toon;
  shared.uOutlineScale.value = TOON_LEVELS[level].outline;
}
setToonLevel('medium');

// World-space light setup (directions point *towards* the light).
export const lighting = {
  sun: new THREE.Vector3(-0.55, 0.62, 0.56).normalize(),
  rim: new THREE.Vector3(0.75, 0.25, -0.62).normalize(),
};

export function updateSharedUniforms(camera: THREE.PerspectiveCamera, viewportHeightPx: number, time: number) {
  const view = camera.matrixWorldInverse;
  shared.uLightDirV.value.copy(lighting.sun).transformDirection(view);
  shared.uRimDirV.value.copy(lighting.rim).transformDirection(view);
  shared.uUpV.value.set(0, 1, 0).transformDirection(view);
  shared.uPixel.value = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / Math.max(1, viewportHeightPx);
  shared.uTime.value = time;
}

const fogUniforms = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);

const toonVertex = /* glsl */ `
  #include <common>
  #include <color_pars_vertex>
  #include <fog_pars_vertex>
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying vec3 vObjPos;
  varying vec2 vUv2;
  #ifdef USE_WINDOWS
    varying vec3 vInstScale;
    varying vec3 vInstPos;
    varying vec3 vObjNormal;
  #endif
  void main() {
    vUv2 = uv;
    vObjPos = position;
    #ifdef USE_WINDOWS
      #ifdef USE_INSTANCING
        vInstScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vInstPos = instanceMatrix[3].xyz;
      #else
        vInstScale = vec3(1.0);
        vInstPos = vec3(0.0);
      #endif
      vObjNormal = normal;
    #endif
    #include <color_vertex>
    #include <beginnormal_vertex>
    #include <defaultnormal_vertex>
    #include <begin_vertex>
    #include <project_vertex>
    #include <fog_vertex>
    vNormalV = normalize(transformedNormal);
    vViewPos = mvPosition.xyz;
  }
`;

const toonFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uShade;
  uniform vec3 uLightDirV;
  uniform vec3 uRimDirV;
  uniform vec3 uUpV;
  uniform vec3 uRimColor;
  uniform float uRim;
  uniform float uSpec;
  uniform float uSpecSize;
  uniform float uTerminator;
  uniform float uSoft;
  uniform float uBright;
  uniform float uBottomDark;
  uniform vec3 uEmissive;
  uniform float uOpacity;
  uniform float uFlash;
  uniform float uHi;
  uniform float uEdge;
  uniform vec3 uEdgeColor;
  uniform float uToon;
  #ifdef USE_MAP
    uniform sampler2D uMap;
  #endif
  #ifdef USE_CHROME
    uniform vec3 uChromeSky;
    uniform vec3 uChromeHorizon;
    uniform vec3 uChromeDark;
    uniform vec3 uChromeGround;
  #endif
  #ifdef USE_SEAMS
    uniform vec4 uSeams[SEAM_COUNT];
    uniform vec4 uSeamMask[SEAM_COUNT];
    uniform float uSeamWidth;
    uniform float uSeamDark;
  #endif
  #ifdef USE_MOSS
    uniform vec3 uMossColor;
    uniform vec3 uMossEdge;
    uniform float uMossScale;
    uniform float uMossAmount;
  #endif
  #ifdef USE_DOTS
    uniform vec4 uDots[DOT_COUNT];
    uniform vec3 uDotColor;
  #endif
  #ifdef USE_WINDOWS
    uniform vec3 uWinColor;
    uniform vec3 uWinLit;
    uniform vec2 uWinCell;
    varying vec3 vInstScale;
    varying vec3 vInstPos;
    varying vec3 vObjNormal;
    float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  #endif
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying vec3 vObjPos;
  varying vec2 vUv2;
  #include <common>
  #include <color_pars_fragment>
  #include <fog_pars_fragment>

  #ifdef USE_MOSS
    // compact 3D value noise
    float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
    float vnoise(vec3 p) {
      vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
      float n000 = hash3(i), n100 = hash3(i + vec3(1,0,0)), n010 = hash3(i + vec3(0,1,0)), n110 = hash3(i + vec3(1,1,0));
      float n001 = hash3(i + vec3(0,0,1)), n101 = hash3(i + vec3(1,0,1)), n011 = hash3(i + vec3(0,1,1)), n111 = hash3(i + vec3(1,1,1));
      return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y), mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
    }
  #endif

  void main() {
    vec3 N = normalize(vNormalV);
    #ifdef DOUBLE_SIDED
      N = gl_FrontFacing ? N : -N;
    #endif
    vec3 V = normalize(-vViewPos);
    vec3 base = uColor;
    #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
      base *= vColor.rgb;
    #endif
    #ifdef USE_MAP
      vec4 tex = texture2D(uMap, vUv2);
      base *= tex.rgb;
    #endif
    #ifdef USE_MOSS
      float m = vnoise(vObjPos * uMossScale) * 0.65 + vnoise(vObjPos * uMossScale * 2.3 + 7.1) * 0.35;
      float top = smoothstep(-0.2, 0.9, normalize(vObjPos).y);
      float mossT = uMossAmount - top * 0.12;
      float moss = smoothstep(mossT, mossT + 0.02, m);
      float mossRim = smoothstep(mossT - 0.05, mossT - 0.01, m) - moss;
      base = mix(base, uMossEdge, clamp(mossRim, 0.0, 1.0));
      base = mix(base, uMossColor, moss);
    #endif
    #ifdef USE_DOTS
      for (int i = 0; i < DOT_COUNT; i++) {
        float dd = length(vObjPos - uDots[i].xyz) - uDots[i].w;
        float daa = fwidth(dd) * 1.2;
        base = mix(base, uDotColor, 1.0 - smoothstep(-daa, daa, dd));
      }
    #endif

    #ifdef USE_WINDOWS
      if (abs(vObjNormal.y) < 0.5) {
        vec3 lp = vObjPos * vInstScale;
        float hc = abs(vObjNormal.x) > 0.5 ? lp.z : lp.x;
        float fy = lp.y + vInstScale.y * 0.5;
        vec2 cell = vec2(hc / uWinCell.x + 0.5, fy / uWinCell.y);
        vec2 f = fract(cell);
        float fw = fwidth(cell.x) + fwidth(cell.y);
        float win = smoothstep(0.22, 0.22 + fw, f.x) * smoothstep(0.78, 0.78 - fw, f.x)
                  * smoothstep(0.3, 0.3 + fw, f.y) * smoothstep(0.8, 0.8 - fw, f.y);
        win *= step(1.0, cell.y) * step(cell.y, vInstScale.y / uWinCell.y - 0.5);
        float fade = 1.0 - smoothstep(0.35, 0.9, fw);
        float r = h21(floor(cell) + vInstPos.xz * 0.37);
        vec3 wc = mix(uWinColor, uWinLit, step(0.92, r)) * mix(0.85, 1.12, r);
        base = mix(base, wc, win * fade);
        base = mix(base, mix(base, uWinColor, 0.28), (1.0 - fade) * step(1.0, cell.y));
      }
    #endif

    float NdL = dot(N, uLightDirV);
    // toon: tighten the band edge, but never below a pixel (no stair-stepping)
    float soft = max(uSoft * (1.0 - 0.6 * uToon), mix(uSoft, fwidth(NdL) * 0.75, uToon));
    float lit = smoothstep(uTerminator - soft, uTerminator + soft, NdL);
    vec3 shadowTone = base * uShade;
    // painted shadows: richer and a touch cooler/violet instead of just darker
    float sl = dot(shadowTone, vec3(0.299, 0.587, 0.114));
    shadowTone = clamp(mix(vec3(sl), shadowTone, 1.0 + 0.4 * uToon), 0.0, 1.0) * mix(vec3(1.0), vec3(0.95, 0.93, 1.05), uToon);
    vec3 col = mix(shadowTone, base * uBright, lit);
    // core shadow: a second, deeper band where the form turns fully away
    float core = 1.0 - smoothstep(-0.5 - soft, -0.5 + soft, NdL);
    col = mix(col, shadowTone * vec3(0.84, 0.82, 0.92), core * 0.5 * uToon);
    #ifdef USE_CHROME
      // toon chrome: crisp painted bands of what the surface reflects, like airbrushed
      // chrome lettering: sky above, a bright horizon, a dark band, warm ground below
      vec3 Rv = reflect(-V, N);
      float ry = dot(Rv, uUpV);
      float aa = max(fwidth(ry), 0.004);
      vec3 upper = mix(uChromeHorizon, uChromeSky, smoothstep(0.12, 0.62, ry));
      vec3 lower = mix(uChromeGround, uChromeGround * 0.62, smoothstep(-0.2, -0.75, ry));
      vec3 chrome = mix(lower, upper, smoothstep(-0.02 - aa, -0.02 + aa, ry));
      float band = smoothstep(-0.2 - aa, -0.2 + aa, ry) * (1.0 - smoothstep(-0.05 - aa, -0.05 + aa, ry));
      chrome = mix(chrome, uChromeDark, band);
      chrome = mix(chrome, mix(uChromeDark, uChromeGround, 0.35), (1.0 - smoothstep(-0.9, -0.7, ry)) * 0.6);
      col = chrome * mix(0.8, 1.0, lit) * base;
    #endif
    // third cel tone: a crisp, slightly warmer highlight plane facing the key light
    float hi = smoothstep(0.74 - soft, 0.74 + soft, NdL) * uHi * (1.0 + 0.35 * uToon);
    col = mix(col, min(base * uBright * 1.1 + vec3(0.02, 0.015, 0.0), vec3(1.0)), hi);

    // painted ambient: slightly cooler / darker as normals turn to the ground
    float up = dot(N, uUpV);
    col *= mix(1.0 - uBottomDark, 1.03, smoothstep(-0.9, 0.6, up));

    #ifdef USE_SPEC
      vec3 H = normalize(uLightDirV + V);
      float NdH = dot(N, H);
      float sw = mix(0.028, max(0.01, fwidth(NdH) * 0.8), uToon);
      float s = smoothstep(uSpecSize, uSpecSize + sw, NdH);
      col = mix(col, vec3(1.0), s * uSpec);
      // anime glint: a second, smaller hard sticker from an upper-right kicker
      vec3 H2 = normalize(normalize(vec3(0.62, 0.5, 0.6)) + V);
      float NdH2 = dot(N, H2);
      float size2 = mix(uSpecSize, 1.0, 0.45);
      float s2 = smoothstep(size2, size2 + max(0.006, fwidth(NdH2) * 0.8), NdH2);
      col = mix(col, vec3(1.0), s2 * uSpec * 0.85 * uToon);
    #endif

    float fres = 1.0 - clamp(dot(N, V), 0.0, 1.0);
    float rimMask = smoothstep(0.56, 0.6, fres) * smoothstep(-0.1, 0.3, dot(N, uRimDirV));
    col = mix(col, uRimColor * mix(vec3(1.0), base, 0.35), rimMask * uRim);
    // crisp toon rim: a hard-edged sliver of back light, tinted by the surface
    float rimSide = smoothstep(0.0, 0.3, dot(N, uRimDirV));
    float rimW = fwidth(fres) + 0.01;
    float crisp = smoothstep(0.62 - rimW, 0.62 + rimW, fres) * rimSide;
    col = mix(col, max(col, mix(uRimColor, base * 1.3 + 0.12, 0.3)), crisp * 0.6 * uToon);
    // soft light edge all the way round the silhouette (the "sticker" pop against busy art)
    float edge = smoothstep(0.58, 0.92, fres);
    col = mix(col, max(col, uEdgeColor), edge * uEdge);

    #ifdef USE_SEAMS
      for (int i = 0; i < SEAM_COUNT; i++) {
        float d = abs(dot(vObjPos, uSeams[i].xyz) - uSeams[i].w);
        float aa = fwidth(d) * 1.1;
        float line = 1.0 - smoothstep(uSeamWidth - aa, uSeamWidth + aa, d);
        // a seam can stop at a plane (e.g. a button split that ends above the screen)
        line *= step(uSeamMask[i].w, dot(vObjPos, uSeamMask[i].xyz));
        col *= 1.0 - line * uSeamDark;
      }
    #endif

    col += uEmissive;
    col = mix(col, vec3(1.0), uFlash);
    float alpha = uOpacity;
    #ifdef USE_MAP
      alpha *= tex.a;
    #endif
    #ifdef TOON_ALPHATEST
      if (alpha < TOON_ALPHATEST) discard;
    #endif
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export interface ToonOptions {
  color?: THREE.ColorRepresentation;
  /** Multiplier applied to the base colour in shadow (cool lavender by default). */
  shade?: THREE.ColorRepresentation;
  bright?: number;
  /** Strength of the third (highlight) cel tone. */
  hi?: number;
  /** Soft light edge around the silhouette. */
  edge?: number;
  edgeColor?: THREE.ColorRepresentation;
  spec?: number;
  specSize?: number;
  rim?: number;
  rimColor?: THREE.ColorRepresentation;
  terminator?: number;
  soft?: number;
  bottomDark?: number;
  emissive?: THREE.ColorRepresentation;
  map?: THREE.Texture | null;
  vertexColors?: boolean;
  side?: THREE.Side;
  transparent?: boolean;
  opacity?: number;
  fog?: boolean;
  seams?: [number, number, number, number][];
  /** Per seam: only drawn where dot(p, mask.xyz) >= mask.w. */
  seamMasks?: ([number, number, number, number] | null)[];
  seamWidth?: number;
  seamDark?: number;
  moss?: { color: THREE.ColorRepresentation; edge: THREE.ColorRepresentation; scale: number; amount: number };
  dots?: [number, number, number, number][];
  dotColor?: THREE.ColorRepresentation;
  depthWrite?: boolean;
  windows?: { color: THREE.ColorRepresentation; lit: THREE.ColorRepresentation; cell: [number, number] };
  alphaTest?: number;
  /** Toon chrome: banded reflections instead of the colour ramp (base colour tints it). */
  chrome?: { sky: THREE.ColorRepresentation; horizon: THREE.ColorRepresentation; dark: THREE.ColorRepresentation; ground: THREE.ColorRepresentation };
}

export type ToonMaterial = THREE.ShaderMaterial & { isToon: true };

export function toon(o: ToonOptions = {}): ToonMaterial {
  const defines: Record<string, string | number> = {};
  const uniforms: Record<string, THREE.IUniform> = {
    ...fogUniforms(),
    uColor: { value: new THREE.Color(o.color ?? '#ffffff') },
    uShade: { value: new THREE.Color(o.shade ?? '#a3a1d6') },
    uBright: { value: o.bright ?? 1.0 },
    uRimColor: { value: new THREE.Color(o.rimColor ?? '#ffe4f1') },
    uRim: { value: o.rim ?? 0.0 },
    uSpec: { value: o.spec ?? 0.0 },
    uSpecSize: { value: o.specSize ?? 0.965 },
    uTerminator: { value: o.terminator ?? 0.1 },
    uSoft: { value: o.soft ?? 0.1 },
    uHi: { value: o.hi ?? 0.28 },
    uEdge: { value: o.edge ?? 0.32 },
    uEdgeColor: { value: new THREE.Color(o.edgeColor ?? '#f3f1ff') },
    uBottomDark: { value: o.bottomDark ?? 0.08 },
    uEmissive: { value: new THREE.Color(o.emissive ?? '#000000') },
    uOpacity: { value: o.opacity ?? 1.0 },
    uFlash: { value: 0 },
    uToon: shared.uToon,
    uLightDirV: shared.uLightDirV,
    uRimDirV: shared.uRimDirV,
    uUpV: shared.uUpV,
  };
  if (o.map) {
    defines.USE_MAP = '';
    uniforms.uMap = { value: o.map };
  }
  if ((o.spec ?? 0) > 0) defines.USE_SPEC = '';
  if (o.seams && o.seams.length) {
    defines.USE_SEAMS = '';
    defines.SEAM_COUNT = o.seams.length;
    uniforms.uSeams = { value: o.seams.map((s) => new THREE.Vector4(...s)) };
    uniforms.uSeamMask = { value: o.seams.map((_, i) => new THREE.Vector4(...(o.seamMasks?.[i] ?? [0, 0, 0, -1]))) };
    uniforms.uSeamWidth = { value: o.seamWidth ?? 0.008 };
    uniforms.uSeamDark = { value: o.seamDark ?? 0.35 };
  }
  if (o.moss) {
    defines.USE_MOSS = '';
    uniforms.uMossColor = { value: new THREE.Color(o.moss.color) };
    uniforms.uMossEdge = { value: new THREE.Color(o.moss.edge) };
    uniforms.uMossScale = { value: o.moss.scale };
    uniforms.uMossAmount = { value: o.moss.amount };
  }
  if (o.dots && o.dots.length) {
    defines.USE_DOTS = '';
    defines.DOT_COUNT = o.dots.length;
    uniforms.uDots = { value: o.dots.map((d) => new THREE.Vector4(...d)) };
    uniforms.uDotColor = { value: new THREE.Color(o.dotColor ?? '#15151d') };
  }
  if (o.windows) {
    defines.USE_WINDOWS = '';
    uniforms.uWinColor = { value: new THREE.Color(o.windows.color) };
    uniforms.uWinLit = { value: new THREE.Color(o.windows.lit) };
    uniforms.uWinCell = { value: new THREE.Vector2(...o.windows.cell) };
  }
  if (o.chrome) {
    defines.USE_CHROME = '';
    uniforms.uChromeSky = { value: new THREE.Color(o.chrome.sky) };
    uniforms.uChromeHorizon = { value: new THREE.Color(o.chrome.horizon) };
    uniforms.uChromeDark = { value: new THREE.Color(o.chrome.dark) };
    uniforms.uChromeGround = { value: new THREE.Color(o.chrome.ground) };
  }
  if (o.alphaTest) defines.TOON_ALPHATEST = o.alphaTest.toFixed(3);
  if (o.side === THREE.DoubleSide) defines.DOUBLE_SIDED = '';

  const mat = new THREE.ShaderMaterial({
    uniforms,
    defines,
    vertexShader: toonVertex,
    fragmentShader: toonFragment,
    vertexColors: !!o.vertexColors,
    side: o.side ?? THREE.FrontSide,
    transparent: !!o.transparent,
    depthWrite: o.depthWrite ?? true,
    fog: o.fog ?? true,
  }) as ToonMaterial;
  mat.isToon = true;
  return mat;
}

/** Unlit material (screens, glows, sky cards) that still honours fog + colour management. */
export function flat(color: THREE.ColorRepresentation, o: { vertexColors?: boolean; fog?: boolean; transparent?: boolean; opacity?: number; side?: THREE.Side; map?: THREE.Texture; depthWrite?: boolean; blending?: THREE.Blending } = {}) {
  const m = new THREE.MeshBasicMaterial({
    color,
    vertexColors: !!o.vertexColors,
    fog: o.fog ?? true,
    transparent: !!o.transparent,
    opacity: o.opacity ?? 1,
    side: o.side ?? THREE.FrontSide,
    map: o.map ?? null,
    depthWrite: o.depthWrite ?? true,
    blending: o.blending ?? THREE.NormalBlending,
  });
  return m;
}

// ─── Outlines ──────────────────────────────────────────────────────────────

const outlineVertex = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  uniform float uThickness;
  uniform float uPixel;
  uniform float uToon;
  uniform float uOutlineScale;
  uniform vec3 uLightDirV;
  #ifdef USE_OUTLINE_NORMAL
    attribute vec3 outlineNormal;
  #endif
  void main() {
    #ifdef USE_OUTLINE_NORMAL
      vec3 objectNormal = outlineNormal;
    #else
      vec3 objectNormal = normal;
    #endif
    #include <defaultnormal_vertex>
    #include <begin_vertex>
    #include <project_vertex>
    // three negates transformedNormal under FLIP_SIDED (every BackSide material),
    // which shrank the hull *inside* the mesh: JevBot's ink never showed. Level
    // 'off' keeps that (pixel-identical to the old sprites); toon levels push out.
    vec3 nV = normalize(transformedNormal);
    #ifdef FLIP_SIDED
      if (uToon > 0.0) nV = -nV;
    #endif
    float dist = max(-mvPosition.z, 0.001);
    // brush weight: heavier on the shadow side, and in front of the model's
    // centre than behind it (depth reads through line weight, like inked art)
    float shadowSide = 0.5 - 0.5 * dot(nV, uLightDirV);
    float originZ = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).z;
    float depthW = clamp(1.0 + (mvPosition.z - originZ) * 0.35, 0.75, 1.2);
    float weight = uOutlineScale * mix(1.0, (0.8 + 0.45 * shadowSide) * depthW, uToon);
    mvPosition.xyz += nV * uThickness * weight * uPixel * dist;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const outlineFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  #include <common>
  #include <fog_pars_fragment>
  void main() {
    gl_FragColor = vec4(uColor, uOpacity);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

const outlineCache = new Map<string, THREE.ShaderMaterial>();

export function outlineMaterial(color: THREE.ColorRepresentation, thickness = 2.2, smoothNormals = false, fog = true) {
  const key = `${new THREE.Color(color).getHexString()}|${thickness}|${smoothNormals}|${fog}`;
  let m = outlineCache.get(key);
  if (!m) {
    m = new THREE.ShaderMaterial({
      uniforms: {
        ...fogUniforms(),
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: 1 },
        uThickness: { value: thickness },
        uPixel: shared.uPixel,
        uToon: shared.uToon,
        uOutlineScale: shared.uOutlineScale,
        uLightDirV: shared.uLightDirV,
      },
      defines: smoothNormals ? { USE_OUTLINE_NORMAL: '' } : {},
      vertexShader: outlineVertex,
      fragmentShader: outlineFragment,
      side: THREE.BackSide,
      fog,
    });
    outlineCache.set(key, m);
  }
  return m;
}

/** Averages normals of coincident vertices so hulls of hard-edged meshes don't crack. */
export function computeOutlineNormals(geo: THREE.BufferGeometry) {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
  const acc = new Map<string, THREE.Vector3>();
  const keys: string[] = new Array(pos.count);
  const q = (v: number) => Math.round(v * 1e4);
  for (let i = 0; i < pos.count; i++) {
    const k = `${q(pos.getX(i))},${q(pos.getY(i))},${q(pos.getZ(i))}`;
    keys[i] = k;
    const a = acc.get(k) ?? new THREE.Vector3();
    a.x += nor.getX(i);
    a.y += nor.getY(i);
    a.z += nor.getZ(i);
    acc.set(k, a);
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const a = acc.get(keys[i])!.clone().normalize();
    out[i * 3] = a.x;
    out[i * 3 + 1] = a.y;
    out[i * 3 + 2] = a.z;
  }
  geo.setAttribute('outlineNormal', new THREE.BufferAttribute(out, 3));
  return geo;
}

export interface OutlineOptions {
  color?: THREE.ColorRepresentation;
  thickness?: number;
  smooth?: boolean;
  fog?: boolean;
  /** Use a different (e.g. lower-res) geometry for the hull. */
  geometry?: THREE.BufferGeometry;
}

/** Adds an inverted-hull outline as a child of `mesh` (works for InstancedMesh too). */
export function addOutline(mesh: THREE.Mesh, o: OutlineOptions = {}) {
  const smooth = !!o.smooth;
  if (smooth && !mesh.geometry.getAttribute('outlineNormal')) computeOutlineNormals(mesh.geometry);
  const mat = outlineMaterial(inkFor(o.color ?? '#2a2540', mesh.material), o.thickness ?? 2.2, smooth, o.fog ?? true);
  let hull: THREE.Mesh;
  if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
    const src = mesh as THREE.InstancedMesh;
    const inst = new THREE.InstancedMesh(src.geometry, mat, src.count);
    inst.instanceMatrix = src.instanceMatrix;
    inst.count = src.count;
    inst.frustumCulled = false;
    hull = inst;
  } else {
    hull = new THREE.Mesh(o.geometry ?? mesh.geometry, mat);
  }
  hull.name = 'outline';
  hull.renderOrder = mesh.renderOrder;
  hull.raycast = () => {};
  mesh.add(hull);
  return hull;
}

/** Convenience: mesh + toon material + outline in one call. */
export function toonMesh(geo: THREE.BufferGeometry, mat: THREE.Material, outline?: OutlineOptions | false) {
  const m = new THREE.Mesh(geo, mat);
  if (outline !== false) addOutline(m, outline ?? {});
  return m;
}

/**
 * Ink tinted from the paint it surrounds (the Genshin / Guilty Gear trick): a
 * deep, saturated version of the part's shadow colour instead of one flat
 * near-black, blended in by the current toon level (set before building).
 */
export function inkFor(line: THREE.ColorRepresentation, paintMat: THREE.Material | THREE.Material[] | undefined) {
  const orig = new THREE.Color(line);
  const mix = TOON_LEVELS[toonLevel].ink;
  const pm = (Array.isArray(paintMat) ? paintMat[0] : paintMat) as ToonMaterial | undefined;
  if (mix <= 0 || !pm?.isToon) return orig;
  const u = pm.uniforms;
  const paint = (u.uColor.value as THREE.Color).clone();
  if (u.uChromeDark) paint.copy(u.uChromeDark.value as THREE.Color).lerp(u.uChromeSky.value as THREE.Color, 0.25).multiply(u.uColor.value as THREE.Color);
  else if (u.uMap) paint.set('#ffffff');
  paint.multiply(u.uShade.value as THREE.Color);
  const hsl = { h: 0, s: 0, l: 0 };
  paint.getHSL(hsl);
  // near-black keeps it reading as ink; the hue is what carries the finish
  const ink = new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * 0.9 + 0.2), 0.085);
  return orig.lerp(ink, mix);
}
