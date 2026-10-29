'use strict';
// ============================================================
//  TALENTS: постоянное дерево талантов между забегами.
//  Медали дают за сектора и боссов, тратятся на таланты в трёх ветках.
//  Таланты общие на устройство: их получают все игроки хоста, в т.ч. онлайн-гости.
//  Ярус ветки открывается, когда в нижние ярусы этой ветки вложено TAL_GATES[ярус] медалей.
// ============================================================

const TAL_BRANCHES = [
  { name: 'БРОНЯ', cls: 'heavy', col: '#f87878' },
  { name: 'ОГОНЬ', cls: 'assault', col: '#fca044' },
  { name: 'ТЕХНИКА', cls: 'scout', col: '#3cbcfc' },
];
const TAL_GATES = [0, 3, 8, 16, 28, 45, 65, 90];
// kind: gen — общий, cls — спецприём класса, start — стартовая карта, pick — выбор карты на старте, super — суперсинергия
const TALENTS = {
  // ---------- БРОНЯ (тяжёлый, щит) ----------
  hp: { b: 0, t: 0, cost: [2, 3, 4], icon: '♥+', name: 'ТОЛСТАЯ БРОНЯ', desc: '+1 К МАКС. ПРОЧНОСТИ ЗА УРОВЕНЬ' },
  field: { b: 0, t: 1, cost: [4], icon: '+♥', name: 'ПОЛЕВОЙ РЕМОНТ', desc: '+1 ПРОЧНОСТЬ ПОСЛЕ КАЖДОГО СЕКТОРА' },
  shDur: { b: 0, t: 1, cost: [4], icon: '()+', cls: 'heavy', name: 'ДОЛГИЙ ЩИТ', desc: 'ЩИТ ДЕРЖИТСЯ 4 С ВМЕСТО 3', pv: 'ЩИТ: 3 С → 4 С' },
  helmet: { b: 0, t: 2, cost: [6], icon: '@helmet', name: 'КАСКА', desc: 'В НАЧАЛЕ СЕКТОРА 6 С НЕУЯЗВИМОСТИ ВМЕСТО 2.5', pv: 'НЕУЯЗВИМОСТЬ: 2.5 С → 6 С' },
  shCd: { b: 0, t: 2, cost: [6], icon: '()%', cls: 'heavy', name: 'БЫСТРЫЙ ЩИТ', desc: 'ЩИТ ПЕРЕЗАРЯЖАЕТСЯ НА 20% БЫСТРЕЕ', pv: 'ПЕРЕЗАРЯДКА: 12 С → 9.6 С' },
  stEshield: { b: 0, t: 3, cost: [10], icon: '()', kind: 'start', card: 'eshield', name: 'ЭНЕРГОЩИТ НА СТАРТЕ', desc: 'ЗАБЕГ НАЧИНАЕТСЯ С КАРТОЙ ЭНЕРГОЩИТ' },
  shDmg: { b: 0, t: 3, cost: [10], icon: '()×', cls: 'heavy', name: 'ЖЁСТКИЙ ОТСКОК', desc: 'ОТРАЖЁННЫЕ ЩИТОМ СНАРЯДЫ БЬЮТ ×2', pv: 'УРОН ОТРАЖЕНИЯ: ×2' },
  second: { b: 0, t: 4, cost: [12], icon: '♥!', name: 'ВТОРОЙ ШАНС', desc: 'РАЗ ЗА ЗАБЕГ ВМЕСТО ГИБЕЛИ ТАНК ВСТАЁТ С ПОЛОВИНОЙ ПРОЧНОСТИ' },
  shWide: { b: 0, t: 4, cost: [12], icon: '(◆)', cls: 'heavy', name: 'ШИРОКИЙ ЩИТ', desc: 'ЩИТ В 1.6 РАЗА БОЛЬШЕ И ПРИКРЫВАЕТ НАПАРНИКОВ РЯДОМ', pv: 'РАДИУС ЩИТА: ×1.6' },
  stVamp: { b: 0, t: 5, cost: [16], icon: '×♥', kind: 'start', card: 'vamp', name: 'ТРОФЕЙНЫЙ РЕМОНТ НА СТАРТЕ', desc: 'ЗАБЕГ НАЧИНАЕТСЯ С КАРТОЙ ТРОФЕЙНЫЙ РЕМОНТ' },
  shWave: { b: 0, t: 5, cost: [16], icon: '()*', cls: 'heavy', name: 'УДАРНАЯ ВОЛНА', desc: 'ВКЛЮЧЕНИЕ ЩИТА БЬЁТ И ОТБРАСЫВАЕТ ВРАГОВ РЯДОМ', pv: 'ВОЛНА: 2 УРОНА ВОКРУГ' },
  scorch: { b: 0, t: 6, cost: [20], kind: 'super', perk: 'scorch' },
  emerg: { b: 0, t: 6, cost: [20], icon: '♥1', name: 'АВАРИЙНЫЙ РЕМОНТ', desc: 'ПРИ 1 ПРОЧНОСТИ - 3 С НЕУЯЗВИМОСТИ, РАЗ ЗА СЕКТОР' },
  chain: { b: 0, t: 7, cost: [26], kind: 'super', perk: 'chain' },
  fort: { b: 0, t: 7, cost: [26], icon: '()2', cls: 'heavy', name: 'КРЕПОСТЬ', desc: 'ЩИТ НАКАПЛИВАЕТ 2 ЗАРЯДА', pv: 'ЗАРЯДОВ ЩИТА: 1 → 2' },

  // ---------- ОГНЕВАЯ МОЩЬ (штурмовик, залп) ----------
  rof: { b: 1, t: 0, cost: [2, 3, 4], icon: '>>', name: 'СКОРОСТРЕЛЬНОСТЬ', desc: 'ПЕРЕЗАРЯДКА ОРУДИЯ БЫСТРЕЕ НА 8% ЗА УРОВЕНЬ' },
  vel: { b: 1, t: 1, cost: [4], icon: '→', name: 'ДЛИННЫЙ СТВОЛ', desc: 'СНАРЯДЫ ЛЕТЯТ НА 15% БЫСТРЕЕ' },
  vlMore: { b: 1, t: 1, cost: [4], icon: '*+', cls: 'assault', name: 'ПЛОТНЫЙ ЗАЛП', desc: 'ЗАЛП ВЫПУСКАЕТ 20 СНАРЯДОВ ВМЕСТО 16', pv: 'СНАРЯДОВ: 16 → 20' },
  star: { b: 1, t: 2, cost: [6], icon: '@star', name: 'ПЕРВАЯ ЗВЕЗДА', desc: 'ЗАБЕГ НАЧИНАЕТСЯ С 1 ЗВЕЗДОЙ ОРУЖИЯ', pv: 'ОРУЖИЕ: УР. 0 → УР. 1' },
  vlCd: { b: 1, t: 2, cost: [6], icon: '*%', cls: 'assault', name: 'БЫСТРЫЙ ЗАЛП', desc: 'ЗАЛП ПЕРЕЗАРЯЖАЕТСЯ НА 20% БЫСТРЕЕ', pv: 'ПЕРЕЗАРЯДКА: 9 С → 7.2 С' },
  stShotgun: { b: 1, t: 3, cost: [10], icon: '\\|/', kind: 'start', card: 'shotgun', name: 'ДРОБОВИК НА СТАРТЕ', desc: 'ЗАБЕГ НАЧИНАЕТСЯ С КАРТОЙ ДРОБОВИК' },
  vlDouble: { b: 1, t: 3, cost: [10], icon: '**', cls: 'assault', name: 'ДВОЙНОЙ ЗАЛП', desc: 'ЧЕРЕЗ 0.3 С ЗАЛП ПОВТОРЯЕТСЯ', pv: 'ЗАЛПОВ: 1 → 2' },
  elems: { b: 1, t: 4, cost: [12], icon: '♨❄', name: 'ЗНАТОК СТИХИЙ', desc: 'КАРТЫ СТИХИЙ ВЫПАДАЮТ ВДВОЕ ЧАЩЕ', pv: 'ШАНС СТИХИЙ: ×2' },
  vlDrill: { b: 1, t: 4, cost: [12], icon: '*#', cls: 'assault', name: 'ПРОБИВНОЙ ЗАЛП', desc: 'СНАРЯДЫ ЗАЛПА ПРОХОДЯТ СКВОЗЬ КИРПИЧ', pv: 'СКВОЗЬ 2 СТЕНЫ' },
  stElem: { b: 1, t: 5, cost: [16], icon: '♨?', kind: 'pick', cards: ['inc', 'cryo', 'tesla', 'mark'], name: 'СТИХИЯ НА СТАРТЕ', desc: 'В НАЧАЛЕ ЗАБЕГА - ВЫБОР ОДНОЙ ИЗ 4 СТИХИЙ' },
  vlHome: { b: 1, t: 5, cost: [16], icon: '*⌖', cls: 'assault', name: 'УМНЫЙ ЗАЛП', desc: 'СНАРЯДЫ ЗАЛПА НАВОДЯТСЯ НА ВРАГОВ', pv: 'НАВЕДЕНИЕ ЗАЛПА' },
  ion: { b: 1, t: 6, cost: [20], kind: 'super', perk: 'ion' },
  abszero: { b: 1, t: 6, cost: [20], kind: 'super', perk: 'abszero' },
  thunder: { b: 1, t: 7, cost: [26], kind: 'super', perk: 'thunder' },
  stDamage: { b: 1, t: 7, cost: [26], icon: '+1', kind: 'start', card: 'damage', name: 'КРУПНЫЙ КАЛИБР НА СТАРТЕ', desc: 'ЗАБЕГ НАЧИНАЕТСЯ С КАРТОЙ КРУПНЫЙ КАЛИБР' },

  // ---------- ТЕХНИКА (разведчик, рывок) ----------
  spd: { b: 2, t: 0, cost: [2, 3, 4], icon: '=>', name: 'ФОРСАЖ', desc: 'СКОРОСТЬ ХОДА +5% ЗА УРОВЕНЬ' },
  cd: { b: 2, t: 1, cost: [4], icon: '%', name: 'ВЫУЧКА', desc: 'СПЕЦПРИЁМ ЛЮБОГО КЛАССА ПЕРЕЗАРЯЖАЕТСЯ НА 10% БЫСТРЕЕ' },
  dsLong: { b: 2, t: 1, cost: [4], icon: '→→', cls: 'scout', name: 'ДАЛЬНИЙ РЫВОК', desc: 'РЫВОК ДЛИННЕЕ НА 30%', pv: 'ДЛИНА РЫВКА: ×1.3' },
  luck: { b: 2, t: 2, cost: [6], icon: '?', name: 'ТРОФЕЙЩИК', desc: 'БОНУСЫ ИЗ ВРАГОВ ВЫПАДАЮТ НА 25% ЧАЩЕ', pv: 'ШАНС БОНУСА: ×1.25' },
  dsCd: { b: 2, t: 2, cost: [6], icon: '→%', cls: 'scout', name: 'БЫСТРЫЙ РЫВОК', desc: 'РЫВОК ПЕРЕЗАРЯЖАЕТСЯ НА 20% БЫСТРЕЕ', pv: 'ПЕРЕЗАРЯДКА: 4 С → 3.2 С' },
  stAux: { b: 2, t: 3, cost: [10], icon: '≡?', kind: 'pick', cards: 'aux', name: 'СИСТЕМА НА СТАРТЕ', desc: 'В НАЧАЛЕ ЗАБЕГА - ВЫБОР ДОП. СИСТЕМЫ 1 УРОВНЯ' },
  dsTwo: { b: 2, t: 3, cost: [10], icon: '→2', cls: 'scout', name: 'ДВОЙНОЙ РЫВОК', desc: 'РЫВОК НАКАПЛИВАЕТ 2 ЗАРЯДА', pv: 'ЗАРЯДОВ РЫВКА: 1 → 2' },
  cards: { b: 2, t: 4, cost: [12], icon: '[+]', name: 'ШИРОКИЙ ВЫБОР', desc: '+1 КАРТА ПРИ ВЫБОРЕ УЛУЧШЕНИЯ', pv: 'КАРТ: 3 → 4' },
  dsZap: { b: 2, t: 4, cost: [12], icon: '→⚡', cls: 'scout', name: 'ГРОЗОВОЙ РЫВОК', desc: 'ВО ВРЕМЯ РЫВКА МОЛНИИ БЬЮТ ВРАГОВ РЯДОМ', pv: 'МОЛНИИ НА РЫВКЕ' },
  reroll: { b: 2, t: 5, cost: [16], icon: '?!', name: 'ПЕРЕСДАЧА', desc: 'РАЗ ЗА СЕКТОР МОЖНО ПЕРЕБРОСИТЬ КАРТЫ УЛУЧШЕНИЙ (СПЕЦ)' },
  dsBuff: { b: 2, t: 5, cost: [16], icon: '→+', cls: 'scout', name: 'АДРЕНАЛИН', desc: 'ПОСЛЕ РЫВКА 2 С ОРУДИЕ БЬЁТ ×2', pv: 'УРОН ПОСЛЕ РЫВКА: ×2' },
  carpet: { b: 2, t: 6, cost: [20], kind: 'super', perk: 'carpet' },
  whirl: { b: 2, t: 6, cost: [20], kind: 'super', perk: 'whirl' },
  slot3: { b: 2, t: 7, cost: [26], icon: '≡3', name: 'ТРЕТИЙ СЛОТ', desc: 'МОЖНО ПОСТАВИТЬ 3 ДОП. СИСТЕМЫ ВМЕСТО 2', pv: 'СЛОТОВ СИСТЕМ: 2 → 3' },
  dsBreak: { b: 2, t: 7, cost: [26], icon: '→#', cls: 'scout', name: 'ТАРАН-ПРОЛОМ', desc: 'РЫВОК ЛОМАЕТ КИРПИЧ И СТАЛЬ', pv: 'РЫВОК СКВОЗЬ СТЕНЫ' },
};
for (const id in TALENTS) {
  const T = TALENTS[id];
  T.id = id;
  T.kind = T.kind || (T.cls ? 'cls' : 'gen');
}
const TAL_LIST = Object.keys(TALENTS);
const TAL_STYLE = {
  gen: { c: '#fcfcfc', b: '#8c8c8c', f: '#2c2c2c', label: 'ОБЩИЙ ТАЛАНТ' },
  cls: { c: '#58d854', b: '#00a800', f: '#003c00' },
  start: { c: '#3cbcfc', b: '#0078f8', f: '#002c5c', label: 'СТАРТОВАЯ КАРТА' },
  pick: { c: '#3cbcfc', b: '#0078f8', f: '#002c5c', label: 'СТАРТОВЫЙ ВЫБОР' },
  super: { c: '#d878f8', b: '#9c3cd8', f: '#3c105c', label: 'СУПЕРСИНЕРГИЯ' },
};
// у суперсинергий имя, описание и значок — от мифической карты
const talName = T => T.perk ? PERKS[T.perk].name : T.name;
const talDesc = T => T.perk ? PERKS[T.perk].desc : T.desc;
const talIcon = T => T.perk ? PERKS[T.perk].icon : T.icon;

