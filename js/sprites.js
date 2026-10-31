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
    case 'heavy': R(6, 0, 4, tTop + 1, c.d); R(7, 0, 2, tTop + 1, c.l); R(8, 1, 1, tTop, c.m); R(7, 0, 2, 1, c.w); break; // один толстый ствол
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
  if (lv >= 1) { // дульный тормоз; у толстого ствола тяжёлого — пошире, чтобы не сливался со стволом
    if (shape === 'heavy') { R(5, 0, 6, 2, c.d); R(6, 0, 4, 1, c.w); R(7, 1, 2, 1, c.l); }
    else { R(6, 0, 4, 2, c.d); R(6, 0, 4, 1, c.w); }
  }
  if (lv >= 2) { R(0, ty, 1, th, c.l); R(15, ty, 1, th, c.l); R(0, ty, tw, 1, c.w); R(16 - tw, ty, tw, 1, c.w); } // бортовые экраны
  if (lv >= 3) { R(hx + hw - 2, hy + hh - 8, 1, 6, '#202020'); R(hx + hw - 2, hy + hh - 9, 1, 2, '#f83800'); R(hx + 1, hy + hh - 4, 2, 2, c.w); } // антенна и фара
  if (lv >= 4) { R(7, hy + hh - 3, 2, 1, '#fcd820'); R(6, hy + hh - 2, 4, 1, '#fcd820'); } // звезда на корме
  if (lv >= 5) { R(hx, hy, hw, 1, '#fcd820'); R(hx, hy, 1, hh, '#fcd820'); R(hx + hw - 1, hy, 1, hh, '#a87800'); R(hx, hy + hh - 1, hw, 1, '#a87800'); } // золото
}

