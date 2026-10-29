'use strict';
// ============================================================
//  UPGRADES: стихии снарядов, статусы врагов, доп. системы,
//  синергии и карты с особым эффектом
// ============================================================

const ICE_COLS = ['#ffffff', '#e8fcff', '#a4e4fc', '#3cbcfc', '#0078f8', '#003c8c', '#001c40'];
const AUX_IDS = ['mg', 'mines', 'rk', 'coil', 'drone', 'ram', 'mort', 'saw'];
const auxCount = p => AUX_IDS.filter(id => p.perks[id]).length;
// цвет снаряда по стихии (если стихий несколько — по старшей)
function elemCol(fx) {
  if (!fx) return null;
  return fx.tesla ? '#7cd8fc' : fx.cryo ? '#a4e4fc' : fx.inc ? '#fca044' : fx.mark ? '#f87878' : null;
}

// ---------- отложенные действия (цепные молнии, подрыв мин) ----------
function later(delay, fn) { G.timers.push({ t: delay, fn }); }
function updateTimers(dt) {
  if (!G.timers.length) return;
  for (const tm of G.timers) tm.t -= dt;
  const due = G.timers.filter(tm => tm.t <= 0);
  if (!due.length) return;
  G.timers = G.timers.filter(tm => tm.t > 0);
  for (const tm of due) tm.fn();
}

// ---------- цели: враг или босс ('boss') ----------
const bossLive = () => !!(G.boss && G.boss.alive && !G.boss.dying && G.boss.active);
const bossAim = () => G.boss.aim();
const tpos = t => t === 'boss' ? bossAim() : { x: t.cx, y: t.cy };
const tAlive = t => t === 'boss' ? bossLive() : !!(t && t.alive);
function findTarget(x, y, range) {
  let best = null, bd = range;
  for (const e of G.enemies) { if (!e.alive) continue; const d = dist(x, y, e.cx, e.cy); if (d < bd) { bd = d; best = e; } }
  if (bossLive()) { const a = bossAim(); if (dist(x, y, a.x, a.y) < bd) best = 'boss'; }
  return best;
}
// урон боссу с учётом метки «Корректировки»
function bossHit(part, dmg, by) {
  const b = G.boss;
  if (!b || !b.alive || b.dying || !part) return 'reflect';
  if (b.mark > 0) dmg *= 1.5;
  return b.damage(dmg, part, by);
}
function hitTarget(t, dmg, by) {
  if (t === 'boss') { const a = bossAim(); return bossHit(G.boss.hitTest(a.x, a.y, 4), dmg, by); }
  t.takeHit(dmg, by);
  return 'ok';
}

// ---------- молнии ----------
class ArcFx {
  constructor(pts, dur = 0.22) { this.pts = pts; this.t = 0; this.dur = dur; }
  update(dt) { this.t += dt; return this.t < this.dur; }
  draw(g) {
    if (this.t / this.dur > 0.6 && Math.random() < 0.5) return;
    for (let i = 0; i < this.pts.length - 1; i++) {
      const [x0, y0] = this.pts[i], [x1, y1] = this.pts[i + 1];
      const L = Math.hypot(x1 - x0, y1 - y0) || 1, n = Math.max(2, Math.round(L / 6));
      const nx = -(y1 - y0) / L, ny = (x1 - x0) / L;
      let px = x0, py = y0;
      for (let j = 1; j <= n; j++) {
        const k = j / n, off = j === n ? 0 : rand(-3.5, 3.5);
        const qx = lerp(x0, x1, k) + nx * off, qy = lerp(y0, y1, k) + ny * off;
        pline(g, px, py, qx, qy, '#3c78f8', 2); pline(g, px, py, qx, qy, '#e8fcff', 1);
        px = qx; py = qy;
      }
    }
  }
}
function zap(x, y, t, dmg, by, stun = 0.8) {
  if (!tAlive(t)) return;
  const q = tpos(t);
  G.effects.push(new ArcFx([[x, y], [q.x, q.y]]));
  hitTarget(t, dmg, by);
  if (t !== 'boss' && t.alive) t.stun = Math.max(t.stun, stun);
  Sound.play('zap');
}
function chainLightning(x, y, n, range, dmg, by, seen = new Set()) {
  let cx = x, cy = y;
  for (let k = 0; k < n; k++) {
    let best = null, bd = range;
    for (const e of G.enemies) if (e.alive && !seen.has(e)) { const d = dist(cx, cy, e.cx, e.cy); if (d < bd) { bd = d; best = e; } }
    if (!best) break;
    seen.add(best);
    const ax = cx, ay = cy, e = best;
    later(0.06 * (k + 1), () => zap(ax, ay, e, dmg, by));
    cx = best.cx; cy = best.cy;
  }
}

