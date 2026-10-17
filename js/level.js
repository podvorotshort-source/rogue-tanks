'use strict';
// ============================================================
//  LEVEL: карта из клеток 8x8, процедурная генерация, коллизии
// ============================================================

const T_EMPTY = 0, T_BRICK = 1, T_STEEL = 2, T_WATER = 3, T_BUSH = 4, T_ICE = 5;
const ENEMY_SPAWNS = [[0, 0], [7, 0], [16, 0], [23, 0]];
const SIDE_SPAWNS = [[0, 6], [23, 6]];
const PLAYER_SPAWNS = [[9, 14], [14, 14], [11.5, 14]]; // 3P стартует между 1P и 2P

class Level {
  constructor(biome) {
    this.biome = biome;
    this.tiles = getTiles(biome);
    this.cells = new Uint8Array(COLS * ROWS);
    this.ground = mk(FW, FH);
    this.layer = mk(FW, FH);
    this.bushLayer = mk(FW, FH);
    this.waterLayers = [mk(FW, FH), mk(FW, FH)];
    this.lg = this.layer.getContext('2d');
    this.spawns = ENEMY_SPAWNS.slice();
    this.blockPass = new Uint8Array(BCOLS * BROWS);
  }
  get(cx, cy) { if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return -1; return this.cells[cy * COLS + cx]; }
  rawSet(cx, cy, t) { if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return; this.cells[cy * COLS + cx] = t; }
  set(cx, cy, t) {
    if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return;
    this.cells[cy * COLS + cx] = t;
    const g = this.lg, x = cx * CELL, y = cy * CELL;
    g.clearRect(x, y, CELL, CELL);
    this.drawCell(g, t, x, y);
  }
  drawCell(g, t, x, y) {
    if (t === T_BRICK) g.drawImage(this.tiles.brick, x, y);
    else if (t === T_STEEL) g.drawImage(this.tiles.steel, x, y);
    else if (t === T_ICE) g.drawImage(this.tiles.ice, x, y);
  }
  finalize() {
    const b = BIOMES[this.biome];
    const gg = this.ground.getContext('2d');
    rect(gg, 0, 0, FW, FH, b.bg);
    for (let i = 0; i < 900; i++) rect(gg, randi(0, FW - 1), randi(0, FH - 1), 1, 1, pick(b.speck));
    for (let i = 0; i < 14; i++) { const x = randi(0, FW - 4), y = randi(0, FH - 3); rect(gg, x, y, 3, 2, b.speck[1]); rect(gg, x + 1, y - 1, 1, 1, b.speck[0]); }
    this.lg.clearRect(0, 0, FW, FH);
    const bg = this.bushLayer.getContext('2d'), w0 = this.waterLayers[0].getContext('2d'), w1 = this.waterLayers[1].getContext('2d');
    for (let cy = 0; cy < ROWS; cy++) for (let cx = 0; cx < COLS; cx++) {
      const t = this.cells[cy * COLS + cx], x = cx * CELL, y = cy * CELL;
      this.drawCell(this.lg, t, x, y);
      if (t === T_BUSH) bg.drawImage(this.tiles.bush, x, y);
      if (t === T_WATER) { w0.drawImage(this.tiles.water[0], x, y); w1.drawImage(this.tiles.water[1], x, y); }
    }
  }
  drawBase(g, time) {
    g.drawImage(this.ground, 0, 0);
    g.drawImage(this.waterLayers[Math.floor(time * 2) % 2], 0, 0);
    g.drawImage(this.layer, 0, 0);
  }
  drawTop(g) { g.drawImage(this.bushLayer, 0, 0); }

