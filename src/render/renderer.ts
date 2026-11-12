// Three.js renderer. The simulation and scene builders still describe the world as instances
// (matrix, colour, material id, geometry id); this file buckets them into InstancedMeshes,
// one per geometry and material, and shades them with physically based materials whose
// surface detail (windows, brick, paving, asphalt, grass, snow cover, wet streets) is
// generated in world space in the shader. Sky, image-based lighting, sun shadows that
// follow the player, reflective water, ambient occlusion and bloom come from Three.js.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Water } from 'three/addons/objects/Water.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Instances, STRIDE, G } from './instances';
import { MODELS, MODEL_NAMES } from './models.gen';
import { makeTextures } from './textures';
export { Instances } from './instances';

export interface Look {
  sun: number[]; sunCol: number[]; ambSky: number[]; ambGnd: number[];
  fog: number[]; fogNear: number; fogFar: number; zen: number[]; hor: number[];
  cloud: number; cloudCol: number[]; sunVis: number;
  snow: number; wet: number; night: number; shadow: number; ice: number;
}
export interface Frame {
  cam: number[]; target: number[]; fovy: number; aspect: number; near: number; far: number;
  focus: number[]; time: number;
}
export type Quality = 'high' | 'medium' | 'low';

/** Material ids, matching M in sim/city.ts. */
const MAT = { PAVE: 0, PLAIN: 1, WATER: 2, FACADE: 3, ASPHALT: 4, GRASS: 5, LEAF: 6, EMIS: 7, BRICK: 8, GLASS: 9, SNOWY: 11, WINDOW: 12, PAINT: 13, METAL: 14, PARTICLE: 15, RAIN: 16, VCOL: 17, VCOLS: 18, VPAINT: 19, VPAINTS: 20 };
const NMAT = 21;

const lin = (c: number) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const col = (c: number[]) => new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);

// --- Shaders --------------------------------------------------------------------------------

const VERT_HEAD = `varying vec3 vArW;`;
const VERT_BODY = `
{ vec4 arw = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
  arw = instanceMatrix * arw;
  #endif
  vArW = ( modelMatrix * arw ).xyz; }`;

const FRAG_HEAD = `
varying vec3 vArW;
uniform float uTime, uSnow, uWet, uNight, uIce;
uniform sampler2D uTA, uTC, uTG, uTB, uTN;
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
vec2 planar(vec3 p, vec3 n){ return abs(n.y) > 0.5 ? p.xz : (abs(n.x) > 0.5 ? p.zy : p.xy); }
// Bump from a scalar height field, in world space (Mikkelsen's surface gradient method).
vec3 bumpN(vec3 p, vec3 n, float h, float k){
  vec3 dpx = dFdx(p), dpy = dFdy(p); float dhx = dFdx(h)*k, dhy = dFdy(h)*k;
  vec3 r1 = cross(dpy, n), r2 = cross(n, dpx); float det = dot(dpx, r1);
  vec3 g = sign(det)*(dhx*r1 + dhy*r2);
  return normalize(abs(det)*n - g);
}
// Antialiased box mask: 1 inside [a,b] on both axes.
float boxm(vec2 f, vec2 a, vec2 b){ vec2 w = max(fwidth(f), vec2(1e-4)); vec2 s = smoothstep(a - w, a + w, f) * (1.0 - smoothstep(b - w, b + w, f)); return s.x*s.y; }
`;

