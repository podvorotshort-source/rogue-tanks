'use strict';
// ============================================================
//  SPRITES: палитры, танки, тайлы биомов, бонусы, боссы
// ============================================================

const PALS = {
  p1: { d: '#8c5c00', m: '#e8a810', l: '#fce078', w: '#fffbe0' },
  p2: { d: '#005c18', m: '#18b030', l: '#a8f058', w: '#effff0' },
  p3: { d: '#982060', m: '#f070b0', l: '#fcc0e0', w: '#fff0f8' },
  basic: { d: '#5c5c5c', m: '#a8a8a8', l: '#e4e4e4', w: '#ffffff' },
  fast: { d: '#0030a0', m: '#2468e0', l: '#80b0fc', w: '#ffffff' },
  power: { d: '#301890', m: '#6848d0', l: '#b0a0f0', w: '#ffffff' },
  armor: { d: '#18181f', m: '#4a4a5c', l: '#8c8ca4', w: '#d8d8ec' },
  spread: { d: '#882000', m: '#e05c10', l: '#fca050', w: '#fff0d0' },
  artillery: { d: '#4c2c08', m: '#8c5c20', l: '#d0a060', w: '#fff0d0' },
  shield: { d: '#1c2430', m: '#3c4c60', l: '#8098b0', w: '#e0ecf8' },
  flamer: { d: '#3c0c00', m: '#8c2c0c', l: '#e06030', w: '#fcd820' },
  miner: { d: '#2c3010', m: '#5c6424', l: '#9ca450', w: '#e8ecc0' },
  kamikaze: { d: '#880018', m: '#d82838', l: '#fc8080', w: '#ffffff' },
  bonus: { d: '#a00010', m: '#f83800', l: '#fcb0a0', w: '#ffffff' },
  white: { d: '#c0c0c0', m: '#fcfcfc', l: '#fcfcfc', w: '#fcfcfc' },
  wreck: { d: '#141414', m: '#2c2c2c', l: '#484848', w: '#5c5c5c' },
  frozen: { d: '#3c6cac', m: '#8cbcfc', l: '#d0ecff', w: '#ffffff' },
};
// цвета на выбор игрокам: ни один не совпадает по тону с врагами (серые, синие, индиго, оранжевые, бурые, красные, тёмные)
const PLAYER_PALS = [
  { name: 'ЖЁЛТЫЙ', ui: '#fcd820', d: '#8c5c00', m: '#e8a810', l: '#fce078', w: '#fffbe0' },
  { name: 'ЗЕЛЁНЫЙ', ui: '#58d854', d: '#005c18', m: '#18b030', l: '#a8f058', w: '#effff0' },
  { name: 'РОЗОВЫЙ', ui: '#f878c0', d: '#982060', m: '#f070b0', l: '#fcc0e0', w: '#fff0f8' },
  { name: 'БИРЮЗОВЫЙ', ui: '#30d8c8', d: '#005850', m: '#10b0a0', l: '#80f0e0', w: '#e8fffc' },
  { name: 'ЛАЙМОВЫЙ', ui: '#b0f020', d: '#3c5c00', m: '#90d000', l: '#d8fc70', w: '#f8ffe0' },
  { name: 'НЕБЕСНЫЙ', ui: '#40d8f8', d: '#005878', m: '#20c0e8', l: '#a0f0fc', w: '#f0fcff' },
  { name: 'СИРЕНЕВЫЙ', ui: '#d0a0fc', d: '#6c3c98', m: '#c088f0', l: '#ecd0fc', w: '#fcf4ff' },
  { name: 'ПЕСОЧНЫЙ', ui: '#ecd488', d: '#7c6430', m: '#e0c070', l: '#fcf0c0', w: '#fffcf0' },
  { name: 'МЯТНЫЙ', ui: '#70f0b0', d: '#1c7048', m: '#50e098', l: '#c0fce0', w: '#f0fff8' },
  { name: 'ФУКСИЯ', ui: '#f060fc', d: '#800090', m: '#e030f0', l: '#f8a0fc', w: '#fff0ff' },
];
PLAYER_PALS.forEach((p, i) => { PALS['pc' + i] = p; });

