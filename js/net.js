'use strict';
// ============================================================
//  NET: онлайн-кооп через WebRTC.
//  Хост ведёт игру как обычно и шлёт каждому гостю команды рисования
//  своего экрана (remote.js) — гость повторяет их, картинка чёткая, без
//  видео; звук идёт аудиопотоком. Гость присылает только свои кнопки —
//  у хоста они нажимают коды NetI* (см. DEVICES в core.js), поэтому
//  гость входит в лобби и играет как ещё одно устройство. При подключении
//  гость присылает свои таланты (его танк играет с ними), а хост шлёт ему
//  медали за каждый пройденный сектор — они копятся на устройстве гостя.
//
//  Каналы: 'in' и 'scr' — надёжные (служебное и картинки-снимки), 'key' и
//  'frm' — без повторов: кнопки гостя каждый шаг и кадры экрана. Потерянное
//  не пересылается — следом уже идёт свежее, и ничто не ждёт старого пакета.
//
//  Знакомство (обмен описаниями соединения) идёт через ntfy.sh (порт 443,
//  проходит и через мобильные сети) и публичные MQTT-серверы — сразу через
//  несколько, у разных компаний: хватит, чтобы оба устройства достучались
//  хотя бы до одного. Дальше связь
//  напрямую, серверы больше не нужны.
// ============================================================

const NET_TOPIC = 'tanks8bit-rogue/v1/';
const NET_NTFY = 'https://ntfy.sh/';
const NET_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
  'wss://mqtt.eclipseprojects.io:443/mqtt',
];
const NET_QR_LIB = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
// STUN — узнать свой внешний адрес, чтобы соединиться напрямую.
// TURN (ретранслятор на случай, когда напрямую не пробиться) добавляется в NET_TURN
const NET_TURN = [{
  urls: ['turn:free.expressturn.com:3478?transport=udp', 'turn:free.expressturn.com:3478?transport=tcp'],
  username: '000000002109079815',
  credential: '1etaRCRz9uL6cFYHPiZQQER5bU4=',
}];
const NET_ICE = { iceServers: [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:3478'] },
  ...NET_TURN,
] };
// какие пути соединения нашлись: host — локальная сеть, srflx — через интернет напрямую, relay — через ретранслятор
const candType = c => { const m = / typ (\w+)/.exec(c || ''); return m ? m[1] : null; };
const sdpTypes = sdp => (sdp.match(/a=candidate:[^\r\n]*/g) || []).map(candType).filter(Boolean);
// адреса соединения шлём по одному, как только нашлись (Safari собирает их долго);
// пришедшие раньше описания соединения копим и добавляем потом
function iceTrickle(pc, send, seen) {
  pc.onicecandidate = e => { if (e.candidate && e.candidate.candidate) { seen.loc.add(candType(e.candidate.candidate)); send(e.candidate.toJSON()); } };
}
function iceAdd(pc, c, queue, seen) {
  seen.rem.add(candType(c.candidate));
  if (!pc || !pc.remoteDescription) { queue.push(c); return; }
  pc.addIceCandidate(c).catch(() => {});
}
function iceFlush(pc, queue) { for (const c of queue.splice(0)) pc.addIceCandidate(c).catch(() => {}); }
// гость: показывать кадр сразу, не копить запас на случай рывков сети
function lowDelay(r) {
  try { if ('jitterBufferTarget' in r) r.jitterBufferTarget = 0; } catch (e) { /* не поддерживается */ }
  try { r.playoutDelayHint = 0; } catch (e) { /* не поддерживается */ }
}
const iceList = set => [...set].filter(Boolean).join(',') || '-';
const NET_KEYS = ['Up', 'Down', 'Left', 'Right', 'A', 'B', 'Start'];
const NET_START = ['Escape', 'KeyP', 'TouchStart', ...PAD_STARTS];
const netId = () => Math.random().toString(36).slice(2, 10);
const NET_LOSSY = { ordered: false, maxRetransmits: 0 };

