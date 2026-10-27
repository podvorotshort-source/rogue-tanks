'use strict';
// ============================================================
//  GAME: состояния, сектора, улучшения, интерфейс, главный цикл
// ============================================================

const PERKS = {
  reload: { name: 'СКОРОСТРЕЛ', desc: 'ПЕРЕЗАРЯДКА БЫСТРЕЕ НА 20%', icon: '>>', max: 4, apply: s => { s.reload *= 0.8; } },
  ammo: { name: 'ДОП. ОБОЙМА', desc: '+1 СНАРЯД НА ЭКРАНЕ', icon: '••', max: 3, apply: s => { s.maxB += 1; } },
  velocity: { name: 'УСКОРИТЕЛЬ', desc: 'СНАРЯДЫ ЛЕТЯТ НА 30% БЫСТРЕЕ', icon: '→', max: 3, apply: s => { s.bspeed *= 1.3; } },
  armor: { name: 'ДОП. БРОНЯ', desc: '+1 К МАКС. ПРОЧНОСТИ', icon: '♥+', max: 6, onPick: p => { p.maxHp += 1; p.hp += 1; } },
  repair: { name: 'КАПРЕМОНТ', desc: 'ПОЛНОСТЬЮ ВОССТАНОВИТЬ ПРОЧНОСТЬ', icon: '♥', max: 99, onPick: p => { p.hp = p.maxHp; } },
  engine: { name: 'ТУРБОМОТОР', desc: 'СКОРОСТЬ ХОДА +15%', icon: '=>', max: 3, apply: s => { s.speed *= 1.15; } },
  cooldown: { name: 'ТАКТИКА', desc: 'СПЕЦПРИЁМ ПЕРЕЗАРЯЖАЕТСЯ НА 30% БЫСТРЕЕ', icon: '%', max: 2, apply: s => { s.cdMul *= 0.7; } },
  luck: { name: 'УДАЧА', desc: 'БОНУСЫ ИЗ ВРАГОВ ВЫПАДАЮТ ВДВОЕ ЧАЩЕ', icon: '?', max: 1, apply: s => { s.luck *= 2; } },
  field: { name: 'ПОЛЕВОЙ РЕМОНТ', desc: '+1 ПРОЧНОСТЬ ПОСЛЕ КАЖДОГО СЕКТОРА', icon: '+', max: 2, apply: s => { s.fieldRepair += 1; } },
  damage: { name: 'КРУПНЫЙ КАЛИБР', desc: 'УРОН СНАРЯДОВ +1', icon: '+1', rare: true, max: 2, apply: s => { s.dmg += 1; } },
  ricochet: { name: 'РИКОШЕТ', desc: 'СНАРЯДЫ ОТСКАКИВАЮТ ОТ СТАЛИ И КРАЁВ', icon: '<>', rare: true, max: 2, apply: s => { s.bounce += 1; } },
  shotgun: { name: 'ДРОБОВИК', desc: '+2 СНАРЯДА ВЕЕРОМ ПРИ КАЖДОМ ВЫСТРЕЛЕ', icon: '\\|/', rare: true, max: 1, apply: s => { s.spread = true; } },
  pierce: { name: 'ПРОБИТИЕ', desc: 'СНАРЯД ПРОШИВАЕТ +1 ЦЕЛЬ НАСКВОЗЬ', icon: '-→', rare: true, max: 2, apply: s => { s.pierce += 1; } },
  explosive: { name: 'ФУГАС', desc: 'СНАРЯДЫ ВЗРЫВАЮТСЯ, ЗАДЕВАЯ СОСЕДЕЙ', icon: '*', rare: true, max: 1, apply: s => { s.explosive = 14; } },
  eshield: { name: 'ЭНЕРГОЩИТ', desc: 'БЛОКИРУЕТ 1 ПОПАДАНИЕ. ЗАРЯД 15 СЕК', icon: '()', rare: true, max: 1, apply: s => { s.eshield = true; } },
  vamp: { name: 'ТРОФЕЙНЫЙ РЕМОНТ', desc: '+1 ПРОЧНОСТЬ ЗА КАЖДЫЕ 12 УБИЙСТВ', icon: '×♥', rare: true, max: 1, apply: s => { s.vamp = true; } },

  // стихии снарядов (основное орудие и залп)
  inc: { name: 'ЗАЖИГАТЕЛЬНЫЕ', desc: 'ЦЕЛЬ ГОРИТ 3 С: 1 УРОН В СЕКУНДУ', icon: '♨', rare: true, max: 1, apply: s => { s.fx = { ...s.fx, inc: true }; } },
  cryo: { name: 'КРИОСНАРЯДЫ', desc: 'ЗАМЕДЛЯЮТ, 3 ПОПАДАНИЯ ПОДРЯД ЗАМОРАЖИВАЮТ', icon: '❄', rare: true, max: 1, apply: s => { s.fx = { ...s.fx, cryo: true }; } },
  tesla: { name: 'ТЕСЛА-СНАРЯДЫ', desc: 'МОЛНИЯ БЬЁТ ЕЩЁ 2 ВРАГОВ И ОГЛУШАЕТ', icon: '⚡', rare: true, max: 1, apply: s => { s.fx = { ...s.fx, tesla: true }; } },
  mark: { name: 'КОРРЕКТИРОВКА', desc: 'ЦЕЛЬ 4 С ПОЛУЧАЕТ +50% УРОНА ОТ ВСЕХ', icon: '⌖', rare: true, max: 1, apply: s => { s.fx = { ...s.fx, mark: true }; } },

  // доп. системы: стреляют сами, не больше 2 разных, до 3 уровня
  mg: { name: 'ПУЛЕМЁТНАЯ ТУРЕЛЬ', desc: 'САМА БЬЁТ ОЧЕРЕДЯМИ ПО БЛИЖАЙШЕМУ ВРАГУ', icon: '≡', aux: true, max: 3 },
  mines: { name: 'МИННЫЙ УКЛАДЧИК', desc: 'ОСТАВЛЯЕТ МИНЫ ПОЗАДИ ТАНКА', icon: '●', aux: true, max: 3 },
  rk: { name: 'РАКЕТНАЯ УСТАНОВКА', desc: 'РАЗ В 4 С ЗАЛП РАКЕТ С НАВЕДЕНИЕМ', icon: '▲', aux: true, max: 3 },
  coil: { name: 'ТЕСЛА-КАТУШКА', desc: 'МОЛНИЕЙ БЬЁТ И ОГЛУШАЕТ ВРАГОВ РЯДОМ', icon: '(⚡)', aux: true, max: 3 },
  drone: { name: 'ДРОН', desc: 'КРУЖИТ РЯДОМ И СТРЕЛЯЕТ ПО ВРАГАМ', icon: '◆', aux: true, max: 3 },
  ram: { name: 'ОТВАЛ-ТАРАН', desc: 'УРОН ПРИ НАЕЗДЕ, ОТБРАСЫВАЕТ ВРАГОВ', icon: '▌', aux: true, max: 3 },

  // синергии: легендарные, появляются только когда собраны обе части
  napalm: { name: 'НАПАЛМ', desc: 'ВАШИ ВЗРЫВЫ ОСТАВЛЯЮТ ГОРЯЩУЮ ЗЕМЛЮ', icon: '♨*', legend: true, parts: ['inc', 'explosive'] },
  thermo: { name: 'ТЕРМОШОК', desc: 'ОГОНЬ ПО ЗАМОРОЖЕННОМУ - ТРОЙНОЙ УРОН', icon: '♨❄', legend: true, parts: ['inc', 'cryo'] },
  shatter: { name: 'ЛЕДЯНОЙ РАСКОЛ', desc: 'ЗАМОРОЖЕННЫЙ ОТ ВЗРЫВА РАЗЛЕТАЕТСЯ ОСКОЛКАМИ', icon: '❄*', legend: true, parts: ['cryo', 'explosive'] },
  ball: { name: 'ШАРОВАЯ МОЛНИЯ', desc: 'КАЖДЫЙ РИКОШЕТ БЬЁТ МОЛНИЕЙ', icon: '⚡<>', legend: true, parts: ['tesla', 'ricochet'] },
  rail: { name: 'РЕЛЬСОТРОН', desc: '+2 ПРОБИТИЯ, СНАРЯДЫ В 1.5 РАЗА БЫСТРЕЕ', icon: '⚡-→', legend: true, parts: ['tesla', 'pierce'], apply: s => { s.pierce += 2; s.bspeed *= 1.5; } },
  storm: { name: 'ШРАПНЕЛЬНЫЙ ШТОРМ', desc: '5 ДРОБИН ВМЕСТО 3 И +1 РИКОШЕТ', icon: '<\\/>', legend: true, parts: ['shotgun', 'ricochet'], apply: s => { s.pellets = 5; s.bounce += 1; } },
  spotter: { name: 'КОРРЕКТИРОВЩИК', desc: 'РАКЕТЫ ЛЕТЯТ В ПОМЕЧЕННЫХ, УРОН ×1.5', icon: '⌖▲', legend: true, parts: ['mark', 'rk'] },
  deton: { name: 'ДЕТОНАТОР', desc: 'ВЗРЫВЫ ПОДРЫВАЮТ ВАШИ МИНЫ, МИНЫ ×1.5', icon: '*●', legend: true, parts: ['explosive', 'mines'] },
  mtrail: { name: 'МИННЫЙ СЛЕД', desc: 'РЫВОК ОСТАВЛЯЕТ ЦЕПОЧКУ МИН', icon: '→●', legend: true, parts: ['mines'], cls: 'scout' },
  reflectx: { name: 'ВЗРЫВНОЕ ОТРАЖЕНИЕ', desc: 'ОТРАЖЁННЫЕ ЩИТОМ СНАРЯДЫ ВЗРЫВАЮТСЯ', icon: '()*', legend: true, parts: ['explosive'], cls: 'heavy' },
  steelstorm: { name: 'СТАЛЬНОЙ ШТОРМ', desc: 'ЗАЛП ЛОМАЕТ СТАЛЬ И ПРОШИВАЕТ ВРАГОВ', icon: '*#', legend: true, parts: ['pierce'], cls: 'assault' },
  disch: { name: 'РАЗРЯДНИК', desc: 'БЛОК ЭНЕРГОЩИТОМ ВЫЗЫВАЕТ ЭМИ-ВОЛНУ', icon: '()⚡', legend: true, parts: ['eshield', 'tesla'] },

  // карты с особым эффектом
  shards: { name: 'ОСКОЛКИ', desc: 'РАЗБИТЫЙ КИРПИЧ РАНИТ ВРАГОВ ОСКОЛКАМИ', icon: '∴', max: 1 },
  retal: { name: 'ОТВЕТНЫЙ ОГОНЬ', desc: 'ПОЛУЧИВ УРОН, ВЫПУСКАЕТ 8 СНАРЯДОВ', icon: '<•>', rare: true, max: 1 },
  wait: { name: 'ВЫЖИДАНИЕ', desc: 'ПОСЛЕ 1.5 С БЕЗ ВЫСТРЕЛОВ СНАРЯД ×3 И НАСКВОЗЬ', icon: '⌛', rare: true, max: 1 },
};
for (const k in PERKS) if (PERKS[k].legend) PERKS[k].max = 1;
// синергия доступна, когда у игрока есть все её части (и нужный класс)
const synReady = (p, id) => PERKS[id].parts.every(k => p.perks[k]) && (!PERKS[id].cls || p.cls === PERKS[id].cls);
const SYN_OF = {}; // часть -> синергии, в которые она входит
for (const k in PERKS) if (PERKS[k].legend) for (const part of PERKS[k].parts) (SYN_OF[part] = SYN_OF[part] || []).push(k);