// поворот спрайта на d четвертей по часовой (без интерполяции)
function rotCanvas(src, d) {
  const w = src.width, h = src.height;
  const sd = src.getContext('2d').getImageData(0, 0, w, h).data;
  const nw = d % 2 ? h : w, nh = d % 2 ? w : h;
  const c = mk(nw, nh), g = c.getContext('2d');
  const od = g.createImageData(nw, nh), o = od.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let nx, ny;
    if (d === 0) { nx = x; ny = y; } else if (d === 1) { nx = h - 1 - y; ny = x; }
    else if (d === 2) { nx = w - 1 - x; ny = h - 1 - y; } else { nx = y; ny = w - 1 - x; }
    const si = (y * w + x) * 4, di = (ny * nw + nx) * 4;
    o[di] = sd[si]; o[di + 1] = sd[si + 1]; o[di + 2] = sd[si + 2]; o[di + 3] = sd[si + 3];
  }
  g.putImageData(od, 0, 0);
  return c;
}
const rot4 = src => [0, 1, 2, 3].map(d => rotCanvas(src, d));

// ---------- танки 16x16 (рисуются стволом вверх) ----------
// lv — внешний вид прокачки игрока звёздами (0..5): дульный тормоз, накладки, антенна, звезда, золотая окантовка
function paintTank(g, shape, c, f, lv = 0) {
  const R = (x, y, w, h, col) => rect(g, x, y, w, h, col);
  let tw = 4, ty = 1, th = 15, hx = 3, hy = 3, hw = 10, hh = 11, tur = 6;
  const tcy = 9;
  if (shape === 'scout' || shape === 'fast') { tw = 3; ty = 2; th = 13; hy = 4; hh = 9; tur = 4; }
  if (shape === 'heavy' || shape === 'armor') { ty = 0; th = 16; hy = 2; hh = 13; tur = 8; }
  if (shape === 'artillery') tur = 8;
  if (shape === 'kamikaze') tur = 0;
  // гусеницы
  for (const tx of [0, 16 - tw]) {
    R(tx, ty, tw, th, c.d);
    for (let y = ty; y < ty + th; y++) if (((y + f) & 1) === 0) R(tx, y, tw, 1, c.m);
    R(tx === 0 ? 0 : 15, ty, 1, th, c.d);
  }
  // корпус
  R(hx, hy, hw, hh, c.m); R(hx, hy, hw, 1, c.l); R(hx, hy, 1, hh, c.l);
  R(hx, hy + hh - 1, hw, 1, c.d); R(hx + hw - 1, hy, 1, hh, c.d);
  const tTop = tcy - (tur >> 1);
  // ствол
  switch (shape) {
    case 'spread': R(4, 2, 2, 5, c.l); R(10, 2, 2, 5, c.l); R(4, 2, 2, 1, c.w); R(10, 2, 2, 1, c.w); R(7, 0, 2, tTop + 1, c.l); R(8, 0, 1, tTop + 1, c.m); R(7, 0, 2, 1, c.w); break;
    case 'heavy': R(5, 0, 2, tTop + 1, c.l); R(9, 0, 2, tTop + 1, c.l); R(6, 0, 1, tTop + 1, c.m); R(10, 0, 1, tTop + 1, c.m); R(5, 0, 2, 1, c.w); R(9, 0, 2, 1, c.w); break;
    case 'power': R(7, 1, 2, tTop, c.l); R(8, 1, 1, tTop, c.m); R(6, 0, 4, 2, c.l); R(6, 0, 4, 1, c.w); break;
    case 'armor': R(6, 0, 4, tTop + 1, c.d); R(7, 0, 2, tTop + 1, c.l); R(7, 0, 2, 1, c.w); break;
    case 'artillery': R(5, 1, 6, tTop, c.d); R(6, 1, 4, tTop, c.l); R(6, 1, 4, 1, c.d); R(7, 1, 2, 1, '#000'); break;
    case 'kamikaze': break;
    case 'shield': R(7, 2, 2, tTop, c.l); R(8, 2, 1, tTop, c.m); R(1, 0, 14, 2, c.d); R(2, 0, 12, 1, c.w); R(1, 1, 1, 1, c.l); R(14, 1, 1, 1, c.l); break;
    case 'flamer': R(6, 0, 4, 2, c.d); R(7, 0, 2, tTop + 1, c.l); R(7, 0, 2, 1, c.w); R(4, 11, 3, 4, c.d); R(9, 11, 3, 4, c.d); R(5, 12, 1, 2, c.w); R(10, 12, 1, 2, c.w); break;
    case 'miner': R(7, 1, 2, tTop, c.l); R(8, 1, 1, tTop, c.m); R(4, 12, 8, 3, c.d); for (const x of [5, 8, 10]) R(x, 13, 1, 1, '#f83800'); break;
    default: R(7, 0, 2, tTop + 1, c.l); R(8, 0, 1, tTop + 1, c.m); R(7, 0, 2, 1, c.w);
  }
  // башня
  if (tur) {
    const tx = 8 - (tur >> 1);
    R(tx + 1, tTop, tur - 2, tur, c.l); R(tx, tTop + 1, tur, tur - 2, c.l);
    R(tx + tur - 1, tTop + 1, 1, tur - 2, c.d); R(tx + 1, tTop + tur - 1, tur - 2, 1, c.d);
    R(7, tcy - 1, 2, 2, c.m); R(tx + 1, tTop + 1, 1, 1, c.w);
  }
  if (shape === 'kamikaze') {
    for (let y = hy + 1; y < hy + hh - 1; y++) for (let x = hx + 1; x < hx + hw - 1; x++)
      R(x, y, 1, 1, ((x + y) >> 1) & 1 ? '#fcd820' : '#181818');
    R(6, 0, 4, hy, c.l); R(7, 0, 2, 1, c.w);
    R(6, 7, 4, 3, c.d); R(7, 8, 2, 1, c.w);
  }
  if (lv >= 1) { R(6, 0, 4, 2, c.d); R(6, 0, 4, 1, c.w); } // дульный тормоз
  if (lv >= 2) { R(0, ty, 1, th, c.l); R(15, ty, 1, th, c.l); R(0, ty, tw, 1, c.w); R(16 - tw, ty, tw, 1, c.w); } // бортовые экраны
  if (lv >= 3) { R(hx + hw - 2, hy + hh - 8, 1, 6, '#202020'); R(hx + hw - 2, hy + hh - 9, 1, 2, '#f83800'); R(hx + 1, hy + hh - 4, 2, 2, c.w); } // антенна и фара
  if (lv >= 4) { R(7, hy + hh - 3, 2, 1, '#fcd820'); R(6, hy + hh - 2, 4, 1, '#fcd820'); } // звезда на корме
  if (lv >= 5) { R(hx, hy, hw, 1, '#fcd820'); R(hx, hy, 1, hh, '#fcd820'); R(hx + hw - 1, hy, 1, hh, '#a87800'); R(hx, hy + hh - 1, hw, 1, '#a87800'); } // золото
}