// ---------- танки игроков 16x16: облик по уровню оружия 0..15 ----------
// каждая звезда добавляет деталь; только оттенки своего цвета, белый, чёрный и красный — гусеницы, башня и ствол читаются на любом уровне
const PLAYER_SHAPES = ['std', 'scout', 'heavy'];
function paintPlayer(g, shape, c, f, lv) {
  const R = (x, y, w, h, col) => rect(g, x, y, w, h, col);
  const D = c.d, M = c.m, L = c.l, Wh = c.w, RED = '#f83800', ORG = '#fca044', BLK = '#202020';
  const tracks = (tw, ty, th) => {
    for (const tx of [0, 16 - tw]) {
      R(tx, ty, tw, th, D);
      for (let y = ty; y < ty + th; y++) if (((y + f) & 1) === 0) R(tx + 1, y, tw - 2, 1, M);
    }
    if (lv >= 2) { R(0, ty + 1, 1, th - 2, L); R(15, ty + 1, 1, th - 2, L); } // бортовые экраны
  };
  const hull = (hx, hy, hw, hh) => { R(hx, hy, hw, hh, M); R(hx, hy, hw, 1, L); R(hx, hy, 1, hh, L); R(hx, hy + hh - 1, hw, 1, D); R(hx + hw - 1, hy, 1, hh, D); };
  // башня с тёмным контуром: s — сторона, (x, y) — левый верхний угол
  const turret = (x, y, s) => {
    R(x + 1, y, s - 2, s, D); R(x, y + 1, s, s - 2, D);
    R(x + 1, y + 1, s - 2, s - 2, L); R(x + 1, y + 1, 1, 1, Wh); R(x + s - 2, y + 2, 1, s - 3, M); R(x + 2, y + s - 2, s - 3, 1, M);
  };
  const star = (cx, cy) => { R(cx - 1, cy - 2, 2, 4, RED); R(cx - 2, cy - 1, 4, 2, RED); R(cx - 1, cy - 1, 1, 1, ORG); }; // красная звезда 4×4
  if (shape === 'heavy') {
    tracks(4, 0, 16);
    if (lv >= 12) for (const y of [2, 6, 10, 14]) { R(0, y, 1, 1, Wh); R(15, y, 1, 1, Wh); } // стальные шипы
    hull(3, 2, 10, 13);
    if (lv >= 5) { R(4, 3, 8, 1, L); R(4, 4, 8, 1, D); R(4, 3, 1, 1, Wh); R(11, 3, 1, 1, Wh); } // лобовая плита
    if (lv >= 11) { R(4, 3, 1, 1, RED); R(11, 3, 1, 1, RED); R(5, 3, 1, 1, ORG); R(10, 3, 1, 1, ORG); } // светящиеся щели
    if (lv >= 6) for (const x of [4, 5, 10, 11]) R(x, 13, 1, 1, x & 1 ? D : L); // запасные траки
    if (lv >= 13) { R(4, 12, 2, 1, D); R(10, 12, 2, 1, D); R(4, 13, 2, 1, BLK); R(10, 13, 2, 1, BLK); } // выхлопные трубы
    if (lv >= 4) { R(6, 13, 4, 1, Wh); R(7, 12, 2, 1, Wh); } // звезда на корме
    if (lv >= 3) { R(4, 2, 1, 1, Wh); R(11, 2, 1, 1, Wh); } // фары
    R(6, 1, 4, 5, D); R(7, 1, 2, 5, L); R(7, 1, 1, 5, Wh); // короткий толстый ствол
    if (lv >= 14) { R(7, 2, 2, 3, RED); R(7, 2, 1, 3, ORG); } // раскалённый канал
    if (lv >= 1) { R(5, 0, 6, 2, D); R(6, 0, 4, 1, Wh); } // дульный тормоз
    if (lv >= 10) { R(5, 3, 6, 1, D); R(6, 3, 4, 1, L); } // второй тормоз
    if (lv >= 15) R(7, 0, 2, 1, RED);
    turret(4, 5, 8);
    if (lv >= 8) { R(4, 7, 1, 4, M); R(11, 7, 1, 4, M); } // щёки башни
    if (lv >= 7) { R(6, 7, 4, 4, M); R(7, 8, 2, 2, L); R(6, 7, 4, 1, D); R(6, 7, 1, 4, D); } else R(7, 8, 2, 2, M); // люк
    if (lv >= 9) star(8, 9);
    if (lv >= 3) { R(12, 7, 1, 6, BLK); R(12, 6, 1, 1, RED); } // антенна
  } else if (shape === 'scout') {
    tracks(3, 2, 13);
    hull(3, 4, 10, 9);
    if (lv >= 8) { R(5, 5, 1, 7, Wh); R(10, 5, 1, 7, Wh); } // гоночные полосы
    if (lv >= 12) { R(3, 4, 1, 2, Wh); R(12, 4, 1, 2, Wh); R(3, 11, 1, 2, D); R(12, 11, 1, 2, D); } // обтекатели
    if (lv >= 5) { R(4, 14, 8, 1, D); R(5, 13, 6, 1, L); } // спойлер
    if (lv >= 6) { R(4, 13, 2, 2, BLK); R(10, 13, 2, 2, BLK); } // реактивные сопла
    if (lv >= 11) { R(4, 14, 2, 1, RED); R(10, 14, 2, 1, RED); R(4, 13, 2, 1, ORG); R(10, 13, 2, 1, ORG); } // форсаж
    if (lv >= 4) { R(7, 11, 2, 1, Wh); R(6, 12, 4, 1, Wh); } // звезда на корме
    if (lv >= 3) { R(4, 4, 1, 1, Wh); R(11, 4, 1, 1, Wh); } // фары
    R(7, 0, 2, 8, D); R(7, 0, 1, 8, L); // длинный тонкий ствол
    if (lv >= 14) R(7, 1, 1, 5, RED);
    if (lv >= 1) { R(6, 0, 4, 2, D); R(7, 0, 2, 1, Wh); } // дульный тормоз
    if (lv >= 10) { R(6, 4, 4, 1, D); R(7, 4, 2, 1, L); } // второй тормоз
    if (lv >= 15) R(7, 0, 2, 1, RED);
    turret(6, 7, 4);
    if (lv >= 9) { R(7, 8, 2, 2, RED); R(7, 8, 1, 1, ORG); } // красная метка на башне
    if (lv >= 7) { R(10, 6, 2, 2, Wh); R(11, 6, 1, 1, D); } // радар
    if (lv >= 13) { R(4, 6, 1, 4, BLK); R(4, 5, 1, 1, RED); } // вторая антенна
    if (lv >= 3) { R(11, 8, 1, 5, BLK); R(11, 7, 1, 1, RED); } // антенна
  } else { // std — штурмовик
    tracks(4, 1, 15);
    hull(3, 3, 10, 11);
    if (lv >= 5) { R(3, 6, 2, 3, D); R(3, 6, 2, 1, L); R(11, 6, 2, 3, D); R(11, 6, 2, 1, L); } // ящики с боекомплектом
    if (lv >= 11) { R(3, 10, 2, 3, BLK); R(11, 10, 2, 3, BLK); R(3, 10, 2, 1, RED); R(11, 10, 2, 1, RED); } // ракетные трубы
    if (lv >= 12) for (const x of [5, 7, 9]) R(x, 12, 1, 1, ORG); // светящиеся решётки
    if (lv >= 13) { R(4, 13, 2, 1, BLK); R(10, 13, 2, 1, BLK); } // выхлоп
    if (lv >= 4) { R(7, 12, 2, 1, Wh); R(6, 13, 4, 1, Wh); } // звезда на корме
    if (lv >= 3) { R(4, 3, 1, 1, Wh); R(11, 3, 1, 1, Wh); } // фары
    if (lv >= 10) { // спаренная пушка
      for (const x of [5, 9]) { R(x, 1, 2, 6, D); R(x, 1, 1, 6, L); }
      if (lv >= 14) { R(5, 2, 1, 3, RED); R(9, 2, 1, 3, RED); }
      for (const x of [4, 9]) { R(x, 0, 3, 2, D); R(x + (x === 4 ? 1 : 0), 0, 2, 1, lv >= 15 ? RED : Wh); } // два раздельных тормоза
    } else {
      R(7, 0, 2, 7, D); R(7, 0, 1, 7, L);
      if (lv >= 1) { R(6, 0, 4, 2, D); R(7, 0, 2, 1, Wh); } // дульный тормоз
      if (lv >= 7) { R(10, 1, 1, 5, BLK); R(10, 1, 1, 1, Wh); } // спаренный пулемёт
    }
    turret(5, 6, 6);
    if (lv >= 8) { R(5, 8, 1, 2, M); R(10, 8, 1, 2, M); } // щёки башни
    if (lv >= 9) star(8, 9); else R(7, 8, 2, 2, M);
    if (lv >= 6) { R(9, 7, 1, 1, BLK); R(9, 6, 1, 1, Wh); } // перископ
    if (lv >= 3) { R(12, 6, 1, 6, BLK); R(12, 5, 1, 1, RED); } // антенна
  }
}

