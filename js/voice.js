// Yakınlık tabanlı sesli iletişim: PeerJS (WebRTC) + host'un ses rotaları.
// SESLİ modda herkes konuşur. SESSİZ modda yalnızca (hayattaki) DEDEKTİF konuşabilir: mikrofonu aç/kapa (V) ve normal/bağırma (B) seçebilir;
// diğerleri yalnızca dinler (mikrofon izni bile istenmez).
//
// Mimari (SFU'ya geçişe hazır, tek dosyada izole):
//  • Herkes tam ağ (mesh) kurmaz. Host konumları takip eder ve her oyuncuya "kimlerle bağlantı kurmalısın"
//    listesini yollar ('vr' mesajı: [[oyuncuId, tür], ...]). Tür: 0 = yakınlık, 1 = tam ses (hayalet/medyum/lobi), 2 = sessiz.
//  • Bağlantıyı id'si küçük olan arar (çift çağrıyı önler). Menzil dışına çıkan bağlantılar host tarafından listeden düşer ve kapatılır.
//  • Gönderilen ses tek bir "çıkış akışı"dır (WebAudio MediaStreamDestination). Mikrofon izni yoksa sessiz akış gider,
//    yani izin vermeyen oyuncu yine de dinleyebilir. Bağlantı hataları oyunu bozmaz.
//  • Dinleme tarafında ses seviyesi, konuşanın ses seviyesi (fısıltı/normal/bağırma) ve mesafeye göre <audio>.volume ile ayarlanır.
//  • SFU'ya geçmek için yalnızca startCall/attach/setRoutes içindeki taşıma kısmı değiştirilir.
import { GAME_CONFIG, ICE_SERVERS, KEYS } from './config.js';
import { ctx } from './context.js';
import { audio } from './audio.js';
import { clamp, store } from './util.js';

const V = GAME_CONFIG.voice;
export const LEVEL_NAMES = ['Fısıltı', 'Normal', 'Bağırma'];
const rangeOf = (level) => [V.whisperDistance, V.normalDistance, V.shoutDistance][level] ?? V.normalDistance;
const peerOrder = (a, b) => String(a).localeCompare(String(b));

export class VoiceManager {
  constructor() {
    this.peer = null;
    this.status = 'off'; // off | connecting | ready | error
    this.micState = 'none'; // none | pending | on | denied | insecure
    this.micOn = true;
    this.transmitting = false;
    this.conns = new Map(); // oyuncuId -> { call, el, retryAt }
    this.routes = new Map(); // oyuncuId -> tür
    this.routeAt = new Map(); // oyuncuId -> son istenme zamanı (ms)
    this.dest = null;
    this.micGain = null;
    this.micStream = null;
    this.micSrc = null;
    this.analyser = null; // mikrofon seviye ölçeri (ayarlardaki test çubuğu için)
    this.deviceId = store.get('micDevice', '') || ''; // seçili mikrofon ('' = sistem varsayılanı)
    this.test = null; // oda dışında mikrofon denemesi: { stream, src, an }
    this.onDevices = null; // cihaz listesi değişince çağrılır (ayarlar ekranı bağlar)
    this.t = 0;
    this.reconT = 0;
    this.holder = document.getElementById('voice-audio');
    this.startToken = 0;
    this.retry = new Map();
    // Mikrofon takılıp çıkarıldığında listeyi tazele / seçili cihaz geri geldiyse ona dön.
    navigator.mediaDevices?.addEventListener?.('devicechange', () => this.onDeviceChange());
  }

  get enabled() {
    return (ctx.room?.mode === 'voice' || ctx.room?.mode === 'silent') && !ctx.net?.local; // ağsız debug odasında ses yok
  }

  get silentMode() {
    return ctx.room?.mode === 'silent';
  }

  /** Bu oyuncu konuşabilir mi? Sesli modda herkes; sessiz modda yalnızca hayattaki dedektif. */
  canSpeak() {
    if (!this.silentMode) return true;
    return ctx.role?.id === 'detective' && !!ctx.me?.alive && (ctx.phase === 'playing' || ctx.phase === 'reveal');
  }

