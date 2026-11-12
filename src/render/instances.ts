// A growable list of instances: a 4x4 matrix, a colour, a material id and a geometry id each.
import { M4 } from './mat';
import { MODEL_NAMES, ModelName } from './models.gen';

export const STRIDE = 21;
/** Geometry ids: unit box, unit wedge (top rises toward +x), unit-diameter blob, unit cylinder (axis y). */
export const G = { BOX: 0, WEDGE: 1, BLOB: 2, CYL: 3, SPHERE: 4, CAPS: 5 } as const;
/** Geometry ids of the imported models follow the primitives. CAPS is a capsule 1 tall and 1 wide at scale 1 (radius 0.25, so scale x and z by twice the wanted radius ratio). */
export const NPRIM = 6;
export const GM = (name: ModelName): number => NPRIM + MODEL_NAMES.indexOf(name);

export class Instances {
  data: Float32Array; n = 0;
  constructor(cap: number) { this.data = new Float32Array(cap * STRIDE); }
  clear() { this.n = 0; }
  private grow() { const d = new Float32Array(this.data.length * 2); d.set(this.data); this.data = d; }
  push(m: M4, r: number, g: number, b: number, mat = 1, geo = 0) {
    if ((this.n + 1) * STRIDE > this.data.length) this.grow();
    const o = this.n * STRIDE; this.data.set(m, o);
    this.data[o + 16] = r; this.data[o + 17] = g; this.data[o + 18] = b; this.data[o + 19] = mat; this.data[o + 20] = geo; this.n++;
  }
  /** Axis-aligned shape without building a matrix. */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, r: number, g: number, b: number, mat = 1, geo = 0) {
    if ((this.n + 1) * STRIDE > this.data.length) this.grow();
    const o = this.n * STRIDE, a = this.data;
    a[o] = sx; a[o + 1] = 0; a[o + 2] = 0; a[o + 3] = 0; a[o + 4] = 0; a[o + 5] = sy; a[o + 6] = 0; a[o + 7] = 0;
    a[o + 8] = 0; a[o + 9] = 0; a[o + 10] = sz; a[o + 11] = 0; a[o + 12] = cx; a[o + 13] = cy; a[o + 14] = cz; a[o + 15] = 1;
    a[o + 16] = r; a[o + 17] = g; a[o + 18] = b; a[o + 19] = mat; a[o + 20] = geo; this.n++;
  }
}
