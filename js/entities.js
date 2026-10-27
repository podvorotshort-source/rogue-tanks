'use strict';
// ============================================================
//  ENTITIES: эффекты, снаряды, танки игроков и врагов, бонусы
// ============================================================

// ---------- эффекты ----------
class Particle {
  constructor(x, y, vx, vy, life, col, size = 1, drag = 3) { this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.life = life; this.col = col; this.size = size; this.drag = drag; }
  update(dt) {
    this.x += this.vx * dt; this.y += this.vy * dt;
    const k = Math.max(0, 1 - this.drag * dt); this.vx *= k; this.vy *= k;
    this.life -= dt; return this.life > 0;
  }
  draw(g) { rect(g, Math.round(this.x), Math.round(this.y), this.size, this.size, this.col); }
}
function smoke(x, y, n = 1, col) {
  for (let i = 0; i < n && G.particles.length < 450; i++)
    G.particles.push(new Particle(x + rand(-3, 3), y + rand(-3, 3), rand(-6, 6), rand(-22, -10), rand(0.4, 0.9), col || pick(['#3c3c3c', '#545454', '#2c2c2c']), randi(1, 2), 0.5));
}

const BOOM_COLS = ['#fcfcfc', '#fcf0a0', '#fcc040', '#f88010', '#d83000', '#801000', '#401000'];
class Boom {
  constructor(x, y, r, o = {}) {
    this.x = x; this.y = y; this.r = r; this.t = 0; this.dur = o.dur || (0.22 + r * 0.014);
    this.pal = o.pal || BOOM_COLS; // ледяные взрывы — своя палитра
    this.blobs = [];
    const n = r > 10 ? 5 : 3;
    for (let i = 0; i < n; i++) { const a = rand(0, 6.28), d = rand(0.2, 0.6) * r; this.blobs.push([Math.cos(a) * d, Math.sin(a) * d, rand(0.35, 0.6) * r]); }
    if (r >= 10 && !o.quiet) {
      const n2 = Math.min(16, r | 0);
      for (let i = 0; i < n2 && G.particles.length < 450; i++) {
        const a = rand(0, 6.28), s = rand(30, 110) * (r / 16);
        G.particles.push(new Particle(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.25, 0.6), pick(this.pal.slice(0, 5)), randi(1, 2)));
      }
    }
  }
  update(dt) { this.t += dt; return this.t < this.dur; }
  draw(g) {
    const p = this.t / this.dur;
    const ci = Math.min(5, Math.floor(p * 6));
    const grow = p < 0.3 ? p / 0.3 : 1;
    const R = this.r * (0.5 + 0.5 * grow) * (p > 0.7 ? 1 - (p - 0.7) / 0.3 * 0.4 : 1);
    const outer = this.pal[ci + 1], inner = this.pal[ci];
    for (const b of this.blobs) disc(g, this.x + b[0] * grow, this.y + b[1] * grow, b[2] * grow * (1 - p * 0.3), outer);
    disc(g, this.x, this.y, R * 0.8, outer);
    if (p < 0.75) disc(g, this.x, this.y, R * 0.5 * (1 - p), inner);
  }
}
class RingFx {
  constructor(x, y, r0, r1, col, dur = 0.4) { Object.assign(this, { x, y, r0, r1, col, dur, t: 0 }); }
  update(dt) { this.t += dt; return this.t < this.dur; }
  draw(g) { const p = this.t / this.dur; circle(g, this.x, this.y, lerp(this.r0, this.r1, p), this.col, p > 0.6 ? 2 : 1); }
}
class Popup {
  constructor(x, y, txt, col = '#fcfcfc', dur = 0.9) { this.x = x; this.y = y; this.txt = txt; this.col = col; this.t = 0; this.dur = dur; }
  update(dt) { this.t += dt; this.y -= 14 * dt; return this.t < this.dur; }
  draw(g) { text(this.txt, Math.round(this.x), Math.round(this.y), this.col, 1, 'center', '#000', g); }
}

function explode(x, y, r, o = {}) {
  G.effects.push(new Boom(x, y, r, o));
  if (o.bricks !== false) G.level.destroyCircle(x, y, Math.max(5, r * 0.75), o.power);
  if (o.hurtPlayers) for (const p of G.players) if (!p.dead && dist(x, y, p.cx, p.cy) < r + 5) p.hurt(o.dmg || 1);
  const P = o.by instanceof Player ? o.by : null;
  if (o.hurtEnemies) for (const e of G.enemies) {
    if (!e.alive || e === o.skip || dist(x, y, e.cx, e.cy) >= r + 6) continue;
    if (P && P.perks.shatter && e.frozen > 0) shatter(e, P); else e.takeHit(o.dmg || 1, o.by);
  }
  if (o.hurtBoss && G.boss && G.boss.alive) { const part = G.boss.hitTest(x, y, r * 0.5); if (part && part !== o.skipPart) bossHit(part, o.dmg || 1, o.by); }
  if (P) { // синергии взрывов игрока
    if (P.perks.napalm && r >= 8) fireArea(x, y, r * 1.1, 3.5, P);
    if (P.perks.deton) detonateNear(x, y, 30, P);
  }
  G.shake = Math.max(G.shake, Math.min(5, r / 5));
  if (!o.silent) Sound.play(r >= 14 ? 'boom' : 'hit');
}

// ---------- миномётные снаряды / бомбы (с прицельной меткой) ----------
class Mortar {
  constructor(sx, sy, tx, ty, T, o = {}) {
    Object.assign(this, { sx, sy, tx, ty, T, t: 0, alive: true, r: o.r || 16, h: o.h != null ? o.h : 50, dmg: o.dmg || 1, pal: o.pal, col: o.col });
  }
  update(dt) {
    this.t += dt;
    if (this.t >= this.T) { this.alive = false; explode(this.tx, this.ty, this.r, { hurtPlayers: true, dmg: this.dmg, pal: this.pal }); }
  }
  drawMarker(g) {
    const p = this.t / this.T;
    const col = Math.floor(this.t * (5 + p * 16)) % 2 ? '#f83800' : '#fcd820';
    circle(g, this.tx, this.ty, this.r * (1 - p * 0.35), col, 3);
    rect(g, Math.round(this.tx) - 3, Math.round(this.ty), 7, 1, col); rect(g, Math.round(this.tx), Math.round(this.ty) - 3, 1, 7, col);
  }
  drawShell(g) {
    const p = this.t / this.T;
    const x = lerp(this.sx, this.tx, p), gy = lerp(this.sy, this.ty, p), y = gy - Math.sin(Math.PI * p) * this.h;
    rect(g, Math.round(x) - 1, Math.round(gy), 3, 2, 'rgba(0,0,0,0.5)');
    disc(g, x, y, 2, this.col || '#202020'); rect(g, Math.round(x) - 1, Math.round(y) - 1, 1, 1, '#a0a0a0');
  }
}

