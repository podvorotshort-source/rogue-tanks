'use strict';
// ============================================================
//  NET: онлайн-кооп через WebRTC (библиотека PeerJS).
//  Хост ведёт игру как обычно и транслирует картинку со звуком
//  каждому гостю видеопотоком. Гость присылает только свои кнопки —
//  у хоста они нажимают коды NetI* (см. DEVICES в core.js), поэтому
//  гость входит в лобби и играет как ещё одно устройство.
//  Сервер PeerJS нужен лишь для знакомства, дальше связь напрямую.
// ============================================================

const NET_PREFIX = 'tanks8bit-rogue-';
const NET_LIBS = {
  Peer: 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js',
  qrcode: 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js',
};
const NET_KEYS = ['Up', 'Down', 'Left', 'Right', 'A', 'B', 'Start'];
const NET_START = ['Escape', 'KeyP', 'TouchStart', ...PAD_STARTS];

const Net = {
  role: null, peer: null, code: '', open: false, status: '', failed: false,
  guests: [],           // хост: место гостя (0..4) -> { conn, call }
  stream: null, cap: null, capG: null, qr: null,
  conn: null, video: null, bits: -1, sendT: 0, waitT: 0, slot: -1, // гость

  hosting() { return this.role === 'host' && this.open; },
  guestCount() { return this.guests.filter(Boolean).length; },
  guestName(i) { return tr('ОНЛАЙН') + ' ' + (i + 1); },

  load(name) {
    if (window[name]) return Promise.resolve();
    return new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = NET_LIBS[name]; s.onload = ok; s.onerror = fail;
      document.head.appendChild(s);
    });
  },
  newCode() {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // без I и O, чтобы не путать с 1 и 0
    let c = ''; for (let i = 0; i < 4; i++) c += A[Math.floor(Math.random() * A.length)];
    return c;
  },

  // ---------------- хост ----------------
  host() {
    if (this.role === 'host') return; // комната живёт до перезагрузки страницы
    this.role = 'host'; this.open = false; this.status = 'СОЗДАЁМ КОМНАТУ...';
    Sound.unlock();
    this.load('Peer').then(() => this.startHost(), () => { this.status = 'НЕТ ИНТЕРНЕТА'; this.role = null; });
    this.load('qrcode').then(() => this.makeQr(), () => {});
  },
  startHost() {
    this.code = this.newCode();
    const peer = this.peer = new Peer(NET_PREFIX + this.code);
    peer.on('open', () => { this.open = true; this.status = ''; this.makeQr(); });
    peer.on('connection', conn => this.onGuest(conn));
    peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
    peer.on('error', e => {
      if (e.type === 'unavailable-id') { peer.destroy(); this.startHost(); } // код занят — берём другой
      else if (!this.open) { this.status = 'НЕТ СВЯЗИ С СЕРВЕРОМ'; this.role = null; }
    });
  },
  onGuest(conn) {
    conn.on('open', () => {
      let slot = -1;
      for (let k = 0; k < MAX_GUESTS; k++) if (!this.guests[k]) { slot = k; break; }
      if (slot < 0) { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 500); return; }
      const g = this.guests[slot] = { conn, call: null };
      conn.send({ t: 'hi', slot });
      g.call = this.peer.call(conn.peer, this.getStream());
      this.tuneSenders(g.call.peerConnection);
      conn.on('data', d => { if (d && d.t === 'in') this.applyBits(slot, d.b | 0); });
      conn.on('close', () => this.dropGuest(slot, g));
      conn.on('error', () => this.dropGuest(slot, g));
      Sound.play('pickup');
    });
  },
  applyBits(slot, b) {
    NET_KEYS.forEach((k, i) => {
      const code = 'Net' + slot + k;
      if (b & (1 << i)) Input.press(code); else if (Input.down[code]) Input.release(code);
    });
  },
  dropGuest(slot, g) {
    if (this.guests[slot] !== g) return;
    this.applyBits(slot, 0);
    if (g.call) g.call.close();
    this.guests[slot] = null;
    lobbyDrop(DEVICES.findIndex(d => d.net === slot));
    Sound.play('deny');
  },
  // пиксель-арт: лучше реже кадры, чем мыло — держим полное разрешение
  tuneSenders(pc) {
    if (!pc || !pc.getSenders) return;
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
    if (this.role === 'host' && this.capG && this.guestCount()) this.capG.drawImage(canvas, 0, 0, W * 2, H * 2);
  },
  // QR со ссылкой на эту же страницу с ?join=КОД (только если страница открыта не с этого компьютера)
  makeQr() {
    if (this.qr || !this.open || !window.qrcode || !/^https?:$/.test(location.protocol) || /^(localhost|127\.|\[::1\])/.test(location.hostname)) return;
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
    this.role = 'guest'; this.code = String(code).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    this.status = 'ПОДКЛЮЧЕНИЕ...'; this.failed = false; this.waitT = 0; this.bits = -1;
    G.state = 'net'; Music.stop();
    this.load('Peer').then(() => {
      const peer = this.peer = new Peer();
      peer.on('open', () => {
        const conn = this.conn = peer.connect(NET_PREFIX + this.code);
        conn.on('open', () => { this.status = 'ЖДЁМ КАРТИНКУ...'; });
        conn.on('data', d => {
          if (d && d.t === 'hi') this.slot = d.slot;
          if (d && d.t === 'full') this.fail('КОМНАТА ЗАПОЛНЕНА');
        });
        conn.on('close', () => this.fail('СВЯЗЬ С ХОСТОМ ПОТЕРЯНА'));
      });
      peer.on('call', call => { call.answer(); call.on('stream', st => this.showVideo(st)); });
      peer.on('error', e => this.fail(e.type === 'peer-unavailable' ? 'КОМНАТА НЕ НАЙДЕНА' : 'ОШИБКА СЕТИ'));
    }, () => this.fail('НЕТ ИНТЕРНЕТА'));
  },
  fail(msg) {
    if (this.failed) return;
    this.failed = true; this.status = msg;
    if (this.video) this.video.style.display = 'none';
    if (this.peer) this.peer.destroy();
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
    v.srcObject = st; v.style.display = 'block';
    v.play().catch(() => {});
    this.status = '';
  },
  updateGuest(dt) {
    this.waitT += dt;
    if (this.failed) {
      if (anyCtrl('fire') || Input.hit(KEYS_BACK)) location.href = location.pathname; // назад в меню, без ?join
      return;
    }
    if (!this.video && this.waitT > 20) this.fail('ХОСТ НЕ ОТВЕЧАЕТ');
    if (!this.conn || !this.conn.open) return;
    const C = ALL_CTRL, keys = [C.up, C.down, C.left, C.right, C.fire, C.special, NET_START];
    let b = 0;
    keys.forEach((k, i) => { if (Input.any(k)) b |= 1 << i; });
    this.sendT -= dt;
    if (b !== this.bits || this.sendT <= 0) { this.bits = b; this.sendT = 0.25; try { this.conn.send({ t: 'in', b }); } catch (e) { /* канал закрылся */ } }
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
