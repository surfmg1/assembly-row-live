// Instanced box renderer: procedural sky, one sun shadow map, per-material shading (facades,
// water, snow cover, wet streets), and a small textured-quad pass for signs. WebGL2, no libraries.
import { M4, lookAt, mul, ortho } from './mat';

export interface Look {
  sun: number[]; sunCol: number[]; ambSky: number[]; ambGnd: number[];
  fog: number[]; fogNear: number; fogFar: number; zen: number[]; hor: number[];
  cloud: number; cloudCol: number[]; sunVis: number;
  snow: number; wet: number; night: number; shadow: number; ice: number;
}
export interface Frame {
  vp: M4; cam: number[]; right: number[]; up: number[]; fwd: number[]; tanX: number; tanY: number;
  blob: number[]; focus: number[]; time: number; look: Look;
}

const NOISE = `
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }`;

const VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec4 aM0; layout(location=2) in vec4 aM1; layout(location=3) in vec4 aM2; layout(location=4) in vec4 aM3;
layout(location=5) in vec4 aCol;
uniform mat4 uVP;
out vec3 vW; out vec4 vC;
void main(){ vec4 w = mat4(aM0,aM1,aM2,aM3) * vec4(aPos,1.0); vW = w.xyz; vC = aCol; gl_Position = uVP * w; }`;

const FS_DEPTH = `#version 300 es
precision mediump float;
void main(){}`;

const FS = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
in vec3 vW; in vec4 vC;
uniform vec3 uCam, uBlob, uFog, uSun, uSunCol, uAmbSky, uAmbGnd, uZen, uHor;
uniform vec4 uFx;  // time, fogNear, fogFar, shadow strength
uniform vec4 uEnv; // snow, wet, night, ice
uniform mat4 uLVP;
uniform sampler2DShadow uShadow;
out vec4 o;
${NOISE}
float shadow(vec3 wp, vec3 n){
  if (uFx.w <= 0.01) return 1.0;
  vec4 lp = uLVP * vec4(wp + n*0.14, 1.0);
  vec3 q = lp.xyz*0.5 + 0.5;
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0 || q.z > 1.0) return 1.0;
  float tx = 0.75/2048.0, s = 0.0, zb = q.z - 0.0011;
  s += texture(uShadow, vec3(q.xy + vec2(-tx,-tx), zb)); s += texture(uShadow, vec3(q.xy + vec2(tx,-tx), zb));
  s += texture(uShadow, vec3(q.xy + vec2(-tx,tx), zb));  s += texture(uShadow, vec3(q.xy + vec2(tx,tx), zb));
  float edge = smoothstep(0.5, 0.42, max(abs(q.x-0.5), abs(q.y-0.5)));
  return mix(1.0, s*0.25, uFx.w*edge);
}
void main(){
  vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
  vec3 V = uCam - vW; float dist = length(V); V /= dist;
  if (dot(n, V) < 0.0) n = -n;
  int m = int(vC.a + 0.5);
  vec3 base = vC.rgb, emis = vec3(0.0);
  float fogK = smoothstep(uFx.y, uFx.z, dist)*0.95, gloss = 0.0;
  vec3 skyRef = mix(uHor, uZen, 0.55);

  if (m == 7) { o = vec4(mix(base, uFog, fogK*0.5), 1.0); return; }
  if (m == 2) {
    float t = uFx.x; vec2 p = vW.xz;
    float w1 = vn(p*0.25 + vec2(t*0.35, t*0.2)), w2 = vn(p*0.9 - vec2(t*0.5, t*0.3));
    vec3 nn = normalize(vec3((w1-0.5)*0.5 + (w2-0.5)*0.25, 1.0, (w2-0.5)*0.5 + (w1-0.5)*0.25));
    float fres = 0.04 + 0.96*pow(1.0 - max(dot(V, nn), 0.0), 4.0);
    vec3 rd = reflect(-V, nn);
    vec3 refl = mix(uHor, uZen, clamp(rd.y*1.5, 0.0, 1.0));
    vec3 col = mix(vC.rgb*(uAmbSky*0.9 + uSunCol*0.35), refl, clamp(fres, 0.0, 0.85));
    col += uSunCol * pow(max(dot(rd, uSun), 0.0), 180.0) * 1.6 * uFx.w;
    if (uEnv.w > 0.0) {
      float ice = smoothstep(0.50, 0.56, vn(p*0.045)*0.7 + vn(p*0.2)*0.3);
      col = mix(col, vec3(0.86,0.90,0.95)*(uAmbSky + uSunCol*0.4), ice*0.9*uEnv.w);
    }
    o = vec4(mix(col, uFog, fogK), 1.0); return;
  }
  if (m == 3 || m == 8 || m == 9) {
    if (abs(n.y) < 0.5) {
      float u = abs(n.x) > 0.5 ? vW.z : vW.x, v = vW.y;
      vec3 wall = base;
      if (m == 9) {
        float bu = fract(u/1.8), bv = fract(v/3.6);
        float frame = max(step(bu, 0.08), step(bv, 0.1));
        vec2 pane = floor(vec2(u/1.8, v/3.6));
        vec3 glass = skyRef*(0.40 + 0.22*h21(pane)) * mix(vec3(1.0), wall*1.5, 0.45) + vec3(0.02);
        emis = vec3(1.0,0.82,0.55) * step(1.0 - 0.5*uEnv.z, h21(pane + 7.3)) * uEnv.z * 0.8 * (1.0 - frame);
        float far = smoothstep(90.0, 280.0, dist);
        base = mix(mix(glass, wall, frame), mix(glass, wall, 0.14), far); emis *= 1.0 - far*0.5;
      } else {
        if (m == 8) {
          float row = floor(v/0.3), fade = smoothstep(45.0, 10.0, dist);
          float bx = fract(u/0.62 + 0.5*mod(row, 2.0)), by = fract(v/0.3);
          wall *= 1.0 - 0.2*max(step(bx, 0.07), step(by, 0.13))*fade;
          wall *= 0.93 + 0.14*h21(vec2(floor(u/0.62 + 0.5*mod(row, 2.0)), row))*fade;
        }
        vec3 glass = skyRef*0.36 + vec3(0.03,0.04,0.06);
        if (v < 4.3) {
          float bay = fract(u/4.0);
          if (bay > 0.07 && bay < 0.93 && v > 0.55 && v < 3.5) { base = glass*0.9 + vec3(0.16,0.12,0.06)*(0.5 + uEnv.z); emis = vec3(1.0,0.8,0.5)*uEnv.z*0.5; }
          else base = wall*0.72;
        } else {
          float bu = fract(u/3.2), bv = fract((v-4.3)/3.5);
          bool win = bu > 0.2 && bu < 0.8 && bv > 0.22 && bv < 0.78;
          if (win) emis = vec3(1.0,0.8,0.5) * step(1.0 - 0.45*uEnv.z, h21(floor(vec2(u/3.2, (v-4.3)/3.5)))) * uEnv.z * 0.75;
          float far = smoothstep(110.0, 300.0, dist);
          base = mix(win ? glass : wall, mix(wall, glass, 0.33), far); emis *= 1.0 - far*0.6;
        }
      }
      base *= 0.8 + 0.2*smoothstep(0.0, 2.5, v);
    } else base *= 0.82;
  } else if (m == 0) {
    vec2 p = abs(n.y) > 0.5 ? vW.xz : (abs(n.x) > 0.5 ? vW.zy : vW.xy);
    vec2 g1 = abs(fract(p - 0.5) - 0.5) / max(fwidth(p), vec2(1e-5));
    float l1 = 1.0 - min(min(g1.x, g1.y), 1.0);
    vec2 q = p/5.0;
    vec2 g5 = abs(fract(q - 0.5) - 0.5) / max(fwidth(q), vec2(1e-5));
    float l5 = 1.0 - min(min(g5.x, g5.y)*0.6, 1.0);
    base *= 1.0 - 0.10*l1*clamp(1.0 - dist/55.0, 0.0, 1.0) - 0.13*l5;
    base *= 0.95 + 0.1*vn(p*0.8);
  } else if (m == 4) {
    base *= 0.88 + 0.2*vn(vW.xz*0.35) + 0.08*(vn(vW.xz*7.0) - 0.5)*clamp(1.0 - dist/40.0, 0.0, 1.0);
  } else if (m == 5) {
    base *= 0.84 + 0.3*vn(vW.xz*0.6); base *= 0.94 + 0.14*vn(vW.xz*8.0)*clamp(1.0 - dist/50.0, 0.0, 1.0);
  } else if (m == 6) {
    base *= 0.78 + 0.4*h21(floor(vW.xz*1.4) + floor(vW.y*1.4)*3.7);
  }

  // Snow cover on anything that faces up.
  if (uEnv.x > 0.0 && n.y > 0.4 && m != 1) {
    vec3 sc = vec3(0.90,0.93,0.97) * (0.95 + 0.07*vn(vW.xz*2.3));
    float cov = uEnv.x;
    if (m == 4) { sc = mix(sc*0.93, vec3(0.63,0.65,0.70), smoothstep(0.52, 0.8, vn(vW.xz*0.8))*0.55); cov *= 0.97; }
    else if (m == 6) cov *= 0.8;
    base = mix(base, sc, cov*smoothstep(0.4, 0.7, n.y));
    emis += vec3(0.5)*step(0.9975, h21(floor(vW.xz*30.0)))*uFx.w*clamp(1.0 - dist/30.0, 0.0, 1.0);
  }
  // Rain: darker ground with a sheen and standing puddles.
  if (uEnv.y > 0.0 && n.y > 0.5 && (m == 0 || m == 4 || m == 11)) {
    float pud = smoothstep(0.45, 0.7, vn(vW.xz*0.22));
    base *= mix(1.0, 0.58, uEnv.y);
    float fres = pow(1.0 - max(V.y, 0.0), 3.0);
    gloss = uEnv.y*(0.16 + 0.5*pud)*(0.25 + 0.75*fres);
    if (pud > 0.5) gloss *= 0.9 + 0.1*sin(length(fract(vW.xz*0.7 + floor(uFx.x*3.0)*0.37) - 0.5)*40.0 - uFx.x*9.0);
  }

  float sh = shadow(vW, n);
  vec3 amb = mix(uAmbGnd, uAmbSky, n.y*0.5 + 0.5);
  vec3 col = base*(amb + uSunCol*max(dot(n, uSun), 0.0)*sh);
  col = mix(col, mix(uHor, uZen, 0.3)*1.05, gloss);
  float below = uBlob.y - vW.y;
  if (below > -0.15 && n.y > 0.3) {
    float r = 0.5 + below*0.1;
    col *= 1.0 - (1.0 - smoothstep(r*0.25, r, length(vW.xz - uBlob.xz)))*0.42/(1.0 + below*0.3);
  }
  col += emis;
  o = vec4(mix(col, uFog, fogK), 1.0);
}`;

