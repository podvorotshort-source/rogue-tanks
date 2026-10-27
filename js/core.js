'use strict';
// ============================================================
//  CORE: константы, утилиты, ввод, звук, музыка, пиксельный шрифт
// ============================================================

const BUILD = 7; // номер сборки: показывается в меню, совпадает с ?v= в index.html
const W = 384, H = 256, HUD_H = 16;
const CELL = 8, COLS = 48, ROWS = 30;          // игровое поле в клетках 8x8
const FW = COLS * CELL, FH = ROWS * CELL;      // 384 x 240
const BLK = 16, BCOLS = 24, BROWS = 15;        // блоки 16x16 (размер танка)
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];  // 0 вверх, 1 вправо, 2 вниз, 3 влево

const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

function fitCanvas() {
  let s = Math.min(innerWidth / W, innerHeight / H);
  if (s >= 3) s = Math.floor(s); // на больших экранах — целый масштаб, на маленьких — во всё окно
  canvas.style.width = Math.floor(W * s) + 'px';
  canvas.style.height = Math.floor(H * s) + 'px';
}
addEventListener('resize', fitCanvas);
fitCanvas();

// ---------- утилиты ----------
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const lerp = (a, b, t) => a + (b - a) * t;
const overlap = (ax, ay, aw, ah, bx, by, bw, bh) => ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function weighted(obj) {
  let sum = 0; for (const k in obj) sum += Math.max(0, obj[k]);
  let r = Math.random() * sum;
  for (const k in obj) { r -= Math.max(0, obj[k]); if (r <= 0) return k; }
  return Object.keys(obj)[0];
}
function mk(w, h, readback) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', readback ? { willReadFrequently: true } : undefined);
  g.imageSmoothingEnabled = false;
  return c;
}
function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }

// ---------- рисование примитивов ----------
function rect(g, x, y, w, h, col) { g.fillStyle = col; g.fillRect(x, y, w, h); }
function disc(g, cx, cy, r, col) {
  g.fillStyle = col; r = Math.round(r); cx = Math.round(cx); cy = Math.round(cy);
  for (let dy = -r; dy <= r; dy++) {
    const dx = Math.round(Math.sqrt(r * r - dy * dy));
    g.fillRect(cx - dx, cy + dy, dx * 2 + 1, 1);
  }
}
function circle(g, cx, cy, r, col, step = 1) {
  g.fillStyle = col; cx = Math.round(cx); cy = Math.round(cy);
  const n = Math.max(8, Math.ceil(r * 6.3 / step));
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    g.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1);
  }
}
function pline(g, x0, y0, x1, y1, col, w = 1) {
  g.fillStyle = col;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  const o = Math.floor(w / 2);
  for (let i = 0; i <= n; i++) g.fillRect(Math.round(x0 + (x1 - x0) * i / n) - o, Math.round(y0 + (y1 - y0) * i / n) - o, w, w);
}