const TankGfx = {
  cache: new Map(),
  get(shape, pal, lv = 0) {
    const key = shape + '|' + pal + '|' + lv;
    let s = this.cache.get(key);
    if (!s) {
      s = [0, 1].map(f => { const c = mk(16, 16, true); paintTank(c.getContext('2d'), shape, PALS[pal], f, lv); return rot4(c); });
      this.cache.set(key, s);
    }
    return s;
  },
};

// ---------- биомы ----------
const BIOMES = [
  {
    name: 'ПОЛЯ', bg: '#000000', speck: ['#0e160e', '#141c10'],
    brick: { m: '#a84810', l: '#e8884c', d: '#4c4c4c' }, steel: { d: '#5c5c64', m: '#a4a4ac', l: '#f0f0f8' },
    water: ['#1c3cd8', '#4c8cfc', '#c4e4fc'], bush: ['#004400', '#1c8c1c', '#68d040'], ice: ['#a0a8b0', '#e8f0f8'],
    steelRate: 0.12, waterRate: 0.8, iceRate: 0.3, bushRate: 1.0,
  },
  {
    name: 'ТУНДРА', bg: '#04060c', speck: ['#101828', '#18243c'],
    brick: { m: '#5878a8', l: '#a8c8f0', d: '#1c2840' }, steel: { d: '#48505c', m: '#9098a8', l: '#e8f0ff' },
    water: ['#0c2860', '#2c68b8', '#a8d8fc'], bush: ['#0c3428', '#2c6c50', '#e0f4fc'], ice: ['#9cc8e8', '#f0fcff'],
    steelRate: 0.18, waterRate: 0.7, iceRate: 2.2, bushRate: 0.8,
  },
  {
    name: 'ПУСТОШЬ', bg: '#0a0500', speck: ['#24180a', '#2c1c08'],
    brick: { m: '#b07828', l: '#f0c878', d: '#4c3010' }, steel: { d: '#5c5048', m: '#a49888', l: '#f0e8d8' },
    water: ['#a81000', '#f87800', '#fce040'], bush: ['#3c2c00', '#7c6000', '#c8a048'], ice: ['#b8a890', '#f4ecdc'],
    steelRate: 0.15, waterRate: 1.3, iceRate: 0.2, bushRate: 0.6,
  },
  {
    name: 'ЗАВОД', bg: '#050505', speck: ['#141414', '#1c1c1c'],
    brick: { m: '#7c4434', l: '#c47c5c', d: '#2c1410' }, steel: { d: '#40444c', m: '#80889c', l: '#d0d8ec' },
    water: ['#0c4810', '#38b030', '#c0fc80'], bush: ['#1c341c', '#3c643c', '#6c946c'], ice: ['#8ca0a8', '#dceaf0'],
    steelRate: 0.3, waterRate: 0.9, iceRate: 0.4, bushRate: 0.7,
  },
];