const MODS = [
  { id: 'armored', name: 'БРОНЕКОЛОННА', desc: 'ВРАГИ ПОЛУЧАЮТ +1 ПРОЧНОСТЬ' },
  { id: 'blitz', name: 'БЛИЦКРИГ', desc: 'ВРАГИ БЫСТРЕЕ И ЧАЩЕ СТРЕЛЯЮТ' },
  { id: 'fog', name: 'ТУМАН ВОЙНЫ', desc: 'ВИДИМОСТЬ ОГРАНИЧЕНА' },
  { id: 'barrage', name: 'АРТОБСТРЕЛ', desc: 'ПО ПОЛЮ БЬЁТ ВРАЖЕСКАЯ АРТИЛЛЕРИЯ' },
  { id: 'bounty', name: 'ТРОФЕИ', desc: 'БОЛЬШЕ ВРАГОВ, НО И БОНУСОВ' },
  { id: 'ice', name: 'ГОЛОЛЁД', desc: 'ПОЛЕ СКОВАНО ЛЬДОМ' },
];


const G = {
  state: 'title', time: 0, players: [], enemies: [], bullets: [], mortars: [], pickups: [], effects: [], particles: [],
  popups: [], spawners: [], tanks: [], queue: [], boss: null, level: null, depth: 1, freeze: 0, shake: 0, flashT: 0,
  mines: [], fires: new Map(), timers: [], bossAlt: [0, 0, 0, 0],
  bannerT: 0, bannerText: '', bannerCol: '#fff', menuSel: 0, paused: false, pauseSel: 0, scoreMul: 1, dropChance: 0.06,
  enemyMods: { hp: 0, speed: 1, fire: 1, hunt: 0.2, loop: 0, depth: 1 }, killedCount: 0, best: Store.get('tanks_rogue_best', { depth: 0, score: 0 }),

  nearestPlayer(x, y) {
    let best = null, bd = 1e9;
    for (const p of this.players) { if (p.dead) continue; const d = dist(x, y, p.cx, p.cy); if (d < bd) { bd = d; best = p; } }
    return best;
  },
  ring(x, y, n, sp, off, kind) {
    for (let i = 0; i < n; i++) enemyShot(x, y, (i + off) / n * Math.PI * 2, sp, { kind, size: kind === 'orb' ? 5 : 3 });
    Sound.play('eshoot');
  },
  spawnMinions(n, type, x, y) {
    const have = this.enemies.length + this.spawners.length;
    for (let i = 0; i < n && have + i < 6; i++) {
      const s = findFreeSpot(x, y);
      if (s) this.spawners.push(new Spawner(s.x, s.y, type, Math.random() < 0.3));
    }
  },
  banner(txt, col = '#fcfcfc') { this.bannerText = txt; this.bannerCol = col; this.bannerT = 2.2; },
  clearEnemyBullets() {
    for (const b of this.bullets) if (b.alive && b.team === 'enemy') { if (this.effects.length < 150) this.effects.push(new Boom(b.x, b.y, 3, { quiet: true })); b.kill(); }
    this.mortars = [];
  },
  onBossKilled(b) {
    for (const p of this.players) if (!p.dead) { const sc = Math.round(5000 * this.scoreMul); p.score += sc; this.popups.push(new Popup(p.cx, p.y - 6, '+' + sc, '#fcd820', 2)); }
    this.bossDeadT = 1.4;
  },
  onPlayerDeath() {
    if (this.players.every(p => p.dead)) this.gameOverT = 2.4;
  },
};

function findFreeSpot(x, y) {
  for (let r = 24; r < 140; r += 8) for (let k = 0; k < 12; k++) {
    const a = rand(0, Math.PI * 2);
    const sx = Math.round((x + Math.cos(a) * r - 8) / 8) * 8, sy = Math.round((y + Math.sin(a) * r - 8) / 8) * 8;
    if (sx < 0 || sy < 0 || sx > FW - 16 || sy > FH - 16) continue;
    if (G.level.tankBlocked(sx, sy, 16, 16)) continue;
    if (G.tanks.some(t => overlap(t.x, t.y, 16, 16, sx, sy, 16, 16))) continue;
    if (G.boss && G.boss.blocks(sx - 4, sy - 4, 24, 24)) continue;
    if (G.spawners.some(s => overlap(s.x, s.y, 16, 16, sx, sy, 16, 16))) continue;
    return { x: sx, y: sy };
  }
  return null;
}

// случайная свободная точка поля подальше от игроков: враги появляются не только у верхнего края
function randomSpawnSpot() {
  const alive = G.players.filter(p => !p.dead);
  for (let k = 0; k < 40; k++) {
    const bx = randi(0, BCOLS - 1), by = randi(0, BROWS - 1), x = bx * BLK, y = by * BLK;
    if (G.level.tankBlocked(x, y, 16, 16)) continue;
    if (alive.some(p => dist(p.cx, p.cy, x + 8, y + 8) < 110)) continue;
    if (G.flow && !G.flow.some(f => f && f[by * BCOLS + bx] >= 0)) continue; // замкнутый карман
    if (G.tanks.some(t => overlap(t.x, t.y, 16, 16, x, y, 16, 16))) continue;
    if (G.spawners.some(s => overlap(s.x, s.y, 16, 16, x, y, 16, 16))) continue;
    return { x, y };
  }
  return null;
}
function classicSpawnSpot() {
  const free = G.level.spawns.filter(([bx, by]) =>
    !G.tanks.some(t => overlap(t.x, t.y, 16, 16, bx * BLK, by * BLK, 16, 16)) && !G.spawners.some(s => s.x === bx * BLK && s.y === by * BLK));
  if (!free.length) return null;
  const [bx, by] = pick(free);
  return { x: bx * BLK, y: by * BLK };
}