// ============================================================
//  ВВОД (клавиатура + геймпады)
// ============================================================
const Input = {
  down: Object.create(null), pressed: Object.create(null), stamp: Object.create(null), seq: 0,
  press(code) { if (!this.down[code]) { this.pressed[code] = true; this.stamp[code] = ++this.seq; } this.down[code] = true; },
  release(code) { this.down[code] = false; },
  any(codes) { for (const c of codes) if (this.down[c]) return true; return false; },
  hit(codes) { for (const c of codes) if (this.pressed[c]) return true; return false; },
  endStep() { this.pressed = Object.create(null); },
  // подключённые геймпады по порядку подключения: pads[i] даёт коды PadI*
  pads: [],
  pollPads() {
    let raw = [];
    try { raw = navigator.getGamepads ? Array.from(navigator.getGamepads()) : []; } catch (e) { /* нет API */ }
    const pads = raw.filter(p => p && p.connected).sort((a, b) => a.index - b.index);
    this.pads = pads;
    for (let i = 0; i < MAX_PADS; i++) {
      const st = pads[i] ? readPad(pads[i]) : {};
      if (st.any) Sound.unlock();
      for (const k of ['Up', 'Down', 'Left', 'Right', 'A', 'B', 'Y', 'Start']) {
        const code = 'Pad' + i + k;
        if (st[k]) this.press(code); else if (this.down[code]) this.release(code);
      }
    }
  },
  rumble(slot, strong = 0.6, weak = 0.4, ms = 180) {
    const a = this.pads[slot] && this.pads[slot].vibrationActuator;
    if (!a || !a.playEffect) return;
    try { const r = a.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }); if (r && r.catch) r.catch(() => {}); } catch (e) { /* не поддерживается */ }
  },
};
// Стандартная раскладка (Chrome/Edge): 0 крест, 1 круг, 2 квадрат, 3 треугольник, 4/5 L1/R1, 6/7 L2/R2, 9 Options, 12-15 крестовина.
// Нестандартная (Firefox, DirectInput): 0 квадрат, 1 крест, 2 круг, 3 треугольник, крестовина — ось 9.
function readPad(p) {
  const b = n => { const x = p.buttons[n]; return !!(x && (x.pressed || x.value > 0.5)); };
  const ax = p.axes;
  let up = ax[1] < -0.5, down = ax[1] > 0.5, left = ax[0] < -0.5, right = ax[0] > 0.5;
  const std = p.mapping === 'standard';
  if (std) { up = up || b(12); down = down || b(13); left = left || b(14); right = right || b(15); }
  else if (ax.length > 9 && ax[9] >= -1.05 && ax[9] <= 1.05) {
    const k = Math.round((ax[9] + 1) * 3.5); // 0 вверх, 2 вправо, 4 вниз, 6 влево
    up = up || k === 7 || k <= 1; right = right || (k >= 1 && k <= 3); down = down || (k >= 3 && k <= 5); left = left || (k >= 5 && k <= 7);
  }
  const st = std
    ? { A: b(0) || b(5) || b(7), B: b(1) || b(2) || b(4) || b(6), Y: b(3), Start: b(9) }
    : { A: b(1) || b(5) || b(7), B: b(0) || b(2) || b(4) || b(6), Y: b(3), Start: b(9) };
  Object.assign(st, { Up: up, Down: down, Left: left, Right: right });
  st.any = p.buttons.some(x => x && x.pressed);
  return st;
}
function padName(p) {
  const id = (p.id || '').toLowerCase();
  if (/0ce6|0df2|dualsense/.test(id)) return 'DUALSENSE';
  if (/05c4|09cc|0ba0|dualshock/.test(id)) return 'DUALSHOCK 4';
  if (/xbox|xinput|045e/.test(id)) return 'XBOX';
  return tr('ГЕЙМПАД');
}
const PREVENT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter', 'Tab', 'Backspace', 'NumpadEnter']);
addEventListener('keydown', e => {
  if (PREVENT.has(e.code)) e.preventDefault();
  Sound.unlock();
  if (e.repeat) return;
  Input.press(e.code);
});
addEventListener('keyup', e => Input.release(e.code));
addEventListener('blur', () => { for (const k in Input.down) Input.down[k] = false; });
addEventListener('mousedown', () => Sound.unlock());
addEventListener('touchend', () => Sound.unlock()); // iOS разрешает звук только по окончании касания

