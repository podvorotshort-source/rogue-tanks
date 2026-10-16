'use strict';
// ============================================================
//  BOSSES: Голиаф, Стрекоза, Сколопендра, Цитадель Омега
// ============================================================

function normA(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
function ellipse(g, cx, cy, rx, ry, col) {
  g.fillStyle = col; cx = Math.round(cx); cy = Math.round(cy);
  for (let dy = -ry; dy <= ry; dy++) { const dx = Math.round(rx * Math.sqrt(1 - (dy * dy) / (ry * ry))); g.fillRect(cx - dx, cy + dy, dx * 2 + 1, 1); }
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
      this.alive = false;
      G.onBossKilled(this);
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
  bounds() { return { x: this.x, y: this.y, w: 48, h: 48 }; }
  blocks(x, y, w, h) { return this.alive && !this.dying && overlap(x, y, w, h, this.x + 1, this.y + 1, 46, 46); }
  hitTest(x, y, h) { return overlap(x - h, y - h, h * 2, h * 2, this.x + 2, this.y + 2, 44, 44) ? 'body' : null; }
  tread(dt) { this.animT += dt; if (this.animT > 0.07) { this.animT = 0; this.anim ^= 1; } }
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
    const S = BossGfx.goliath();
    g.drawImage((this.flash > 0 ? S.w : S.n)[this.anim][this.dir], Math.round(this.x), Math.round(this.y));
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
    const S = BossGfx.heli();
    const x = Math.round(this.x), y = Math.round(this.y);
    g.drawImage(this.flash > 0 ? S.w : S.n, x - 20, y - 24);
    const hx = x, hy = y + 2;
    circle(g, hx, hy, 28, 'rgba(200,210,240,0.25)', 2);
    for (const off of [0, Math.PI / 2]) {
      const a = this.rot + off, cx = Math.cos(a) * 28, cy = Math.sin(a) * 28;
      pline(g, hx - cx, hy - cy, hx + cx, hy + cy, 'rgba(210,220,250,0.75)', 2);
    }
    rect(g, hx - 2, hy - 2, 4, 4, '#202838');
    const ta = this.rot * 1.7;
    pline(g, x - Math.cos(ta) * 6, y - 22, x + Math.cos(ta) * 6, y - 22, '#c0c8e0', 1);
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
    const S = BossGfx.worm(), P = BOSS_PALS.worm;
    if (this.under) {
      const j = Math.floor(this.t * 20) % 2;
      for (let i = this.segPos.length - 1; i >= 0; i--) { const p = this.segPos[i]; ellipse(g, p.x, p.y + j, 6, 3, '#3c2810'); rect(g, Math.round(p.x) - 2, Math.round(p.y) - 2, 3, 1, '#8c6c3c'); }
      ellipse(g, this.x, this.y + j, 9, 5, '#5c3c1c'); rect(g, Math.round(this.x) - 3, Math.round(this.y) - 3, 5, 2, '#8c6c3c');
      if (this.active && this.underT < 0.7) circle(g, this.x, this.y, 22, Math.floor(this.t * 16) % 2 ? '#f83800' : '#fcd820', 3);
      return;
    }
    for (let i = this.segPos.length - 1; i >= 0; i--) {
      const p = this.segPos[i], s = this.segs[i];
      const nx = -Math.sin(p.a), ny = Math.cos(p.a), fx = Math.cos(p.a), fy = Math.sin(p.a);
      for (const side of [-1, 1]) {
        const ph = Math.sin(this.t * 14 + i * 1.3 + (side > 0 ? 0 : Math.PI)) * 3;
        pline(g, p.x + nx * side * 5, p.y + ny * side * 5, p.x + nx * side * 11 + fx * ph, p.y + ny * side * 11 + fy * ph, P.d, 2);
        rect(g, Math.round(p.x + nx * side * 11 + fx * ph), Math.round(p.y + ny * side * 11 + fy * ph), 1, 1, P.l);
      }
      g.drawImage(s.flash > 0 ? S.segW : S.seg, Math.round(p.x - 8), Math.round(p.y - 8));
    }
    const f = Math.floor(this.t * 5) % 2;
    g.save();
    g.translate(Math.round(this.x), Math.round(this.y));
    g.rotate(this.a);
    g.drawImage((this.flash > 0 ? S.headW : S.head)[f], -11, -12);
    g.restore();
  }
}