const BUSH_ART = [
  '.mlm.dm.',
  'mllmdmlm',
  'lmmdmmld',
  'mdd.mdmm',
  '.mlmd.ml',
  'dmllmdlm',
  'mlmdmllm',
  '.dm.dmd.',
];
const tileCache = {};
function getTiles(bi) {
  if (tileCache[bi]) return tileCache[bi];
  const b = BIOMES[bi], T = {};
  let g;
  T.brick = mk(8, 8); g = T.brick.getContext('2d');
  rect(g, 0, 0, 8, 8, b.brick.d);
  rect(g, 0, 0, 7, 3, b.brick.m); rect(g, 0, 4, 3, 3, b.brick.m); rect(g, 4, 4, 4, 3, b.brick.m);
  rect(g, 0, 0, 7, 1, b.brick.l); rect(g, 0, 4, 3, 1, b.brick.l); rect(g, 4, 4, 4, 1, b.brick.l);

  T.steel = mk(8, 8); g = T.steel.getContext('2d');
  rect(g, 0, 0, 8, 8, b.steel.d); rect(g, 0, 0, 7, 7, b.steel.m);
  rect(g, 0, 0, 7, 1, b.steel.l); rect(g, 0, 0, 1, 7, b.steel.l); rect(g, 2, 2, 3, 3, b.steel.l); rect(g, 3, 3, 2, 2, b.steel.m);

  T.water = [0, 1].map(f => {
    const c = mk(8, 8), q = c.getContext('2d');
    rect(q, 0, 0, 8, 8, b.water[0]);
    const o = f * 3;
    rect(q, (1 + o) % 8, 1, 3, 1, b.water[1]); rect(q, (5 + o) % 8, 5, 3, 1, b.water[1]);
    rect(q, (1 + o) % 8, 1, 1, 1, b.water[2]); rect(q, (5 + o) % 8, 5, 1, 1, b.water[2]);
    return c;
  });

  T.bush = mk(8, 8); g = T.bush.getContext('2d');
  const bc = { d: b.bush[0], m: b.bush[1], l: b.bush[2] };
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const ch = BUSH_ART[y][x]; if (bc[ch]) rect(g, x, y, 1, 1, bc[ch]); }

  T.ice = mk(8, 8); g = T.ice.getContext('2d');
  rect(g, 0, 0, 8, 8, b.ice[0]);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 4 === 0) rect(g, x, y, 1, 1, b.ice[1]);
  rect(g, 6, 1, 1, 1, b.ice[1]);
  tileCache[bi] = T;
  return T;
}

// ---------- бонусы (иконки 12x12) ----------
const ICON_ART = {
  star: { c: { Y: '#fcd820', o: '#f87800' }, a: [
    '.....YY.....', '.....YY.....', '....YYYY....', 'YYYYYYYYYYYY', '.YYYYYYYYYY.', '..YYYYYYYY..',
    '...YYYYYY...', '...YYYYYY...', '..YYYooYYY..', '..YYo..oYY..', '.YYo....oYY.', '.Yo......oY.'] },
  helmet: { c: { w: '#fcfcfc', g: '#bcbcbc', d: '#7c7c7c' }, a: [
    '............', '....wwww....', '..wwggggww..', '.wggggggggw.', '.wggggggggd.', 'wggggggggggd',
    'wggggggggggd', 'wggddddddggd', 'wgd......dgd', 'wd........dd', '............', '............'] },
  clock: { c: { b: '#3cbcfc', w: '#fcfcfc', k: '#202020' }, a: [
    '...bbbbbb...', '..bwwwwwwb..', '.bwwwwkwwwb.', 'bwwwwwkwwwwb', 'bwwwwwkwwwwb', 'bwwwwwkwwwwb',
    'bwwwwwkkkkwb', 'bwwwwwwwwwwb', 'bwwwwwwwwwwb', '.bwwwwwwwwb.', '..bwwwwwwb..', '...bbbbbb...'] },
  grenade: { c: { G: '#18a018', L: '#68d040', d: '#005000', g: '#c0c0c0' }, a: [
    '......gg....', '.....g..g...', '....dddd....', '...dGGGGd...', '..dGLGGLGd..', '..dGGGGGGd..',
    '..dGLGGLGd..', '..dGGGGGGd..', '..dGLGGLGd..', '..dGGGGGGd..', '...dGGGGd...', '....dddd....'] },
  repair: { c: { R: '#e8203c', W: '#fcfcfc', d: '#901020' }, a: [
    '............', '.RRR....RRR.', 'RRRRR..RRRRR', 'RRWRRRRRRRRR', 'RWRRRRRRRRRR', 'RRRRRRRRRRRd',
    '.RRRRRRRRRd.', '..RRRRRRRd..', '...RRRRRd...', '....RRRd....', '.....Rd.....', '............'] },
};
const Icons = {};
for (const k in ICON_ART) {
  const { c, a } = ICON_ART[k], cv = mk(12, 12), g = cv.getContext('2d');
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) { const ch = a[y][x]; if (c[ch]) rect(g, x, y, 1, 1, c[ch]); }
  Icons[k] = cv;
}
// сердечки для HUD (7x6)
const HEART_ART = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
function makeHeart(col, hi) {
  const c = mk(7, 6), g = c.getContext('2d');
  for (let y = 0; y < 6; y++) for (let x = 0; x < 7; x++) if (HEART_ART[y][x] === '#') rect(g, x, y, 1, 1, col);
  if (hi) rect(g, 1, 1, 1, 1, hi);
  return c;
}
const HEART_FULL = makeHeart('#f83838', '#fcc8c8');
const HEART_EMPTY = makeHeart('#3c1818');
const HEART_SHIELD = makeHeart('#3cbcfc', '#e0f8ff');

