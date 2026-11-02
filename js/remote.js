'use strict';
// ============================================================
//  REMOTE: экран хоста у гостя без видео.
//  Хост записывает каждую команду рисования (drawImage, fillRect, ...) и шлёт
//  гостю; гость повторяет их на своём холсте — картинка такая же чёткая, как у хоста.
//  Картинки-источники (спрайты, слои уровня) уходят один раз, при первом
//  использовании, снимком пикселей; дальше — только команды, которые их меняют.
//  Текст, круги и эллипсы уходят одной командой, а не сотней fillRect.
//  Снимки идут надёжным каналом 'scr' (номер seq), кадры — каналом без повторов
//  'frm'; кадр помнит, какой seq ему нужен, и ждёт его, если снимки отстали.
//  Свой танк гость рисует сразу там, куда уже нажал (Pred), не дожидаясь хоста.
// ============================================================

const REM_M = ['drawImage', 'fillRect', 'clearRect', 'strokeRect', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo',
  'ellipse', 'rect', 'fill', 'stroke', 'clip', 'save', 'restore', 'translate', 'rotate', 'scale', 'setTransform', 'resetTransform',
  'transform', 'quadraticCurveTo', 'bezierCurveTo', 'fillText', 'strokeText', 'roundRect'];
const REM_P = ['fillStyle', 'strokeStyle', 'globalAlpha', 'globalCompositeOperation', 'lineWidth', 'imageSmoothingEnabled',
  'font', 'textAlign', 'textBaseline', 'lineCap', 'lineJoin'];
const REM_MAC = ['disc', 'ellipse', 'text'];                 // функции рисования, которые гость повторяет сам целиком
const OP_PROP = 64, OP_TGT = 120, OP_SNAP = 121, OP_STATE = 122, OP_PAT = 123, OP_MARK = 124, OP_FREE = 125, OP_RESET = 126, OP_MAC = 127;
const REM_CHUNK = 16000;                                     // больше за раз надёжный канал может не принять
const REM_RAW = 1024;                                        // меньше — шлём без сжатия: сжатие тоже стоит времени
const REM_FRM_MAX = 200000;                                  // кадр больше — не шлём каналом без повторов

// ---------- двоичная запись / чтение ----------
const remEnc = new TextEncoder(), remDec = new TextDecoder();
class RemW {
  constructor() { this.u = new Uint8Array(1 << 16); this.dv = new DataView(this.u.buffer); this.n = 0; this.tgt = -1; }
  room(k) {
    if (this.n + k <= this.u.length) return;
    const u = new Uint8Array(Math.max(this.u.length * 2, this.n + k)); u.set(this.u.subarray(0, this.n));
    this.u = u; this.dv = new DataView(u.buffer);
  }
  b(x) { this.room(1); this.u[this.n++] = x; }
  v(x) { this.room(5); x >>>= 0; while (x > 127) { this.u[this.n++] = (x & 127) | 128; x >>>= 7; } this.u[this.n++] = x; }
  i(x) { this.v((x << 1) ^ (x >> 31)); }
  f(x) { this.room(4); this.dv.setFloat32(this.n, x, true); this.n += 4; }
  s(str) {
    let ascii = true;
    for (let k = 0; k < str.length; k++) if (str.charCodeAt(k) > 127) { ascii = false; break; }
    if (ascii) { this.v(str.length); this.room(str.length); for (let k = 0; k < str.length; k++) this.u[this.n++] = str.charCodeAt(k); return; }
    const e = remEnc.encode(str); this.v(e.length); this.bytes(e);
  }
  bytes(a) { this.room(a.length); this.u.set(a, this.n); this.n += a.length; }
  clear() { this.n = 0; this.tgt = -1; }
  take() { const r = this.u.slice(0, this.n); this.clear(); return r; }
}
class RemR {
  constructor(u) { this.u = u; this.n = 0; this.dv = new DataView(u.buffer, u.byteOffset, u.byteLength); }
  b() { return this.u[this.n++]; }
  v() { let x = 0, s = 0, c; do { c = this.u[this.n++]; x += (c & 127) * 2 ** s; s += 7; } while (c & 128); return x; }
  i() { const x = this.v(); return x % 2 ? -(x + 1) / 2 : x / 2; }
  f() { const x = this.dv.getFloat32(this.n, true); this.n += 4; return x; }
  s() { const k = this.v(), r = this.u.subarray(this.n, this.n + k); this.n += k; return remDec.decode(r); }
  bytes(k) { const r = this.u.subarray(this.n, this.n + k); this.n += k; return r; }
}
// сжать, если стоит: { z, zip }
const remPack = u => u.length < REM_RAW ? Promise.resolve({ z: u, zip: false }) : remZip(u).then(z => ({ z, zip: true }));
const remZip = async (u, inflate) => new Uint8Array(await new Response(new Blob([u]).stream()
  .pipeThrough(inflate ? new DecompressionStream('deflate') : new CompressionStream('deflate'))).arrayBuffer());

