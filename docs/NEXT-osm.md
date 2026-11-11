# Next task: real building shapes from OpenStreetMap

Handoff notes for whoever picks this up (a lighter Claude model in a fresh chat is fine). Read this, `README.md` and `docs/reference-notes.md`; you do not need the old chat.

## State of the project
- Single-page browser game. `npm run build` → `dist/index.html` (one file, about 740 kB). `npm test` runs 33 headless physics tests; keep them passing.
- `src/sim/city.ts` lays out Assembly Row by hand as axis-aligned boxes (`box`, `bld`, `ramp`). Collision (`src/sim/world.ts`) only understands axis-aligned boxes and wedges.
- Rendering is Three.js r187 (`src/render/renderer.ts`). Building facades are procedural, keyed on material ids `M.FACADE`, `M.BRICK`, `M.GLASS`.
- Game frame: metres, +x east, +z south, river to the north (negative z), Orange Line on the east (x ≈ 86 to 111), Marketplace lot on the west.
- The playable copy for GitHub Pages lives at `docs/index.html`. Rebuild and copy it (with the html/head wrapper already in that file) after each change.

## Getting the data
This cloud workspace cannot reach openstreetmap.org (the proxy refuses it). The owner downloads one file:
1. Go to https://www.openstreetmap.org/export
2. Click "Manually select a different area" and drag a box from the river (north) to I-93 (south), and from the Marketplace strip (west) to Draw Seven Park (east). Roughly 42.3885 to 42.3975 N, 71.0855 to 71.0720 W.
3. Click Export; it saves `map.osm`. Attach that file to the chat.

## Plan (keep it small and testable)
1. `tools/osm-to-city.mjs`: parse `map.osm` (XML) for `way` elements with a `building` tag. Use `building:levels` × 3.4 m or `height` for height; default 6 levels for apartments and offices, 1 for retail.
2. Project lat/lon to metres (equirectangular around the box centre is fine). Rotate so Assembly Row street runs along +z, then translate so Assembly station's footbridge lands near game (96, 84). Check the fit with two more anchors: the LEGO building's north-east corner near (-14, -46) and the Grand Union roundabout near (-97, -128).
3. Reduce each footprint to one or a few axis-aligned rectangles (after the rotation most are near-rectangular; L-shapes and courtyards become 2 to 4 boxes). Print them as a generated file `src/sim/osm-buildings.ts` exporting `[x0, x1, z0, z1, height, kind][]`.
4. In `city.ts`, replace the hand-laid `bld(...)` calls inside the street grid with the generated boxes. Keep roads, podiums, signs, trees, spawns, the tow loop and every gameplay object. Move any spawn, rivet or sign that ends up inside a building.
5. Run `npm test`, fix anything that now overlaps (traffic loop, NPC paths, spawns), build, and take one screenshot pass with `npm run capture -- quick`.

Do not attempt roads from OSM in the same pass; the tow loop and traffic depend on the current straight streets.

## Licence
OpenStreetMap data is ODbL: add "Map data © OpenStreetMap contributors, ODbL" to `LICENSES.md` and to the menu's fine print. Fine for this personal project; revisit before any public or commercial release.