// ---------- крошечный MQTT 3.1.1 поверх WebSocket (только QoS 0) ----------
class Mqtt {
  constructor(url, onMsg) {
    this.url = url; this.onMsg = onMsg; this.ok = false; this.wait = 3000; this.dead = false; this.subs = new Set(); this.buf = new Uint8Array(0);
    this.open();
  }
  open() {
    if (this.dead) return;
    let ws;
    try { ws = this.ws = new WebSocket(this.url, 'mqtt'); } catch (e) { return this.retry(); }
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      const id = 'tk' + netId();
      this.send(0x10, [...this.str('MQTT'), 4, 0x02, 0, 30, ...this.str(id)]); // CONNECT, чистая сессия, keepalive 30 с
    };
    ws.onmessage = e => this.feed(new Uint8Array(e.data));
    ws.onclose = () => { this.ok = false; clearInterval(this.ping); this.retry(); };
    ws.onerror = () => {};
  }
  retry() { if (!this.dead) { setTimeout(() => this.open(), this.wait); this.wait = Math.min(30000, this.wait * 2); } } // недоступный сервер дёргаем всё реже
  close() { this.dead = true; clearInterval(this.ping); try { this.ws.close(); } catch (e) { /* уже закрыт */ } }
  str(s) { const b = new TextEncoder().encode(s); return [b.length >> 8, b.length & 255, ...b]; }
  send(head, body) {
    const len = []; let n = body.length;
    do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; len.push(d); } while (n > 0);
    try { this.ws.send(new Uint8Array([head, ...len, ...body])); } catch (e) { /* соединение закрылось */ }
  }
  sub(topic) { this.subs.add(topic); if (this.ok) this.send(0x82, [0, 1, ...this.str(topic), 0]); }
  pub(topic, text) { if (this.ok) this.send(0x30, [...this.str(topic), ...new TextEncoder().encode(text)]); }
  feed(chunk) {
    const b = new Uint8Array(this.buf.length + chunk.length); b.set(this.buf); b.set(chunk, this.buf.length);
    let p = 0;
    for (;;) {
      if (b.length - p < 2) break;
      let len = 0, mul = 1, i = p + 1, d;
      do { if (i >= b.length) { i = -1; break; } d = b[i++]; len += (d & 127) * mul; mul *= 128; } while (d & 128);
      if (i < 0 || i + len > b.length) break;
      this.packet(b[p], b.subarray(i, i + len));
      p = i + len;
    }
    this.buf = b.slice(p);
  }
  packet(head, body) {
    const type = head >> 4;
    if (type === 2) { // CONNACK
      if (body[1] !== 0) return;
      this.ok = true; this.wait = 3000;
      for (const t of this.subs) this.send(0x82, [0, 1, ...this.str(t), 0]);
      this.ping = setInterval(() => this.send(0xC0, []), 20000);
    } else if (type === 3) { // PUBLISH
      const tl = (body[0] << 8) | body[1], qos = (head >> 1) & 3;
      const topic = new TextDecoder().decode(body.subarray(2, 2 + tl));
      const msg = new TextDecoder().decode(body.subarray(2 + tl + (qos ? 2 : 0)));
      this.onMsg(topic, msg);
    }
  }
}
// ntfy.sh — тоже почтовый ящик, но на обычном порту 443 (HTTPS): его не режут мобильные сети,
// в отличие от портов 8084/8884/8081 у MQTT-серверов. Приём — WebSocket, отправка — POST.
// Сообщение больше NTFY_PART режем на куски «~id~k~n~кусок» (у ntfy предел ~4 КБ)
const NTFY_PART = 3500;
class Ntfy {
  constructor(url, onMsg) { this.url = url; this.onMsg = onMsg; this.ok = false; this.wait = 3000; this.dead = false; this.subs = new Map(); this.parts = new Map(); }
  name(topic) { return topic.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 64); }
  sub(topic) { if (!this.subs.has(topic)) this.open(topic); }
  open(topic) {
    if (this.dead) return;
    let ws;
    try { ws = new WebSocket(this.url.replace(/^http/, 'ws') + this.name(topic) + '/ws'); } catch (e) { return; }
    this.subs.set(topic, ws);
    ws.onopen = () => { this.ok = true; this.wait = 3000; };
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (er) { return; } if (m.event === 'message' && m.message) this.got(topic, m.message); };
    ws.onclose = () => {
      this.ok = [...this.subs.values()].some(w => w !== ws && w.readyState === 1);
      if (!this.dead) { setTimeout(() => this.open(topic), this.wait); this.wait = Math.min(30000, this.wait * 2); }
    };
  }
  got(topic, s) {
    const k = /^~(\w+)~(\d+)~(\d+)~/.exec(s);
    if (!k) { this.onMsg(topic, s); return; }
    let P = this.parts.get(k[1]);
    if (!P) { P = []; this.parts.set(k[1], P); setTimeout(() => this.parts.delete(k[1]), 30000); }
    P[+k[2]] = s.slice(k[0].length);
    if (P.filter(x => x != null).length === +k[3]) { this.parts.delete(k[1]); this.onMsg(topic, P.join('')); }
  }
  pub(topic, text) {
    const url = this.url + this.name(topic), post = body => fetch(url, { method: 'POST', body }).catch(() => {});
    if (text.length <= NTFY_PART) { post(text); return; }
    const id = netId(), n = Math.ceil(text.length / NTFY_PART);
    for (let k = 0; k < n; k++) post('~' + id + '~' + k + '~' + n + '~' + text.slice(k * NTFY_PART, (k + 1) * NTFY_PART));
  }
  close() { this.dead = true; for (const ws of this.subs.values()) try { ws.close(); } catch (e) { /* уже закрыт */ } }
}
// все серверы сразу: шлём во все, повторы одного сообщения отбрасываем
class SignalBus {
  constructor(onMsg) {
    this.seen = new Set();
    const got = (t, m) => {
      let d; try { d = JSON.parse(m); } catch (e) { return; }
      if (!d || !d.i || this.seen.has(d.i)) return;
      this.seen.add(d.i);
      onMsg(t, d);
    };
    this.links = [new Ntfy(NET_NTFY, got), ...NET_BROKERS.map(u => new Mqtt(u, got))];
  }
  get count() { return this.links.filter(l => l.ok).length; }
  sub(topic) { for (const l of this.links) l.sub(topic); }
  pub(topic, d) { d.i = netId(); const s = JSON.stringify(d); for (const l of this.links) l.pub(topic, s); }
  close() { for (const l of this.links) l.close(); }
}
// ждём немного, пока соберутся адреса соединения
function iceDone(pc, ms) {
  return new Promise(ok => {
    if (pc.iceGatheringState === 'complete') return ok();
    const t = setTimeout(ok, ms);
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); ok(); } });
  });
}