// сила команды: средняя сумма уровней улучшений и оружия (капремонт не в счёт) — по ней крепчают враги и боссы
function teamPower() {
  const ps = G.players;
  if (!ps.length) return 0;
  return ps.reduce((a, p) => a + p.weapon + Object.keys(p.perks).reduce((s, k) => s + (k === 'repair' ? 0 : p.perks[k]), 0), 0) / ps.length;
}

function sectorInfo(depth) {
  const d = depth - 1;
  return { biome: Math.floor(d / 4) % 4, stage: d % 4 + 1, loop: Math.floor(d / 16), boss: d % 4 === 3, final: d % 16 === 15 };
}
function sectorName(depth) { const s = sectorInfo(depth); return (s.loop ? tr('Ц') + (s.loop + 1) + ' ' : '') + (s.biome + 1) + '-' + s.stage; }

function enemyPool(d) {
  return {
    basic: Math.max(2, 10 - d * 0.6),
    fast: 3 + d * 0.15,
    power: d >= 2 ? 2.5 + d * 0.2 : 0,
    armor: d >= 3 ? 1.5 + d * 0.3 : 0,
    spread: d >= 5 ? 2.5 + d * 0.15 : 0,
    artillery: d >= 9 ? 2 + d * 0.1 : 0,
    kamikaze: d >= 13 ? 3 : 0,
    shield: d >= 4 ? 1.5 + d * 0.15 : 0,
    flamer: d >= 6 ? 1.5 + d * 0.12 : 0,
    miner: d >= 7 ? 1.2 + d * 0.1 : 0,
  };
}

function updateFlow() {
  const L = G.level;
  L.computeBlockPass();
  G.flow = G.players.map(p => {
    if (p.dead) return null;
    const d = new Int16Array(BCOLS * BROWS).fill(-1);
    const sx = clamp(Math.round(p.x / BLK), 0, BCOLS - 1), sy = clamp(Math.round(p.y / BLK), 0, BROWS - 1);
    const q = [sy * BCOLS + sx]; d[q[0]] = 0;
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % BCOLS, y = (i / BCOLS) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k], ny = y + DY[k];
        if (nx < 0 || ny < 0 || nx >= BCOLS || ny >= BROWS) continue;
        const j = ny * BCOLS + nx;
        if (d[j] >= 0 || !L.blockPass[j]) continue;
        d[j] = d[i] + 1; q.push(j);
      }
    }
    return d;
  });
}

// ---------- забег ----------
// ctrls — устройство каждого игрока; в одиночной игре — все устройства сразу
function newRun(classes, ctrls, colors) {
  G.players = classes.map((c, i) => new Player(i, c, classes.length > 1 && ctrls ? ctrls[i] : ALL_CTRL, colors ? colors[i] : i));
  G.depth = 1; G.runTime = 0; G.newRecord = false;
  G.bossAlt = BOSS_SETS.map(() => randi(0, 1)); // какой из двух боссов биома встретится в этом забеге
  startSector();
}

function startSector() {
  const info = sectorInfo(G.depth);
  G.info = info;
  const d = (G.depth - 1) % 16 + 1, L = info.loop, extra = G.players.length - 1; // доп. игроки: +враги, +прочность боссов
  G.mod = (!info.boss && G.depth >= 2 && Math.random() < 0.45) ? pick(MODS) : null;
  const mod = G.mod ? G.mod.id : '';
  const bossId = info.boss ? BOSS_SETS[info.biome][(G.bossAlt[info.biome] + L) % 2] : null;
  G.level = info.boss ? generateBossArena(info.biome, bossId) : generateLevel(info.biome, { sideSpawns: d >= 5, iceMul: mod === 'ice' ? 4 : 1 });
  G.enemies = []; G.bullets = []; G.mortars = []; G.pickups = []; G.effects = []; G.particles = []; G.popups = []; G.spawners = [];
  G.mines = []; G.fires = new Map(); G.timers = [];
  G.boss = null; G.freeze = 0; G.shake = 0; G.flashT = 0; G.bannerT = 0; G.killedCount = 0; G.flowT = 0; G.barrageT = 3;
  G.gameOverT = 0; G.bossDeadT = 0; G.paused = false; G.flow = null;
  const power = teamPower(), firstBoss = info.boss && info.biome === 0; // первый босс и его свита — без усиления
  G.enemyMods = {
    hp: (mod === 'armored' ? 1 : 0) + L + (firstBoss ? 0 : Math.floor(d / 6)),
    hpMul: firstBoss ? 1 : 1 + 0.04 * power,
    speed: (1 + 0.02 * d + 0.1 * L) * (mod === 'blitz' ? 1.35 : 1),
    fire: (1 + 0.04 * d + 0.2 * L) * (mod === 'blitz' ? 1.25 : 1),
    hunt: Math.min(0.7, 0.12 + 0.035 * d + 0.1 * L), loop: L, depth: d,
  };
  G.scoreMul = (1 + 0.1 * (d - 1) + L) * (G.mod ? 1.5 : 1);
  G.dropChance = 0.06 * (mod === 'bounty' ? 2.5 : 1);
  G.players.forEach((p, i) => {
    if (p.dead) { p.dead = false; p.hp = Math.max(1, Math.ceil(p.maxHp / 2)); }
    p.placeAt(PLAYER_SPAWNS[i][0], PLAYER_SPAWNS[i][1]);
    p.cool = 0.3; p.inv = 0; p.flash = 0;
  });
  G.queue = [];
  if (!info.boss) {
    const count = Math.round((9 + d * 1.1) * (1 + 0.5 * extra) * (mod === 'bounty' ? 1.3 : 1)) + L * 4;
    const pool = enemyPool(d);
    for (let i = 0; i < count; i++) G.queue.push({ type: weighted(pool), bonus: i === 3 || i === 10 || Math.random() < 0.05 });
    G.total = count;
    G.maxAlive = Math.min(9 + extra, 3 + Math.floor(d / 3) + 2 * extra);
    G.spawnInt = Math.max(1.0, 2.6 - d * 0.09);
    G.spawnT = 0.5;
  } else {
    G.total = 0;
    const tough = info.biome === 0 ? 1 : 1.5 * (1 + 0.04 * power);
    G.boss = makeBoss(bossId, (1 + 0.6 * extra) * (1 + 0.5 * L) * tough);
  }
  G.tanks = G.players.slice();
  G.state = 'intro'; G.introT = 0;
  Music.play(info.boss ? 'boss' : 'main');
}

function sectorClear() {
  G.state = 'clear'; G.clearT = 0;
  G.clearEnemyBullets();
  Sound.play('clear');
  G.healMsg = G.info.boss ? 'ПОЛНЫЙ РЕМОНТ' : '+1 ПРОЧНОСТЬ';
  for (const p of G.players) if (!p.dead) p.hp = Math.min(p.maxHp, p.hp + 1 + p.stats.fieldRepair + (G.info.boss ? 99 : 0));
  saveBest();
}

function totalScore() { return G.players.reduce((a, p) => a + p.score, 0); }
function saveBest() {
  const sc = totalScore();
  if (G.depth > G.best.depth || (G.depth === G.best.depth && sc > G.best.score) || sc > G.best.score) {
    G.best = { depth: Math.max(G.best.depth, G.depth), score: Math.max(G.best.score, sc) };
    G.newRecord = true;
    Store.set('tanks_rogue_best', G.best);
  }
}

// почему игрок не может взять карту ('' — может)
function cantReason(p, id) {
  const P = PERKS[id];
  if ((p.perks[id] || 0) >= P.max) return 'МАКС.';
  if (P.legend && !synReady(p, id)) return 'НЕТ ЧАСТЕЙ';
  if (P.aux && !p.perks[id] && auxCount(p) >= 2) return 'НЕТ СЛОТА';
  return '';
}
const canTake = (p, id) => !cantReason(p, id);
function openPerks() {
  const n = G.mod ? 4 : 3, rareRich = G.info.boss;
  const pool = Object.keys(PERKS).filter(id => G.players.some(p => canTake(p, id)));
  const cards = [];
  while (cards.length < n && pool.length) {
    const w = {};
    for (const id of pool) {
      const P = PERKS[id];
      w[id] = P.legend ? 14 : P.aux ? (rareRich ? 6 : 5) : P.rare ? (rareRich ? 10 : 3) : (rareRich ? 2 : 10);
    }
    if (G.players.every(p => p.hp >= p.maxHp) && w.repair) w.repair = 0.5;
    const id = weighted(w);
    cards.push(id); pool.splice(pool.indexOf(id), 1);
  }
  const start = [0, cards.length - 1, cards.length >> 1]; // 1P слева, 2P справа, 3P посередине
  G.perk = { cards, sel: G.players.map((p, i) => start[i]), done: G.players.map(() => false), t: 0, doneT: 0 };
  G.state = 'perk';
}