// ---------- попадания снарядов игрока ----------
function bulletHitsEnemy(b, e) {
  const p = b.owner instanceof Player ? b.owner : null, fx = b.fx;
  let dmg = b.dmg;
  if (p && b.explosive && e.frozen > 0 && p.perks.shatter) { shatter(e, p); return; } // ЛЕДЯНОЙ РАСКОЛ прямым попаданием
  if (p && fx && fx.inc && e.frozen > 0 && p.perks.thermo) { // ТЕРМОШОК
    dmg *= 3; e.frozen = 0; e.thaw = G.time;
    G.effects.push(new Boom(e.cx, e.cy, 12, { pal: ICE_COLS, quiet: true }), new Boom(e.cx, e.cy, 14));
    G.popups.push(new Popup(e.cx, e.y - 10, '×3', '#fc7c38'));
    Sound.play('boom');
  } else if (b.charged) G.popups.push(new Popup(e.cx, e.y - 10, '×3', '#fcd820'));
  e.takeHit(dmg, b.owner);
  if (fx) {
    if (e.alive) {
      if (fx.inc) e.ignite(3, p);
      if (fx.cryo) e.chill();
      if (fx.mark) { e.mark = 4; carpetStrike(e.cx, e.cy, p); }
    }
    if (fx.tesla) chainLightning(e.cx, e.cy, p && p.perks.thunder ? 4 : 2, 60, 1, p, new Set([e])); // «Грозовая картечь»: 4 цели
  }
}
function bulletHitsBoss(b, part) {
  const p = b.owner instanceof Player ? b.owner : null, fx = b.fx, B = G.boss;
  const r = bossHit(part, b.dmg, b.owner);
  if (r === 'reflect' || !fx) return r;
  if (fx.inc) { B.burn = 3; B.burnPart = part; B.burnBy = p; }
  if (fx.mark) { B.mark = 4; const a = bossAim(); carpetStrike(a.x, a.y, p); }
  if (fx.tesla) chainLightning(b.x, b.y, p && p.perks.thunder ? 4 : 2, 70, 1, p);
  return r;
}
// КОВРОВАЯ БОМБАРДИРОВКА: метка вызывает залп из 4 бомб (не чаще раза в 1.5 с)
function carpetStrike(x, y, p) {
  if (!p || !p.perks.carpet || G.time - (p.carpetT || -9) < 1.5) return;
  p.carpetT = G.time;
  for (let i = 0; i < 4; i++) {
    const tx = clamp(x + rand(-14, 14), 4, FW - 4), ty = clamp(y + rand(-14, 14), 4, FH - 4);
    G.mortars.push(new Mortar(tx, -10, tx, ty, 0.6 + i * 0.12, { r: 14, h: 0, dmg: 2, by: p, col: '#3c3c3c' }));
  }
  Sound.play('mortar');
}
// АБСОЛЮТНЫЙ НОЛЬ: замороженный при гибели замораживает всех вокруг (цепочкой)
function freezeBurst(e, p) {
  G.effects.push(new RingFx(e.cx, e.cy, 4, 44, '#e8fcff', 0.4), new Boom(e.cx, e.cy, 16, { pal: ICE_COLS, quiet: true }));
  for (const o of G.enemies) if (o.alive && o !== e && dist(o.cx, o.cy, e.cx, e.cy) < 44) { o.frozen = Math.max(o.frozen, 2.5); o.chillN = 0; }
  Sound.play('ice');
}
function updateBossStatus(dt) {
  const B = G.boss;
  if (!B || !B.alive || B.dying) return;
  if (B.mark > 0) B.mark -= dt;
  if (B.burn > 0) {
    B.burn -= dt; B.burnT = (B.burnT || 1) - dt;
    if (B.burnT <= 0) { B.burnT = 1; bossHit(B.burnPart, 1, B.burnBy); }
    if (Math.random() < dt * 12 && G.particles.length < 450) {
      const a = bossAim();
      G.particles.push(new Particle(a.x + rand(-10, 10), a.y + rand(-8, 8), rand(-4, 4), rand(-26, -12), 0.4, pick(['#f83800', '#fca044', '#fcd820']), 1, 0.5));
    }
  }
}
function drawBossStatus(g) {
  const B = G.boss;
  if (!B || !B.alive || B.dying || !(B.mark > 0) || Math.floor(G.time * 6) % 2) return;
  const b = B.bounds(), x = Math.round(b.x) - 2, y = Math.round(b.y) - 2, w = Math.round(b.w) + 4, h = Math.round(b.h) + 4, c = '#f83838';
  rect(g, x, y, 6, 1, c); rect(g, x, y, 1, 6, c); rect(g, x + w - 6, y, 6, 1, c); rect(g, x + w - 1, y, 1, 6, c);
  rect(g, x, y + h - 1, 6, 1, c); rect(g, x, y + h - 6, 1, 6, c); rect(g, x + w - 6, y + h - 1, 6, 1, c); rect(g, x + w - 1, y + h - 6, 1, 6, c);
}

