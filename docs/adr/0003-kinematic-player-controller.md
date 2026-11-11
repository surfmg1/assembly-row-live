# ADR 0003: The player is a hand-written kinematic controller, not a Rapier body

Date: 2026-11-10. Status: accepted. Changes the brief's suggested stack.

## Decision
Player movement in every mode is a custom kinematic controller: a vertical cylinder swept against axis-aligned solids and ramps, with explicit states for slide, wall-run, ledge grab, grind, manual and bail. Rapier is reserved for things that should behave like objects: props, vehicles, boats, ragdolls.

## Why
- The brief's key rule is that momentum carries between modes. With one controller, a mode switch is a one-line change that never touches velocity. With rigid bodies it means swapping bodies and re-seeding state.
- Coyote time, jump buffering, auto-vaults and snap-to-rail are deliberate departures from physics. They are simple as explicit rules and awkward as forces on a solver.
- The whole step costs about 3 microseconds.

## Cost
Collision is against boxes and wedges only. Real buildings at Milestone 2 need either a triangle-mesh query (Rapier's query pipeline can serve the same controller) or collision proxies generated from the facade spec.
