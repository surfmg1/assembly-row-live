// Assembly Row, laid out by hand from general knowledge of the neighborhood (not from GIS data;
// see PLAN.md). Stylized and compressed: recognizable over realistic. +x east, +z south.
// Real names live in the brand layer below so a public build can switch to parody names.
import { World, Solid, Rail, PropSeed, Spawn, Decor, NpcSeed, Zone, edgeRails } from './world';

export const BRAND = {
  real: { lego: 'LEGO Discovery Center', cinema: 'AMC Assembly Row 12', hotel: 'The Row Hotel', market: 'Assembly Square Marketplace', casino: 'Encore', line: 'Orange Line' },
  parody: { lego: 'Brick Discovery Hall', cinema: 'Row 12 Cinemas', hotel: 'The Aisle Hotel', market: 'Marketplace', casino: 'Encore-ish', line: 'Tangerine Line' },
};

const ASPHALT = [0.34, 0.36, 0.39], PAVE = [0.76, 0.76, 0.78], GRASS = [0.47, 0.62, 0.36], WATER = [0.27, 0.47, 0.62];
const BRICK = [0.66, 0.36, 0.28], TAN = [0.80, 0.68, 0.52], PANEL = [0.66, 0.69, 0.74], GLASS = [0.50, 0.62, 0.74], WHITE = [0.90, 0.90, 0.88];
const CHAR = [0.27, 0.29, 0.33], STEEL = [0.58, 0.61, 0.66], RUST = [0.60, 0.33, 0.20], ORANGE = [0.93, 0.545, 0.0], WOOD = [0.62, 0.48, 0.33];
const RED = [0.80, 0.20, 0.18], BLUE = [0.20, 0.42, 0.78], YELLOW = [0.96, 0.80, 0.18], GREEN = [0.25, 0.62, 0.30], PURPLE = [0.52, 0.32, 0.70];
const HAZE = [0.62, 0.68, 0.76], BRONZE = [0.62, 0.45, 0.30], LINE = [0.93, 0.93, 0.90];