// статусы врага поверх спрайта: лёд, огонь, метка, оглушение
function drawStatus(g, e) {
  const x = Math.round(e.x), y = Math.round(e.y), t = G.time;
  if (e.frozen > 0) {
    g.globalAlpha = 0.4; rect(g, x - 1, y - 1, 18, 18, '#a4e4fc'); g.globalAlpha = 1;
    rect(g, x - 1, y - 1, 18, 1, '#e8fcff'); rect(g, x - 1, y - 1, 1, 18, '#e8fcff');
    rect(g, x + 16, y - 1, 1, 18, '#3cbcfc'); rect(g, x - 1, y + 16, 18, 1, '#3cbcfc');
    rect(g, x + 2, y + 3, 1, 1, '#fff'); rect(g, x + 3, y + 2, 1, 1, '#fff'); rect(g, x + 12, y + 11, 1, 1, '#fff');
  }
  if (e.burn > 0) for (let i = 0; i < 3; i++) {
    const h = 2 + ((t * 20 + i * 7) | 0) % 3, fx = x + 3 + i * 5;
    rect(g, fx, y + 2 - h, 2, h, '#f83800'); rect(g, fx, y + 3 - h, 1, h - 1, '#fcd820');
  }
  if (e.mark > 0 && (t * 6 | 0) % 2) {
    const c = '#f83838';
    rect(g, x - 2, y - 2, 4, 1, c); rect(g, x - 2, y - 2, 1, 4, c); rect(g, x + 14, y - 2, 4, 1, c); rect(g, x + 17, y - 2, 1, 4, c);
    rect(g, x - 2, y + 17, 4, 1, c); rect(g, x - 2, y + 14, 1, 4, c); rect(g, x + 14, y + 17, 4, 1, c); rect(g, x + 17, y + 14, 1, 4, c);
  }
  if (e.stun > 0) for (let i = 0; i < 2; i++) { const a = t * 10 + i * Math.PI; rect(g, Math.round(x + 8 + Math.cos(a) * 6), Math.round(y - 2 + Math.sin(a) * 2), 1, 1, '#fcd820'); }
}

// ---------- синергии взрывов ----------
function shatter(e, p) { // ЛЕДЯНОЙ РАСКОЛ
  e.frozen = 0; e.thaw = G.time;
  G.effects.push(new Boom(e.cx, e.cy, 14, { pal: ICE_COLS }));
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2;
    const s = new Bullet(e.cx + Math.cos(a) * 9, e.cy + Math.sin(a) * 9, Math.cos(a) * 150, Math.sin(a) * 150, 'player', p,
      { kind: 'small', dmg: 1, breaks: false, life: 0.6, col: '#e8fcff', fx: { cryo: true } });
    s.hits = new Set([e]); // осколки не бьют сам расколотый танк
    G.bullets.push(s);
  }
  e.takeHit(2, p);
  Sound.play('ice');
}
// горящая земля (НАПАЛМ)
function fireArea(x, y, r, life, by) {
  const L = G.level;
  for (let cy = Math.floor((y - r) / CELL); cy <= Math.floor((y + r) / CELL); cy++)
    for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) {
      if (dist(cx * CELL + 4, cy * CELL + 4, x, y) > r) continue;
      const t = L.get(cx, cy);
      if (t === -1 || t === T_STEEL || t === T_WATER || t === T_BRICK) continue;
      const key = cy * COLS + cx, f = G.fires.get(key), l = life * rand(0.8, 1.2);
      if (f) f.life = Math.max(f.life, l); else G.fires.set(key, { x: cx * CELL, y: cy * CELL, life: l, by });
    }
}
function updateFires(dt) {
  for (const [k, f] of G.fires) {
    f.life -= dt;
    if (f.life <= 0) { G.fires.delete(k); continue; }
    for (const e of G.enemies) if (e.alive && overlap(f.x, f.y, CELL, CELL, e.x + 2, e.y + 2, 12, 12)) e.ignite(2.5, f.by);
  }
}
function drawFires(g) {
  const t = G.time;
  for (const f of G.fires.values()) {
    rect(g, f.x + 1, f.y + 5, 6, 2, '#801000');
    for (let i = 0; i < 3; i++) {
      const h = 2 + ((t * 18 + i * 5 + f.x) | 0) % 4, fx = f.x + 1 + i * 2;
      rect(g, fx, f.y + 7 - h, 2, h, i === 1 ? '#fca044' : '#f83800'); rect(g, fx, f.y + 8 - h, 1, 1, '#fcd820');
    }
  }
}