function gameOver() {
  G.state = 'gameover'; G.overT = 0;
  saveBest();
  Music.stop();
  Sound.play('gameover');
}

// ============================================================
//  ОБНОВЛЕНИЕ
// ============================================================
function update(dt) {
  G.time += dt;
  if (Input.hit(['KeyM'])) { Sound.musicOn = !Sound.musicOn; }
  switch (G.state) {
    case 'title': updateTitle(dt); break;
    case 'help': if (Input.hit(KEYS_BACK) || anyCtrl('fire')) { G.state = 'title'; Sound.play('select'); } break;
    case 'select': updateSelect(dt); break;
    case 'intro': updateIntro(dt); break;
    case 'play': if (G.paused) updatePause(); else updatePlay(dt); break;
    case 'clear': updateClear(dt); break;
    case 'perk': updatePerk(dt); break;
    case 'gameover': G.overT += dt; if (G.overT > 1.2 && (anyCtrl('fire') || Input.hit(KEYS_BACK))) toTitle(); break;
    case 'victory': updateVictory(dt); break;
  }
}

function toTitle() { G.state = 'title'; G.menuSel = 0; Music.play('title'); Sound.play('select'); }

const MENU = ['1 ИГРОК', '2 ИГРОКА', '3 ИГРОКА', 'УПРАВЛЕНИЕ', 'ЯЗЫК: РУССКИЙ']; // последний пункт — переключатель языка
const MENU_HELP = 3, MENU_LANG = 4;
function updateTitle() {
  Music.play('title');
  if (anyCtrl('up')) { G.menuSel = (G.menuSel + MENU.length - 1) % MENU.length; Sound.play('select'); }
  if (anyCtrl('down')) { G.menuSel = (G.menuSel + 1) % MENU.length; Sound.play('select'); }
  if (G.menuSel === MENU_LANG && (anyCtrl('fire') || anyCtrl('left') || anyCtrl('right'))) {
    setLang(LANG === 'ru' ? 'en' : 'ru'); Sound.play('confirm'); return;
  }
  if (anyCtrl('fire')) {
    Sound.play('confirm');
    if (G.menuSel === MENU_HELP) { G.state = 'help'; return; }
    G.nPlayers = G.menuSel + 1;
    // слоты игроков: dev — индекс в DEVICES (null — ещё никто не вошёл), в одиночной игре сразу «любое устройство»
    G.sel = { slots: Array.from({ length: G.nPlayers }, (_, i) => ({ dev: G.nPlayers === 1 ? 'all' : null, cls: 0, col: i, ready: false, t: 1 })), t: 0, goT: 0 };
    G.state = 'select';
  }
}
const slotCtrl = sl => sl.dev === 'all' ? ALL_CTRL : DEVICES[sl.dev];

function updateSelect(dt) {
  const S = G.sel, n = S.slots.length;
  S.t += dt;
  if (Input.hit(KEYS_BACK)) { G.state = 'title'; Sound.play('select'); return; }
  // вход: первое устройство, нажавшее огонь, занимает первый свободный слот
  if (n > 1 && S.t > 0.25) for (let d = 0; d < DEVICES.length; d++) {
    if (S.slots.some(s => s.dev === d) || !Input.hit(DEVICES[d].fire)) continue;
    const free = S.slots.find(s => s.dev === null);
    if (free) { free.dev = d; free.t = 0; free.ready = false; Sound.play('confirm'); }
  }
  for (const sl of S.slots) {
    if (sl.dev === null) continue;
    sl.t += dt;
    const c = slotCtrl(sl);
    if (sl.ready) { if (Input.hit(c.special)) { sl.ready = false; Sound.play('select'); } continue; }
    if (Input.hit(c.left)) { sl.cls = (sl.cls + CLASS_LIST.length - 1) % CLASS_LIST.length; Sound.play('select'); }
    if (Input.hit(c.right)) { sl.cls = (sl.cls + 1) % CLASS_LIST.length; Sound.play('select'); }
    if (Input.hit(c.up)) { sl.col = nextColor(sl, -1); Sound.play('select'); }
    if (Input.hit(c.down)) { sl.col = nextColor(sl, 1); Sound.play('select'); }
    if (Input.hit(c.fire) && sl.t > 0.25 && S.t > 0.25) { sl.ready = true; Sound.play('confirm'); }
    else if (n > 1 && Input.hit(c.special) && sl.t > 0.25) { sl.dev = null; Sound.play('deny'); } // выйти из слота
  }
  if (S.slots.every(s => s.dev !== null && s.ready)) {
    S.goT += dt;
    if (S.goT > 0.5) newRun(S.slots.map(s => CLASS_LIST[s.cls]), S.slots.map(slotCtrl), S.slots.map(s => s.col));
  } else S.goT = 0;
}
// следующий цвет, не занятый другими игроками (одинаковых танков в команде не бывает)
function nextColor(sl, step) {
  const n = PLAYER_PALS.length, taken = G.sel.slots.filter(s => s !== sl).map(s => s.col);
  let c = sl.col;
  for (let k = 0; k < n; k++) { c = (c + step + n) % n; if (!taken.includes(c)) return c; }
  return sl.col;
}

function updateIntro(dt) {
  G.introT += dt;
  if (G.introT > 0.7 && G.introT < 1.9 && anyCtrl('fire')) G.introT = 1.9;
  updateFx(dt);
  if (G.introT >= 2.4) {
    G.state = 'play';
    if (G.boss) { G.banner(tr('ВНИМАНИЕ!') + ' ' + tr(G.boss.name), '#f83800'); Sound.play('warn'); }
  }
}

function updateFx(dt) {
  G.effects = G.effects.filter(e => e.update(dt));
  G.particles = G.particles.filter(p => p.update(dt));
  G.popups = G.popups.filter(p => p.update(dt));
}

function updatePause() {
  if (Input.hit(KEYS_PAUSE)) { G.paused = false; Sound.play('select'); return; }
  if (anyCtrl('up') || anyCtrl('down')) { G.pauseSel ^= 1; Sound.play('select'); }
  if (anyCtrl('fire')) {
    if (G.pauseSel === 0) { G.paused = false; Sound.play('select'); }
    else { saveBest(); toTitle(); }
  }
}

function updatePlay(dt) {
  if (Input.hit(KEYS_PAUSE)) { G.paused = true; G.pauseSel = 0; Sound.play('select'); return; }
  G.runTime += dt;
  if (G.freeze > 0) G.freeze -= dt;
  G.shake = Math.max(0, G.shake - dt * 12);
  if (G.flashT > 0) G.flashT -= dt;
  if (G.bannerT > 0) G.bannerT -= dt;
  G.tanks = G.players.filter(p => !p.dead);
  for (const e of G.enemies) if (e.alive) G.tanks.push(e);
  G.flowT -= dt;
  if (G.flowT <= 0) { G.flowT = 0.4; updateFlow(); }

  for (const p of G.players) p.update(dt);
  if (G.queue.length) {
    G.spawnT -= dt;
    const alive = G.enemies.length + G.spawners.length;
    if (G.spawnT <= 0 && alive < G.maxAlive) {
      const s = (Math.random() < 0.65 && randomSpawnSpot()) || classicSpawnSpot();
      if (s) {
        const q = G.queue.shift();
        G.spawners.push(new Spawner(s.x, s.y, q.type, q.bonus));
        G.spawnT = G.spawnInt;
      }
    }
  }
  for (const s of G.spawners) s.update(dt);
  for (const e of G.enemies) if (e.alive) e.update(dt);
  if (G.boss && G.boss.alive) { G.boss.update(dt); updateBossStatus(dt); }
  for (const b of G.bullets) if (b.alive) b.update(dt);
  for (const m of G.mortars) if (m.alive) m.update(dt);
  for (const k of G.pickups) if (k.alive) k.update(dt);
  for (const m of G.mines) if (!m.dead) m.update(dt);
  updateFires(dt);
  updateTimers(dt);
  updateFx(dt);

  G.mines = G.mines.filter(m => !m.dead);
  G.enemies = G.enemies.filter(e => e.alive);
  G.bullets = G.bullets.filter(b => b.alive);
  G.mortars = G.mortars.filter(m => m.alive);
  G.pickups = G.pickups.filter(k => k.alive);
  G.spawners = G.spawners.filter(s => s.alive);

  if (G.mod && G.mod.id === 'barrage') {
    G.barrageT -= dt;
    if (G.barrageT <= 0) {
      G.barrageT = rand(1.8, 2.8);
      const alive = G.players.filter(q => !q.dead);
      if (alive.length) {
        const p = pick(alive);
        const tx = clamp(p.cx + rand(-40, 40), 8, FW - 8), ty = clamp(p.cy + rand(-40, 40), 8, FH - 8);
        G.mortars.push(new Mortar(tx, -10, tx, ty, 1.5, { r: 16, h: 0 }));
      }
    }
  }
  if (G.gameOverT > 0) { G.gameOverT -= dt; if (G.gameOverT <= 0) { gameOver(); return; } }
  if (G.bossDeadT > 0) { G.bossDeadT -= dt; if (G.bossDeadT <= 0) { sectorClear(); return; } }
  if (!G.info.boss && !G.queue.length && !G.spawners.length && !G.enemies.length && !G.gameOverT) sectorClear();
}

