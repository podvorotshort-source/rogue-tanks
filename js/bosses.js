'use strict';
// ============================================================
//  BOSSES: Голиаф, Стрекоза, Сколопендра, Цитадель Омега,
//          Близнецы, Криомех, Скорпион, Фантом,
//          Инферно, Бур, Магнетрон, Улей; дуэты боссов
// ============================================================

function normA(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
function ellipse(g, cx, cy, rx, ry, col) {
  g.fillStyle = col; cx = Math.round(cx); cy = Math.round(cy);
  for (let dy = -ry; dy <= ry; dy++) { const dx = Math.round(rx * Math.sqrt(1 - (dy * dy) / (ry * ry))); g.fillRect(cx - dx, cy + dy, dx * 2 + 1, 1); }
}
// спрайт босса центром в (x, y), повёрнутый на a; (ox, oy) — сдвиг картинки относительно центра до поворота
// кадр прокрутки гусениц (у спрайта есть имя, имя_1, имя_2)
const trk = (k, v) => { const f = Math.floor(v) % 3; return f ? k + '_' + f : k; };
function drawArt(g, k, x, y, a = 0, fl = false, ox = 0, oy = 0) {
  const A = BossArt[k]; if (!A) return;
  const c = fl ? A.w : A.n;
  g.save(); g.translate(Math.round(x), Math.round(y)); if (a) g.rotate(a);
  g.drawImage(c, Math.round(ox - c.width / 2), Math.round(oy - c.height / 2));
  g.restore();
}
// снаряды боссов не гасят выстрелы игрока (сбить можно только ракеты с hp)
function enemyShot(x, y, a, sp, o = {}) { G.bullets.push(new Bullet(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 'enemy', null, { cancel: false, ...o })); }

class Boss {
  constructor(name, maxHp) {
    this.name = name; this.maxHp = maxHp; this.hp = maxHp;
    this.alive = true; this.dying = false; this.dieT = 0; this.flash = 0; this.t = 0; this.phase = 1; this.active = false;
  }
  blocks() { return false; }
  hitTest() { return null; }
  // сдвиг стартовой позиции (в дуэте боссы не должны появляться друг на друге)
  shift(dx, dy) {
    this.x += dx; this.y += dy;
    if (this.tx !== undefined) { this.tx += dx; this.ty += dy; }
    if (this.tgx !== undefined) { this.tgx += dx; this.tgy += dy; }
  }
  aim() { return { x: this.x, y: this.y }; } // куда целятся самонаводящиеся системы игроков
  damage(dmg) {
    if (!this.active || this.dying) return 'reflect';
    this.hp -= dmg; this.flash = 0.08;
    Sound.play('hit');
    if (this.hp <= 0) { this.hp = 0; this.startDeath(); }
    return 'ok';
  }
  startDeath() {
    if (this.dying) return;
    this.dying = true; this.dieT = 0;
    G.clearEnemyBullets();
    for (const e of G.enemies) if (e.alive) e.die(null);
    Sound.play('roar');
  }
  updateDeath(dt) {
    this.dieT += dt;
    const b = this.bounds();
    if (Math.random() < dt * 14) explode(rand(b.x, b.x + b.w), rand(b.y, b.y + b.h), randi(8, 16), { bricks: false, silent: Math.random() < 0.5 });
    G.shake = Math.max(G.shake, 2);
    if (this.dieT > 2.6) {
      explode(b.x + b.w / 2, b.y + b.h / 2, 40, { bricks: true });
      Sound.play('bigboom');
      G.shake = 10; G.flashT = 0.35;
      Input.rumble(0, 1, 1, 700); Input.rumble(1, 1, 1, 700);
      this.alive = false;
      if (this.parent) this.parent.subDown(this); else G.onBossKilled(this);
    }
  }
  pushPlayers(nx, ny, w, h, dx, dy, dmg) {
    // возвращает false, если игрока некуда сдвинуть
    for (const p of G.players) {
      if (p.dead || !overlap(nx, ny, w, h, p.x, p.y, 16, 16)) continue;
      p.hurt(dmg);
      const px = p.x + dx, py = p.y + dy;
      if (px >= 0 && py >= 0 && px + 16 <= FW && py + 16 <= FH && !G.level.tankBlocked(px, py, 16, 16)) { p.x = px; p.y = py; }
      else return false;
    }
    for (const e of G.enemies) if (e.alive && overlap(nx, ny, w, h, e.x, e.y, 16, 16)) e.die(null);
    return true;
  }
  drawGround() { }
  drawAir() { }
}

// ------------------------------------------------------------
//  1. ГОЛИАФ — сверхтяжёлый танк, давит кирпич, таранит
// ------------------------------------------------------------
class Goliath extends Boss {
  constructor(scale) {
    super('ГОЛИАФ', Math.round(70 * scale));
    this.x = FW / 2 - 24; this.y = -50; this.dir = 2; this.anim = 0; this.animT = 0;
    this.state = 'enter'; this.speed = 18; this.decideT = 1;
    this.mainT = 2; this.mgT = 3; this.burst = 0; this.burstT = 0;
    this.ringT = 4; this.minionT = 6; this.chargeT = 6; this.revT = 0;
  }
  get cx() { return this.x + 24; }
  get cy() { return this.y + 24; }
  aim() { return { x: this.cx, y: this.cy }; }
  bounds() { return { x: this.x, y: this.y, w: 48, h: 48 }; }
  blocks(x, y, w, h) { return this.alive && !this.dying && overlap(x, y, w, h, this.x + 1, this.y + 1, 46, 46); }
  hitTest(x, y, h) { return overlap(x - h, y - h, h * 2, h * 2, this.x + 2, this.y + 2, 44, 44) ? 'body' : null; }
  tread(dt) { this.animT += dt; if (this.animT > 0.07) { this.animT = 0; this.anim = (this.anim + 1) % 3; } }
  chooseDir(exact) {
    const t = G.nearestPlayer(this.cx, this.cy);
    if (!t || (!exact && Math.random() < 0.25)) { this.dir = randi(0, 3); return; }
    const dx = t.cx - this.cx, dy = t.cy - this.cy;
    this.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
  }
  step(want, charging) {
    let moved = 0;
    const L = G.level;
    while (want > 0.0001) {
      const s = Math.min(1, want);
      const nx = this.x + DX[this.dir] * s, ny = this.y + DY[this.dir] * s;
      if (nx < 0 || ny < 0 || nx + 48 > FW || ny + 48 > FH) return moved;
      const x0 = Math.floor(nx / CELL), y0 = Math.floor(ny / CELL), x1 = Math.floor((nx + 47.99) / CELL), y1 = Math.floor((ny + 47.99) / CELL);
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) { const t = L.get(cx, cy); if (t === T_STEEL || t === T_WATER) return moved; }
      if (L.destroyRect(nx, ny, 48, 48, false).brick) Sound.play('brick');
      if (!this.pushPlayers(nx + 1, ny + 1, 46, 46, DX[this.dir] * s, DY[this.dir] * s, charging ? 2 : 1)) return moved;
      this.x = nx; this.y = ny; want -= s; moved += s;
    }
    return moved;
  }
  update(dt) {
    this.t += dt; this.flash -= dt;
    if (this.dying) return this.updateDeath(dt);
    if (this.state === 'enter') {
      this.y += 22 * dt; this.tread(dt);
      G.level.destroyRect(this.x, Math.max(0, this.y), 48, Math.max(1, this.y + 48 - Math.max(0, this.y)), false);
      if (this.y >= 10) { this.y = 10; this.state = 'fight'; this.active = true; }
      return;
    }
    if (this.phase === 1 && this.hp < this.maxHp * 0.5) { this.phase = 2; this.speed = 26; this.chargeT = 2; G.banner('ГОЛИАФ В ЯРОСТИ!', '#f83800'); Sound.play('roar'); }
    if (this.phase === 2 && Math.random() < dt * 3) smoke(this.cx + rand(-12, 12), this.cy + rand(-12, 12));
    if (this.state === 'rev') {
      this.revT -= dt; this.tread(dt);
      if (Math.random() < 0.6) smoke(this.cx - DX[this.dir] * 22 + rand(-10, 10), this.cy - DY[this.dir] * 22 + rand(-10, 10));
      G.shake = Math.max(G.shake, 1.5);
      if (this.revT <= 0) { this.state = 'charge'; Sound.play('dash'); }
      return;
    }
    if (this.state === 'charge') {
      const want = 125 * dt, m = this.step(want, true);
      this.tread(dt);
      if (m < want * 0.5) {
        this.state = 'fight'; this.decideT = 0.6; G.shake = 7;
        explode(this.cx + DX[this.dir] * 26, this.cy + DY[this.dir] * 26, 16, { hurtPlayers: true });
      }
      return;
    }
    this.decideT -= dt;
    if (this.decideT <= 0) { this.chooseDir(false); this.decideT = rand(1.5, 3); }
    const want = this.speed * dt;
    if (this.step(want, false) < want * 0.5) this.decideT = Math.min(this.decideT, 0.15);
    this.tread(dt);

    this.mainT -= dt;
    if (this.mainT <= 0) { this.fireMain(); this.mainT = this.phase === 1 ? 2.3 : 1.6; }
    this.mgT -= dt;
    if (this.mgT <= 0) { this.burst = this.phase === 1 ? 5 : 7; this.mgT = this.phase === 1 ? 3.2 : 2.5; }
    if (this.burst > 0) { this.burstT -= dt; if (this.burstT <= 0) { this.burstT = 0.1; this.burst--; this.fireMG(); } }
    if (this.phase === 2) {
      this.ringT -= dt; if (this.ringT <= 0) { this.ringT = 5; G.ring(this.cx, this.cy, 16, 70, rand(0, 1), 'orb'); }
      this.minionT -= dt; if (this.minionT <= 0) { this.minionT = 10; G.spawnMinions(2, 'basic', this.cx, this.cy); }
      this.chargeT -= dt;
      if (this.chargeT <= 0) { this.chargeT = rand(7, 9); this.chooseDir(true); this.state = 'rev'; this.revT = 0.9; Sound.play('roar'); }
    }
  }
  fireMain() {
    const t = G.nearestPlayer(this.cx, this.cy);
    if (t) {
      const dx = t.cx - this.cx, dy = t.cy - this.cy;
      if (dx * DX[this.dir] + dy * DY[this.dir] < 0) this.chooseDir(true);
    }
    const bx = this.cx + DX[this.dir] * 26, by = this.cy + DY[this.dir] * 26;
    G.bullets.push(new Bullet(bx, by, DX[this.dir] * 160, DY[this.dir] * 160, 'enemy', null, { kind: 'big', size: 8, explosive: 14, cancel: false }));
    G.effects.push(new Boom(bx, by, 7, { quiet: true }));
    Sound.play('cannon');
  }
  fireMG() {
    const t = G.nearestPlayer(this.cx, this.cy);
    if (!t) return;
    for (const [ox, oy] of [[-12, -19], [11, -19]]) {
      let rx = ox, ry = oy;
      for (let i = 0; i < this.dir; i++) { const tmp = rx; rx = -ry; ry = tmp; }
      const gx = this.cx + rx, gy = this.cy + ry;
      enemyShot(gx, gy, angleTo(gx, gy, t.cx, t.cy) + rand(-0.08, 0.08), 135, { kind: 'small', size: 3 });
    }
    Sound.play('eshoot');
  }
  drawGround(g) {
    const A = BossArt[trk('goliath', this.anim)], T = BossArt.goliathTur, fl = this.flash > 0;
    for (const S of [A, T]) if (S) { const c = (fl ? S.rw : S.r)[this.dir]; g.drawImage(c, Math.round(this.x + 24 - c.width / 2), Math.round(this.y + 24 - c.height / 2)); } // башня в гнезде по центру
    if (this.state === 'rev' && Math.floor(this.t * 16) % 2) {
      const fx = this.cx + DX[this.dir] * 20, fy = this.cy + DY[this.dir] * 20;
      rect(g, Math.round(fx) - 2, Math.round(fy) - 2, 4, 4, '#f83800');
    }
  }
}

// ------------------------------------------------------------
//  2. СТРЕКОЗА — боевой вертолёт: ракеты, пулемёт, бомбардировка
// ------------------------------------------------------------
class Heli extends Boss {
  constructor(scale) {
    super('СТРЕКОЗА', Math.round(85 * scale));
    this.x = FW / 2; this.y = -40; this.vx = 0; this.vy = 0; this.rot = 0;
    this.state = 'enter'; this.tx = FW / 2; this.ty = 70; this.moveT = 3;
    this.rocketT = 2; this.sweepT = 4.5; this.bombT = 9; this.paraT = 6; this.sweep = null; this.bdir = 1; this.bombX = -999;
  }
  bounds() { return { x: this.x - 18, y: this.y - 24, w: 36, h: 46 }; }
  hitTest(x, y, h) {
    if (this.x < -12 || this.x > FW + 12 || this.y < -10) return null;
    if (overlap(x - h, y - h, h * 2, h * 2, this.x - 9, this.y - 24, 18, 45)) return 'body';
    if (overlap(x - h, y - h, h * 2, h * 2, this.x - 19, this.y - 2, 38, 12)) return 'body';
    return null;
  }
  update(dt) {
    this.t += dt; this.flash -= dt; this.rot += dt * (this.phase === 2 ? 26 : 20);
    if (this.dying) { this.y += 6 * dt; this.rot -= dt * 10; return this.updateDeath(dt); }
    if (this.state === 'enter') { this.y += 40 * dt; if (this.y >= 60) { this.state = 'hover'; this.active = true; } return; }
    if (this.phase === 1 && this.hp < this.maxHp * 0.5) { this.phase = 2; G.banner('СТРЕКОЗА: ФОРСАЖ!', '#f83800'); Sound.play('roar'); }
    const t = G.nearestPlayer(this.x, this.y);
    if (this.state === 'bombrun') {
      this.x += this.bdir * 125 * dt;
      this.y += (this.ty - this.y) * 2.5 * dt;
      if (Math.abs(this.x - this.bombX) >= 22 && this.x > 8 && this.x < FW - 8) {
        this.bombX = this.x;
        G.mortars.push(new Mortar(this.x, this.y + 4, this.x, clamp(this.y + 14, 8, FH - 8), 0.75, { r: 16, h: 4 }));
      }
      if ((this.bdir > 0 && this.x > FW + 40) || (this.bdir < 0 && this.x < -40)) {
        this.state = 'return'; this.vx = 0; this.vy = 0;
        this.tx = rand(60, FW - 60); this.ty = rand(40, 90);
      }
      return;
    }
    const k = 1.6, damp = 1.8;
    this.vx += ((this.tx - this.x) * k - this.vx * damp) * dt;
    this.vy += ((this.ty - this.y) * k - this.vy * damp) * dt;
    const maxv = this.state === 'return' ? 140 : this.phase === 2 ? 110 : 80, v = Math.hypot(this.vx, this.vy);
    if (v > maxv) { this.vx *= maxv / v; this.vy *= maxv / v; }
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.state === 'return') { if (dist(this.x, this.y, this.tx, this.ty) < 30) this.state = 'hover'; return; }
    this.moveT -= dt;
    if (this.moveT <= 0 || dist(this.x, this.y, this.tx, this.ty) < 10) {
      this.tx = clamp((t ? t.cx : FW / 2) + rand(-120, 120), 40, FW - 40);
      this.ty = rand(36, this.phase === 2 ? 150 : 110);
      this.moveT = rand(2, 3.5);
    }
    this.rocketT -= dt;
    if (this.rocketT <= 0 && t) { this.fireRockets(t); this.rocketT = this.phase === 1 ? 2.6 : 1.9; }
    this.sweepT -= dt;
    if (this.sweepT <= 0 && !this.sweep && t) {
      const a = angleTo(this.x, this.y + 22, t.cx, t.cy);
      this.sweep = { i: 0, n: this.phase === 1 ? 18 : 26, t: 0, a0: a - 0.7, a1: a + 0.7 };
      this.sweepT = this.phase === 1 ? 6.5 : 5;
    }
    if (this.sweep) {
      const S = this.sweep;
      S.t -= dt;
      if (S.t <= 0) {
        S.t = 0.05;
        enemyShot(this.x, this.y + 22, lerp(S.a0, S.a1, S.i / (S.n - 1)), 150, { kind: 'small', size: 3 });
        Sound.play('eshoot');
        if (++S.i >= S.n) this.sweep = null;
      }
    }
    this.bombT -= dt;
    if (this.bombT <= 0 && !this.sweep) {
      this.bombT = this.phase === 1 ? 11 : 8;
      this.bdir = this.x < FW / 2 ? 1 : -1;
      this.ty = clamp(t ? t.cy - 12 : FH / 2, 30, FH - 40);
      this.state = 'bombrun'; this.bombX = -999;
      Sound.play('missile');
    }
    if (this.phase === 2) { this.paraT -= dt; if (this.paraT <= 0) { this.paraT = 12; G.spawnMinions(2, 'fast', this.x, this.y + 16); } }
  }
  fireRockets(t) {
    const n = this.phase === 1 ? 1 : 2;
    for (const px of [-17, 17]) for (let i = 0; i < n; i++) {
      const sx = this.x + px, sy = this.y + 8;
      enemyShot(sx, sy, angleTo(sx, sy, t.cx, t.cy) + (n > 1 ? (i ? 0.15 : -0.15) : 0), 150, { kind: 'rocket', size: 4, explosive: 12, hp: 1, cancel: false, life: 3 });
    }
    Sound.play('missile');
  }
  drawGround(g) {
    if (this.y < -30) return;
    ellipse(g, this.x + 10, this.y + 22, 15, 6, 'rgba(0,0,0,0.45)');
  }
  drawAir(g) {
    const x = Math.round(this.x), y = Math.round(this.y);
    drawArt(g, 'heli', x, y, 0, this.flash > 0, 0, 2);
    // несущий винт: размытый след и сами лопасти
    g.globalAlpha = 0.3; drawArt(g, 'rotor', x, y - 1, this.rot - 0.35);
    g.globalAlpha = 0.9; drawArt(g, 'rotor', x, y - 1, this.rot);
    g.globalAlpha = 1;
    if (this.phase === 2 && Math.floor(this.t * 6) % 2) { rect(g, x - 18, y - 2, 2, 2, '#f83800'); rect(g, x + 16, y - 2, 2, 2, '#f83800'); }
  }
}

