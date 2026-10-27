'use strict';
// ============================================================
//  NET: онлайн-кооп через WebRTC.
//  Хост ведёт игру как обычно и транслирует картинку со звуком
//  каждому гостю видеопотоком. Гость присылает только свои кнопки —
//  у хоста они нажимают коды NetI* (см. DEVICES в core.js), поэтому
//  гость входит в лобби и играет как ещё одно устройство.
//
//  Знакомство (обмен описаниями соединения) идёт через публичные
//  MQTT-серверы — сразу через несколько, у разных компаний: хватит,
//  чтобы оба устройства достучались хотя бы до одного. Дальше связь
//  напрямую, серверы больше не нужны.
// ============================================================

const NET_TOPIC = 'tanks8bit-rogue/v1/';
const NET_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
  'wss://mqtt.eclipseprojects.io:443/mqtt',
];
const NET_QR_LIB = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
// STUN — узнать свой внешний адрес; TURN — ретранслятор, если напрямую не пробиться (мобильный интернет, строгий NAT)
const NET_ICE = { iceServers: [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:3478'] },
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'],
    username: 'openrelayproject', credential: 'openrelayproject' },
] };
const NET_KEYS = ['Up', 'Down', 'Left', 'Right', 'A', 'B', 'Start'];
const NET_START = ['Escape', 'KeyP', 'TouchStart', ...PAD_STARTS];
const netId = () => Math.random().toString(36).slice(2, 10);

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
// все серверы сразу: шлём во все, повторы одного сообщения отбрасываем
class SignalBus {
  constructor(onMsg) {
    this.seen = new Set();
    this.links = NET_BROKERS.map(u => new Mqtt(u, (t, m) => {
      let d; try { d = JSON.parse(m); } catch (e) { return; }
      if (!d || !d.i || this.seen.has(d.i)) return;
      this.seen.add(d.i);
      onMsg(t, d);
    }));
  }
  get count() { return this.links.filter(l => l.ok).length; }
  sub(topic) { for (const l of this.links) l.sub(topic); }
  pub(topic, d) { d.i = netId(); const s = JSON.stringify(d); for (const l of this.links) l.pub(topic, s); }
  close() { for (const l of this.links) l.close(); }
}
// ждём, пока соберутся адреса соединения (без поэтапного обмена — так проще через почтовый ящик)
function iceDone(pc) {
  return new Promise(ok => {
    if (pc.iceGatheringState === 'complete') return ok();
    const t = setTimeout(ok, 3000);
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); ok(); } });
  });
}

