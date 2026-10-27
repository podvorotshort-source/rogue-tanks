'use strict';
// ============================================================
//  TOUCH: управление с телефона — плавающий джойстик слева,
//  кнопки огня и спецприёма справа, пауза и музыка сверху.
//  Жмёт коды Touch* в Input, как будто это ещё одно устройство (см. DEVICES).
// ============================================================

const Touch = {
  on: false, root: null, stick: null, knob: null, stickId: null, ox: 0, oy: 0, dir: -1,
  enable() {
    if (this.on) return;
    this.on = true;
    if (this.root) this.root.style.display = 'block';
  },
  vibrate(ms) {
    if (!this.on || !navigator.vibrate) return;
    try { navigator.vibrate(Math.max(10, Math.round(ms))); } catch (e) { /* не поддерживается */ }
  },
  // размер джойстика от меньшей стороны экрана
  radius() { return clamp(Math.min(innerWidth, innerHeight) * 0.13, 40, 70); },
  setDir(d) {
    if (d === this.dir) return;
    const codes = ['TouchUp', 'TouchRight', 'TouchDown', 'TouchLeft'];
    if (this.dir >= 0) Input.release(codes[this.dir]);
    if (d >= 0) Input.press(codes[d]);
    this.dir = d;
  },
  placeStick(x, y, kx, ky) {
    const r = this.radius();
    Object.assign(this.stick.style, { left: (x - r) + 'px', top: (y - r) + 'px', width: r * 2 + 'px', height: r * 2 + 'px' });
    const k = r * 0.9;
    Object.assign(this.knob.style, { left: (kx - x + r - k / 2) + 'px', top: (ky - y + r - k / 2) + 'px', width: k + 'px', height: k + 'px' });
  },
  restStick() {
    const r = this.radius(), x = r + 24, y = innerHeight - r - 24;
    this.stickId = null;
    this.stick.classList.remove('active');
    this.placeStick(x, y, x, y);
    this.setDir(-1);
  },
  moveStick(x, y) {
    const r = this.radius();
    let dx = x - this.ox, dy = y - this.oy;
    const len = Math.hypot(dx, dy);
    if (len > r) { // база подтягивается за пальцем, чтобы не приходилось возвращаться
      this.ox += dx * (1 - r / len); this.oy += dy * (1 - r / len);
      dx = x - this.ox; dy = y - this.oy;
    }
    this.placeStick(this.ox, this.oy, x, y);
    if (len < r * 0.3) this.setDir(-1);
    else if (Math.abs(dx) > Math.abs(dy)) this.setDir(dx > 0 ? 1 : 3);
    else this.setDir(dy > 0 ? 2 : 0);
  },
  releaseAll() {
    this.restStick();
    for (const b of this.root.querySelectorAll('[data-code]')) { Input.release(b.dataset.code); b.classList.remove('down'); }
  },
  init() {
    const css = document.createElement('style');
    css.textContent = `
      html, body { touch-action: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
      #touch { position: fixed; inset: 0; display: none; pointer-events: none; z-index: 10; font-family: monospace; }
      #touch .zone { position: absolute; left: 0; top: 0; width: 50%; height: 100%; pointer-events: auto; }
      #touch .stick { position: absolute; border-radius: 50%; border: 2px solid rgba(252,252,252,.25); background: rgba(252,252,252,.06); pointer-events: none; }
      #touch .stick.active { border-color: rgba(252,252,252,.45); }
      #touch .knob { position: absolute; border-radius: 50%; background: rgba(252,252,252,.3); }
      #touch .btn { position: absolute; pointer-events: auto; border-radius: 50%; display: flex; align-items: center; justify-content: center;
        color: rgba(252,252,252,.75); font-weight: bold; border: 2px solid rgba(252,252,252,.35); background: rgba(252,252,252,.08); }
      #touch .btn.down { background: rgba(252,252,252,.3); }
      #touch .fire { border-color: rgba(252,120,88,.6); background: rgba(216,40,0,.18); }
      #touch .special { border-color: rgba(60,188,252,.6); background: rgba(0,88,248,.16); }
      #touch .small { border-radius: 8px; }
    `;
    document.head.appendChild(css);

    const root = this.root = document.createElement('div');
    root.id = 'touch';
    root.innerHTML = '<div class="zone"></div><div class="stick"><div class="knob"></div></div>' +
      '<div class="btn fire" data-code="TouchA">●</div><div class="btn special" data-code="TouchB">★</div>' +
      '<div class="btn small" data-code="TouchStart">II</div><div class="btn small" data-code="KeyM">♪</div>';
    document.body.appendChild(root);
    this.stick = root.querySelector('.stick'); this.knob = root.querySelector('.knob');
    const [fire, special, pause, music] = root.querySelectorAll('.btn');

    const layout = () => {
      const m = Math.min(innerWidth, innerHeight);
      const f = clamp(m * 0.2, 64, 110), s = f * 0.72, p = clamp(m * 0.09, 32, 44), g = 24;
      // pos: { right, bottom } или { right, top }
      const sq = (el, size, pos, font) => Object.assign(el.style, { width: size + 'px', height: size + 'px', fontSize: font + 'px' },
        ...Object.entries(pos).map(([k, v]) => ({ [k]: v + 'px' })));
      sq(fire, f, { right: g, bottom: g }, f * 0.4);
      sq(special, s, { right: g + f * 1.05, bottom: g + f * 0.8 }, s * 0.4);
      sq(pause, p, { right: 10, top: 10 }, p * 0.4);
      sq(music, p, { right: 20 + p, top: 10 }, p * 0.45);
      if (this.stickId == null) this.restStick();
    };
    addEventListener('resize', layout);
    layout();

    // кнопки: держим, пока палец на ней
    for (const b of root.querySelectorAll('.btn')) {
      const code = b.dataset.code;
      b.addEventListener('pointerdown', e => {
        e.preventDefault(); Sound.unlock();
        try { b.setPointerCapture(e.pointerId); } catch (err) { /* ок */ }
        Input.press(code); b.classList.add('down');
        if (code === 'TouchA' || code === 'TouchB') this.vibrate(8);
      });
      const up = () => { Input.release(code); b.classList.remove('down'); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    }

    // джойстик появляется там, где коснулись левой половины экрана
    const zone = root.querySelector('.zone');
    zone.addEventListener('pointerdown', e => {
      e.preventDefault(); Sound.unlock();
      if (this.stickId != null) return;
      try { zone.setPointerCapture(e.pointerId); } catch (err) { /* ок */ }
      this.stickId = e.pointerId; this.ox = e.clientX; this.oy = e.clientY;
      this.stick.classList.add('active');
      this.moveStick(e.clientX, e.clientY);
    });
    zone.addEventListener('pointermove', e => { if (e.pointerId === this.stickId) this.moveStick(e.clientX, e.clientY); });
    const end = e => { if (e.pointerId === this.stickId) this.restStick(); };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);

    root.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.releaseAll(); });
    addEventListener('blur', () => this.releaseAll());
    // включаемся на сенсорных экранах сразу, на остальных — при первом касании
    addEventListener('touchstart', () => this.enable(), { passive: true });
    let coarse = false;
    try { coarse = matchMedia('(pointer: coarse)').matches; } catch (e) { /* старый браузер */ }
    if (coarse) this.enable();
  },
};
Touch.init();