// ---------- хранилище: медали и уровни талантов ----------
const Talents = {
  data: Store.get('tanks_talents', { medals: 0, lv: {} }),
  save() { Store.set('tanks_talents', this.data); },
  lv(id) { return this.data.lv[id] || 0; },
  get medals() { return this.data.medals; },
  add(n) { this.data.medals += n; this.save(); },
  // вложено в ярусы ветки ниже tier (без учёта except: {id, ranks} — проверка возврата)
  spentBelow(b, tier, except) {
    let s = 0;
    for (const id of TAL_LIST) {
      const T = TALENTS[id];
      if (T.b !== b || T.t >= tier) continue;
      const n = this.lv(id) - (except && except.id === id ? 1 : 0);
      for (let i = 0; i < n; i++) s += T.cost[i];
    }
    return s;
  },
  spent(b) { return this.spentBelow(b, 99); },
  open(id) { const T = TALENTS[id]; return this.spentBelow(T.b, T.t) >= TAL_GATES[T.t]; },
  // почему нельзя изучить ('' — можно)
  cantBuy(id) {
    const T = TALENTS[id], l = this.lv(id);
    if (l >= T.cost.length) return 'ИЗУЧЕНО';
    if (!this.open(id)) return 'ЗАКРЫТО';
    if (this.medals < T.cost[l]) return 'МАЛО МЕДАЛЕЙ';
    return '';
  },
  buy(id) {
    if (this.cantBuy(id)) return false;
    const T = TALENTS[id];
    this.data.medals -= T.cost[this.lv(id)];
    this.data.lv[id] = this.lv(id) + 1;
    this.save();
    return true;
  },
  // вернуть один уровень (бесплатно), если от него не зависят верхние ярусы
  canRefund(id) {
    const T = TALENTS[id];
    if (!this.lv(id)) return false;
    for (const k of TAL_LIST) {
      const U = TALENTS[k];
      if (U.b !== T.b || U.t <= T.t || !this.lv(k)) continue;
      if (this.spentBelow(U.b, U.t, { id }) < TAL_GATES[U.t]) return false;
    }
    return true;
  },
  refund(id) {
    if (!this.canRefund(id)) return false;
    const l = this.lv(id);
    this.data.medals += TALENTS[id].cost[l - 1];
    if (l > 1) this.data.lv[id] = l - 1; else delete this.data.lv[id];
    this.save();
    return true;
  },
};
// уровень таланта для конкретного танка: классовые действуют только на свой класс
function talOf(p, id) { const T = TALENTS[id]; return T.cls && T.cls !== p.cls ? 0 : Talents.lv(id); }
// мифическая карта доступна в игре, только если её суперсинергия изучена
const perkAllowed = id => !PERKS[id].myth || Talents.lv(id) > 0;
const auxMax = () => 2 + (Talents.lv('slot3') ? 1 : 0);