// ---------- снаряды ----------
class Bullet {
  constructor(x, y, vx, vy, team, owner, o = {}) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.team = team; this.owner = owner;
    this.size = o.size || 4; this.dmg = o.dmg || 1; this.power = !!o.power;
    this.pierce = o.pierce || 0; this.bounce = o.bounce || 0; this.explosive = o.explosive || 0;
    this.kind = o.kind || 'shell'; this.cancel = o.cancel !== false; this.counts = !!o.counts;
    this.hp = o.hp || 0; this.homing = o.homing || 0; this.breaks = o.breaks !== false;
    this.life = o.life || 6; this.alive = true; this.hits = null; this.age = 0;
    // улучшения: стихии (fx), цвет, заряженный выстрел, сверло, наведение ракет игрока
    this.fx = o.fx || null; this.col = o.col || null; this.charged = !!o.charged; this.shard = !!o.shard;
    this.drill = o.drill || 0; this.target = o.target || null; this.accel = o.accel || 0; this.maxsp = o.maxsp || 0;
    if (this.counts && owner) owner.out++;
  }
  // рикошет игрока с «Шаровой молнией»
  bounced() { if (this.team === 'player' && this.owner instanceof Player && this.owner.perks.ball) ballZap(this); }
  kill() {
    if (!this.alive) return;
    this.alive = false;
    if (this.counts && this.owner) this.owner.out = Math.max(0, this.owner.out - 1);
  }
  release() { if (this.counts && this.owner) this.owner.out = Math.max(0, this.owner.out - 1); this.counts = false; }
  impact() { G.effects.push(new Boom(this.x, this.y, this.size > 5 ? 7 : 4, { quiet: true })); }
  update(dt) {
    this.age += dt; this.life -= dt;
    if (this.life <= 0) { if (this.explosive) explode(this.x, this.y, this.explosive, { hurtPlayers: this.team === 'enemy', silent: true }); return this.kill(); }
    if (this.homing) {
      let tx = null, ty = 0;
      if (this.team === 'enemy') { const t = G.nearestPlayer(this.x, this.y); if (t) { tx = t.cx; ty = t.cy; } }
      else {
        if (!tAlive(this.target)) this.target = findTarget(this.x, this.y, 400);
        if (this.target) { const q = tpos(this.target); tx = q.x; ty = q.y; }
      }
      let sp = Math.hypot(this.vx, this.vy);
      if (this.accel) sp = Math.min(this.maxsp, sp + this.accel * dt);
      let a = Math.atan2(this.vy, this.vx);
      if (tx !== null) {
        let da = angleTo(this.x, this.y, tx, ty) - a;
        while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
        a += clamp(da, -this.homing * dt, this.homing * dt);
      }
      this.vx = Math.cos(a) * sp; this.vy = Math.sin(a) * sp;
    }
    if ((this.kind === 'rocket' || this.kind === 'missile') && Math.random() < 0.8 && G.particles.length < 450) {
      const sp = Math.hypot(this.vx, this.vy) || 1;
      G.particles.push(new Particle(this.x - this.vx / sp * 4, this.y - this.vy / sp * 4, rand(-5, 5), rand(-5, 5), rand(0.2, 0.4), pick(['#7c7c7c', '#545454', '#f8b800']), 1, 2));
    }
    const sp = Math.max(Math.abs(this.vx), Math.abs(this.vy));
    const steps = Math.max(1, Math.ceil(sp * dt / 2));
    for (let i = 0; i < steps && this.alive; i++) {
      const ox = this.x, oy = this.y;
      this.x += this.vx * dt / steps; this.y += this.vy * dt / steps;
      if (this.x < 0 || this.y < 0 || this.x >= FW || this.y >= FH) {
        if (this.bounce > 0) {
          this.bounce--;
          if (this.x < 0 || this.x >= FW) this.vx = -this.vx;
          if (this.y < 0 || this.y >= FH) this.vy = -this.vy;
          this.x = ox; this.y = oy; this.hits = null;
          this.bounced();
          continue;
        }
        if (this.team === 'player' && this.kind === 'shell') Sound.play('steel');
        if (this.explosive) explode(clamp(this.x, 0, FW), clamp(this.y, 0, FH), this.explosive, { hurtPlayers: this.team === 'enemy', hurtEnemies: this.team === 'player', by: this.owner, silent: true });
        this.impact(); this.kill(); return;
      }
      if (this.hitEntities()) return;
      if (this.hitMap(ox, oy)) return;
    }
  }
  hitMap(ox, oy) {
    const h = this.size / 2, L = G.level;
    const x0 = Math.floor((this.x - h) / CELL), y0 = Math.floor((this.y - h) / CELL);
    const x1 = Math.floor((this.x + h - 0.01) / CELL), y1 = Math.floor((this.y + h - 0.01) / CELL);
    let brick = false, steel = false;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const t = L.get(cx, cy);
      if (t === T_BRICK) brick = true; else if (t === T_STEEL) steel = true;
    }
    if (!brick && !steel) return false;
    if (this.bounce > 0 && steel && !brick && !this.power) {
      this.bounce--; this.hits = null;
      const bx = L.cellSolidBullet(this.x, oy), by = L.cellSolidBullet(ox, this.y);
      if (bx) this.vx = -this.vx;
      if (by) this.vy = -this.vy;
      if (!bx && !by) { this.vx = -this.vx; this.vy = -this.vy; }
      this.x = ox; this.y = oy;
      if (this.team === 'player') Sound.play('steel');
      this.bounced();
      return false;
    }
    if (this.breaks) {
      const ax = Math.abs(this.vx), ay = Math.abs(this.vy);
      let r;
      if (ay > ax * 2.5) r = [this.x - 8, this.y - h, 16, this.size];
      else if (ax > ay * 2.5) r = [this.x - h, this.y - 8, this.size, 16];
      else r = [this.x - 4, this.y - 4, 8, 8];
      const res = L.destroyRect(r[0], r[1], r[2], r[3], this.power);
      const P = this.owner instanceof Player ? this.owner : null;
      if (P && P.perks.shards && this.kind === 'shell' && !this.shard && res.cells.length) brickShards(this, res.cells);
      // «Стальной шторм»: снаряд-сверло проходит сквозь разрушенную стену
      if (this.drill > 0 && (res.brick || res.steel) && (!steel || this.power)) {
        this.drill--;
        if (this.team === 'player') Sound.play('brick');
        return false;
      }
    }
    if (this.team === 'player') Sound.play(steel && !this.power ? 'steel' : 'brick');
    if (this.explosive) explode(this.x, this.y, this.explosive, { hurtPlayers: this.team === 'enemy', hurtEnemies: this.team === 'player', by: this.owner, power: this.power, silent: this.team !== 'enemy' });
    this.impact(); this.kill();
    return true;
  }
  hitEntities() {
    const h = this.size / 2, bx = this.x - h, by = this.y - h, s = this.size;
    if (this.team === 'player') {
      const boss = G.boss;
      if (boss && boss.alive && !boss.dying) {
        const part = boss.hitTest(this.x, this.y, h);
        if (part && !(this.hits && this.hits.has(part))) {
          const r = bulletHitsBoss(this, part);
          if (r === 'reflect') {
            Sound.play('steel');
            if (G.effects.length < 200) G.effects.push(new RingFx(this.x, this.y, 1, 4, '#fcfcfc', 0.15));
            this.kill(); return true;
          }
          if (this.explosive) explode(this.x, this.y, this.explosive, { hurtEnemies: true, by: this.owner, silent: true });
          if (this.pierce > 0) { this.pierce--; (this.hits || (this.hits = new Set())).add(part); }
          else { this.impact(); this.kill(); return true; }
        }
      }
      for (const e of G.enemies) {
        if (!e.alive || (this.hits && this.hits.has(e))) continue;
        if (overlap(bx, by, s, s, e.x, e.y, 16, 16)) {
          if (e.shieldBlocks(this)) {
            Sound.play('steel');
            if (G.effects.length < 200) G.effects.push(new RingFx(this.x, this.y, 1, 5, '#e0ecf8', 0.15));
            this.impact(); this.kill(); return true;
          }
          bulletHitsEnemy(this, e);
          if (this.explosive) explode(this.x, this.y, this.explosive, { hurtEnemies: true, by: this.owner, skip: e, silent: true });
          if (this.pierce > 0) { this.pierce--; (this.hits || (this.hits = new Set())).add(e); }
          else { this.impact(); this.kill(); return true; }
        }
      }
      // снаряды игроков пролетают сквозь союзника без какого-либо эффекта
      for (const b of G.bullets) {
        if (!b.alive || b.team !== 'enemy' || !(b.cancel || b.hp)) continue;
        const bh = b.size / 2 + 1;
        if (overlap(bx, by, s, s, b.x - bh, b.y - bh, bh * 2, bh * 2)) {
          if (b.hp) { b.hp--; if (b.hp <= 0) { G.effects.push(new Boom(b.x, b.y, 8)); Sound.play('hit'); b.kill(); } }
          else { b.impact(); b.kill(); }
          this.impact(); this.kill(); return true;
        }
      }
    } else {
      for (const p of G.players) {
        if (p.dead) continue;
        if (p.barrier > 0 && dist(this.x, this.y, p.cx, p.cy) < 17) {
          this.release();
          this.team = 'player'; this.owner = p; this.cancel = true; this.homing = 0;
          let a = angleTo(p.cx, p.cy, this.x, this.y);
          const sp = Math.max(160, Math.hypot(this.vx, this.vy));
          if (p.perks.reflectx) { // «Взрывное отражение»: летит в ближайшего врага и взрывается
            const t = findTarget(this.x, this.y, 300);
            if (t) { const q = tpos(t); a = angleTo(this.x, this.y, q.x, q.y); }
            this.explosive = Math.max(this.explosive, 12); this.col = '#3cbcfc';
            G.effects.push(new RingFx(this.x, this.y, 2, 8, '#e8fcff', 0.2));
          }
          this.vx = Math.cos(a) * sp; this.vy = Math.sin(a) * sp; this.dmg = Math.max(this.dmg, p.stats.dmg);
          Sound.play('steel');
          return false;
        }
        if (overlap(bx, by, s, s, p.x + 1, p.y + 1, 14, 14)) {
          p.hurt(this.dmg);
          if (this.explosive) explode(this.x, this.y, this.explosive, { hurtPlayers: true });
          this.impact(); this.kill(); return true;
        }
      }
    }
    return false;
  }
  draw(g) {
    const x = Math.round(this.x), y = Math.round(this.y);
    switch (this.kind) {
      case 'shell': {
        const col = this.col || (this.team === 'player' ? '#fcfcfc' : '#fc9c80');
        const ax = Math.abs(this.vx), ay = Math.abs(this.vy);
        if (this.charged) { disc(g, x, y, 4 + Math.floor(this.age * 20) % 2, '#7c5800'); rect(g, x - 2, y - 2, 4, 4, '#fcd820'); rect(g, x - 1, y - 1, 2, 2, '#fcfcfc'); }
        else if (this.size >= 5) { rect(g, x - 2, y - 2, 4, 4, col); rect(g, x - 1, y - 1, 2, 2, '#fcd820'); }
        else if (ay > ax * 2.5) { rect(g, x - 1, y - 2, 3, 4, col); rect(g, x, this.vy < 0 ? y - 3 : y + 2, 1, 1, col); }
        else if (ax > ay * 2.5) { rect(g, x - 2, y - 1, 4, 3, col); rect(g, this.vx < 0 ? x - 3 : x + 2, y, 1, 1, col); }
        else rect(g, x - 1, y - 1, 3, 3, col);
        break;
      }
      case 'small':
        if (this.team === 'player' && this.col) { rect(g, x - 1, y - 1, 2, 2, this.col); break; }
        rect(g, x - 1, y - 1, 3, 3, this.team === 'player' ? '#fcfcfc' : '#fca044'); rect(g, x, y, 1, 1, '#fff8e0'); break;
      case 'orb': {
        const pulse = Math.floor(this.age * 12) % 2;
        disc(g, x, y, 3, this.team === 'player' ? '#3cbcfc' : (pulse ? '#f83878' : '#fc74b4'));
        rect(g, x - 1, y - 1, 2, 2, '#ffffff');
        break;
      }
      case 'ice': // ледяной осколок Криомеха (тёмный контур — чтобы виден был и на льду)
        rect(g, x - 2, y - 3, 5, 7, '#002050'); rect(g, x - 3, y - 2, 7, 5, '#002050');
        rect(g, x - 1, y - 2, 3, 5, '#3cbcfc'); rect(g, x - 2, y - 1, 5, 3, '#3cbcfc');
        rect(g, x, y - 1, 1, 3, '#f0fcff'); rect(g, x - 1, y, 3, 1, '#f0fcff');
        if (this.size >= 5) circle(g, x, y, 4, '#a4e4fc', 2);
        break;
      case 'flame': { // язык пламени: растёт и тускнеет
        const k = clamp(this.age / 0.45, 0, 1), r = 2 + Math.round(k * 3);
        disc(g, x, y, r, k < 0.4 ? '#fcd820' : k < 0.75 ? '#f87800' : '#a82000');
        if (k < 0.6) rect(g, x - 1, y - 1, 2, 2, '#fff8e0');
        break;
      }
      case 'acid': disc(g, x, y, 3, '#4c9800'); disc(g, x, y, 2, Math.floor(this.age * 12) % 2 ? '#8cd800' : '#b8f840'); rect(g, x - 1, y - 1, 1, 1, '#e8fcb0'); break;
      case 'bolt': { // плазменный разряд Фантома
        const sp = Math.hypot(this.vx, this.vy) || 1, ux = this.vx / sp, uy = this.vy / sp;
        pline(g, x - ux * 5, y - uy * 5, x, y, '#f838f8', 2);
        rect(g, x - 1, y - 1, 2, 2, '#fcfcfc');
        break;
      }
      case 'big': disc(g, x, y, 4, this.team === 'player' ? '#3cbcfc' : '#f87800'); disc(g, x, y, 3, '#fce0a8'); rect(g, x - 1, y - 1, 2, 2, '#ffffff'); break;
      case 'rocket': case 'missile': {
        const sp = Math.hypot(this.vx, this.vy) || 1, ux = this.vx / sp, uy = this.vy / sp;
        const len = this.kind === 'missile' ? 7 : 5;
        pline(g, x - ux * len, y - uy * len, x, y, this.kind === 'missile' ? '#a0a0a8' : '#c8c8c8', this.kind === 'missile' ? 3 : 2);
        rect(g, x - 1, y - 1, 2, 2, Math.floor(this.age * 10) % 2 ? '#f83800' : '#fcd820');
        break;
      }
    }
  }
}

