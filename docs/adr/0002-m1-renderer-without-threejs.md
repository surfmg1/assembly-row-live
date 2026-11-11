# ADR 0002: Milestone 1 renders with dependency-free WebGL2, not Three.js

Date: 2026-11-10. Status: accepted for Milestone 1 only. Changes the brief's suggested stack.

## Decision
The movement lab draws instanced boxes through about 150 lines of raw WebGL2 (`src/render/renderer.ts`). Three.js with the WebGPU renderer comes in at Milestone 2, as the brief specifies.

## Why
- The workspace this milestone was built in cannot reach a package registry, so Three.js could not be installed or tested. Shipping a renderer that was never run would break the "always a playable build" rule.
- The lab is grey boxes. It needs three draw calls and no materials, lights, or loaders.
- The result is one 80 kB self-contained HTML file that plays on a phone.

## Cost
The renderer is throwaway. Nothing in `src/sim/` depends on it, so the port touches `src/render/` and `src/main.ts` only.