// ------------------------------------------------------------
//  3. СКОЛОПЕНДРА — механический червь из сегментов
// ------------------------------------------------------------
const WORM_GAP = 13;
class Worm extends Boss {
  constructor(scale) {
    super('СКОЛОПЕНДРА', Math.round(100 * scale));
    this.x = FW / 2; this.y = FH / 2 - 10; this.a = -Math.PI / 2;
    const segHp = Math.round(4 * Math.sqrt(scale));
    this.segs = []; for (let i = 0; i < 12; i++) this.segs.push({ hp: segHp, flash: 0 });
    this.trail = []; for (let i = 0; i < 100; i++) this.trail.push({ x: this.x, y: this.y + i * 2 });
    this.segPos = [];
    this.state = 'under'; this.under = true; this.underT = 1.8; this.diveSpeed = 0;
    this.spitT = 2; this.waveT = 3.5; this.wave = null; this.diveT = 8; this.tgtT = 0; this.tgx = FW / 2; this.tgy = FH / 2;
    this.layout();
  }
  bounds() {
    let x0 = this.x, y0 = this.y, x1 = this.x, y1 = this.y;
    for (const p of this.segPos) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    return { x: x0 - 8, y: y0 - 8, w: x1 - x0 + 16, h: y1 - y0 + 16 };
  }
  layout() {
    // расставить сегменты вдоль следа по длине дуги
    const tr = this.trail, pos = [];
    let acc = 0, i = 0, px = this.x, py = this.y;
    for (let s = 0; s < this.segs.length; s++) {
      const want = (s + 1) * WORM_GAP;
      while (i < tr.length) {
        const d = dist(px, py, tr[i].x, tr[i].y);
        if (acc + d >= want) {
          const k = (want - acc) / (d || 1);
          const nx = lerp(px, tr[i].x, k), ny = lerp(py, tr[i].y, k);
          acc = want; px = nx; py = ny;
          break;
        }
        acc += d; px = tr[i].x; py = tr[i].y; i++;
      }
      const prev = s === 0 ? { x: this.x, y: this.y } : pos[s - 1];
      pos.push({ x: px, y: py, a: Math.atan2(prev.y - py, prev.x - px) });
    }
    this.segPos = pos;
    // подрезать хвост следа
    const need = (this.segs.length + 2) * WORM_GAP;
    let L = 0;
    for (let j = 1; j < tr.length; j++) { L += dist(tr[j - 1].x, tr[j - 1].y, tr[j].x, tr[j].y); if (L > need) { tr.length = j + 1; break; } }
  }
  advance(dt, sp) {
    this.x = clamp(this.x + Math.cos(this.a) * sp * dt, 10, FW - 10);
    this.y = clamp(this.y + Math.sin(this.a) * sp * dt, 10, FH - 10);
    if (dist(this.x, this.y, this.trail[0].x, this.trail[0].y) >= 1.5) this.trail.unshift({ x: this.x, y: this.y });
    this.layout();
  }
  steer(dt, tx, ty, turn) { this.a += clamp(normA(angleTo(this.x, this.y, tx, ty) - this.a), -turn * dt, turn * dt); }
  emerge() {
    this.under = false; this.state = 'fight';
    explode(this.x, this.y, 24, { hurtPlayers: this.active });
    if (this.active) G.ring(this.x, this.y, 14, 80, rand(0, 1), 'orb');
    this.active = true;
    Sound.play('roar');
    this.diveT = rand(8, 10);
  }
  update(dt) {
    this.t += dt; this.flash -= dt;
    for (const s of this.segs) s.flash -= dt;
    if (this.dying) return this.updateDeath(dt);
    const t = G.nearestPlayer(this.x, this.y);
    if (this.state === 'under') {
      this.underT -= dt;
      if (this.active && t) { this.steer(dt, t.cx, t.cy, 3); this.advance(dt, 105); }
      if (Math.random() < 0.7) G.particles.push(new Particle(this.x + rand(-6, 6), this.y + rand(-6, 6), rand(-30, 30), rand(-30, 30), 0.4, pick(['#5c3c1c', '#8c6c3c', '#3c2810']), 2));
      G.shake = Math.max(G.shake, 1);
      if (this.underT <= 0) this.emerge();
      return;
    }
    if (this.phase === 1 && this.hp < this.maxHp * 0.5) { this.phase = 2; this.diveT = 1.5; G.banner('СКОЛОПЕНДРА ЗАРЫВАЕТСЯ!', '#f83800'); }
    this.tgtT -= dt;
    if (this.tgtT <= 0) {
      if (t && Math.random() < 0.65) { this.tgx = t.cx; this.tgy = t.cy; } else { this.tgx = rand(40, FW - 40); this.tgy = rand(40, FH - 40); }
      this.tgtT = rand(1.5, 3);
    }
    let tx = this.tgx, ty = this.tgy;
    if (this.x < 30 || this.x > FW - 30 || this.y < 30 || this.y > FH - 30) { tx = FW / 2; ty = FH / 2; }
    this.steer(dt, tx, ty, this.phase === 1 ? 1.7 : 2.3);
    this.advance(dt, this.phase === 1 ? 46 : 60);
    if (G.level.destroyCircle(this.x + Math.cos(this.a) * 4, this.y + Math.sin(this.a) * 4, 11, false)) Sound.play('brick');
    for (const p of G.players) {
      if (p.dead) continue;
      if (dist(this.x, this.y, p.cx, p.cy) < 18) { p.hurt(1); continue; }
      for (const s of this.segPos) if (dist(s.x, s.y, p.cx, p.cy) < 14) { p.hurt(1); break; }
    }
    for (const e of G.enemies) if (e.alive && dist(this.x, this.y, e.cx, e.cy) < 16) e.die(null);
    this.spitT -= dt;
    if (this.spitT <= 0 && t) {
      const a = angleTo(this.x, this.y, t.cx, t.cy);
      for (const o of [-0.25, 0, 0.25]) enemyShot(this.x + Math.cos(this.a) * 10, this.y + Math.sin(this.a) * 10, a + o, 110, { kind: 'orb', size: 5 });
      this.spitT = this.phase === 1 ? 1.9 : 1.4;
      Sound.play('eshoot');
    }
    this.waveT -= dt;
    if (this.waveT <= 0 && !this.wave) { this.wave = { i: 0, t: 0 }; this.waveT = this.phase === 1 ? 3.4 : 2.6; }
    if (this.wave) {
      this.wave.t -= dt;
      if (this.wave.t <= 0) {
        this.wave.t = 0.08;
        const p = this.segPos[this.wave.i];
        if (p) {
          for (const side of [-1, 1]) {
            const a = p.a + side * Math.PI / 2;
            enemyShot(p.x, p.y, a, 75, { kind: 'small', size: 3 });
            if (this.phase === 2) enemyShot(p.x, p.y, a + 0.35 * side, 75, { kind: 'small', size: 3 });
          }
          Sound.play('eshoot');
        }
        if (++this.wave.i >= this.segPos.length) this.wave = null;
      }
    }
    if (this.phase === 2) {
      this.diveT -= dt;
      if (this.diveT <= 0) { this.state = 'under'; this.under = true; this.underT = 2.6; this.wave = null; Sound.play('roar'); }
    }
  }
  hitTest(x, y, h) {
    if (this.under || !this.active) return null;
    if (dist(x, y, this.x, this.y) < 11 + h) return 'head';
    for (let i = 0; i < this.segPos.length; i++) { const p = this.segPos[i]; if (dist(x, y, p.x, p.y) < 7 + h) return this.segs[i]; }
    return null;
  }
  damage(dmg, part) {
    if (!this.active || this.dying) return 'reflect';
    if (part === 'head' || part === 'grenade' || !part) return super.damage(dmg);
    const i = this.segs.indexOf(part);
    if (i < 0) return 'reflect';
    part.hp -= dmg; part.flash = 0.08;
    Sound.play('hit');
    if (part.hp <= 0) {
      const p = this.segPos[i];
      this.segs.splice(i, 1);
      if (p) explode(p.x, p.y, 13, { bricks: false });
      this.layout();
      super.damage(5);
    }
    return 'ok';
  }
  drawGround(g) {
    if (this.under) {
      const j = Math.floor(this.t * 20) % 2;
      for (let i = this.segPos.length - 1; i >= 0; i--) { const p = this.segPos[i]; ellipse(g, p.x, p.y + j, 6, 3, '#3c2810'); rect(g, Math.round(p.x) - 2, Math.round(p.y) - 2, 3, 1, '#8c6c3c'); }
      ellipse(g, this.x, this.y + j, 9, 5, '#5c3c1c'); rect(g, Math.round(this.x) - 3, Math.round(this.y) - 3, 5, 2, '#8c6c3c');
      if (this.active && this.underT < 0.7) circle(g, this.x, this.y, 22, Math.floor(this.t * 16) % 2 ? '#f83800' : '#fcd820', 3);
      return;
    }
    const last = this.segPos.length - 1;
    for (let i = last; i >= 0; i--) {
      const p = this.segPos[i], s = this.segs[i];
      const wob = Math.sin(this.t * 14 + i * 1.3) * 0.08; // сегменты чуть покачиваются на ходу
      drawArt(g, i === last ? 'wormTail' : 'wormSeg', p.x, p.y, p.a + wob, s.flash > 0, i === last ? -2 : 0);
    }
    drawArt(g, 'wormHead', this.x, this.y, this.a, this.flash > 0, 2);
  }
}