// ============================================================
//  ХОСТ: запись
// ============================================================
const Rec = {
  on: false, busy: 0, gen: 1, next: 1, nextP: 1, lastSend: 0, chain: Promise.resolve(),
  core: new RemW(),   // снимки картинок и команды на скрытых холстах — доходят все и по порядку
  main: new RemW(),   // команды на экране за кадр — при плохой связи кадр можно пропустить
  ids: new WeakMap(), ctxs: new WeakMap(), pats: new WeakMap(), freed: [],
  reg: typeof FinalizationRegistry === 'function' ? new FinalizationRegistry(id => Rec.freed.push(id)) : null,

  info(o) {
    let I = this.ids.get(o);
    if (!I) {
      I = { id: o === canvas ? 0 : this.next++, gen: 0 };
      this.ids.set(o, I);
      if (I.id && this.reg) this.reg.register(o, I.id);
    }
    return I;
  },
  cinfo(g) { let I = this.ctxs.get(g); if (!I) { I = this.info(g.canvas); this.ctxs.set(g, I); } return I; },
  // куда писать команду на этом холсте; null — гостю этот холст пока не нужен
  out(g) {
    const I = this.cinfo(g);
    if (I.id === 0) return this.tgt(this.main, 0);
    return I.gen === this.gen ? this.tgt(this.core, I.id) : null;
  },
  tgt(w, id) { if (w.tgt !== id) { w.b(OP_TGT); w.v(id); w.tgt = id; } return w; },
  // холст поменяли так, что командами не передать — при следующем использовании отправим целиком
  lost(g) { const I = this.cinfo(g); if (I.id) I.gen = 0; },

  // картинка-источник должна быть у гостя: при первом использовании — снимок пикселей
  img(o) {
    const I = this.info(o);
    if (I.id && I.gen !== this.gen) this.snap(o, I);
    return I.id;
  },
  snap(o, I) {
    const w = o.width | 0, h = o.height | 0;
    let px = null, g = null;
    this.busy++;
    try {
      if (o instanceof HTMLCanvasElement) g = o.getContext('2d');
      const src = g || mk(w, h, true).getContext('2d');
      if (!g && w && h) src.drawImage(o, 0, 0);
      if (w && h) px = new Uint32Array(src.getImageData(0, 0, w, h).data.buffer);
    } catch (e) { /* картинку не прочитать — у гостя будет пустая */ }
    this.busy--;
    const c = this.core;
    c.b(OP_SNAP); c.v(I.id); c.v(w); c.v(h);
    if (!px) c.v(0);
    else {
      // пиксель-арт: подряд идущие одинаковые пиксели — одной записью
      let runs = 0;
      for (let k = 0; k < px.length;) { const p = px[k]; let e = k + 1; while (e < px.length && px[e] === p) e++; runs++; k = e; }
      c.v(runs);
      for (let k = 0; k < px.length;) {
        const p = px[k]; let e = k + 1; while (e < px.length && px[e] === p) e++;
        c.v(e - k); c.room(4); c.dv.setUint32(c.n, p, true); c.n += 4; k = e;
      }
    }
    I.gen = this.gen;
    if (g) this.state(this.core, g, I.id);
  },
  pat(p) {
    const P = this.pats.get(p);
    if (!P) return false;
    if (P.gen !== this.gen) {
      const im = this.img(P.img), c = this.core;
      c.b(OP_PAT); c.v(P.id); c.v(im); c.s(P.rep);
      P.gen = this.gen;
    }
    return true;
  },
  // подготовить аргумент: картинки и узоры — к гостю заранее; false — такое не передать
  prep(x) {
    if (x === null || x === undefined) return true;
    const t = typeof x;
    if (t === 'number' || t === 'string' || t === 'boolean') return true;
    if (x instanceof CanvasPattern) return this.pat(x);
    if (x instanceof HTMLCanvasElement || x instanceof HTMLImageElement || (window.ImageBitmap && x instanceof ImageBitmap)) { this.img(x); return true; }
    return false;
  },
  arg(w, x) {
    if (x === null || x === undefined) w.b(0);
    else if (typeof x === 'number') { if (Number.isInteger(x) && x >= -1e9 && x <= 1e9) { w.b(1); w.i(x); } else { w.b(2); w.f(x); } }
    else if (typeof x === 'string') { w.b(3); w.s(x); }
    else if (typeof x === 'boolean') w.b(x ? 6 : 7);
    else if (x instanceof CanvasPattern) { w.b(5); w.v(this.pats.get(x).id); }
    else { w.b(4); w.v(this.info(x).id); }
  },
  call(g, op, a) {
    const I = this.cinfo(g);
    if (I.id && I.gen !== this.gen) return;
    if (op === 20 && a.length === 1 && a[0] && typeof a[0] === 'object') { const m = a[0]; a = [m.a, m.b, m.c, m.d, m.e, m.f]; }
    for (let k = 0; k < a.length; k++) if (!this.prep(a[k])) { this.lost(g); return; }
    const w = this.out(g);
    if (!w) return;
    w.b(op); w.b(a.length);
    for (let k = 0; k < a.length; k++) this.arg(w, a[k]);
  },
  // состояние контекста: у гостя его холст должен рисовать так же (прозрачность, сдвиг, цвет...)
  state(w, g, id) {
    const fs = g.fillStyle, ss = g.strokeStyle, okF = this.prep(fs), okS = this.prep(ss), m = g.getTransform();
    w.b(OP_STATE); w.v(id);
    w.f(m.a); w.f(m.b); w.f(m.c); w.f(m.d); w.f(m.e); w.f(m.f);
    w.f(g.globalAlpha); w.s(g.globalCompositeOperation);
    this.arg(w, okF ? fs : '#000'); this.arg(w, okS ? ss : '#000');
    w.f(g.lineWidth); w.b(g.imageSmoothingEnabled ? 1 : 0);
  },

  start() { this.on = true; this.reset(); },
  stop() { this.on = false; this.core.clear(); this.main.clear(); },
  // всё заново: новый гость должен получить все картинки с нуля
  reset() {
    this.gen++; this.freed.length = 0;
    this.core.clear(); this.main.clear();
    this.core.b(OP_RESET);
    this.state(this.main, ctx, 0);
  },
  // танк онлайн-гостя: гость сдвинет его туда, куда уже нажал (Pred); x, y — где он у хоста
  mark(g, p) {
    if (this.cinfo(g).id !== 0) return false;
    const w = this.tgt(this.main, 0), gu = Net.guests[p.ctrl.net];
    w.b(OP_MARK); w.b(1); w.v(p.ctrl.net); w.i(Math.round(p.x * 4)); w.i(Math.round(p.y * 4)); w.b(p.dir);
    w.f(p.stats.speed); w.v(gu ? gu.inSeq : 0);
    w.b(G.state === 'play' && !G.paused && p.dashT <= 0 ? 1 : 0);
    return true;
  },
  unmark() { const w = this.tgt(this.main, 0); w.b(OP_MARK); w.b(0); },
  // после отрисовки кадра: записанное { core, main }; null — кадр не шлём
  frame(now) {
    if (this.freed.length) {
      const c = this.core; c.b(OP_FREE); c.v(this.freed.length);
      for (const id of this.freed) c.v(id);
      this.freed.length = 0;
    }
    if (now - this.lastSend < 14) { this.main.clear(); this.state(this.main, ctx, 0); return null; } // больше 60 кадров в секунду не нужно
    this.lastSend = now;
    const core = this.core.take(), main = this.main.take();
    this.state(this.main, ctx, 0);
    return { core, main };
  },
};

