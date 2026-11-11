# Assembly Row: Live

A browser game set in a playable reconstruction of Assembly Row, Somerville. The default build is a hand-laid, stylized Assembly Row with four seasons and four kinds of weather. Skate, run, cart and kayak around it; in the snow, grab a bungee behind a friend's pickup and snowboard the loop, or drive a plow; in the warm months, drive a ride-on mower. Add `#lab` to the address for the Milestone 1 grey test room.

Start with `PLAN.md`.

## Run it

```
npm install
npm run build      # writes dist/index.html, one self-contained page
npm test           # headless physics tests
npm run capture    # headless browser smoke test and screenshots
```

Open `dist/index.html` in a browser.

## Controls

| | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Move | W A S D or arrows | Left stick | Drag the left side |
| Jump, ollie, hop on | Space | A | Big orange button |
| Slide, manual, tuck | Shift or C | B | Second button |
| Air trick | E or F | X | Third button |
| Switch mode (speed is kept) | Q or Tab | Y | Small button |
| Bail | R | LB | Small button |
| Jump to a place | 1 to 7 | | Places menu |
| Grab or drop the bungee, get on or off a mower or plow | Q nearby | Y nearby | Small button nearby |
| Dig an edge on the bungee (release to slingshot) | Shift | B | Second button |
| Seasons and weather | Esc | | Seasons button |
| Launch or leave a kayak | Q at a dock | Y at a dock | Small button at a dock |
| Look | Drag | Right stick | Drag the view |

## Layout

```
src/sim/      deterministic movement simulation, no browser APIs
src/render/   Three.js renderer: instanced meshes, procedural PBR surfaces, sky, shadows, water, post (ADR 0007)
src/          input, sound, and the browser entry point
tests/        physics tests
tools/        build and headless capture
docs/adr/     architecture decision records
reports/      milestone metrics, screenshots, gameplay video
```