// ---------- танки ----------
class Tank {
  constructor(x, y, dir) {
    this.x = x; this.y = y; this.dir = dir; this.w = 16; this.h = 16;
    this.alive = true; this.anim = 0; this.animT = 0; this.cool = 0; this.flash = 0;
    this.slide = 0; this.out = 0; this.hp = 1; this.maxHp = 1;
  }
  get cx() { return this.x + 8; }
  get cy() { return this.y + 8; }
  free(nx, ny) {
    if (nx < 0 || ny < 0 || nx + 16 > FW || ny + 16 > FH) return false;
    if (G.level.tankBlocked(nx, ny, 16, 16)) return false;
    for (const t of G.tanks) {
      if (t === this) continue;
      if (overlap(nx, ny, 16, 16, t.x, t.y, 16, 16)) {
        if (!overlap(this.x, this.y, 16, 16, t.x, t.y, 16, 16)) return false;
        if (dist(nx, ny, t.x, t.y) < dist(this.x, this.y, t.x, t.y)) return false;
      }
    }
    const b = G.boss;
    if (b && b.blocks && b.blocks(nx, ny, 16, 16) && !b.blocks(this.x, this.y, 16, 16)) return false;
    return true;
  }
  turn(nd) {
    if (nd === this.dir) return;
    if ((nd & 1) !== (this.dir & 1)) {
      if (nd & 1) { const sy = Math.round(this.y / 8) * 8; if (sy !== this.y && this.free(this.x, sy)) this.y = sy; }
      else { const sx = Math.round(this.x / 8) * 8; if (sx !== this.x && this.free(sx, this.y)) this.x = sx; }
    }
    this.dir = nd;
  }
  move(distance) {
    let moved = 0;
    while (distance > 0.0001) {
      const s = Math.min(1, distance);
      const nx = this.x + DX[this.dir] * s, ny = this.y + DY[this.dir] * s;
      if (!this.free(nx, ny)) return moved;
      this.x = nx; this.y = ny; distance -= s; moved += s;
    }
    return moved;
  }
  animate(dt, moving) {
    if (!moving) return;
    this.animT += dt;
    if (this.animT > 0.05) { this.animT = 0; this.anim ^= 1; }
  }
  frontBrick() {
    const L = G.level;
    let cells = [];
    if (this.dir === 0) { const cy = Math.floor((this.y - 1) / CELL); cells = [[Math.floor(this.x / CELL), cy], [Math.floor((this.x + 15) / CELL), cy]]; }
    else if (this.dir === 2) { const cy = Math.floor((this.y + 16) / CELL); cells = [[Math.floor(this.x / CELL), cy], [Math.floor((this.x + 15) / CELL), cy]]; }
    else if (this.dir === 1) { const cx = Math.floor((this.x + 16) / CELL); cells = [[cx, Math.floor(this.y / CELL)], [cx, Math.floor((this.y + 15) / CELL)]]; }
    else { const cx = Math.floor((this.x - 1) / CELL); cells = [[cx, Math.floor(this.y / CELL)], [cx, Math.floor((this.y + 15) / CELL)]]; }
    return cells.some(([x, y]) => L.get(x, y) === T_BRICK);
  }
}

