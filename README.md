# Assembly Row: Live

A browser game set in a playable reconstruction of Assembly Row, Somerville. The default build is a hand-laid, stylized Assembly Row you can skate, run, cart and kayak around. Add `#lab` to the address for the Milestone 1 grey test room.

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
| Jump to a place | 1 to 5 | | Buttons at the top |
| Launch or leave a kayak | Q at a dock | Y at a dock | Small button at a dock |
| Look | Drag | Right stick | Drag the view |

## Layout

```
src/sim/      deterministic movement simulation, no browser APIs
src/render/   throwaway WebGL2 box renderer for the lab (ADR 0002)
src/          input, sound, and the browser entry point
tests/        physics tests
tools/        build and headless capture
docs/adr/     architecture decision records
reports/      milestone metrics, screenshots, gameplay video
```