function updateClear(dt) {
  G.clearT += dt;
  updateFx(dt);
  if (G.clearT > 3.2 || (G.clearT > 1.2 && anyCtrl('fire'))) {
    if (G.info.final) { G.state = 'victory'; G.overT = 0; saveBest(); Music.play('title'); }
    else openPerks();
  }
}

function updatePerk(dt) {
  const P = G.perk;
  P.t += dt;
  G.players.forEach((p, i) => {
    if (P.done[i]) return;
    const c = p.ctrl;
    if (Input.hit(c.left)) { P.sel[i] = (P.sel[i] + P.cards.length - 1) % P.cards.length; Sound.play('select'); }
    if (Input.hit(c.right)) { P.sel[i] = (P.sel[i] + 1) % P.cards.length; Sound.play('select'); }
    if (Input.hit(c.fire) && P.t > 0.5) {
      const id = P.cards[P.sel[i]];
      if (!canTake(p, id)) { Sound.play('deny'); return; }
      p.perks[id] = (p.perks[id] || 0) + 1;
      if (PERKS[id].onPick) PERKS[id].onPick(p);
      p.recalc();
      P.done[i] = true;
      Sound.play('confirm');
    }
  });
  if (P.done.every(Boolean)) {
    P.doneT += dt;
    if (P.doneT > 0.6) { G.depth++; startSector(); }
  }
}

function updateVictory(dt) {
  G.overT += dt;
  updateFx(dt);
  if (G.overT < 1.5) return;
  if (Input.hit(KEYS_BACK)) { toTitle(); return; }
  if (anyCtrl('fire')) {
    for (const p of G.players) { p.dead = false; p.hp = p.maxHp; }
    G.depth++;
    startSector();
  }
}

// ============================================================
//  ОТРИСОВКА
// ============================================================
const fogC = mk(FW, FH), fogG = fogC.getContext('2d');
let brickPattern = null;

function frame(x, y, w, h, col) { rect(ctx, x, y, w, 1, col); rect(ctx, x, y + h - 1, w, 1, col); rect(ctx, x, y, 1, h, col); rect(ctx, x + w - 1, y, 1, h, col); }
function shade(alpha) { ctx.globalAlpha = alpha; rect(ctx, 0, 0, W, H, '#000'); ctx.globalAlpha = 1; }
const blink = (hz = 2) => Math.floor(G.time * hz) % 2 === 0;

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  rect(ctx, 0, 0, W, H, '#000');
  switch (G.state) {
    case 'title': drawTitle(); break;
    case 'help': drawHelp(); break;
    case 'select': drawSelect(); break;
    case 'intro': drawWorld(); drawHUD(); drawIntro(); break;
    case 'play': drawWorld(); drawHUD(); if (G.paused) drawPause(); break;
    case 'clear': drawWorld(); drawHUD(); drawClear(); break;
    case 'perk': drawPerk(); break;
    case 'gameover': drawGameOver(); break;
    case 'victory': drawVictory(); break;
  }
}

function drawWorld() {
  const g = ctx;
  const sx = G.shake > 0.3 ? Math.round(rand(-G.shake, G.shake)) : 0, sy = G.shake > 0.3 ? Math.round(rand(-G.shake, G.shake)) : 0;
  g.save();
  g.translate(sx, HUD_H + sy);
  g.beginPath(); g.rect(0, 0, FW, FH); g.clip();
  G.level.drawBase(g, G.time);
  const boss = G.boss && G.boss.alive ? G.boss : null;
  drawFires(g);
  for (const m of G.mines) m.draw(g);
  for (const p of G.players) if (p.dead) p.draw(g);
  for (const s of G.spawners) s.draw(g);
  if (boss) { boss.drawGround(g); drawBossStatus(g); }
  for (const e of G.enemies) e.draw(g);
  for (const p of G.players) if (!p.dead) p.draw(g);
  for (const p of G.players) drawDrones(p, g);
  for (const b of G.bullets) b.draw(g);
  G.level.drawTop(g);
  for (const e of G.effects) e.draw(g);
  if (boss) boss.drawAir(g);
  for (const m of G.mortars) { m.drawMarker(g); m.drawShell(g); }
  for (const k of G.pickups) k.draw(g);
  for (const p of G.particles) p.draw(g);
  if (G.mod && G.mod.id === 'fog') drawFog(g);
  for (const p of G.popups) p.draw(g);
  g.restore();
  if (G.flashT > 0) { ctx.globalAlpha = Math.min(1, G.flashT * 3); rect(ctx, 0, HUD_H, W, FH, '#fcfcfc'); ctx.globalAlpha = 1; }
  if (G.bannerT > 0 && G.state === 'play') {
    ctx.globalAlpha = 0.7; rect(ctx, 0, HUD_H + 100, W, 26, '#000'); ctx.globalAlpha = 1;
    if (Math.floor(G.bannerT * 6) % 2 || G.bannerT < 1.2) text(G.bannerText, W / 2, HUD_H + 106, G.bannerCol, 2, 'center', '#000');
  }
  if (G.freeze > 0 && G.state === 'play') text(tr('ВРАГИ ЗАМОРОЖЕНЫ') + ' ' + Math.ceil(G.freeze), W / 2, H - 10, '#3cbcfc', 1, 'center', '#000');
}

function drawFog(g) {
  fogG.globalCompositeOperation = 'source-over';
  fogG.clearRect(0, 0, FW, FH);
  rect(fogG, 0, 0, FW, FH, 'rgba(2,2,6,0.94)');
  fogG.globalCompositeOperation = 'destination-out';
  for (const p of G.players) {
    if (p.dead) continue;
    disc(fogG, p.cx, p.cy, 72, 'rgba(0,0,0,0.45)');
    disc(fogG, p.cx, p.cy, 60, 'rgba(0,0,0,0.6)');
    disc(fogG, p.cx, p.cy, 50, 'rgba(0,0,0,1)');
  }
  for (const e of G.effects) if (e instanceof Boom && e.r >= 10) disc(fogG, e.x, e.y, e.r * 2.2, 'rgba(0,0,0,0.7)');
  for (const b of G.bullets) if (b.team === 'enemy') disc(fogG, b.x, b.y, 5, 'rgba(0,0,0,0.8)');
  fogG.globalCompositeOperation = 'source-over';
  g.drawImage(fogC, 0, 0);
}