const VS_SKY = `#version 300 es
out vec2 vN;
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); vN = p*2.0 - 1.0; gl_Position = vec4(vN, 0.9999, 1.0); }`;
const FS_SKY = `#version 300 es
precision highp float;
in vec2 vN;
uniform vec3 uR, uU, uF, uSun, uSunCol, uZen, uHor, uFog, uCloudCol;
uniform vec4 uP; // tanX, tanY, time, cloud cover
uniform float uSunVis;
out vec4 o;
${NOISE}
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a*vn(p); p = p*2.03 + 17.1; a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(uF + vN.x*uP.x*uR + vN.y*uP.y*uU);
  vec3 col = mix(uHor, uZen, pow(max(d.y, 0.0), 0.55));
  float sd = max(dot(d, uSun), 0.0);
  col += uSunCol*(pow(sd, 900.0)*5.0 + pow(sd, 14.0)*0.22)*uSunVis;
  if (d.y > 0.01) {
    vec2 cp = d.xz/(d.y + 0.12)*0.9 + vec2(uP.z*0.012, uP.z*0.005);
    float c = fbm(cp);
    float cl = smoothstep(1.0 - uP.w, 1.0 - uP.w + 0.3, c + 0.25);
    vec3 cc = uCloudCol*(0.82 + 0.28*fbm(cp*1.9 + 5.0)) + uSunCol*pow(sd, 6.0)*0.25*uSunVis;
    col = mix(col, cc, cl*smoothstep(0.01, 0.16, d.y));
  }
  col = mix(uFog, col, smoothstep(-0.03, 0.14, d.y));
  o = vec4(col, 1.0);
}`;