// ------------------------------------------------------------
//  4. ЦИТАДЕЛЬ ОМЕГА — крепость с турелями, щитом ядра и лазером
// ------------------------------------------------------------
// турели стоят в гнёздах на картинке (ox, oy — левый верхний угол зоны 16x16)
const OMEGA_TURRETS = [
  { ox: 18, oy: 30, kind: 'cannon' }, { ox: 32, oy: -1, kind: 'mg' },
  { ox: 79, oy: -1, kind: 'mg' }, { ox: 94, oy: 30, kind: 'cannon' },
];
class Omega extends Boss {
  constructor(scale) {
    const th = Math.round(16 * scale), ch = Math.round(110 * scale);
    super('ЦИТАДЕЛЬ ОМЕГА', th * 4 + ch);
    this.deadText = 'ЦИТАДЕЛЬ ОМЕГА УНИЧТОЖЕНА';
    this.x = (FW - 128) / 2; this.y = -60; this.vx = 0; this.anim = 0; this.animT = 0;
    this.turrets = OMEGA_TURRETS.map(t => ({ ...t, hp: th, max: th, dead: false, a: Math.PI / 2, cool: rand(1, 2.5), flash: 0, burst: 0, burstT: 0 }));
    this.core = { hp: ch, max: ch, flash: 0 };
    this.state = 'enter'; this.missileT = 6; this.laser = null; this.laserT = 4;
    this.ringT = 3; this.ring2 = 0; this.ringOff = 0; this.spiralT = 5; this.spiral = null; this.kamiT = 5;
  }
  get coreX() { return this.x + 64; }
  get coreY() { return this.y + 13; }
  aim() { const t = this.turrets.find(q => !q.dead); return t ? { x: this.x + t.ox + 8, y: this.y + t.oy + 8 } : { x: this.coreX, y: this.coreY }; }
  bounds() { return { x: this.x, y: this.y, w: 128, h: 56 }; }
  blocks(x, y, w, h) { return this.alive && !this.dying && overlap(x, y, w, h, this.x, this.y, 128, 56); }
  hitTest(x, y, h) {
    if (!overlap(x - h, y - h, h * 2, h * 2, this.x, this.y, 128, 56)) return null;
    // зоны турелей и ядра тянутся до нижнего края, чтобы их можно было достать снизу
    for (const t of this.turrets) if (!t.dead && overlap(x - h, y - h, h * 2, h * 2, this.x + t.ox - 1, this.y + t.oy - 1, 18, 58 - t.oy)) return t;
    if (overlap(x - h, y - h, h * 2, h * 2, this.x + 50, this.y + 8, 28, 50)) return 'core';
    return 'armor';
  }
  damage(dmg, part) {
    if (!this.active || this.dying) return 'reflect';
    if (part === 'grenade') {
      if (this.phase === 1) { for (const t of this.turrets) if (!t.dead) this.hitTurret(t, 5); } else this.hitCore(10);
      return 'ok';
    }
    if (part === 'armor' || !part) return 'reflect';
    if (part === 'core') { if (this.phase === 1) return 'reflect'; this.hitCore(dmg); return 'ok'; }
    this.hitTurret(part, dmg);
    return 'ok';
  }
  hitTurret(t, dmg) {
    if (t.dead) return;
    const d = Math.min(t.hp, dmg);
    t.hp -= d; this.hp -= d; t.flash = 0.08;
    Sound.play('hit');
    if (t.hp <= 0) {
      t.dead = true;
      explode(this.x + t.ox + 8, this.y + t.oy + 8, 16, { bricks: false });
      if (this.turrets.every(q => q.dead)) this.toPhase2();
    }
  }
  hitCore(dmg) {
    const d = Math.min(this.core.hp, dmg);
    this.core.hp -= d; this.hp -= d; this.core.flash = 0.08;
    Sound.play('hit');
    if (this.core.hp <= 0) { this.hp = 0; this.startDeath(); }
    else if (this.phase === 2 && this.core.hp < this.core.max * 0.4) { this.phase = 3; G.banner('ОМЕГА: КРИТИЧЕСКИЙ РЕЖИМ!', '#f83800'); Sound.play('roar'); }
  }
  toPhase2() {
    this.phase = 2; this.vx = 30; this.laserT = 2.5;
    G.banner('ЩИТ ЯДРА ОТКЛЮЧЁН!', '#3cbcfc');
    G.effects.push(new RingFx(this.coreX, this.coreY, 6, 40, '#3cbcfc', 0.6));
    Sound.play('roar');
  }
  treads(dt) { this.animT += dt; if (this.animT > 0.08) { this.animT = 0; this.anim = (this.anim + 1) % 3; } }
  update(dt) {
    this.t += dt; this.flash -= dt; this.core.flash -= dt;
    for (const t of this.turrets) t.flash -= dt;
    if (this.dying) return this.updateDeath(dt);
    if (this.state === 'enter') { this.y += 25 * dt; this.treads(dt); if (this.y >= 6) { this.y = 6; this.state = 'fight'; this.active = true; } return; }
    const tgt = G.nearestPlayer(this.coreX, this.coreY + 30);
    for (const t of this.turrets) {
      if (t.dead) { if (Math.random() < dt * 4) smoke(this.x + t.ox + 8, this.y + t.oy + 6); continue; }
      const tx = this.x + t.ox + 8, ty = this.y + t.oy + 8;
      if (tgt) t.a += clamp(normA(angleTo(tx, ty, tgt.cx, tgt.cy) - t.a), -2.5 * dt, 2.5 * dt);
      t.cool -= dt;
      if (t.cool <= 0) {
        if (t.kind === 'cannon') {
          enemyShot(tx + Math.cos(t.a) * 10, ty + Math.sin(t.a) * 10, t.a, 130, { kind: 'big', size: 8, explosive: 12, cancel: false });
          Sound.play('cannon'); t.cool = rand(2.2, 2.8);
        } else { t.burst = 4; t.cool = rand(3, 3.6); }
      }
      if (t.burst > 0) {
        t.burstT -= dt;
        if (t.burstT <= 0) { t.burstT = 0.09; t.burst--; enemyShot(tx + Math.cos(t.a) * 9, ty + Math.sin(t.a) * 9, t.a + rand(-0.06, 0.06), 150, { kind: 'small', size: 3 }); Sound.play('eshoot'); }
      }
    }
    this.missileT -= dt;
    if (this.missileT <= 0) {
      this.missileT = this.phase === 1 ? 7 : 8;
      for (const sx of [27, 101]) G.bullets.push(new Bullet(this.x + sx, this.y + 12, sx < 64 ? -50 : 50, 50, 'enemy', null, { kind: 'missile', size: 5, homing: 2.2, explosive: 14, hp: 1, cancel: false, life: 7 }));
      Sound.play('missile');
    }
    if (this.phase >= 2) {
      const sp = this.laser && this.laser.fire ? 0.35 : 1;
      const dx = this.vx * sp * dt * (this.phase === 3 ? 1.4 : 1);
      let nx = this.x + dx;
      if (nx < 8) { nx = 8; this.vx = Math.abs(this.vx); }
      if (nx > FW - 136) { nx = FW - 136; this.vx = -Math.abs(this.vx); }
      if (this.pushPlayers(nx, this.y, 128, 56, nx - this.x, 0, 1)) this.x = nx; else this.vx = -this.vx;
      this.treads(dt);
      if (!this.laser) {
        this.laserT -= dt;
        if (this.laserT <= 0) { this.laser = { t: 0, charge: 1.1, fire: false, dur: 1.6 }; Sound.play('charge'); }
      } else {
        const L = this.laser;
        L.t += dt;
        if (!L.fire && L.t >= L.charge) { L.fire = true; L.t = 0; Sound.play('laser'); G.shake = 4; }
        if (L.fire) {
          const lx = this.coreX - 6, ly = this.y + 56;
          G.level.destroyRect(lx, ly, 12, FH - ly, true);
          for (const p of G.players) if (!p.dead && overlap(p.x, p.y, 16, 16, lx, ly, 12, FH)) p.hurt(1);
          for (const e of G.enemies) if (e.alive && overlap(e.x, e.y, 16, 16, lx, ly, 12, FH)) e.die(null);
          G.shake = Math.max(G.shake, 1.5);
          if (L.t >= L.dur) { this.laser = null; this.laserT = this.phase === 3 ? 3.5 : 5; }
        }
      }
      this.ringT -= dt;
      if (this.ringT <= 0) { this.ringT = this.phase === 3 ? 3 : 4; this.ringOff = rand(0, 1); G.ring(this.coreX, this.y + 50, 18, 75, this.ringOff, 'orb'); this.ring2 = 0.3; }
      if (this.ring2 > 0) { this.ring2 -= dt; if (this.ring2 <= 0) G.ring(this.coreX, this.y + 50, 18, 75, this.ringOff + 0.5, 'orb'); }
    }
    if (this.phase === 3) {
      this.kamiT -= dt;
      if (this.kamiT <= 0) { this.kamiT = 9; G.spawnMinions(2, 'kamikaze', this.coreX, this.y + 76); }
      this.spiralT -= dt;
      if (!this.spiral && this.spiralT <= 0) { this.spiral = { t: 0, e: 0 }; this.spiralT = 7; }
      if (this.spiral) {
        const S = this.spiral;
        S.t += dt; S.e -= dt;
        if (S.e <= 0) {
          S.e = 0.09;
          const base = Math.PI / 2 + Math.sin(S.t * 3) * 1.1;
          for (const o of [-0.6, 0, 0.6]) enemyShot(this.coreX, this.y + 52, base + o, 90, { kind: 'orb', size: 5 });
          Sound.play('eshoot');
        }
        if (S.t > 2.5) this.spiral = null;
      }
    }
  }
  drawGround(g) {
    const x = Math.round(this.x), y = Math.round(this.y);
    const base = trk('omega', this.anim);
    drawArt(g, base, x + 64, y + 28);
    if (this.flash > 0) { g.globalAlpha = 0.5; drawArt(g, base, x + 64, y + 28, 0, true); g.globalAlpha = 1; }
    // ядро
    const cx = x + 64, cy = y + 13;
    drawArt(g, 'omCore', cx, cy, 0, this.core.flash > 0);
    if (this.phase === 2 && Math.floor(this.t * 8) % 2) disc(g, cx, cy - 2, 3, '#fcfcfc'); // щит снят — ядро мигает
    if (this.phase === 1) {
      circle(g, cx, cy, 13 + Math.sin(this.t * 6), Math.floor(this.t * 10) % 2 ? '#3cbcfc' : '#a4e4fc', 2);
      circle(g, cx, cy, 15, '#3c78f8', 3);
    }
    // турели
    for (const t of this.turrets) {
      const tx = x + t.ox + 8, ty = y + t.oy + 8;
      if (t.dead) { disc(g, tx, ty, 6, '#141414'); rect(g, tx - 3, ty - 1, 2, 2, '#3c3c3c'); rect(g, tx + 2, ty + 1, 2, 1, '#f83800'); continue; }
      drawArt(g, t.kind === 'cannon' ? 'omCannon' : 'omMg', tx, ty, t.a, t.flash > 0);
      const hp = t.hp / t.max;
      rect(g, x + t.ox, y + t.oy - 3, 16, 2, '#200000'); rect(g, x + t.ox, y + t.oy - 3, Math.round(16 * hp), 2, '#f83800');
    }
    // лазер
    if (this.laser) {
      const L = this.laser, lx = cx, ly = y + 56;
      if (!L.fire) {
        if (Math.floor(L.t * 20) % 2) { rect(g, lx, ly, 1, FH - ly, '#f83800'); }
        disc(g, lx, ly - 2, 2 + L.t * 3, '#fcd820');
      } else {
        const wv = Math.floor(this.t * 30) % 2;
        rect(g, lx - 6 - wv, ly, 12 + wv * 2, FH - ly, '#d82800');
        rect(g, lx - 4, ly, 8, FH - ly, '#fcd820');
        rect(g, lx - 2 + wv, ly, 4 - wv * 2, FH - ly, '#fcfcfc');
        disc(g, lx, ly, 8, '#fcd820'); disc(g, lx, ly, 5, '#fcfcfc');
      }
    }
  }
}

// ------------------------------------------------------------
//  5. БЛИЗНЕЦЫ — два средних танка: берут в клещи, выживший впадает в ярость
// ------------------------------------------------------------
class Twins extends Boss {
  constructor(scale) {
    const th = Math.round(38 * scale);
    super('БЛИЗНЕЦЫ', th * 2);
    this.twins = [0, 1].map(i => ({
      i, x: i ? FW / 2 + 28 : FW / 2 - 60, y: -36 - i * 16, dir: 2, hp: th, max: th, dead: false, flash: 0,
      anim: 0, animT: 0, decideT: rand(0.4, 1.2), stuck: false, shotT: 1.6 + i * 0.9,
    }));
    this.state = 'enter'; this.pincerT = 8; this.pincer = 0; this.ringT = 4; this.rage = false;
  }
  living() { return this.twins.filter(t => !t.dead); }
  aim() { const t = this.living()[0] || this.twins[0]; return { x: t.x + 16, y: t.y + 16 }; }
  bounds() {
    const L = this.living().length ? this.living() : this.twins;
    const x0 = Math.min(...L.map(t => t.x)), y0 = Math.min(...L.map(t => t.y));
    return { x: x0, y: y0, w: Math.max(...L.map(t => t.x)) - x0 + 32, h: Math.max(...L.map(t => t.y)) - y0 + 32 };
  }
  blocks(x, y, w, h) { return this.alive && !this.dying && this.twins.some(t => !t.dead && overlap(x, y, w, h, t.x + 1, t.y + 1, 30, 30)); }
  hitTest(x, y, h) {
    for (const t of this.twins) if (!t.dead && overlap(x - h, y - h, h * 2, h * 2, t.x + 1, t.y + 1, 30, 30)) return t;
    return null;
  }
  damage(dmg, part) {
    if (!this.active || this.dying) return 'reflect';
    if (part && typeof part === 'object') this.hitTwin(part, dmg);
    else { const L = this.living(); for (const t of L) this.hitTwin(t, dmg / L.length); } // граната — поровну обоим
    return 'ok';
  }
  hitTwin(t, dmg) {
    if (t.dead) t = this.living()[0];
    if (!t) return;
    const d = Math.min(t.hp, dmg);
    t.hp -= d; this.hp -= d; t.flash = 0.08;
    Sound.play('hit');
    if (t.hp > 0) return;
    t.dead = true;
    explode(t.x + 16, t.y + 16, 24, { bricks: false });
    if (!this.living().length) { this.hp = 0; this.startDeath(); return; }
    this.rage = true; this.pincer = 0;
    for (const q of this.living()) q.shotT = 0.6;
    G.banner('БЛИЗНЕЦ В ЯРОСТИ!', '#f83800'); Sound.play('roar');
  }
  stepTwin(t, want) {
    const L = G.level, o = this.twins[1 - t.i];
    let moved = 0;
    while (want > 0.0001) {
      const s = Math.min(1, want), nx = t.x + DX[t.dir] * s, ny = t.y + DY[t.dir] * s;
      if (nx < 0 || ny < 0 || nx + 32 > FW || ny + 32 > FH) return moved;
      const x0 = Math.floor(nx / CELL), y0 = Math.floor(ny / CELL), x1 = Math.floor((nx + 31.99) / CELL), y1 = Math.floor((ny + 31.99) / CELL);
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) { const c = L.get(cx, cy); if (c === T_STEEL || c === T_WATER) return moved; }
      if (!o.dead && overlap(nx, ny, 32, 32, o.x, o.y, 32, 32)) return moved;
      if (L.destroyRect(nx, ny, 32, 32, false).brick) Sound.play('brick');
      if (!this.pushPlayers(nx + 1, ny + 1, 30, 30, DX[t.dir] * s, DY[t.dir] * s, 1)) return moved;
      t.x = nx; t.y = ny; want -= s; moved += s;
    }
    return moved;
  }
  tread(t, dt) { t.animT += dt; if (t.animT > 0.08) { t.animT = 0; t.anim = (t.anim + 1) % 3; } }
  update(dt) {
    this.t += dt; this.flash -= dt;
    for (const t of this.twins) t.flash -= dt;
    if (this.dying) return this.updateDeath(dt);
    if (this.state === 'enter') {
      let done = true;
      for (const t of this.twins) {
        if (t.y >= 10) { t.y = 10; continue; }
        done = false; t.y = Math.min(10, t.y + 26 * dt); this.tread(t, dt);
        if (t.y > -32) G.level.destroyRect(t.x, Math.max(0, t.y), 32, t.y + 32 - Math.max(0, t.y), false);
      }
      if (done) { this.state = 'fight'; this.active = true; }
      return;
    }
    if (this.phase === 1 && this.hp < this.maxHp * 0.5) this.phase = 2;
    for (const t of this.twins) if (t.dead && Math.random() < dt * 5) smoke(t.x + rand(6, 26), t.y + rand(6, 26));
    // клещи: оба замирают и бьют веером с двух сторон
    if (!this.rage) {
      this.pincerT -= dt;
      if (this.pincerT <= 0 && !this.pincer) { this.pincer = 0.8; Sound.play('charge'); }
      if (this.pincer > 0) {
        this.pincer -= dt;
        if (this.pincer <= 0) {
          this.pincer = 0; this.pincerT = this.phase === 1 ? 8 : 6;
          for (const t of this.living()) {
            const tg = G.nearestPlayer(t.x + 16, t.y + 16);
            if (!tg) continue;
            const a = angleTo(t.x + 16, t.y + 16, tg.cx, tg.cy), n = this.phase === 1 ? 5 : 7;
            for (let k = 0; k < n; k++) enemyShot(t.x + 16, t.y + 16, a + (k - (n - 1) / 2) * 0.16, 120, { kind: 'small', size: 3 });
          }
          Sound.play('cannon');
        }
        return;
      }
    } else {
      this.ringT -= dt;
      const t = this.living()[0];
      if (t && this.ringT <= 0) { this.ringT = 4.5; G.ring(t.x + 16, t.y + 16, 14, 75, rand(0, 1), 'small'); }
      if (t && Math.random() < dt * 4) smoke(t.x + rand(6, 26), t.y + rand(6, 26));
    }
    for (const t of this.living()) this.driveTwin(t, dt);
  }
  driveTwin(t, dt) {
    const tg = G.nearestPlayer(t.x + 16, t.y + 16);
    const dx = tg ? tg.cx - t.x - 16 : 0, dy = tg ? tg.cy - t.y - 16 : 0;
    t.decideT -= dt;
    if (t.decideT <= 0) {
      t.decideT = rand(0.8, 1.8);
      if (t.stuck || !tg || Math.random() < 0.15) { t.stuck = false; t.dir = randi(0, 3); }
      // первый выходит на линию цели по горизонтали, второй — по вертикали: перекрёстный огонь
      else if (t.i === 0 || this.rage) t.dir = Math.abs(dy) > 10 ? (dy > 0 ? 2 : 0) : (dx > 0 ? 1 : 3);
      else t.dir = Math.abs(dx) > 10 ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
    }
    const want = (this.rage ? 36 : this.phase === 2 ? 28 : 22) * dt;
    if (this.stepTwin(t, want) < want * 0.5) { t.stuck = true; t.decideT = Math.min(t.decideT, 0.25); }
    this.tread(t, dt);
    t.shotT -= dt;
    const cd = this.rage ? 1.0 : this.phase === 2 ? 1.5 : 1.9;
    const aligned = tg && ((t.dir & 1) ? Math.abs(dy) < 12 && dx * DX[t.dir] > 0 : Math.abs(dx) < 12 && dy * DY[t.dir] > 0);
    if (t.shotT <= 0 || (aligned && t.shotT < cd * 0.5)) {
      t.shotT = cd;
      const bx = t.x + 16 + DX[t.dir] * 18, by = t.y + 16 + DY[t.dir] * 18, a = Math.atan2(DY[t.dir], DX[t.dir]);
      for (const o of this.rage ? [-0.22, 0, 0.22] : [0]) enemyShot(bx, by, a + o, 150, { kind: 'big', size: 6, cancel: true });
      G.effects.push(new Boom(bx, by, 5, { quiet: true }));
      Sound.play('cannon');
    }
  }
  drawGround(g) {
    for (const t of this.twins) {
      const x = Math.round(t.x), y = Math.round(t.y);
      if (t.dead) { rect(g, x + 3, y + 3, 26, 26, '#1c1c1c'); rect(g, x + 8, y + 8, 16, 16, '#2c2c2c'); rect(g, x + 12, y + 2, 4, 10, '#1c1c1c'); continue; }
      const A = BossArt[trk(t.i ? 'twinB' : 'twinA', t.anim)], T = BossArt[t.i ? 'twinTurB' : 'twinTurA'], fl = t.flash > 0;
      for (const S of [A, T]) if (S) { const c = (fl ? S.rw : S.r)[t.dir]; g.drawImage(c, x + 16 - c.width / 2, y + 16 - c.height / 2); }
      if (this.pincer > 0 && Math.floor(this.t * 16) % 2) rect(g, x + 14, y + 14, 4, 4, '#fcfcfc');
      if (this.active) { rect(g, x + 4, y - 4, 24, 2, '#200000'); rect(g, x + 4, y - 4, Math.round(24 * t.hp / t.max), 2, t.i ? '#3cbcfc' : '#f83800'); }
    }
  }
}