// ---------- применение к забегу ----------
// бесплатные стартовые бонусы помечаются в p.base, чтобы не усиливать врагов (teamPower)
function applyTalents(p) {
  p.maxHp += talOf(p, 'hp'); p.hp = p.maxHp;
  for (const id of TAL_LIST) {
    const T = TALENTS[id];
    if (T.kind === 'start' && Talents.lv(id) && !p.perks[T.card]) { p.perks[T.card] = 1; p.base[T.card] = 1; if (PERKS[T.card].onPick) PERKS[T.card].onPick(p); }
  }
  p.weapon = p.baseWeapon = Talents.lv('star');
  p.charges = p.maxCh;
  p.recalc();
}
// стат-таланты: вызываются из Player.recalc после карт, до звёзд оружия
function talentStats(p, s) {
  const t = id => talOf(p, id);
  s.fieldRepair += t('field');
  s.reload *= Math.pow(0.92, t('rof'));
  if (t('vel')) s.bspeed *= 1.15;
  s.speed *= Math.pow(1.05, t('spd'));
  if (t('cd')) s.cdMul *= 0.9;
  if (t('luck')) s.luck *= 1.25;
  if (t('shCd') || t('vlCd') || t('dsCd')) s.cdMul *= 0.8;
}
// очередь стартовых выборов (стихия, система) — по одному экрану на талант
function startPicks() {
  const q = [];
  for (const id of TAL_LIST) {
    const T = TALENTS[id];
    if (T.kind !== 'pick' || !Talents.lv(id)) continue;
    const cards = T.cards === 'aux' ? AUX_IDS.slice().sort(() => Math.random() - 0.5).slice(0, 4) : T.cards.slice();
    q.push({ id, cards });
  }
  return q;
}
// медали за пройденный сектор
function sectorMedals(info) { return 1 + (info.boss ? 3 : 0) + (info.final ? 5 : 0); }