// ---------- мины ----------
class Mine {
  constructor(x, y, owner) { this.x = x; this.y = y; this.owner = owner; this.t = 0; this.dead = false; this.fuse = -1; }
  get dmg() { const p = this.owner; return ((p.perks.mines || 1) >= 3 ? 3 : 2) * (p.perks.deton ? 1.5 : 1); }
  detonate(delay) { if (!this.dead && this.fuse < 0) this.fuse = delay; }
  update(dt) {
    this.t += dt;
    if (this.fuse >= 0) { this.fuse -= dt; if (this.fuse <= 0) this.blow(); return; }
    if (this.t < 0.4) return;
    for (const e of G.enemies) if (e.alive && dist(this.x, this.y, e.cx, e.cy) < 12) { this.blow(); return; }
    if (bossLive() && G.boss.hitTest(this.x, this.y, 6)) this.blow();
  }
  blow() {
    if (this.dead) return;
    this.dead = true;
    const p = this.owner;
    explode(this.x, this.y, 16, { hurtEnemies: true, hurtBoss: true, dmg: this.dmg, by: p });
    if (p.perks.scorch) fireArea(this.x, this.y, 18, 4, p); // «Выжженная земля»
    if (p.perks.chain) for (let i = 0; i < 3; i++) { // «Цепная реакция»: мина рассыпает бомбы
      const a = i / 3 * Math.PI * 2 + rand(-0.4, 0.4), d = rand(18, 26);
      G.mortars.push(new Mortar(this.x, this.y, clamp(this.x + Math.cos(a) * d, 4, FW - 4), clamp(this.y + Math.sin(a) * d, 4, FH - 4), 0.3 + i * 0.06,
        { r: 11, h: 14, dmg: 1, by: p, col: '#3c3c3c', sub: true }));
    }
  }
  draw(g) {
    disc(g, this.x, this.y, 3, '#202020'); disc(g, this.x, this.y, 2, '#545454');
    if (this.fuse >= 0 || Math.floor((G.time + this.x) * 4) % 2) rect(g, Math.round(this.x), Math.round(this.y) - 1, 1, 1, '#f83800');
  }
}
function dropMine(p) {
  G.mines.push(new Mine(p.cx - DX[p.dir] * 10, p.cy - DY[p.dir] * 10, p));
  p.aux.mlx = p.x; p.aux.mly = p.y;
  Sound.play('mine');
}
// ДЕТОНАТОР: взрыв подрывает свои мины рядом (цепочкой)
function detonateNear(x, y, r, p) {
  for (const m of G.mines) if (!m.dead && m.owner === p && m.fuse < 0 && dist(x, y, m.x, m.y) < r) m.detonate(0.12);
}

// ---------- доп. системы (стреляют сами) ----------
const newAuxState = () => ({ mgA: -Math.PI / 2, mgCd: 0.5, mgBurst: 0, mgBt: 0, mineCd: 0.5, mlx: null, mly: null, rkCd: 1.5, coilCd: 0.5, dA: 0, dCd: 0.4, ramBoss: 0, dashDist: 0,
  mortCd: 1.5, sawA: 0, sawHit: new WeakMap(), sawBoss: 0, fwT: 0 });