function drawHUD() {
  rect(ctx, 0, 0, W, HUD_H, '#0c0c0c');
  rect(ctx, 0, HUD_H - 1, W, 1, '#2c2c2c');
  const three = G.players.length >= 3;
  // 1-2 игрока: 1P слева, 2P справа, сектор по центру; 3 игрока: компактные панели в ряд, сектор справа
  G.players.forEach((p, i) => drawPlayerHUD(p, three ? 2 + i * 95 : (i === 0 ? 3 : 259), three));
  const cx = three ? 335 : W / 2, bw = three ? 88 : 110;
  if (G.boss) {
    const b = G.boss, bx = cx - bw / 2;
    text(b.name, cx, 1, '#f83800', 1, 'center');
    rect(ctx, bx - 1, 9, bw + 2, 5, '#3c0000');
    rect(ctx, bx, 10, Math.round(bw * Math.max(0, b.hp) / b.maxHp), 3, b.flash > 0 ? '#fcfcfc' : '#f83800');
  } else {
    text(tr('СЕКТОР') + ' ' + sectorName(G.depth), cx, 1, '#fcfcfc', 1, 'center');
    const left = G.queue.length + G.spawners.length + G.enemies.length;
    ctx.drawImage(TankGfx.get('basic', 'basic')[0][0], 0, 0, 16, 16, cx - 26, 8, 7, 7);
    text('× ' + left, cx - 16, 8, '#a8a8a8');
  }
  if (G.players.length === 1) {
    if (G.mod) text(G.mod.name, W - 3, 1, '#f87800', 1, 'right');
    if (!Touch.on) text('ESC ПАУЗА  M МУЗЫКА', W - 3, 8, '#444444', 1, 'right');
  }
}
function drawPlayerHUD(p, x, compact) {
  text(p.label, x, 1, p.color);
  if (p.dead) {
    if (blink(3)) text(G.players.length > 1 && !compact ? 'ПОДБИТ! ПОМОГИ' : 'ПОДБИТ!', x + 14, 1, '#f83800');
  } else if (compact && p.maxHp + (p.stats.eshield ? 1 : 0) > 9) {
    // в тесной панели много сердец не помещается — пишем числом
    const w = text('♥' + p.hp + '/' + p.maxHp, x + 14, 1, '#f83838');
    if (p.stats.eshield) ctx.drawImage(p.eshieldReady ? HEART_SHIELD : HEART_EMPTY, x + 16 + w, 1);
  } else {
    for (let i = 0; i < p.maxHp; i++) ctx.drawImage(i < p.hp ? HEART_FULL : HEART_EMPTY, x + 14 + i * 8, 1);
    if (p.stats.eshield) ctx.drawImage(p.eshieldReady ? HEART_SHIELD : HEART_EMPTY, x + 14 + p.maxHp * 8 + 2, 1);
  }
  const C = CLASSES[p.cls], cd = C.cd * p.stats.cdMul, k = p.scd > 0 ? clamp(1 - p.scd / cd, 0, 1) : 1;
  const bw = compact ? 20 : 32, px = x + bw + 3, ps = compact ? 3 : 4;
  rect(ctx, x, 9, bw, 4, '#202020');
  rect(ctx, x, 9, Math.round(bw * k), 4, k >= 1 ? (blink(4) ? '#fcfcfc' : p.color) : '#3c78a8');
  for (let i = 0; i < MAX_WEAPON; i++) rect(ctx, px + i * ps, 9, ps - 1, 4, i < p.weapon ? (i >= 5 ? '#fc9838' : '#fcd820') : '#2c2c2c');
  text(String(p.score).padStart(6, '0'), x + (compact ? 92 : 122), 8, '#d0d0d0', 1, 'right');
}

function drawIntro() {
  const t = G.introT, open = clamp((t - 1.9) / 0.5, 0, 1);
  const hh = Math.round((FH / 2) * (1 - open));
  rect(ctx, 0, HUD_H, W, hh, '#636363');
  rect(ctx, 0, HUD_H + FH - hh, W, hh, '#636363');
  if (open > 0) return;
  const info = G.info, cy = HUD_H + FH / 2;
  text(tr('СЕКТОР') + ' ' + sectorName(G.depth), W / 2, cy - 44, '#000', 3, 'center');
  text(tr('БИОМ:') + ' ' + tr(BIOMES[info.biome].name), W / 2, cy - 14, '#1c1c1c', 1, 'center');
  if (info.boss) {
    text('!! БОСС !!', W / 2, cy + 2, blink(6) ? '#a00000' : '#000', 2, 'center');
    text(G.boss.name, W / 2, cy + 22, '#000', 1, 'center');
  } else if (G.mod) {
    text(tr('МОДИФИКАТОР:') + ' ' + tr(G.mod.name), W / 2, cy + 2, '#801000', 1, 'center');
    text(G.mod.desc, W / 2, cy + 12, '#000', 1, 'center');
    text('НАГРАДА: +1 КАРТА УЛУЧШЕНИЯ', W / 2, cy + 22, '#003c00', 1, 'center');
  } else {
    text(tr('УНИЧТОЖЬТЕ ВСЕХ ВРАГОВ:') + ' ' + G.total, W / 2, cy + 2, '#000', 1, 'center');
  }
  if (G.depth === 1) {
    if (G.players.length > 1) {
      text(G.players.map(p => p.label + ': ' + devName(p.ctrl)).join('   '), W / 2, cy + 44, '#202020', 1, 'center');
      text('ОГОНЬ - СТРЕЛЯТЬ   СПЕЦ - СПЕЦПРИЁМ', W / 2, cy + 54, '#202020', 1, 'center');
    } else text('WASD/СТРЕЛКИ  ПРОБЕЛ - ОГОНЬ  E - СПЕЦПРИЁМ', W / 2, cy + 48, '#202020', 1, 'center');
  }
}

function drawClear() {
  ctx.globalAlpha = 0.75; rect(ctx, 0, HUD_H + 60, W, 110, '#000'); ctx.globalAlpha = 1;
  text('СЕКТОР ЗАЧИЩЕН!', W / 2, HUD_H + 70, '#fcd820', 2, 'center', '#7c4000');
  G.players.forEach((p, i) => {
    const y = HUD_H + 98 + i * 14;
    text(p.label + '  ' + tr(CLASSES[p.cls].name), 70, y, p.color);
    text(tr('УБИТО:') + ' ' + p.kills, 200, y, '#fcfcfc');
    text(tr('ОЧКИ:') + ' ' + p.score, 280, y, '#fcfcfc');
  });
  text(G.healMsg, W / 2, HUD_H + 134, '#f83838', 1, 'center');
  if (G.clearT > 1.2 && blink(3)) text('ОГОНЬ - ДАЛЕЕ', W / 2, HUD_H + 152, '#7c7c7c', 1, 'center');
}

function drawPause() {
  shade(0.6);
  text('ПАУЗА', W / 2, 80, '#fcfcfc', 3, 'center');
  ['ПРОДОЛЖИТЬ', 'ВЫЙТИ В МЕНЮ'].forEach((s, i) => {
    const y = 124 + i * 16;
    text(s, W / 2, y, G.pauseSel === i ? '#fcd820' : '#7c7c7c', 1, 'center');
    if (G.pauseSel === i) ctx.drawImage(TankGfx.get('std', 'p1')[Math.floor(G.time * 8) % 2][1], W / 2 - 60, y - 4);
  });
  text(tr('M - МУЗЫКА:') + ' ' + tr(Sound.musicOn ? 'ВКЛ' : 'ВЫКЛ'), W / 2, 176, '#545454', 1, 'center');
}

function drawPerk() {
  const P = G.perk;
  rect(ctx, 0, 0, W, H, '#06060c');
  text('ВЫБЕРИТЕ УЛУЧШЕНИЕ', W / 2, 8, '#fcd820', 2, 'center', '#5c3c00');
  text(tr('СЕКТОР') + ' ' + sectorName(G.depth) + ' ' + tr('ПРОЙДЕН') + (G.info.boss ? ' ' + tr('- РЕДКИЕ НАГРАДЫ!') : ''), W / 2, 27, '#7c7c7c', 1, 'center');
  const n = P.cards.length, gap = 6, cw = Math.floor((W - 24 - gap * (n - 1)) / n), ch = 160, y0 = 46;
  for (let i = 0; i < n; i++) drawCard(P, i, 12 + i * (cw + gap), y0, cw, ch);
  text(G.players.length > 1 ? 'КАЖДЫЙ СВОИМ УСТРОЙСТВОМ: ВЛЕВО/ВПРАВО - ВЫБОР, ОГОНЬ - ВЗЯТЬ' : '←/→ ВЫБОР   ПРОБЕЛ/ENTER - ВЗЯТЬ',
    W / 2, 231, '#7c7c7c', 1, 'center');
  const ow = G.players.filter(p => Object.keys(p.perks).length)
    .map(p => p.label + ': ' + Object.keys(p.perks).map(k => PERKS[k].icon + (p.perks[k] > 1 ? p.perks[k] : '')).join(' ')).join('   ');
  text(ow.length > 62 ? ow.slice(0, 62) : ow, W / 2, 244, '#4c4c4c', 1, 'center');
}
function cardStyle(pk) {
  if (pk.legend) return { b: '#f87800', i: '#4c2000', icon: '#f87800', label: 'ЛЕГЕНДАРНОЕ' };
  if (pk.aux) return { b: '#3cbcfc', i: '#103c5c', icon: '#3cbcfc', label: 'СИСТЕМА' };
  if (pk.rare) return { b: '#3cbcfc', i: '#103c5c', icon: '#3cbcfc', label: 'РЕДКОЕ' };
  return { b: '#8c8c8c', i: '#2c2c2c', icon: '#fcfcfc', label: 'ОБЫЧНОЕ' };
}
// карта-часть синергии: «СИНЕРГИЯ!», если её взятие сразу открывает синергию кому-то из игроков
function synHint(id) {
  const syns = SYN_OF[id];
  if (!syns) return null;
  const opens = G.players.some(p => canTake(p, id) && syns.some(s => !p.perks[s] &&
    PERKS[s].parts.every(k => k === id || p.perks[k]) && (!PERKS[s].cls || p.cls === PERKS[s].cls)));
  return opens ? 'СИНЕРГИЯ!' : 'В СИНЕРГИИ';
}
function drawCard(P, i, x, y, w, h) {
  const id = P.cards[i], pk = PERKS[id], st = cardStyle(pk);
  rect(ctx, x, y, w, h, '#000');
  frame(x, y, w, h, st.b);
  frame(x + 2, y + 2, w - 4, h - 4, st.i);
  text(pk.icon, x + w / 2, y + 12, st.icon, 3, 'center');
  const maxc = Math.floor((w - 10) / 6);
  let yy = y + 42;
  for (const l of wrap(pk.name, maxc)) { text(l, x + w / 2, yy, '#fcfcfc', 1, 'center'); yy += 9; }
  yy += 5;
  for (const l of wrap(pk.desc, maxc)) { text(l, x + w / 2, yy, '#a8a8a8', 1, 'center'); yy += 9; }
  const hint = synHint(id);
  if (hint) text(hint, x + w / 2, y + h - 34, hint === 'СИНЕРГИЯ!' ? (blink(3) ? '#fcd820' : '#f87800') : '#7c4000', 1, 'center');
  text(st.label, x + w / 2, y + h - 14, st.b, 1, 'center');
  G.players.forEach((p, pi) => {
    const have = p.perks[id] || 0;
    if (P.sel[pi] === i) {
      const c = p.color, done = P.done[pi], why = cantReason(p, id);
      if (!done || blink(4)) { frame(x - 2 - pi, y - 2 - pi, w + 4 + pi * 2, h + 4 + pi * 2, c); }
      const ty = pi === 0 ? y - 10 : y + h + 4 + (pi - 1) * 9; // 1P над картой, 2P и 3P под ней
      text(p.label + (done ? ' ' + tr('ВЗЯТО') : why ? ' ' + tr(why) : ''), x + w / 2, ty, c, 1, 'center');
    }
    if (have) text(p.label + '×' + have, [x + 4, x + w - 4, x + w / 2][pi], y + h - 24, p.color, 1, ['left', 'right', 'center'][pi]);
  });
}