// ---------- игроки ----------
const CLASSES = {
  assault: { name: 'ШТУРМОВИК', shape: 'std', hp: 4, speed: 52, reload: 0.40, bspeed: 190, maxB: 2, dmg: 1, special: 'volley', cd: 9,
    sname: 'ЗАЛП', sdesc: '16 СНАРЯДОВ ВО ВСЕ СТОРОНЫ', stats: [4, 3, 3, 2] },
  scout: { name: 'РАЗВЕДЧИК', shape: 'scout', hp: 3, speed: 68, reload: 0.30, bspeed: 220, maxB: 2, dmg: 1, special: 'dash', cd: 4,
    sname: 'РЫВОК', sdesc: 'НЕУЯЗВИМЫЙ ТАРАН ВПЕРЁД', stats: [3, 5, 4, 2] },
  heavy: { name: 'ТЯЖЁЛЫЙ', shape: 'heavy', hp: 6, speed: 40, reload: 0.55, bspeed: 170, maxB: 2, dmg: 2, special: 'shield', cd: 12,
    sname: 'ЩИТ', sdesc: 'НА 3 СЕК. ОТРАЖАЕТ СНАРЯДЫ', stats: [6, 2, 2, 4] },
};
const CLASS_LIST = ['assault', 'scout', 'heavy'];
const MAX_WEAPON = 10;

