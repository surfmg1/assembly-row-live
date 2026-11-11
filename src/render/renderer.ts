// Instanced box renderer for the grey lab. Three draw calls per frame.
// Dependency-free WebGL2 for Milestone 1 (see docs/adr/0002); moves to Three.js WebGPU at Milestone 2.
import { M4 } from './mat';

const VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec4 aM0; layout(location=2) in vec4 aM1; layout(location=3) in vec4 aM2; layout(location=4) in vec4 aM3;
layout(location=5) in vec4 aCol;
uniform mat4 uVP;
out vec3 vW; out vec4 vC;
void main(){ vec4 w = mat4(aM0,aM1,aM2,aM3) * vec4(aPos,1.0); vW = w.xyz; vC = aCol; gl_Position = uVP * w; }`;

const FS = `#version 300 es
precision highp float;
in vec3 vW; in vec4 vC;
uniform vec3 uCam; uniform vec3 uShadow; uniform vec3 uFog; uniform vec3 uFx;
out vec4 o;
void main(){
  vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
  if (dot(n, uCam - vW) < 0.0) n = -n;
  float d = max(dot(n, normalize(vec3(0.45, 0.8, 0.35))), 0.0);
  vec3 amb = mix(vec3(0.40,0.42,0.48), vec3(0.64,0.655,0.69), n.y*0.5+0.5);
  vec3 col = vC.rgb * (amb + d*0.44);
  float dist = length(uCam - vW);
  float m = vC.a;
  if (m > 2.5) {
    if (abs(n.y) < 0.5) {
      float u = abs(n.x) > 0.5 ? vW.z : vW.x; float v = vW.y;
      vec3 wall = col;
      vec3 glass = (vec3(0.15, 0.21, 0.29) + vec3(0.14, 0.18, 0.22) * clamp(v / 50.0, 0.0, 1.0)) * (0.75 + d * 0.5);
      if (v < 4.3) {
        float bay = fract(u / 4.0);
        col = (bay > 0.07 && bay < 0.93 && v > 0.55 && v < 3.5) ? glass * 1.2 + vec3(0.13, 0.10, 0.04) : wall * 0.78;
      } else {
        float bu = fract(u / 3.2), bv = fract((v - 4.3) / 3.5);
        vec3 pat = (bu > 0.2 && bu < 0.8 && bv > 0.22 && bv < 0.78) ? glass : wall;
        col = mix(pat, mix(wall, glass, 0.33), smoothstep(110.0, 300.0, dist));
      }
    } else col *= 0.82;
  } else if (m > 1.5) {
    float wv = sin(vW.x * 0.35 + uFx.x * 0.9) * sin(vW.z * 0.27 - uFx.x * 0.7);
    float sp = pow(max(0.0, sin(vW.x * 1.3 + uFx.x * 1.7) * sin(vW.z * 1.1 - uFx.x * 1.3)), 10.0);
    col = vC.rgb * (0.86 + 0.08 * wv) + sp * 0.22 * clamp(1.0 - dist / 160.0, 0.0, 1.0);
  }
  if (m < 0.5) {
    vec2 p = abs(n.y) > 0.5 ? vW.xz : (abs(n.x) > 0.5 ? vW.zy : vW.xy);
    vec2 g1 = abs(fract(p - 0.5) - 0.5) / max(fwidth(p), vec2(1e-5));
    float l1 = 1.0 - min(min(g1.x, g1.y), 1.0);
    vec2 q = p / 5.0;
    vec2 g5 = abs(fract(q - 0.5) - 0.5) / max(fwidth(q), vec2(1e-5));
    float l5 = 1.0 - min(min(g5.x, g5.y) * 0.6, 1.0);
    col *= 1.0 - 0.11 * l1 * clamp(1.0 - dist / 55.0, 0.0, 1.0) - 0.15 * l5;
  }
  float below = uShadow.y - vW.y;
  if (below > -0.15 && n.y > 0.3) {
    float r = 0.5 + below * 0.1;
    float s = 1.0 - smoothstep(r * 0.25, r, length(vW.xz - uShadow.xz));
    col *= 1.0 - s * 0.5 / (1.0 + below * 0.3);
  }
  col = mix(col, uFog, smoothstep(uFx.y, uFx.z, dist) * 0.92);
  o = vec4(col, 1.0);
}`;

const STRIDE = 20;

export class Instances {
  data: Float32Array; n = 0;
  constructor(cap: number) { this.data = new Float32Array(cap * STRIDE); }
  clear() { this.n = 0; }
  push(m: M4, r: number, g: number, b: number, plain = 1) {
    if ((this.n + 1) * STRIDE > this.data.length) { const d = new Float32Array(this.data.length * 2); d.set(this.data); this.data = d; }
    const o = this.n * STRIDE; this.data.set(m, o);
    this.data[o + 16] = r; this.data[o + 17] = g; this.data[o + 18] = b; this.data[o + 19] = plain; this.n++;
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

export class Renderer {
  gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private sets: { vao: WebGLVertexArrayObject; buf: WebGLBuffer; verts: number; n: number }[] = [];
  drawCalls = 0;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    const sh = (t: number, src: string) => {
      const s = gl.createShader(t)!; gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
      return s;
    };
    const p = gl.createProgram()!; gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
    this.prog = p;
    for (const n of ['uVP', 'uCam', 'uShadow', 'uFog', 'uFx']) this.u[n] = gl.getUniformLocation(p, n);
    this.sets = [this.makeSet(cubeVerts()), this.makeSet(wedgeVerts()), this.makeSet(cubeVerts())];
    gl.enable(gl.DEPTH_TEST);
  }

  private makeSet(verts: Float32Array) {
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

  draw(vp: M4, cam: number[], shadow: number[], fog: number[], dyn: Instances, time = 0, fogNear = 40, fogFar = 120) {
    const gl = this.gl;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(fog[0], fog[1], fog[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.u.uVP, false, vp);
    gl.uniform3f(this.u.uCam, cam[0], cam[1], cam[2]);
    gl.uniform3f(this.u.uShadow, shadow[0], shadow[1], shadow[2]);
    gl.uniform3f(this.u.uFog, fog[0], fog[1], fog[2]);
    gl.uniform3f(this.u.uFx, time, fogNear, fogFar);
    this.upload(2, dyn, gl.DYNAMIC_DRAW);
    this.drawCalls = 0;
    for (const s of this.sets) {
      if (!s.n) continue;
      gl.bindVertexArray(s.vao); gl.drawArraysInstanced(gl.TRIANGLES, 0, s.verts, s.n); this.drawCalls++;
    }
    gl.bindVertexArray(null);
  }
}
