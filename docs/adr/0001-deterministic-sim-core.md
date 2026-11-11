# ADR 0001: A deterministic simulation core with no browser dependencies

Date: 2026-11-10. Status: accepted.

## Decision
All movement logic lives in `src/sim/` as plain functions over plain data: a fixed 60 Hz step, no DOM, no rendering, no randomness. The browser shell (`src/main.ts`) feeds it input and draws the result.

## Why
- Physics can be tested in CI without a browser. `tests/sim.test.ts` runs 20 simulated minutes of fuzzed input in under a second.
- Identical input gives identical output, which async ghosts and replays (brief section 8) depend on.
- The core can move into a Web Worker and behind an ECS at Milestone 2 without being rewritten.

## Cost
State is one `Player` record, not components. That is fine for one player in a lab and will be split into components when NPCs arrive.