const FRAG_BODY = `
{
  vec3 nW = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
  vec3 P = vArW; float dist = length( cameraPosition - P );
  vec3 base = diffuseColor.rgb; float rough = roughnessFactor, metal = metalnessFactor;
  vec3 emis = vec3( 0.0 ); float h = 0.5, bk = 0.0; bool setN = false; vec3 nOut = nW;
  vec2 uv = planar( P, nW );
  float near = clamp( 1.0 - dist / 160.0, 0.0, 1.0 );

#if MATID == 0
  vec4 t = texture2D( uTC, uv / 3.0 ); base *= t.rgb; h = t.a; bk = 0.02; rough = 0.86;
#elif MATID == 4
  vec4 t = texture2D( uTA, uv / 6.0 ); base *= t.rgb * ( 0.9 + 0.2 * vn( P.xz * 0.05 ) ); h = t.a; bk = 0.006; rough = 0.93;
#elif MATID == 5
  vec4 t = texture2D( uTG, uv / 2.5 ); base *= t.rgb * ( 0.85 + 0.3 * vn( P.xz * 0.04 ) ); h = t.a; bk = 0.02; rough = 0.95;
#elif MATID == 11
  vec4 t = texture2D( uTC, uv / 4.0 ); base *= mix( vec3( 1.0 ), t.rgb, 0.45 ); h = t.a; bk = 0.008;
#elif MATID == 6
  base *= 0.68 + 0.6 * vn( P.xz * 1.9 + P.y * 1.3 ); rough = 0.88;
#elif MATID == 2
  {
    vec2 q = P.xz;
    vec3 a = texture2D( uTN, q * 0.018 + uTime * vec2( 0.006, 0.004 ) ).xyz * 2.0 - 1.0;
    vec3 b = texture2D( uTN, q * 0.071 - uTime * vec2( 0.011, 0.007 ) ).xyz * 2.0 - 1.0;
    vec3 wn = normalize( vec3( a.x + b.x * 0.6, 2.4, a.y + b.y * 0.6 ) );
    rough = 0.03; metal = 0.0; setN = true; nOut = wn;
    if ( uIce > 0.0 ) {
      float ice = smoothstep( 0.48, 0.55, vn( q * 0.045 ) * 0.7 + vn( q * 0.2 ) * 0.3 ) * uIce;
      base = mix( base, vec3( 0.80, 0.86, 0.92 ), ice ); rough = mix( rough, 0.35, ice ); nOut = normalize( mix( wn, vec3( 0.0, 1.0, 0.0 ), ice ) );
    }
  }
#elif MATID == 3 || MATID == 8 || MATID == 9
  if ( abs( nW.y ) < 0.5 ) {
    float u = abs( nW.x ) > 0.5 ? P.z : P.x; float v = P.y;
    vec3 wall = base; float wh = 1.0;
  #if MATID == 8
    vec4 tb = texture2D( uTB, vec2( u / 2.48, v / 1.2 ) );
    wall = mix( base * tb.r, vec3( 0.62, 0.60, 0.57 ), tb.g * 0.85 ); wh = tb.b;
  #else
    vec4 tc = texture2D( uTC, vec2( u, v ) / 5.0 ); wall *= mix( vec3( 1.0 ), tc.rgb, 0.3 ); wh = 0.75 + 0.25 * tc.a;
  #endif
    float far = smoothstep( 140.0, 360.0, dist );
    float win; vec2 cell; bool shop = v < 4.3;
    if ( shop ) {
      vec2 f = vec2( fract( u / 4.0 ), v / 4.3 ); cell = vec2( floor( u / 4.0 ), -1.0 );
      win = boxm( f, vec2( 0.07, 0.12 ), vec2( 0.93, 0.8 ) );
    } else {
    #if MATID == 9
      vec2 f = vec2( fract( u / 1.8 ), fract( ( v - 4.3 ) / 3.6 ) ); cell = floor( vec2( u / 1.8, ( v - 4.3 ) / 3.6 ) );
      win = boxm( f, vec2( 0.05, 0.1 ), vec2( 0.97, 0.98 ) );
    #else
      vec2 f = vec2( fract( u / 3.2 ), fract( ( v - 4.3 ) / 3.5 ) ); cell = floor( vec2( u / 3.2, ( v - 4.3 ) / 3.5 ) );
      win = boxm( f, vec2( 0.2, 0.22 ), vec2( 0.8, 0.8 ) );
    #endif
    }
    win *= 1.0 - far * 0.55;
    float lit = step( 1.0 - 0.5 * uNight, h21( cell + 7.3 ) ) * uNight;
  #if MATID == 9
    vec3 glass = base * 0.3 + vec3( 0.01, 0.015, 0.02 ); float gm = 0.75;
  #else
    vec3 glass = vec3( 0.025, 0.03, 0.035 ) + vec3( 0.03, 0.025, 0.02 ) * h21( cell ); float gm = 0.15;
  #endif
    if ( shop ) glass += vec3( 0.07, 0.05, 0.03 );
  #if MATID == 9
    glass += vec3( 0.0, 0.02, 0.03 ) * h21( cell + 1.7 ) + vec3( 0.03, 0.05, 0.08 ) * smoothstep( 0.0, 70.0, v );
  #else
    {
      // Interiors: blinds drawn part way down, lighter sky reflection higher up.
      float blind = step( 0.45, h21( cell + 3.1 ) ) * ( 0.25 + 0.6 * h21( cell + 9.7 ) );
      float inW = shop ? 0.0 : step( 1.0 - blind, 1.0 - ( fract( ( v - 4.3 ) / 3.5 ) - 0.22 ) / 0.58 );
      glass = mix( glass + vec3( 0.04, 0.06, 0.09 ) * smoothstep( 4.0, 40.0, v ), vec3( 0.46, 0.43, 0.38 ) * ( 0.5 + 0.5 * h21( cell + 5.5 ) ), inW * 0.9 );
    }
  #endif
    base = mix( wall, glass, win );
  #if MATID != 9
    {
      // Window trim: pale frame ring and a sill under each opening.
      vec2 ff = shop ? vec2( fract( u / 4.0 ), v / 4.3 ) : vec2( fract( u / 3.2 ), fract( ( v - 4.3 ) / 3.5 ) );
      float ring = boxm( ff, shop ? vec2( 0.04, 0.09 ) : vec2( 0.16, 0.18 ), shop ? vec2( 0.96, 0.84 ) : vec2( 0.84, 0.84 ) ) - win;
      float sill = shop ? 0.0 : boxm( ff, vec2( 0.14, 0.14 ), vec2( 0.86, 0.2 ) );
      base = mix( base, vec3( 0.80, 0.79, 0.76 ), clamp( ring, 0.0, 1.0 ) * 0.8 + sill * 0.55 * ( 1.0 - win ) );
      // Dark storefront band and an awning shadow line over the shops.
      if ( shop ) base *= 1.0 - 0.35 * smoothstep( 3.9, 4.3, v ) * ( 1.0 - win );
    }
  #endif
    rough = mix( 0.82, 0.05, win ); metal = mix( 0.0, gm, win );
    emis = vec3( 1.0, 0.78, 0.52 ) * win * ( shop ? uNight * 1.0 : lit * 1.35 );
    base *= 0.72 + 0.28 * smoothstep( 0.0, 2.5, v );
    h = mix( wh, 0.0, win ); bk = 0.09 * ( 1.0 - far );
  } else {
    vec4 t = texture2D( uTC, P.xz / 4.0 ); base *= 0.75 * t.rgb; rough = 0.9; h = t.a; bk = 0.004;
  }
#endif

#if MATID != 1 && MATID != 2 && MATID != 12 && MATID != 13 && MATID != 14 && MATID != 17 && MATID != 19
  if ( uSnow > 0.0 ) {
    float cov = uSnow * smoothstep( 0.35, 0.75, nW.y );
  #if MATID == 4
    cov *= 1.0 - 0.55 * smoothstep( 0.5, 0.8, vn( P.xz * vec2( 0.8, 0.8 ) ) );
  #elif MATID == 6
    cov *= 0.8;
  #endif
    if ( cov > 0.0 ) {
      float s = vn( P.xz * 2.3 ) * 0.5 + vn( P.xz * 9.0 ) * 0.5;
      base = mix( base, vec3( 0.84, 0.87, 0.92 ) * ( 0.95 + 0.08 * s ), cov );
      rough = mix( rough, 0.68, cov ); metal = mix( metal, 0.0, cov );
      h = mix( h, s, cov ); bk = mix( bk, 0.03, cov );
      emis += vec3( 0.9 ) * step( 0.998, h21( floor( P.xz * 23.0 ) * 0.071 + 3.1 ) ) * cov * smoothstep( 18.0, 3.0, dist );
    }
  }
#endif
#if MATID == 0 || MATID == 4 || MATID == 11
  if ( uWet > 0.0 && nW.y > 0.5 ) {
    float pud = smoothstep( 0.45, 0.7, vn( P.xz * 0.22 ) );
    base *= mix( 1.0, 0.5, uWet );
    rough = mix( rough, mix( 0.3, 0.02, pud ), uWet );
    if ( pud > 0.2 ) {
      vec2 c = fract( P.xz * 0.7 + floor( uTime * 3.0 ) * 0.37 ) - 0.5;
      float rip = 0.5 + 0.5 * sin( length( c ) * 40.0 - uTime * 9.0 ) * smoothstep( 0.5, 0.0, length( c ) );
      h = mix( h, rip, pud ); bk = mix( bk, 0.004, pud );
    }
  }
#endif

  diffuseColor.rgb = base; roughnessFactor = rough; metalnessFactor = metal; totalEmissiveRadiance += emis;
  bk *= near;
  if ( bk > 0.0 ) { nOut = bumpN( P, nOut, h, bk ); setN = true; }
  if ( setN ) normal = normalize( ( viewMatrix * vec4( nOut, 0.0 ) ).xyz );
}
`;