// ============================================================
//  БОССЫ
// ============================================================
const BOSS_PALS = {
  goliath: { k: '#0c100c', d: '#1c2818', m: '#46623a', l: '#86a868', w: '#d0ecb0', r: '#f83800' },
  heli: { k: '#0c1018', d: '#283048', m: '#4c5c84', l: '#8c9cc8', w: '#e0e8ff', glass: '#30c0f0', r: '#f83800', y: '#fcd820' },
  worm: { k: '#100818', d: '#3c1c54', m: '#7040a0', l: '#b080e0', w: '#f8e8ff', eye: '#fc3800' },
  omega: { k: '#08080c', d: '#202028', m: '#3c3c4c', l: '#787890', w: '#c8c8e0', r: '#d82800', y: '#e8b800' },
  twinA: { k: '#100808', d: '#4c1010', m: '#a02818', l: '#e86040', w: '#fcc8a0', r: '#fcd820' },
  twinB: { k: '#080c14', d: '#102850', m: '#1c58b0', l: '#4c9cf8', w: '#c8e8fc', r: '#fcd820' },
  cryo: { k: '#0c1424', d: '#1c3c6c', m: '#3c78b8', l: '#a4e4fc', w: '#f0fcff', e: '#3cbcfc' },
  scorp: { k: '#140800', d: '#4c2808', m: '#9c6018', l: '#e0a840', w: '#fce8b0', e: '#30fc30' },
  phantom: { k: '#08080c', d: '#2c2c44', m: '#50506c', l: '#8c8cb0', w: '#d0d0f0', g: '#f838f8', c: '#38f8f8' },
};
const ACID_COLS = ['#ffffff', '#e8fcb0', '#b8f840', '#8cd800', '#4c9800', '#1c4c00', '#0c2800'];
const whitePal = p => { const o = {}; for (const k in p) o[k] = (k === 'k') ? '#a0a0a0' : '#fcfcfc'; return o; };

function paintGoliath(g, c, f) {
  for (const tx of [0, 38]) {
    rect(g, tx, 1, 10, 46, c.k);
    for (let y = 1; y < 47; y++) if (((y + f * 2) % 4) < 2) rect(g, tx + 1, y, 8, 1, c.d);
    for (let y = 3; y < 46; y += 8) rect(g, tx + 3, y, 4, 4, c.m);
  }
  rect(g, 7, 4, 34, 41, c.m);
  rect(g, 7, 4, 34, 1, c.l); rect(g, 7, 4, 1, 41, c.l); rect(g, 7, 44, 34, 1, c.d); rect(g, 40, 4, 1, 41, c.d);
  rect(g, 9, 6, 30, 5, c.d); rect(g, 10, 7, 28, 3, c.l);
  for (let x = 12; x < 37; x += 3) rect(g, x, 37, 2, 6, c.k);
  rect(g, 9, 41, 2, 2, c.r); rect(g, 37, 41, 2, 2, c.r);
  for (const mx of [9, 32]) {
    rect(g, mx, 12, 7, 7, c.d); rect(g, mx + 1, 13, 5, 5, c.l);
    rect(g, mx + 2, 5, 3, 9, c.d); rect(g, mx + 3, 5, 1, 9, c.w);
  }
  rect(g, 14, 16, 20, 20, c.d); rect(g, 13, 17, 22, 18, c.d);
  rect(g, 15, 17, 18, 18, c.l); rect(g, 14, 18, 20, 16, c.l);
  rect(g, 32, 18, 2, 16, c.m); rect(g, 15, 33, 18, 2, c.m);
  disc(g, 24, 28, 3, c.d); disc(g, 24, 28, 2, c.m);
  rect(g, 17, 20, 3, 3, c.w);
  rect(g, 21, 0, 6, 18, c.d); rect(g, 22, 0, 4, 18, c.l); rect(g, 25, 0, 1, 18, c.m);
  rect(g, 19, 0, 10, 4, c.d); rect(g, 20, 0, 8, 3, c.l); rect(g, 20, 0, 8, 1, c.w);
}