// Устройства управления: три раскладки на клавиатуре и до 4 геймпадов.
// На экране выбора танка каждое устройство «входит» в игру нажатием огня и занимает свободный слот 1P/2P/3P.
const DEVICES = [
  { name: 'WASD', up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], fire: ['Space'], special: ['KeyE', 'KeyF'] },
  { name: 'СТРЕЛКИ', up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], fire: ['Enter', 'KeyL'], special: ['KeyK', 'ControlRight'] },
  { name: 'NUMPAD', up: ['Numpad8'], down: ['Numpad5', 'Numpad2'], left: ['Numpad4'], right: ['Numpad6'], fire: ['Numpad0'], special: ['NumpadEnter', 'NumpadDecimal'] },
  // экранные джойстик и кнопки на телефоне (js/touch.js)
  { touch: true, name: 'СЕНСОР', up: ['TouchUp'], down: ['TouchDown'], left: ['TouchLeft'], right: ['TouchRight'], fire: ['TouchA'], special: ['TouchB'] },
];
const MAX_PADS = 4;
for (let i = 0; i < MAX_PADS; i++) {
  const P = 'Pad' + i;
  DEVICES.push({ pad: i, name: 'ГЕЙМПАД ' + (i + 1), up: [P + 'Up'], down: [P + 'Down'], left: [P + 'Left'], right: [P + 'Right'], fire: [P + 'A'], special: [P + 'B'] });
}
const devName = d => d.net != null ? Net.guestName(d.net) : (d.pad != null && Input.pads[d.pad]) ? padName(Input.pads[d.pad]) : d.pad != null ? tr('ГЕЙМПАД') + ' ' + (d.pad + 1) : tr(d.name);
// все местные устройства разом: одиночная игра и меню (онлайн-гости меню хоста не листают)
const ALL_CTRL = { name: 'ЛЮБОЕ' };
for (const k of ['up', 'down', 'left', 'right', 'fire', 'special']) ALL_CTRL[k] = DEVICES.flatMap(d => d[k]);
const PAD_STARTS = DEVICES.filter(d => d.pad != null).map(d => 'Pad' + d.pad + 'Start');
// онлайн-гости (js/net.js): их кнопки приходят по сети как коды NetI*
const MAX_PLAYERS = 6, MAX_GUESTS = 5;
for (let i = 0; i < MAX_GUESTS; i++) {
  const P = 'Net' + i;
  DEVICES.push({ net: i, name: 'ОНЛАЙН ' + (i + 1), up: [P + 'Up'], down: [P + 'Down'], left: [P + 'Left'], right: [P + 'Right'], fire: [P + 'A'], special: [P + 'B'] });
}
const KEYS_BACK = ['Escape', 'Backspace', 'TouchStart', ...PAD_STARTS];
const KEYS_PAUSE = ['Escape', 'KeyP', 'TouchStart', ...PAD_STARTS, ...Array.from({ length: MAX_GUESTS }, (_, i) => 'Net' + i + 'Start')];

function ctrlDir(c) {
  let best = -1, bs = -1;
  const lists = [c.up, c.right, c.down, c.left];
  for (let d = 0; d < 4; d++) for (const code of lists[d]) if (Input.down[code] && Input.stamp[code] > bs) { bs = Input.stamp[code]; best = d; }
  return best;
}
// для меню: нажатия с любого устройства
const anyCtrl = key => Input.hit(ALL_CTRL[key]);