// ---------- экран талантов ----------
const TT = { x0: 22, bw: 56, gap: 4, y0: 46, rh: 22, nw: 24, nh: 16, px: 204, py: 24, pw: 178, ph: 206 };
// положение узла на экране
function talRect(id) {
  const T = TALENTS[id], bx = TT.x0 + T.b * (TT.bw + TT.gap), y = TT.y0 + T.t * TT.rh;
  const row = TAL_LIST.filter(k => TALENTS[k].b === T.b && TALENTS[k].t === T.t);
  const x = row.length === 1 ? bx + (TT.bw - TT.nw) / 2 : bx + 2 + row.indexOf(id) * (TT.nw + 4);
  return { x, y, w: TT.nw, h: TT.nh };
}
function openTalents() { G.tal = G.tal || { sel: 'hp' }; G.tal.t = 0; G.state = 'talents'; }
function talMove(dx, dy) {
  const cur = talRect(G.tal.sel), T = TALENTS[G.tal.sel];
  let best = null, bd = 1e9;
  for (const id of TAL_LIST) {
    if (id === G.tal.sel) continue;
    const U = TALENTS[id], r = talRect(id);
    if (dy && U.t !== T.t + dy) continue;
    if (dx && (U.t !== T.t || Math.sign(r.x - cur.x) !== dx)) continue;
    const d = Math.abs(r.x - cur.x) + Math.abs(r.y - cur.y);
    if (d < bd) { bd = d; best = id; }
  }
  if (best) { G.tal.sel = best; Sound.play('select'); }
}
function talBuy(id) {
  if (Talents.buy(id)) { Sound.play('pickup'); G.tal.fx = { id, t: 0 }; }
  else Sound.play('deny');
}
function talRefund(id) {
  if (Talents.refund(id)) Sound.play('select');
  else { Sound.play('deny'); if (Talents.lv(id)) G.tal.warn = 0.8; }
}
function updateTalents(dt) {
  const S = G.tal;
  S.t += dt;
  if (S.warn > 0) S.warn -= dt;
  if (S.fx) { S.fx.t += dt; if (S.fx.t > 0.5) S.fx = null; }
  if (Input.hit(KEYS_BACK)) { G.state = 'title'; Sound.play('select'); return; }
  if (anyCtrl('up')) talMove(0, -1);
  if (anyCtrl('down')) talMove(0, 1);
  if (anyCtrl('left')) talMove(-1, 0);
  if (anyCtrl('right')) talMove(1, 0);
  if (anyCtrl('fire') && S.t > 0.2) talBuy(S.sel);
  if (anyCtrl('special')) talRefund(S.sel);
}

