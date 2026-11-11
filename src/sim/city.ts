// Assembly Row, laid out by hand from the owner's reference photos and maps (docs/reference-notes.md).
// Stylized and somewhat compressed. +x east, +z south; the Mystic is north, the Orange Line east,
// the Marketplace lot west. The world is rebuilt whenever the season or weather changes.
import {
  World, Solid, Rail, PropSeed, Spawn, Decor, NpcSeed, Zone, Env, SignSeed, TreeSeed, ParkedSeed, CarSeed, FieldSeed, RideSeed,
  edgeRails, buildLoop, pathAt, pathNearest, makeEnv, PathPos,
} from './world';

/** Render material ids, shared with the shader. */
export const M = { PAVE: 0, PLAIN: 1, WATER: 2, FACADE: 3, ASPHALT: 4, GRASS: 5, LEAF: 6, EMIS: 7, BRICK: 8, GLASS: 9, SNOWY: 11, WINDOW: 12, PAINT: 13, METAL: 14, PARTICLE: 15, RAIN: 16 };

const ASPHALT = [0.30, 0.31, 0.34], PAVE = [0.74, 0.73, 0.72], BRICKPAVE = [0.62, 0.42, 0.36], SAND = [0.84, 0.76, 0.58];
const BRICK = [0.62, 0.30, 0.24], ORANGEBRICK = [0.80, 0.50, 0.30], TAN = [0.80, 0.70, 0.54], CREAM = [0.90, 0.88, 0.82], PANEL = [0.66, 0.69, 0.74];
const GLASS = [0.70, 0.78, 0.86], WHITE = [0.93, 0.93, 0.91], CHAR = [0.24, 0.26, 0.30], STEEL = [0.56, 0.59, 0.64], RUST = [0.52, 0.27, 0.16];
const ORANGE = [0.93, 0.545, 0.0], WOOD = [0.58, 0.45, 0.31], BLACK = [0.07, 0.07, 0.08], SNOW = [0.93, 0.95, 0.98];
const RED = [0.80, 0.16, 0.14], BLUE = [0.18, 0.40, 0.78], YELLOW = [0.96, 0.80, 0.16], GREEN = [0.22, 0.60, 0.28], PURPLE = [0.50, 0.30, 0.70];
const HAZE = [0.60, 0.66, 0.74], BRONZE = [0.56, 0.36, 0.22], LINE = [0.92, 0.92, 0.88], BIKE = [0.25, 0.62, 0.36], XWALK = [0.56, 0.31, 0.26];
const COURT = [0.20, 0.45, 0.78], SOLAR = [0.10, 0.14, 0.30], TRUNK = [0.30, 0.22, 0.17];

const hash = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