// ============================================================
//  ЗВУК (WebAudio, 8-битные осцилляторы + шум)
// ============================================================
const Sound = {
  ac: null, master: null, sfx: null, mus: null, noiseBuf: null, last: {}, musicOn: true,
  unlock() {
    try {
      if (!this.ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ac = new AC();
        this.master = this.ac.createGain(); this.master.gain.value = 0.55; this.master.connect(this.ac.destination);
        this.sfx = this.ac.createGain(); this.sfx.gain.value = 0.7; this.sfx.connect(this.master);
        this.mus = this.ac.createGain(); this.mus.gain.value = 0.32; this.mus.connect(this.master);
        const len = this.ac.sampleRate;
        this.noiseBuf = this.ac.createBuffer(1, len, this.ac.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ac.state === 'suspended') this.ac.resume();
    } catch (e) { /* без звука */ }
  },
  tone(f, dur, o = {}) {
    const ac = this.ac; if (!ac) return;
    const t = o.at != null ? o.at : ac.currentTime + (o.delay || 0);
    const osc = ac.createOscillator(), g = ac.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    g.gain.setValueAtTime(o.vol != null ? o.vol : 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(o.dest || this.sfx);
    osc.start(t); osc.stop(t + dur + 0.02);
  },
  noise(dur, o = {}) {
    const ac = this.ac; if (!ac) return;
    const t = o.at != null ? o.at : ac.currentTime + (o.delay || 0);
    const s = ac.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = ac.createBiquadFilter(); f.type = o.filter || 'lowpass';
    f.frequency.setValueAtTime(o.freq || 2000, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(o.vol != null ? o.vol : 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(o.dest || this.sfx);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  },
  play(name) {
    if (!this.ac) return;
    const now = performance.now();
    if (this.last[name] && now - this.last[name] < 45) return;
    this.last[name] = now;
    switch (name) {
      case 'shoot': this.tone(620, 0.08, { to: 160, vol: 0.1 }); this.noise(0.05, { vol: 0.07, freq: 4000 }); break;
      case 'eshoot': this.tone(330, 0.07, { to: 120, vol: 0.05 }); break;
      case 'cannon': this.tone(160, 0.25, { to: 40, vol: 0.2, type: 'triangle' }); this.noise(0.25, { vol: 0.2, freq: 1500, to: 100 }); break;
      case 'hit': this.noise(0.08, { vol: 0.14, freq: 1600, to: 300 }); break;
      case 'brick': this.noise(0.07, { vol: 0.1, freq: 900, to: 200 }); break;
      case 'steel': this.tone(1500, 0.05, { vol: 0.06, to: 1000 }); break;
      case 'boom': this.noise(0.45, { vol: 0.3, freq: 1200, to: 60 }); this.tone(110, 0.3, { type: 'triangle', vol: 0.28, to: 30 }); break;
      case 'bigboom': this.noise(1.3, { vol: 0.45, freq: 900, to: 40 }); this.tone(80, 1.0, { type: 'triangle', vol: 0.4, to: 20 }); break;
      case 'hurt': this.tone(320, 0.25, { to: 60, vol: 0.16 }); this.noise(0.2, { vol: 0.14, freq: 800 }); break;
      case 'pickup': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.09, { vol: 0.09, delay: i * 0.06 })); break;
      case 'select': this.tone(880, 0.05, { vol: 0.07 }); break;
      case 'confirm': this.tone(660, 0.06, { vol: 0.09 }); this.tone(990, 0.12, { vol: 0.09, delay: 0.06 }); break;
      case 'deny': this.tone(140, 0.15, { vol: 0.1 }); break;
      case 'spawn': this.tone(220, 0.18, { to: 700, vol: 0.03, type: 'triangle' }); break;
      case 'warn': for (let i = 0; i < 4; i++) { this.tone(440, 0.18, { vol: 0.1, delay: i * 0.4 }); this.tone(330, 0.18, { vol: 0.1, delay: i * 0.4 + 0.2 }); } break;
      case 'laser': this.tone(900, 0.5, { to: 200, vol: 0.07, type: 'sawtooth' }); this.noise(0.5, { vol: 0.08, freq: 3000 }); break;
      case 'charge': this.tone(120, 1.0, { to: 1400, vol: 0.05, type: 'sawtooth' }); break;
      case 'special': this.tone(300, 0.2, { to: 1200, vol: 0.09 }); break;
      case 'dash': this.noise(0.2, { vol: 0.12, freq: 3000, to: 500, filter: 'bandpass' }); break;
      case 'shield': this.tone(400, 0.3, { to: 800, vol: 0.06, type: 'triangle' }); this.tone(600, 0.3, { to: 1200, vol: 0.04, type: 'triangle', delay: 0.05 }); break;
      case 'freeze': [1200, 900, 1200, 900].forEach((f, i) => this.tone(f, 0.06, { vol: 0.06, delay: i * 0.05 })); break;
      case 'revive': [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.12, { vol: 0.08, delay: i * 0.07 })); break;
      case 'clear': [523, 523, 523, 659, 784, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.14, { vol: 0.08, delay: i * 0.11 })); break;
      case 'gameover': [392, 370, 349, 330, 311, 294, 262].forEach((f, i) => this.tone(f, 0.25, { vol: 0.09, delay: i * 0.18, type: 'triangle' })); break;
      case 'beep': this.tone(1000, 0.05, { vol: 0.06 }); break;
      case 'mortar': this.tone(500, 0.6, { to: 120, vol: 0.04, type: 'triangle' }); break;
      case 'missile': this.noise(0.3, { vol: 0.08, freq: 2500, to: 800, filter: 'bandpass' }); break;
      case 'roar': this.tone(70, 0.8, { to: 40, vol: 0.25, type: 'sawtooth' }); this.noise(0.8, { vol: 0.15, freq: 600, to: 100 }); break;
      case 'zap': this.tone(1800, 0.09, { to: 300, type: 'sawtooth', vol: 0.05 }); this.noise(0.06, { vol: 0.06, freq: 6000, filter: 'highpass' }); break;
      case 'ice': [1800, 2400, 3000].forEach((f, i) => this.tone(f, 0.05, { vol: 0.04, delay: i * 0.03, type: 'triangle' })); this.noise(0.1, { vol: 0.08, freq: 5000, filter: 'highpass' }); break;
      case 'mine': this.tone(700, 0.04, { vol: 0.05 }); this.tone(500, 0.04, { vol: 0.05, delay: 0.05 }); break;
      case 'mg': this.noise(0.04, { vol: 0.06, freq: 3500 }); this.tone(900, 0.03, { to: 500, vol: 0.03 }); break;
    }
  },
};