// ------------------------------------------------------------
//  6. КРИОМЕХ — шагоход: щит из ледяных кристаллов, метель, сосульки, лёд под ногами
// ------------------------------------------------------------
class Cryo extends Boss {
  constructor(scale) {
    super('КРИОМЕХ', Math.round(95 * scale));
    this.x = FW / 2; this.y = -30; this.state = 'enter'; this.gunA = Math.PI / 2; this.walk = 0;
    this.tx = FW / 2; this.ty = 60; this.moveT = 2; this.frostT = 0;
    this.crHp = Math.round(4 * Math.sqrt(scale)); this.crystals = []; this.orbA = 0; this.regrowT = 0;
    this.shardT = 2; this.stormT = 6; this.storm = null; this.rainT = 4; this.volleyT = 8;
    this.makeCrystals(4);
  }
  makeCrystals(n) {
    this.crystals = [];
    for (let i = 0; i < n; i++) this.crystals.push({ hp: this.crHp, flash: 0, k: i / n, x: this.x, y: this.y });
    this.placeCrystals();
  }
  placeCrystals() { for (const c of this.crystals) { const a = this.orbA + c.k * Math.PI * 2; c.x = this.x + Math.cos(a) * 28; c.y = this.y + Math.sin(a) * 28; } }
  bounds() { return { x: this.x - 20, y: this.y - 20, w: 40, h: 40 }; }
  blocks(x, y, w, h) { return this.alive && !this.dying && overlap(x, y, w, h, this.x - 15, this.y - 15, 30, 30); }
  hitTest(x, y, h) {
    if (!this.active) return null;
    for (const c of this.crystals) if (dist(x, y, c.x, c.y) < 4 + h) return c;
    return dist(x, y, this.x, this.y) < 16 + h ? 'body' : null;
  }
  damage(dmg, part) {
    if (!this.active || this.dying) return 'reflect';
    if (part === 'grenade') for (const c of this.crystals.slice()) this.breakCrystal(c);
    else if (part && typeof part === 'object') {
      if (!this.crystals.includes(part)) return 'reflect';
      part.hp -= dmg; part.flash = 0.08;
      Sound.play('hit');
      if (part.hp <= 0) { this.breakCrystal(part); return super.damage(2); }
      return 'ok';
    }
    return super.damage(dmg);
  }
  breakCrystal(c) {
    this.crystals.splice(this.crystals.indexOf(c), 1);
    G.effects.push(new Boom(c.x, c.y, 9, { pal: ICE_COLS }));
    Sound.play('ice');
    if (!this.crystals.length) this.regrowT = this.phase === 1 ? 9 : 6;
  }
  // клетки пола вокруг точки покрываются льдом
  frost(x, y, r) {
    const L = G.level;
    for (let cy = Math.floor((y - r) / CELL); cy <= Math.floor((y + r) / CELL); cy++)
      for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++)
        if (L.get(cx, cy) === T_EMPTY && dist(cx * CELL + 4, cy * CELL + 4, x, y) < r) L.set(cx, cy, T_ICE);
  }
  update(dt) {
    this.t += dt; this.flash -= dt;
    for (const c of this.crystals) c.flash -= dt;
    if (this.dying) return this.updateDeath(dt);
    this.orbA += dt * (this.phase === 2 ? 2.2 : 1.4);
    this.placeCrystals();
    if (this.state === 'enter') {
      this.y += 30 * dt; this.walk += dt * 6;
      if (this.y >= 56) {
        this.y = 56; this.state = 'fight'; this.active = true; G.shake = 5;
        G.level.destroyCircle(this.x, this.y, 20, false); this.frost(this.x, this.y, 44);
        G.effects.push(new RingFx(this.x, this.y, 10, 50, '#a4e4fc', 0.5));
      }
      return;
    }
    if (this.phase === 1 && this.hp < this.maxHp * 0.5) {
      this.phase = 2; this.makeCrystals(6); this.regrowT = 0; this.volleyT = 4;
      G.banner('КРИОМЕХ: АБСОЛЮТНЫЙ НОЛЬ!', '#3cbcfc'); Sound.play('roar');
      G.ring(this.x, this.y, 18, 85, rand(0, 1), 'ice'); this.frost(this.x, this.y, 60);
    }
    const tg = G.nearestPlayer(this.x, this.y);
    // ходьба: держится на дистанции от цели, перешагивает стены, давит кирпич
    this.moveT -= dt;
    if (this.moveT <= 0) {
      this.moveT = rand(2, 3.5);
      if (tg) { const a = rand(0, Math.PI * 2), r = rand(60, 100); this.tx = clamp(tg.cx + Math.cos(a) * r, 24, FW - 24); this.ty = clamp(tg.cy + Math.sin(a) * r, 24, FH - 24); }
    }
    const sp = (this.phase === 1 ? 26 : 36) * dt, d = dist(this.x, this.y, this.tx, this.ty);
    if (d > 2) {
      const a = angleTo(this.x, this.y, this.tx, this.ty), nx = this.x + Math.cos(a) * Math.min(sp, d), ny = this.y + Math.sin(a) * Math.min(sp, d);
      if (this.pushPlayers(nx - 15, ny - 15, 30, 30, nx - this.x, ny - this.y, 1)) { this.x = nx; this.y = ny; this.walk += dt * 8; }
      else this.moveT = Math.min(this.moveT, 0.3);
      if (G.level.destroyCircle(this.x, this.y, 17, false)) Sound.play('brick');
    }
    this.frostT -= dt;
    if (this.frostT <= 0) { this.frostT = 0.25; this.frost(this.x, this.y, this.phase === 1 ? 18 : 26); }
    for (const p of G.players) if (!p.dead && this.crystals.some(c => dist(c.x, c.y, p.cx, p.cy) < 10)) p.hurt(1);
    if (this.regrowT > 0) {
      this.regrowT -= dt;
      if (this.regrowT <= 0) { this.makeCrystals(this.phase === 1 ? 4 : 6); Sound.play('ice'); G.effects.push(new RingFx(this.x, this.y, 30, 10, '#a4e4fc', 0.4)); }
    }
    if (tg) this.gunA += clamp(normA(angleTo(this.x, this.y, tg.cx, tg.cy) - this.gunA), -3 * dt, 3 * dt);
    // прицельный веер осколков
    this.shardT -= dt;
    if (this.shardT <= 0 && tg && !this.storm) {
      this.shardT = this.phase === 1 ? 1.7 : 1.25;
      const gx = this.x + Math.cos(this.gunA) * 16, gy = this.y + Math.sin(this.gunA) * 16;
      for (const o of [-0.2, 0, 0.2]) enemyShot(gx, gy, this.gunA + o, 140, { kind: 'ice', size: 4 });
      Sound.play('eshoot');
    }
    // метель: спираль осколков
    this.stormT -= dt;
    if (this.stormT <= 0 && !this.storm) { this.storm = { t: 0, e: 0 }; this.stormT = this.phase === 1 ? 7 : 5.5; }
    if (this.storm) {
      const S = this.storm;
      S.t += dt; S.e -= dt;
      if (S.e <= 0) {
        S.e = 0.08;
        const arms = this.phase === 1 ? 2 : 3;
        for (let k = 0; k < arms; k++) enemyShot(this.x, this.y, S.t * 3.2 + k / arms * Math.PI * 2, 80, { kind: 'ice', size: 4 });
        Sound.play('eshoot');
      }
      if (S.t > 2.2) this.storm = null;
    }
    // сосульки с неба: метки под игроками
    this.rainT -= dt;
    if (this.rainT <= 0) {
      this.rainT = this.phase === 1 ? 5 : 3.8;
      const alive = G.players.filter(p => !p.dead);
      for (let k = 0; k < (this.phase === 1 ? 3 : 5) && alive.length; k++) {
        const p = alive[k % alive.length], ix = clamp(p.cx + rand(-34, 34), 8, FW - 8), iy = clamp(p.cy + rand(-34, 34), 8, FH - 8);
        G.mortars.push(new Mortar(ix, -10, ix, iy, 1.2 + k * 0.12, { r: 12, h: 0, pal: ICE_COLS, col: '#a4e4fc' }));
        later(1.2 + k * 0.12, () => this.frost(ix, iy, 12));
      }
      Sound.play('mortar');
    }
    // вторая фаза: кристаллы щита срываются с орбиты и летят в цель
    if (this.phase === 2 && this.crystals.length) {
      this.volleyT -= dt;
      if (this.volleyT <= 0 && tg) {
        this.volleyT = 8;
        for (const c of this.crystals) {
          const a = angleTo(c.x, c.y, tg.cx, tg.cy);
          G.bullets.push(new Bullet(c.x, c.y, Math.cos(a) * 115, Math.sin(a) * 115, 'enemy', null, { kind: 'ice', size: 6, hp: 1, cancel: false, homing: 1.2, life: 4 }));
        }
        this.crystals = []; this.regrowT = 4;
        Sound.play('missile');
      }
    }
  }
  drawGround(g) {
    const fl = this.flash > 0;
    drawArt(g, trk('cryo', this.walk), this.x, this.y, 0, fl);
    drawArt(g, 'cryoTur', this.x, this.y, this.gunA, fl);
    if (this.phase === 2) circle(g, this.x, this.y, 21, Math.floor(this.t * 8) % 2 ? '#a4e4fc' : '#3cbcfc', 3);
  }
  drawAir(g) {
    for (const c of this.crystals) {
      drawArt(g, 'crystal', c.x, c.y, 0, c.flash > 0);
    }
  }
}