const TankGfx = {
  cache: new Map(),
  get(shape, pal, lv = 0) {
    const key = shape + '|' + pal + '|' + lv;
    let s = this.cache.get(key);
    if (!s) {
      const paint = PLAYER_SHAPES.includes(shape) ? paintPlayer : paintTank;
      s = [0, 1].map(f => { const c = mk(16, 16, true); paint(c.getContext('2d'), shape, PALS[pal], f, lv); return rot4(c); });
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

// картинки боссов из BOSS_ART_SRC (bossart.js): n — обычная, w — белая вспышка попадания,
// у танков Голиафа и Близнецов ещё r/rw — четыре поворота носом вверх/вправо/вниз/влево
const BossArt = {};
for (const k in BOSS_ART_SRC) {
  const im = new Image();
  im.onload = () => {
    const n = mk(im.width, im.height, true), w = mk(im.width, im.height, true), g = w.getContext('2d');
    n.getContext('2d').drawImage(im, 0, 0);
    g.drawImage(im, 0, 0); g.globalCompositeOperation = 'source-in'; rect(g, 0, 0, im.width, im.height, '#fcfcfc');
    const A = { n, w };
    if (/^(goliath|twin)/.test(k)) { A.r = rot4(n); A.rw = rot4(w); }
    BossArt[k] = A;
  };
  im.src = BOSS_ART_SRC[k];
}