// ---------- перехват рисования ----------
(() => {
  const CP = CanvasRenderingContext2D.prototype;
  REM_M.forEach((name, op) => {
    const orig = CP[name]; if (typeof orig !== 'function') return;
    CP[name] = function (...a) {
      if (Rec.on && !Rec.busy) Rec.call(this, op, a);
      return orig.apply(this, a);
    };
  });
  REM_P.forEach((name, j) => {
    const d = Object.getOwnPropertyDescriptor(CP, name); if (!d || !d.set) return;
    Object.defineProperty(CP, name, { configurable: true, enumerable: d.enumerable, get: d.get,
      set(v) { if (Rec.on && !Rec.busy) Rec.call(this, OP_PROP + j, [v]); d.set.call(this, v); } });
  });
  const putImage = CP.putImageData;
  CP.putImageData = function (...a) { if (Rec.on) Rec.lost(this); return putImage.apply(this, a); };
  const createPattern = CP.createPattern;
  CP.createPattern = function (im, rep) {
    const p = createPattern.call(this, im, rep);
    if (p) Rec.pats.set(p, { id: Rec.nextP++, img: im, rep: rep || 'repeat', gen: 0 });
    return p;
  };
  // смена размера стирает холст
  for (const k of ['width', 'height']) {
    const d = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, k);
    Object.defineProperty(HTMLCanvasElement.prototype, k, { configurable: true, enumerable: d.enumerable, get: d.get,
      set(v) { const I = Rec.ids.get(this); if (I && I.id) I.gen = 0; d.set.call(this, v); } });
  }
  // disc(g, ...), ellipse(g, ...), text(s, x, y, color, scale, align, shadow, g = ctx)
  REM_MAC.forEach((name, k) => {
    const orig = window[name]; if (typeof orig !== 'function') return;
    const gi = name === 'text' ? 7 : 0;
    window[name] = function (...a) {
      if (!Rec.on || Rec.busy) return orig.apply(this, a);
      const g = a[gi] || ctx, w = Rec.out(g);
      if (w) {
        const b = a.slice(0, name === 'text' ? 7 : a.length);
        if (gi === 0) b.shift();
        if (name === 'text') b[0] = tr(String(b[0])).toUpperCase();
        w.b(OP_MAC); w.b(k); w.b(b.length);
        for (const x of b) Rec.arg(w, typeof x === 'object' && x !== null ? undefined : x);
      }
      Rec.busy++;
      try { return orig.apply(this, a); } finally { Rec.busy--; }
    };
  });
})();