function drawTalIcon(T, cx, y, col, scale = 1) {
  const ic = talIcon(T);
  if (ic[0] === '@') { const im = Icons[ic.slice(1)]; ctx.drawImage(im, Math.round(cx - 6 * scale), y - scale, 12 * scale, 12 * scale); }
  else text(ic, cx, y + 2 * scale, col, scale, 'center');
}
function drawTalents() {
  const S = G.tal, sel = S.sel;
  rect(ctx, 0, 0, W, H, '#06060c');
  text('ТАЛАНТЫ', 4, 4, '#fcd820', 2, 'left', '#5c3c00');
  text(tr('МЕДАЛИ:') + ' ✪' + Talents.medals, W - 4, 8, '#fcd820', 1, 'right');
  // шапки веток
  TAL_BRANCHES.forEach((B, b) => {
    const cx = TT.x0 + b * (TT.bw + TT.gap) + TT.bw / 2;
    text(B.name, cx, 26, B.col, 1, 'center');
    text('✪' + Talents.spent(b), cx, 35, '#545454', 1, 'center');
  });
  // ярусы: слева — сколько надо вложить в ветку
  for (let t = 0; t < TAL_GATES.length; t++) {
    const y = TT.y0 + t * TT.rh;
    if (t) text(String(TAL_GATES[t]), 2, y + 5, '#3c3c3c');
    for (let b = 0; b < 3; b++) {
      if (!t) continue;
      const cx = TT.x0 + b * (TT.bw + TT.gap) + TT.bw / 2, on = Talents.spentBelow(b, t) >= TAL_GATES[t];
      rect(ctx, cx, y - TT.rh + TT.nh, 1, TT.rh - TT.nh, on ? '#7c7c7c' : '#202020');
    }
  }
  for (const id of TAL_LIST) {
    const T = TALENTS[id], r = talRect(id), st = TAL_STYLE[T.kind], l = Talents.lv(id), open = Talents.open(id);
    const max = T.cost.length, can = !Talents.cantBuy(id);
    rect(ctx, r.x, r.y, r.w, r.h, l ? st.f : '#000');
    frame(r.x, r.y, r.w, r.h, l ? st.c : open ? (can && blink(1.5) ? st.c : st.b) : '#2c2c2c');
    drawTalIcon(T, r.x + r.w / 2, r.y + 3, l || open ? st.c : '#3c3c3c');
    if (max > 1) for (let i = 0; i < max; i++) rect(ctx, r.x + 5 + i * 5, r.y + r.h - 3, 4, 1, i < l ? '#fcd820' : '#3c3c3c');
    if (!open) { ctx.globalAlpha = 0.5; rect(ctx, r.x + 1, r.y + 1, r.w - 2, r.h - 2, '#000'); ctx.globalAlpha = 1; }
    if (S.fx && S.fx.id === id) frame(r.x - 3 - S.fx.t * 8, r.y - 3 - S.fx.t * 8, r.w + 6 + S.fx.t * 16, r.h + 6 + S.fx.t * 16, '#fcd820');
    if (id === sel) frame(r.x - 2, r.y - 2, r.w + 4, r.h + 4, blink(4) ? '#fcfcfc' : '#7c7c7c');
  }
  drawTalPreview(TALENTS[sel]);
  text(Touch.on ? 'ДЖОЙСТИК - ВЫБОР  ● - ИЗУЧИТЬ  * - ВЕРНУТЬ  P - НАЗАД' : 'СТРЕЛКИ - ВЫБОР  ОГОНЬ - ИЗУЧИТЬ  СПЕЦ - ВЕРНУТЬ  ESC - НАЗАД',
    W / 2, 245, '#545454', 1, 'center');
}