function drawBrickText(s, cx, y, scale) {
  if (!brickPattern) brickPattern = ctx.createPattern(getTiles(0).brick, 'repeat');
  s = tr(s).toUpperCase();
  const x0 = Math.round(cx - textWidth(s, scale) / 2);
  ctx.fillStyle = brickPattern;
  for (let i = 0; i < s.length; i++) {
    const rows = FONT[GLYPH_ALIAS[s[i]] || s[i]];
    if (!rows) continue;
    for (let yy = 0; yy < 7; yy++) for (let xx = 0; xx < 5; xx++) if (rows[yy][xx] === '#') ctx.fillRect(x0 + (i * 6 + xx) * scale, y + yy * scale, scale, scale);
  }
}

function drawTitle() {
  drawBrickText('ТАНКИ', W / 2, 22, 8);
  text('8-БИТНЫЙ РОГАЛИК', W / 2, 88, '#fcd820', 2, 'center', '#7c4000');
  MENU.forEach((s, i) => {
    const y = 108 + i * 11, sel = G.menuSel === i;
    text(s, W / 2 - 40, y, sel ? '#fcfcfc' : '#7c7c7c');
    if (sel) ctx.drawImage(TankGfx.get('std', 'p1')[Math.floor(G.time * 8) % 2][1], W / 2 - 62, y - 4);
  });
  const pads = Input.pads;
  text(pads.length ? tr('ГЕЙМПАДЫ:') + ' ' + pads.map(padName).join(', ') : 'ГЕЙМПАДЫ: НАЖМИТЕ ЛЮБУЮ КНОПКУ НА ГЕЙМПАДЕ',
    W / 2, 166, pads.length ? '#7c7c7c' : '#3c3c3c', 1, 'center');
  if (G.best.depth > 0) text(tr('РЕКОРД: СЕКТОР') + ' ' + sectorName(G.best.depth) + '   ' + tr('ОЧКИ:') + ' ' + G.best.score, W / 2, 180, '#7c7c7c', 1, 'center');
  text('4 БИОМА  •  8 БОССОВ  •  ДО 3 ИГРОКОВ: КЛАВИАТУРА И ГЕЙМПАДЫ', W / 2, 194, '#3c78a8', 1, 'center');
  if (!Sound.ac || Sound.ac.state !== 'running') text(Touch.on ? 'ДЛЯ ЗВУКА КОСНИТЕСЬ ЭКРАНА' : 'ДЛЯ ЗВУКА НАЖМИТЕ КЛАВИШУ ИЛИ КЛИКНИТЕ', W / 2, 4, '#545454', 1, 'center');
  // парад танков внизу
  const T = getTiles(0);
  for (let x = 0; x < W; x += 8) { ctx.drawImage(T.brick, x, 240); ctx.drawImage(T.brick, x, 248); }
  const order = [['basic', 'basic'], ['fast', 'fast'], ['armor', 'armor'], ['spread', 'spread'], ['std', 'p1'], ['heavy', 'p2'], ['scout', 'p3']];
  order.forEach(([sh, pal], i) => {
    const x = ((G.time * 28 + i * 40) % (W + 240)) - 40;
    ctx.drawImage(TankGfx.get(sh, pal)[Math.floor(G.time * 10) % 2][1], Math.round(x), 222);
  });
  if (blink(1.5)) text(Touch.on ? 'ДЖОЙСТИК - ВЫБОР   ● - ОК' : 'ПРОБЕЛ / ENTER / КРЕСТ', W / 2, 207, '#545454', 1, 'center');
}

function drawHelp() {
  text('УПРАВЛЕНИЕ', W / 2, 8, '#fcd820', 2, 'center');
  const L = [
    ['#fcfcfc', 'WASD - ЕХАТЬ   ПРОБЕЛ - ОГОНЬ   E - СПЕЦПРИЁМ'],
    ['#fcfcfc', 'СТРЕЛКИ - ЕХАТЬ   ENTER - ОГОНЬ   K - СПЕЦПРИЁМ'],
    ['#fcfcfc', 'NUMPAD 8456 - ЕХАТЬ   0 - ОГОНЬ   ENTER - СПЕЦ'],
    ['#bcbcbc', 'ГЕЙМПАД: КРЕСТ/R2 - ОГОНЬ  КРУГ/L2 - СПЕЦ  OPTIONS - ПАУЗА'],
    ['#fcd820', 'ДО 3 ИГРОКОВ: ВХОД - ОГОНЬ НА СВОЁМ УСТРОЙСТВЕ'],
    ['#7c7c7c', 'ESC/P - ПАУЗА   M - МУЗЫКА'],
  ];
  if (Touch.on) L.splice(2, 1, ['#fcfcfc', 'ТЕЛЕФОН: ДЖОЙСТИК СЛЕВА  ● - ОГОНЬ  * - СПЕЦ  II - ПАУЗА']);
  L.forEach(([c, s], i) => text(s, W / 2, 26 + i * 9, c, 1, 'center'));
  text('ПРАВИЛА', W / 2, 84, '#fcd820', 1, 'center');
  const R = [
    'УНИЧТОЖЬТЕ ВСЕХ ВРАГОВ В СЕКТОРЕ, ПОСЛЕ - ВЫБОР УЛУЧШЕНИЯ',
    'КАЖДЫЙ 4-Й СЕКТОР - БОСС. СМЕРТЬ = КОНЕЦ ЗАБЕГА',
    'МИГАЮЩИЕ КРАСНЫМ ТАНКИ ОСТАВЛЯЮТ БОНУСЫ. ЗВЕЗДА - ВСЕМ',
    'ПОДБИТОГО НАПАРНИКА ПОДНИМЕТ ТОТ, КТО ПОСТОИТ РЯДОМ',
    'СНАРЯДЫ ПРОЛЕТАЮТ СКВОЗЬ НАПАРНИКА. КУСТЫ СКРЫВАЮТ ТАНКИ',
  ];
  R.forEach((s, i) => text(s, W / 2, 96 + i * 10, '#bcbcbc', 1, 'center'));
  text('БОНУСЫ', W / 2, 152, '#fcd820', 1, 'center');
  const B = [['helmet', 'КАСКА - ЩИТ'], ['clock', 'ЧАСЫ - ЗАМОРОЗКА'], ['grenade', 'ГРАНАТА - ВЗРЫВ'], ['star', 'ЗВЕЗДА - ОРУЖИЕ+'], ['repair', 'РЕМОНТ +2']];
  B.forEach(([k, s], i) => {
    const x = 14 + (i % 3) * 124, y = 164 + Math.floor(i / 3) * 18;
    rect(ctx, x, y, 14, 14, '#000'); ctx.drawImage(Icons[k], x + 1, y + 1);
    text(s, x + 18, y + 4, '#bcbcbc');
  });
  text('ВРАГИ', W / 2, 206, '#fcd820', 1, 'center');
  const ET = Object.keys(ENEMY_TYPES), step = W / ET.length;
  ET.forEach((k, i) => {
    const T = ENEMY_TYPES[k], x = Math.round(step * i + step / 2);
    ctx.drawImage(TankGfx.get(T.shape, T.pal)[0][2], x - 8, 214);
    text(T.name, x, i % 2 ? 240 : 232, '#7c7c7c', 1, 'center'); // подписи в шахматном порядке, чтобы не слипались
  });
}