class Player extends Tank {
  constructor(idx, cls, ctrl, colorIdx) {
    super(0, 0, 0);
    const C = CLASSES[cls];
    this.idx = idx; this.cls = cls; this.ctrl = ctrl || ALL_CTRL;
    this.colorIdx = colorIdx != null ? colorIdx : idx;
    this.pal = 'pc' + this.colorIdx; this.shape = C.shape;
    this.maxHp = C.hp; this.hp = C.hp;
    this.perks = {}; this.weapon = 0; this.kills = 0; this.score = 0;
    this.dead = false; this.scd = 0; this.inv = 0; this.helmet = 0; this.barrier = 0;
    this.dashT = 0; this.dashHits = null; this.revive = 0;
    this.eshieldReady = true; this.eshieldT = 0; this.vampN = 0;
    this.aux = newAuxState(); this.lastShot = -10;
    this.recalc();
  }
  get color() { return PLAYER_PALS[this.colorIdx].ui; }
  get look() { return Math.floor(this.weapon / 2); } // внешний вид растёт каждые 2 звезды
  get label() { return (this.idx + 1) + 'P'; }
  recalc() {
    const C = CLASSES[this.cls];
    const s = { speed: C.speed, reload: C.reload, bspeed: C.bspeed, maxB: C.maxB, dmg: C.dmg, pierce: 0, bounce: 0, power: false,
      spread: false, explosive: 0, cdMul: 1, luck: 1, eshield: false, vamp: false, fieldRepair: 0, fx: null, pellets: 3 };
    for (const id in this.perks) for (let i = 0; i < this.perks[id]; i++) if (PERKS[id].apply) PERKS[id].apply(s);
    // уровни оружия от звёзд (общие для команды, до MAX_WEAPON)
    if (this.weapon >= 1) s.bspeed *= 1.3;
    if (this.weapon >= 2) s.maxB += 1;
    if (this.weapon >= 3) s.power = true;
    if (this.weapon >= 4) s.reload *= 0.75;
    if (this.weapon >= 5) s.dmg += 1;
    if (this.weapon >= 6) s.maxB += 1;
    if (this.weapon >= 7) s.bspeed *= 1.15;
    if (this.weapon >= 8) s.pierce += 1;
    if (this.weapon >= 9) s.reload *= 0.85;
    if (this.weapon >= 10) s.dmg += 1;
    this.stats = s;
  }
  placeAt(bx, by) {
    this.x = bx * BLK; this.y = by * BLK; this.dir = 0; this.out = 0; this.slide = 0;
    this.dashT = 0; this.barrier = 0; this.helmet = Math.max(this.helmet, 2.5); this.revive = 0;
    this.aux.mlx = null; this.aux.mly = null;
  }
  update(dt) {
    this.flash = Math.max(0, this.flash - dt);
    if (this.dead) return this.updateWreck(dt);
    this.cool -= dt; this.inv -= dt; this.helmet -= dt; this.barrier -= dt; this.scd -= dt;
    if (this.stats.eshield && !this.eshieldReady) { this.eshieldT -= dt; if (this.eshieldT <= 0) { this.eshieldReady = true; G.effects.push(new RingFx(this.cx, this.cy, 4, 12, '#3cbcfc', 0.3)); } }
    const onIce = G.level.onIce(this.x, this.y, 16, 16);
    updateAux(this, dt);
    if (this.dashT > 0) {
      this.dashT -= dt;
      const want = 320 * dt, m = this.move(want);
      if (this.perks.mtrail && this.perks.mines) { // «Минный след»
        this.aux.dashDist += m;
        if (this.aux.dashDist >= 18) { this.aux.dashDist = 0; dropMine(this); }
      }
      this.ram();
      if (G.particles.length < 450) G.particles.push(new Particle(this.cx + rand(-5, 5), this.cy + rand(-5, 5), 0, 0, 0.25, this.color, 2));
      if (m < want * 0.5) { this.ram(true); this.dashT = 0; }
      this.animate(dt, true);
      return;
    }
    const d = ctrlDir(this.ctrl);
    let moving = false;
    if (d >= 0) {
      this.turn(d);
      this.move(this.stats.speed * dt); moving = true; this.slide = onIce ? 0.45 : 0;
    }
    else if (this.slide > 0) {
      this.slide -= dt;
      if (onIce) { this.move(this.stats.speed * dt * 0.85); moving = true; } else this.slide = 0;
    }
    this.animate(dt, moving);
    if (Input.any(this.ctrl.fire)) this.tryFire();
    if (Input.hit(this.ctrl.special)) this.trySpecial();
  }
  ram(wide) {
    const pad = wide ? 4 : 2;
    for (const e of G.enemies) {
      if (!e.alive || this.dashHits.has(e)) continue;
      if (overlap(this.x - pad, this.y - pad, 16 + pad * 2, 16 + pad * 2, e.x, e.y, 16, 16)) { this.dashHits.add(e); e.takeHit(2 + this.stats.dmg - 1, this); G.shake = Math.max(G.shake, 2); }
    }
    const b = G.boss;
    if (b && b.alive && !b.dying && !this.dashHits.has(b)) {
      const part = b.hitTest(this.cx + DX[this.dir] * 6, this.cy + DY[this.dir] * 6, 8 + pad);
      if (part) { this.dashHits.add(b); bossHit(part, 3, this); G.shake = Math.max(G.shake, 3); }
    }
  }
  tryFire() {
    const s = this.stats;
    if (this.cool > 0 || this.out >= s.maxB) return;
    this.cool = s.reload;
    // «Выжидание»: после 1.5 с без выстрелов основной снаряд тройной и пробивной
    const charged = !!this.perks.wait && G.time - this.lastShot >= 1.5;
    this.lastShot = G.time;
    const base = Math.atan2(DY[this.dir], DX[this.dir]);
    const angs = s.spread ? (s.pellets >= 5 ? [0, -0.07, 0.07, -0.14, 0.14] : [0, -0.08, 0.08]) : [0]; // дробь кучная
    const bx = this.cx + DX[this.dir] * 7, by = this.cy + DY[this.dir] * 7;
    for (const a of angs) {
      const ch = charged && a === 0;
      G.bullets.push(new Bullet(bx, by, Math.cos(base + a) * s.bspeed, Math.sin(base + a) * s.bspeed, 'player', this, {
        dmg: s.dmg * (ch ? 3 : 1), power: s.power, pierce: s.pierce + (ch ? 1 : 0), bounce: s.bounce, explosive: s.explosive,
        size: s.dmg > 1 || ch ? 5 : 4, counts: a === 0, fx: s.fx, col: elemCol(s.fx), charged: ch,
      }));
    }
    G.effects.push(new Boom(bx + DX[this.dir] * 2, by + DY[this.dir] * 2, charged ? 6 : 3, { dur: charged ? 0.15 : 0.08, quiet: true }));
    Sound.play(charged ? 'cannon' : 'shoot');
  }
  trySpecial() {
    if (this.scd > 0) { Sound.play('deny'); return; }
    const C = CLASSES[this.cls], s = this.stats;
    this.scd = C.cd * s.cdMul;
    if (C.special === 'volley') {
      const st = !!this.perks.steelstorm; // «Стальной шторм»: ломает сталь и прошивает насквозь
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2;
        G.bullets.push(new Bullet(this.cx + Math.cos(a) * 7, this.cy + Math.sin(a) * 7, Math.cos(a) * s.bspeed, Math.sin(a) * s.bspeed, 'player', this,
          { dmg: s.dmg, power: s.power || st, pierce: s.pierce + (st ? 2 : 0), drill: st ? 4 : 0, explosive: s.explosive,
            size: s.dmg > 1 ? 5 : 4, fx: s.fx, col: st ? '#d8d8ec' : elemCol(s.fx) }));
      }
      G.effects.push(new RingFx(this.cx, this.cy, 4, 20, '#fcd820', 0.3));
      Sound.play('special');
    } else if (C.special === 'dash') {
      this.dashT = 0.24; this.inv = Math.max(this.inv, 0.45); this.dashHits = new Set(); this.aux.dashDist = 0;
      Sound.play('dash');
    } else {
      this.barrier = 3;
      Sound.play('shield');
    }
  }
  hurt(dmg) {
    if (this.dead || this.inv > 0 || this.helmet > 0 || this.barrier > 0 || this.dashT > 0 || G.state !== 'play') return false;
    if (this.stats.eshield && this.eshieldReady) {
      this.eshieldReady = false; this.eshieldT = 15; this.inv = 0.6;
      G.effects.push(new RingFx(this.cx, this.cy, 6, 18, '#3cbcfc', 0.35));
      Sound.play('steel');
      this.rumble(0.2, 0.4, 100);
      if (this.perks.disch) emp(this); // «Разрядник»
      return false;
    }
    this.hp -= dmg; this.inv = 1.2; this.flash = 0.1;
    G.shake = Math.max(G.shake, 4);
    Sound.play('hurt');
    if (this.hp <= 0) this.die();
    else { this.rumble(0.7, 0.5, 220); if (this.perks.retal) retaliate(this); }
    return true;
  }
  rumble(strong, weak, ms) {
    // трясём геймпад этого игрока; в одиночной игре управлять можно с любого — трясём все
    if (this.ctrl.pad != null) Input.rumble(this.ctrl.pad, strong, weak, ms);
    else if (this.ctrl === ALL_CTRL) for (let i = 0; i < MAX_PADS; i++) Input.rumble(i, strong, weak, ms);
  }
  die() {
    this.dead = true; this.hp = 0; this.revive = 0; this.barrier = 0; this.helmet = 0;
    explode(this.cx, this.cy, 18, { bricks: false });
    this.rumble(1, 1, 450);
    if (this.weapon > 0) { this.weapon--; this.recalc(); }
    G.onPlayerDeath(this);
  }
  onKill() {
    if (this.stats.vamp) {
      this.vampN++;
      if (this.vampN >= 12) { this.vampN = 0; if (this.hp < this.maxHp) { this.hp++; G.popups.push(new Popup(this.cx, this.y - 6, '+1', '#f83838')); } }
    }
  }
  updateWreck(dt) {
    // поднять может любой живой напарник рядом
    if (G.players.some(p => p !== this && !p.dead && dist(p.cx, p.cy, this.cx, this.cy) < 26)) {
      this.revive += dt;
      if (Math.random() < 0.4 && G.particles.length < 450) G.particles.push(new Particle(this.cx + rand(-8, 8), this.cy + rand(-8, 8), 0, -20, 0.4, this.color, 1));
      if (this.revive >= 2.5) this.doRevive();
    } else this.revive = Math.max(0, this.revive - dt);
    if (Math.random() < dt * 5) smoke(this.cx, this.cy - 2);
  }
  doRevive() {
    this.dead = false; this.hp = Math.max(1, Math.ceil(this.maxHp / 2)); this.inv = 2; this.revive = 0;
    this.rumble(0.3, 0.6, 250);
    Sound.play('revive');
    G.popups.push(new Popup(this.cx, this.y - 4, 'В СТРОЮ!', this.color, 1.4));
    G.effects.push(new RingFx(this.cx, this.cy, 4, 24, this.color, 0.5));
  }
  draw(g) {
    const x = Math.round(this.x), y = Math.round(this.y);
    if (this.dead) {
      g.drawImage(TankGfx.get(this.shape, 'wreck')[0][this.dir], x, y);
      if (G.players.length > 1) {
        const p = this.revive / 2.5;
        rect(g, x, y - 4, 16, 2, '#202020');
        if (p > 0) rect(g, x, y - 4, Math.round(16 * p), 2, this.color);
        else if (Math.floor(G.time * 2) % 2) text('SOS', x + 8, y - 11, this.color, 1, 'center', '#000', g);
      }
      return;
    }
    if (this.inv > 0 && this.dashT <= 0 && Math.floor(G.time * 20) % 2 === 0) return;
    const pal = this.flash > 0 ? 'white' : this.pal;
    g.drawImage(TankGfx.get(this.shape, pal, this.look)[this.anim][this.dir], x, y);
    drawAux(this, g);
    if (this.helmet > 0) {
      const ph = Math.floor(G.time * 16) % 2;
      circle(g, this.cx, this.cy, 11, ph ? '#fcfcfc' : '#3cbcfc', 2);
      circle(g, this.cx, this.cy, 10, ph ? '#3cbcfc' : '#fcfcfc', 3);
    }
    if (this.barrier > 0) {
      const r = 15 + Math.sin(G.time * 20);
      circle(g, this.cx, this.cy, r, '#a4e4fc', 1);
      circle(g, this.cx, this.cy, r - 2, '#3c78f8', 2);
    }
  }
}

