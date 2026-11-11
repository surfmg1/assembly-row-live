# ADR 0006: Seasons rebuild the world; traffic and the tow run on one path

Date: 2026-11-11. Status: accepted.

## Decisions
- **A season or weather change rebuilds the world** (`buildCity(env)`) and re-binds the player to it (`rebind`). Snowbanks, plows, mowers, leaf piles and the fields to mow or plow are ordinary world content, so the simulation needs no season special cases beyond surface friction.
- **All road vehicles follow one closed path** by distance travelled, with a lane offset. That keeps traffic deterministic and cheap, and gives the tow truck the same rules as everything else. The cost: vehicles cannot leave the loop or turn into side streets.
- **The bungee is a one-way spring** from the truck's hitch to the rider, applied to velocity before the normal movement step. Steering still rotates velocity without losing speed, so swinging wide and cutting back whips the rider. With no stick input the board steers itself in behind the truck.
- **Snow is soft**: anything on wheels or a board that hits a snow solid up to 1.9 m rides up onto it instead of stopping. Cresting a bank at speed leaves the ground.
- **Rendering stays dependency-free WebGL2** (ADR 0002 extended): one shadow map, a procedural sky, per-material shading in one fragment shader, and a canvas-built text atlas for signs. Still boxes; the look is stylized on purpose and by necessity.

## Fun-over-fidelity additions
| Trade-off | The game does | Why |
|---|---|---|
| Bungee physics | Spring constant and damping tuned for a 2 to 4 m stretch and a 20 mph slingshot | A real bungee tow at these speeds would be dangerous and less controllable |
| Tricks | A trick that is within 0.1 s of finished when you land still counts, at 70% | Fewer cheap bails |
| Plow and mower | Top out at 25 and 17 mph | Real ones are slower and duller |
| Drivers | Stop and honk for a person standing still, never for a rider at speed | Fair to walkers, a hazard to dodge on the tow |