// ------------------------------------------------------------
//  7. СКОРПИОН — лобовая броня (бить в бок, спину и жало), рывок, кислота.
//     Одному тоже можно: поворачивается медленно (можно обойти сбоку),
//     перед рывком и после него раскрывает пасть (×2), после рывка оглушён,
//     а лобовой панцирь трескается от попаданий и на время открывается.
// ------------------------------------------------------------
class Scorpion extends Boss {
  constructor(scale) {
    super('СКОРПИОН', Math.round(100 * scale));
    this.x = FW / 2; this.y = -30; this.a = Math.PI / 2; this.state = 'enter'; this.walk = 0;
    this.snapT = 1; this.clawT = 0; this.lungeT = 5; this.lunge = null; this.acidT = 3; this.stingT = 4.5; this.sting = 0;
    this.minionT = 12; this.tgtT = 0; this.tgx = FW / 2; this.tgy = FH / 2; this.pools = []; this.msgT = 0;
    this.stun = 0; this.crack = 0; this.cracked = 0;
  }
  // пасть раскрыта: замах перед рывком и оглушение после него
  mouthOpen() { return this.stun > 0 || (this.lunge && !this.lunge.go); }
  world(lx, ly) { const c = Math.cos(this.a), s = Math.sin(this.a); return { x: this.x + lx * c - ly * s, y: this.y + lx * s + ly * c }; }
  tailPts() {
    const pts = [];
    // по дуге нарисованного хвоста: от кормы к жалу над правым боком
    const sw = Math.sin(this.t * 2) * 1.5;
    for (let i = 1; i <= 6; i++) { const k = i / 6, a = Math.PI * (1 - k * 0.75); pts.push(this.world(-8 + Math.cos(a) * 14 + sw * k, -4 - Math.sin(a) * 12 * k - k * 4)); }
    return pts;
  }
  aim() { return this.world(-4, 0); }
  bounds() { return { x: this.x - 28, y: this.y - 28, w: 56, h: 56 }; }
  blocks(x, y, w, h) { return this.alive && !this.dying && overlap(x, y, w, h, this.x - 14, this.y - 14, 28, 28); }
  hitTest(x, y, h) {
    if (!this.active) return null;
    const P = this.tailPts(), tip = P[P.length - 1];
    if (dist(x, y, tip.x, tip.y) < 5 + h) return 'tail';
    const c = Math.cos(this.a), s = Math.sin(this.a), fw = (x - this.x) * c + (y - this.y) * s, side = -(x - this.x) * s + (y - this.y) * c;
    if (this.mouthOpen() && fw > 5 && Math.abs(side) < 9 && dist(x, y, this.x, this.y) < 26 + h) return 'mouth';
    for (const k of [-1, 1]) { const w = this.world(24, k * 13); if (dist(x, y, w.x, w.y) < 7 + h) return this.cracked > 0 ? 'body' : 'armor'; }
    if (dist(x, y, this.x, this.y) > 17 + h) return null;
    return fw > 5 && this.cracked <= 0 ? 'armor' : 'body';
  }
  damage(dmg, part) {
    if (!this.active || this.dying) return 'reflect';
    if (part === 'armor') {
      // каждый рикошет трескает панцирь: набралось — лоб открыт на несколько секунд
      this.crack += dmg;
      if (this.crack >= (this.phase === 1 ? 10 : 14)) {
        this.crack = 0; this.cracked = 4.5; this.flash = 0.15;
        G.popups.push(new Popup(this.x, this.y - 30, 'ПАНЦИРЬ ТРЕСНУЛ!', '#fcd820', 1.4)); Sound.play('brick');
        return 'ok';
      }
      if (this.msgT <= 0) { this.msgT = 1.2; G.popups.push(new Popup(this.x, this.y - 26, 'БРОНЯ', '#a8a8a8')); }
      return 'reflect';
    }
    if (part === 'mouth') {
      if (this.msgT <= 0) { this.msgT = 0.8; G.popups.push(new Popup(this.x, this.y - 26, 'В ПАСТЬ ×2', '#fcd820')); }
      return super.damage(dmg * 2);
    }
    if (part === 'tail') {
      if (this.msgT <= 0) { this.msgT = 0.8; G.popups.push(new Popup(this.x, this.y - 26, '×2', '#fcd820')); }
      return super.damage(dmg * 2);
    }
    return super.damage(dmg);
  }
  move(dx, dy, dmg) {
    const nx = this.x + dx, ny = this.y + dy;
    if (nx < 16 || ny < 16 || nx > FW - 16 || ny > FH - 16) return false;
    if (!this.pushPlayers(nx - 14, ny - 14, 28, 28, dx, dy, dmg)) return false;
    this.x = nx; this.y = ny; this.walk += Math.hypot(dx, dy) * 0.35;
    if (G.level.destroyCircle(this.x + Math.cos(this.a) * 8, this.y + Math.sin(this.a) * 8, 15, false)) Sound.play('brick');
    return true;
  }
  update(dt) {
    this.t += dt; this.flash -= dt; this.msgT -= dt; this.clawT -= dt; this.cracked -= dt;
    if (this.dying) return this.updateDeath(dt);
    if (this.state === 'enter') {
      this.y += 40 * dt; this.walk += dt * 10;
      if (this.y > 0) G.level.destroyCircle(this.x, this.y, 18, false);
      if (this.y >= 52) { this.state = 'fight'; this.active = true; }
      return;
    }
    if (this.phase === 1 && this.hp < this.maxHp * 0.5) { this.phase = 2; this.lungeT = 1.5; G.banner('СКОРПИОН: ЯДОВИТАЯ ЯРОСТЬ!', '#8cd800'); Sound.play('roar'); }
    // кислотные лужи
    for (const q of this.pools) {
      q.t -= dt;
      for (const p of G.players) if (!p.dead && dist(q.x, q.y, p.cx, p.cy) < q.r) p.hurt(1);
    }
    this.pools = this.pools.filter(q => q.t > 0);
    const tg = G.nearestPlayer(this.x, this.y);
    if (this.lunge) {
      const L = this.lunge;
      L.t += dt;
      if (L.t < L.wind) {
        // целится только первую половину замаха — в конце можно уйти с линии
        if (tg && L.t < L.wind * 0.5) this.a += clamp(normA(angleTo(this.x, this.y, tg.cx, tg.cy) - this.a), -3 * dt, 3 * dt);
        G.shake = Math.max(G.shake, 1);
        return;
      }
      if (!L.go) { L.go = true; Sound.play('dash'); }
      const sp = 190 * dt;
      this.walk += dt * 6;
      const hitWall = !this.move(Math.cos(this.a) * sp, Math.sin(this.a) * sp, 2);
      if (hitWall || L.t > L.wind + 0.6) {
        this.lunge = null; this.clawT = 0.3; G.shake = 4;
        // после рывка оглушён и не разворачивается; врезался в стену — дольше
        this.stun = (this.phase === 1 ? 1.6 : 1.1) + (hitWall ? 0.9 : 0);
        G.popups.push(new Popup(this.x, this.y - 28, 'ОГЛУШЁН', '#3cbcfc', 1.1));
        this.lungeT = this.phase === 1 ? rand(5, 6.5) : rand(3.5, 4.5);
        const f = this.world(26, 0);
        explode(f.x, f.y, 12, { hurtPlayers: true });
      }
      return;
    }
    if (this.stun > 0) { this.stun -= dt; this.walk += dt * 3; return; }
    this.tgtT -= dt;
    if (this.tgtT <= 0) {
      if (tg && Math.random() < 0.7) { this.tgx = tg.cx; this.tgy = tg.cy; } else { this.tgx = rand(40, FW - 40); this.tgy = rand(40, FH - 40); }
      this.tgtT = rand(1.5, 2.5);
    }
    // разворачивается медленно — одиночка успевает обойти сбоку
    const turn = this.phase === 1 ? 1.1 : 1.5;
    this.a += clamp(normA(angleTo(this.x, this.y, this.tgx, this.tgy) - this.a), -turn * dt, turn * dt);
    if (dist(this.x, this.y, this.tgx, this.tgy) > 26) {
      const sp = (this.phase === 1 ? 34 : 46) * dt;
      if (!this.move(Math.cos(this.a) * sp, Math.sin(this.a) * sp, 1)) this.tgtT = 0;
    }
    // клешни щёлкают по всем, кто перед мордой
    this.snapT -= dt;
    if (this.snapT <= 0) {
      const f = this.world(28, 0);
      if (G.players.some(p => !p.dead && dist(f.x, f.y, p.cx, p.cy) < 18)) {
        this.snapT = 1.1; this.clawT = 0.25; Sound.play('hit');
        for (const p of G.players) if (!p.dead && dist(f.x, f.y, p.cx, p.cy) < 18) p.hurt(1);
      }
    }
    // плевок кислотой навесом: на месте падения остаётся лужа
    const P = this.tailPts(), tip = P[P.length - 1];
    this.acidT -= dt;
    if (this.acidT <= 0 && tg) {
      this.acidT = this.phase === 1 ? 3.2 : 2.3;
      for (let k = 0; k < (this.phase === 1 ? 1 : 2); k++) {
        const ax = clamp(tg.cx + (k ? rand(-40, 40) : rand(-10, 10)), 10, FW - 10), ay = clamp(tg.cy + (k ? rand(-40, 40) : rand(-10, 10)), 10, FH - 10);
        G.mortars.push(new Mortar(tip.x, tip.y, ax, ay, 1.0, { r: 12, h: 40, pal: ACID_COLS, col: '#8cd800' }));
        later(1.0, () => { if (this.alive && !this.dying) this.pools.push({ x: ax, y: ay, r: 13, t: 5, max: 5 }); });
      }
      Sound.play('mortar');
    }
    // жало: веер ядовитых сгустков
    this.stingT -= dt;
    if (this.stingT <= 0.5 && this.stingT + dt > 0.5) this.sting = 0.5;
    if (this.sting > 0) this.sting -= dt;
    if (this.stingT <= 0 && tg) {
      this.stingT = this.phase === 1 ? 4.5 : 2.8;
      const n = this.phase === 1 ? 3 : 5, a = angleTo(tip.x, tip.y, tg.cx, tg.cy);
      for (let k = 0; k < n; k++) enemyShot(tip.x, tip.y, a + (k - (n - 1) / 2) * 0.22, 105, { kind: 'acid', size: 5 });
      Sound.play('eshoot');
    }
    this.lungeT -= dt;
    if (this.lungeT <= 0 && tg && dist(this.x, this.y, tg.cx, tg.cy) < 180) { this.lunge = { t: 0, wind: this.phase === 1 ? 1.1 : 0.85, go: false }; Sound.play('charge'); }
    if (this.phase === 2) { this.minionT -= dt; if (this.minionT <= 0) { this.minionT = 14; G.spawnMinions(2, 'fast', this.x, this.y); } }
  }
  drawGround(g) {
    const P = BOSS_PALS.scorp, fl = this.flash > 0;
    for (const q of this.pools) {
      if (q.t < 1 && Math.floor(q.t * 10) % 2) continue;
      const k = Math.min(1, (q.max - q.t) * 4);
      ellipse(g, q.x, q.y, Math.max(1, Math.round(q.r * k)), Math.max(1, Math.round(q.r * 0.7 * k)), '#3c6c00');
      ellipse(g, q.x, q.y, Math.max(1, Math.round((q.r - 3) * k)), Math.max(1, Math.round((q.r - 3) * 0.7 * k)), Math.floor(this.t * 4 + q.x) % 2 ? '#8cd800' : '#6cb800');
      if (Math.floor(this.t * 6 + q.y) % 3 === 0) rect(g, Math.round(q.x + Math.sin(q.t * 7) * 6), Math.round(q.y + Math.cos(q.t * 5) * 3), 2, 2, '#e8fcb0');
    }
    // тело (перед рывком мигает)
    const wind = this.lunge && !this.lunge.go && Math.floor(this.t * 16) % 2;
    drawArt(g, 'scorp', this.x, this.y, this.a, fl || wind, 2);
    g.save();
    g.translate(Math.round(this.x), Math.round(this.y)); g.rotate(this.a);
    if (this.mouthOpen()) { // раскрытая пасть — слабое место
      rect(g, 9, -4, 9, 8, P.k); rect(g, 10, -3, 7, 6, '#a80000');
      rect(g, 11, -2, 5, 4, Math.floor(this.t * 8) % 2 ? '#f83800' : '#fcd820');
    }
    if (this.cracked > 0 && !(this.cracked < 1 && Math.floor(this.t * 10) % 2)) { // трещины на лобовом панцире
      pline(g, 8, -8, 13, -2, P.k, 1); pline(g, 13, -2, 10, 3, P.k, 1); pline(g, 10, 3, 15, 8, P.k, 1);
      pline(g, 15, -9, 18, -5, '#fcd820', 1);
    }
    g.restore();
    if (this.stun > 0) for (let i = 0; i < 3; i++) { // звёздочки оглушения
      const a = this.t * 5 + i * 2.1;
      rect(g, Math.round(this.x + Math.cos(a) * 12) - 1, Math.round(this.y - 24 + Math.sin(a) * 3) - 1, 2, 2, i % 2 ? '#fcd820' : '#fcfcfc');
    }
    // жало
    const T = this.tailPts(), tip = T[T.length - 1]; // хвост есть на картинке — светится только жало
    if (this.sting > 0) disc(g, tip.x, tip.y, 3, Math.floor(this.t * 16) % 2 ? '#fcfcfc' : P.e);
  }
}