const Net = {
  role: null, bus: null, code: '', status: '', failed: false, startT: 0,
  guests: [],           // хост: место гостя (0..4) -> { gid, pc, dc }
  audio: null, qr: null,
  pc: null, dc: null, gid: '', sound: null, info: null, statT: 0, bits: -1, kseq: 0, key: null, sendT: 0, waitT: 0, joinT: 0, slot: -1, offerT: 0, // гость

  get open() { return !!(this.bus && this.bus.count); },
  hosting() { return this.role === 'host' && this.open; },
  guestCount() { return this.guests.filter(g => g && g.live).length; },
  guestName(i) { return tr('ОНЛАЙН') + ' ' + (i + 1); },
  topic(s) { return NET_TOPIC + this.code + '/' + s; },

  loadQr() {
    if (window.qrcode) return Promise.resolve();
    return new Promise((ok, fail) => { const s = document.createElement('script'); s.src = NET_QR_LIB; s.onload = ok; s.onerror = fail; document.head.appendChild(s); });
  },
  newCode() {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // без I и O, чтобы не путать с 1 и 0
    let c = ''; for (let i = 0; i < 4; i++) c += A[Math.floor(Math.random() * A.length)];
    return c;
  },

  // ---------------- хост ----------------
  host() {
    if (this.role === 'host') return; // комната живёт до перезагрузки страницы
    this.role = 'host'; this.code = this.newCode(); this.startT = performance.now();
    Sound.unlock();
    this.bus = new SignalBus((t, d) => this.onHostMsg(d));
    this.bus.sub(this.topic('host'));
    this.loadQr().then(() => this.makeQr(), () => {});
  },
  get hostStatus() {
    if (this.role !== 'host' || this.open) return '';
    return performance.now() - this.startT > 8000 ? 'НЕТ СВЯЗИ С СЕРВЕРАМИ' : 'СОЗДАЁМ КОМНАТУ...';
  },
  onHostMsg(d) {
    if (d.t === 'join' && d.g) {
      if (this.guests.some(g => g && g.gid === d.g)) return; // повтор запроса — уже отвечаем
      let slot = -1;
      for (let k = 0; k < MAX_GUESTS; k++) if (!this.guests[k]) { slot = k; break; }
      if (slot < 0) { this.bus.pub(this.topic('g/' + d.g), { t: 'full' }); return; }
      this.offer(slot, d.g);
    } else if (d.t === 'answer' && d.g) {
      const g = this.guests.find(x => x && x.gid === d.g);
      if (g && !g.answered) {
        g.answered = true;
        for (const t of sdpTypes(d.sdp.sdp)) g.seen.rem.add(t);
        g.pc.setRemoteDescription(d.sdp).then(() => iceFlush(g.pc, g.queue)).catch(() => this.dropGuest(g));
      }
    } else if (d.t === 'cand' && d.g) {
      const g = this.guests.find(x => x && x.gid === d.g);
      if (g) iceAdd(g.pc, d.c, g.queue, g.seen);
    }
  },
  async offer(slot, gid) {
    const pc = new RTCPeerConnection(NET_ICE);
    const g = this.guests[slot] = { gid, pc, dc: null, slot, inSeq: 0, live: false, answered: false, queue: [], seen: { loc: new Set(), rem: new Set() } };
    iceTrickle(pc, c => this.bus.pub(this.topic('g/' + gid), { t: 'cand', c }), g.seen);
    const au = this.getAudio();
    if (au) for (const t of au.getTracks()) pc.addTrack(t, au);
    const dc = g.dc = pc.createDataChannel('in');
    const key = pc.createDataChannel('key', NET_LOSSY); // кнопки гостя каждый шаг: [биты, номер u32]
    key.binaryType = 'arraybuffer';
    key.onmessage = e => { if (e.data.byteLength >= 5) { const v = new DataView(e.data); this.applyBits(slot, v.getUint8(0), v.getUint32(1, true)); } };
    const scr = pc.createDataChannel('scr'); // экран: снимки картинок и команды на скрытых холстах
    scr.binaryType = 'arraybuffer';
    scr.onopen = () => { g.scr = scr; Remote.add(g); };
    const frm = pc.createDataChannel('frm', NET_LOSSY); // экран: кадры
    frm.binaryType = 'arraybuffer';
    frm.onopen = () => { g.frm = frm; };
    dc.onopen = () => { g.live = true; dc.send(JSON.stringify({ t: 'hi', slot })); Sound.play('pickup'); };
    dc.onmessage = e => { let d; try { d = JSON.parse(e.data); } catch (er) { return; } if (d.t === 'in') this.applyBits(slot, d.b | 0, d.s); else if (d.t === 'tal') g.lv = cleanLv(d.lv); };
    dc.onclose = () => this.dropGuest(g);
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.dropGuest(g); };
    setTimeout(() => { if (!g.live) this.dropGuest(g); }, 30000); // гость так и не подключился — освобождаем место
    try {
      await pc.setLocalDescription(await pc.createOffer());
      await iceDone(pc, 1000); // что собралось за секунду — сразу в описании, остальное догонит по одному
      this.bus.pub(this.topic('g/' + gid), { t: 'offer', sdp: { type: 'offer', sdp: pc.localDescription.sdp } });
    } catch (e) { this.dropGuest(g); }
  },
  // s — номер шага гостя: опоздавший пакет (старее уже применённого) отбрасываем
  applyBits(slot, b, s) {
    const g = this.guests[slot];
    if (g && s != null) { if (s <= g.inSeq) return; g.inSeq = s; }
    NET_KEYS.forEach((k, i) => {
      const code = 'Net' + slot + k;
      if (b & (1 << i)) Input.press(code); else if (Input.down[code]) Input.release(code);
    });
  },
  guestLv(slot) { const g = this.guests[slot]; return (g && g.lv) || {}; },
  // медали за сектор — гостям, чьи танки в забеге
  sendMedals(n) {
    if (this.role !== 'host') return;
    for (const p of G.players) {
      const g = p.ctrl.net != null && this.guests[p.ctrl.net];
      if (g && g.live) try { g.dc.send(JSON.stringify({ t: 'medals', n })); } catch (e) { /* канал закрылся */ }
    }
  },
  dropGuest(g) {
    if (this.guests[g.slot] !== g) return;
    this.guests[g.slot] = null;
    this.applyBits(g.slot, 0);
    try { g.pc.close(); } catch (e) { /* уже закрыт */ }
    if (g.live) { lobbyDrop(DEVICES.findIndex(d => d.net === g.slot)); Sound.play('deny'); }
  },
  // звук игры — гостям аудиопотоком
  getAudio() {
    if (this.audio !== null) return this.audio;
    this.audio = false;
    try {
      Sound.unlock();
      if (Sound.ac && Sound.ac.createMediaStreamDestination) {
        const dst = Sound.ac.createMediaStreamDestination();
        Sound.master.connect(dst);
        this.audio = dst.stream;
      }
    } catch (e) { /* без звука у гостей */ }
    return this.audio;
  },
  afterRender() {
    if (this.role === 'host') Remote.frame(this.guests);
  },
  // QR со ссылкой на эту же страницу с ?join=КОД (только если страница открыта не с этого компьютера)
  makeQr() {
    if (this.qr || !window.qrcode || !/^https?:$/.test(location.protocol) || /^(localhost|127\.|\[::1\])/.test(location.hostname)) return;
    try {
      const q = qrcode(0, 'L');
      q.addData(location.origin + location.pathname + '?join=' + this.code); q.make();
      const n = q.getModuleCount(), c = mk(n, n), g = c.getContext('2d');
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) rect(g, x, y, 1, 1, '#000');
      this.qr = c;
    } catch (e) { /* без QR, остаётся код */ }
  },
  qrCanvas() { return this.qr; },

  // ---------------- гость ----------------
  askJoin() {
    let code = null;
    try { code = prompt(tr('КОД КОМНАТЫ (4 БУКВЫ):'), ''); } catch (e) { /* нет prompt */ }
    for (const k in Input.down) Input.down[k] = false; // пока окно было открыто, отпускания клавиш потерялись
    if (code && code.trim()) this.join(code);
  },
  join(code) {
    // код могли набрать на русской раскладке: похожие кириллические буквы -> латиница
    const LAT = { А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', У: 'Y', Х: 'X' };
    this.role = 'guest'; this.code = String(code).toUpperCase().replace(/[А-ЯЁ]/g, ch => LAT[ch] || ch).replace(/[^A-Z0-9]/g, '').slice(0, 8);
    this.status = 'ПОДКЛЮЧЕНИЕ...'; this.failed = false; this.waitT = 0; this.joinT = 0; this.bits = -1; this.offerT = 0;
    G.state = 'net'; Music.stop();
    if (this.code.length !== 4) { this.fail('КОД - 4 ЛАТИНСКИЕ БУКВЫ'); return; }
    this.gid = netId(); this.iceQueue = []; this.seen = { loc: new Set(), rem: new Set() };
    this.bus = new SignalBus((t, d) => this.onGuestMsg(d));
    this.bus.sub(this.topic('g/' + this.gid));
  },
  async onGuestMsg(d) {
    if (this.failed) return;
    if (d.t === 'full') return this.fail('КОМНАТА ЗАПОЛНЕНА');
    if (d.t === 'cand') return iceAdd(this.pc, d.c, this.iceQueue, this.seen);
    if (d.t !== 'offer' || this.pc) return;
    this.status = 'СОЕДИНЯЕМСЯ С ХОСТОМ...'; this.offerT = this.waitT;
    const pc = this.pc = new RTCPeerConnection(NET_ICE);
    for (const t of sdpTypes(d.sdp.sdp)) this.seen.rem.add(t);
    iceTrickle(pc, c => this.bus.pub(this.topic('host'), { t: 'cand', g: this.gid, c }), this.seen);
    pc.ontrack = e => {
      lowDelay(e.receiver);
      if (e.track.kind === 'audio') this.playSound(new MediaStream([e.track]));
    };
    pc.ondatachannel = e => {
      if (e.channel.label === 'scr') { Play.listen(e.channel); return; }
      if (e.channel.label === 'frm') { Play.listenFrames(e.channel); return; }
      if (e.channel.label === 'key') { this.key = e.channel; return; }
      const dc = this.dc = e.channel;
      dc.onmessage = m => {
        let x; try { x = JSON.parse(m.data); } catch (er) { return; }
        if (x.t === 'hi') { this.slot = x.slot; try { dc.send(JSON.stringify({ t: 'tal', lv: Talents.data.lv })); } catch (er) { /* канал закрылся */ } }
        else if (x.t === 'medals' && x.n > 0) Talents.add(Math.min(x.n | 0, 20));
      };
      dc.onclose = () => this.fail('СВЯЗЬ С ХОСТОМ ПОТЕРЯНА');
    };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') this.failIce(); };
    try {
      await pc.setRemoteDescription(d.sdp);
      iceFlush(pc, this.iceQueue);
      await pc.setLocalDescription(await pc.createAnswer());
      await iceDone(pc, 1000);
      this.bus.pub(this.topic('host'), { t: 'answer', g: this.gid, sdp: { type: 'answer', sdp: pc.localDescription.sdp } });
    } catch (e) { this.fail(tr('ОШИБКА СЕТИ') + ' (' + (e.name || 'webrtc') + ')'); }
  },
  // не соединились напрямую: показываем, какие пути нашлись, — по ним видно, в чём дело
  async failIce() {
    if (this.failed || !this.pc) return;
    const pc = this.pc;
    this.diag = 'ICE ' + pc.iceConnectionState + ' | МОИ: ' + iceList(this.seen.loc) + ' | ХОСТА: ' + iceList(this.seen.rem);
    this.fail('НЕ УДАЛОСЬ СОЕДИНИТЬСЯ С ХОСТОМ');
  },
  fail(msg) {
    if (this.failed) return;
    this.failed = true; this.status = msg;
    Play.reset();
    if (this.sound) this.sound.pause();
    if (this.info) this.info.style.display = 'none';
    if (this.pc) try { this.pc.close(); } catch (e) { /* уже закрыт */ }
    if (this.bus) this.bus.close();
  },
  playSound(st) {
    let v = this.sound;
    if (!v) {
      v = this.sound = document.createElement('audio');
      v.autoplay = true; v.muted = true; // без жеста браузер не даст играть со звуком
      document.body.appendChild(v);
      // iOS включает звук только из касания (по его окончании) — пробуем на каждом, пока не заиграет
      const kick = () => {
        if (!v.paused && !v.muted) return;
        v.muted = false;
        v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
      };
      for (const t of ['touchend', 'click', 'keydown']) addEventListener(t, kick, { capture: true });
    }
    v.srcObject = st;
    v.play().catch(() => {});
  },
  updateGuest(dt) {
    this.waitT += dt;
    if (this.failed) {
      if (anyCtrl('fire') || Input.hit(KEYS_BACK)) location.href = location.pathname; // назад в меню, без ?join
      return;
    }
    if (!this.bus) return;
    if (!Remote.ok) { this.fail('БРАУЗЕР УСТАРЕЛ - ОБНОВИТЕ ЕГО'); return; }
    if (!this.pc) {
      // стучимся в комнату, пока хост не ответит
      const n = this.bus.count;
      if (!n) { this.status = 'ПОДКЛЮЧЕНИЕ...'; if (this.waitT > 10) this.fail('НЕТ СВЯЗИ С СЕРВЕРАМИ'); return; }
      this.status = tr('ИЩЕМ КОМНАТУ...') + ' (' + n + '/' + (NET_BROKERS.length + 1) + ')';
      this.joinT -= dt;
      if (this.joinT <= 0) { this.joinT = 2; this.bus.pub(this.topic('host'), { t: 'join', g: this.gid }); }
      if (this.waitT > 20) this.fail('КОМНАТА НЕ НАЙДЕНА');
      return;
    }
    const linked = this.pc.connectionState === 'connected' || this.pc.iceConnectionState === 'connected' || this.pc.iceConnectionState === 'completed';
    if (!linked) {
      this.status = 'СОЕДИНЯЕМСЯ С ХОСТОМ...';
      if (this.waitT - this.offerT > 25) this.failIce();
      return;
    }
    this.status = Play.frame ? '' : 'ЖДЁМ КАРТИНКУ...';
    this.statT -= dt;
    if (this.statT <= 0) { this.statT = 1; this.showStats(); }
    if (!this.dc || this.dc.readyState !== 'open') return;
    // направление — одно, как его выберет хост (последнее нажатое): так же его предсказывает Pred
    const C = ALL_CTRL, dir = ctrlDir(C), keys = [C.fire, C.special, NET_START];
    let b = dir >= 0 ? 1 << [0, 3, 1, 2][dir] : 0; // биты NET_KEYS: Up, Down, Left, Right
    keys.forEach((k, i) => { if (Input.any(k)) b |= 1 << (i + 4); });
    const s = ++this.kseq;
    Pred.step(s, dir, dt);
    if (this.key && this.key.readyState === 'open') {
      const u = new Uint8Array(5), v = new DataView(u.buffer); v.setUint8(0, b); v.setUint32(1, s, true);
      try { this.key.send(u); } catch (e) { /* канал закрылся */ }
    }
    // запасной путь — надёжный канал, при смене кнопок и раз в 0.25 с
    this.sendT -= dt;
    if (b !== this.bits || this.sendT <= 0) { this.bits = b; this.sendT = 0.25; try { this.dc.send(JSON.stringify({ t: 'in', b, s })); } catch (e) { /* канал закрылся */ } }
  },
  // в углу: как соединены (напрямую или через TURN), пинг, кадров в секунду и трафик
  async showStats() {
    let r; try { r = await this.pc.getStats(); } catch (e) { return; }
    let pair = null;
    r.forEach(x => { if (x.type === 'transport' && x.selectedCandidatePairId) pair = r.get(x.selectedCandidatePairId); });
    if (!pair) r.forEach(x => { if (x.type === 'candidate-pair' && x.nominated && x.state === 'succeeded') pair = x; });
    const loc = pair && r.get(pair.localCandidateId), rem = pair && r.get(pair.remoteCandidateId);
    const relay = (loc && loc.candidateType === 'relay') || (rem && rem.candidateType === 'relay');
    let s = pair ? (relay ? 'ЧЕРЕЗ TURN' : 'НАПРЯМУЮ') : '';
    if (pair && pair.currentRoundTripTime != null) s += ' · ПИНГ ' + Math.round(pair.currentRoundTripTime * 1000) + ' МС';
    const now = performance.now(), sec = Math.max(0.2, (now - (this.statAt || now - 1000)) / 1000);
    this.statAt = now;
    if (pair) s += ' · ' + Math.round(Play.frames / sec) + ' К/С · ' + Math.round(Play.bytes / sec / 1024) + ' КБ/С';
    Play.frames = 0; Play.bytes = 0;
    let el = this.info;
    if (!el) {
      el = this.info = document.createElement('div');
      Object.assign(el.style, { position: 'fixed', left: '4px', top: '4px', zIndex: 6, pointerEvents: 'none',
        font: '11px monospace', color: '#fcfcfc', background: 'rgba(0,0,0,.55)', padding: '1px 4px' });
      document.body.appendChild(el);
    }
    el.textContent = s; el.style.display = s ? 'block' : 'none';
  },
  drawGuest() {
    if (!this.failed && Play.draw()) return;
    text('ОНЛАЙН', W / 2, 60, '#fcd820', 3, 'center', '#7c4000');
    text(tr('КОМНАТА') + ' ' + this.code, W / 2, 100, '#3cbcfc', 1, 'center');
    text(this.status, W / 2, 120, this.failed ? '#f83800' : (blink(2) ? '#fcfcfc' : '#7c7c7c'), 1, 'center');
    if (this.diag) text(this.diag, W / 2, 132, '#7c7c7c', 1, 'center');
    if (this.failed) text('ОГОНЬ - В МЕНЮ', W / 2, 150, '#7c7c7c', 1, 'center');
    else text('ИГРАЕТЕ НА СВОЁМ УСТРОЙСТВЕ, КАРТИНКА - С ЭКРАНА ХОСТА', W / 2, 150, '#545454', 1, 'center');
  },
};

// ссылка из QR-кода: ?join=КОД — сразу подключаемся
addEventListener('load', () => {
  const code = new URLSearchParams(location.search).get('join');
  if (code) Net.join(code);
});