// ---------- превью таланта: что именно получит игрок ----------
const PV_CLS = { heavy: 'ТЯЖЁЛЫЙ: ЩИТ', assault: 'ШТУРМОВИК: ЗАЛП', scout: 'РАЗВЕДЧИК: РЫВОК' };
// стат-таланты: значения по классам до и после следующего уровня
const PV_STAT = {
  hp: (C, l) => [C.hp + l, C.hp + l + 1],
  rof: (C, l) => [C.reload * Math.pow(0.92, l), C.reload * Math.pow(0.92, l + 1)].map(v => v.toFixed(2) + tr('С')),
  spd: (C, l) => [C.speed * Math.pow(1.05, l), C.speed * Math.pow(1.05, l + 1)].map(v => Math.round(v)),
  vel: C => [C.bspeed, Math.round(C.bspeed * 1.15)],
  cd: C => [C.cd, +(C.cd * 0.9).toFixed(1)].map(v => v + tr('С')),
  field: () => ['+1 ♥', '+2 ♥'],
};
const PV_STAT_NAME = { hp: 'ПРОЧНОСТЬ', rof: 'ПЕРЕЗАРЯДКА', spd: 'СКОРОСТЬ', vel: 'СКОР. СНАРЯДА', cd: 'СПЕЦПРИЁМ', field: 'ПОСЛЕ СЕКТОРА' };
function drawTalPreview(T) {
  const { px, py, pw, ph } = TT, st = TAL_STYLE[T.kind], cx = px + pw / 2, maxc = Math.floor((pw - 8) / 6), l = Talents.lv(T.id);
  rect(ctx, px, py, pw, ph, '#000');
  frame(px, py, pw, ph, st.b);
  text(T.kind === 'cls' ? PV_CLS[T.cls] : st.label, cx, py + 5, st.c, 1, 'center');
  let y = py + 16;
  for (const s of wrap(talName(T), maxc)) { text(s, cx, y, '#fcfcfc', 1, 'center'); y += 9; }
  y += 2;
  for (const s of wrap(talDesc(T), maxc)) { text(s, cx, y, '#a8a8a8', 1, 'center'); y += 9; }
  // окошко превью
  const by = Math.max(y + 4, py + 62), bh = py + ph - 32 - by;
  rect(ctx, px + 6, by, pw - 12, bh, '#0c0c14');
  ctx.save(); ctx.beginPath(); ctx.rect(px + 6, by, pw - 12, bh); ctx.clip();
  if (PV_STAT[T.id]) pvStats(T, px + 6, by, pw - 12, l);
  else if (T.kind === 'cls') pvClass(T, cx, by, bh);
  else if (T.kind === 'start') pvCards([T.card], cx, by, bh, 'В НАЧАЛЕ ЗАБЕГА:');
  else if (T.kind === 'pick') pvCards(T.cards === 'aux' ? AUX_IDS.slice(0, 4) : T.cards, cx, by, bh, T.cards === 'aux' ? 'ОДНА ИЗ 8 СИСТЕМ НА ВЫБОР:' : 'ОДНА НА ВЫБОР:');
  else if (T.kind === 'super') pvSuper(T, cx, by, bh);
  else pvIcon(T, cx, by, bh);
  ctx.restore();
  // цена и состояние
  const why = Talents.cantBuy(T.id), max = T.cost.length;
  let msg, col;
  if (why === 'ИЗУЧЕНО') { msg = 'ИЗУЧЕНО'; col = '#58d854'; }
  else if (why === 'ЗАКРЫТО') { msg = tr('НУЖНО ВЛОЖИТЬ В ВЕТКУ') + ' ✪' + TAL_GATES[T.t]; col = '#f87878'; }
  else { msg = tr('ЦЕНА:') + ' ✪' + T.cost[l] + (max > 1 ? '  ' + tr('УР.') + ' ' + (l + 1) + '/' + max : ''); col = why ? '#f87878' : '#fcd820'; }
  text(msg, cx, py + ph - 26, col, 1, 'center');
  if (G.tal.warn > 0) text('СНАЧАЛА ВЕРНИТЕ ТАЛАНТЫ ВЫШЕ', cx, py + ph - 14, '#f87878', 1, 'center');
  else if (why === 'МАЛО МЕДАЛЕЙ') text('НЕ ХВАТАЕТ МЕДАЛЕЙ', cx, py + ph - 14, '#7c4040', 1, 'center');
  else if (l) text('СПЕЦ - ВЕРНУТЬ БЕСПЛАТНО', cx, py + ph - 14, '#545454', 1, 'center');
  else if (!why) text(blink(2) ? 'ОГОНЬ - ИЗУЧИТЬ' : '', cx, py + ph - 14, '#fcfcfc', 1, 'center');
}
const pvTank = (cls, x, y, size = 16, frameN = 0, dir = 0) =>
  ctx.drawImage(TankGfx.get(CLASSES[cls].shape, 'p' + (CLASS_LIST.indexOf(cls) + 1))[frameN][dir], Math.round(x), Math.round(y), size, size);