// ============================================================
//  МУЗЫКА (простой чиптюн-секвенсор)
// ============================================================
const midi = n => 440 * Math.pow(2, (n - 69) / 12);
const Music = {
  track: null, name: '', step: 0, next: 0,
  tracks: {
    title: {
      dt: 0.14,
      chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]],
      bass: [0, null, null, null, 12, null, null, null, 0, null, null, null, 7, null, 12, null],
      arp: [0, 1, 2, 4, 2, 1, 0, 1, 2, 4, 5, 4, 2, 1, 2, 1],
      drums: [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    },
    main: {
      dt: 0.115,
      chords: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]],
      bass: [0, null, 12, null, 0, 0, 12, null, 0, null, 12, null, 0, 7, 12, null],
      arp: [0, 1, 2, 1, 0, 1, 2, 1, 0, 1, 2, 4, 2, 1, 2, 1],
      drums: ['k', null, 'h', null, 's', null, 'h', null, 'k', 'k', 'h', null, 's', null, 'h', 'h'],
      lead: [
        69, null, 72, null, 76, null, 74, 72, 71, null, 72, null, 69, null, null, null,
        65, null, 69, null, 72, null, 74, 72, 69, null, 72, null, 77, null, 76, null,
        67, null, 71, null, 74, null, 76, 74, 72, null, 71, null, 67, null, null, null,
        64, null, 67, null, 71, null, 72, 71, 69, null, 67, null, 71, null, null, null,
      ],
    },
    boss: {
      dt: 0.095,
      chords: [[52, 55, 59], [53, 57, 60], [52, 55, 59], [51, 54, 57]],
      bass: [0, 0, 12, 0, 0, 12, 0, 0, 0, 0, 12, 0, 1, 1, 13, 1],
      arp: [0, 2, 4, 2, 0, 2, 5, 2, 0, 2, 4, 2, 1, 3, 5, 3],
      drums: ['k', 'h', 'h', 'h', 's', 'h', 'k', 'h', 'k', 'h', 'k', 'h', 's', 'h', 's', 's'],
    },
  },
  play(name) {
    if (this.name === name) return;
    this.name = name; this.track = this.tracks[name] || null; this.step = 0;
    if (Sound.ac) this.next = Sound.ac.currentTime + 0.05;
  },
  stop() { this.name = ''; this.track = null; },
  update() {
    const ac = Sound.ac;
    if (!ac || !this.track || !Sound.musicOn) return;
    if (this.next < ac.currentTime) this.next = ac.currentTime + 0.05;
    while (this.next < ac.currentTime + 0.25) { this.playStep(this.next); this.next += this.track.dt; this.step++; }
  },
  playStep(t) {
    const tr = this.track, s = this.step % 16, bar = Math.floor(this.step / 16) % tr.chords.length;
    const ch = tr.chords[bar], dest = Sound.mus, dt = tr.dt;
    const b = tr.bass[s];
    if (b != null) Sound.tone(midi(ch[0] - 24 + b), dt * 0.9, { type: 'triangle', vol: 0.35, at: t, dest });
    const a = tr.arp[s];
    if (a != null) { const n = ch[a % 3] + 12 * Math.floor(a / 3); Sound.tone(midi(n + 12), dt * 0.7, { type: 'square', vol: 0.045, at: t, dest }); }
    const d = tr.drums[s];
    if (d === 'k') Sound.tone(150, 0.1, { to: 40, type: 'triangle', vol: 0.4, at: t, dest });
    else if (d === 'h') Sound.noise(0.03, { vol: 0.05, freq: 7000, filter: 'highpass', at: t, dest });
    else if (d === 's') Sound.noise(0.12, { vol: 0.14, freq: 2500, at: t, dest });
    if (tr.lead && Math.floor(this.step / 64) % 2 === 1) {
      const n = tr.lead[this.step % 64];
      if (n != null) Sound.tone(midi(n + 12), dt * 1.6, { type: 'square', vol: 0.05, at: t, dest });
    }
  },
};