// ------------------------------------------------------------
//  4. ЦИТАДЕЛЬ ОМЕГА — крепость с турелями, щитом ядра и лазером
// ------------------------------------------------------------
class Omega extends Boss {
  constructor(scale) {
    const th = Math.round(16 * scale), ch = Math.round(110 * scale);
    super('ЦИТАДЕЛЬ ОМЕГА', th * 4 + ch);
    this.x = (FW - 128) / 2; this.y = -60; this.vx = 0; this.anim = 0; this.animT = 0;
    this.turrets = OMEGA_TURRETS.map(t => ({ ...t, hp: th, max: th, dead: false, a: Math.PI / 2, cool: rand(1, 2.5), flash: 0, burst: 0, burstT: 0 }));
    this.core = { hp: ch, max: ch, flash: 0 };
    this.state = 'enter'; this.missileT = 6; this.laser = null; this.laserT = 4;
    this.ringT = 3; this.ring2 = 0; this.ringOff = 0; this.spiralT = 5; this.spiral = null; this.kamiT = 5;
  }
  get coreX() { return this.x + 64; }
  get coreY() { return this.y + 22; }
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
  treads(dt) { this.animT += dt; if (this.animT > 0.08) { this.animT = 0; this.anim ^= 1; } }
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
    const x = Math.round(this.x), y = Math.round(this.y), P = BOSS_PALS.omega;
    g.drawImage(BossGfx.omega()[this.anim], x, y);
    if (this.flash > 0) { g.globalAlpha = 0.5; rect(g, x, y, 128, 56, '#fcfcfc'); g.globalAlpha = 1; }
    // ядро
    const cx = x + 64, cy = y + 22;
    const cc = ['#801000', '#d82800', '#f87800', '#fcd820'];
    const pulse = Math.floor(this.t * 8) % 4;
    disc(g, cx, cy, 10, this.core.flash > 0 ? '#fcfcfc' : cc[(pulse + 1) % 4]);
    disc(g, cx, cy, 6, this.core.flash > 0 ? '#fcfcfc' : cc[(pulse + 2) % 4]);
    disc(g, cx, cy, 3, '#fcfcfc');
    if (this.phase === 1) {
      circle(g, cx, cy, 13 + Math.sin(this.t * 6), Math.floor(this.t * 10) % 2 ? '#3cbcfc' : '#a4e4fc', 2);
      circle(g, cx, cy, 15, '#3c78f8', 3);
    }
    // турели
    for (const t of this.turrets) {
      const tx = x + t.ox + 8, ty = y + t.oy + 8;
      if (t.dead) { disc(g, tx, ty, 6, '#141414'); rect(g, tx - 3, ty - 1, 2, 2, '#3c3c3c'); rect(g, tx + 2, ty + 1, 2, 1, '#f83800'); continue; }
      const fl = t.flash > 0;
      disc(g, tx, ty, 7, fl ? '#fcfcfc' : P.k); disc(g, tx, ty, 6, fl ? '#fcfcfc' : P.l); disc(g, tx - 1, ty - 1, 3, fl ? '#fcfcfc' : P.w);
      const len = t.kind === 'cannon' ? 11 : 10;
      pline(g, tx, ty, tx + Math.cos(t.a) * len, ty + Math.sin(t.a) * len, fl ? '#fcfcfc' : P.k, t.kind === 'cannon' ? 4 : 3);
      pline(g, tx, ty, tx + Math.cos(t.a) * len, ty + Math.sin(t.a) * len, fl ? '#fcfcfc' : P.m, t.kind === 'cannon' ? 2 : 1);
      rect(g, tx - 1, ty - 1, 2, 2, P.r);
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

function makeBoss(biome, scale) {
  return new [Goliath, Heli, Worm, Omega][biome](scale);
}