function paintHeli(g, c) {
  rect(g, 18, 0, 4, 22, c.d); rect(g, 19, 0, 2, 22, c.m);
  rect(g, 12, 1, 16, 3, c.d); rect(g, 13, 2, 14, 1, c.l);
  rect(g, 2, 26, 36, 4, c.d); rect(g, 2, 26, 36, 1, c.m);
  for (const px of [1, 33]) {
    rect(g, px, 22, 6, 12, c.k); rect(g, px + 1, 23, 4, 10, c.l);
    rect(g, px + 1, 32, 4, 2, c.r); rect(g, px + 2, 33, 2, 1, c.y);
  }
  rect(g, 13, 16, 14, 28, c.d); rect(g, 12, 19, 16, 22, c.d);
  rect(g, 14, 17, 12, 26, c.m); rect(g, 13, 20, 14, 20, c.m);
  rect(g, 14, 17, 3, 20, c.l);
  rect(g, 15, 21, 3, 4, c.k); rect(g, 22, 21, 3, 4, c.k);
  rect(g, 15, 34, 10, 8, c.glass); rect(g, 16, 42, 8, 2, c.glass); rect(g, 16, 35, 3, 3, c.w); rect(g, 15, 39, 10, 1, c.d);
  rect(g, 19, 44, 2, 4, c.k);
}

function paintWormSeg(g, c) {
  disc(g, 8, 8, 7, c.k); disc(g, 8, 8, 6, c.d); disc(g, 7, 7, 5, c.m);
  rect(g, 4, 4, 3, 2, c.l); rect(g, 4, 6, 2, 2, c.l);
  circle(g, 8, 8, 4, c.d, 2);
  rect(g, 7, 7, 2, 2, c.eye);
}
function paintWormHead(g, c, f) {
  const o = f ? 2 : 0;
  rect(g, 15, 2 - o, 7, 3, c.k); rect(g, 16, 3 - o, 6, 2, c.l); rect(g, 20, 4 - o, 3, 5, c.l); rect(g, 22, 8 - o, 1, 2, c.w);
  rect(g, 15, 19 + o, 7, 3, c.k); rect(g, 16, 19 + o, 6, 2, c.l); rect(g, 20, 15 + o, 3, 5, c.l); rect(g, 22, 14 + o, 1, 2, c.w);
  disc(g, 11, 12, 10, c.k); disc(g, 11, 12, 9, c.d); disc(g, 10, 11, 7, c.m);
  rect(g, 5, 6, 5, 3, c.l); rect(g, 5, 9, 2, 3, c.l);
  rect(g, 15, 7, 4, 3, c.eye); rect(g, 15, 14, 4, 3, c.eye); rect(g, 17, 8, 1, 1, c.w); rect(g, 17, 15, 1, 1, c.w);
  rect(g, 19, 11, 2, 2, c.k);
}