// ============================================================
//  ПИКСЕЛЬНЫЙ ШРИФТ 5x7 (латиница + кириллица)
// ============================================================
const GLYPHS = {
  'A': '.###. #...# #...# ##### #...# #...# #...#', 'B': '####. #...# #...# ####. #...# #...# ####.',
  'C': '.###. #...# #.... #.... #.... #...# .###.', 'D': '###.. #..#. #...# #...# #...# #..#. ###..',
  'E': '##### #.... #.... ####. #.... #.... #####', 'F': '##### #.... #.... ####. #.... #.... #....',
  'G': '.###. #...# #.... #.### #...# #...# .####', 'H': '#...# #...# #...# ##### #...# #...# #...#',
  'I': '.###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.', 'J': '..### ...#. ...#. ...#. ...#. #..#. .##..',
  'K': '#...# #..#. #.#.. ##... #.#.. #..#. #...#', 'L': '#.... #.... #.... #.... #.... #.... #####',
  'M': '#...# ##.## #.#.# #.#.# #...# #...# #...#', 'N': '#...# #...# ##..# #.#.# #..## #...# #...#',
  'O': '.###. #...# #...# #...# #...# #...# .###.', 'P': '####. #...# #...# ####. #.... #.... #....',
  'Q': '.###. #...# #...# #...# #.#.# #..#. .##.#', 'R': '####. #...# #...# ####. #.#.. #..#. #...#',
  'S': '.#### #.... #.... .###. ....# ....# ####.', 'T': '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
  'U': '#...# #...# #...# #...# #...# #...# .###.', 'V': '#...# #...# #...# #...# #...# .#.#. ..#..',
  'W': '#...# #...# #...# #.#.# #.#.# #.#.# .#.#.', 'X': '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
  'Y': '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..', 'Z': '##### ....# ...#. ..#.. .#... #.... #####',
  '0': '.###. #...# #..## #.#.# ##..# #...# .###.', '1': '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
  '2': '.###. #...# ....# ...#. ..#.. .#... #####', '3': '##### ...#. ..#.. ...#. ....# #...# .###.',
  '4': '...#. ..##. .#.#. #..#. ##### ...#. ...#.', '5': '##### #.... ####. ....# ....# #...# .###.',
  '6': '..##. .#... #.... ####. #...# #...# .###.', '7': '##### ....# ...#. ..#.. .#... .#... .#...',
  '8': '.###. #...# #...# .###. #...# #...# .###.', '9': '.###. #...# #...# .#### ....# ...#. .##..',
  'Б': '##### #.... #.... ####. #...# #...# ####.', 'Г': '##### #.... #.... #.... #.... #.... #....',
  'Д': '..##. .#.#. .#.#. .#.#. .#.#. ##### #...#', 'Ж': '#.#.# #.#.# .###. ..#.. .###. #.#.# #.#.#',
  'З': '.###. #...# ....# ..##. ....# #...# .###.', 'И': '#...# #...# #..## #.#.# ##..# #...# #...#',
  'Й': '.#.#. ..#.. #...# #..## #.#.# ##..# #...#', 'Л': '..### .#..# .#..# .#..# .#..# .#..# #...#',
  'П': '##### #...# #...# #...# #...# #...# #...#', 'У': '#...# #...# #...# .#### ....# ....# .###.',
  'Ф': '..#.. .###. #.#.# #.#.# .###. ..#.. ..#..', 'Ц': '#..#. #..#. #..#. #..#. #..#. ##### ....#',
  'Ч': '#...# #...# #...# .#### ....# ....# ....#', 'Ш': '#.#.# #.#.# #.#.# #.#.# #.#.# #.#.# #####',
  'Щ': '#.#.# #.#.# #.#.# #.#.# #.#.# ##### ....#', 'Ъ': '##... .#... .#... .###. .#..# .#..# .###.',
  'Ы': '#...# #...# #...# ##..# #.#.# #.#.# ##..#', 'Ь': '#.... #.... #.... ####. #...# #...# ####.',
  'Э': '.###. #...# ....# ..### ....# #...# .###.', 'Ю': '#..#. #.#.# #.#.# ###.# #.#.# #.#.# #..#.',
  'Я': '.#### #...# #...# .#### ..#.# .#..# #...#',
  '.': '..... ..... ..... ..... ..... .##.. .##..', ',': '..... ..... ..... ..... .##.. ..#.. .#...',
  '!': '..#.. ..#.. ..#.. ..#.. ..#.. ..... ..#..', '?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
  ':': '..... .##.. .##.. ..... .##.. .##.. .....', '-': '..... ..... ..... .###. ..... ..... .....',
  '+': '..... ..#.. ..#.. ##### ..#.. ..#.. .....', '/': '..... ....# ...#. ..#.. .#... #.... .....',
  '%': '##... ##..# ...#. ..#.. .#... #..## ...##', '(': '...#. ..#.. .#... .#... .#... ..#.. ...#.',
  ')': '.#... ..#.. ...#. ...#. ...#. ..#.. .#...', '<': '...#. ..#.. .#... #.... .#... ..#.. ...#.',
  '>': '.#... ..#.. ...#. ....# ...#. ..#.. .#...', '*': '..... #.#.# .###. ##### .###. #.#.# .....',
  '=': '..... ..... ##### ..... ##### ..... .....', '[': '.###. .#... .#... .#... .#... .#... .###.',
  ']': '.###. ...#. ...#. ...#. ...#. ...#. .###.', "'": '..#.. ..#.. ..... ..... ..... ..... .....',
  '"': '.#.#. .#.#. ..... ..... ..... ..... .....', '_': '..... ..... ..... ..... ..... ..... #####',
  '↑': '..#.. .###. #.#.# ..#.. ..#.. ..#.. ..#..', '↓': '..#.. ..#.. ..#.. ..#.. #.#.# .###. ..#..',
  '←': '..... ..#.. .#... ##### .#... ..#.. .....', '→': '..... ..#.. ...#. ##### ...#. ..#.. .....',
  '♥': '..... .#.#. ##### ##### .###. ..#.. .....', '×': '..... #...# .#.#. ..#.. .#.#. #...# .....',
  '#': '.#.#. ##### .#.#. .#.#. .#.#. ##### .#.#.', '•': '..... ..... .###. .###. .###. ..... .....',
  '|': '..#.. ..#.. ..#.. ..#.. ..#.. ..#.. ..#..', '\\': '..... #.... .#... ..#.. ...#. ....# .....',
  // пиктограммы карт улучшений
  '♨': '..#.. ..#.. .###. .###. ##.## ##.## .###.', '❄': '..#.. #.#.# .###. ##.## .###. #.#.# ..#..',
  '⚡': '...## ..##. .##.. ##### ..##. .##.. ##...', '⌖': '..#.. .#.#. #...# ##.## #...# .#.#. ..#..',
  '●': '..#.. .###. ##### ##### ##### .###. ..#..', '▲': '..#.. .###. .###. .###. .###. ##### #.#.#',
  '◆': '..... #...# .###. .#.#. .###. #...# .....', '▌': '##### ##### ..#.. .###. .###. .###. .###.',
  '≡': '..... ####. ..... ##### ..... ####. .....', '⌛': '##### .#.#. ..#.. ..#.. .#.#. .###. #####',
  '∴': '..#.. ..... #...# ..... ..#.. #...# .....',
};
const GLYPH_ALIAS = { 'А': 'A', 'В': 'B', 'Е': 'E', 'Ё': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X' };
const FONT = {};
for (const k in GLYPHS) FONT[k] = GLYPHS[k].split(' ');
const glyphCache = new Map();
function glyph(ch, color) {
  const key = ch + color;
  let c = glyphCache.get(key);
  if (c === undefined) {
    const rows = FONT[GLYPH_ALIAS[ch] || ch];
    if (!rows) { glyphCache.set(key, null); return null; }
    c = mk(5, 7);
    const g = c.getContext('2d'); g.fillStyle = color;
    for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) if (rows[y][x] === '#') g.fillRect(x, y, 1, 1);
    glyphCache.set(key, c);
  }
  return c;
}
const textWidth = (s, scale = 1) => { s = String(s); return s.length ? (s.length * 6 - 1) * scale : 0; };
function text(s, x, y, color = '#fcfcfc', scale = 1, align = 'left', shadow = null, g = ctx) {
  s = tr(String(s)).toUpperCase();
  const w = textWidth(s, scale);
  if (align === 'center') x = Math.round(x - w / 2); else if (align === 'right') x = Math.round(x - w);
  if (shadow) text(s, x + scale, y + scale, shadow, scale, 'left', null, g);
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]; if (ch === ' ') continue;
    const gl = glyph(ch, color);
    if (gl) g.drawImage(gl, x + i * 6 * scale, y, 5 * scale, 7 * scale);
  }
  return w;
}
function wrap(s, maxChars) {
  const lines = []; let cur = '';
  for (const w of tr(String(s)).split(' ')) {
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// хранилище рекордов (может быть недоступно)
const Store = {
  get(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
};