// «Огненный вихрь»: на одну пилу больше и шире круг
const sawN = p => (p.perks.saw || 0) + (p.perks.whirl && p.perks.saw ? 1 : 0);
const sawPos = (p, i) => { const a = p.aux.sawA + i / sawN(p) * Math.PI * 2, r = p.perks.whirl ? 26 : 20; return [p.cx + Math.cos(a) * r, p.cy + Math.sin(a) * r]; };
const dronePos = (p, i) => { const a = p.aux.dA + i * Math.PI; return [p.cx + Math.cos(a) * 22, p.cy + Math.sin(a) * 15]; };
function frontStrip(p, depth) {
  const d = p.dir, x = p.x, y = p.y;
  return d === 0 ? [x, y - depth, 16, depth] : d === 2 ? [x, y + 16, 16, depth] : d === 1 ? [x + 16, y, depth, 16] : [x - depth, y, depth, 16];
}
function rocketTargets(p, n, spot) {
  const list = [];
  for (const e of G.enemies) if (e.alive) list.push({ t: e, d: dist(p.cx, p.cy, e.cx, e.cy) - (spot && e.mark > 0 ? 1000 : 0) });
  if (bossLive()) { const a = bossAim(); list.push({ t: 'boss', d: dist(p.cx, p.cy, a.x, a.y) - (spot && G.boss.mark > 0 ? 1000 : 0) }); }
  const near = list.filter(o => o.d < 320).sort((a, b) => a.d - b.d);
  if (!near.length) return [];
  const k = near[0].d < 0 ? 1 : Math.min(near.length, n); // КОРРЕКТИРОВЩИК: все ракеты в помеченного
  const out = [];
  for (let i = 0; i < n; i++) out.push(near[i % k].t);
  return out;
}
function updateAux(p, dt) {
  const A = p.aux, lv = id => p.perks[id] || 0;
  // пулемётная турель
  if (lv('mg')) {
    const L = lv('mg'), t = findTarget(p.cx, p.cy, 150);
    if (t) { const q = tpos(t); A.mgA += clamp(normA(angleTo(p.cx, p.cy, q.x, q.y) - A.mgA), -8 * dt, 8 * dt); }
    A.mgCd -= dt;
    if (A.mgCd <= 0 && t) { A.mgCd = [0, 0.8, 0.7, 0.55][L]; A.mgBurst = L >= 3 ? 4 : 3; }
    if (A.mgBurst > 0 && (A.mgBt -= dt) <= 0) {
      A.mgBt = 0.08; A.mgBurst--;
      const a = A.mgA + rand(-0.06, 0.06);
      G.bullets.push(new Bullet(p.cx + Math.cos(a) * 6, p.cy + Math.sin(a) * 6, Math.cos(a) * 200, Math.sin(a) * 200, 'player', p,
        { kind: 'small', dmg: L >= 2 ? 1 : 0.5, breaks: false, col: '#fcd820', life: 1.2 }));
      Sound.play('mg');
    }
  }
  // минный укладчик
  if (lv('mines')) {
    const L = lv('mines');
    if (A.mlx === null) { A.mlx = p.x; A.mly = p.y; } // мины кладутся только на ходу
    A.mineCd -= dt;
    if (A.mineCd <= 0 && dist(p.x, p.y, A.mlx, A.mly) >= 12 && G.mines.filter(m => !m.dead && m.owner === p).length < [0, 4, 6, 8][L]) {
      dropMine(p); A.mineCd = [0, 1.2, 0.9, 0.7][L];
    }
  }
  // ракетная установка
  if (lv('rk')) {
    const L = lv('rk');
    A.rkCd -= dt;
    if (A.rkCd <= 0) {
      const n = [0, 2, 3, 4][L], spot = !!p.perks.spotter, ts = rocketTargets(p, n, spot);
      if (!ts.length) A.rkCd = 0.5;
      else {
        A.rkCd = [0, 4, 3.5, 3][L];
        ts.forEach((t, i) => {
          const q = tpos(t), a = angleTo(p.cx, p.cy, q.x, q.y) + (i - (n - 1) / 2) * 0.6;
          G.bullets.push(new Bullet(p.cx, p.cy, Math.cos(a) * 60, Math.sin(a) * 60, 'player', p,
            { kind: 'rocket', homing: 5, target: t, accel: 180, maxsp: 175, explosive: 10, dmg: spot ? 3 : 2, life: 3 }));
        });
        Sound.play('missile');
      }
    }
  }
  // тесла-катушка
  if (lv('coil')) {
    const L = lv('coil');
    A.coilCd -= dt;
    if (A.coilCd <= 0) {
      const t = findTarget(p.cx, p.cy, [0, 56, 64, 72][L]);
      if (t) {
        A.coilCd = [0, 1, 0.8, 0.65][L];
        zap(p.x + 12, p.y + 2, t, 1, p, 0.6);
        if (L >= 3 && t !== 'boss') chainLightning(t.cx, t.cy, 1, 50, 1, p, new Set([t]));
      } else A.coilCd = 0.1;
    }
  }
  // дрон
  if (lv('drone')) {
    const L = lv('drone');
    A.dA += 2.8 * dt; A.dCd -= dt;
    if (A.dCd <= 0) {
      A.dCd = L >= 2 ? 0.38 : 0.5;
      for (let i = 0; i < (L >= 3 ? 2 : 1); i++) {
        const [dx, dy] = dronePos(p, i), t = findTarget(dx, dy, 150);
        if (!t) continue;
        const q = tpos(t), a = angleTo(dx, dy, q.x, q.y);
        G.bullets.push(new Bullet(dx, dy, Math.cos(a) * 190, Math.sin(a) * 190, 'player', p,
          { kind: 'small', dmg: L >= 2 ? 1 : 0.5, breaks: false, col: '#7cd8fc', life: 1.2 }));
      }
    }
  }
  // отвал-таран
  if (lv('ram')) {
    const L = lv('ram'), dmg = [0, 2, 3, 4][L], fr = frontStrip(p, 3);
    for (const e of G.enemies) {
      if (!e.alive || e.ramCd > 0 || !overlap(fr[0], fr[1], fr[2], fr[3], e.x, e.y, 16, 16)) continue;
      e.ramCd = 0.5;
      e.takeHit(dmg, p);
      if (e.alive) e.push(p.dir, [0, 12, 16, 20][L]);
      ramSparks(fr); G.shake = Math.max(G.shake, 2);
    }
    A.ramBoss -= dt;
    if (A.ramBoss <= 0 && bossLive()) {
      const part = G.boss.hitTest(fr[0] + fr[2] / 2, fr[1] + fr[3] / 2, 3);
      if (part) { A.ramBoss = 0.5; bossHit(part, dmg, p); ramSparks(fr); G.shake = Math.max(G.shake, 2); }
    }
  }
  // миномёт: навесом через стены по ближайшим врагам не ближе 40 px, каждой мине — своя цель
  if (lv('mort')) {
    const L = lv('mort');
    A.mortCd -= dt;
    if (A.mortCd <= 0) {
      const list = [];
      const art = !!p.perks.artstrike, mk = m => art && m > 0 ? 1000 : 0; // «Артналёт»: помеченные — первыми
      for (const e of G.enemies) if (e.alive) { const d = dist(p.cx, p.cy, e.cx, e.cy); if (d > 40 && d < 280) list.push({ x: e.cx, y: e.cy, d: d - mk(e.mark), m: mk(e.mark) }); }
      if (bossLive()) { const a = bossAim(), d = dist(p.cx, p.cy, a.x, a.y); if (d > 40 && d < 280) list.push({ x: a.x, y: a.y, d: d - 60 - mk(G.boss.mark), m: mk(G.boss.mark) }); }
      if (!list.length) A.mortCd = 0.4;
      else {
        A.mortCd = [0, 3.2, 2.8, 2.4][L];
        list.sort((a, b) => a.d - b.d);
        const marked = list.filter(q => q.m).length, n = marked ? L * 2 : L, k = marked || list.length; // двойной залп — только по помеченным
        for (let i = 0; i < n; i++) {
          const q = list[i % k], spr = i >= k ? 12 : 0; // целей меньше, чем мин — кладём рядом
          G.mortars.push(new Mortar(p.cx, p.cy, clamp(q.x + rand(-spr, spr), 4, FW - 4), clamp(q.y + rand(-spr, spr), 4, FH - 4), 0.85 + i * 0.12,
            { r: L >= 3 ? 18 : 15, h: 46, dmg: 2, by: p, col: '#3c3c3c' }));
        }
        Sound.play('mortar');
      }
    }
  }
  // диски-пилы: режут врагов и босса, сбивают вражеские снаряды
  if (lv('saw')) {
    const sdmg = p.perks.grinder ? 2 : 1, hot = !!p.perks.hotsaw; // «Мясорубка», «Раскалённые пилы»
    A.sawA += (p.perks.grinder ? 6.3 : 4.2) * dt; A.sawBoss -= dt;
    const trail = p.perks.whirl && (A.fwT -= dt) <= 0;
    if (trail) A.fwT = 0.2;
    for (let i = 0; i < sawN(p); i++) {
      const [sx, sy] = sawPos(p, i);
      if (trail) fireArea(sx, sy, 5, 1.6, p);
      for (const e of G.enemies) {
        if (!e.alive || !overlap(sx - 4, sy - 4, 8, 8, e.x, e.y, 16, 16) || G.time - (A.sawHit.get(e) || -9) < 0.35) continue;
        A.sawHit.set(e, G.time);
        e.takeHit(sdmg, p);
        if (hot && e.alive) e.ignite(3, p);
        sawSparks(sx, sy);
      }
      for (const b of G.bullets) if (b.alive && b.team === 'enemy' && (b.cancel || b.hp) && dist(b.x, b.y, sx, sy) < 6) {
        G.effects.push(new Boom(b.x, b.y, 3, { quiet: true })); b.kill(); sawSparks(sx, sy);
      }
      if (A.sawBoss <= 0 && bossLive()) {
        const part = G.boss.hitTest(sx, sy, 4);
        if (part) {
          A.sawBoss = 0.35; bossHit(part, sdmg, p); sawSparks(sx, sy);
          if (hot) { G.boss.burn = 3; G.boss.burnPart = part; G.boss.burnBy = p; }
        }
      }
    }
  }
}
function sawSparks(x, y) {
  for (let i = 0; i < 4 && G.particles.length < 450; i++)
    G.particles.push(new Particle(x, y, rand(-60, 60), rand(-60, 60), 0.25, pick(['#fcfcfc', '#fcd820', '#fca044']), 1));
  Sound.play('hit');
}
function ramSparks(fr) {
  for (let i = 0; i < 6 && G.particles.length < 450; i++)
    G.particles.push(new Particle(fr[0] + rand(0, fr[2]), fr[1] + rand(0, fr[3]), rand(-50, 50), rand(-50, 50), 0.3, pick(['#fcfcfc', '#fcd820']), 1));
  Sound.play('hit');
}
function drawAux(p, g) {
  const lv = id => p.perks[id] || 0, x = Math.round(p.x), y = Math.round(p.y), t = G.time;
  if (lv('ram')) {
    const d = p.dir;
    if (d === 0) { rect(g, x - 1, y - 3, 18, 3, '#545454'); rect(g, x, y - 2, 16, 1, '#d0d0d0'); }
    else if (d === 2) { rect(g, x - 1, y + 16, 18, 3, '#545454'); rect(g, x, y + 17, 16, 1, '#d0d0d0'); }
    else if (d === 1) { rect(g, x + 16, y - 1, 3, 18, '#545454'); rect(g, x + 17, y, 1, 16, '#d0d0d0'); }
    else { rect(g, x - 3, y - 1, 3, 18, '#545454'); rect(g, x - 2, y, 1, 16, '#d0d0d0'); }
  }
  if (lv('mort')) { rect(g, x + 10, y + 10, 5, 5, '#2c2c2c'); rect(g, x + 10, y + 10, 5, 1, '#7c7c7c'); rect(g, x + 12, y + 12, 1, 1, '#000'); }
  if (lv('rk')) { rect(g, x + 1, y + 1, 5, 4, '#3c3c3c'); rect(g, x + 2, y + 1, 1, 2, '#f83800'); rect(g, x + 4, y + 1, 1, 2, '#f83800'); }
  if (lv('coil')) { rect(g, x + 11, y + 2, 2, 5, '#7c7c9c'); disc(g, x + 12, y + 2, 1, (t * 8 | 0) % 2 ? '#3cbcfc' : '#e8fcff'); }
  if (lv('mg')) {
    const cx = p.cx, cy = p.cy, a = p.aux.mgA;
    pline(g, cx, cy, cx + Math.cos(a) * 7, cy + Math.sin(a) * 7, '#202020', 2);
    pline(g, cx, cy, cx + Math.cos(a) * 7, cy + Math.sin(a) * 7, '#fce078', 1);
    disc(g, cx, cy, 3, '#3c2c00'); disc(g, cx, cy, 2, PALS[p.pal].l);
  }
  if (p.perks.wait && G.time - p.lastShot >= 1.5) {
    const mx = p.cx + DX[p.dir] * 9, my = p.cy + DY[p.dir] * 9;
    disc(g, mx, my, 2 + ((t * 12 | 0) % 2), '#fcd820'); rect(g, Math.round(mx), Math.round(my), 1, 1, '#fcfcfc');
  }
}
function drawSaws(p, g) {
  const n = sawN(p);
  if (!n || p.dead) return;
  for (let i = 0; i < n; i++) {
    const [sx, sy] = sawPos(p, i), r = p.aux.sawA * 3, hot = !!p.perks.hotsaw;
    disc(g, sx, sy, 4, hot ? '#f83800' : '#7c7c7c'); disc(g, sx, sy, 3, hot ? '#fca044' : '#bcbcbc');
    for (let k = 0; k < 4; k++) { const a = r + k * Math.PI / 2; rect(g, Math.round(sx + Math.cos(a) * 4), Math.round(sy + Math.sin(a) * 4), 1, 1, '#fcfcfc'); }
    rect(g, Math.round(sx), Math.round(sy), 1, 1, '#3c3c3c');
  }
}
function drawDrones(p, g) {
  drawSaws(p, g);
  const L = p.perks.drone || 0;
  if (!L || p.dead) return;
  const f = (G.time * 30 | 0) % 2;
  for (let i = 0; i < (L >= 3 ? 2 : 1); i++) {
    const [dx, dy] = dronePos(p, i), x = Math.round(dx), y = Math.round(dy);
    g.globalAlpha = 0.35; rect(g, x - 2, y + 6, 5, 2, '#000'); g.globalAlpha = 1;
    rect(g, x - 1, y - 1, 3, 3, '#bcbcbc');
    for (const [qx, qy] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) rect(g, x + qx - f, y + qy, 1 + f, 1, '#7c7c7c');
    rect(g, x, y, 1, 1, (G.time * 6 | 0) % 2 ? '#f83800' : '#fcfcfc');
  }
}