// ---------- враги ----------
const ENEMY_TYPES = {
  basic: { shape: 'basic', pal: 'basic', hp: 1, speed: 32, bspeed: 120, reload: 1.2, fire: 0.55, score: 100, name: 'ЛЁГКИЙ' },
  fast: { shape: 'fast', pal: 'fast', hp: 1, speed: 62, bspeed: 140, reload: 1.0, fire: 0.5, score: 200, name: 'БЫСТРЫЙ' },
  power: { shape: 'power', pal: 'power', hp: 1, speed: 38, bspeed: 230, reload: 0.9, fire: 0.8, score: 300, name: 'СНАЙПЕР' },
  armor: { shape: 'armor', pal: 'armor', hp: 4, speed: 30, bspeed: 140, reload: 1.1, fire: 0.6, score: 400, name: 'БРОНЯ' },
  spread: { shape: 'spread', pal: 'spread', hp: 2, speed: 34, bspeed: 120, reload: 1.4, fire: 0.6, score: 300, name: 'ДРОБОВИК' },
  artillery: { shape: 'artillery', pal: 'artillery', hp: 2, speed: 22, bspeed: 120, reload: 2.0, fire: 0.15, score: 400, name: 'МИНОМЁТ' },
  kamikaze: { shape: 'kamikaze', pal: 'kamikaze', hp: 1, speed: 74, bspeed: 120, reload: 0.8, fire: 0, score: 250, name: 'КАМИКАДЗЕ' },
  // щит спереди отражает снаряды — заходить сбоку или бить взрывами
  shield: { shape: 'shield', pal: 'shield', hp: 2, speed: 30, bspeed: 130, reload: 1.3, fire: 0.5, score: 350, name: 'ЩИТОНОСЕЦ' },
  // вблизи заливает огнём, издалека не стреляет
  flamer: { shape: 'flamer', pal: 'flamer', hp: 2, speed: 44, bspeed: 120, reload: 1.0, fire: 0, score: 350, name: 'ОГНЕМЁТ' },
  // расставляет мины позади себя
  miner: { shape: 'miner', pal: 'miner', hp: 2, speed: 36, bspeed: 120, reload: 1.4, fire: 0.35, score: 300, name: 'МИНЁР' },
};

function flowDir(t, pidx) {
  const f = G.flow && G.flow[pidx];
  if (!f) return -1;
  const bx = clamp(Math.round(t.x / BLK), 0, BCOLS - 1), by = clamp(Math.round(t.y / BLK), 0, BROWS - 1);
  const d0 = f[by * BCOLS + bx];
  if (d0 <= 0) return -1;
  const opts = [];
  for (let k = 0; k < 4; k++) {
    const nx = bx + DX[k], ny = by + DY[k];
    if (nx < 0 || ny < 0 || nx >= BCOLS || ny >= BROWS) continue;
    const v = f[ny * BCOLS + nx];
    if (v >= 0 && v < d0) opts.push(k);
  }
  return opts.length ? pick(opts) : -1;
}