const SKY_V = `
varying vec3 vDir;
void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); gl_Position = p.xyww; }`;
const SKY_F = `
varying vec3 vDir;
uniform vec3 uSun, uSunCol, uZen, uHor, uFog, uCloudCol;
uniform float uTime, uCloud, uSunVis;
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++) { s += a*vn(p); p = p*2.03 + 17.1; a *= 0.5; } return s; }
void main(){
  vec3 d = normalize( vDir );
  vec3 c = mix( uHor, uZen, pow( max( d.y, 0.0 ), 0.5 ) );
  float sd = max( dot( d, uSun ), 0.0 );
  c += uSunCol * ( pow( sd, 2200.0 ) * 60.0 + pow( sd, 64.0 ) * 0.5 + pow( sd, 6.0 ) * 0.12 ) * uSunVis;
  if ( d.y > 0.0 ) {
    vec2 cp = d.xz / ( d.y + 0.1 ) * 0.8 + vec2( uTime * 0.01, uTime * 0.004 );
    float n = fbm( cp ), cl = smoothstep( 1.0 - uCloud, 1.0 - uCloud + 0.32, n + 0.25 );
    float shade = 0.72 + 0.4 * fbm( cp * 2.1 + 3.0 );
    vec3 cc = uCloudCol * shade + uSunCol * pow( sd, 5.0 ) * 0.6 * uSunVis;
    c = mix( c, cc, cl * smoothstep( 0.0, 0.18, d.y ) );
  }
  c = mix( uFog, c, smoothstep( -0.02, 0.16, d.y ) );
  gl_FragColor = vec4( c, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// --- Geometry -------------------------------------------------------------------------------

function wedgeGeo() {
  const A = [-0.5, -0.5, -0.5], B = [0.5, -0.5, -0.5], C = [0.5, -0.5, 0.5], D = [-0.5, -0.5, 0.5], E = [0.5, 0.5, -0.5], F = [0.5, 0.5, 0.5];
  const tris: number[][][] = [[A, B, C], [A, C, D], [B, C, F], [B, F, E], [A, D, F], [A, F, E], [A, B, E], [D, C, F]];
  const cx = 1 / 6, cy = -1 / 6, v: number[] = [];
  for (const [a, b, c] of tris) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const mx = (a[0] + b[0] + c[0]) / 3 - cx, my = (a[1] + b[1] + c[1]) / 3 - cy, mz = (a[2] + b[2] + c[2]) / 3;
    if (nx * mx + ny * my + nz * mz < 0) v.push(...a, ...c, ...b); else v.push(...a, ...b, ...c);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals();
  return g;
}
function blobGeo() {
  let g = new THREE.IcosahedronGeometry(0.5, 2); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + 0.13 * Math.sin(x * 17.1 + y * 11.3) * Math.cos(z * 13.7 - y * 7.1);
    p.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals(); return g;
}

/** Unpack a model written by tools/models.mjs. Vertex colours are stored as sRGB bytes. */
function modelGeo(name: string) {
  const m = (MODELS as any)[name], bytes = (s: string) => { const b = atob(s), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
  const p16 = new Int16Array(bytes(m.p).buffer), n8 = new Int8Array(bytes(m.nn).buffer), c8 = bytes(m.c), idx = new Uint16Array(bytes(m.i).buffer);
  const pos = new Float32Array(p16.length), nor = new Float32Array(n8.length), col = new Float32Array(c8.length);
  for (let i = 0; i < p16.length; i++) { pos[i] = p16[i] * m.q; nor[i] = n8[i] / 127; col[i] = lin(c8[i] / 255); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

// --- Materials ------------------------------------------------------------------------------

function makeShared(tx: ReturnType<typeof makeTextures>) {
  return {
    uTime: { value: 0 }, uSnow: { value: 0 }, uWet: { value: 0 }, uNight: { value: 0 }, uIce: { value: 0 },
    uTA: { value: tx.asphalt }, uTC: { value: tx.concrete }, uTG: { value: tx.grass }, uTB: { value: tx.brick }, uTN: { value: tx.water },
  };
}
function makeMaterial(id: number, shared: any): any {
  if (id === MAT.EMIS) { const m = new THREE.MeshBasicMaterial(); m.color.setScalar(3.2); return m; }
  if (id === MAT.PARTICLE) return new THREE.MeshBasicMaterial({ color: 0xffffff });
  if (id === MAT.RAIN) return new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, depthWrite: false });
  let m: any;
  if (id === MAT.PAINT) m = new THREE.MeshPhysicalMaterial({ roughness: 0.42, metalness: 0.45, clearcoat: 1, clearcoatRoughness: 0.06 });
  else if (id === MAT.VPAINT || id === MAT.VPAINTS) m = new THREE.MeshPhysicalMaterial({ roughness: 0.4, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08, vertexColors: true });
  else if (id === MAT.VCOL || id === MAT.VCOLS) m = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.1, vertexColors: true });
  else {
    const r: Record<number, number[]> = { 0: [0.86, 0], 1: [0.62, 0], 2: [0.03, 0], 3: [0.82, 0], 4: [0.93, 0], 5: [0.95, 0], 6: [0.88, 0], 8: [0.85, 0], 9: [0.4, 0.2], 11: [0.8, 0], 12: [0.06, 0.85], 14: [0.38, 0.85] };
    const [ro, me] = r[id] || [0.7, 0];
    m = new THREE.MeshStandardMaterial({ roughness: ro, metalness: me });
  }
  m.defines = { MATID: id };
  m.customProgramCacheKey = () => 'arl' + id;
  m.onBeforeCompile = (sh: any) => {
    Object.assign(sh.uniforms, shared);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_HEAD).replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_BODY);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG_HEAD).replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAG_BODY);
  };
  return m;
}

// --- Instance layers --------------------------------------------------------------------------

/** One InstancedMesh per (geometry, material) pair, filled from instance lists. */
class Layer {
  meshes: any[]; private counts: Int32Array;
  constructor(private scene: any, private geos: any[], private mats: any[], private dynamic: boolean, private shadows: boolean, public skip: (key: number) => boolean = () => false) {
    this.meshes = new Array(geos.length * 32).fill(null); this.counts = new Int32Array(geos.length * 32);
  }
  fill(lists: [Instances, number | undefined][]) {
    const counts = this.counts; counts.fill(0);
    for (const [list, force] of lists) {
      const a = list.data;
      for (let i = 0, o = 0; i < list.n; i++, o += STRIDE) { const key = (force ?? a[o + 20]) * 32 + a[o + 19]; if (!this.skip(key)) counts[key]++; }
    }
    for (let key = 0; key < counts.length; key++) {
      let m = this.meshes[key];
      if (counts[key] === 0) { if (m) m.count = 0; continue; }
      if (!m || m.userData.cap < counts[key]) {
        if (m) { this.scene.remove(m); m.dispose(); }
        const cap = this.dynamic ? Math.max(32, Math.ceil(counts[key] * 1.5)) : counts[key];
        const geo = key >> 5, mat = key & 31;
        m = new THREE.InstancedMesh(this.geos[geo], this.mats[mat], cap);
        m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
        if (this.dynamic) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.instanceColor.setUsage(THREE.DynamicDrawUsage); }
        m.userData.cap = cap; m.frustumCulled = false;
        const unlit = mat === MAT.EMIS || mat === MAT.PARTICLE || mat === MAT.RAIN;
        m.castShadow = this.shadows && !unlit && mat !== MAT.WATER; m.receiveShadow = !unlit;
        this.meshes[key] = m; this.scene.add(m);
      }
      m.count = 0;
    }
    for (const [list, force] of lists) {
      const a = list.data;
      for (let i = 0, o = 0; i < list.n; i++, o += STRIDE) {
        const key = (force ?? a[o + 20]) * 32 + a[o + 19]; if (this.skip(key)) continue;
        const m = this.meshes[key], j = m.count++;
        m.instanceMatrix.array.set(a.subarray(o, o + 16), j * 16);
        const c = m.instanceColor.array; c[j * 3] = lin(a[o + 16]); c[j * 3 + 1] = lin(a[o + 17]); c[j * 3 + 2] = lin(a[o + 18]);
      }
    }
    for (const m of this.meshes) if (m && m.count) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
  }
  count() { let n = 0; for (const m of this.meshes) if (m) n += m.count; return n; }
}

const QUALITY: Record<Quality, { dpr: number; shadow: number; range: number; ao: boolean; bloom: boolean; water: boolean; post: boolean }> = {
  high: { dpr: 2, shadow: 4096, range: 90, ao: true, bloom: true, water: true, post: true },
  medium: { dpr: 1.5, shadow: 2048, range: 70, ao: false, bloom: true, water: false, post: true },
  low: { dpr: 1, shadow: 1024, range: 60, ao: false, bloom: false, water: false, post: false },
};

export class Renderer {
  gl: any; drawCalls = 0; boxes = 0; triangles = 0; quality: Quality = 'high';
  private scene: any; private camera: any; private sun: any; private hemi: any;
  private sky: any; private skyMat: any; private envScene: any; private pmrem: any; private envTex: any = null;
  private shared: any; private geos: any[]; private mats: any[] = [];
  private stat: Layer; private dyn: Layer; private fx: Layer; private field: Layer;
  private signs: any[] = []; private water: any = null; private waterTex: any; private waterCol = new THREE.Color(0x2b5f86);
  private composer: any = null; private ao: any = null; private size = [0, 0, 1];
  private look: Look | null = null; private iceOn = false; private lastStatic: [Instances, number | undefined][] = [];

  constructor(canvas: HTMLCanvasElement) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    if (!r.capabilities.isWebGL2) throw new Error('WebGL2 is not available in this browser.');
    this.gl = r;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0; r.outputColorSpace = THREE.SRGBColorSpace;
    r.info.autoReset = false;
    const tx = makeTextures(Math.min(8, r.capabilities.getMaxAnisotropy()));
    this.waterTex = tx.water; this.shared = makeShared(tx);
    this.geos = [new THREE.BoxGeometry(1, 1, 1), wedgeGeo(), blobGeo(), new THREE.CylinderGeometry(0.5, 0.5, 1, 14, 1), new THREE.SphereGeometry(0.5, 20, 14), new THREE.CapsuleGeometry(0.25, 0.5, 5, 12)];
    for (const name of MODEL_NAMES) this.geos.push(modelGeo(name));
    for (let i = 0; i < 32; i++) this.mats.push(i < NMAT ? makeMaterial(i === 10 ? 1 : i, this.shared) : null);

    const s = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.3, 1700);
    this.sun = new THREE.DirectionalLight(0xffffff, 3); this.sun.castShadow = true;
    const sh = this.sun.shadow; sh.bias = -0.0004; sh.normalBias = 0.045;
    s.add(this.sun); s.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbcd2ee, 0x5a5850, 0.5); s.add(this.hemi);

    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_V, fragmentShader: SKY_F, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
      uniforms: { uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() },
        uFog: { value: new THREE.Color() }, uCloudCol: { value: new THREE.Color() }, uTime: { value: 0 }, uCloud: { value: 0.3 }, uSunVis: { value: 1 } },
    });
    const sg = new THREE.SphereGeometry(1, 48, 24);
    this.sky = new THREE.Mesh(sg, this.skyMat); this.sky.scale.setScalar(1000); this.sky.renderOrder = -1000; this.sky.frustumCulled = false; s.add(this.sky);
    this.envScene = new THREE.Scene(); const es = new THREE.Mesh(sg, this.skyMat); es.scale.setScalar(100); this.envScene.add(es);
    this.pmrem = new THREE.PMREMGenerator(r);

    this.stat = new Layer(s, this.geos, this.mats, false, true, k => this.water !== null && k === G.BOX * 32 + MAT.WATER);
    this.dyn = new Layer(s, this.geos, this.mats, true, true);
    this.fx = new Layer(s, this.geos, this.mats, true, false);
    this.field = new Layer(s, this.geos, this.mats, true, false);
    this.setQuality('high');
  }

  setQuality(q: Quality) {
    this.quality = q; const Q = QUALITY[q], sh = this.sun.shadow;
    sh.mapSize.set(Q.shadow, Q.shadow); if (sh.map) { sh.map.dispose(); sh.map = null; }
    const c = sh.camera; c.left = -Q.range; c.right = Q.range; c.top = Q.range; c.bottom = -Q.range; c.near = 1; c.far = 700; c.updateProjectionMatrix();
    if (this.composer) { this.composer.dispose(); this.composer = null; this.ao = null; }
    this.syncWater();
    this.size = [0, 0, 0];
  }

  private buildComposer(w: number, h: number) {
    const Q = QUALITY[this.quality], r = this.gl;
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
    const c = new EffectComposer(r, rt);
    c.addPass(new RenderPass(this.scene, this.camera));
    if (Q.ao) { this.ao = new GTAOPass(this.scene, this.camera, w, h); this.ao.blendIntensity = 0.85; c.addPass(this.ao); }
    if (Q.bloom) c.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.32, 0.55, 0.92));
    c.addPass(new OutputPass());
    this.composer = c;
  }

  /** Canvas size in CSS pixels. Returns the pixel ratio actually used. */
  resize(w: number, h: number, dpr: number) {
    const d = Math.min(dpr, QUALITY[this.quality].dpr);
    if (w === this.size[0] && h === this.size[1] && d === this.size[2]) return d;
    this.size = [w, h, d];
    this.gl.setPixelRatio(d); this.gl.setSize(w, h, false);
    if (QUALITY[this.quality].post) {
      if (!this.composer) this.buildComposer(Math.round(w * d), Math.round(h * d));
      this.composer.setPixelRatio(d); this.composer.setSize(w, h);
    }
    return d;
  }

  private syncWater() {
    const want = QUALITY[this.quality].water && !this.iceOn && this.look !== null && this.stat !== undefined;
    const had = this.water !== null;
    if (want && !this.water) {
      const w = new Water(new THREE.PlaneGeometry(1300, 1000), {
        textureWidth: 512, textureHeight: 512, waterNormals: this.waterTex, sunDirection: new THREE.Vector3(0, 1, 0),
        sunColor: 0xffffff, waterColor: this.waterCol, distortionScale: 2.2, fog: true,
      });
      w.rotation.x = -Math.PI / 2; w.position.set(-100, -0.595, -50); w.material.uniforms.size.value = 3.0;
      this.water = w; this.scene.add(w);
    } else if (!want && this.water) { this.scene.remove(this.water); this.water.geometry.dispose(); this.water.material.dispose(); this.water = null; }
    if (had !== (this.water !== null) && this.lastStatic.length) this.stat.fill(this.lastStatic);
    if (this.water && this.look) {
      const u = this.water.material.uniforms, L = this.look;
      u.sunDirection.value.set(L.sun[0], L.sun[1], L.sun[2]).normalize();
      u.sunColor.value.copy(col(L.sunCol)).multiplyScalar(L.sunVis);
      u.waterColor.value.copy(this.waterCol);
    }
  }

  /** Lighting, sky, fog and surface state for a season and its weather. */
  setLook(L: Look, water: number[] | null, hasWater: boolean) {
    this.look = L;
    const u = this.skyMat.uniforms;
    u.uSun.value.set(L.sun[0], L.sun[1], L.sun[2]).normalize(); u.uSunCol.value.copy(col(L.sunCol)).multiplyScalar(2.2);
    u.uZen.value.copy(col(L.zen)); u.uHor.value.copy(col(L.hor)); u.uFog.value.copy(col(L.fog)); u.uCloudCol.value.copy(col(L.cloudCol));
    u.uCloud.value = L.cloud; u.uSunVis.value = L.sunVis;
    const m = Math.max(...L.sunCol, 1e-3);
    this.sun.color.copy(col(L.sunCol.map(c => c / m))); this.sun.intensity = 6.0 * m;
    this.sun.castShadow = L.shadow > 0.05;
    if (this.sun.shadow.intensity !== undefined) this.sun.shadow.intensity = Math.min(1, L.shadow * 1.1);
    this.hemi.color.copy(col(L.ambSky)); this.hemi.groundColor.copy(col(L.ambGnd)); this.hemi.intensity = 0.4;
    this.scene.fog = new THREE.Fog(col(L.fog), L.fogNear, L.fogFar);
    this.scene.environmentIntensity = 0.6;
    const sh = this.shared; sh.uSnow.value = L.snow; sh.uWet.value = L.wet; sh.uNight.value = L.night; sh.uIce.value = L.ice;
    if (water) this.waterCol.copy(col(water));
    this.iceOn = L.ice > 0 || !hasWater;
    const env = this.pmrem.fromScene(this.envScene, 0.02, 0.1, 400);
    if (this.envTex) this.envTex.dispose();
    this.envTex = env; this.scene.environment = env.texture;
    this.syncWater();
  }

  setStatic(cubes: Instances, wedges: Instances) { this.lastStatic = [[cubes, undefined], [wedges, G.WEDGE]]; this.stat.fill(this.lastStatic); }
  setField(inst: Instances) { this.field.fill([[inst, undefined]]); }

  /** verts: x,y,z,u,v,glow per vertex, six vertices per sign. */
  setSigns(verts: Float32Array, atlas: HTMLCanvasElement) {
    for (const m of this.signs) { this.scene.remove(m); m.geometry.dispose(); if (m.material.map) m.material.map.dispose(); m.material.dispose(); }
    this.signs = [];
    for (const glow of [0, 1]) {
      const pos: number[] = [], uv: number[] = [];
      for (let i = 0; i < verts.length; i += 6) if (verts[i + 5] === glow) { pos.push(verts[i], verts[i + 1], verts[i + 2]); uv.push(verts[i + 3], 1 - verts[i + 4]); }
      if (!pos.length) continue;
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
      const t = new THREE.CanvasTexture(atlas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.flipY = true;
      const mat = glow ? new THREE.MeshBasicMaterial({ map: t, alphaTest: 0.4, side: THREE.BackSide }) : new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.4, side: THREE.BackSide, roughness: 0.6 });
      if (glow) mat.color.setScalar(2.4);
      const m = new THREE.Mesh(g, mat); m.receiveShadow = !glow; this.signs.push(m); this.scene.add(m);
    }
  }

  draw(f: Frame, dyn: Instances, fx: Instances) {
    const r = this.gl, c = this.camera;
    r.info.reset();
    c.fov = f.fovy * 180 / Math.PI; c.aspect = f.aspect; c.near = f.near; c.far = f.far; c.updateProjectionMatrix();
    c.position.set(f.cam[0], f.cam[1], f.cam[2]); c.lookAt(f.target[0], f.target[1], f.target[2]);
    this.sky.position.copy(c.position);
    this.skyMat.uniforms.uTime.value = f.time; this.shared.uTime.value = f.time;
    if (this.water) this.water.material.uniforms.time.value = f.time * 0.35;

    // Sun shadow box centred on the player, snapped to texels so edges do not crawl.
    const Q = QUALITY[this.quality], L = this.look, snap = 2 * Q.range / Q.shadow * 2;
    const fx0 = Math.round(f.focus[0] / snap) * snap, fz0 = Math.round(f.focus[2] / snap) * snap, fy0 = Math.max(0, f.focus[1]);
    const sd = L ? L.sun : [0.3, 0.8, 0.4];
    this.sun.position.set(fx0 + sd[0] * 300, fy0 + sd[1] * 300, fz0 + sd[2] * 300); this.sun.target.position.set(fx0, fy0, fz0); this.sun.target.updateMatrixWorld();

    this.dyn.fill([[dyn, undefined]]); this.fx.fill([[fx, undefined]]);
    if (this.composer) this.composer.render(); else r.render(this.scene, c);
    this.drawCalls = r.info.render.calls; this.triangles = r.info.render.triangles;
    this.boxes = this.stat.count() + this.dyn.count() + this.fx.count() + this.field.count();
  }
}