  solidTank(t) { return t === -1 || t === T_BRICK || t === T_STEEL || t === T_WATER; }
  tankBlocked(x, y, w, h) {
    const x0 = Math.floor(x / CELL), y0 = Math.floor(y / CELL);
    const x1 = Math.floor((x + w - 0.01) / CELL), y1 = Math.floor((y + h - 0.01) / CELL);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (this.solidTank(this.get(cx, cy))) return true;
    return false;
  }
  onIce(x, y, w, h) {
    const cx = Math.floor((x + w / 2) / CELL), cy = Math.floor((y + h / 2) / CELL);
    let n = 0;
    for (let yy = cy - 1; yy <= cy; yy++) for (let xx = cx - 1; xx <= cx; xx++) if (this.get(xx, yy) === T_ICE) n++;
    return n >= 2;
  }
  debris(cx, cy, col) {
    if (G.particles.length > 400) return;
    for (let i = 0; i < 2; i++) G.particles.push(new Particle(cx * CELL + rand(1, 7), cy * CELL + rand(1, 7), rand(-50, 50), rand(-50, 50), rand(0.2, 0.45), col, 1 + (Math.random() < 0.4 ? 1 : 0)));
  }
  // разрушить клетки в прямоугольнике; вернуть что задели
  destroyRect(x, y, w, h, power) {
    const res = { brick: false, steel: false, cells: [] }; // cells — разрушенный кирпич (для «Осколков»)
    const x0 = Math.floor(x / CELL), y0 = Math.floor(y / CELL);
    const x1 = Math.floor((x + w - 0.01) / CELL), y1 = Math.floor((y + h - 0.01) / CELL);
    const b = BIOMES[this.biome];
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const t = this.get(cx, cy);
      if (t === T_BRICK) { res.brick = true; res.cells.push([cx, cy]); this.set(cx, cy, T_EMPTY); this.debris(cx, cy, b.brick.m); }
      else if (t === T_STEEL) { res.steel = true; if (power) { this.set(cx, cy, T_EMPTY); this.debris(cx, cy, b.steel.m); } }
    }
    return res;
  }
  destroyCircle(x, y, r, power) {
    const x0 = Math.floor((x - r) / CELL), y0 = Math.floor((y - r) / CELL);
    const x1 = Math.floor((x + r) / CELL), y1 = Math.floor((y + r) / CELL);
    const b = BIOMES[this.biome];
    let any = false;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      if (dist(cx * CELL + 4, cy * CELL + 4, x, y) > r) continue;
      const t = this.get(cx, cy);
      if (t === T_BRICK || (power && t === T_STEEL)) { this.set(cx, cy, T_EMPTY); this.debris(cx, cy, t === T_BRICK ? b.brick.m : b.steel.m); any = true; }
    }
    return any;
  }
  cellSolidBullet(x, y) { const t = this.get(Math.floor(x / CELL), Math.floor(y / CELL)); return t === T_BRICK || t === T_STEEL; }
  computeBlockPass() {
    for (let by = 0; by < BROWS; by++) for (let bx = 0; bx < BCOLS; bx++) {
      let ok = 1;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const t = this.cells[(by * 2 + dy) * COLS + bx * 2 + dx];
        if (t === T_STEEL || t === T_WATER) ok = 0;
      }
      this.blockPass[by * BCOLS + bx] = ok;
    }
  }
}

// ---------- генерация ----------
function blockBFS(B, sx, sy) {
  const d = new Int16Array(BCOLS * BROWS).fill(-1);
  const q = [sy * BCOLS + sx]; d[q[0]] = 0;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % BCOLS, y = (i / BCOLS) | 0;
    for (let k = 0; k < 4; k++) {
      const nx = x + DX[k], ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= BCOLS || ny >= BROWS) continue;
      const j = ny * BCOLS + nx;
      if (d[j] >= 0 || B[j] === T_STEEL || B[j] === T_WATER) continue;
      d[j] = d[i] + 1; q.push(j);
    }
  }
  return d;
}