class Enemy extends Tank {
  constructor(x, y, type, mods) {
    super(x, y, 2);
    const T = ENEMY_TYPES[type];
    this.type = type; this.cfg = T; this.shape = T.shape; this.pal = T.pal;
    this.hp = this.maxHp = Math.round((T.hp + (mods.hp || 0)) * (mods.hpMul || 1));
    this.speed = T.speed * mods.speed; this.fireMul = mods.fire; this.hunt = mods.hunt;
    this.bspeed = T.bspeed * (1 + 0.1 * (mods.loop || 0));
    this.maxB = (type === 'power' && mods.depth >= 8) ? 2 : 1;
    this.think = rand(0.2, 0.8); this.blockedT = 0; this.bonus = false;
    this.artT = rand(1.5, 3); this.aim = 0; this.fuse = 0; this.flameT = 0; this.flameE = 0; this.mineT = rand(2, 4);
    this.cool = rand(0.3, 1.2);
    // статусы от улучшений игроков
    this.burn = 0; this.burnT = 0; this.burnBy = null; this.slow = 0; this.chillN = 0; this.chillT = 0;
    this.frozen = 0; this.stun = 0; this.mark = 0; this.ramCd = 0;
  }
  spd() { return this.speed * (this.slow > 0 ? 0.45 : 1); }
  tickStatus(dt) {
    if (this.ramCd > 0) this.ramCd -= dt;
    if (this.slow > 0) this.slow -= dt;
    if (this.frozen > 0) this.frozen -= dt;
    if (this.stun > 0) this.stun -= dt;
    if (this.mark > 0) this.mark -= dt;
    if (this.chillT > 0 && (this.chillT -= dt) <= 0) this.chillN = 0;
    if (this.slow > 0 && this.frozen <= 0 && Math.random() < dt * 8 && G.particles.length < 450)
      G.particles.push(new Particle(this.cx + rand(-8, 8), this.cy + rand(-8, 8), 0, 6, 0.4, '#a4e4fc', 1, 1));
    if (this.burn > 0) {
      this.burn -= dt; this.burnT -= dt;
      if (Math.random() < dt * 10 && G.particles.length < 450)
        G.particles.push(new Particle(this.cx + rand(-5, 5), this.y + 3, rand(-4, 4), rand(-26, -12), 0.35, pick(['#f83800', '#fca044', '#fcd820']), 1, 0.5));
      if (this.burnT <= 0) { this.burnT = 1; this.takeHit(1, this.burnBy); }
    }
  }
  ignite(d, by) { if (this.burn <= 0) this.burnT = 1; this.burn = Math.max(this.burn, d); this.burnBy = by; }
  chill() {
    this.slow = 2; this.chillN++; this.chillT = 2.5;
    if (this.chillN >= 3) {
      this.chillN = 0; this.frozen = 1.5;
      G.effects.push(new RingFx(this.cx, this.cy, 4, 16, '#e8fcff', 0.3), new Boom(this.cx, this.cy, 9, { pal: ICE_COLS, quiet: true }));
      Sound.play('ice');
    }
  }
  push(dir, n) { // отбрасывание тараном
    for (let i = 0; i < n; i++) {
      const nx = this.x + DX[dir], ny = this.y + DY[dir];
      if (!this.free(nx, ny)) break;
      this.x = nx; this.y = ny;
    }
  }
  update(dt) {
    if (this.flash > 0) this.flash -= dt;
    this.tickStatus(dt);
    if (!this.alive || G.freeze > 0 || this.frozen > 0 || this.stun > 0) return;
    this.cool -= dt;
    if (this.type === 'kamikaze') return this.updateKamikaze(dt);
    if (this.type === 'artillery' && this.updateArtillery(dt)) return;
    if (this.type === 'flamer' && this.updateFlamer(dt)) return;
    if (this.type === 'miner') this.updateMiner(dt);
    this.think -= dt;
    if (this.think <= 0) this.decide(false);
    const want = this.spd() * dt, m = this.move(want);
    this.animate(dt, m > 0);
    if (m < want * 0.5) {
      this.blockedT += dt;
      if (this.frontBrick() && Math.random() < dt * 4) this.fire();
      if (this.blockedT > 0.3) { this.blockedT = 0; this.decide(true); }
    } else this.blockedT = 0;
    if (this.cfg.fire > 0) {
      const ad = this.aligned();
      if (ad >= 0) {
        if (ad === this.dir) { if (Math.random() < dt * 2.5 * this.fireMul) this.fire(); }
        else if (Math.random() < dt * 1.6 * this.hunt) { this.turn(ad); this.think = rand(0.3, 0.8); }
      }
      if (Math.random() < this.cfg.fire * dt * this.fireMul) this.fire();
    }
  }
  aligned() {
    for (const p of G.players) {
      if (p.dead) continue;
      if (Math.abs(p.cx - this.cx) < 6) return p.cy < this.cy ? 0 : 2;
      if (Math.abs(p.cy - this.cy) < 6) return p.cx < this.cx ? 3 : 1;
    }
    return -1;
  }
  decide(blocked) {
    const t = G.nearestPlayer(this.cx, this.cy);
    const r = Math.random();
    let nd = -1;
    if (t && r < this.hunt) nd = flowDir(this, t.idx);
    if (nd < 0 && t && r < this.hunt + 0.3) {
      const dx = t.cx - this.cx, dy = t.cy - this.cy;
      nd = (Math.abs(dx) > Math.abs(dy)) === (Math.random() < 0.75) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
    }
    if (nd < 0) nd = +weighted({ 0: 1, 1: 2, 2: 3, 3: 2 });
    if (blocked && nd === this.dir) nd = (this.dir + (Math.random() < 0.5 ? 1 : 3)) % 4;
    this.turn(nd);
    this.think = rand(0.7, 2.2);
  }
  fire() {
    if (this.cool > 0 || this.out >= this.maxB) return;
    this.cool = this.cfg.reload / this.fireMul * (this.slow > 0 ? 1.8 : 1);
    const bx = this.cx + DX[this.dir] * 7, by = this.cy + DY[this.dir] * 7;
    const base = Math.atan2(DY[this.dir], DX[this.dir]);
    const angs = this.type === 'spread' ? [0, -0.28, 0.28] : [0];
    for (const a of angs) G.bullets.push(new Bullet(bx, by, Math.cos(base + a) * this.bspeed, Math.sin(base + a) * this.bspeed, 'enemy', this, { counts: a === 0 }));
    Sound.play('eshoot');
  }
  // щит отражает снаряд, летящий в лоб и попавший в переднюю половину
  shieldBlocks(b) {
    if (this.type !== 'shield' || this.frozen > 0 || this.stun > 0) return false;
    const fx = DX[this.dir], fy = DY[this.dir];
    return b.vx * fx + b.vy * fy < 0 && (b.x - this.cx) * fx + (b.y - this.cy) * fy > 1;
  }
  updateFlamer(dt) {
    if (this.flameT > 0) {
      this.flameT -= dt; this.flameE -= dt;
      if (this.flameE <= 0) {
        this.flameE = 0.045;
        const a = Math.atan2(DY[this.dir], DX[this.dir]) + rand(-0.22, 0.22);
        G.bullets.push(new Bullet(this.cx + DX[this.dir] * 8, this.cy + DY[this.dir] * 8, Math.cos(a) * 130, Math.sin(a) * 130, 'enemy', this,
          { kind: 'flame', size: 5, cancel: false, breaks: false, life: rand(0.38, 0.5) }));
      }
      if (this.flameT <= 0) this.cool = 1.4 / this.fireMul;
      return true;
    }
    if (this.cool > 0) return false;
    for (const p of G.players) {
      if (p.dead || dist(p.cx, p.cy, this.cx, this.cy) > 64) continue;
      const dx = p.cx - this.cx, dy = p.cy - this.cy;
      if (Math.abs(dx) < 10 || Math.abs(dy) < 10) {
        this.turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
        this.flameT = 0.7; this.flameE = 0; Sound.play('dash');
        return true;
      }
    }
    return false;
  }
  updateMiner(dt) {
    this.mineT -= dt;
    if (this.mineT > 0) return;
    this.mineT = rand(3.5, 5.5) / this.fireMul;
    if (G.mines.filter(m => m instanceof EMine).length >= 8) return;
    G.mines.push(new EMine(this.cx - DX[this.dir] * 11, this.cy - DY[this.dir] * 11));
    Sound.play('mine');
  }
  updateArtillery(dt) {
    if (this.aim > 0) {
      this.aim -= dt;
      if (this.aim <= 0) {
        G.mortars.push(new Mortar(this.cx, this.cy, this.aimX, this.aimY, 1.3, { r: 16 }));
        Sound.play('mortar');
        this.artT = rand(3.2, 4.5) / this.fireMul;
      }
      return true;
    }
    this.artT -= dt;
    if (this.artT <= 0) {
      const t = G.nearestPlayer(this.cx, this.cy);
      if (t && dist(t.cx, t.cy, this.cx, this.cy) < 230) {
        this.aim = 0.6;
        this.aimX = clamp(t.cx + rand(-6, 6), 8, FW - 8); this.aimY = clamp(t.cy + rand(-6, 6), 8, FH - 8);
        const dx = t.cx - this.cx, dy = t.cy - this.cy;
        this.turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
        return true;
      }
      this.artT = 1;
    }
    return false;
  }
  updateKamikaze(dt) {
    if (this.fuse > 0) {
      this.fuse -= dt;
      this.flash = Math.floor(this.fuse * 20) % 2 ? 0.05 : 0;
      if (this.fuse <= 0) { this.alive = false; G.killedCount++; explode(this.cx, this.cy, 24, { hurtPlayers: true }); }
      return;
    }
    const t = G.nearestPlayer(this.cx, this.cy);
    this.think -= dt;
    if (this.think <= 0) {
      let nd = -1;
      if (t && Math.random() < 0.85) nd = flowDir(this, t.idx);
      if (nd < 0 && t) { const dx = t.cx - this.cx, dy = t.cy - this.cy; nd = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0); }
      if (nd < 0) nd = randi(0, 3);
      this.turn(nd); this.think = rand(0.25, 0.5);
    }
    const want = this.spd() * dt, m = this.move(want);
    this.animate(dt, m > 0);
    if (m < want * 0.5) {
      this.blockedT += dt;
      if (this.frontBrick() && Math.random() < dt * 5) this.fire();
      if (this.blockedT > 0.3) { this.blockedT = 0; this.decide(true); this.think = rand(0.3, 0.6); }
    } else this.blockedT = 0;
    if (t && dist(t.cx, t.cy, this.cx, this.cy) < 22) { this.fuse = 0.45; Sound.play('beep'); }
  }
  takeHit(dmg, by) {
    if (!this.alive) return;
    if (this.mark > 0) dmg *= 1.5; // «Корректировка»
    this.hp -= dmg; this.flash = 0.08;
    if (this.hp <= 0) this.die(by);
    else Sound.play(this.type === 'armor' ? 'steel' : 'hit');
  }
  die(by) {
    if (!this.alive) return;
    this.alive = false; G.killedCount++;
    G.effects.push(new Boom(this.cx, this.cy, 14));
    Sound.play('boom'); G.shake = Math.max(G.shake, 2);
    let luck = 1;
    if (by instanceof Player) {
      by.kills++;
      const sc = Math.round(this.cfg.score * G.scoreMul);
      by.score += sc;
      G.popups.push(new Popup(this.cx, this.cy - 4, String(sc)));
      by.onKill();
      luck = by.stats.luck;
    }
    if (this.bonus || Math.random() < G.dropChance * luck)
      G.pickups.push(new Pickup(Math.round(this.x / 8) * 8, Math.round(this.y / 8) * 8, randomPickup()));
    if (this.type === 'kamikaze') explode(this.cx, this.cy, 18, { hurtPlayers: true, silent: true });
  }
  draw(g) {
    let pal = this.pal;
    if (this.flash > 0) pal = 'white';
    else if (G.freeze > 0 || this.frozen > 0) pal = 'frozen';
    else if (this.bonus && Math.floor(G.time * 8) % 2) pal = 'bonus';
    g.drawImage(TankGfx.get(this.shape, pal)[this.anim][this.dir], Math.round(this.x), Math.round(this.y));
    drawStatus(g, this);
    if (this.type === 'artillery' && this.aim > 0) rect(g, this.cx - 1, this.cy - 1, 2, 2, Math.floor(G.time * 20) % 2 ? '#f83800' : '#fcfcfc');
    if (this.maxHp > 1 && this.hp < this.maxHp) {
      rect(g, Math.round(this.x) + 2, Math.round(this.y) - 3, 12, 2, '#200000');
      rect(g, Math.round(this.x) + 2, Math.round(this.y) - 3, Math.round(12 * this.hp / this.maxHp), 2, '#f83800');
    }
  }
}