// ------------------------------------------------------------
//  8. ФАНТОМ — стелс-прототип: невидимость, телепорт, голограммы-двойники, лазер
// ------------------------------------------------------------
class Phantom extends Boss {
  constructor(scale) {
    super('ФАНТОМ', Math.round(110 * scale));
    this.deadText = 'ФАНТОМ УНИЧТОЖЕН';
    this.x = FW / 2; this.y = 64; this.a = Math.PI / 2; this.alpha = 0; this.state = 'enter'; this.st = 0;
    this.vx = 0; this.vy = 0; this.tx = this.x; this.ty = this.y; this.moveT = 0;
    this.cloakT = 6; this.shotT = 1.5; this.burst = 0; this.burstT = 0; this.beam = null; this.beamT = 4.5; this.kamiT = 8;
    this.decoys = [];
  }
  bounds() { return { x: this.x - 16, y: this.y - 16, w: 32, h: 32 }; }
  hitTest(x, y, h) {
    if (!this.active) return null;
    for (const d of this.decoys) if (d.alpha > 0.6 && dist(x, y, d.x, d.y) < 12 + h) return d;
    if (this.alpha > 0.6 && dist(x, y, this.x, this.y) < 13 + h) return 'body';
    return null;
  }
  damage(dmg, part) {
    if (!this.active || this.dying) return 'reflect';
    if (part === 'grenade') { for (const d of this.decoys.slice()) this.popDecoy(d); return this.alpha > 0.6 ? super.damage(dmg) : 'reflect'; }
    if (part && typeof part === 'object') { if (this.decoys.includes(part)) this.popDecoy(part); return 'ok'; }
    if (this.alpha <= 0.6) return 'reflect';
    return super.damage(dmg);
  }
  popDecoy(d) {
    this.decoys.splice(this.decoys.indexOf(d), 1);
    this.glitch(d.x, d.y, 14);
    G.effects.push(new RingFx(d.x, d.y, 4, 16, '#f838f8', 0.25));
    Sound.play('zap');
  }
  glitch(x, y, n) {
    for (let i = 0; i < n && G.particles.length < 450; i++)
      G.particles.push(new Particle(x + rand(-10, 10), y + rand(-10, 10), rand(-60, 60), rand(-60, 60), rand(0.2, 0.5), pick(['#f838f8', '#38f8f8', '#fcfcfc']), randi(1, 2)));
  }
  // точка подальше от игроков
  spot() {
    for (let k = 0; k < 40; k++) {
      const x = rand(30, FW - 30), y = rand(30, FH - 50);
      if (G.players.every(p => p.dead || dist(p.cx, p.cy, x, y) > 100) && dist(x, y, this.x, this.y) > 40) return { x, y };
    }
    return { x: rand(30, FW - 30), y: rand(30, 90) };
  }
  update(dt) {
    this.t += dt; this.flash -= dt;
    if (this.dying) {
      this.alpha = 1; this.beam = null;
      if (this.decoys.length) { for (const d of this.decoys) this.glitch(d.x, d.y, 10); this.decoys = []; }
      return this.updateDeath(dt);
    }
    if (this.phase === 1 && this.hp < this.maxHp * 0.66) { this.phase = 2; this.cloakT = Math.min(this.cloakT, 1); G.banner('ФАНТОМ: ГОЛОГРАММЫ!', '#f838f8'); Sound.play('roar'); }
    if (this.phase === 2 && this.hp < this.maxHp * 0.33) { this.phase = 3; this.cloakT = Math.min(this.cloakT, 1); G.banner('ФАНТОМ: ПЕРЕГРУЗКА!', '#f83800'); Sound.play('roar'); }
    const tg = G.nearestPlayer(this.x, this.y);
    for (const d of this.decoys) this.updateDecoy(d, dt);
    if (this.state === 'enter') {
      this.alpha += dt / 1.6;
      if (Math.random() < 0.5) this.glitch(this.x, this.y, 1);
      if (this.alpha >= 1) { this.alpha = 1; this.state = 'fight'; this.active = true; }
      return;
    }
    if (this.state === 'fade') {
      this.alpha -= dt / 0.35;
      for (const d of this.decoys) d.alpha = Math.min(d.alpha, this.alpha);
      if (this.alpha <= 0) {
        this.alpha = 0; this.state = 'hidden'; this.st = 0.5;
        this.decoys = [];
        const s = this.spot(); this.x = s.x; this.y = s.y; this.vx = 0; this.vy = 0; this.tx = s.x; this.ty = s.y;
      }
      return;
    }
    if (this.state === 'hidden') {
      this.st -= dt;
      if (this.st <= 0) {
        this.state = 'appear';
        const n = this.phase === 1 ? 0 : this.phase === 2 ? 2 : 3;
        for (let i = 0; i < n; i++) { const s = this.spot(); this.decoys.push({ x: s.x, y: s.y, a: this.a, alpha: 0, tx: s.x, ty: s.y, moveT: 0, shotT: rand(1, 2) }); }
        this.glitch(this.x, this.y, 8);
        Sound.play('zap');
      }
      return;
    }
    if (this.state === 'appear') {
      this.alpha += dt / 0.35;
      for (const d of this.decoys) d.alpha = this.alpha;
      if (this.alpha >= 1) {
        this.alpha = 1; this.state = 'fight';
        for (const d of this.decoys) d.alpha = 1;
        if (this.phase === 3) G.ring(this.x, this.y, 16, 80, rand(0, 1), 'bolt');
      }
      return;
    }
    // бой: скольжение на антигравах
    if (tg) this.a += clamp(normA(angleTo(this.x, this.y, tg.cx, tg.cy) - this.a), -3.5 * dt, 3.5 * dt);
    this.moveT -= dt;
    if (this.moveT <= 0 && tg) {
      const a = rand(0, Math.PI * 2), r = rand(70, 130);
      this.tx = clamp(tg.cx + Math.cos(a) * r, 24, FW - 24); this.ty = clamp(tg.cy + Math.sin(a) * r, 24, FH - 24);
      this.moveT = rand(1.2, 2.2);
    }
    const k = 1.8, damp = 2, hold = this.beam ? 0.15 : 1;
    this.vx += ((this.tx - this.x) * k - this.vx * damp) * dt; this.vy += ((this.ty - this.y) * k - this.vy * damp) * dt;
    const maxv = (this.phase === 3 ? 100 : 75) * hold, v = Math.hypot(this.vx, this.vy);
    if (v > maxv) { this.vx *= maxv / v; this.vy *= maxv / v; }
    this.x = clamp(this.x + this.vx * dt, 16, FW - 16); this.y = clamp(this.y + this.vy * dt, 16, FH - 16);
    for (const p of G.players) if (!p.dead && dist(this.x, this.y, p.cx, p.cy) < 16) p.hurt(1);
    // очереди плазмы
    this.shotT -= dt;
    if (this.shotT <= 0 && tg && !this.beam) { this.shotT = [0, 1.8, 1.5, 1.2][this.phase]; this.burst = 3; this.burstT = 0; }
    if (this.burst > 0) {
      this.burstT -= dt;
      if (this.burstT <= 0) {
        this.burstT = 0.1; this.burst--;
        if (tg) { enemyShot(this.x + Math.cos(this.a) * 16, this.y + Math.sin(this.a) * 16, angleTo(this.x, this.y, tg.cx, tg.cy), 170, { kind: 'bolt', size: 3 }); Sound.play('eshoot'); }
      }
    }
    // лазер: прицеливание, захват цели, выстрел через всё поле
    if (!this.beam) {
      this.beamT -= dt;
      if (this.beamT <= 0 && tg) { this.beam = { t: 0, charge: 1.0, dur: 0.4, fire: false, a: angleTo(this.x, this.y, tg.cx, tg.cy) }; Sound.play('charge'); }
    } else {
      const B = this.beam;
      B.t += dt;
      if (!B.fire && B.t < B.charge * 0.55 && tg) B.a += clamp(normA(angleTo(this.x, this.y, tg.cx, tg.cy) - B.a), -2 * dt, 2 * dt);
      this.a = B.a;
      if (!B.fire && B.t >= B.charge) {
        B.fire = true; B.t = 0; Sound.play('laser'); G.shake = 4;
        const c = Math.cos(B.a), s = Math.sin(B.a);
        for (let r = 16; r < 460; r += 6) G.level.destroyCircle(this.x + c * r, this.y + s * r, 6, false);
      }
      if (B.fire) {
        const c = Math.cos(B.a), s = Math.sin(B.a);
        const onBeam = (x, y) => { const px = x - this.x, py = y - this.y; return px * c + py * s > 0 && Math.abs(px * s - py * c) < 9; };
        for (const p of G.players) if (!p.dead && onBeam(p.cx, p.cy)) p.hurt(1);
        for (const e of G.enemies) if (e.alive && onBeam(e.cx, e.cy)) e.die(null);
        if (B.t >= B.dur) { this.beam = null; this.beamT = [0, 6, 4.5, 3.5][this.phase]; }
      }
    }
    if (this.phase === 3) { this.kamiT -= dt; if (this.kamiT <= 0) { this.kamiT = 10; G.spawnMinions(2, 'kamikaze', this.x, this.y); } }
    this.cloakT -= dt;
    if (this.cloakT <= 0 && !this.beam && !this.burst) { this.state = 'fade'; this.cloakT = [0, 6, 5, 4][this.phase]; Sound.play('shield'); }
  }
  updateDecoy(d, dt) {
    const tg = G.nearestPlayer(d.x, d.y);
    if (tg) d.a += clamp(normA(angleTo(d.x, d.y, tg.cx, tg.cy) - d.a), -3.5 * dt, 3.5 * dt);
    if (this.state !== 'fight') return;
    d.moveT -= dt;
    if (d.moveT <= 0 && tg) {
      const a = rand(0, Math.PI * 2), r = rand(70, 130);
      d.tx = clamp(tg.cx + Math.cos(a) * r, 24, FW - 24); d.ty = clamp(tg.cy + Math.sin(a) * r, 24, FH - 24); d.moveT = rand(1.2, 2.2);
    }
    const dd = dist(d.x, d.y, d.tx, d.ty), sp = 55 * dt;
    if (dd > 1) { d.x += (d.tx - d.x) / dd * Math.min(sp, dd); d.y += (d.ty - d.y) / dd * Math.min(sp, dd); }
    d.shotT -= dt;
    if (d.shotT <= 0 && tg) {
      d.shotT = rand(1.6, 2.4);
      enemyShot(d.x + Math.cos(d.a) * 16, d.y + Math.sin(d.a) * 16, angleTo(d.x, d.y, tg.cx, tg.cy), 150, { kind: 'bolt', size: 3 });
      Sound.play('eshoot');
    }
  }
  drawShip(g, x, y, a, alpha, fl, ta = a) {
    if (alpha <= 0) return;
    g.globalAlpha = alpha < 1 ? alpha * (Math.random() < 0.25 ? 0.4 : 1) : 1;
    drawArt(g, 'phantom', x, y, a, fl);
    drawArt(g, 'phantomTur', x, y, ta, fl);
    if (alpha < 1) for (let i = 0; i < 3; i++) rect(g, Math.round(x - 16 + rand(-4, 4)), Math.round(y + rand(-14, 14)), 32, 1, Math.random() < 0.5 ? '#f838f8' : '#38f8f8');
    g.globalAlpha = 1;
  }
  drawGround(g) {
    for (const d of this.decoys) if (d.alpha > 0) ellipse(g, d.x + 4, d.y + 10, 12, 4, 'rgba(0,0,0,0.4)');
    if (this.alpha > 0) ellipse(g, this.x + 4, this.y + 10, 12, 4, 'rgba(0,0,0,0.4)');
  }
  drawAir(g) {
    for (const d of this.decoys) this.drawShip(g, d.x, d.y, d.a, d.alpha, false);
    this.drawShip(g, this.x, this.y, this.a, this.alpha, this.flash > 0, this.beam ? this.beam.a : this.a); // лазер доворачивает на цель
    const B = this.beam;
    if (!B) return;
    const c = Math.cos(B.a), s = Math.sin(B.a), x0 = this.x + c * 16, y0 = this.y + s * 16, x1 = this.x + c * 460, y1 = this.y + s * 460;
    if (!B.fire) {
      if (Math.floor(B.t * (B.t > B.charge * 0.55 ? 24 : 12)) % 2) pline(g, x0, y0, x1, y1, '#f838f8', 1);
      disc(g, x0, y0, 2 + B.t * 3, '#f878f8');
    } else {
      const w = Math.floor(this.t * 30) % 2;
      pline(g, x0, y0, x1, y1, '#a000a0', 9 + w * 2); pline(g, x0, y0, x1, y1, '#f878f8', 5); pline(g, x0, y0, x1, y1, '#fcfcfc', 2);
      disc(g, x0, y0, 6, '#fcfcfc');
    }
  }
}

// ------------------------------------------------------------
//  9. ИНФЕРНО — огнемётный танк: струя огня веером, напалм навесом, горящие лужи.
//     Слабое место — топливный бак на корме (×2): заходить со спины.
// ------------------------------------------------------------
const FIRE_COLS = ['#fcfcfc', '#fcf0a0', '#fcc040', '#f88010', '#d83000', '#801000', '#401000'];
class Inferno extends Boss {
  constructor(scale) {
    super('ИНФЕРНО', Math.round(105 * scale));
    this.x = FW / 2; this.y = -30; this.a = Math.PI / 2; this.gunA = Math.PI / 2; this.state = 'enter'; this.anim = 0;
    this.tgx = FW / 2; this.tgy = FH / 2; this.tgtT = 0; this.msgT = 0;
    this.flame = null; this.flameT = 2; this.napT = 3.5; this.trailT = 0; this.ringT = 6; this.minionT = 12; this.pools = [];
  }
  bounds() { return { x: this.x - 20, y: this.y - 20, w: 40, h: 40 }; }
  blocks(x, y, w, h) { return this.alive && !this.dying && overlap(x, y, w, h, this.x - 15, this.y - 15, 30, 30); }
  hitTest(x, y, h) {
    if (!this.active || dist(x, y, this.x, this.y) > 17 + h) return null;
    const fw = (x - this.x) * Math.cos(this.a) + (y - this.y) * Math.sin(this.a);
    return fw < -8 ? 'tank' : 'body';
  }
  damage(dmg, part) {
    if (!this.active || this.dying) return 'reflect';
    if (part === 'tank') {
      if (this.msgT <= 0) { this.msgT = 0.8; G.popups.push(new Popup(this.x, this.y - 26, 'БАК ×2', '#fcd820')); }
      return super.damage(dmg * 2);
    }
    return super.damage(dmg);
  }
  pool(x, y, r, t) { if (this.pools.length < 24) this.pools.push({ x, y, r, t, max: t }); }
  move(dx, dy) {
    const nx = clamp(this.x + dx, 16, FW - 16), ny = clamp(this.y + dy, 16, FH - 16);
    if (!this.pushPlayers(nx - 15, ny - 15, 30, 30, nx - this.x, ny - this.y, 1)) return false;
    this.x = nx; this.y = ny; this.anim += Math.hypot(dx, dy) * 0.4;
    if (G.level.destroyCircle(this.x + Math.cos(this.a) * 6, this.y + Math.sin(this.a) * 6, 16, false)) Sound.play('brick');
    return true;
  }
  update(dt) {
    this.t += dt; this.flash -= dt; this.msgT -= dt;
    for (const q of this.pools) {
      q.t -= dt;
      for (const p of G.players) if (!p.dead && dist(q.x, q.y, p.cx, p.cy) < q.r) p.hurt(1);
    }
    this.pools = this.pools.filter(q => q.t > 0);
    if (this.dying) { this.flame = null; return this.updateDeath(dt); }
    if (this.state === 'enter') {
      this.y += 34 * dt; this.anim += dt * 12;
      if (this.y > 0) G.level.destroyCircle(this.x, this.y, 18, false);
      if (this.y >= 50) { this.state = 'fight'; this.active = true; }
      return;
    }
    if (this.phase === 1 && this.hp < this.maxHp * 0.5) { this.phase = 2; this.ringT = 1; G.banner('ИНФЕРНО: ПЕРЕГРЕВ!', '#f87800'); Sound.play('roar'); }
    const tg = G.nearestPlayer(this.x, this.y), F = this.flame;
    if (tg && !(F && F.spin)) this.gunA += clamp(normA(angleTo(this.x, this.y, tg.cx, tg.cy) - this.gunA), -2.6 * dt, 2.6 * dt);
    // держится на дистанции струи и подъезжает, давя кирпич
    this.tgtT -= dt;
    if (this.tgtT <= 0 && tg) {
      const a = rand(0, Math.PI * 2);
      this.tgx = clamp(tg.cx + Math.cos(a) * 60, 24, FW - 24); this.tgy = clamp(tg.cy + Math.sin(a) * 60, 24, FH - 24);
      this.tgtT = rand(1.5, 2.5);
    }
    if (dist(this.x, this.y, this.tgx, this.tgy) > 8) {
      this.a += clamp(normA(angleTo(this.x, this.y, this.tgx, this.tgy) - this.a), -1.6 * dt, 1.6 * dt);
      const sp = (this.phase === 1 ? 30 : 40) * (F ? 0.35 : 1) * dt;
      if (!this.move(Math.cos(this.a) * sp, Math.sin(this.a) * sp)) this.tgtT = 0;
    }
    // струя огня: короткий замах (сопло светится), потом веер
    this.flameT -= dt;
    if (!F && this.flameT <= 0 && tg && dist(this.x, this.y, tg.cx, tg.cy) < 130) { this.flame = { t: 0, e: 0, dur: this.phase === 1 ? 1.4 : 1.8, spin: false }; Sound.play('dash'); }
    if (this.phase === 2) {
      this.ringT -= dt;
      if (this.ringT <= 0 && !this.flame) { this.flame = { t: 0, e: 0, dur: 2.4, spin: true }; this.ringT = 8; Sound.play('roar'); }
      this.trailT -= dt;
      if (this.trailT <= 0) { this.trailT = 0.6; this.pool(this.x - Math.cos(this.a) * 16, this.y - Math.sin(this.a) * 16, 10, 4); }
      this.minionT -= dt;
      if (this.minionT <= 0) { this.minionT = 14; G.spawnMinions(2, 'flamer', this.x, this.y); }
    }
    if (this.flame) {
      const S = this.flame;
      S.t += dt; S.e -= dt;
      if (S.spin && S.t > 0.35) this.gunA += 3.2 * dt;
      if (S.t > 0.35 && S.e <= 0) {
        S.e = 0.035;
        const a = this.gunA + (S.spin ? 0 : Math.sin(S.t * 5) * 0.45) + rand(-0.12, 0.12);
        enemyShot(this.x + Math.cos(this.gunA) * 16, this.y + Math.sin(this.gunA) * 16, a, 150, { kind: 'flame', size: 5, breaks: false, life: rand(0.6, 0.75) });
      }
      if (S.t >= S.dur + 0.35) { this.flame = null; this.flameT = this.phase === 1 ? 2.6 : 1.8; }
    }
    // напалм навесом: на месте падения горит лужа
    this.napT -= dt;
    if (this.napT <= 0 && tg) {
      this.napT = this.phase === 1 ? 4 : 3;
      for (let k = 0; k < (this.phase === 1 ? 1 : 3); k++) {
        const ax = clamp(tg.cx + (k ? rand(-44, 44) : rand(-8, 8)), 10, FW - 10), ay = clamp(tg.cy + (k ? rand(-44, 44) : rand(-8, 8)), 10, FH - 10);
        G.mortars.push(new Mortar(this.x, this.y, ax, ay, 1.1, { r: 12, h: 36, col: '#f87800' }));
        later(1.1, () => { if (this.alive && !this.dying) this.pool(ax, ay, 14, 5); });
      }
      Sound.play('mortar');
    }
  }
  drawGround(g) {
    const t = this.t;
    for (const q of this.pools) { // горящие лужи
      if (q.t < 1 && Math.floor(q.t * 10) % 2) continue;
      const k = Math.min(1, (q.max - q.t) * 4), r = Math.max(1, Math.round(q.r * k));
      ellipse(g, q.x, q.y, r, Math.max(1, Math.round(r * 0.7)), '#801000');
      ellipse(g, q.x, q.y, Math.max(1, r - 3), Math.max(1, Math.round((r - 3) * 0.7)), Math.floor(t * 8 + q.x) % 2 ? '#f87800' : '#d83000');
      if (Math.floor(t * 6 + q.y) % 2) rect(g, Math.round(q.x + Math.sin(t * 9 + q.x) * 5), Math.round(q.y - 2), 2, 2, '#fcd820');
    }
    const fl = this.flash > 0;
    drawArt(g, trk('inferno', this.anim), this.x, this.y, this.a, fl); // топливный бак на корме — слабое место
    drawArt(g, 'infernoTur', this.x, this.y, this.gunA, fl);
    const x = this.x, y = this.y, tx = x + Math.cos(this.gunA) * 10, ty = y + Math.sin(this.gunA) * 10;
    const wind = this.flame && this.flame.t < 0.35;
    disc(g, tx, ty, wind ? 3 + Math.floor(t * 20) % 2 : 2, Math.floor(t * 10) % 2 ? '#fcd820' : '#f83800');
  }
}