function genBlocks(biome, opts) {
  const b = BIOMES[biome];
  const B = new Uint8Array(BCOLS * BROWS);
  const half = new Uint8Array(BCOLS * BROWS); // декоративные «половинки» кирпича
  const sym = opts.sym != null ? opts.sym : Math.random() < 0.7;
  const maxX = sym ? Math.ceil(BCOLS / 2) - 1 : BCOLS - 1;
  const put = (x, y, t, hv = 0) => {
    if (x < 0 || y < 0 || x > maxX || y >= BROWS) return;
    B[y * BCOLS + x] = t; half[y * BCOLS + x] = hv;
    if (sym) { const mx = BCOLS - 1 - x; B[y * BCOLS + mx] = t; half[y * BCOLS + mx] = hv ? (hv === 3 ? 4 : hv === 4 ? 3 : hv) : 0; }
  };
  const wall = () => Math.random() < b.steelRate * (opts.steelMul || 1) ? T_STEEL : T_BRICK;
  const blob = (x, y, w, h, t) => {
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const corner = (xx === 0 || xx === w - 1) && (yy === 0 || yy === h - 1);
      if (corner && Math.random() < 0.5) continue;
      put(x + xx, y + yy, t);
    }
  };
  const S = {
    hwall: () => { const x = randi(0, maxX), y = randi(1, 12), l = randi(2, 5), t = wall(); for (let i = 0; i < l; i++) put(x + i, y, t); },
    vwall: () => { const x = randi(0, maxX), y = randi(1, 10), l = randi(2, 4), t = wall(); for (let i = 0; i < l; i++) put(x, y + i, t); },
    box: () => {
      const w = randi(3, 4), h = randi(3, 4), x = randi(0, maxX - 1), y = randi(1, 10 - h), t = Math.random() < 0.8 ? T_BRICK : T_STEEL;
      const gap = randi(0, 3);
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
        const edge = xx === 0 || yy === 0 || xx === w - 1 || yy === h - 1;
        if (!edge) continue;
        if ((gap === 0 && yy === h - 1 && xx === 1) || (gap === 1 && yy === 0 && xx === 1) || (gap === 2 && xx === 0 && yy === 1) || (gap === 3 && xx === w - 1 && yy === 1)) continue;
        put(x + xx, y + yy, t);
      }
      if (Math.random() < 0.5) put(x + 1, y + 1, T_BUSH);
    },
    pillar: () => { const x = randi(0, maxX), y = randi(1, 12); if (Math.random() < 0.5) put(x, y, T_STEEL); else { put(x, y, T_BRICK); put(x + 1, y, T_BRICK); put(x, y + 1, T_BRICK); put(x + 1, y + 1, T_BRICK); } },
    pond: () => blob(randi(0, maxX - 1), randi(2, 10), randi(2, 4), randi(1, 3), T_WATER),
    grove: () => blob(randi(0, maxX - 1), randi(1, 11), randi(2, 4), randi(2, 3), T_BUSH),
    ice: () => blob(randi(0, maxX - 2), randi(1, 10), randi(3, 6), randi(2, 4), T_ICE),
    cross: () => { const x = randi(1, maxX - 1), y = randi(2, 10); put(x, y, T_BRICK); put(x - 1, y, T_BRICK); put(x + 1, y, T_BRICK); put(x, y - 1, T_BRICK); put(x, y + 1, T_BRICK); if (Math.random() < 0.4) put(x, y, T_STEEL); },
    ell: () => { const x = randi(0, maxX - 2), y = randi(1, 10), t = wall(); for (let i = 0; i < 3; i++) put(x + i, y, t); put(x, y + 1, t); put(x, y + 2, t); },
    halves: () => { const x = randi(0, maxX - 2), y = randi(1, 12), l = randi(2, 5), hv = randi(1, 4); for (let i = 0; i < l; i++) put(x + i, y, T_BRICK, hv); },
  };
  const weights = {
    hwall: 3, vwall: 3, box: 1.3, pillar: 2, pond: 1.1 * b.waterRate, grove: 1.4 * b.bushRate, ice: 0.8 * b.iceRate * (opts.iceMul || 1),
    cross: 1, ell: 1.5, halves: 1.5,
  };
  if (opts.weights) Object.assign(weights, opts.weights);
  const n = Math.round(randi(opts.minS || 7, opts.maxS || 10) * (sym ? 1 : 1.7));
  for (let i = 0; i < n; i++) S[weighted(weights)]();
  if (opts.iceMul > 2) for (let i = 0; i < 4; i++) S.ice();
  return { B, half };
}

function clearBlock(B, half, x, y) { if (x < 0 || y < 0 || x >= BCOLS || y >= BROWS) return; B[y * BCOLS + x] = 0; half[y * BCOLS + x] = 0; }

function buildLevel(biome, B, half, spawns) {
  const L = new Level(biome);
  L.spawns = spawns;
  for (let by = 0; by < BROWS; by++) for (let bx = 0; bx < BCOLS; bx++) {
    const t = B[by * BCOLS + bx], hv = half[by * BCOLS + bx];
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      let tt = t;
      if (t === T_BRICK && hv) {
        // 1 верх, 2 низ, 3 лево, 4 право
        if ((hv === 1 && dy === 1) || (hv === 2 && dy === 0) || (hv === 3 && dx === 1) || (hv === 4 && dx === 0)) tt = T_EMPTY;
      }
      L.rawSet(bx * 2 + dx, by * 2 + dy, tt);
    }
  }
  L.finalize();
  L.computeBlockPass();
  return L;
}