// ============================================================
//  ГОСТЬ: повтор
// ============================================================
// сообщение: [флаги][данные], флаги: 1 — продолжение следует (только 'scr'), 2 — данные сжаты
const Play = {
  cv: new Map(), pats: new Map(), frame: null, parts: [], chain: Promise.resolve(), mk: null,
  seq: 0, fno: 0, pend: null, // последний полученный seq снимков, номер показанного кадра, кадр, ждущий снимков
  frames: 0, bytes: 0,   // для строки связи: кадров и байт с прошлого раза
  // 'scr': [seq][длина core][core][кадр — если канала 'frm' нет]
  listen(dc) {
    dc.binaryType = 'arraybuffer';
    dc.onmessage = e => {
      const u = new Uint8Array(e.data);
      this.bytes += u.length;
      this.parts.push(u.subarray(1));
      if (u[0] & 1) return; // продолжение следует
      let n = 0; for (const p of this.parts) n += p.length;
      const all = new Uint8Array(n); n = 0;
      for (const p of this.parts) { all.set(p, n); n += p.length; }
      this.parts = [];
      const zip = u[0] & 2;
      this.chain = this.chain.then(() => zip ? remZip(all, true) : all).then(m => this.apply(m), () => {});
    };
  },
  // 'frm': [нужный seq][номер кадра][кадр] — приходят как попало, старые отбрасываем
  listenFrames(dc) {
    dc.binaryType = 'arraybuffer';
    dc.onmessage = e => {
      const u = new Uint8Array(e.data), body = u.subarray(1);
      this.bytes += u.length;
      (u[0] & 2 ? remZip(body, true) : Promise.resolve(body)).then(m => {
        const r = new RemR(m), need = r.v(), fno = r.v(), frame = m.subarray(r.n);
        if (fno <= this.fno) return;
        if (need <= this.seq) this.show(frame, fno);
        else if (!this.pend || fno > this.pend.fno) this.pend = { need, fno, frame };
      }, () => {});
    };
  },
  show(frame, fno) {
    this.frame = frame; this.fno = fno; this.frames++;
    if (this.pend && this.pend.fno <= fno) this.pend = null;
  },
  apply(m) {
    const r = new RemR(m), seq = r.v(), coreLen = r.v(), start = r.n;
    this.run(r, start + coreLen, null);
    this.seq = seq;
    if (r.n < m.length) this.show(m.subarray(r.n), this.fno + 1);
    else if (this.pend && this.pend.need <= seq) this.show(this.pend.frame, this.pend.fno);
  },
  draw() {
    if (!this.frame) return false;
    ctx.save();
    Pred.frame(this.fno); this.mk = null;
    this.run(new RemR(this.frame), this.frame.length, ctx);
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    return true;
  },
  ctxOf(id) { if (id === 0) return ctx; const C = this.cv.get(id); return C ? C.g : null; },
  // аргументы команды; undefined — картинки нет, команду пропускаем
  args(r) {
    const n = r.b(), a = new Array(n);
    let ok = true;
    for (let k = 0; k < n; k++) {
      const t = r.b();
      if (t === 0) a[k] = undefined;
      else if (t === 1) a[k] = r.i();
      else if (t === 2) a[k] = r.f();
      else if (t === 3) a[k] = r.s();
      else if (t === 6) a[k] = true;
      else if (t === 7) a[k] = false;
      else if (t === 4) { const id = r.v(); a[k] = id === 0 ? canvas : (this.cv.get(id) || {}).c; if (!a[k]) ok = false; }
      else if (t === 5) { a[k] = this.pats.get(r.v()); if (!a[k]) ok = false; }
    }
    return ok ? a : undefined;
  },
  run(r, end, g) {
    while (r.n < end) {
      const op = r.b();
      if (op < OP_PROP) { const a = this.args(r); if (g && a) try { g[REM_M[op]](...a); } catch (e) { /* пропуск */ } }
      else if (op < OP_TGT) { const a = this.args(r); if (g && a) try { g[REM_P[op - OP_PROP]] = a[0]; } catch (e) { /* пропуск */ } }
      else if (op === OP_TGT) g = this.ctxOf(r.v());
      else if (op === OP_MAC) {
        const name = REM_MAC[r.b()], a = this.args(r);
        if (!g || !a) continue;
        if (name === 'text') { a.length = 7; a[7] = g; } else a.unshift(g);
        try { window[name](...a); } catch (e) { /* пропуск */ }
      } else if (op === OP_MARK) {
        if (!r.b()) { if (g && this.mk) g.translate(-this.mk[0], -this.mk[1]); this.mk = null; continue; }
        const slot = r.v(), x = r.i() / 4, y = r.i() / 4, dir = r.b(), speed = r.f(), ack = r.v(), live = r.b();
        this.mk = g && slot === Net.slot && live ? Pred.shift(x, y, dir, speed, ack) : null;
        if (this.mk) g.translate(this.mk[0], this.mk[1]);
      } else if (op === OP_SNAP) this.snap(r);
      else if (op === OP_STATE) this.state(r);
      else if (op === OP_PAT) {
        const id = r.v(), im = r.v(), rep = r.s(), C = this.cv.get(im);
        if (C) try { this.pats.set(id, ctx.createPattern(C.c, rep)); } catch (e) { /* пропуск */ }
      } else if (op === OP_FREE) { for (let k = r.v(); k > 0; k--) this.cv.delete(r.v()); }
      else if (op === OP_RESET) { this.cv.clear(); this.pats.clear(); this.frame = null; }
      else return; // незнакомая команда — дальше не разобрать
    }
  },
  snap(r) {
    const id = r.v(), w = r.v(), h = r.v(), runs = r.v();
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (runs && w && h) {
      const im = g.createImageData(w, h), px = new Uint32Array(im.data.buffer);
      let k = 0;
      for (let q = 0; q < runs; q++) { const len = r.v(), p = r.dv.getUint32(r.n, true); r.n += 4; px.fill(p, k, k + len); k += len; }
      g.putImageData(im, 0, 0);
    }
    this.cv.set(id, { c, g });
  },
  state(r) {
    const g = this.ctxOf(r.v());
    const m = [r.f(), r.f(), r.f(), r.f(), r.f(), r.f()], alpha = r.f(), gco = r.s();
    const fs = this.args1(r), ss = this.args1(r), lw = r.f(), sm = r.b();
    if (!g) return;
    g.setTransform(...m); g.globalAlpha = alpha; g.globalCompositeOperation = gco;
    if (fs !== undefined) g.fillStyle = fs;
    if (ss !== undefined) g.strokeStyle = ss;
    g.lineWidth = lw; g.imageSmoothingEnabled = !!sm;
  },
  // одно значение без счётчика (цвет или узор в состоянии)
  args1(r) {
    const t = r.b();
    if (t === 3) return r.s();
    if (t === 5) return this.pats.get(r.v());
    if (t === 1) return r.i();
    if (t === 2) return r.f();
    return undefined;
  },
  reset() { this.cv.clear(); this.pats.clear(); this.frame = null; this.parts = []; this.pend = null; },
};