// ------------------------------------------------------------
//  10. БУР — подкопщик: идёт под землёй, выныривает под игроком, рушит стены,
//      минирует поле. Вынырнув, на миг застревает (×2).
// ------------------------------------------------------------
class Drill extends Boss {
  constructor(scale) {
    super('БУР', Math.round(95 * scale));
    this.x = FW / 2; this.y = FH / 2 - 20; this.a = Math.PI / 2; this.state = 'under'; this.st = 1.6;
    this.upT = 0; this.stuck = 0; this.mineT = 1; this.shotT = 1; this.trailT = 0; this.minionT = 12; this.spin = 0; this.msgT = 0; this.walk = 0;
  }
  bounds() { return { x: this.x - 18, y: this.y - 18, w: 36, h: 36 }; }
  blocks(x, y, w, h) { return this.alive && !this.dying && this.state === 'up' && overlap(x, y, w, h, this.x - 13, this.y - 13, 26, 26); }
  hitTest(x, y, h) { return this.active && this.state === 'up' && dist(x, y, this.x, this.y) < 15 + h ? 'body' : null; }
  damage(dmg, part) {
    if (!this.active || this.dying) return 'reflect';
    if (this.stuck > 0 && part !== 'grenade') {
      if (this.msgT <= 0) { this.msgT = 0.8; G.popups.push(new Popup(this.x, this.y - 24, 'ЗАСТРЯЛ ×2', '#fcd820')); }
      return super.damage(dmg * 2);
    }
    return super.damage(dmg);
  }
  mine(x, y) { if (G.mines.length < 14) { G.mines.push(new EMine(x, y)); Sound.play('mine'); } }
  emerge() {
    const first = !this.active;
    this.state = 'up'; this.active = true; this.stuck = 1.2; this.upT = this.phase === 1 ? 4 : 3.2;
    G.level.destroyCircle(this.x, this.y, 22, false);
    explode(this.x, this.y, 24, { hurtPlayers: !first });
    if (!first) G.ring(this.x, this.y, this.phase === 1 ? 12 : 18, 85, rand(0, 1), 'small');
    G.shake = 5; Sound.play('roar');
  }
  update(dt) {
    this.t += dt; this.flash -= dt; this.msgT -= dt; this.stuck -= dt;
    this.spin += dt * (this.state === 'up' ? 18 : 30);
    if (this.dying) { this.state = 'up'; return this.updateDeath(dt); }
    if (this.phase === 1 && this.hp < this.maxHp * 0.5) { this.phase = 2; G.banner('БУР: ГЛУБИННОЕ МИНИРОВАНИЕ!', '#e8a810'); Sound.play('roar'); }
    const tg = G.nearestPlayer(this.x, this.y);
    if (this.state === 'under') {
      this.st -= dt;
      if (tg) this.a += clamp(normA(angleTo(this.x, this.y, tg.cx, tg.cy) - this.a), -3 * dt, 3 * dt);
      const sp = (this.phase === 1 ? 95 : 115) * dt;
      this.x = clamp(this.x + Math.cos(this.a) * sp, 16, FW - 16); this.y = clamp(this.y + Math.sin(this.a) * sp, 16, FH - 16);
      if (Math.random() < 0.7) G.particles.push(new Particle(this.x + rand(-6, 6), this.y + rand(-6, 6), rand(-30, 30), rand(-30, 30), 0.4, pick(['#5c3c1c', '#8c6c3c', '#3c2810']), 2));
      G.shake = Math.max(G.shake, 0.6);
      if (this.phase === 2 && this.active) { this.trailT -= dt; if (this.trailT <= 0) { this.trailT = 0.8; this.mine(this.x, this.y); } }
      if (this.st <= 0) { this.state = 'warn'; this.st = 0.7; Sound.play('charge'); }
      return;
    }
    if (this.state === 'warn') {
      this.st -= dt;
      if (tg) { const d = dist(this.x, this.y, tg.cx, tg.cy); if (d > 2) { this.x += (tg.cx - this.x) / d * 25 * dt; this.y += (tg.cy - this.y) / d * 25 * dt; } }
      if (this.st <= 0) this.emerge();
      return;
    }
    // на поверхности
    this.upT -= dt;
    for (const p of G.players) if (!p.dead && dist(this.x, this.y, p.cx, p.cy) < 16) p.hurt(1);
    if (this.stuck <= 0) {
      if (tg) this.a += clamp(normA(angleTo(this.x, this.y, tg.cx, tg.cy) - this.a), -2 * dt, 2 * dt);
      const sp = (this.phase === 1 ? 28 : 36) * dt, nx = clamp(this.x + Math.cos(this.a) * sp, 16, FW - 16), ny = clamp(this.y + Math.sin(this.a) * sp, 16, FH - 16);
      if (this.pushPlayers(nx - 13, ny - 13, 26, 26, nx - this.x, ny - this.y, 1)) { this.x = nx; this.y = ny; this.walk += sp * 0.5; }
      if (G.level.destroyCircle(this.x + Math.cos(this.a) * 12, this.y + Math.sin(this.a) * 12, 12, false)) Sound.play('brick');
      this.shotT -= dt;
      if (this.shotT <= 0 && tg) {
        this.shotT = this.phase === 1 ? 1.3 : 1.0;
        const a = angleTo(this.x, this.y, tg.cx, tg.cy);
        for (const o of [-0.25, 0, 0.25]) enemyShot(this.x + Math.cos(a) * 14, this.y + Math.sin(a) * 14, a + o, 120, { kind: 'small', size: 3 });
        Sound.play('eshoot');
      }
      this.mineT -= dt;
      if (this.mineT <= 0) { this.mineT = 1.6; this.mine(this.x - Math.cos(this.a) * 16, this.y - Math.sin(this.a) * 16); }
    }
    if (this.phase === 2) { this.minionT -= dt; if (this.minionT <= 0) { this.minionT = 14; G.spawnMinions(2, 'miner', this.x, this.y); } }
    if (this.upT <= 0) {
      this.state = 'under'; this.st = this.phase === 1 ? 2.2 : 1.8; this.stuck = 0;
      G.effects.push(new Boom(this.x, this.y, 12, { quiet: true, pal: ['#c8a870', '#8c6c3c', '#5c3c1c', '#3c2810', '#2c1c08', '#1c1004', '#0c0800'] }));
      Sound.play('brick');
    }
  }
  drawGround(g) {
    const x = this.x, y = this.y, t = this.t;
    if (this.state !== 'up') {
      const j = Math.floor(t * 20) % 2;
      ellipse(g, x, y + j, 9, 5, '#5c3c1c'); rect(g, Math.round(x) - 3, Math.round(y) - 3, 5, 2, '#8c6c3c');
      if (this.state === 'warn') circle(g, x, y, 22, Math.floor(t * 16) % 2 ? '#f83800' : '#fcd820', 3);
      return;
    }
    const fl = this.flash > 0;
    ellipse(g, x, y + 3, 17, 8, '#1c1008');
    const jit = Math.floor(this.spin) % 2 ? 0.03 : -0.03; // бур дрожит, вращаясь
    drawArt(g, trk('drill', this.walk), x, y, this.a + jit, fl, 4);
    if (this.stuck > 0) for (let i = 0; i < 3; i++) { const a = t * 5 + i * 2.1; rect(g, Math.round(x + Math.cos(a) * 12) - 1, Math.round(y - 20 + Math.sin(a) * 3) - 1, 2, 2, i % 2 ? '#fcd820' : '#fcfcfc'); }
  }
}

// ------------------------------------------------------------
//  11. МАГНЕТРОН — энергощит с одной стороны отбивает снаряды в стрелка,
//      магнит тянет игроков, дуги бьют по меткам. После магнита щит перегрет.
// ------------------------------------------------------------
class Magnet extends Boss {
  constructor(scale) {
    super('МАГНЕТРОН', Math.round(105 * scale));
    this.x = FW / 2; this.y = -30; this.state = 'enter'; this.shA = Math.PI / 2; this.vx = 0; this.vy = 0; this.tx = this.x; this.ty = 60; this.moveT = 0;
    this.pull = null; this.pullT = 6; this.over = 0; this.arcs = []; this.arcT = 2.5; this.boltT = 1.5; this.ringT = 5; this.minionT = 14; this.msgT = 0;
  }
  shieldOn() { return this.over <= 0 && !this.dying; }
  bounds() { return { x: this.x - 24, y: this.y - 24, w: 48, h: 48 }; }
  blocks(x, y, w, h) { return this.alive && !this.dying && overlap(x, y, w, h, this.x - 13, this.y - 13, 26, 26); }
  hitTest(x, y, h) {
    if (!this.active) return null;
    const d = dist(x, y, this.x, this.y);
    if (d > 23 + h) return null;
    if (this.shieldOn() && d > 10 && Math.abs(normA(angleTo(this.x, this.y, x, y) - this.shA)) < Math.PI / 2) return 'shield';
    return d < 15 + h ? 'core' : null;
  }
  damage(dmg, part) {
    if (!this.active || this.dying) return 'reflect';
    if (part === 'shield') {
      if (this.msgT <= 0) { this.msgT = 1.2; G.popups.push(new Popup(this.x, this.y - 28, 'ЩИТ', '#a4e4fc')); }
      return 'bounce';
    }
    return super.damage(dmg);
  }
  update(dt) {
    this.t += dt; this.flash -= dt; this.msgT -= dt; this.over -= dt;
    if (this.dying) { this.pull = null; this.arcs = []; return this.updateDeath(dt); }
    if (this.state === 'enter') { this.y += 40 * dt; if (this.y >= 60) { this.y = 60; this.state = 'fight'; this.active = true; } return; }
    if (this.phase === 1 && this.hp < this.maxHp * 0.5) { this.phase = 2; G.banner('МАГНЕТРОН: ПЕРЕГРУЗКА ПОЛЯ!', '#3cbcfc'); Sound.play('roar'); }
    const tg = G.nearestPlayer(this.x, this.y);
    if (tg && this.shieldOn()) { const r = this.phase === 1 ? 1.3 : 1.9; this.shA += clamp(normA(angleTo(this.x, this.y, tg.cx, tg.cy) - this.shA), -r * dt, r * dt); }
    // парит на антигравах на средней дистанции
    this.moveT -= dt;
    if (this.moveT <= 0 && tg) {
      const a = rand(0, Math.PI * 2), r = rand(90, 130);
      this.tx = clamp(tg.cx + Math.cos(a) * r, 24, FW - 24); this.ty = clamp(tg.cy + Math.sin(a) * r, 24, FH - 24); this.moveT = rand(2, 3.5);
    }
    this.vx += ((this.tx - this.x) * 1.4 - this.vx * 2) * dt; this.vy += ((this.ty - this.y) * 1.4 - this.vy * 2) * dt;
    const maxv = this.pull ? 10 : 50, v = Math.hypot(this.vx, this.vy);
    if (v > maxv) { this.vx *= maxv / v; this.vy *= maxv / v; }
    this.x = clamp(this.x + this.vx * dt, 20, FW - 20); this.y = clamp(this.y + this.vy * dt, 20, FH - 20);
    for (const p of G.players) if (!p.dead && dist(this.x, this.y, p.cx, p.cy) < 16) p.hurt(1);
    // магнит: тянет всех к себе, после — щит перегрет и отключён
    this.pullT -= dt;
    if (!this.pull && this.pullT <= 0) { this.pull = { t: 0, dur: 2.6 }; Sound.play('charge'); G.popups.push(new Popup(this.x, this.y - 28, 'МАГНИТ!', '#3cbcfc', 1.2)); }
    if (this.pull) {
      const P = this.pull, force = (this.phase === 1 ? 34 : 48) * dt;
      P.t += dt;
      for (const p of G.players) {
        if (p.dead) continue;
        const dx = this.x - p.cx, dy = this.y - p.cy, d = Math.hypot(dx, dy);
        if (d < 20) continue;
        const nx = p.x + dx / d * force, ny = p.y + dy / d * force;
        if (nx >= 0 && nx + 16 <= FW && !G.level.tankBlocked(nx, p.y, 16, 16)) p.x = nx;
        if (ny >= 0 && ny + 16 <= FH && !G.level.tankBlocked(p.x, ny, 16, 16)) p.y = ny;
      }
      if (P.t >= P.dur) {
        this.pull = null; this.pullT = this.phase === 1 ? 8 : 6; this.over = 2.8;
        G.popups.push(new Popup(this.x, this.y - 28, 'ЩИТ ПЕРЕГРЕТ!', '#fcd820', 1.4));
        G.effects.push(new RingFx(this.x, this.y, 6, 30, '#fcd820', 0.4)); Sound.play('zap');
      }
    }
    // дуги: метка на земле, через 0.75 с — разряд
    this.arcT -= dt;
    if (this.arcT <= 0) {
      this.arcT = this.phase === 1 ? 2.4 : 1.7;
      const alive = G.players.filter(p => !p.dead);
      for (let k = 0; k < (this.phase === 1 ? 1 : 2) && alive.length; k++) {
        const p = alive[k % alive.length];
        this.arcs.push({ x: clamp(p.cx + (k ? rand(-30, 30) : 0), 8, FW - 8), y: clamp(p.cy + (k ? rand(-30, 30) : 0), 8, FH - 8), t: 0.75 });
      }
    }
    for (const A of this.arcs) {
      A.t -= dt;
      if (A.t > 0) continue;
      G.effects.push(new ArcFx([[this.x, this.y], [A.x, A.y]], 0.25), new RingFx(A.x, A.y, 2, 14, '#e8fcff', 0.2));
      for (const p of G.players) if (!p.dead && dist(A.x, A.y, p.cx, p.cy) < 13) p.hurt(1);
      Sound.play('zap');
    }
    this.arcs = this.arcs.filter(A => A.t > 0);
    // плазма веером из-за щита
    this.boltT -= dt;
    if (this.boltT <= 0 && tg) {
      this.boltT = this.phase === 1 ? 1.9 : 1.4;
      const a = angleTo(this.x, this.y, tg.cx, tg.cy);
      for (const o of [-0.2, 0, 0.2]) enemyShot(this.x + Math.cos(a) * 24, this.y + Math.sin(a) * 24, a + o, 140, { kind: 'bolt', size: 3 });
      Sound.play('eshoot');
    }
    if (this.phase === 2) {
      this.ringT -= dt; if (this.ringT <= 0) { this.ringT = 5; G.ring(this.x, this.y, 16, 80, rand(0, 1), 'orb'); }
      this.minionT -= dt; if (this.minionT <= 0) { this.minionT = 15; G.spawnMinions(2, 'shield', this.x, this.y); }
    }
  }
  drawGround(g) {
    const x = this.x, y = this.y, t = this.t, fl = this.flash > 0;
    for (const A of this.arcs) { // метки разряда
      const c = Math.floor(t * (A.t < 0.3 ? 24 : 12)) % 2 ? '#3cbcfc' : '#fcfcfc';
      circle(g, A.x, A.y, 12 * (0.6 + A.t * 0.5), c, 1); rect(g, Math.round(A.x) - 3, Math.round(A.y), 7, 1, c); rect(g, Math.round(A.x), Math.round(A.y) - 3, 1, 7, c);
    }
    if (this.pull) for (let i = 0; i < 3; i++) circle(g, x, y, 70 - ((this.pull.t * 70 + i * 23) % 70), i % 2 ? '#3c78f8' : '#a4e4fc', 1);
    ellipse(g, x + 4, y + 14, 14, 5, 'rgba(0,0,0,0.45)');
    drawArt(g, 'magnet', x, y, t * 0.6, fl); // корпус с катушками медленно вращается
    drawArt(g, 'magnetTur', x, y, this.shA, fl); // излучатель смотрит туда же, куда щит
    if (Math.floor(t * 12) % 3 === 0) { // разряды между катушками
      const a = rand(0, Math.PI * 2), r = rand(14, 20);
      pline(g, x + Math.cos(a) * r, y + Math.sin(a) * r, x + Math.cos(a + 0.5) * r + rand(-3, 3), y + Math.sin(a + 0.5) * r + rand(-3, 3), '#a4e4fc', 1);
    }
    if (this.shieldOn()) {
      for (let k = -12; k <= 12; k++) {
        const a = this.shA + k * 0.125;
        rect(g, Math.round(x + Math.cos(a) * 21) - 1, Math.round(y + Math.sin(a) * 21) - 1, 2, 2, Math.floor(t * 10 + k) % 3 ? '#a4e4fc' : '#fcfcfc');
        rect(g, Math.round(x + Math.cos(a) * 23), Math.round(y + Math.sin(a) * 23), 1, 1, '#3c78f8');
      }
    } else if (Math.random() < 0.6) rect(g, Math.round(x + rand(-16, 16)), Math.round(y + rand(-16, 16)), 2, 1, '#fcd820'); // перегрев: искры
  }
}

