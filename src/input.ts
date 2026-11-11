// Keyboard, gamepad and touch, merged into one control state.
export class Controls {
  sx = 0; sy = 0;
  jump = false; crouch = false; trick = false; switchMode = false; bail = false;
  camDX = 0; camDY = 0;
  touch = false;
  warp = -1;
  onGesture: () => void = () => {};
  onMute: () => void = () => {};
  onMenu: () => void = () => {};
  private keys = new Set<string>();
  /** presses since the last poll, so a tap shorter than one frame still registers */
  private tapped = new Set<string>();
  private btn: Record<string, boolean> = {};
  private stick = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  private drag = { id: -1, x: 0, y: 0 };

  constructor(stage: HTMLElement, stickEl: HTMLElement, nub: HTMLElement) {
    addEventListener('keydown', e => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!e.repeat) {
        const d = /^Digit([1-9])$/.exec(e.code); if (d) this.warp = Number(d[1]) - 1;
        if (e.code === 'KeyM') this.onMute();
        if (e.code === 'Escape') this.onMenu();
      }
      this.keys.add(e.code); if (!e.repeat) this.tapped.add(e.code); this.onGesture();
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    for (const el of Array.from(stage.querySelectorAll<HTMLElement>('[data-btn]'))) {
      const name = el.dataset.btn!;
      const set = (v: boolean) => { this.btn[name] = v; if (v) this.tapped.add('btn:' + name); el.classList.toggle('down', v); };
      el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture(e.pointerId); set(true); this.onGesture(); });
      for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(t, () => set(false));
      el.addEventListener('contextmenu', e => e.preventDefault());
    }

    stickEl.addEventListener('pointerdown', e => {
      e.preventDefault(); this.setTouch(e); stickEl.setPointerCapture(e.pointerId);
      const s = this.stick; s.id = e.pointerId; s.ox = e.clientX; s.oy = e.clientY; s.x = s.y = 0;
      const r = stickEl.getBoundingClientRect();
      nub.style.left = (e.clientX - r.left) + 'px'; nub.style.top = (e.clientY - r.top) + 'px'; nub.hidden = false; nub.style.transform = 'translate(-50%,-50%)';
      this.onGesture();
    });
    stickEl.addEventListener('pointermove', e => {
      const s = this.stick; if (e.pointerId !== s.id) return;
      let dx = (e.clientX - s.ox) / 56, dy = (e.clientY - s.oy) / 56; const m = Math.hypot(dx, dy);
      if (m > 1) { dx /= m; dy /= m; }
      s.x = dx; s.y = -dy;
      nub.style.transform = `translate(calc(-50% + ${dx * 56}px), calc(-50% + ${dy * 56}px))`;
    });
    const end = (e: PointerEvent) => { if (e.pointerId === this.stick.id) { this.stick.id = -1; this.stick.x = this.stick.y = 0; nub.hidden = true; } };
    stickEl.addEventListener('pointerup', end); stickEl.addEventListener('pointercancel', end);

    const cv = stage.querySelector('canvas')!;
    cv.addEventListener('pointerdown', e => { this.setTouch(e); this.drag.id = e.pointerId; this.drag.x = e.clientX; this.drag.y = e.clientY; cv.setPointerCapture(e.pointerId); this.onGesture(); });
    cv.addEventListener('pointermove', e => {
      if (e.pointerId !== this.drag.id) return;
      this.camDX += e.clientX - this.drag.x; this.camDY += e.clientY - this.drag.y; this.drag.x = e.clientX; this.drag.y = e.clientY;
    });
    const dend = (e: PointerEvent) => { if (e.pointerId === this.drag.id) this.drag.id = -1; };
    cv.addEventListener('pointerup', dend); cv.addEventListener('pointercancel', dend);
  }

  private setTouch(e: PointerEvent) { if (e.pointerType === 'touch' && !this.touch) { this.touch = true; document.documentElement.classList.add('touch'); } }

  poll() {
    const k = this.keys, b = this.btn, tp = this.tapped;
    let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let jump = k.has('Space') || !!b.jump || tp.has('Space') || tp.has('btn:jump'), crouch = k.has('ShiftLeft') || k.has('ShiftRight') || k.has('KeyC') || !!b.crouch;
    let trick = k.has('KeyE') || k.has('KeyF') || !!b.trick || tp.has('KeyE') || tp.has('btn:trick'), sw = k.has('KeyQ') || k.has('Tab') || !!b.switch || tp.has('KeyQ') || tp.has('Tab') || tp.has('btn:switch'), bail = k.has('KeyR') || !!b.bail || tp.has('KeyR') || tp.has('btn:bail');
    tp.clear();
    if (this.stick.id >= 0) { x = this.stick.x; y = this.stick.y; }
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const g of pads) {
      if (!g || !g.connected) continue;
      const dz = (v: number) => Math.abs(v) < 0.18 ? 0 : v;
      const gx = dz(g.axes[0] || 0), gy = dz(g.axes[1] || 0);
      if (gx || gy) { x = gx; y = -gy; }
      this.camDX += dz(g.axes[2] || 0) * 9; this.camDY += dz(g.axes[3] || 0) * 5;
      const p = (i: number) => !!(g.buttons[i] && g.buttons[i].pressed);
      jump = jump || p(0); crouch = crouch || p(1) || p(7); trick = trick || p(2); sw = sw || p(3); bail = bail || p(4);
      break;
    }
    const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    this.sx = x; this.sy = y; this.jump = jump; this.crouch = crouch; this.trick = trick; this.switchMode = sw; this.bail = bail;
  }
}