// ============================================================
//  ГОСТЬ: предсказание своего танка
//  Хост присылает, где танк у него и какой последний шаг кнопок гостя он
//  уже применил (ack). Шаги после ack хост ещё не видел — их движение гость
//  досчитывает сам: танк едет сразу. Стены гость не знает, поэтому если хост
//  упёрся (жмём, а танк у хоста стоит) — в эту сторону не досчитываем.
// ============================================================
const PRED_MAX = 16; // дальше хоста не уезжаем ни при какой задержке
const Pred = {
  hist: [], fno: -1, newFrame: false, px: null, py: null, stuck: 0,
  step(seq, dir, dt) { this.hist.push({ seq, dir, dt }); if (this.hist.length > 240) this.hist.shift(); },
  frame(fno) { this.newFrame = fno !== this.fno; this.fno = fno; },
  // сдвиг рисования [dx, dy] в целых пикселях
  shift(x, y, dir, speed, ack) {
    const H = this.hist;
    while (H.length > 1 && H[1].seq <= ack) H.shift(); // H[0] — последний применённый хостом шаг (или старее)
    if (this.newFrame) {
      const acked = H.length && H[0].seq <= ack ? H[0].dir : -1;
      this.stuck = x === this.px && y === this.py && acked === dir && acked >= 0 ? this.stuck + 1 : 0;
      this.px = x; this.py = y; this.newFrame = false;
    }
    let dx = 0, dy = 0;
    for (const h of H) {
      if (h.seq <= ack || h.dir < 0 || (h.dir === dir && this.stuck >= 2)) continue;
      dx += DX[h.dir] * speed * h.dt; dy += DY[h.dir] * speed * h.dt;
    }
    dx = clamp(dx, -PRED_MAX, PRED_MAX); dy = clamp(dy, -PRED_MAX, PRED_MAX);
    return [Math.round(x + dx) - Math.round(x), Math.round(y + dy) - Math.round(y)];
  },
};