// ---------- карты с эффектом ----------
function brickShards(b, cells) { // ОСКОЛКИ
  const a0 = Math.atan2(b.vy, b.vx);
  let n = 0;
  for (const [cx, cy] of cells) for (let i = 0; i < 2 && n < 6; i++, n++) {
    const a = a0 + rand(-0.7, 0.7);
    G.bullets.push(new Bullet(cx * CELL + 4 + Math.cos(a0) * 5, cy * CELL + 4 + Math.sin(a0) * 5, Math.cos(a) * 150, Math.sin(a) * 150, 'player', b.owner,
      { kind: 'small', dmg: 1, breaks: false, life: 0.45, col: '#e8884c', shard: true }));
  }
}
function retaliate(p) { // ОТВЕТНЫЙ ОГОНЬ
  const s = p.stats;
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    G.bullets.push(new Bullet(p.cx + Math.cos(a) * 7, p.cy + Math.sin(a) * 7, Math.cos(a) * s.bspeed, Math.sin(a) * s.bspeed, 'player', p,
      { dmg: s.dmg, power: s.power, col: '#fcd820' }));
  }
  G.effects.push(new RingFx(p.cx, p.cy, 4, 18, '#fcd820', 0.3));
}
function emp(p, r = 64) { // РАЗРЯДНИК
  G.effects.push(new RingFx(p.cx, p.cy, 4, r, '#3cbcfc', 0.45), new RingFx(p.cx, p.cy, 2, r - 8, '#e8fcff', 0.4));
  for (const b of G.bullets) if (b.alive && b.team === 'enemy' && dist(b.x, b.y, p.cx, p.cy) < r) {
    G.effects.push(new Boom(b.x, b.y, 4, { pal: ICE_COLS, quiet: true })); b.kill();
  }
  for (const e of G.enemies) if (e.alive && dist(e.cx, e.cy, p.cx, p.cy) < r + 8) zap(p.cx, p.cy, e, 1, p, 1.8);
  if (bossLive()) { const a = bossAim(); if (dist(a.x, a.y, p.cx, p.cy) < r + 24) zap(p.cx, p.cy, 'boss', 2, p); }
  G.shake = Math.max(G.shake, 3);
}
function ballZap(b) { // ШАРОВАЯ МОЛНИЯ
  G.effects.push(new RingFx(b.x, b.y, 2, 9, '#e8fcff', 0.2));
  const t = findTarget(b.x, b.y, 80);
  if (t) zap(b.x, b.y, t, 1, b.owner);
}