function drawSelect() {
  text('ВЫБОР ТАНКА', W / 2, 8, '#fcfcfc', 2, 'center');
  const S = G.sel, n = S.slots.length;
  // панели: 1 игрок — широкая по центру, 2 — по половинам, 3 — по третям
  const pw = n === 3 ? 122 : 176, py = 30, ph = 200;
  S.slots.forEach((sl, i) => {
    const cx = n === 1 ? W / 2 : n === 2 ? (i === 0 ? W / 4 : W * 3 / 4) : W / 6 + i * W / 3;
    const px = Math.round(cx - pw / 2), col = PLAYER_PALS[sl.col].ui, narrow = pw < 150;
    rect(ctx, px, py, pw, ph, '#08080c');
    frame(px, py, pw, ph, sl.ready ? col : sl.dev === null ? '#202020' : '#3c3c3c');
    const label = n === 1 ? 'ИГРОК' : (i + 1) + 'P';
    if (sl.dev === null) { // слот ждёт игрока
      text(label, cx, py + 6, col, 1, 'center');
      ctx.globalAlpha = 0.25; ctx.drawImage(TankGfx.get('std', 'pc' + sl.col)[0][0], cx - 24, py + 32, 48, 48); ctx.globalAlpha = 1;
      if (blink(2)) text('ОГОНЬ - ВОЙТИ', cx, py + 96, col, 1, 'center');
      wrap('НАЖМИТЕ ОГОНЬ НА СВОЁМ УСТРОЙСТВЕ: ПРОБЕЛ, ENTER, NUM0 ИЛИ КРЕСТ', Math.floor((pw - 8) / 6))
        .forEach((l, k) => text(l, cx, py + 116 + k * 9, '#545454', 1, 'center'));
      return;
    }
    const C = CLASSES[CLASS_LIST[sl.cls]];
    text(tr(label) + (sl.dev === 'all' ? '' : ' - ' + devName(DEVICES[sl.dev])), cx, py + 6, col, 1, 'center');
    text('<  ' + tr(C.name) + '  >', cx, py + 18, '#fcfcfc', 1, 'center');
    ctx.drawImage(TankGfx.get(C.shape, 'pc' + sl.col)[Math.floor(G.time * 6) % 2][0], cx - 24, py + 32, 48, 48);
    for (let k = 0; k < 4; k++) { rect(ctx, cx + 34 - k, py + 42 + k, k * 2 + 1, 1, '#7c7c7c'); rect(ctx, cx + 34 - k, py + 72 - k, k * 2 + 1, 1, '#7c7c7c'); } // стрелки выбора цвета
    text(PLAYER_PALS[sl.col].name, cx, py + 81, col, 1, 'center');
    const labels = ['ПРОЧНОСТЬ', 'СКОРОСТЬ', narrow ? 'ОГОНЬ' : 'СКОРОСТРЕЛ.', 'УРОН'], bx = narrow ? 60 : 84, step = narrow ? 9 : 13;
    labels.forEach((l, k) => {
      const y = py + 90 + k * 11;
      text(l, px + (narrow ? 5 : 8), y, '#8c8c8c');
      for (let j = 0; j < 6; j++) rect(ctx, px + bx + j * step, y, step - 2, 7, j < C.stats[k] ? col : '#202020');
    });
    text(tr(narrow ? 'СПЕЦ:' : 'СПЕЦПРИЁМ:') + ' ' + tr(C.sname), cx, py + 140, '#3cbcfc', 1, 'center');
    wrap(C.sdesc, Math.floor((pw - 8) / 6)).forEach((l, k) => text(l, cx, py + 151 + k * 9, '#8c8c8c', 1, 'center'));
    if (sl.ready) { if (blink(4)) text('ГОТОВ!', cx, py + 182, col, 1, 'center'); }
    else text(narrow || n === 1 ? 'ОГОНЬ - ВЫБРАТЬ' : 'ОГОНЬ-ВЫБОР  СПЕЦ-ВЫЙТИ', cx, py + 182, '#7c7c7c', 1, 'center');
  });
  text(n > 1 ? 'ВЛЕВО/ВПРАВО - ТАНК  ВВЕРХ/ВНИЗ - ЦВЕТ  ESC - НАЗАД' : 'ВЛЕВО/ВПРАВО - ТАНК   ВВЕРХ/ВНИЗ - ЦВЕТ   ESC - НАЗАД', W / 2, 240, '#3c3c3c', 1, 'center');
}

function drawStats(y) {
  G.players.forEach((p, i) => {
    const yy = y + i * 14;
    text(p.label + ' ' + tr(CLASSES[p.cls].name), 60, yy, p.color);
    text(tr('УБИТО:') + ' ' + p.kills, 190, yy, '#fcfcfc');
    text(tr('ОЧКИ:') + ' ' + p.score, 270, yy, '#fcfcfc');
  });
  const t = Math.floor(G.runTime || 0);
  text(tr('ОБЩИЙ СЧЁТ:') + ' ' + totalScore() + '    ' + tr('ВРЕМЯ:') + ' ' + Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'), W / 2, y + 36, '#bcbcbc', 1, 'center');
  text(G.newRecord ? 'НОВЫЙ РЕКОРД!' : tr('РЕКОРД: СЕКТОР') + ' ' + sectorName(G.best.depth) + '  ' + G.best.score, W / 2, y + 50, G.newRecord ? (blink(4) ? '#fcd820' : '#f83800') : '#7c7c7c', 1, 'center');
}
function drawGameOver() {
  drawBrickText('КОНЕЦ', W / 2, 30, 6);
  text(tr('ЗАБЕГ ОКОНЧЕН НА СЕКТОРЕ') + ' ' + sectorName(G.depth), W / 2, 90, '#f83800', 1, 'center');
  text(tr('БИОМ:') + ' ' + tr(BIOMES[sectorInfo(G.depth).biome].name), W / 2, 102, '#7c7c7c', 1, 'center');
  drawStats(126);
  if (G.overT > 1.2 && blink(2)) text('ОГОНЬ - В МЕНЮ', W / 2, 220, '#fcfcfc', 1, 'center');
}
function drawVictory() {
  for (let i = 0; i < 40; i++) { const x = (i * 97 + G.time * 20 * (1 + i % 3)) % W, y = (i * 53 + G.time * 30) % H; rect(ctx, x, y, 2, 2, ['#fcd820', '#f83800', '#3cbcfc', '#58d854'][i % 4]); }
  text('ПОБЕДА!', W / 2, 26, '#fcd820', 4, 'center', '#7c4000');
  text((G.boss && G.boss.deadText) || 'ЦИТАДЕЛЬ ОМЕГА УНИЧТОЖЕНА', W / 2, 70, '#fcfcfc', 1, 'center');
  text(tr('ЦИКЛ') + ' ' + (sectorInfo(G.depth).loop + 1) + ' ' + tr('ПРОЙДЕН'), W / 2, 82, '#7c7c7c', 1, 'center');
  drawStats(108);
  if (G.overT > 1.5) {
    text('ОГОНЬ - НОВЫЙ ЦИКЛ (ВРАГИ СИЛЬНЕЕ)', W / 2, 206, blink(2) ? '#fcfcfc' : '#bcbcbc', 1, 'center');
    text('ESC - В МЕНЮ', W / 2, 220, '#7c7c7c', 1, 'center');
  }
}

// ============================================================
//  ГЛАВНЫЙ ЦИКЛ
// ============================================================
const STEP = 1 / 60;
let lastT = performance.now(), acc = 0;
function loop(now) {
  requestAnimationFrame(loop);
  let dt = (now - lastT) / 1000;
  lastT = now;
  if (dt > 0.25) dt = 0.25;
  acc += dt;
  Input.pollPads();
  let n = 0;
  while (acc >= STEP && n < 5) { update(STEP); Input.endStep(); acc -= STEP; n++; }
  if (n === 5) acc = 0;
  render();
  Music.update();
}
requestAnimationFrame(loop);
