# ADR 0005: The first playable city is laid out by hand, not ingested

Date: 2026-11-10. Status: accepted as a stopgap. Departs from the brief's Milestone 2.

## Decision
`src/sim/city.ts` describes Assembly Row as about a hundred hand-placed boxes and ramps plus decoration, written from general knowledge of the neighborhood. Trains run on an invented 80-second timetable. Building facades are a procedural window pattern in the shader.

## Why
- The owner asked for something playable the same evening and said real train times do not matter.
- The workspace cannot reach MassGIS, LiDAR, OpenStreetMap or a package registry.
- It reuses the Milestone 1 simulation unchanged, so everything that was tested still holds.

## Cost
- Positions and sizes are approximate; a local will recognize the arrangement, not the measurements. The brief's "streets within 1 m of OSM" check cannot pass until the ingest pipeline replaces this file.
- The river corridor to the boathouse is compressed from about a mile to about 400 m.
- Real brand names appear as zone labels. `BRAND` in `city.ts` holds parody names for any public build; switching is one edit, not yet one flag.
- Every solid is tested against every mover each step. Fine at 100 solids (28 microseconds per step); the real map needs the chunk grid.