// ============================================================
//  связка с Net: гости, отправка кадров
// ============================================================
const Remote = {
  ok: typeof CompressionStream === 'function' && typeof DecompressionStream === 'function',
  add(g) { g.scrReady = false; g.needReset = true; if (!Rec.on) Rec.start(); },
  frame(guests) {
    if (!Rec.on) return;
    const list = guests.filter(g => g && g.scr && g.scr.readyState === 'open');
    if (!list.length) { Rec.stop(); return; }
    if (list.some(g => g.needReset)) { // новый гость: всё заново, с этого кадра его кормим
      Rec.reset();
      for (const g of list) { g.needReset = false; g.scrReady = true; }
      return;
    }
    const m = Rec.frame(performance.now());
    if (!m) return;
    const to = list.filter(g => g.scrReady);
    if (m.core.length) this.seq++;
    const seq = this.seq, fno = ++this.fno;
    const lossy = g => g.frm && g.frm.readyState === 'open';
    // без канала кадров (старый браузер) — кадр вместе со снимками; не успевает принимать — кадр пропускаем
    const old = to.filter(g => !lossy(g) && g.scr.bufferedAmount <= 256 * 1024);
    const rest = to.filter(g => !old.includes(g));
    const w = new RemW(); w.v(seq); w.v(m.core.length); const head = w.take();
    if (old.length) this.sendRel(remJoin(head, m.core, m.main), old);
    if (m.core.length && rest.length) this.sendRel(remJoin(head, m.core), rest);
    const fr = to.filter(g => lossy(g) && g.frm.bufferedAmount < 64 * 1024);
    if (fr.length) {
      w.v(seq); w.v(fno);
      remPack(remJoin(w.take(), m.main)).then(({ z, zip }) => {
        if (z.length > REM_FRM_MAX) return;
        const out = new Uint8Array(z.length + 1); out[0] = zip ? 2 : 0; out.set(z, 1);
        for (const g of fr) if (g.frm.readyState === 'open') try { g.frm.send(out); } catch (e) { /* канал закрылся */ }
      }, () => {});
    }
  },
  seq: 0, fno: 0,
  // надёжный канал: по порядку, кусками
  sendRel(msg, gs) {
    Rec.chain = Rec.chain.then(() => remPack(msg)).then(({ z, zip }) => {
      for (const g of gs) {
        if (g.scr.readyState !== 'open') continue;
        try {
          for (let k = 0; k < z.length || k === 0; k += REM_CHUNK) {
            const part = z.subarray(k, k + REM_CHUNK), out = new Uint8Array(part.length + 1);
            out[0] = (k + REM_CHUNK < z.length ? 1 : 0) | (zip ? 2 : 0); out.set(part, 1);
            g.scr.send(out);
          }
        } catch (e) { /* канал закрылся */ }
      }
    }, () => {});
  },
};
function remJoin(...a) {
  let n = 0; for (const x of a) n += x.length;
  const u = new Uint8Array(n); n = 0;
  for (const x of a) { u.set(x, n); n += x.length; }
  return u;
}