// ---------- вражеская мина (Минёр) ----------
class EMine {
  constructor(x, y) { this.x = clamp(x, 4, FW - 4); this.y = clamp(y, 4, FH - 4); this.t = 0; this.dead = false; this.owner = null; this.fuse = -1; }
  detonate(delay) { if (!this.dead && this.fuse < 0) this.fuse = delay; }
  update(dt) {
    this.t += dt;
    if (this.fuse >= 0) { this.fuse -= dt; if (this.fuse <= 0) this.blow(); return; }
    if (this.t > 30) { this.dead = true; return; }
    if (this.t < 1) return;
    if (G.players.some(p => !p.dead && dist(this.x, this.y, p.cx, p.cy) < 11)) { this.fuse = 0.25; Sound.play('beep'); }
  }
  blow() { if (this.dead) return; this.dead = true; explode(this.x, this.y, 18, { hurtPlayers: true }); }
  draw(g) {
    const x = Math.round(this.x), y = Math.round(this.y);
    disc(g, x, y, 3, '#2c3010'); disc(g, x, y, 2, '#5c6424');
    for (const [dx, dy] of [[0, -4], [4, 0], [0, 4], [-4, 0]]) rect(g, x + dx, y + dy, 1, 1, '#5c6424');
    if (this.t < 1 || this.fuse >= 0 || Math.floor((G.time + this.x) * 3) % 2) rect(g, x, y - 1, 1, 1, '#f83800');
  }
}

// ---------- точка появления врага ----------
class Spawner {
  constructor(x, y, type, bonus) { this.x = x; this.y = y; this.type = type; this.bonus = bonus; this.t = 0; this.alive = true; Sound.play('spawn'); }
  update(dt) {
    this.t += dt;
    if (this.t < 1.0) return;
    const busy = G.tanks.some(t => overlap(t.x, t.y, 16, 16, this.x, this.y, 16, 16)) || (G.boss && G.boss.blocks && G.boss.blocks(this.x, this.y, 16, 16));
    if (busy) { this.t = 0.8; return; }
    const e = new Enemy(this.x, this.y, this.type, G.enemyMods);
    e.bonus = this.bonus;
    G.enemies.push(e); G.tanks.push(e);
    this.alive = false;
  }
  draw(g) {
    const s = [2, 4, 6, 7, 6, 4][Math.floor(this.t * 16) % 6], cx = this.x + 8, cy = this.y + 8;
    rect(g, cx - 1, cy - s, 2, s * 2, '#fcfcfc'); rect(g, cx - s, cy - 1, s * 2, 2, '#fcfcfc');
    const d = Math.floor(s * 0.6);
    for (let i = 1; i <= d; i++) { rect(g, cx - 1 - i, cy - 1 - i, 1, 1, '#3cbcfc'); rect(g, cx + i, cy - 1 - i, 1, 1, '#3cbcfc'); rect(g, cx - 1 - i, cy + i, 1, 1, '#3cbcfc'); rect(g, cx + i, cy + i, 1, 1, '#3cbcfc'); }
    rect(g, cx - 1, cy - 1, 2, 2, '#3cbcfc');
  }
}

// ---------- бонусы ----------
const PICKUP_TYPES = {
  helmet: { name: 'КАСКА', w: 18 }, clock: { name: 'ЧАСЫ', w: 13 }, grenade: { name: 'ГРАНАТА', w: 10 },
  star: { name: 'ЗВЕЗДА', w: 22 }, repair: { name: 'РЕМОНТ', w: 24 },
};
function randomPickup() { const w = {}; for (const k in PICKUP_TYPES) w[k] = PICKUP_TYPES[k].w; return weighted(w); }

class Pickup {
  constructor(x, y, type) { this.x = clamp(x, 0, FW - 16); this.y = clamp(y, 0, FH - 16); this.type = type; this.t = 0; this.life = 16; this.alive = true; }
  update(dt) {
    this.t += dt;
    if (this.t > this.life) { this.alive = false; return; }
    for (const p of G.players) if (!p.dead && overlap(this.x + 2, this.y + 2, 12, 12, p.x, p.y, 16, 16)) { this.apply(p); this.alive = false; return; }
  }
  apply(p) {
    Sound.play('pickup');
    let msg = PICKUP_TYPES[this.type].name;
    switch (this.type) {
      case 'helmet': p.helmet = 10; break;
      case 'clock': G.freeze = 7; Sound.play('freeze'); break;
      case 'grenade':
        for (const e of G.enemies) if (e.alive) e.die(p);
        if (G.boss && G.boss.alive && !G.boss.dying) G.boss.damage(10, 'grenade', null);
        G.flashT = 0.25; break;
      case 'star': {
        // звезда улучшает оружие сразу всем игрокам (и подбитому напарнику тоже)
        let upgraded = false;
        for (const q of G.players) {
          if (q.weapon >= MAX_WEAPON) continue;
          q.weapon++; q.recalc(); upgraded = true;
          G.popups.push(new Popup(q.cx, q.y - 6, tr('ОРУЖИЕ УР.') + q.weapon, q.color, 1.4));
        }
        if (upgraded) msg = null; else { p.score += 1000; msg = '+1000'; }
        break;
      }
      case 'repair': p.hp = Math.min(p.maxHp, p.hp + 2); break;
    }
    p.score += 500;
    if (msg) G.popups.push(new Popup(this.x + 8, this.y, msg, '#fcd820', 1.2));
  }
  draw(g) {
    if (this.life - this.t < 3 && Math.floor(this.t * 8) % 2) return;
    const x = this.x, y = this.y;
    rect(g, x, y, 16, 16, '#000');
    const bc = Math.floor(this.t * 4) % 2 ? '#fcfcfc' : '#f83800';
    rect(g, x, y, 16, 1, bc); rect(g, x, y + 15, 16, 1, bc); rect(g, x, y, 1, 16, bc); rect(g, x + 15, y, 1, 16, bc);
    g.drawImage(Icons[this.type], x + 2, y + 2);
  }
}
