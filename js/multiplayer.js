// PeerJS tabanlı P2P oda ve oyun mesajlaşması.
// Oda sahibi host olur; diğer oyuncuların DataConnection bağlantıları doğrudan host'a gider.
// PeerJS Cloud yalnızca bağlantı/sinyalleşme içindir. Oyun verisi host ile oyuncular arasında akar.
// Ayrıca createLocal(): ağ olmadan çalışan tek kişilik debug odası (aynı API, hiç PeerJS yok).
import { ICE_SERVERS } from './config.js';
import { Emitter } from './util.js';

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const peerOptions = { debug: 0, config: { iceServers: ICE_SERVERS } };
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function makeCode() {
  let out = '';
  for (let i = 0; i < 5; i++) out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return out;
}

export class Multiplayer extends Emitter {
  constructor() {
    super();
    this.peer = null;
    this.hostConn = null;
    this.conns = new Map(); // oyuncu id -> DataConnection (yalnızca host'ta)
    this.pending = new Set();
    this.id = null;
    this.code = null;
    this.inRoom = false;
    this.isHost = false;
    this.room = null;
    this.localName = '';
    this.local = false; // true: ağsız tek kişilik debug odası
    this._botSeq = 0;
    this._joinResolve = null;
    this._joinReject = null;
    this._joinTimer = null;
  }

  _newPeer(id) {
    if (!window.Peer) throw new Error('PeerJS yüklenemedi. İnternet bağlantını ve PeerJS CDN adresini kontrol et.');
    return new window.Peer(id, peerOptions);
  }

