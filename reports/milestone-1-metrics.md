# Milestone 1 metrics: movement lab

10 November 2026.

## Acceptance

| Check from the brief | Result | Evidence |
|---|---|---|
| 60 fps | **Not measured on target hardware.** | The only renderer available here is software (SwiftShader): about 15 fps at 1280×720. Workload is 3 draw calls and about 130 boxes per frame against a budget of 1,500 calls, and the simulation costs about 3 µs per step. Read the real number from the in-game Stats panel. |
| Momentum carries between all three modes | **Pass** | Test 1: every switch, on the ground and in the air, loses under 0.2 m/s of a 9.2 m/s carry (the loss is one frame of rolling friction; the switch itself does not touch velocity) |
| 5 playtesters do a trick within 60 seconds unprompted | **Needs people.** | Scripted stand-in: holding forward from the spawn reaches the first trick at 5.5 s by keyboard and 4.7 s by touch stick |

## Physics tests (`npm test`): 11 of 11 pass

1. Momentum carries between all three modes, grounded and airborne
2. Holding forward from the spawn gives air and a grind within 10 s, with no bail first
3. The kicker launches a skater
4. Jump apex and coyote time on foot
5. A vault keeps speed over a 1 m box
6. The parkour run chains vaults, a wall-run across the 10 m gap, and the climb to the 4 m deck
7. Cart: push, bobsled hop, ride the ramp, ram the stack
8. A bail respawns within 2 seconds (measured 1.52 s) at a safe spot
9. 400 high-speed launches into walls and obstacles all stay inside the room
10. 20 simulated minutes of seeded random input: finite, in bounds, and identical on a second run
11. Simulation cost: about 3 µs per step, 0.02% of a 60 fps frame

## Browser smoke test (`npm run capture`)

- No page errors on desktop (1280×720) or phone (390×780, touch)
- No horizontal overflow at phone width
- Build size: 50 kB minified, one file, no runtime dependencies beyond two web fonts

## Gameplay video

`milestone-1-gameplay.mp4`, 72 seconds, 854×480, scripted keyboard input, software-rendered at roughly 15 fps. The brief asks for 2 minutes; this is shorter and choppier than a capture on real hardware would be.

## Built

Parkour (run, jump with coyote time and buffering, auto-vault, ledge grab, wall-run and wall jump, slide, rail slide, front flip, landing roll), skateboard (push, carve, ollie, kickflip, shove-it, manual with a risk meter, grinds on rails and auto-detected ledge edges, combo multiplier), shopping cart (push, bobsled hop-on, ride with a wobbly wheel, tuck, cart hop, ramming props), flow meter, one-button bail with ragdoll and respawn, chase camera with shake and FOV kick, speed lines, per-surface synthesised sound, keyboard, gamepad and touch.

## Not built

Reduced-motion users get no shake, FOV kick or speed lines; there are no other assist options yet. No Web Worker or ECS (one player does not need them). No CI configuration file, since there is no repository host yet; the tests and capture script are what CI will run.