// ------------------------------------------------------------
//  12. УЛЕЙ — летающая матка: рой дронов-камикадзе (их можно сбивать),
//      ядро закрыто сотами — пока цела хоть одна, ядро неуязвимо.
// ------------------------------------------------------------
class Hive extends Boss {
  constructor(scale) {
    super('УЛЕЙ', Math.round(100 * scale));
    this.x = FW / 2; this.y = -40; this.vx = 0; this.vy = 0; this.tx = FW / 2; this.ty = 70; this.moveT = 3; this.state = 'enter';
    this.cellHp = Math.round(5 * Math.sqrt(scale)); this.cells = []; this.orbA = 0; this.regrowT = 0; this.msgT = 0;
    this.droneT = 3; this.stingT = 2; this.minionT = 12;
    this.makeCells();
  }
  makeCells() {
    this.cells = [];
    for (let i = 0; i < 6; i++) this.cells.push({ hp: this.cellHp, flash: 0, k: i / 6, x: this.x, y: this.y });
    this.placeCells();
  }
  placeCells() { for (const c of this.cells) { const a = this.orbA + c.k * Math.PI * 2; c.x = this.x + Math.cos(a) * 22; c.y = this.y + Math.sin(a) * 18; } }
  bounds() { return { x: this.x - 30, y: this.y - 28, w: 60, h: 56 }; }
  hitTest(x, y, h) {
    if (!this.active || this.y < -10) return null;
    for (const c of this.cells) if (dist(x, y, c.x, c.y) < 6 + h) return c;
    return dist(x, y, this.x, this.y) < 14 + h ? 'core' : null;
  }
  damage(dmg, part) {
    if (!this.active || this.dying) return 'reflect';
    if (part === 'grenade') {
      for (const c of this.cells.slice(0, 3)) this.breakCell(c);
      return this.cells.length ? 'ok' : super.damage(dmg);
    }
    if (part && typeof part === 'object') {
      if (!this.cells.includes(part)) return 'reflect';
      part.hp -= dmg; part.flash = 0.08; Sound.play('hit');
      if (part.hp <= 0) { this.breakCell(part); return super.damage(3); }
      return 'ok';
    }
    if (this.cells.length) {
      if (this.msgT <= 0) { this.msgT = 1.2; G.popups.push(new Popup(this.x, this.y - 30, 'СБЕЙТЕ СОТЫ!', '#fcd820')); }
      return 'reflect';
    }
    return super.damage(dmg);
  }
  breakCell(c) {
    this.cells.splice(this.cells.indexOf(c), 1);
    G.effects.push(new Boom(c.x, c.y, 9));
    Sound.play('brick');
    if (!this.cells.length) {
      this.regrowT = this.phase === 1 ? 7 : 5.5;
      G.popups.push(new Popup(this.x, this.y - 30, 'ЯДРО ОТКРЫТО!', '#f83800', 1.4));
    }
  }
  update(dt) {
    this.t += dt; this.flash -= dt; this.msgT -= dt;
    for (const c of this.cells) c.flash -= dt;
    this.orbA += dt * 1.2; this.placeCells();
    if (this.dying) { this.y += 6 * dt; return this.updateDeath(dt); }
    if (this.state === 'enter') { this.y += 40 * dt; if (this.y >= 60) { this.state = 'hover'; this.active = true; } return; }
    if (this.phase === 1 && this.hp < this.maxHp * 0.5) { this.phase = 2; G.banner('УЛЕЙ: РОЙ В ЯРОСТИ!', '#fcd820'); Sound.play('roar'); }
    const tg = G.nearestPlayer(this.x, this.y);
    this.moveT -= dt;
    if (this.moveT <= 0 || dist(this.x, this.y, this.tx, this.ty) < 10) {
      this.tx = clamp((tg ? tg.cx : FW / 2) + rand(-110, 110), 40, FW - 40); this.ty = rand(36, this.phase === 2 ? 140 : 110); this.moveT = rand(2.5, 4);
    }
    this.vx += ((this.tx - this.x) * 1.4 - this.vx * 1.8) * dt; this.vy += ((this.ty - this.y) * 1.4 - this.vy * 1.8) * dt;
    const maxv = this.phase === 2 ? 80 : 60, v = Math.hypot(this.vx, this.vy);
    if (v > maxv) { this.vx *= maxv / v; this.vy *= maxv / v; }
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.regrowT > 0) {
      this.regrowT -= dt;
      if (this.regrowT <= 0) { this.makeCells(); Sound.play('ice'); G.effects.push(new RingFx(this.x, this.y, 30, 10, '#fcd820', 0.4)); }
    }
    // рой: дроны вылетают веером и наводятся на ближайшего игрока
    this.droneT -= dt;
    if (this.droneT <= 0) {
      this.droneT = this.phase === 1 ? 5 : 3.8;
      const n = Math.min(this.phase === 1 ? 3 : 5, 10 - G.bullets.filter(b => b.alive && b.kind === 'drone').length);
      for (let i = 0; i < n; i++) {
        const a = Math.PI / 2 + (i - (n - 1) / 2) * 0.6;
        G.bullets.push(new Bullet(this.x + Math.cos(a) * 14, this.y + Math.sin(a) * 14, Math.cos(a) * 70, Math.sin(a) * 70, 'enemy', null,
          { kind: 'drone', size: 5, hp: 1, homing: 2.4, explosive: 14, cancel: false, fly: true, life: 7 }));
      }
      if (n > 0) Sound.play('missile');
    }
    this.stingT -= dt;
    if (this.stingT <= 0 && tg) {
      this.stingT = this.phase === 1 ? 2.2 : 1.6;
      const n = this.phase === 1 ? 3 : 5, a = angleTo(this.x, this.y + 10, tg.cx, tg.cy);
      for (let k = 0; k < n; k++) enemyShot(this.x, this.y + 10, a + (k - (n - 1) / 2) * 0.18, 130, { kind: 'small', size: 3 });
      Sound.play('eshoot');
    }
    if (this.phase === 2) { this.minionT -= dt; if (this.minionT <= 0) { this.minionT = 13; G.spawnMinions(2, 'kamikaze', this.x, this.y + 20); } }
  }
  drawGround(g) { if (this.y > -30) ellipse(g, this.x + 10, this.y + 24, 18, 6, 'rgba(0,0,0,0.45)'); }
  drawAir(g) {
    const x = Math.round(this.x), y = Math.round(this.y), t = this.t, fl = this.flash > 0, wg = Math.floor(t * 24) % 2;
    for (const s of [-1, 1]) ellipse(g, x + s * 20, y - 6 - wg, 10, 4, 'rgba(220,232,248,0.45)'); // крылья
    drawArt(g, 'hiveCore', x, y, 0, fl);
    if (!this.cells.length) { disc(g, x, y, 5, '#3c2400'); disc(g, x, y, 4, Math.floor(t * 10) % 2 ? '#fcd820' : '#f83800'); } // ядро открыто
    for (const c of this.cells) drawArt(g, 'hiveCell', c.x, c.y, 0, c.flash > 0);
  }
}

// ------------------------------------------------------------
//  ДУЭТ — два босса разом. Снаружи выглядит как один босс (общая полоска здоровья),
//  попадания уходят тому, в кого попали; граната бьёт обоих.
// ------------------------------------------------------------
class Duo extends Boss {
  constructor(def, scale, k) {
    const subs = def.ids.map((id, i) => { const b = new BOSS_CLASSES[id](scale); b.shift(def.shift[i][0], def.shift[i][1]); return b; });
    super(subs.map(b => tr(b.name)).join(' + '), subs[0].maxHp + subs[1].maxHp);
    this.subs = subs; this.k = k;
    for (const b of subs) { b.parent = this; b.wraps = new Map(); }
  }
  get hudName() { return tr('ДУЭТ') + ' ' + (this.k + 1) + '/' + DUO_BOSSES.length; }
  live() { return this.subs.filter(b => b.alive && !b.dying); }
  // обёртка части тела — одна и та же для одной части (пробивающие снаряды помнят, кого уже прошили)
  wrap(b, p) { let w = b.wraps.get(p); if (!w) { w = { duo: b, p }; b.wraps.set(p, w); } return w; }
  sync() {
    const L = this.live();
    this.hp = this.subs.reduce((a, b) => a + Math.max(0, b.hp), 0);
    this.flash = Math.max(...this.subs.map(b => b.flash));
    this.active = L.some(b => b.active);
    this.dying = !L.length;
  }
  aim() { const L = this.live(); return (L.find(b => b.active) || L[0] || this.subs[0]).aim(); }
  bounds() {
    const B = (this.live().length ? this.live() : this.subs).map(b => b.bounds());
    const x0 = Math.min(...B.map(b => b.x)), y0 = Math.min(...B.map(b => b.y));
    return { x: x0, y: y0, w: Math.max(...B.map(b => b.x + b.w)) - x0, h: Math.max(...B.map(b => b.y + b.h)) - y0 };
  }
  blocks(x, y, w, h) { return this.subs.some(b => b.alive && !b.dying && b.blocks(x, y, w, h)); }
  hitTest(x, y, h) {
    for (const b of this.live()) { const p = b.hitTest(x, y, h); if (p) return this.wrap(b, p); }
    return null;
  }
  damage(dmg, part) {
    let r = 'reflect';
    if (part && part.duo) r = part.duo.damage(dmg, part.p);
    else for (const b of this.live()) if (b.damage(dmg, 'grenade') === 'ok') r = 'ok';
    this.sync();
    return r;
  }
  update(dt) {
    this.t += dt;
    for (const b of this.subs) if (b.alive) b.update(dt);
    this.sync();
  }
  subDown(b) {
    this.sync();
    if (this.subs.some(q => q.alive)) { G.banner(tr(b.name) + ' ' + tr('ПОВЕРЖЕН!'), '#fcd820'); return; }
    this.alive = false;
    G.onBossKilled(this);
  }
  drawGround(g) { for (const b of this.subs) if (b.alive) b.drawGround(g); }
  drawAir(g) { for (const b of this.subs) if (b.alive) b.drawAir(g); }
}

const BOSS_CLASSES = {
  goliath: Goliath, heli: Heli, worm: Worm, omega: Omega, twins: Twins, cryo: Cryo, scorpion: Scorpion, phantom: Phantom,
  inferno: Inferno, drill: Drill, magnet: Magnet, hive: Hive,
};
// 12 боссов по порядку: по три на биом, без жребия
const SOLO_BOSSES = ['goliath', 'twins', 'drill', 'heli', 'cryo', 'magnet', 'worm', 'scorpion', 'inferno', 'hive', 'phantom', 'omega'];
// супер-сложность: шесть дуэтов подряд. Пары подобраны так, чтобы не мешать друг другу:
// земля + воздух, разные этажи (под землёй / сверху), Омега занимает верх — с ней только летающий Фантом
const DUO_BOSSES = [
  { ids: ['goliath', 'heli'], shift: [[0, 0], [0, 0]] },
  { ids: ['twins', 'hive'], shift: [[0, 0], [0, 0]] },
  { ids: ['cryo', 'inferno'], shift: [[-100, 0], [100, 0]] },
  { ids: ['worm', 'magnet'], shift: [[0, 0], [0, 0]] },
  { ids: ['scorpion', 'drill'], shift: [[0, 0], [0, 40]] },
  { ids: ['omega', 'phantom'], shift: [[0, 0], [0, 70]] },
];
function makeBoss(id, scale) { return new BOSS_CLASSES[id](scale); }
function makeDuo(k, scale) { return new Duo(DUO_BOSSES[k], scale, k); }