function pvStats(T, x, y, w, l) {
  const f = PV_STAT[T.id], max = T.cost.length, nl = Math.min(l, max - 1);
  text(tr(PV_STAT_NAME[T.id]) + (max > 1 ? ' (' + tr('УР.') + ' ' + (nl + 1) + ')' : ''), x + w / 2, y + 5, '#7c7c7c', 1, 'center');
  CLASS_LIST.forEach((cls, i) => {
    const C = CLASSES[cls], yy = y + 18 + i * 20, [a, b] = f(C, nl);
    pvTank(cls, x + 6, yy - 4, 16, Math.floor(G.time * 6) % 2);
    text(C.name, x + 26, yy, '#a8a8a8');
    const done = l > nl || l >= max;
    text(done ? String(b) : a + ' → ' + b, x + w - 6, yy, done ? '#58d854' : '#fcd820', 1, 'right');
  });
}
function pvClass(T, cx, y, h) {
  const t = G.time % 1.6, my = y + h / 2 - 6, cls = T.cls;
  if (cls === 'heavy') {
    const r = (T.id === 'shWide' ? 26 : 16) + Math.sin(G.time * 20);
    pvTank(cls, cx - 8, my - 8, 16, Math.floor(G.time * 6) % 2);
    if (t < 1.1) { circle(ctx, cx, my, r, '#a4e4fc', 1); circle(ctx, cx, my, r - 2, '#3c78f8', 2); }
    if (T.id === 'shWave' && t < 0.4) circle(ctx, cx, my, 10 + t * 80, '#fcfcfc', 1);
    if (T.id === 'fort') { rect(ctx, cx + 22, my - 8, 4, 4, '#3cbcfc'); rect(ctx, cx + 22, my - 2, 4, 4, t < 1.1 ? '#202020' : '#3cbcfc'); }
    if (T.id === 'shWide') { pvTank('scout', cx + 12, my - 4, 8); pvTank('assault', cx - 20, my - 4, 8); }
    if (T.id === 'shDmg' || T.id === 'shDur' || T.id === 'shCd') { const k = (G.time * 0.9) % 1, bx = cx + 60 - k * 120; if (bx > cx + r) rect(ctx, bx, my - 1, 3, 3, '#fc9c80'); else rect(ctx, cx + r + (cx + r - bx), my - 1, 3, 3, T.id === 'shDmg' ? '#fcd820' : '#fcfcfc'); }
  } else if (cls === 'assault') {
    pvTank(cls, cx - 8, my - 8, 16, Math.floor(G.time * 6) % 2);
    const n = T.id === 'vlMore' ? 20 : 16, waves = T.id === 'vlDouble' ? [0, 0.3] : [0];
    for (const w0 of waves) {
      const k = t - w0;
      if (k < 0 || k > 0.9) continue;
      for (let i = 0; i < n; i++) {
        let a = i / n * Math.PI * 2 + (w0 ? Math.PI / n : 0);
        if (T.id === 'vlHome') a += Math.sin(a * 3) * k * 0.6;
        const d = 10 + k * 70;
        rect(ctx, cx + Math.cos(a) * d - 1, my + Math.sin(a) * d - 1, 2, 2, T.id === 'vlDrill' ? '#d8d8ec' : '#fcd820');
      }
    }
    if (T.id === 'vlDrill') { for (let i = 0; i < 4; i++) rect(ctx, cx + 30, my - 16 + i * 8, 8, 7, '#a0401c'); }
  } else {
    const k = t / 1.6, x = cx - 70 + k * 140 * (T.id === 'dsLong' ? 1 : 0.8);
    for (let i = 1; i < 6; i++) { ctx.globalAlpha = 0.5 - i * 0.08; pvTank(cls, x - i * 6 - 8, my - 8, 16, 0, 1); }
    ctx.globalAlpha = 1;
    pvTank(cls, x - 8, my - 8, 16, Math.floor(G.time * 10) % 2, 1);
    if (T.id === 'dsZap' && Math.floor(G.time * 12) % 2) { pline(ctx, x, my, x + 10, my - 16, '#e8fcff', 1); pline(ctx, x, my, x - 6, my + 16, '#3c78f8', 1); }
    if (T.id === 'dsBreak') for (let i = 0; i < 3; i++) if (x < cx + 10) rect(ctx, cx + 10, my - 12 + i * 8, 8, 7, '#7c7c7c');
    if (T.id === 'dsBuff') text('×2', x, my - 20, '#fcd820', 1, 'center');
    if (T.id === 'dsTwo') { rect(ctx, cx - 6, my + 14, 4, 4, '#3cbcfc'); rect(ctx, cx + 2, my + 14, 4, 4, k > 0.5 ? '#3cbcfc' : '#202020'); }
  }
  if (T.pv) text(T.pv, cx, y + h - 11, '#fcd820', 1, 'center');
}
// мини-карта как на экране улучшений
function pvCard(id, x, y, w, h) {
  const pk = PERKS[id], s = cardStyle(pk), maxc = Math.floor((w - 4) / 6);
  rect(ctx, x, y, w, h, '#000'); frame(x, y, w, h, s.b); frame(x + 2, y + 2, w - 4, h - 4, s.i);
  text(pk.icon, x + w / 2, y + 6, s.icon, textWidth(pk.icon, 2) > w - 6 ? 1 : 2, 'center');
  wrap(pk.name, maxc).slice(0, 3).forEach((l, k) => text(l, x + w / 2, y + 24 + k * 8, '#fcfcfc', 1, 'center'));
}
// строка-карта: рамка со значком и название справа
function pvRow(id, x, y, dim) {
  const pk = PERKS[id], s = cardStyle(pk);
  rect(ctx, x, y, 26, 14, '#000'); frame(x, y, 26, 14, dim ? '#3c105c' : s.b);
  if (!dim) text(pk.icon, x + 13, y + 4, s.icon, 1, 'center');
  text(pk.name, x + 31, y + 4, dim ? '#3c105c' : '#fcfcfc');
}
function pvCards(ids, cx, y, h, title) {
  text(title, cx, y + 5, '#7c7c7c', 1, 'center');
  if (ids.length > 1) { ids.forEach((id, i) => pvRow(id, cx - 82, y + 18 + i * 18)); return; }
  const ch = Math.min(h - 40, 64);
  pvCard(ids[0], cx - 40, y + 16, 80, ch);
  wrap(PERKS[ids[0]].desc, 26).slice(0, 2).forEach((l, k) => text(l, cx, y + 20 + ch + k * 9, '#7c7c7c', 1, 'center'));
}
function pvSuper(T, cx, y, h) {
  const [a, b] = PERKS[T.perk].parts, x = cx - 82;
  text('НУЖНЫ ДВЕ ЛЕГЕНДАРКИ:', cx, y + 5, '#7c7c7c', 1, 'center');
  pvRow(a, x, y + 16);
  text('+', x + 13, y + 33, '#fcfcfc', 1, 'center');
  pvRow(b, x, y + 42);
  text('=', x + 13, y + 59, '#fcfcfc', 1, 'center');
  pvRow(T.perk, x, y + 68, !(blink(2) || Talents.lv(T.id)));
  wrap('КАРТА ВЫПАДЕТ, КОГДА СОБРАНЫ ОБЕ', 26).forEach((l, k) => text(l, cx, y + 88 + k * 9, '#9c3cd8', 1, 'center'));
}
function pvIcon(T, cx, y, h) {
  const my = y + h / 2 - 14;
  drawTalIcon(T, cx, my, TAL_STYLE[T.kind].c, 3);
  if (T.pv) text(T.pv, cx, y + h - 11, '#fcd820', 1, 'center');
}

// ---------- мышь: наведение показывает превью, клик — изучить, правый клик — вернуть ----------
function talAt(e) {
  const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height;
  return TAL_LIST.find(id => { const q = talRect(id); return x >= q.x - 2 && x < q.x + q.w + 2 && y >= q.y - 2 && y < q.y + q.h + 2; });
}
canvas.addEventListener('mousemove', e => {
  if (G.state !== 'talents') return;
  const id = talAt(e);
  if (id && id !== G.tal.sel) G.tal.sel = id;
});
canvas.addEventListener('mousedown', e => {
  if (G.state !== 'talents') return;
  const id = talAt(e);
  if (!id) return;
  G.tal.sel = id;
  if (e.button === 0) talBuy(id); else if (e.button === 2) talRefund(id);
});
canvas.addEventListener('contextmenu', e => { if (G.state === 'talents') e.preventDefault(); });