function generateLevel(biome, opts = {}) {
  const spawns = ENEMY_SPAWNS.concat(opts.sideSpawns ? SIDE_SPAWNS : []);
  for (let attempt = 0; attempt < 60; attempt++) {
    const { B, half } = genBlocks(biome, opts);
    // безопасные зоны
    for (let x = 7; x <= 16; x++) for (let y = 13; y <= 14; y++) clearBlock(B, half, x, y);
    for (const [sx, sy] of spawns) { clearBlock(B, half, sx, sy); clearBlock(B, half, sx, sy + 1); clearBlock(B, half, sx + (sx === 0 ? 1 : sx === 23 ? -1 : 0), sy); }
    // укрытия у старта
    if (Math.random() < 0.7) for (const x of [8, 15]) if (!B[12 * BCOLS + x]) B[12 * BCOLS + x] = T_BRICK;
    const d = blockBFS(B, PLAYER_SPAWNS[0][0], PLAYER_SPAWNS[0][1]);
    let ok = d[PLAYER_SPAWNS[1][1] * BCOLS + PLAYER_SPAWNS[1][0]] >= 0;
    for (const [sx, sy] of spawns) if (d[sy * BCOLS + sx] < 0) ok = false;
    if (!ok && attempt < 59) continue;
    if (!ok) for (let i = 0; i < B.length; i++) if (B[i] === T_STEEL || B[i] === T_WATER) B[i] = T_BRICK;
    // недостижимые пустоты — засыпаем кирпичом, чтобы не было «мёртвых» карманов
    for (let i = 0; i < B.length; i++) if (d[i] < 0 && (B[i] === T_EMPTY || B[i] === T_ICE || B[i] === T_BUSH)) B[i] = T_BRICK;
    return buildLevel(biome, B, half, spawns);
  }
}

// арены боссов
function generateBossArena(biome) {
  let opts;
  if (biome === 0) opts = { sym: true, minS: 4, maxS: 6, steelMul: 0.3, weights: { pond: 0.3, box: 0.4, ice: 0.2 } };
  else if (biome === 1) opts = { sym: true, minS: 7, maxS: 9, steelMul: 0.4, weights: { box: 1.5, pond: 0.4 } };
  else if (biome === 2) opts = { sym: true, minS: 5, maxS: 7, steelMul: 0.4, weights: { pond: 0.5, box: 0.2 } };
  else opts = { sym: true, minS: 5, maxS: 7, steelMul: 0.5, weights: { pond: 0.2, box: 0.6 } };
  for (let attempt = 0; attempt < 60; attempt++) {
    const { B, half } = genBlocks(biome, opts);
    for (let x = 7; x <= 16; x++) for (let y = 13; y <= 14; y++) clearBlock(B, half, x, y);
    if (biome === 0) for (let x = 8; x <= 15; x++) for (let y = 0; y <= 4; y++) clearBlock(B, half, x, y);
    if (biome === 2) for (let x = 9; x <= 14; x++) for (let y = 5; y <= 9; y++) clearBlock(B, half, x, y);
    if (biome === 3) {
      for (let x = 0; x < BCOLS; x++) for (let y = 0; y <= 5; y++) clearBlock(B, half, x, y);
      for (const x of [3, 4, 19, 20]) B[8 * BCOLS + x] = T_STEEL;
    }
    if (biome === 0) for (const [x, y] of [[5, 5], [18, 5], [5, 10], [18, 10]]) B[y * BCOLS + x] = T_STEEL;
    const d = blockBFS(B, PLAYER_SPAWNS[0][0], PLAYER_SPAWNS[0][1]);
    if (d[PLAYER_SPAWNS[1][1] * BCOLS + PLAYER_SPAWNS[1][0]] < 0 || d[6 * BCOLS + 12] < 0) continue;
    for (let i = 0; i < B.length; i++) if (d[i] < 0 && B[i] !== T_STEEL && B[i] !== T_WATER) B[i] = T_BRICK;
    return buildLevel(biome, B, half, ENEMY_SPAWNS.slice());
  }
  const B = new Uint8Array(BCOLS * BROWS), half = new Uint8Array(BCOLS * BROWS);
  return buildLevel(biome, B, half, ENEMY_SPAWNS.slice());
}