const OMEGA_TURRETS = [
  { ox: 12, oy: 32, kind: 'cannon' }, { ox: 32, oy: 32, kind: 'mg' },
  { ox: 80, oy: 32, kind: 'mg' }, { ox: 100, oy: 32, kind: 'cannon' },
];
function paintOmega(g, c, f) {
  for (const tx of [0, 116]) {
    rect(g, tx, 2, 12, 52, c.k);
    for (let y = 2; y < 54; y++) if (((y + f * 2) % 4) < 2) rect(g, tx + 1, y, 10, 1, c.d);
    for (let y = 5; y < 52; y += 9) rect(g, tx + 3, y, 6, 5, c.m);
  }
  rect(g, 10, 0, 108, 50, c.d); rect(g, 11, 1, 106, 48, c.m);
  rect(g, 11, 1, 106, 1, c.l); rect(g, 11, 1, 1, 48, c.l);
  rect(g, 10, 48, 108, 8, c.k);
  for (let x = 11; x < 117; x++) for (let y = 49; y < 55; y++) if (((x + y) >> 2) & 1) rect(g, x, y, 1, 1, c.y);
  for (let x = 16; x < 112; x += 12) { rect(g, x, 4, 1, 1, c.w); rect(g, x, 27, 1, 1, c.w); }
  for (const sx of [22, 96]) { rect(g, sx, 5, 10, 10, c.k); rect(g, sx + 1, 6, 8, 8, c.d); rect(g, sx + 3, 8, 4, 4, c.r); }
  rect(g, 50, 8, 28, 28, c.k); rect(g, 52, 10, 24, 24, c.d);
  for (let x = 38; x < 47; x += 3) rect(g, x, 10, 2, 16, c.k);
  for (let x = 82; x < 91; x += 3) rect(g, x, 10, 2, 16, c.k);
  for (const t of OMEGA_TURRETS) { rect(g, t.ox - 1, t.oy - 1, 18, 18, c.k); rect(g, t.ox, t.oy, 16, 16, c.d); }
}

// средний танк Близнецов 32x32, ствол вверх
function paintTwin(g, c, f) {
  for (const tx of [0, 25]) {
    rect(g, tx, 2, 7, 29, c.k);
    for (let y = 2; y < 31; y++) if (((y + f * 2) % 4) < 2) rect(g, tx + 1, y, 5, 1, c.d);
  }
  rect(g, 5, 6, 22, 22, c.d); rect(g, 6, 7, 20, 20, c.m);
  rect(g, 6, 7, 20, 1, c.l); rect(g, 6, 7, 1, 20, c.l); rect(g, 7, 25, 18, 2, c.d);
  for (let x = 9; x < 24; x += 3) rect(g, x, 22, 2, 3, c.k);
  disc(g, 16, 17, 7, c.k); disc(g, 16, 17, 6, c.l); disc(g, 15, 16, 3, c.w);
  rect(g, 14, 0, 4, 12, c.k); rect(g, 15, 0, 2, 12, c.l);
  rect(g, 13, 0, 6, 3, c.k); rect(g, 14, 0, 4, 2, c.m);
  rect(g, 8, 9, 2, 2, c.r); rect(g, 22, 9, 2, 2, c.r);
}

// корпус Криомеха 40x40 (ноги и пушка рисуются отдельно)
function paintCryo(g, c, f) {
  disc(g, 20, 20, 15, c.k); disc(g, 20, 20, 14, c.d); disc(g, 19, 19, 12, c.m);
  rect(g, 11, 10, 8, 3, c.l); rect(g, 10, 13, 3, 6, c.l);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + 0.3, x = Math.round(20 + Math.cos(a) * 10), y = Math.round(20 + Math.sin(a) * 10);
    rect(g, x - 1, y - 2, 3, 5, c.k); rect(g, x, y - 2, 1, 4, c.l); rect(g, x, y - 1, 1, 1, c.w);
  }
  disc(g, 20, 20, 6, c.k); disc(g, 20, 20, 5, f ? c.l : c.e); disc(g, 20, 20, 2, c.w);
}

// Скорпион 56x40, смотрит вправо; f=1 — клешни сомкнуты
function paintScorp(g, c, f) {
  const o = f ? 0 : 2;
  for (const s of [-1, 1]) {
    const cy = 20 + s * 13;
    rect(g, 36, Math.min(20 + s * 6, cy) - 1, 4, Math.abs(cy - 20 - s * 6) + 3, c.k);
    rect(g, 37, Math.min(20 + s * 6, cy), 2, Math.abs(cy - 20 - s * 6) + 1, c.m);
    rect(g, 38, cy - 2, 10, 4, c.k); rect(g, 39, cy - 1, 8, 2, c.m);
    disc(g, 48, cy, 5, c.k); disc(g, 48, cy, 4, c.m); rect(g, 46, cy - 2, 2, 2, c.l);
    rect(g, 50, cy - 4 - o, 6, 3, c.k); rect(g, 51, cy - 3 - o, 4, 1, c.l);
    rect(g, 50, cy + 1 + o, 6, 3, c.k); rect(g, 51, cy + 2 + o, 4, 1, c.l);
  }
  ellipse(g, 24, 20, 15, 10, c.k); ellipse(g, 24, 20, 14, 9, c.d); ellipse(g, 23, 19, 12, 7, c.m);
  for (const x of [15, 21, 27]) rect(g, x, 12, 1, 16, c.d);
  rect(g, 14, 14, 12, 2, c.l);
  ellipse(g, 38, 20, 6, 7, c.k); ellipse(g, 38, 20, 5, 6, c.m);
  rect(g, 42, 14, 3, 13, c.l); rect(g, 43, 15, 1, 11, c.w);
  rect(g, 39, 17, 2, 2, c.e); rect(g, 39, 22, 2, 2, c.e);
}