export function buildCity(env: Env = makeEnv('summer', 'sunny')): World {
  const solids: Solid[] = [], rails: Rail[] = [], props: PropSeed[] = [], decor: Decor[] = [], npcs: NpcSeed[] = [], zones: Zone[] = [];
  const signs: SignSeed[] = [], trees: TreeSeed[] = [], lamps: number[][] = [], parked: ParkedSeed[] = [];
  const snow = env.snow, se = env.season, warm = !snow;
  const GRASS = se === 'summer' ? [0.36, 0.56, 0.26] : se === 'spring' ? [0.40, 0.64, 0.30] : se === 'fall' ? [0.50, 0.55, 0.28] : [0.46, 0.50, 0.34];
  const WATER = se === 'winter' ? [0.15, 0.24, 0.33] : env.weather === 'rainy' ? [0.20, 0.31, 0.38] : [0.17, 0.37, 0.52];

  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: number[], mat = M.SNOWY, o: Partial<Solid> = {}) => {
    const s: Solid = { x0, x1, y0, y1, z0, z1, surf: 'concrete', tint: 0, color, mat, ...o }; solids.push(s); return s;
  };
  const ramp = (dir: 0 | 1 | 2 | 3, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color = PANEL, o: Partial<Solid> = {}) =>
    box(x0, x1, y0, y1, z0, z1, color, M.PAVE, { ramp: dir, ...o });
  const dec = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: number[], mat = M.SNOWY) =>
    decor.push({ x0, x1, y0, y1, z0, z1, color, mat });
  const bld = (x0: number, x1: number, z0: number, z1: number, h: number, color: number[], mat = M.FACADE, y0 = 0.1) => box(x0, x1, y0, h, z0, z1, color, mat);
  const pod = (x0: number, x1: number, z0: number, z1: number) => box(x0, x1, 0, 0.1, z0, z1, PAVE, M.PAVE);
  const zone = (name: string, x0: number, x1: number, z0: number, z1: number) => zones.push({ name, x0, x1, z0, z1 });
  const sign = (text: string, x: number, y: number, z: number, face: 0 | 1 | 2 | 3, h: number, color = '#ffffff', bg?: string, glow = false) =>
    signs.push({ text, x, y, z, face, h, color, bg, glow });
  const tree = (x: number, z: number, h = 7, y = 0.1, lights = false) => {
    trees.push({ x, z, y, h, lights });
    box(x - 0.2, x + 0.2, y, y + h * 0.42, z - 0.2, z + 0.2, TRUNK, M.PLAIN, { surf: 'wood', hide: true });
  };
  const lamp = (x: number, z: number, y = 0.1) => lamps.push([x, y, z]);
  const park = (x: number, z: number, yaw: number, hue: number) => {
    parked.push({ x, z, yaw, hue });
    const lx = Math.abs(Math.cos(yaw)) > 0.5 ? 2.15 : 0.95, lz = Math.abs(Math.cos(yaw)) > 0.5 ? 0.95 : 2.15;
    box(x - lx, x + lx, 0, 1.3, z - lz, z + lz, CHAR, M.PLAIN, { hide: true });
  };

  const W = -0.6; // river surface
  // --- Land and water -------------------------------------------------------------------
  dec(-700, 500, W - 0.1, W, -520, 420, WATER, M.WATER);
  box(-250, 205, -4, 0, -176, 262, ASPHALT, M.ASPHALT);
  box(-522, -250, -4, 0, -176, -120, GRASS, M.GRASS, { surf: 'grass' });
  box(-522, 302, -4, 0, -342, -300, GRASS, M.GRASS, { surf: 'grass' });
  const B = 60;
  box(-526, -520, -4, B, -344, -118, CHAR, 1, { hide: true }); box(300, 304, -4, B, -344, 264, CHAR, 1, { hide: true });
  box(-526, 304, -4, B, -346, -340, CHAR, 1, { hide: true }); box(-252, 304, -4, B, 260, 264, CHAR, 1, { hide: true });
  box(-522, -250, 0, 5, -122, -120, [0.26, 0.40, 0.24], M.LEAF); box(-252, -250, 0, B, -120, 264, CHAR, 1, { hide: true });
  dec(-256, -250, 0, 3.5, -120, 262, [0.36, 0.44, 0.34], M.LEAF);

  // --- Highway viaduct on the west edge, crossing the river -------------------------------
  box(-250, -226, 8, 9.5, -342, 262, PANEL, M.ASPHALT);
  dec(-250.4, -249.6, 9.5, 10.4, -342, 262, WHITE); dec(-226.4, -225.6, 9.5, 10.4, -342, 262, WHITE);
  for (let z = -320; z <= 250; z += 45) box(-239.5, -236.5, -4, 8, z - 1.5, z + 1.5, PANEL, M.PAVE);

  // --- Sidewalk podiums. Roads are the bare asphalt between them. --------------------------
  //     Grand Union Blvd x -100..-84 | Assembly Row x -6..6 | track-side street x 58..74
  //     Great River Rd z -131..-115 | Artisan Way z -68..-56 | Canal St z -6..6 | Foley St z 62..78 | Revolution Dr z 150..166
  pod(-82, -14, -113, -68); pod(14, 56, -113, -68); pod(-5, 5, -112, -70);
  pod(-82, -8, -56, -6); pod(8, 56, -56, -6);
  pod(-82, -8, 6, 60); pod(8, 56, 6, 60);
  pod(-82, -8, 80, 150); pod(8, 85, 80, 150);
  pod(-82, -8, 168, 256); pod(8, 85, 168, 256);
  pod(74, 85, -131, 62);

  // Row A, west: brick courtyard apartments, restaurant on the park corner.
  bld(-80, -18, -111, -99, 22, BRICK, M.BRICK); bld(-80, -18, -82, -70, 22, BRICK, M.BRICK);
  bld(-80, -68, -99, -82, 22, ORANGEBRICK, M.BRICK); bld(-30, -18, -99, -82, 22, ORANGEBRICK, M.BRICK);
  dec(-68, -30, 0.1, 0.16, -99, -82, GRASS, M.GRASS);
  box(-18, -15.6, 3.3, 3.6, -111, -97, BLACK, M.METAL); sign('EARLS', -17.9, 5.0, -104, 0, 1.3, '#ffffff'); sign('KITCHEN + BAR', -17.9, 4.1, -104, 0, 0.5, '#d8d8d8');
  // Row A, east: L-shaped white office with a solar roof; café in the nook.
  bld(18, 54, -111, -95, 20, CREAM); bld(38, 54, -95, -70, 20, CREAM);
  dec(20, 52, 20, 20.15, -109, -97, SOLAR, M.PLAIN); dec(40, 52, 20, 20.15, -93, -72, SOLAR, M.PLAIN);
  sign('CAFFÈ NERO', 28, 4.6, -94.9, 2, 0.9, '#ffffff', '#1d3a5c');
  // The pavilion in the split of Assembly Row, with trees and café tables south of it.
  bld(-4, 4, -108, -88, 5, [0.20, 0.22, 0.25], M.GLASS); dec(-4.6, 4.6, 5, 5.3, -108.6, -87.4, CHAR);
  sign('THE COURT', -4.1, 3.9, -98, 1, 0.6, '#ffffff');
  box(-2.2, -0.4, 0.1, 1.4, -86.2, -84.8, WOOD, M.PLAIN, { surf: 'wood' }); box(-0.4, 2.2, 0.1, 3.0, -88, -86.2, [0.22, 0.24, 0.27], M.PLAIN);
  tree(0, -81, 7); tree(0, -74, 7.5);
  for (const [tx, tz] of [[-2.6, -79], [2.6, -79], [-2.6, -72], [2.6, -72]]) {
    dec(tx - 0.5, tx + 0.5, 0.82, 0.86, tz - 0.5, tz + 0.5, BLACK, M.METAL); dec(tx - 0.04, tx + 0.04, 0.1, 0.82, tz - 0.04, tz + 0.04, BLACK, M.METAL);
    if (warm) { dec(tx - 0.03, tx + 0.03, 0.86, 2.5, tz - 0.03, tz + 0.03, STEEL, M.METAL); dec(tx - 1.2, tx + 1.2, 2.5, 2.62, tz - 1.2, tz + 1.2, WHITE, M.PLAIN); }
  }

  // Row B, west: the white outlet building. The brick giraffe stands at its north-east corner.
  bld(-80, -14, -46, -8, 14, WHITE); bld(-80, -24, -54, -46, 14, WHITE);
  [RED, YELLOW, BLUE, GREEN, RED].forEach((c, i) => dec(-14, -13.8, 4.6, 8.2, -44 + i * 6.4, -38.6 + i * 6.4, c, M.PLAIN));
  dec(-78, -16, 14, 14.15, -44, -10, SOLAR, M.PLAIN);
  sign('LEGO DISCOVERY CENTER', -13.75, 10.6, -27, 0, 1.5, '#1b1b1b'); sign('FUJI', -44, 5.0, -7.9, 2, 1.2, '#ffffff', '#111111');
  const gx = -16.5, gz = -51;
  box(gx - 2.7, gx - 1.5, 0.1, 1.3, gz - 0.6, gz + 0.6, RED, M.PLAIN);
  box(gx - 1.4, gx - 0.9, 0.1, 2.2, gz - 0.8, gz - 0.3, RED, M.PLAIN); box(gx - 1.4, gx - 0.9, 0.1, 2.2, gz + 0.3, gz + 0.8, ORANGE, M.PLAIN);
  box(gx + 0.9, gx + 1.4, 0.1, 2.2, gz - 0.8, gz - 0.3, GREEN, M.PLAIN); box(gx + 0.9, gx + 1.4, 0.1, 2.2, gz + 0.3, gz + 0.8, BLUE, M.PLAIN);
  box(gx - 1.4, gx + 1.4, 2.2, 3.6, gz - 0.8, gz + 0.8, YELLOW, M.PLAIN);
  [RED, ORANGE, GREEN, BLUE].forEach((c, i) => box(gx + 0.6, gx + 1.4, 3.6 + i * 0.5, 4.1 + i * 0.5, gz - 0.4, gz + 0.4, c, M.PLAIN));
  box(gx + 0.6, gx + 2.6, 5.2, 6.0, gz - 0.5, gz + 0.5, PURPLE, M.PLAIN);
  // Row B, east: dark apartments around two raised courtyards.
  bld(12.2, 53.8, -53.8, -8.2, 6, CHAR, M.BRICK);
  bld(12, 54, -54, -46, 20, CHAR, M.BRICK); bld(12, 54, -16, -8, 20, CHAR, M.BRICK); bld(12, 54, -33, -29, 20, CHAR, M.BRICK);
  bld(12, 20, -46, -16, 20, [0.30, 0.31, 0.35], M.BRICK); bld(46, 54, -46, -16, 20, [0.30, 0.31, 0.35], M.BRICK);
  dec(20, 46, 6, 6.08, -46, -33, GRASS, M.GRASS); dec(20, 46, 6, 6.08, -29, -16, GRASS, M.GRASS);

  // Row C, west: tan gridded office, and an apartment tower over a restaurant.
  bld(-80, -46, 8, 58, 44, TAN); bld(-42, -12, 36, 58, 8, [0.50, 0.47, 0.45], M.BRICK); bld(-42, -12, 8, 36, 58, [0.62, 0.68, 0.76], M.GLASS);
  sign('POSTO', -11.9, 5.2, 47, 0, 1.2, '#ffffff', '#3a1f14');
  // Row C, east: the cinema, a ramp alley, and the garage with a mural on its track side.
  bld(12, 30, 8, 58, 18, [0.90, 0.90, 0.88], M.SNOWY);
  box(8.4, 12, 4.4, 5.4, 22, 40, RED, M.PLAIN); sign('AMC', 11.9, 13.2, 31, 1, 3.4, '#e0261c', undefined, true); sign('ASSEMBLY ROW 12', 11.9, 10.4, 31, 1, 0.9, '#e0261c', undefined, true);
  ramp(3, 30, 36, 0.1, 10.5, 14, 58); box(30, 36, 0.1, 10.5, 8, 14, PANEL, M.PAVE);
  bld(36, 56, 8, 58, 10.5, [0.58, 0.60, 0.63], M.PAVE);
  box(30, 56, 10.5, 11.5, 8, 8.4, WHITE, M.PLAIN); box(55.6, 56, 10.5, 11.5, 8.4, 58, WHITE, M.PLAIN); box(36, 56, 10.5, 11.5, 57.6, 58, WHITE, M.PLAIN);
  [ORANGE, PURPLE, YELLOW, BLUE, RED, GREEN, ORANGE, BLUE].forEach((c, i) => dec(56, 56.15, 1 + (i % 3) * 0.8, 8.5 - (i % 2) * 1.5, 10 + i * 6, 15.4 + i * 6, c, M.PLAIN));
  for (let i = 0; i < 5; i++) props.push({ x: 40 + i * 3.4, y: 10.5, z: 22 + (i % 2) * 14, kind: 'cone' });
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3 - r; c++) props.push({ x: 50, y: 10.5 + r * 0.5, z: 44 + c * 0.55 + r * 0.27, kind: 'crate' });

  // Row D, west: the open recreation block, with courts, lawn, sand and a container bar.
  dec(-80, -52, 0.1, 0.16, 82, 110, SAND, M.SNOWY);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
    const cx = -46 + c * 8.4, cz = 84 + r * 15;
    dec(cx, cx + 6.4, 0.1, 0.13, cz, cz + 13.4, COURT, M.SNOWY); dec(cx + 0.3, cx + 6.1, 0.13, 0.14, cz + 6.6, cz + 6.8, LINE, M.PLAIN);
    dec(cx, cx + 6.4, 0.1, 0.9, cz + 6.68, cz + 6.72, [0.15, 0.15, 0.17], M.PLAIN);
  }
  dec(-48, -12, 0.1, 0.16, 116, 146, GRASS, M.GRASS);
  box(-80, -68, 0.1, 2.9, 112, 118, [0.84, 0.36, 0.20], M.PLAIN, { grind: true, surf: 'steel' }); sign('CLUB VOLO', -67.9, 1.8, 115, 0, 0.8, '#ffffff');
  box(-66, -58, 0.1, 0.55, 113, 114, PANEL, M.PAVE, { grind: true }); box(-56, -50, 0.1, 0.9, 113, 114, PANEL, M.PAVE, { grind: true });
  rails.push({ ax: -46, ay: 0.75, az: 114.5, bx: -34, by: 0.75, bz: 114.5 });
  bld(-80, -52, 124, 148, 30, [0.78, 0.76, 0.72]); sign('THE ROW HOTEL', -51.9, 26, 136, 0, 1.6, '#ffffff', '#2b2b30');
  // Row D, east: the paseo from the station, and the towers on a shared podium.
  bld(12, 56, 96, 148, 8, [0.48, 0.48, 0.50], M.BRICK);
  box(14, 34, 8, 70, 98, 120, WHITE, M.FACADE); box(38, 56, 8, 80, 98, 122, [0.82, 0.74, 0.60], M.FACADE); box(38, 56, 8, 72, 124, 146, [0.22, 0.24, 0.28], M.GLASS);
  sign('SHAKE SHACK', 44, 5.0, 95.9, 3, 1.0, '#7ac143', '#151515'); sign('TATTE', 11.9, 5.0, 138, 1, 1.1, '#111111', '#f4efe6');
  // The station: a ramp up from the paseo, a footbridge over the tracks, stairs down to the platform.
  ramp(0, 56, 76, 0.1, 5.5, 80, 88); box(76, 116, 5.1, 5.5, 80, 88, PANEL, M.PAVE, { surf: 'steel' }); ramp(1, 116, 136, 0, 5.5, 80, 88);
  ramp(3, 95, 101, 1.1, 5.5, 88, 106); box(94, 102, 0, 1.1, 88, 150, PAVE, M.PAVE);
  dec(94, 94.5, 1.1, 1.13, 106, 150, YELLOW, M.PLAIN); dec(101.5, 102, 1.1, 1.13, 106, 150, YELLOW, M.PLAIN);
  dec(94, 102, 4.9, 5.05, 110, 148, WHITE); dec(93.9, 102.1, 5.05, 5.2, 109.9, 148.1, ORANGE, M.PLAIN);
  for (let z = 112; z <= 146; z += 11) dec(97.85, 98.15, 1.1, 4.9, z - 0.15, z + 0.15, STEEL, M.METAL);
  dec(76, 116, 5.5, 6.6, 79.9, 80.05, ORANGE, M.PLAIN); dec(76, 116, 5.5, 6.6, 87.95, 88.1, ORANGE, M.PLAIN);
  dec(76, 86, 8.6, 8.9, 79, 89, GLASS, M.PLAIN); for (const x of [76.3, 85.7]) for (const z of [79.3, 88.7]) dec(x - 0.15, x + 0.15, 5.5, 8.6, z - 0.15, z + 0.15, STEEL, M.METAL);
  for (const x of [80, 114]) dec(x - 0.3, x + 0.3, 0, 5.1, 83.7, 84.3, STEEL, M.METAL);
  sign('ASSEMBLY', 66, 7.4, 79.85, 3, 1.3, '#ffffff', '#ed8b00'); sign('ASSEMBLY', 96, 7.2, 80.1, 2, 0.9, '#ffffff', '#ed8b00'); sign('ASSEMBLY', 96, 7.2, 87.9, 3, 0.9, '#ffffff', '#ed8b00'); sign('ASSEMBLY', 98, 3.9, 109.8, 3, 0.7, '#ffffff', '#ed8b00');

  // South of Revolution Drive.
  bld(-80, -46, 170, 200, 14, [0.08, 0.08, 0.09]);
  sign('LUCKY STRIKE', -63, 12.3, 169.9, 3, 1.3, '#ffffff'); sign('SOCIAL', -63, 10.9, 169.9, 3, 0.8, '#ffffff'); sign('LUCKY STRIKE', -80.1, 12.3, 185, 1, 1.3, '#ffffff');
  box(-81.3, -80.7, 5, 11.5, 168.8, 169.9, RED, M.EMIS); for (let i = 0; i < 7; i++) dec(-81.45, -81.3, 5.4 + i * 0.9, 5.6 + i * 0.9, 169.2, 169.5, [1, 0.85, 0.5], M.EMIS);
  bld(-80, -40, 204, 250, 70, [0.86, 0.88, 0.90], M.GLASS); bld(-36, -10, 172, 216, 22, WHITE);
  bld(12, 40, 172, 250, 46, [0.56, 0.64, 0.72], M.GLASS); sign('MASS GENERAL BRIGHAM', 26, 42, 171.9, 3, 1.6, '#ffffff');
  dec(42, 60, 0.1, 0.16, 172, 250, GRASS, M.GRASS); dec(48, 50.5, 0.16, 0.19, 172, 250, PAVE, M.PAVE);
  bld(62, 84, 172, 250, 12, [0.58, 0.58, 0.60], M.PAVE); dec(63, 83, 12, 12.2, 173, 249, SOLAR, M.PLAIN);
  dec(-70, 70, 0, 12, 276, 330, [0.76, 0.72, 0.66]); dec(-70.2, 70.2, 9, 12.1, 275.7, 276, ORANGE, M.PLAIN); sign('THE HOME DEPOT', 0, 10.5, 275.6, 3, 2.2, '#ffffff');

  // --- Marketplace strip and its lot ---------------------------------------------------
  bld(-216, -182, -110, 150, 9, TAN, M.SNOWY); dec(-182, -178, 4.4, 4.7, -110, 150, WHITE);
  const shops: [string, number, number[], string][] = [['STAPLES', -90, RED, '#ffffff'], ["TRADER JOE'S", -45, [0.72, 0.13, 0.15], '#ffffff'],
    ['TJ MAXX  ·  HOMEGOODS', 5, [0.70, 0.10, 0.16], '#ffffff'], ['BURLINGTON', 60, [0.12, 0.20, 0.42], '#ffffff'], ['WORLD MARKET', 115, [0.92, 0.90, 0.86], '#7a1f1f']];
  for (const [name, z, col, ink] of shops) {
    dec(-182, -181.6, 5.6, 8.6, z - 18, z + 18, col, M.PLAIN); sign(name, -181.5, 7.1, z, 0, 1.5, ink);
    for (let k = -1; k <= 1; k++) dec(-182, -181.85, 0.3, 3.4, z + k * 11 - 4, z + k * 11 + 4, [0.14, 0.18, 0.24], M.GLASS);
  }
  dec(-106, -102, 0, 0.12, -112, 148, GRASS, M.GRASS);
  for (let z = -104; z <= 140; z += 16) tree(-104, z, 6.5, 0.1);
  for (let x = -170; x <= -116; x += 18) for (let z = -100; z < 144; z += 5.4) dec(x - 2.6, x + 2.6, 0, 0.04, z - 0.07, z + 0.07, LINE, M.SNOWY);
  for (let x = -161; x <= -125; x += 36) for (let z = -90; z <= 130; z += 55) lamp(x, z, 0);
  bld(-150, -136, -128, -118, 4.5, WHITE); sign('CAFÉ', -143, 3.5, -117.9, 2, 0.8, '#ffffff', '#234a36');
  for (let i = 0; i < 9; i++) if (hash(i, 9) > 0.3) park(-170 + (i % 3) * 18 - 1.4, 70 + Math.floor(i / 3) * 16.2 + 2.7, 0, i + 3);
  if (warm) {
    ramp(3, -146, -138, 0, 1.1, 60, 64.5, ORANGE); ramp(3, -146, -138, 0, 1.4, -14, -9, ORANGE);
    for (let i = 0; i < 8; i++) props.push({ x: -142 + (i % 2 ? 5 : -5), y: 0, z: 54 - i * 7, kind: 'cone' });
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5 - r; c++) props.push({ x: -143.4 + c * 0.55 + r * 0.27, y: r * 0.5, z: 30, kind: 'crate' });
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4 - r; c++) props.push({ x: -143 + c * 0.55 + r * 0.27, y: r * 0.5, z: -60, kind: 'crate' });
  } else {
    // The plow pile: a stepped mountain of snow in the south lot.
    [[14, 1.2], [10, 2.4], [6, 3.6], [2.5, 4.8]].forEach(([r, h]) => box(-140 - r, -140 + r, 0, h, 40 - r, 40 + r, SNOW, M.SNOWY, { surf: 'snow' }));
    ramp(0, -168, -154, 0, 1.2, 34, 46, SNOW, { surf: 'snow', mat: M.SNOWY }); ramp(1, -126, -112, 0, 1.2, 34, 46, SNOW, { surf: 'snow', mat: M.SNOWY });
    ramp(3, -146, -134, 0, 1.6, 0, 6, SNOW, { surf: 'snow', mat: M.SNOWY });
  }

  // --- Orange Line: two tracks, island platform, bridge north over the Mystic --------------
  dec(86, 110, 0, 0.06, -176, 262, [0.27, 0.25, 0.25]); box(86, 110, -1.2, 0, -300, -176, PANEL, M.PAVE);
  for (let z = -290; z <= -186; z += 26) dec(87, 109, -4, -1.2, z - 1.2, z + 1.2, PANEL, M.PAVE);
  for (const x of [91.2, 92.6, 103.4, 104.8]) dec(x - 0.06, x + 0.06, 0.06, 0.2, -300, 262, STEEL, M.METAL);
  for (const x of [89.8, 106.2]) dec(x - 0.12, x + 0.12, 0.06, 0.26, -300, 262, YELLOW, M.PLAIN);
  box(85, 85.3, 0, 1.6, -176, 262, STEEL, M.METAL, { surf: 'steel' }); box(110.7, 111, 0, 1.6, -176, 262, STEEL, M.METAL, { surf: 'steel' });

  // --- Baxter Riverfront Park ------------------------------------------------------------
  dec(-82, 84, 0, 0.05, -176, -133, GRASS, M.GRASS); dec(-82, 84, 0, 0.08, -172, -169, PAVE, M.PAVE);
  dec(-24, 24, 0, 0.08, -148, -133, BRICKPAVE, M.PAVE); dec(-9, 9, 0, 0.08, -164, -148, PAVE, M.PAVE); dec(-15, 15, 0, 0.08, -176, -164, PAVE, M.PAVE);
  for (let x = -14; x <= 14; x += 4) dec(x - 0.05, x + 0.05, 0, 1.1, -175.6, -175.5, BLACK, M.METAL); dec(-15, 15, 1.05, 1.12, -175.62, -175.48, BLACK, M.METAL);
  // Three freestanding riveted steel portal frames salvaged from the Ford assembly plant.
  for (const cx of [-16, 0, 16]) {
    for (const lx of [-3.6, 3.6]) {
      box(cx + lx - 0.45, cx + lx + 0.45, 0, 9, -139.5, -138.5, RUST, M.PLAIN, { surf: 'steel' });
      for (let y = 1; y < 8.5; y += 1.5) dec(cx + lx - 0.5, cx + lx + 0.5, y, y + 0.14, -139.56, -138.44, [0.40, 0.20, 0.12], M.PLAIN);
    }
    box(cx - 4.4, cx + 4.4, 9, 10.2, -139.5, -138.5, RUST, M.PLAIN, { surf: 'steel' });
    for (let k = -3; k <= 3; k += 2) dec(cx + k - 0.08, cx + k + 0.08, 9, 10.2, -139.58, -138.42, [0.38, 0.19, 0.11], M.PLAIN);
    dec(cx - 3.2, cx - 2.2, 7.4, 9, -139.2, -138.8, RUST, M.PLAIN); dec(cx + 2.2, cx + 3.2, 7.4, 9, -139.2, -138.8, RUST, M.PLAIN);
  }
  dec(-2.6, 2.6, 6.6, 8.7, -139.08, -138.92, [0.12, 0.25, 0.50], M.PLAIN); sign('RIVERFEST', 0, 7.7, -138.85, 2, 1.0, '#ffffff'); sign('RIVERFEST', 0, 7.7, -139.15, 3, 1.0, '#ffffff');
  for (const [x, z, h] of [[-64, -160, 8], [-44, -150, 7], [-34, -164, 8.5], [-70, -146, 7], [40, -144, 8], [60, -160, 7.5], [74, -146, 8], [30, -165, 7], [-20, -160, 7], [20, -158, 7.5]]) tree(x, z, h, 0.05);
  for (const x of [34, 50, 66]) box(x, x + 3, 0.05, 0.5, -168, -167.3, WOOD, M.PLAIN, { grind: true, surf: 'wood' });
  for (const x of [-60, -30, 30, 60]) lamp(x, -168.4, 0.05);
  // The marina: a long pier with finger docks, just upstream of the Orange Line bridge.
  box(58.5, 61.5, -1.4, -0.3, -218, -176, WOOD, M.PLAIN, { surf: 'wood' });
  for (const z of [-188, -199, -210]) { box(44, 58.5, -1.4, -0.35, z - 0.6, z + 0.6, WOOD, M.PLAIN, { surf: 'wood' }); box(61.5, 76, -1.4, -0.35, z - 0.6, z + 0.6, WOOD, M.PLAIN, { surf: 'wood' }); }
  let bi = 0;
  for (const z of [-193.5, -204.5]) for (const x of [47, 53, 66, 72]) {
    bi++; if (snow && bi % 2) continue;
    box(x - 1.3, x + 1.3, -1.2, 0.5, z - 3.6, z + 3.6, WHITE, M.SNOWY, { surf: 'wood' });
    dec(x - 1.0, x + 1.0, 0.5, 1.4, z - 1.6, z + 1.2, WHITE, M.SNOWY); dec(x - 0.9, x + 0.9, 0.8, 1.25, z - 1.66, z - 1.6, [0.1, 0.14, 0.2], M.PLAIN);
  }
  [RED, YELLOW, BLUE, GREEN].forEach((c, i) => dec(62.6 + i * 1.0, 63.3 + i * 1.0, 0.05, 0.4, -175.5, -171.6, c, M.PLAIN));
  sign('KAYAKS', 64.5, 1.6, -171.5, 2, 0.6, '#ffffff', '#1d6fd1'); dec(64.4, 64.6, 0.05, 1.2, -171.6, -171.5, STEEL, M.METAL);

  // --- Draw Seven Park and the Amelia Earhart Dam ------------------------------------------
  dec(112, 205, 0, 0.05, -140, 262, GRASS, M.GRASS); dec(140, 144, 0, 0.08, -140, 262, PAVE, M.PAVE);
  for (const [x, z] of [[125, -100], [180, -60], [160, 20], [190, 120], [125, 180], [175, 210], [130, -20], [150, 90]]) tree(x, z, 8, 0.05);
  for (let i = 0; i < 6; i++) if (i !== 2) park(124 + i * 5.2, -160, Math.PI / 2, i + 11);
  box(160, 172, -4, 0.3, -300, -176, PANEL, M.PAVE);
  for (const z of [-270, -238, -206]) dec(162, 170, 0.3, 5, z - 3, z + 3, [0.70, 0.71, 0.73], M.FACADE);
  dec(163, 169, 5, 12, -257, -251, [0.74, 0.75, 0.77], M.FACADE); dec(162.4, 169.6, 12, 12.5, -257.6, -250.4, CHAR, M.PLAIN);
  dec(160, 160.15, 0.3, 1.4, -300, -176, STEEL, M.METAL); dec(171.85, 172, 0.3, 1.4, -300, -176, STEEL, M.METAL);

  // --- Shore Drive and the boathouse, upriver past the highway ------------------------------
  dec(-250, -103, 0, 0.05, -176, -150, GRASS, M.GRASS); dec(-440, -250, 0, 0.05, -148, -134, ASPHALT, M.ASPHALT);
  for (let x = -430; x < -104; x += 9) dec(x, x + 4, 0.05, 0.07, -141.1, -140.9, LINE, M.SNOWY);
  box(-472, -442, 0, 6.5, -150, -130, [0.26, 0.42, 0.60], M.FACADE); dec(-474, -440, 6.5, 7.6, -152, -128, WOOD);
  sign('BLESSING OF THE BAY BOATHOUSE', -457, 5.2, -129.9, 2, 0.8, '#ffffff');
  box(-452, -446, -1.4, -0.3, -192, -176, WOOD, M.PLAIN, { surf: 'wood' });
  [YELLOW, RED, BLUE, GREEN, ORANGE].forEach((c, i) => dec(-438 + i * 1.1, -437.2 + i * 1.1, 0, 0.35, -172, -168, c, M.PLAIN));
  dec(-520, -250, 0, 0.07, -174, -170, PAVE, M.PAVE);
  for (let x = -500; x < -260; x += 34) tree(x, -128, 8, 0); for (let x = -230; x < -110; x += 30) tree(x, -160, 7.5, 0.05);

  // --- Backdrop ring ----------------------------------------------------------------------
  dec(196, 268, 0, 14, -338, -310, CREAM, M.FACADE); box(204, 260, 0, 100, -336, -318, BRONZE, M.GLASS); sign('ENCORE', 232, 91, -317.8, 2, 6, '#f3e2c2');
  dec(-120, -40, 0, 9, -338, -316, [0.80, 0.78, 0.74]); dec(-20, 50, 0, 10, -338, -316, [0.82, 0.80, 0.78]);
  const sky: number[][] = [[-160, 430, 26, 150], [-120, 470, 30, 205], [-70, 450, 34, 240], [-20, 480, 28, 180], [30, 440, 30, 165], [80, 500, 36, 225], [130, 460, 26, 140], [180, 520, 30, 190], [-210, 520, 30, 120], [230, 470, 24, 110]];
  for (const [x, z, wd, h] of sky) dec(x - wd / 2, x + wd / 2, 0, h, z, z + wd, HAZE, M.GLASS);
  dec(-330, -326, 0, 82, 400, 404, WHITE); dec(-290, -286, 0, 82, 400, 404, WHITE); dec(-350, -266, 16, 18, 398, 406, WHITE);
  dec(348.5, 351.5, -1, 84, -61.5, -58.5, WHITE, M.PLAIN); dec(340, 360, -1, 0.5, -70, -50, GRASS, M.GRASS);

  // --- Street furniture ---------------------------------------------------------------------
  for (const [z0, z1] of [[-54, -8], [8, 58], [82, 148], [170, 250]]) {
    for (let z = z0 + 5; z < z1; z += 13) { tree(-7.2, z, 6.5, 0.1, true); tree(7.2, z + 6, 6.5, 0.1, true); }
    for (let z = z0 + 11; z < z1; z += 26) { lamp(-6.6, z); lamp(6.6, z + 13); }
    let k = 0;
    for (let z = z0 + 6; z < z1 - 4; z += 6.2) { k++; if (hash(k, z0) > 0.28) park(-4.9, z, Math.PI / 2, k + z0); if (hash(k + 50, z0) > 0.28) park(4.9, z + 2, -Math.PI / 2, k * 3 + z0); }
  }
  for (const z of [-68, -56, -6, 6, 60, 80, 150, 168]) dec(-6, 6, 0, 0.045, z - (z === -68 || z === -6 || z === 60 || z === 150 ? 0 : 3), z + (z === -68 || z === -6 || z === 60 || z === 150 ? 3 : 0), XWALK, M.SNOWY);
  for (let z = -52; z < 250; z += 8) if (!(z > -8 && z < 8) && !(z > 58 && z < 82) && !(z > 148 && z < 168)) dec(-0.1, 0.1, 0, 0.04, z, z + 3.5, YELLOW, M.SNOWY);
  for (let z = -110; z < 148; z += 9) dec(-92.1, -91.9, 0, 0.04, z, z + 4, LINE, M.SNOWY);
  dec(-85.6, -84.3, 0, 0.035, -112, 150, BIKE, M.SNOWY); dec(-99.7, -98.4, 0, 0.035, -112, 150, BIKE, M.SNOWY);
  for (let z = -108; z < 148; z += 12) { dec(-86.05, -85.95, 0, 0.8, z - 0.05, z + 0.05, WHITE, M.PLAIN); dec(-98.05, -97.95, 0, 0.8, z - 0.05, z + 0.05, WHITE, M.PLAIN); }
  for (let x = -76; x < 52; x += 9) { dec(x, x + 4, 0, 0.04, -123.1, -122.9, LINE, M.SNOWY); if (x < -12 || x > 12) dec(x, x + 4, 0, 0.04, 69.9, 70.1, LINE, M.SNOWY); }
  for (let z = -108; z < 56; z += 9) dec(65.9, 66.1, 0, 0.04, z, z + 4, LINE, M.SNOWY);
  for (let z = -100; z <= 140; z += 30) lamp(-83, z); for (let x = -70; x <= 50; x += 30) lamp(x, -114); for (let z = -100; z <= 50; z += 30) lamp(75, z);
  // Roundabout where Grand Union meets the park.
  box(-101, -93, 0, 0.5, -132, -124, GRASS, M.GRASS); box(-102.5, -91.5, 0, 0.3, -130, -126, PAVE, M.PAVE); box(-99, -95, 0, 0.3, -133.5, -122.5, PAVE, M.PAVE); tree(-97, -128, 6, 0.5);
  for (const [x, z, t] of [[-83, 152.5, 'REVOLUTION DR'], [-7, -57.5, 'ARTISAN WAY'], [7, 4.5, 'CANAL ST'], [-7, 61, 'FOLEY ST'], [-83, -114.5, 'GRAND UNION BLVD']] as [number, number, string][]) {
    dec(x - 0.07, x + 0.07, 0.1, 3.4, z - 0.07, z + 0.07, BLACK, M.METAL); sign(t, x, 3.1, z + 0.09, 2, 0.32, '#ffffff', '#1c4fa3'); sign(t, x, 3.1, z - 0.09, 3, 0.32, '#ffffff', '#1c4fa3');
  }

  // --- The driving loop: Grand Union north, Great River Road east, the track-side street south, Foley west.
  const path = buildLoop([[-92, -123], [66, -123], [66, 70], [-92, 70]], 10);
  const towS = pathNearest(path, -92, 30);
  const cars: CarSeed[] = [{ kind: 'truck', s: towS, dir: 1, off: 5.0, speed: 13.5, hue: 0 }];
  const L = path.len;
  if (snow) {
    cars.push({ kind: 'plow', s: towS + 150, dir: 1, off: 3.2, speed: 5.5, hue: 1 }, { kind: 'plow', s: towS + 430, dir: 1, off: 3.2, speed: 5.0, hue: 2 }, { kind: 'car', s: towS + 300, dir: 1, off: 3.0, speed: 9.5, hue: 3 });
    cars.push({ kind: 'plow', s: towS + 520, dir: -1, off: -3.4, speed: 5.5, hue: 4 });
    for (let i = 0; i < 4; i++) cars.push({ kind: 'car', s: towS + 90 + i * (L / 4.6), dir: -1, off: -3.3, speed: 9 + (i % 2), hue: i + 5 });
  } else {
    for (let i = 0; i < 3; i++) cars.push({ kind: 'car', s: towS + 120 + i * (L / 3.4), dir: 1, off: 3.0, speed: 10 + (i % 2), hue: i + 1 });
    for (let i = 0; i < 5; i++) cars.push({ kind: 'car', s: towS + 60 + i * (L / 5.3), dir: -1, off: -3.3, speed: 10 + (i % 3) * 0.5, hue: i + 4 });
  }

  // Winter: plowed banks along the loop, rideable from both sides like a standing wave.
  if (snow) {
    const o = { surf: 'snow' as const, mat: M.SNOWY };
    const bankZ = (z0: number, z1: number, xRoad: number, xPeak: number, xBack: number, h = 1.5) => {
      if (xPeak > xRoad) { ramp(0, xRoad, xPeak, 0, h, z0, z1, SNOW, o); ramp(1, xPeak, xBack, 0, h, z0, z1, SNOW, o); }
      else { ramp(1, xPeak, xRoad, 0, h, z0, z1, SNOW, o); ramp(0, xBack, xPeak, 0, h, z0, z1, SNOW, o); }
    };
    const bankX = (x0: number, x1: number, zRoad: number, zPeak: number, zBack: number, h = 1.5) => {
      if (zPeak > zRoad) { ramp(2, x0, x1, 0, h, zRoad, zPeak, SNOW, o); ramp(3, x0, x1, 0, h, zPeak, zBack, SNOW, o); }
      else { ramp(3, x0, x1, 0, h, zPeak, zRoad, SNOW, o); ramp(2, x0, x1, 0, h, zBack, zPeak, SNOW, o); }
    };
    // Low banks on the building side (to carve), tall ones on the open side (to launch).
    for (const [a, b] of [[-111, -70], [-54, -8], [8, 56]]) { bankZ(a, b, -86.4, -83.4, -81.4, 1.0); bankZ(a, b, 60.4, 57.4, 55.4, 1.0); }
    for (const [a, b] of [[-110, -66], [-54, -6], [6, 56]]) bankZ(a, b, -97.6, -100.6, -102.6, 2.0);
    for (const [a, b] of [[-112, -30], [-22, 56]]) bankZ(a, b, 71.6, 74.6, 76.6, 2.0);
    for (const [a, b] of [[-80, -18], [18, 54]]) bankX(a, b, -117.4, -114.4, -112.4, 1.0);
    for (const [a, b] of [[-78, -22], [22, 54]]) bankX(a, b, -128.6, -131.6, -133.6, 2.0);
    for (const [a, b] of [[-80, -12], [12, 28], [38, 54]]) bankX(a, b, 64.4, 61.4, 59.4, 1.0);
    for (const [a, b] of [[-80, -12], [12, 44]]) bankX(a, b, 75.6, 78.6, 80.6, 1.8);
    for (const [x, z] of [[-60, -150], [-30, -156], [44, -152], [-30, 131], [-20, 100], [0, -160], [-120, -140], [150, 40]]) props.push({ x, y: ground0(x, z), z, kind: 'snowman' });
  }
  if (se === 'fall' && !snow) for (const [x, z] of [[-10.5, -40], [10.5, -20], [-10.5, 20], [10.5, 44], [-10.5, 100], [10.5, 130], [-50, -150], [-36, -160], [50, -150], [0, -80], [-30, 122], [-20, 138], [-104, -40], [-104, 40], [30, 86], [-60, -145]]) props.push({ x, y: ground0(x, z), z, kind: 'leaves' });
  function ground0(x: number, z: number) { let y = 0; for (const s of solids) if (s.ramp === undefined && !s.hide && x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1 && s.y1 <= 0.6 && s.y1 > y) y = s.y1; return y; }

  // --- Things to mow or plow -----------------------------------------------------------------
  const fields: FieldSeed[] = snow
    ? [{ kind: 'snow', name: 'Marketplace lot', x0: -178, z0: -100, nx: 30, nz: 32, cell: 2.5 }]
    : [{ kind: 'lawn', name: 'Baxter Park west lawn', x0: -78, z0: -166, nx: 26, nz: 15, cell: 2 }, { kind: 'lawn', name: 'Baxter Park east lawn', x0: 26, z0: -166, nx: 15, nz: 15, cell: 2 },
      { kind: 'lawn', name: 'Club Volo lawn', x0: -48, z0: 116, nx: 18, nz: 15, cell: 2 }];
  const rides: RideSeed[] = snow
    ? [{ kind: 'plow', x: -110, z: -60, yaw: Math.PI }, { kind: 'plow', x: -110, z: 100, yaw: Math.PI }]
    : [{ kind: 'mower', x: -70, z: -136, yaw: 0 }, { kind: 'mower', x: 30, z: -136, yaw: 0 }, { kind: 'mower', x: -30, z: 131, yaw: Math.PI }];

  edgeRails(solids, rails);

  // --- Spawns, docks, trains, people ----------------------------------------------------------
  const tp: PathPos = { x: 0, z: 0, hx: 0, hz: 0, corner: false }; pathAt(path, towS - 9, 5.0, tp);
  const spawns: Spawn[] = [
    { name: 'Station', x: 72, y: 4.42, z: 84, yaw: Math.PI, mode: 'skate' },
    { name: 'The Row', x: 0, y: 0, z: -40, yaw: Math.PI / 2, mode: 'skate' },
    { name: 'Garage roof', x: 33, y: 10.5, z: 11.5, yaw: Math.PI / 2, mode: 'cart' },
    { name: 'Tow truck', x: tp.x, y: 0, z: tp.z, yaw: Math.atan2(tp.hz, tp.hx), mode: 'skate', tow: true },
    snow ? { name: 'Snowplow', x: -112, y: 0, z: -57, yaw: Math.PI, mode: 'foot' } : { name: 'Mower', x: -70, y: 0, z: -133.6, yaw: Math.PI / 2, mode: 'foot' },
    { name: 'Marina', x: 60, y: -0.3, z: -204, yaw: -Math.PI / 2, mode: 'foot' },
    { name: 'Big lot', x: -142, y: 0, z: 128, yaw: -Math.PI / 2, mode: 'cart' },
  ];
  const docks = [
    { name: 'Marina dock', lx: 60, ly: -0.3, lz: -215, wx: 60, wz: -226, yaw: -Math.PI / 2 },
    { name: 'Boathouse dock', lx: -449, ly: -0.3, lz: -184, wx: -442, wz: -187, yaw: 0 },
  ];
  const trains = [
    { x0: 90.4, x1: 93.4, from: -330, stop: 126, to: 420, offset: 0 },
    { x0: 102.6, x1: 105.6, from: 420, stop: 126, to: -330, offset: 40 },
  ];
  const hazards = [{ x0: 89.5, x1: 90.1, z0: -176, z1: 262 }, { x0: 105.9, x1: 106.5, z0: -176, z1: 262 }];

  const lines: number[][] = [[-10.5, -52, -10.5, 58], [10.5, 58, 10.5, -52], [-10.5, 82, -10.5, 148], [10.5, 148, 10.5, 92], [12, 87, 54, 87], [-76, -170.5, 78, -170.5],
    [-16, -110, -16, -72], [-76, -55, -26, -55], [-50, 114.8, -12, 114.8]];
  for (let i = 0; i < 40; i++) { const l = lines[i % lines.length]; npcs.push({ kind: 'ped', ax: l[0], az: l[1], bx: l[2], bz: l[3], t: (i * 0.137) % 1, speed: 1.15 + (i % 5) * 0.12, hue: i }); }
  for (let i = 0; i < 6; i++) npcs.push({ kind: 'goose', ax: 34 + i * 3.0, az: -158 + (i % 2) * 2.4, bx: 0, bz: 0, t: i * 0.3, speed: 5.1, hue: i });
  npcs.push({ kind: 'guard', ax: -30, az: 98, bx: 0, bz: 0, t: 0, speed: 7.1, hue: 0 });

  zone('Assembly station', 76, 116, 78, 152); zone('Orange Line tracks', 85, 111, -300, 262); zone('Marina', 42, 78, -220, -176);
  zone('Baxter Riverfront Park', -82, 84, -176, -131); zone('Draw Seven Park', 111, 205, -176, 262); zone('Amelia Earhart Dam', 158, 174, -300, -176);
  zone('LEGO Discovery Center', -82, -8, -56, -6); zone('AMC Assembly Row 12', 8, 30, 6, 60); zone('Garage', 30, 56, 6, 60); zone('Club Volo', -82, -8, 80, 122); zone('The Row Hotel', -82, -50, 122, 150);
  zone('Station paseo', 8, 76, 78, 96); zone('Lucky Strike', -82, -44, 168, 202); zone('Mass General Brigham', 8, 85, 168, 256);
  zone('Assembly Row', -8, 8, -131, 256); zone('Grand Union Boulevard', -102, -82, -131, 256); zone('Great River Road', -82, 76, -131, -113); zone('Artisan Way', -82, 58, -68, -56);
  zone('Canal Street', -82, 58, -6, 6); zone('Foley Street', -82, 76, 62, 80); zone('Revolution Drive', -82, 85, 150, 168);
  zone('Marketplace lot', -182, -102, -114, 152); zone('Assembly Square Marketplace', -218, -182, -112, 152); zone('Under the highway', -252, -224, -342, 262);
  zone('Blessing of the Bay Boathouse', -480, -430, -200, -120); zone('Shore Drive', -522, -102, -176, -114); zone('Everett shore', -522, 302, -342, -300);
  zone('Mystic River', -522, 302, -300, -176); zone('Assembly Row', -82, 85, -131, 256); zone('Assembly Square', -250, 205, -176, 262);

  const rivets = [
    [gx + 1.6, 6.9, gz], [0, 6.2, -98], [46, 11.5, 30], [-74, 3.9, 115], [98, 2.1, 147], [100, 6.5, 84], [160, 1, 60], [166, 1.3, -240], [80, 1, -306], [60, 0.6, -216],
    [-457, 1, -160], [-238, 1, -172], [-140, snow ? 5.8 : 1, 40], [-66, 1, 96], [0, 1, -170], [0, 1, -142], [-44, 1.1, 168.6], [52, 1.1, 205], [-176, 1, -70], [-340, 1, -141],
  ];
  return {
    solids, rails, props, spawns, minX: -520, maxX: 300, minZ: -340, maxZ: 260, kind: 'city', baseY: W,
    decor, docks, trains, zones, hazards, npcs, rivets, trial: { sx: 72, sz: 84, fx: -449, fz: -182, r: 11 },
    env, path, cars, towS, fields, rides, signs, trees, lamps, parked, turbine: [350, 84, -58.4],
  };
}