const Net = {
  role: null, bus: null, code: '', status: '', failed: false, startT: 0,
  guests: [],           // хост: место гостя (0..4) -> { gid, pc, dc }
  stream: null, cap: null, capG: null, qr: null,
  pc: null, dc: null, gid: '', video: null, bits: -1, sendT: 0, waitT: 0, joinT: 0, slot: -1, offerT: 0, // гость

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
      if (g && !g.answered) { g.answered = true; g.pc.setRemoteDescription(d.sdp).then(() => this.tuneSenders(g.pc)).catch(() => this.dropGuest(g)); }
    }
  },
  async offer(slot, gid) {
    const pc = new RTCPeerConnection(NET_ICE);
    const g = this.guests[slot] = { gid, pc, dc: null, slot, live: false, answered: false };
    const st = this.getStream();
    for (const t of st.getTracks()) pc.addTrack(t, st);
    const dc = g.dc = pc.createDataChannel('in');
    dc.onopen = () => { g.live = true; dc.send(JSON.stringify({ t: 'hi', slot })); Sound.play('pickup'); };
    dc.onmessage = e => { let d; try { d = JSON.parse(e.data); } catch (er) { return; } if (d.t === 'in') this.applyBits(slot, d.b | 0); };
    dc.onclose = () => this.dropGuest(g);
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.dropGuest(g); };
    setTimeout(() => { if (!g.live) this.dropGuest(g); }, 30000); // гость так и не подключился — освобождаем место
    try {
      await pc.setLocalDescription(await pc.createOffer());
      await iceDone(pc);
      this.bus.pub(this.topic('g/' + gid), { t: 'offer', sdp: pc.localDescription.toJSON ? pc.localDescription.toJSON() : { type: 'offer', sdp: pc.localDescription.sdp } });
    } catch (e) { this.dropGuest(g); }
  },
  applyBits(slot, b) {
    NET_KEYS.forEach((k, i) => {
      const code = 'Net' + slot + k;
      if (b & (1 << i)) Input.press(code); else if (Input.down[code]) Input.release(code);
    });
  },
  dropGuest(g) {
    if (this.guests[g.slot] !== g) return;
    this.guests[g.slot] = null;
    this.applyBits(g.slot, 0);
    try { g.pc.close(); } catch (e) { /* уже закрыт */ }
    if (g.live) { lobbyDrop(DEVICES.findIndex(d => d.net === g.slot)); Sound.play('deny'); }
  },
  // пиксель-арт: лучше реже кадры, чем мыло — держим полное разрешение
  tuneSenders(pc) {
    for (const s of pc.getSenders()) {
      if (!s.track || s.track.kind !== 'video' || !s.getParameters) continue;
      try {
        const p = s.getParameters();
        p.degradationPreference = 'maintain-resolution';
        if (p.encodings && p.encodings[0]) p.encodings[0].maxBitrate = 3000000;
        s.setParameters(p).catch(() => {});
      } catch (e) { /* старый браузер */ }
    }
  },
  // видеопоток: картинка в 2 раза крупнее (пиксели не мылятся) и звук игры
  getStream() {
    if (this.stream) return this.stream;
    this.cap = mk(W * 2, H * 2); this.capG = this.cap.getContext('2d');
    this.capG.imageSmoothingEnabled = false;
    this.capG.drawImage(canvas, 0, 0, W * 2, H * 2);
    const s = this.cap.captureStream(60);
    for (const t of s.getVideoTracks()) try { t.contentHint = 'detail'; } catch (e) { /* не поддерживается */ }
    try {
      Sound.unlock();
      if (Sound.ac && Sound.ac.createMediaStreamDestination) {
        const dst = Sound.ac.createMediaStreamDestination();
        Sound.master.connect(dst);
        for (const t of dst.stream.getAudioTracks()) s.addTrack(t);
      }
    } catch (e) { /* без звука у гостей */ }
    return (this.stream = s);
  },
  afterRender() {
    if (this.role === 'host' && this.capG && this.guests.some(Boolean)) this.capG.drawImage(canvas, 0, 0, W * 2, H * 2);
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
    this.gid = netId();
    this.bus = new SignalBus((t, d) => this.onGuestMsg(d));
    this.bus.sub(this.topic('g/' + this.gid));
  },
  async onGuestMsg(d) {
    if (this.failed) return;
    if (d.t === 'full') return this.fail('КОМНАТА ЗАПОЛНЕНА');
    if (d.t !== 'offer' || this.pc) return;
    this.status = 'СОЕДИНЯЕМСЯ С ХОСТОМ...'; this.offerT = this.waitT;
    const pc = this.pc = new RTCPeerConnection(NET_ICE);
    pc.ontrack = e => this.showVideo(e.streams[0] || new MediaStream([e.track]));
    pc.ondatachannel = e => {
      const dc = this.dc = e.channel;
      dc.onmessage = m => { let x; try { x = JSON.parse(m.data); } catch (er) { return; } if (x.t === 'hi') this.slot = x.slot; };
      dc.onclose = () => this.fail('СВЯЗЬ С ХОСТОМ ПОТЕРЯНА');
    };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') this.fail('НЕ УДАЛОСЬ СОЕДИНИТЬСЯ С ХОСТОМ'); };
    try {
      await pc.setRemoteDescription(d.sdp);
      await pc.setLocalDescription(await pc.createAnswer());
      await iceDone(pc);
      this.bus.pub(this.topic('host'), { t: 'answer', g: this.gid, sdp: { type: 'answer', sdp: pc.localDescription.sdp } });
    } catch (e) { this.fail(tr('ОШИБКА СЕТИ') + ' (' + (e.name || 'webrtc') + ')'); }
  },
  fail(msg) {
    if (this.failed) return;
    this.failed = true; this.status = msg;
    if (this.video) this.video.style.display = 'none';
    if (this.pc) try { this.pc.close(); } catch (e) { /* уже закрыт */ }
    if (this.bus) this.bus.close();
  },
  showVideo(st) {
    let v = this.video;
    if (!v) {
      v = this.video = document.createElement('video');
      v.autoplay = true; v.playsInline = true; v.muted = true; // без жеста браузер не даст играть со звуком
      v.setAttribute('playsinline', '');
      Object.assign(v.style, { position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 5,
        background: '#000', imageRendering: 'pixelated', pointerEvents: 'none' });
      document.body.appendChild(v);
      const fit = () => { v.style.width = canvas.style.width; v.style.height = canvas.style.height; };
      addEventListener('resize', () => setTimeout(fit, 0)); fit();
      const unmute = () => { v.muted = false; v.play().catch(() => {}); };
      for (const t of ['pointerdown', 'keydown', 'touchend']) addEventListener(t, unmute, { once: true, capture: true });
    }
    if (v.srcObject !== st) v.srcObject = st;
    v.style.display = 'block';
    v.play().catch(() => {});
    this.status = '';
  },
  updateGuest(dt) {
    this.waitT += dt;
    if (this.failed) {
      if (anyCtrl('fire') || Input.hit(KEYS_BACK)) location.href = location.pathname; // назад в меню, без ?join
      return;
    }
    if (!this.pc) {
      // стучимся в комнату, пока хост не ответит
      const n = this.bus.count;
      if (!n) { this.status = 'ПОДКЛЮЧЕНИЕ...'; if (this.waitT > 10) this.fail('НЕТ СВЯЗИ С СЕРВЕРАМИ'); return; }
      this.status = tr('ИЩЕМ КОМНАТУ...') + ' (' + n + '/' + NET_BROKERS.length + ')';
      this.joinT -= dt;
      if (this.joinT <= 0) { this.joinT = 2; this.bus.pub(this.topic('host'), { t: 'join', g: this.gid }); }
      if (this.waitT > 20) this.fail('КОМНАТА НЕ НАЙДЕНА');
      return;
    }
    if (!this.video && this.waitT - this.offerT > 25) this.fail('НЕ УДАЛОСЬ СОЕДИНИТЬСЯ С ХОСТОМ');
    if (!this.dc || this.dc.readyState !== 'open') return;
    const C = ALL_CTRL, keys = [C.up, C.down, C.left, C.right, C.fire, C.special, NET_START];
    let b = 0;
    keys.forEach((k, i) => { if (Input.any(k)) b |= 1 << i; });
    this.sendT -= dt;
    if (b !== this.bits || this.sendT <= 0) { this.bits = b; this.sendT = 0.25; try { this.dc.send(JSON.stringify({ t: 'in', b })); } catch (e) { /* канал закрылся */ } }
  },
  drawGuest() {
    text('ОНЛАЙН', W / 2, 60, '#fcd820', 3, 'center', '#7c4000');
    text(tr('КОМНАТА') + ' ' + this.code, W / 2, 100, '#3cbcfc', 1, 'center');
    text(this.status, W / 2, 120, this.failed ? '#f83800' : (blink(2) ? '#fcfcfc' : '#7c7c7c'), 1, 'center');
    if (this.failed) text('ОГОНЬ - В МЕНЮ', W / 2, 150, '#7c7c7c', 1, 'center');
    else text('ИГРАЕТЕ НА СВОЁМ УСТРОЙСТВЕ, КАРТИНКА - С ЭКРАНА ХОСТА', W / 2, 150, '#545454', 1, 'center');
  },
};

// ссылка из QR-кода: ?join=КОД — сразу подключаемся
addEventListener('load', () => {
  const code = new URLSearchParams(location.search).get('join');
  if (code) Net.join(code);
});