  hud() {
    return {
      enabled: this.enabled, status: this.status, mic: this.micState, micOn: this.micOn, talking: this.transmitting,
      level: ctx.me?.talkLevel ?? V.defaultLevel, silent: this.silentMode, canSpeak: this.canSpeak(),
    };
  }

  // ------------------------------------------------------------------ başlat / durdur
  onJoinedRoom() {
    if (this.enabled) this.start();
  }

  async start() {
    this.stop();
    const token = ++this.startToken;
    this.status = 'connecting';
    try {
      audio.unlock();
      const ac = audio.ctx;
      if (!ac) throw new Error('WebAudio yok');
      this.dest = ac.createMediaStreamDestination();
      this.micGain = ac.createGain();
      this.micGain.gain.value = 0;
      this.micGain.connect(this.dest);
      if (token !== this.startToken) return;
      if (!window.Peer) throw new Error('PeerJS yüklenemedi');
      // PeerJS Cloud sinyal sunucusu; ses akışı WebRTC ile doğrudan oyuncular arasında gider.
      // ICE (STUN/TURN) listesi config.js içindeki ICE_SERVERS'tır (oyun verisiyle aynı).
      const peer = new window.Peer(`iv-${ctx.room.code}-${ctx.myId}`, {
        debug: 0,
        config: { iceServers: ICE_SERVERS },
      });
      this.peer = peer;
      peer.on('open', () => {
        if (token !== this.startToken) return;
        this.status = 'ready';
        this.reconcile();
      });
      peer.on('call', (call) => this.onIncoming(call));
      peer.on('error', (e) => this.onPeerError(e));
      peer.on('disconnected', () => {
        if (this.peer === peer && !peer.destroyed) setTimeout(() => peer.reconnect?.(), 1500);
      });
      if (!this.silentMode) this.enableMic(); // sessiz modda mikrofon yalnızca dedektife (rol belli olunca) açılır
    } catch (e) {
      this.status = 'error';
      console.warn('[voice]', e);
      ctx.ui?.toast('Sesli iletişim başlatılamadı; yazı ve oyun devam ediyor.');
    }
  }

  stop() {
    this.startToken++;
    for (const id of [...this.conns.keys()]) this.removeConn(id, true);
    this.conns.clear();
    this.routes.clear();
    this.routeAt.clear();
    try {
      this.peer?.destroy();
    } catch {
      /* zaten kapalı */
    }
    this.peer = null;
    this.detachStream();
    try {
      this.micGain?.disconnect();
    } catch {
      /* yok */
    }
    this.dest = this.micGain = null;
    this.micState = 'none';
    this.transmitting = false;
    this.status = 'off';
    if (ctx.me) ctx.me.talking = false;
  }