// Фантом 32x32, смотрит вправо: угловатый корпус на антигравах
function paintPhantom(g, c, f) {
  for (let y = 4; y < 28; y++) { const w = Math.round(26 - Math.abs(y - 16) * 0.9); rect(g, 3, y, w, 1, c.k); if (y > 5 && y < 26) rect(g, 4, y, w - 2, 1, c.d); }
  rect(g, 6, 9, 14, 1, c.l); rect(g, 5, 10, 1, 12, c.l);
  rect(g, 4, 15, 18, 2, f ? c.g : c.c);
  for (const y of [2, 26]) { rect(g, 1, y, 8, 4, c.k); rect(g, 2, y + 1, 6, 2, c.m); rect(g, 2, y === 2 ? y : y + 3, 6, 1, c.c); }
  disc(g, 15, 16, 5, c.k); disc(g, 15, 16, 4, c.m); rect(g, 14, 14, 2, 2, c.w);
  rect(g, 18, 15, 14, 3, c.k); rect(g, 19, 16, 12, 1, c.l); rect(g, 30, 15, 2, 3, c.g);
}

const BossGfx = {
  _c: {},
  twins() {
    if (!this._c.twins) {
      const mkSet = pal => [0, 1].map(f => { const c = mk(32, 32, true); paintTwin(c.getContext('2d'), pal, f); return rot4(c); });
      const P = [BOSS_PALS.twinA, BOSS_PALS.twinB];
      this._c.twins = P.map(p => ({ n: mkSet(p), w: mkSet(whitePal(p)) }));
    }
    return this._c.twins;
  },
  cryo() {
    if (!this._c.cryo) {
      const m = pal => [0, 1].map(f => { const c = mk(40, 40); paintCryo(c.getContext('2d'), pal, f); return c; });
      this._c.cryo = { n: m(BOSS_PALS.cryo), w: m(whitePal(BOSS_PALS.cryo)) };
    }
    return this._c.cryo;
  },
  scorp() {
    if (!this._c.scorp) {
      const m = pal => [0, 1].map(f => { const c = mk(56, 40); paintScorp(c.getContext('2d'), pal, f); return c; });
      this._c.scorp = { n: m(BOSS_PALS.scorp), w: m(whitePal(BOSS_PALS.scorp)) };
    }
    return this._c.scorp;
  },
  phantom() {
    if (!this._c.phantom) {
      const m = pal => [0, 1].map(f => { const c = mk(32, 32); paintPhantom(c.getContext('2d'), pal, f); return c; });
      this._c.phantom = { n: m(BOSS_PALS.phantom), w: m(whitePal(BOSS_PALS.phantom)) };
    }
    return this._c.phantom;
  },
  goliath() {
    if (!this._c.goliath) {
      const mkSet = pal => [0, 1].map(f => { const c = mk(48, 48, true); paintGoliath(c.getContext('2d'), pal, f); return rot4(c); });
      this._c.goliath = { n: mkSet(BOSS_PALS.goliath), w: mkSet(whitePal(BOSS_PALS.goliath)) };
    }
    return this._c.goliath;
  },
  heli() {
    if (!this._c.heli) {
      const m = pal => { const c = mk(40, 48); paintHeli(c.getContext('2d'), pal); return c; };
      this._c.heli = { n: m(BOSS_PALS.heli), w: m(whitePal(BOSS_PALS.heli)) };
    }
    return this._c.heli;
  },
  worm() {
    if (!this._c.worm) {
      const seg = pal => { const c = mk(16, 16); paintWormSeg(c.getContext('2d'), pal); return c; };
      const head = pal => [0, 1].map(f => { const c = mk(24, 24); paintWormHead(c.getContext('2d'), pal, f); return c; });
      const P = BOSS_PALS.worm, Wp = whitePal(P);
      this._c.worm = { seg: seg(P), segW: seg(Wp), head: head(P), headW: head(Wp) };
    }
    return this._c.worm;
  },
  omega() {
    if (!this._c.omega) {
      this._c.omega = [0, 1].map(f => { const c = mk(128, 56); paintOmega(c.getContext('2d'), BOSS_PALS.omega, f); return c; });
    }
    return this._c.omega;
  },
};