export function buildCity(): World {
  const solids: Solid[] = [], rails: Rail[] = [], props: PropSeed[] = [], decor: Decor[] = [], npcs: NpcSeed[] = [], zones: Zone[] = [];
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: number[], mat = 1, o: Partial<Solid> = {}) => {
    const s: Solid = { x0, x1, y0, y1, z0, z1, surf: 'concrete', tint: 0, color, mat, ...o }; solids.push(s); return s;
  };
  const ramp = (dir: 0 | 1 | 2 | 3, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color = PANEL) =>
    box(x0, x1, y0, y1, z0, z1, color, 0, { ramp: dir });
  const dec = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: number[], mat = 1) =>
    decor.push({ x0, x1, y0, y1, z0, z1, color, mat });
  const bld = (x0: number, x1: number, z0: number, z1: number, h: number, color: number[], y0 = 0.1) => box(x0, x1, y0, h, z0, z1, color, 3);
  const zone = (name: string, x0: number, x1: number, z0: number, z1: number) => zones.push({ name, x0, x1, z0, z1 });

  const W = -0.6; // river surface
  // --- Land and water -------------------------------------------------------------------
  dec(-700, 500, W - 0.1, W, -520, 420, WATER, 2);
  box(-250, 205, -4, 0, -176, 262, ASPHALT, 1);
  box(-522, -250, -4, 0, -176, -120, GRASS, 1, { surf: 'grass' });
  box(-522, 302, -4, 0, -342, -300, GRASS, 1, { surf: 'grass' });
  // Map borders: invisible walls, plus the things that visually explain them.
  const B = 40;
  box(-526, -520, -4, B, -344, -118, CHAR, 1, { hide: true }); box(300, 304, -4, B, -344, 264, CHAR, 1, { hide: true });
  box(-526, 304, -4, B, -346, -340, CHAR, 1, { hide: true }); box(-252, 304, -4, B, 260, 264, CHAR, 1, { hide: true });
  box(-522, -250, 0, 5, -122, -120, [0.30, 0.45, 0.28], 1); box(-252, -250, 0, B, -120, 264, CHAR, 1, { hide: true });
  dec(-256, -250, 0, 3.5, -120, 262, [0.40, 0.48, 0.38]);

  // --- I-93 viaduct along the west edge, crossing the river ------------------------------
  box(-250, -226, 8, 9.5, -342, 262, PANEL, 0);
  dec(-250.4, -249.6, 9.5, 10.4, -342, 262, WHITE); dec(-226.4, -225.6, 9.5, 10.4, -342, 262, WHITE);
  for (let z = -320; z <= 250; z += 45) box(-239.5, -236.5, -4, 8, z - 1.5, z + 1.5, PANEL, 0);

  // --- Street grid. Roads are the bare land; each block is a low paved podium (the curb). --
  const rows: [number, number][] = [[-118, -66], [-54, -6], [6, 64], [76, 152]];
  for (const [z0, z1] of rows) { box(-80, -5, 0, 0.1, z0, z1, PAVE, 0); box(5, 78, 0, 0.1, z0, z1, PAVE, 0); }
  // lane lines down Assembly Row and Grand Union Boulevard
  for (let z = -128; z < 160; z += 8) { dec(-0.1, 0.1, 0, 0.015, z, z + 3.5, LINE); dec(-90.1, -89.9, 0, 0.015, z, z + 3.5, LINE); }
  for (const z of [-60, 0, 70, 158, -124]) for (let x = -76; x < 76; x += 8) dec(x, x + 3.5, 0, 0.015, z - 0.1, z + 0.1, LINE);
  for (const z of [-66, -54, -6, 6, 64, 76]) for (let i = 0; i < 6; i++) dec(-4.2 + i * 1.5, -3.6 + i * 1.5, 0, 0.016, z - 2.2, z + 2.2, LINE);

  // Row 1 (north): a residential tower, the brick-toy attraction, and a second tower over shops.
  bld(-74, -44, -112, -72, 62, GLASS); bld(-38, -11, -112, -72, 13, YELLOW);
  dec(-38.2, -10.8, 11, 13.2, -112.2, -71.8, RED); dec(-10.8, -10.6, 4.4, 5.6, -100, -84, BLUE); dec(-30, -19, 13, 14.6, -112.3, -112, GREEN);
  bld(11, 72, -112, -72, 8, BRICK); box(30, 72, 8, 56, -112, -72, PANEL, 3);
  // The rainbow giraffe out front. Every part is solid, so it is climbable.
  const gz0 = -116.8, gz1 = -115.2;
  box(-10.7, -9.5, 0.1, 1.3, -116.6, -115.4, RED, 1);
  box(-9.4, -8.9, 0.1, 2.2, gz0, gz0 + 0.5, RED, 1); box(-9.4, -8.9, 0.1, 2.2, gz1 - 0.5, gz1, ORANGE, 1);
  box(-7.1, -6.6, 0.1, 2.2, gz0, gz0 + 0.5, GREEN, 1); box(-7.1, -6.6, 0.1, 2.2, gz1 - 0.5, gz1, BLUE, 1);
  box(-9.4, -6.6, 2.2, 3.6, gz0, gz1, YELLOW, 1);
  [RED, ORANGE, GREEN, BLUE].forEach((c, i) => box(-7.4, -6.6, 3.6 + i * 0.5, 4.1 + i * 0.5, -116.4, -115.6, c, 1));
  box(-7.4, -5.4, 5.2, 6.0, -116.5, -115.5, PURPLE, 1);

  // Row 2: outlet shops and the cinema, with a scaffold ramp up to the cinema roof.
  bld(-74, -11, -49, -11, 14, BRICK); bld(11, 72, -49, -11, 16, CHAR);
  box(5.5, 11, 4.6, 6.2, -37, -23, RED, 1); dec(10.6, 11.2, 6.2, 9, -34, -26, [0.95, 0.85, 0.3]);
  ramp(0, 20, 50, 0.1, 8, -11, -8.6, STEEL); box(50, 54, 0.1, 8, -11, -6.2, STEEL, 0, { surf: 'steel' }); ramp(1, 20, 50, 8, 16, -8.6, -6.2, STEEL);
  for (const x of [22, 32, 42]) dec(x, x + 0.2, 0.1, 8 + (50 - x) / 30 * 8, -6.5, -6.3, STEEL);
  // A steel beam across Artisan Way: the rooftop route from the cinema to the hotel block.
  box(40, 40.9, 15.6, 16, -11, 11, ORANGE, 1, { surf: 'steel' });

  // Row 3: offices, and the hotel block behind an open plaza (skate spot, and a no-skate zone).
  bld(-74, -11, 11, 59, 38, WHITE); bld(32, 72, 11, 59, 16, TAN); box(42, 72, 16, 34, 20, 55, GLASS, 3);
  box(12, 20, 0.1, 0.55, 19.5, 20.5, PANEL, 0, { grind: true }); box(12, 20, 0.1, 0.55, 29.5, 30.5, PANEL, 0, { grind: true });
  box(12, 26, 0.1, 1.0, 42, 57, PAVE, 0); box(14, 24, 0.1, 0.7, 41.2, 42, PAVE, 0); box(14, 24, 0.1, 0.4, 40.4, 41.2, PAVE, 0);
  rails.push({ ax: 19, ay: 1.75, az: 42.4, bx: 19, by: 0.75, bz: 39.6 });
  box(14, 18, 1.0, 1.45, 50, 50.8, WOOD, 1, { grind: true, surf: 'wood' }); box(20, 24, 1.0, 1.45, 50, 50.8, WOOD, 1, { grind: true, surf: 'wood' });
  rails.push({ ax: 7, ay: 0.7, az: 8, bx: 7, by: 0.7, bz: 18 });

  // Row 4: a glass office block, and the parking garage with its switchback ramp to the roof.
  bld(-74, -11, 81, 147, 50, GLASS); box(14, 72, 0.1, 10.5, 82, 147, [0.58, 0.60, 0.63], 3);
  ramp(3, 7, 13, 0.1, 5.3, 86, 146); box(7, 13, 0.1, 5.3, 78, 86, PANEL, 0); ramp(0, 13, 53, 5.3, 10.5, 78, 82);
  dec(13.9, 14.1, 10.5, 11.4, 82, 147, WHITE); dec(71.9, 72.1, 10.5, 11.4, 82, 147, WHITE); dec(14, 72, 10.5, 11.4, 146.9, 147.1, WHITE);
  for (let i = 0; i < 5; i++) props.push({ x: 24 + i * 9, y: 10.5, z: 100 + (i % 2) * 20, kind: 'cone' });
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3 - r; c++) props.push({ x: 60, y: 10.5 + r * 0.5, z: 120 + c * 0.55 + r * 0.27, kind: 'crate' });
  // Crates stacked at the foot of the garage ramp, because of course.
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4 - r; c++) props.push({ x: 8.6 + c * 0.55 + r * 0.27, y: 0.1 + r * 0.5, z: 150.5, kind: 'crate' });

  // South of Revolution Drive: a big-box store and its lot.
  bld(-78, 76, 196, 250, 11, TAN, 0); dec(-78.2, 76.2, 8.5, 11.2, 195.6, 196, ORANGE);
  for (let i = 0; i < 6; i++) props.push({ x: -40 + i * 14, y: 0, z: 178, kind: 'cone' });

  // --- Marketplace strip and the big lot (west of Grand Union Boulevard) ------------------
  bld(-216, -182, -110, 150, 9, TAN, 0);
  [RED, [0.72, 0.16, 0.2], BLUE, GREEN, RED, [0.2, 0.25, 0.5]].forEach((c, i) => dec(-182, -181.6, 6.2, 8.4, -106 + i * 43, -106 + i * 43 + 36, c));
  dec(-182, -178, 4.4, 4.7, -110, 150, WHITE);
  for (let x = -172; x <= -108; x += 16) for (let z = -100; z < 144; z += 5.4) dec(x - 2.6, x + 2.6, 0, 0.012, z - 0.06, z + 0.06, LINE);
  for (let x = -164; x <= -116; x += 24) for (let z = -90; z <= 130; z += 55) { dec(x - 0.12, x + 0.12, 0, 9, z - 0.12, z + 0.12, STEEL); dec(x - 1.2, x + 1.2, 8.9, 9.1, z - 0.2, z + 0.2, STEEL); }
  ramp(3, -146, -138, 0, 1.1, 60, 64.5, ORANGE); ramp(3, -146, -138, 0, 1.4, -14, -9, ORANGE);
  for (let i = 0; i < 8; i++) props.push({ x: -142 + (i % 2 ? 5 : -5), y: 0, z: 100 - i * 11, kind: 'cone' });
  for (let r = 0; r < 4; r++) for (let c = 0; c < 5 - r; c++) props.push({ x: -143.4 + c * 0.55 + r * 0.27, y: r * 0.5, z: 30, kind: 'crate' });
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4 - r; c++) props.push({ x: -143 + c * 0.55 + r * 0.27, y: r * 0.5, z: -60, kind: 'crate' });

  // --- Orange Line: two tracks, an island platform, a footbridge at the end of Foley Street -
  dec(86, 110, 0, 0.03, -176, 262, [0.26, 0.25, 0.25]); box(86, 110, -1.2, 0, -300, -176, PANEL, 0);
  for (const x of [91.2, 92.6, 103.4, 104.8]) dec(x - 0.06, x + 0.06, 0.03, 0.16, -300, 262, STEEL);
  for (const x of [89.8, 106.2]) dec(x - 0.12, x + 0.12, 0.03, 0.22, -300, 262, [0.95, 0.78, 0.1]);
  box(85, 85.3, 0, 1.6, -176, 262, STEEL, 1, { surf: 'steel' }); box(110.7, 111, 0, 1.6, -176, 262, STEEL, 1, { surf: 'steel' });
  box(94, 102, 0, 1.1, 74, 150, PAVE, 0);
  dec(94, 94.5, 1.1, 1.115, 92, 150, [0.95, 0.78, 0.1]); dec(101.5, 102, 1.1, 1.115, 92, 150, [0.95, 0.78, 0.1]);
  dec(94, 102, 4.7, 4.9, 96, 148, WHITE); dec(93.9, 102.1, 4.9, 5.05, 95.9, 148.1, ORANGE); for (let z = 98; z <= 146; z += 12) dec(97.85, 98.15, 1.1, 4.7, z - 0.15, z + 0.15, STEEL);
  ramp(0, 58, 78, 0, 5.5, 66, 74); box(78, 116, 5.1, 5.5, 66, 74, PANEL, 0, { surf: 'steel' }); ramp(1, 116, 136, 0, 5.5, 66, 74);
  ramp(3, 95, 101, 1.1, 5.5, 74, 92);
  dec(78, 116, 5.5, 6.6, 65.9, 66.05, ORANGE); dec(78, 116, 5.5, 6.6, 73.95, 74.1, ORANGE);
  for (const x of [80, 114]) dec(x - 0.3, x + 0.3, 0, 5.1, 69.7, 70.3, STEEL);

  // --- Baxter Riverfront Park, with the salvaged Ford plant trusses ------------------------
  dec(-80, 84, 0, 0.02, -166, -131, GRASS); dec(-80, 84, 0, 0.025, -174, -168, PAVE, 0); dec(-2, 2, 0, 0.025, -168, -131, PAVE, 0);
  for (const x of [-30, -18, -6]) {
    box(x - 0.3, x + 0.3, 0, 5.6, -152.3, -151.7, RUST, 1, { surf: 'steel' }); box(x - 0.3, x + 0.3, 0, 5.6, -140.3, -139.7, RUST, 1, { surf: 'steel' });
    box(x - 0.3, x + 0.3, 5.6, 6, -152.3, -139.7, RUST, 1, { surf: 'steel' });
  }
  box(-30.3, -5.7, 5.6, 6, -152.3, -151.7, RUST, 1, { surf: 'steel' }); box(-30.3, -5.7, 5.6, 6, -140.3, -139.7, RUST, 1, { surf: 'steel' });
  box(-44, -30.3, 0, 5.6, -140.4, -139.6, RUST, 1, { ramp: 0, surf: 'steel' });
  box(-5.7, 6, 0, 5.6, -152.4, -151.6, RUST, 1, { ramp: 1, surf: 'steel' });
  for (const x of [20, 34, 48, 62]) { box(x, x + 3, 0, 0.5, -160, -159.2, WOOD, 1, { grind: true, surf: 'wood' }); }
  for (const [x, z] of [[-60, -150], [-52, -142], [30, -146], [44, -138], [66, -150], [-70, -138]]) { dec(x - 0.25, x + 0.25, 0, 3, z - 0.25, z + 0.25, WOOD); dec(x - 2, x + 2, 3, 6.5, z - 2, z + 2, [0.36, 0.56, 0.30]); }
  box(-52, -46, -1.4, -0.3, -192, -176, WOOD, 1, { surf: 'wood' });
  for (let i = 0; i < 4; i++) dec(-45.6 + i * 1.1, -44.8 + i * 1.1, 0, 0.35, -173.5, -169.5, [RED, YELLOW, BLUE, GREEN][i]);

  // --- Draw Seven Park (east of the tracks) and the Amelia Earhart Dam --------------------
  dec(112, 205, 0, 0.02, -176, 262, GRASS); dec(140, 144, 0, 0.025, -176, 262, PAVE, 0);
  for (const [x, z] of [[125, -100], [180, -60], [160, 20], [190, 120], [125, 180], [175, 210], [130, -20]]) { dec(x - 0.3, x + 0.3, 0, 3.4, z - 0.3, z + 0.3, WOOD); dec(x - 2.4, x + 2.4, 3.4, 7.4, z - 2.4, z + 2.4, [0.33, 0.54, 0.29]); }
  box(160, 172, -4, 0.3, -300, -176, PANEL, 0);
  for (const z of [-270, -238, -206]) dec(162, 170, 0.3, 6, z - 3, z + 3, [0.72, 0.73, 0.75], 3);
  dec(160, 160.15, 0.3, 1.4, -300, -176, STEEL); dec(171.85, 172, 0.3, 1.4, -300, -176, STEEL);

  // --- Boathouse, upriver past I-93 (the real one is about a mile off; this is compressed) --
  box(-472, -442, 0, 6.5, -150, -130, [0.30, 0.45, 0.62], 3); dec(-474, -440, 6.5, 7.6, -152, -128, WOOD);
  box(-452, -446, -1.4, -0.3, -192, -176, WOOD, 1, { surf: 'wood' });
  for (let i = 0; i < 5; i++) dec(-438 + i * 1.1, -437.2 + i * 1.1, 0, 0.35, -172, -168, [YELLOW, RED, BLUE, GREEN, ORANGE][i]);
  dec(-520, -250, 0, 0.025, -174, -169, PAVE, 0);
  for (let x = -500; x < -260; x += 38) { dec(x - 0.3, x + 0.3, 0, 3.2, -128.3, -127.7, WOOD); dec(x - 2.5, x + 2.5, 3.2, 7.5, -130.5, -125.5, [0.34, 0.55, 0.30]); }

  // --- Backdrop ring: the casino across the river, the Boston skyline, the Zakim ----------
  box(40, 120, 0, 96, -338, -312, BRONZE, 3);
  const sky: number[][] = [[-160, 430, 26, 150], [-120, 470, 30, 205], [-70, 450, 34, 240], [-20, 480, 28, 180], [30, 440, 30, 165], [80, 500, 36, 225], [130, 460, 26, 140], [180, 520, 30, 190], [-210, 520, 30, 120]];
  for (const [x, z, wd, h] of sky) dec(x - wd / 2, x + wd / 2, 0, h, z, z + wd, HAZE, 3);
  dec(-330, -326, 0, 82, 400, 404, WHITE); dec(-290, -286, 0, 82, 400, 404, WHITE); dec(-350, -266, 16, 18, 398, 406, WHITE);

  // --- Rails from ledges, spawns, docks, trains, hazards, people ---------------------------
  edgeRails(solids, rails);
  const spawns: Spawn[] = [
    { name: 'Station', x: 76, y: 4.95, z: 70, yaw: Math.PI, mode: 'skate' },
    { name: 'Plaza', x: 7, y: 0, z: 0, yaw: Math.PI / 2, mode: 'skate' },
    { name: 'Garage', x: 51, y: 10.24, z: 80, yaw: Math.PI, mode: 'cart' },
    { name: 'Lot', x: -142, y: 0, z: 128, yaw: -Math.PI / 2, mode: 'cart' },
    { name: 'Dock', x: -49, y: -0.3, z: -180, yaw: -Math.PI / 2, mode: 'foot' },
  ];
  const docks = [
    { name: 'Baxter dock', lx: -49, ly: -0.3, lz: -184, wx: -42, wz: -187, yaw: -Math.PI / 2 },
    { name: 'Boathouse dock', lx: -449, ly: -0.3, lz: -184, wx: -442, wz: -187, yaw: 0 },
  ];
  const trains = [
    { x0: 90.4, x1: 93.4, from: -330, stop: 120, to: 420, offset: 0 },
    { x0: 102.6, x1: 105.6, from: 420, stop: 120, to: -330, offset: 40 },
  ];
  const hazards = [{ x0: 89.5, x1: 90.1, z0: -176, z1: 262 }, { x0: 105.9, x1: 106.5, z0: -176, z1: 262 }];

  const lines: number[][] = [[-7.5, -116, -7.5, 150], [7.5, 150, 7.5, -116], [-78.5, -110, -78.5, 148], [-70, -3, 70, -3], [70, 3.5, -70, 3.5], [-60, -171, 78, -171], [-20, 67, 55, 67], [-8.5, 20, -8.5, -100]];
  for (let i = 0; i < 44; i++) { const l = lines[i % lines.length]; npcs.push({ kind: 'ped', ax: l[0], az: l[1], bx: l[2], bz: l[3], t: (i * 0.137) % 1, speed: 1.15 + (i % 5) * 0.12, hue: i }); }
  for (let i = 0; i < 6; i++) npcs.push({ kind: 'goose', ax: 22 + i * 3.2, az: -164 + (i % 2) * 2.4, bx: 0, bz: 0, t: i * 0.3, speed: 5.1, hue: i });
  npcs.push({ kind: 'guard', ax: 28, az: 36, bx: 0, bz: 0, t: 0, speed: 7.1, hue: 0 });

  zone('Assembly station', 84, 112, 60, 152); zone('Orange Line tracks', 84, 112, -300, 262);
  zone('Baxter Riverfront Park', -80, 84, -176, -130); zone('Draw Seven Park', 112, 205, -176, 262); zone('Amelia Earhart Dam', 158, 174, -300, -176);
  zone(BRAND.real.lego, -40, -5, -120, -70); zone(BRAND.real.cinema, 5, 78, -54, -6); zone('Hotel plaza', 5, 32, 6, 64); zone(BRAND.real.hotel, 32, 78, 6, 64);
  zone('Parking garage', 5, 78, 76, 152); zone('Assembly Row', -6, 6, -130, 164); zone('Grand Union Boulevard', -100, -80, -130, 164);
  zone('Marketplace lot', -182, -100, -112, 152); zone(BRAND.real.market, -218, -182, -112, 152); zone('Under I-93', -252, -224, -342, 262);
  zone('Blessing of the Bay Boathouse', -480, -430, -200, -120); zone('Shore Drive riverbank', -522, -250, -176, -120);
  zone('Everett shore', -522, 302, -342, -300); zone('Mystic River', -522, 302, -300, -176); zone('Artisan Way', -80, 78, -6, 6); zone('Foley Street', -80, 84, 64, 76);
  zone('Canal Street', -80, 78, -66, -54); zone('Great River Road', -80, 84, -130, -118); zone('Revolution Drive', -80, 84, 152, 164);
  zone('Assembly Row shops', -80, 78, -118, 152); zone('Assembly Square', -250, 205, -176, 262);

  const rivets = [
    [-6.4, 6.9, -116], [-18, 6.9, -146], [30, 17, -30], [40.45, 17, 0], [60, 17, 50], [60, 11.5, 135], [98, 2.1, 147], [97, 6.5, 70], [170, 1, 60],
    [166, 1.3, -240], [80, 1, -306], [-49, 0.6, -190], [-457, 1, -160], [-238, 1, -172], [-142, 3.4, -18], [0, 1, 180], [19, 2, 54], [-232, 0.3, -240],
    [130, 1, -150], [-142, 1, 31.5],
  ];
  return {
    solids, rails, props, spawns, minX: -520, maxX: 300, minZ: -340, maxZ: 260, kind: 'city', baseY: W,
    decor, docks, trains, zones, hazards, npcs, rivets, trial: { sx: 76, sz: 70, fx: -449, fz: -182, r: 11 },
  };
}