  _waitOpen(peer, timeout = 15000) {
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => finish(new Error('PeerJS bağlantısı zaman aşımına uğradı.')), timeout);
      const finish = (err, id) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        peer.off?.('open', onOpen);
        peer.off?.('error', onError);
        err ? reject(err) : resolve(id);
      };
      const onOpen = (id) => finish(null, id);
      const onError = (err) => finish(new Error(this._errorText(err)));
      peer.on('open', onOpen);
      peer.on('error', onError);
      if (peer.id && peer.open) finish(null, peer.id);
    });
  }

  _errorText(err) {
    if (err?.type === 'unavailable-id') return 'Bu oda kodu zaten kullanılıyor. Yeni oda açmayı dene.';
    if (err?.type === 'peer-unavailable') return 'Oda bulunamadı. Kod yanlış olabilir veya host odadan çıkmış olabilir.';
    if (err?.type === 'network' || err?.type === 'socket-error' || err?.type === 'socket-closed') return 'PeerJS Cloud bağlantısı kurulamadı. İnternet bağlantını kontrol et.';
    return err?.message || 'P2P bağlantısı kurulamadı.';
  }

  _roomInfo() {
    return {
      t: 'roomInfo', code: this.code, name: this.room.name, max: this.room.max,
      mode: this.room.mode, locked: !!this.room.password, started: !!this.room.started,
      hostId: this.room.hostId, settings: this.room.settings,
      players: this.room.players.map(({ id, name, bot }) => (bot ? { id, name, bot: true } : { id, name })),
    };
  }

  _emitRoomInfo() {
    const info = this._roomInfo();
    this.emit('roomInfo', info);
    this._broadcast(info);
  }

  _broadcast(obj, exceptId = null) {
    for (const [id, conn] of this.conns) {
      if (id !== exceptId && conn.open) {
        try { conn.send(obj); } catch { /* bağlantı kapanıyor */ }
      }
    }
  }

  _sendTo(id, obj) {
    const conn = this.conns.get(id);
    if (conn?.open) {
      try { conn.send(obj); } catch { /* bağlantı kapanıyor */ }
    }
  }

  async create(name, room = {}) {
    this.close();
    this.localName = clean(name, 18) || 'Oyuncu';
    this.code = makeCode();
    const peerId = `irgat-${this.code}`;
    const peer = this._newPeer(peerId);
    this.peer = peer;
    await this._waitOpen(peer);
    this.id = peer.id;
    this.isHost = true;
    this.inRoom = true;
    this.room = {
      code: this.code,
      name: clean(room.name, 24) || 'Oda',
      max: clamp(parseInt(room.maxPlayers, 10) || 16, 2, 16),
      mode: room.mode === 'silent' ? 'silent' : 'voice',
      password: clean(room.password, 32),
      settings: room.settings || {},
      hostId: this.id,
      started: false,
      players: [{ id: this.id, name: this.localName }],
    };
    peer.on('connection', (conn) => this._onIncoming(conn));
    peer.on('disconnected', () => {
      if (this.peer === peer && !peer.destroyed) setTimeout(() => peer.reconnect?.(), 1200);
    });
    peer.on('error', (e) => this.emit('error', { msg: this._errorText(e) }));
    this.emit('open');
    this.emit('joined', { id: this.id, code: this.code, hostId: this.id, info: this._roomInfo() });
  }

  /** Ağsız tek kişilik debug odası: PeerJS kullanılmaz, internet gerekmez. Host gibi davranır. */
  createLocal(name, room = {}) {
    this.close();
    this.local = true;
    this.localName = clean(name, 18) || 'Oyuncu';
    this.code = 'DEBUG';
    this.id = 'local-host';
    this.isHost = true;
    this.inRoom = true;
    this.room = {
      code: this.code,
      name: clean(room.name, 24) || 'Debug Haritası',
      max: 16,
      mode: 'silent',
      password: '',
      settings: room.settings || {},
      hostId: this.id,
      started: false,
      players: [{ id: this.id, name: this.localName }],
    };
    this.emit('open');
    this.emit('joined', { id: this.id, code: this.code, hostId: this.id, info: this._roomInfo() });
  }

  /** Debug: odaya hareketsiz bot ekler (yalnızca host). Bot id'si "bot-N". Dönüş: id. */
  addBot(name = 'Bot') {
    if (!this.inRoom || !this.isHost || !this.room) return null;
    const id = `bot-${++this._botSeq}-${Math.random().toString(36).slice(2, 5)}`;
    const base = clean(name, 18) || 'Bot';
    let unique = base;
    let i = 2;
    while (this.room.players.some((p) => p.name.toLowerCase() === unique.toLowerCase())) unique = `${base} ${i++}`;
    this.room.players.push({ id, name: unique, bot: true });
    this._emitRoomInfo();
    return id;
  }

  removeBot(id) {
    if (!this.inRoom || !this.isHost || !this.room) return;
    const p = this.room.players.find((x) => x.id === id);
    if (!p?.bot) return;
    this.room.players = this.room.players.filter((x) => x.id !== id);
    this.emit('peerLeft', { id });
    this._broadcast({ t: 'peerLeft', id });
    this._emitRoomInfo();
  }

  async join(name, code, password = '') {
    this.close();
    this.localName = clean(name, 18) || 'Oyuncu';
    this.code = clean(code, 8).toUpperCase();
    if (!this.code) throw new Error('Oda kodunu gir.');
    const peer = this._newPeer();
    this.peer = peer;
    await this._waitOpen(peer);
    this.id = peer.id;
    this.emit('open');

    return new Promise((resolve, reject) => {
      this._joinResolve = resolve;
      this._joinReject = reject;
      this._joinTimer = setTimeout(() => {
        this._finishJoin(new Error('Host yanıt vermedi. Oda kodunu kontrol et.'));
        this.close();
      }, 15000);
      const conn = peer.connect(`irgat-${this.code}`, { reliable: true });
      this.hostConn = conn;
      conn.on('open', () => conn.send({ t: 'join', name: this.localName, password: clean(password, 32) }));
      conn.on('data', (data) => this._onClientData(data));
      conn.on('close', () => this._connectionClosed());
      conn.on('error', (e) => this._finishJoin(new Error(this._errorText(e))));
      peer.on('error', (e) => {
        if (!this.inRoom) this._finishJoin(new Error(this._errorText(e)));
        else this.emit('error', { msg: this._errorText(e) });
      });
      peer.on('disconnected', () => {
        if (this.peer === peer && !peer.destroyed) setTimeout(() => peer.reconnect?.(), 1200);
      });
    });
  }

  _finishJoin(err) {
    clearTimeout(this._joinTimer);
    this._joinTimer = null;
    const resolve = this._joinResolve;
    const reject = this._joinReject;
    this._joinResolve = this._joinReject = null;
    if (err) reject?.(err);
    else resolve?.();
  }

  _onIncoming(conn) {
    this.pending.add(conn);
    conn.on('data', (data) => {
      if (!this.conns.has(conn.peer)) {
        if (data?.t !== 'join') return;
        const name = clean(data.name, 18) || 'Oyuncu';
        if (this.room.password && this.room.password !== clean(data.password, 32)) {
          conn.send({ t: 'error', msg: 'Şifre yanlış.' });
          setTimeout(() => conn.close(), 180);
          this.pending.delete(conn);
          return;
        }
        if (this.room.players.length >= this.room.max) {
          conn.send({ t: 'error', msg: 'Oda dolu.' });
          setTimeout(() => conn.close(), 180);
          this.pending.delete(conn);
          return;
        }
        const base = name;
        let unique = base;
        let i = 2;
        while (this.room.players.some((p) => p.name.toLowerCase() === unique.toLowerCase())) unique = `${base} (${i++})`;
        this.conns.set(conn.peer, conn);
        this.pending.delete(conn);
        this.room.players.push({ id: conn.peer, name: unique });
        conn.send({ t: 'joined', id: conn.peer, code: this.code, hostId: this.id, info: this._roomInfo() });
        this.emit('peerJoined', { id: conn.peer });
        this._broadcast({ t: 'peerJoined', id: conn.peer }, conn.peer);
        this._emitRoomInfo();
        return;
      }
      this._onHostData(conn.peer, data);
    });
    conn.on('close', () => {
      this.pending.delete(conn);
      if (this.conns.has(conn.peer)) this._removePeer(conn.peer);
    });
    conn.on('error', () => {
      this.pending.delete(conn);
      if (this.conns.has(conn.peer)) this._removePeer(conn.peer);
    });
  }

  _onHostData(from, m) {
    if (!m || typeof m.t !== 'string') return;
    switch (m.t) {
      case 'relay': {
        const msg = { t: 'msg', from, d: m.d };
        const to = m.to;
        if (to === 'host' || to === 'all' || to === this.id || (Array.isArray(to) && to.includes(this.id))) this.emit('msg', msg);
        if (to === 'all') {
          this._broadcast(msg, from);
        } else if (Array.isArray(to)) {
          for (const id of to) if (id !== this.id && id !== from) this._sendTo(id, msg);
        } else if (typeof to === 'string' && to !== 'host' && to !== this.id && to !== from) {
          this._sendTo(to, msg);
        }
        break;
      }
      case 'leave':
        this._removePeer(from);
        break;
      default:
        break;
    }
  }

  _onClientData(m) {
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'error') {
      this._finishJoin(new Error(m.msg || 'Odaya katılınamadı.'));
      return;
    }
    if (m.t === 'joined') {
      this.id = m.id;
      this.code = m.code;
      this.room = m.info;
      this.isHost = false;
      this.inRoom = true;
      this.emit('joined', m);
      this._finishJoin();
      return;
    }
    if (m.t === 'msg') this.emit('msg', m);
    else if (m.t === 'hostClosed') {
      this.emit('hostClosed', m);
      this._connectionClosed();
      this.close();
    } else if (m.t === 'kicked') {
      this.emit('kicked', m);
      this.inRoom = false;
      this.close();
    } else if (m.t === 'peerLeft') {
      this.emit('peerLeft', m);
    } else if (m.t === 'roomInfo') {
      this.room = m;
      this.emit('roomInfo', m);
    } else this.emit(m.t, m);
  }

  _removePeer(id) {
    const conn = this.conns.get(id);
    this.conns.delete(id);
    this.room.players = this.room.players.filter((p) => p.id !== id);
    try { conn?.close(); } catch { /* zaten kapalı */ }
    this.emit('peerLeft', { id });
    this._broadcast({ t: 'peerLeft', id });
    this._emitRoomInfo();
  }

  _connectionClosed() {
    if (!this.inRoom) return;
    const was = this.inRoom;
    this.inRoom = false;
    this.id = null;
    this.code = null;
    this.room = null;
    this.hostConn = null;
    const peer = this.peer;
    this.peer = null;
    try { peer?.destroy(); } catch { /* bağlantı zaten kapanmış olabilir */ }
    this.emit('close', was);
  }

  // Eski arayüzün kullandığı API. Oda listesi ve sunucu escrow'u P2P'de yoktur.
  async list() { this.emit('rooms', { rooms: [] }); }

  leave() {
    if (!this.inRoom) return this.close();
    if (this.isHost) {
      this._broadcast({ t: 'hostClosed' });
      this.close();
      return;
    }
    try { this.hostConn?.send({ t: 'leave' }); } catch { /* bağlantı kopmuş olabilir */ }
    this.close();
  }

  close() {
    this.inRoom = false;
    clearTimeout(this._joinTimer);
    this._joinTimer = null;
    this._finishJoin(new Error('Bağlantı kapatıldı.'));
    for (const conn of this.conns.values()) { try { conn.close(); } catch { /* ignore */ } }
    for (const conn of this.pending) { try { conn.close(); } catch { /* ignore */ } }
    this.conns.clear();
    this.pending.clear();
    try { this.hostConn?.close(); } catch { /* ignore */ }
    this.hostConn = null;
    try { this.peer?.destroy(); } catch { /* ignore */ }
    this.peer = null;
    this.id = null;
    this.code = null;
    this.room = null;
    this.isHost = false;
    this.local = false;
    // Yerel kapatma close olayı üretmez; beklenmeyen kopmaları _connectionClosed bildirir.
  }

  relay(to, d) {
    if (!this.inRoom) return;
    if (this.isHost) {
      const msg = { t: 'msg', from: this.id, d };
      if (to === 'all') this._broadcast(msg);
      else if (Array.isArray(to)) for (const id of to) this._sendTo(id, msg);
      else if (to !== 'host' && to !== this.id) this._sendTo(to, msg);
    } else if (this.hostConn?.open) {
      this.hostConn.send({ t: 'relay', to, d });
    }
  }

  sendEscrow(_d) {
    // Sunucu olmadığı için host yedeğini saklayacak merkezi bir yer yok.
    // Host ayrılırsa oda kapanır; otomatik host devri bu sürümde desteklenmez.
  }

  roomUpdate(patch) {
    if (!this.inRoom || !this.isHost || !this.room) return;
    const p = patch || {};
    if (typeof p.name === 'string') this.room.name = clean(p.name, 24) || this.room.name;
    if (p.max != null) this.room.max = clamp(parseInt(p.max, 10) || this.room.max, Math.max(2, this.room.players.length), 16);
    if (p.mode === 'voice' || p.mode === 'silent') this.room.mode = p.mode;
    if (typeof p.password === 'string') this.room.password = clean(p.password, 32);
    if (p.settings) this.room.settings = p.settings;
    if (typeof p.started === 'boolean') this.room.started = p.started;
    this._emitRoomInfo();
  }

  kick(id) {
    if (!this.inRoom || !this.isHost || !this.conns.has(id)) return;
    this._sendTo(id, { t: 'kicked' });
    setTimeout(() => { if (this.conns.has(id)) this._removePeer(id); }, 180);
  }
}