  // ------------------------------------------------------------------ mikrofon
  async enableMic() {
    if (this.micState === 'on' || this.micState === 'pending') return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      this.micState = 'insecure';
      ctx.ui?.toast('Mikrofon için https veya localhost gerekir. Şimdilik yalnızca dinleyebilirsin (README\'ye bak).', 6000);
      return;
    }
    this.micState = 'pending';
    const token = this.startToken;
    try {
      const stream = await this.acquire();
      if (token !== this.startToken || !this.micGain) {
        for (const tr of stream.getTracks()) tr.stop();
        return;
      }
      this.attachStream(stream);
      this.micState = 'on';
      this.onDeviceChange(); // izin alındı: cihaz adları artık okunabilir
    } catch {
      this.micState = 'denied';
      ctx.ui?.toast('Mikrofon izni verilmedi; yalnızca dinleyebilirsin.', 4500);
    }
  }

  // ------------------------------------------------------------------ mikrofon seçimi (dahili / harici)
  /** Seçili cihazla mikrofon akışı ister; cihaz yoksa sistem varsayılanına döner (tercih silinmez). */
  async acquire() {
    const base = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    if (this.deviceId) {
      try {
        return await navigator.mediaDevices.getUserMedia({ audio: { ...base, deviceId: { exact: this.deviceId } } });
      } catch (e) {
        if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') throw e;
        ctx.ui?.toast('Seçili mikrofon bulunamadı; sistem varsayılanı kullanılıyor.', 3500);
      }
    }
    return navigator.mediaDevices.getUserMedia({ audio: base });
  }

  /** Akışı konuşma hattına (micGain) ve seviye ölçere bağlar; öncekini kapatır. */
  attachStream(stream) {
    this.detachStream();
    const ac = audio.ctx;
    this.micStream = stream;
    this.micSrc = ac.createMediaStreamSource(stream);
    this.micSrc.connect(this.micGain);
    this.analyser = ac.createAnalyser();
    this.analyser.fftSize = 512;
    this.micSrc.connect(this.analyser);
    const track = stream.getAudioTracks()[0];
    track?.addEventListener('ended', () => {
      if (this.micStream !== stream) return;
      // cihaz çıkarıldı: kısa süre sonra varsayılan (veya geri gelen) cihazla yeniden dene
      this.detachStream();
      this.micState = 'none';
      ctx.ui?.toast('Mikrofon bağlantısı koptu; yeniden deneniyor…', 2500);
      setTimeout(() => this.micGain && this.enableMic(), 600);
    });
  }

  detachStream() {
    if (this.micStream) for (const tr of this.micStream.getTracks()) tr.stop();
    this.micStream = null;
    try {
      this.micSrc?.disconnect();
      this.analyser?.disconnect();
    } catch {
      /* zaten bağlı değil */
    }
    this.micSrc = this.analyser = null;
  }

  /** Mikrofon cihazlarını listeler: [{ id, label }]. İzin verilmeden önce tarayıcı isimleri boş döndürür. */
  async listMics() {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      let n = 0;
      return all
        .filter((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications')
        .map((d) => ({ id: d.deviceId, label: d.label || `Mikrofon ${++n}` }));
    } catch {
      return [];
    }
  }

  /** Mikrofon cihazını değiştirir ('' = sistem varsayılanı). Odada konuşuyorsa akış hemen yenilenir. */
  async setMicDevice(id) {
    this.deviceId = id === 'default' ? '' : id || '';
    store.set('micDevice', this.deviceId);
    if (this.micState === 'on' && this.micGain) await this.restartMic();
    if (this.test) await this.startTest();
  }

  async restartMic() {
    const token = this.startToken;
    try {
      const stream = await this.acquire();
      if (token !== this.startToken || !this.micGain) {
        for (const tr of stream.getTracks()) tr.stop();
        return;
      }
      this.attachStream(stream);
      this.micState = 'on';
    } catch {
      this.micState = 'denied';
      ctx.ui?.toast('Mikrofon açılamadı.', 3000);
    }
  }

  async onDeviceChange() {
    const list = await this.listMics();
    this.onDevices?.(list);
    if (this.micState !== 'on' || !this.micGain || !this.deviceId) return;
    // tercih ettiğim cihaz geri takıldıysa ona dön
    const cur = this.micStream?.getAudioTracks?.()[0]?.getSettings?.().deviceId;
    if (cur && cur !== this.deviceId && list.some((d) => d.id === this.deviceId)) await this.restartMic();
  }

  /** Ayarlardaki "mikrofonu dene" çubuğu: odada değilken de çalışır (kendi geçici akışını açar). */
  async startTest() {
    this.stopTest();
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return false;
    if (this.micState === 'on' && this.analyser) {
      this.testing = true; // odada mikrofon zaten açık: onun ölçerini kullan
      return true;
    }
    try {
      audio.unlock();
      const stream = await this.acquire();
      const ac = audio.ctx;
      const src = ac.createMediaStreamSource(stream);
      const an = ac.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      this.test = { stream, src, an };
      this.testing = true;
      this.onDeviceChange(); // izin alındı: cihaz adları artık okunabilir
      return true;
    } catch {
      this.testing = false;
      return false;
    }
  }

  stopTest() {
    if (this.test) {
      for (const tr of this.test.stream.getTracks()) tr.stop();
      try {
        this.test.src.disconnect();
      } catch {
        /* yok */
      }
    }
    this.test = null;
    this.testing = false;
  }

  /** 0..1 arası anlık mikrofon seviyesi (test çubuğu için). */
  level() {
    const an = this.test?.an || this.analyser;
    if (!an) return 0;
    const buf = new Uint8Array(an.fftSize);
    an.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    return clamp(Math.sqrt(sum / buf.length) * 3.2, 0, 1);
  }

  /** Konuşma seviyesi dairesindeki seçenekler (C basılı tut). Sessiz modda dedektifin yalnızca Normal / Bağırma seçeneği vardır. */
  levelChoices() {
    const cur = ctx.me?.talkLevel ?? V.defaultLevel;
    const pos = this.silentMode ? { 1: Math.PI, 2: 0 } : { 0: Math.PI, 1: -Math.PI / 2, 2: 0 }; // sol: fısıltı · üst: normal · sağ: bağırma
    return Object.keys(pos).map(Number).map((level) => ({
      level, angle: pos[level], name: LEVEL_NAMES[level], sub: `${rangeOf(level)} m${level === cur ? ' · şu an' : ''}`,
    }));
  }

  /** Daireden seçilen seviyeyi uygular. */
  chooseLevel(level) {
    if (!ctx.me || level == null) return;
    if (this.silentMode && level === 0) level = 1; // sessiz modda fısıltı yok
    ctx.me.talkLevel = clamp(level, 0, 2);
    ctx.ui?.toast(`Ses seviyesi: ${LEVEL_NAMES[ctx.me.talkLevel]} (${rangeOf(ctx.me.talkLevel)} m)`, 1400);
  }

  setLevel(n) {
    this.chooseLevel(this.silentMode ? (ctx.me?.talkLevel === 2 ? 1 : 2) : ((n % 3) + 3) % 3);
  }

  /** Debug: host susturdu → mikrofon iletmez (host da bu kişinin sesini kimseye yönlendirmez). */
  setForcedMute(on) {
    this.forcedMute = !!on;
  }

  // ------------------------------------------------------------------ rotalar ve bağlantılar
  setRoutes(list) {
    const now = performance.now();
    this.routes.clear();
    for (const [id, kind] of list || []) {
      this.routes.set(id, kind);
      this.routeAt.set(id, now);
    }
    this.reconcile();
  }

  reconcile() {
    if (!this.peer || this.status !== 'ready' || !this.dest) return;
    const now = performance.now();
    for (const [id] of this.routes) {
      if (this.conns.has(id)) continue;
      const c = this.retry.get(id);
      if (c && now < c) continue;
      if (peerOrder(ctx.myId, id) < 0) this.startCall(id);
    }
    for (const id of [...this.conns.keys()]) {
      if (!this.routes.has(id) && now - (this.routeAt.get(id) || 0) > 1500) this.removeConn(id);
    }
  }

  startCall(id) {
    if (!ctx.room?.players?.some((p) => p.id === id)) return;
    try {
      const call = this.peer.call(`iv-${ctx.room.code}-${id}`, this.dest.stream, { metadata: { from: ctx.myId } });
      if (!call) return;
      this.attach(id, call);
    } catch {
      this.later(id);
    }
  }

  onIncoming(call) {
    try {
      // Peer ID'si tire içerebilir; çağıranın gerçek oyuncu kimliğini metadata'dan al.
      const id = String(call.metadata?.from || String(call.peer).split('-').pop());
      if (!ctx.room?.players?.some((p) => p.id === id) || !this.dest) {
        call.close();
        return;
      }
      if (this.conns.has(id)) this.removeConn(id, true);
      call.answer(this.dest.stream);
      this.routeAt.set(id, performance.now());
      this.attach(id, call);
    } catch (e) {
      console.warn('[voice] çağrı kabul edilemedi', e);
    }
  }

  attach(id, call) {
    const entry = { call, el: null };
    this.conns.set(id, entry);
    call.on('stream', (remote) => {
      if (this.conns.get(id) !== entry) return;
      if (!entry.el) {
        const el = document.createElement('audio');
        el.autoplay = true;
        el.playsInline = true;
        el.volume = 0;
        this.holder?.appendChild(el);
        entry.el = el;
      }
      entry.el.srcObject = remote;
      entry.el.play?.().catch(() => {});
    });
    call.on('close', () => {
      if (this.conns.get(id) === entry) this.removeConn(id, true, true);
    });
    call.on('error', () => {
      if (this.conns.get(id) === entry) this.removeConn(id, true, true);
    });
  }

  later(id, ms = 2500) {
    this.retry.set(id, performance.now() + ms);
  }

  removeConn(id, silent = false, retry = false) {
    const c = this.conns.get(id);
    if (!c) return;
    this.conns.delete(id);
    try {
      c.call.close();
    } catch {
      /* zaten kapalı */
    }
    if (c.el) {
      c.el.srcObject = null;
      c.el.remove();
    }
    if (retry) this.later(id);
  }

  dropPeer(id) {
    this.removeConn(id, true);
    this.routes.delete(id);
  }

  onPeerError(e) {
    const type = e?.type;
    if (type === 'peer-unavailable') return; // karşı taraf henüz hazır değil: sonra yeniden denenir
    if (type === 'unavailable-id') {
      this.status = 'error';
      ctx.ui?.toast('Ses kimliği başka bir sekmede kullanılıyor; bu sekmede ses kapalı.');
      return;
    }
    if (['network', 'server-error', 'socket-error', 'socket-closed', 'browser-incompatible'].includes(type)) {
      if (this.status !== 'error') ctx.ui?.toast('Ses sunucusuna bağlanılamadı; ses yeniden denenecek.');
      this.status = type === 'browser-incompatible' ? 'error' : 'connecting';
    } else console.warn('[voice]', e);
  }

  // ------------------------------------------------------------------ her kare
  listenerPos() {
    const me = ctx.me;
    if (!me) return null;
    if (me.alive) return me.pos;
    const t = ctx.movement.spectateId && ctx.players.get(ctx.movement.spectateId);
    return t && t.alive ? t.pos : me.pos;
  }

  update(dt) {
    if (!this.enabled || !ctx.me || ctx.phase === 'menu') return;
    const input = ctx.input;
    const speak = this.canSpeak();

    if (speak) {
      if (input.wasPressed(KEYS.mic)) {
        this.micOn = !this.micOn;
        ctx.ui?.toast(this.micOn ? 'Mikrofon açık' : 'Mikrofon kapalı', 1200);
        if (this.micOn && (this.micState === 'none' || this.micState === 'denied')) this.enableMic();
      }
      // sessiz mod: dedektif olduğum belli olunca mikrofonu (izin sorarak) aç
      if (this.silentMode && this.micOn && this.micState === 'none' && this.status === 'ready') this.enableMic();
    }
    // Sessiz modda mikrofon AÇIKKEN sürekli iletir (bas-konuş yok): dedektif yalnızca sesi aç/kapa yapar.
    const want = !this.forcedMute && speak && this.micOn && this.micState === 'on' && (this.silentMode || input.isDown(KEYS.ptt) || ctx.settings.openMic);
    if (want !== this.transmitting) {
      this.transmitting = want;
      ctx.me.talking = want;
      if (this.micGain) this.micGain.gain.setTargetAtTime(want ? 1 : 0, audio.ctx.currentTime, 0.02);
    }

    this.reconT += dt;
    if (this.reconT > 1) {
      this.reconT = 0;
      this.reconcile();
    }

    this.t += dt;
    if (this.t < 0.08) return;
    this.t = 0;
    const lp = this.listenerPos();
    if (!lp) return;
    for (const [id, c] of this.conns) {
      if (!c.el) continue;
      const kind = this.routes.get(id) ?? 2;
      let g = 0;
      if (kind === 1) g = 1;
      else if (kind === 0) {
        const p = ctx.players.get(id);
        if (p) {
          const range = rangeOf(p.talkLevel);
          const d = lp.distanceTo(p.pos);
          g = d >= range ? 0 : Math.pow(1 - d / range, 0.85);
          if (g < 0.02) g = 0;
        }
      }
      c.el.volume = clamp(g * (ctx.settings.volume ?? 0.8), 0, 1);
    }
  }
}