const VS_SIGN = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aUv;
uniform mat4 uVP; out vec3 vUv; out vec3 vW;
void main(){ vUv = aUv; vW = aPos; gl_Position = uVP*vec4(aPos, 1.0); }`;
const FS_SIGN = `#version 300 es
precision highp float;
in vec3 vUv; in vec3 vW;
uniform sampler2D uTex; uniform vec3 uCam, uFog, uLight; uniform vec4 uFx;
out vec4 o;
void main(){
  vec4 t = texture(uTex, vUv.xy);
  if (t.a < 0.4 || gl_FrontFacing) discard; // quads are wound clockwise toward their reader
  vec3 col = t.rgb*mix(uLight, vec3(1.15), max(vUv.z, uFx.w*0.55));
  o = vec4(mix(col, uFog, smoothstep(uFx.y, uFx.z, length(uCam - vW))*0.9), 1.0);
}`;

const STRIDE = 20;

export class Instances {
  data: Float32Array; n = 0;
  constructor(cap: number) { this.data = new Float32Array(cap * STRIDE); }
  clear() { this.n = 0; }
  push(m: M4, r: number, g: number, b: number, mat = 1) {
    if ((this.n + 1) * STRIDE > this.data.length) { const d = new Float32Array(this.data.length * 2); d.set(this.data); this.data = d; }
    const o = this.n * STRIDE; this.data.set(m, o);
    this.data[o + 16] = r; this.data[o + 17] = g; this.data[o + 18] = b; this.data[o + 19] = mat; this.n++;
  }
  /** Axis-aligned box without building a matrix. */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, r: number, g: number, b: number, mat = 1) {
    if ((this.n + 1) * STRIDE > this.data.length) { const d = new Float32Array(this.data.length * 2); d.set(this.data); this.data = d; }
    const o = this.n * STRIDE, a = this.data;
    a[o] = sx; a[o + 1] = 0; a[o + 2] = 0; a[o + 3] = 0; a[o + 4] = 0; a[o + 5] = sy; a[o + 6] = 0; a[o + 7] = 0;
    a[o + 8] = 0; a[o + 9] = 0; a[o + 10] = sz; a[o + 11] = 0; a[o + 12] = cx; a[o + 13] = cy; a[o + 14] = cz; a[o + 15] = 1;
    a[o + 16] = r; a[o + 17] = g; a[o + 18] = b; a[o + 19] = mat; this.n++;
  }
}

function cubeVerts(): Float32Array {
  const v: number[] = [];
  const f = (a: number[], b: number[], c: number[], d: number[]) => v.push(...a, ...b, ...c, ...a, ...c, ...d);
  const p = (x: number, y: number, z: number) => [x - 0.5, y - 0.5, z - 0.5];
  f(p(0, 0, 0), p(1, 0, 0), p(1, 1, 0), p(0, 1, 0)); f(p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1));
  f(p(0, 0, 0), p(0, 0, 1), p(0, 1, 1), p(0, 1, 0)); f(p(1, 0, 0), p(1, 0, 1), p(1, 1, 1), p(1, 1, 0));
  f(p(0, 0, 0), p(1, 0, 0), p(1, 0, 1), p(0, 0, 1)); f(p(0, 1, 0), p(1, 1, 0), p(1, 1, 1), p(0, 1, 1));
  return new Float32Array(v);
}
/** Unit wedge whose top rises toward +x. */
function wedgeVerts(): Float32Array {
  const v: number[] = [];
  const A = [-0.5, -0.5, -0.5], B = [0.5, -0.5, -0.5], C = [0.5, -0.5, 0.5], D = [-0.5, -0.5, 0.5], E = [0.5, 0.5, -0.5], F = [0.5, 0.5, 0.5];
  const q = (a: number[], b: number[], c: number[], d: number[]) => v.push(...a, ...b, ...c, ...a, ...c, ...d);
  q(A, B, C, D); q(B, C, F, E); q(A, D, F, E); v.push(...A, ...B, ...E, ...D, ...C, ...F);
  return new Float32Array(v);
}

interface Set { vao: WebGLVertexArrayObject; buf: WebGLBuffer; verts: number; n: number; }
const SH = 2048;

export class Renderer {
  gl: WebGL2RenderingContext;
  private prog: WebGLProgram; private depth: WebGLProgram; private sky: WebGLProgram; private sign: WebGLProgram;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private us: Record<string, WebGLUniformLocation | null> = {};
  private ug: Record<string, WebGLUniformLocation | null> = {};
  private uDepthVP: WebGLUniformLocation | null;
  private sets: Set[] = [];
  private fbo: WebGLFramebuffer; private shadowTex: WebGLTexture;
  private signVao: WebGLVertexArrayObject; private signBuf: WebGLBuffer; private signTex: WebGLTexture; private signN = 0;
  private skyVao: WebGLVertexArrayObject;
  drawCalls = 0; boxes = 0;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    const sh = (t: number, src: string) => {
      const s = gl.createShader(t)!; gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
      return s;
    };
    const link = (vs: string, fs: string) => {
      const p = gl.createProgram()!; gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
      return p;
    };
    this.prog = link(VS, FS); this.depth = link(VS, FS_DEPTH); this.sky = link(VS_SKY, FS_SKY); this.sign = link(VS_SIGN, FS_SIGN);
    for (const n of ['uVP', 'uCam', 'uBlob', 'uFog', 'uSun', 'uSunCol', 'uAmbSky', 'uAmbGnd', 'uZen', 'uHor', 'uFx', 'uEnv', 'uLVP', 'uShadow']) this.u[n] = gl.getUniformLocation(this.prog, n);
    for (const n of ['uR', 'uU', 'uF', 'uSun', 'uSunCol', 'uZen', 'uHor', 'uFog', 'uCloudCol', 'uP', 'uSunVis']) this.us[n] = gl.getUniformLocation(this.sky, n);
    for (const n of ['uVP', 'uTex', 'uCam', 'uFog', 'uLight', 'uFx']) this.ug[n] = gl.getUniformLocation(this.sign, n);
    this.uDepthVP = gl.getUniformLocation(this.depth, 'uVP');
    // 0 static cubes, 1 static wedges, 2 dynamic, 3 field overlay, 4 effects (no shadow)
    this.sets = [this.makeSet(cubeVerts()), this.makeSet(wedgeVerts()), this.makeSet(cubeVerts()), this.makeSet(cubeVerts()), this.makeSet(cubeVerts())];
    this.skyVao = gl.createVertexArray()!;

    this.shadowTex = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, SH, SH);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    this.fbo = gl.createFramebuffer()!; gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTex, 0);
    gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE); gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.signVao = gl.createVertexArray()!; gl.bindVertexArray(this.signVao);
    this.signBuf = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, this.signBuf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.bindVertexArray(null);
    this.signTex = gl.createTexture()!;
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
  }

  private makeSet(verts: Float32Array): Set {
    const gl = this.gl;
    const vao = gl.createVertexArray()!; gl.bindVertexArray(vao);
    const g = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, g); gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const buf = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    for (let i = 0; i < 5; i++) {
      gl.enableVertexAttribArray(1 + i); gl.vertexAttribPointer(1 + i, 4, gl.FLOAT, false, STRIDE * 4, i * 16); gl.vertexAttribDivisor(1 + i, 1);
    }
    gl.bindVertexArray(null);
    return { vao, buf, verts: verts.length / 3, n: 0 };
  }

  private upload(i: number, inst: Instances, usage: number) {
    const gl = this.gl, s = this.sets[i];
    gl.bindBuffer(gl.ARRAY_BUFFER, s.buf); gl.bufferData(gl.ARRAY_BUFFER, inst.data.subarray(0, inst.n * STRIDE), usage); s.n = inst.n;
  }
  setStatic(cubes: Instances, wedges: Instances) { this.upload(0, cubes, this.gl.STATIC_DRAW); this.upload(1, wedges, this.gl.STATIC_DRAW); }
  setField(inst: Instances) { this.upload(3, inst, this.gl.DYNAMIC_DRAW); }
  /** verts: x,y,z,u,v,glow per vertex, six vertices per sign. */
  setSigns(verts: Float32Array, atlas: HTMLCanvasElement) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.signBuf); gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW); this.signN = verts.length / 6;
    gl.bindTexture(gl.TEXTURE_2D, this.signTex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  draw(f: Frame, dyn: Instances, fx: Instances) {
    const gl = this.gl, L = f.look;
    this.upload(2, dyn, gl.DYNAMIC_DRAW); this.upload(4, fx, gl.DYNAMIC_DRAW);
    this.drawCalls = 0; this.boxes = 0;

    // Sun shadow map: an orthographic box that follows the player, snapped to stop shimmer.
    const R = 95, snap = 2 * R / SH * 4;
    const cx = Math.round(f.focus[0] / snap) * snap, cz = Math.round(f.focus[2] / snap) * snap, cy = Math.max(0, f.focus[1]);
    const lvp = mul(ortho(-R, R, -R, R, 1, 520), lookAt(cx + L.sun[0] * 260, cy + L.sun[1] * 260, cz + L.sun[2] * 260, cx, cy, cz));
    if (L.shadow > 0.01) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); gl.viewport(0, 0, SH, SH); gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.useProgram(this.depth); gl.uniformMatrix4fv(this.uDepthVP, false, lvp);
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 3);
      for (let i = 0; i < 3; i++) { const s = this.sets[i]; if (!s.n) continue; gl.bindVertexArray(s.vao); gl.drawArraysInstanced(gl.TRIANGLES, 0, s.verts, s.n); this.drawCalls++; }
      gl.disable(gl.POLYGON_OFFSET_FILL); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    // Sky.
    gl.useProgram(this.sky); gl.depthMask(false); gl.disable(gl.DEPTH_TEST);
    const us = this.us;
    gl.uniform3fv(us.uR, f.right); gl.uniform3fv(us.uU, f.up); gl.uniform3fv(us.uF, f.fwd);
    gl.uniform3fv(us.uSun, L.sun); gl.uniform3fv(us.uSunCol, L.sunCol); gl.uniform3fv(us.uZen, L.zen); gl.uniform3fv(us.uHor, L.hor);
    gl.uniform3fv(us.uFog, L.fog); gl.uniform3fv(us.uCloudCol, L.cloudCol); gl.uniform4f(us.uP, f.tanX, f.tanY, f.time, L.cloud); gl.uniform1f(us.uSunVis, L.sunVis);
    gl.bindVertexArray(this.skyVao); gl.drawArrays(gl.TRIANGLES, 0, 3); this.drawCalls++;
    gl.depthMask(true); gl.enable(gl.DEPTH_TEST);

    // World.
    gl.useProgram(this.prog);
    const u = this.u;
    gl.uniformMatrix4fv(u.uVP, false, f.vp); gl.uniformMatrix4fv(u.uLVP, false, lvp);
    gl.uniform3fv(u.uCam, f.cam); gl.uniform3fv(u.uBlob, f.blob); gl.uniform3fv(u.uFog, L.fog);
    gl.uniform3fv(u.uSun, L.sun); gl.uniform3fv(u.uSunCol, L.sunCol); gl.uniform3fv(u.uAmbSky, L.ambSky); gl.uniform3fv(u.uAmbGnd, L.ambGnd);
    gl.uniform3fv(u.uZen, L.zen); gl.uniform3fv(u.uHor, L.hor);
    gl.uniform4f(u.uFx, f.time, L.fogNear, L.fogFar, L.shadow); gl.uniform4f(u.uEnv, L.snow, L.wet, L.night, L.ice);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.shadowTex); gl.uniform1i(u.uShadow, 0);
    for (const s of this.sets) {
      if (!s.n) continue;
      gl.bindVertexArray(s.vao); gl.drawArraysInstanced(gl.TRIANGLES, 0, s.verts, s.n); this.drawCalls++; this.boxes += s.n;
    }
    // Signs.
    if (this.signN) {
      gl.useProgram(this.sign); const g = this.ug;
      gl.uniformMatrix4fv(g.uVP, false, f.vp); gl.uniform3fv(g.uCam, f.cam); gl.uniform3fv(g.uFog, L.fog);
      gl.uniform3f(g.uLight, L.ambSky[0] + L.sunCol[0] * 0.45, L.ambSky[1] + L.sunCol[1] * 0.45, L.ambSky[2] + L.sunCol[2] * 0.45);
      gl.uniform4f(g.uFx, f.time, L.fogNear, L.fogFar, L.night);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.signTex); gl.uniform1i(g.uTex, 0);
      gl.bindVertexArray(this.signVao); gl.drawArrays(gl.TRIANGLES, 0, this.signN); this.drawCalls++;
    }
    gl.bindVertexArray(null);
  }
}
