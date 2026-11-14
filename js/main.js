// Başlangıç noktası: sahneyi, evi (GLB veya örnek ev), sistemleri ve arayüzü kurar; oyun döngüsünü çalıştırır.
// Modüller birbirini doğrudan import etmek yerine ortak `ctx` nesnesi üzerinden konuşur (bkz. context.js).
import { GAME_CONFIG, KEYS } from './config.js';
import { ctx } from './context.js';
import { audio } from './audio.js';
import { SceneManager } from './scene.js';
import { loadHouse } from './blenderLoader.js';
import { World } from './world.js';
import { Input } from './input.js';
import { PlayerManager } from './player.js';
import { Movement } from './movement.js';
import { Interaction } from './interaction.js';
import { Inventory } from './inventory.js';
import { CorpseManager } from './corpse.js';
import { Effects, KnifeView } from './effects.js';
import { ProjectileView } from './projectiles.js';
import { ViewModel } from './viewmodel.js';
import { Multiplayer } from './multiplayer.js';
import { GameClient } from './client.js';
import { VoiceManager } from './voice.js';
import { UI } from './ui.js';
import { ChatUI } from './chat.js';
import { RadialMenu, VOICE_MENU } from './radialMenu.js';
import { PlayerList } from './playerList.js';
import { LookName } from './lookName.js';
import { DebugPanel } from './debug.js';
import { MobileControls } from './mobile.js';
import { loadKeys } from './keybinds.js';
import { isTouchDevice, store } from './util.js';
import { initTabGuard } from './tabGuard.js';

const loadingEl = document.getElementById('loading');
const loadingText = document.getElementById('loading-text');
const loadingBar = document.getElementById('loading-bar');

function setLoading(text, frac) {
  if (loadingText) loadingText.textContent = text;
  if (loadingBar && frac != null) loadingBar.style.width = `${Math.round(frac * 100)}%`;
}

async function boot() {
  // ---- ayarlar ----
  Object.assign(ctx.settings, store.get('settings', {}));
  initTabGuard(); // Ctrl (eğilme) + W ile sekme kapanmasın
  ctx.settings.quality = ctx.settings.quality || GAME_CONFIG.graphics.quality;
  audio.setVolume(ctx.settings.volume);
  loadKeys(); // kayıtlı tuş atamaları (Ayarlar > Tuşlar)

  // ---- sahne ----
  const canvas = document.getElementById('game');
  ctx.audio = audio;
  ctx.sceneMgr = new SceneManager(canvas, ctx.settings.quality);
  ctx.sceneMgr.setFov(ctx.settings.fov ?? GAME_CONFIG.camera.fov);
  ctx.viewmodel = new ViewModel(ctx.sceneMgr); // birinci şahıs: elimdeki silah ana görüntünün üstüne ayrı geçişte çizilir
  ctx.sceneMgr.addOverlay(ctx.viewmodel);
  ctx.input = new Input(canvas);

  setLoading('Ev yükleniyor…', 0.1);
  const house = await loadHouse(GAME_CONFIG.assets.house, (f) => setLoading('Ev yükleniyor…', 0.1 + f * 0.7));
  setLoading('Sistemler kuruluyor…', 0.85);
  ctx.world = new World({ sceneMgr: ctx.sceneMgr, house, quality: ctx.settings.quality });
  ctx.grab = ctx.world.grab;
  ctx.world.onSound = (name, pos) => audio.sfx(name, { pos, listener: ctx.sceneMgr.camera.position });
  ctx.world.onEffect = (name, arg) => ctx.effects?.[name]?.(arg);

  // ---- oyun sistemleri ----
  ctx.players = new PlayerManager();
  ctx.movement = new Movement();
  ctx.interaction = new Interaction();
  ctx.inventory = new Inventory();
  ctx.corpses = new CorpseManager();
  ctx.effects = new Effects(ctx.sceneMgr);
  ctx.knifeView = new KnifeView(ctx.sceneMgr);
  ctx.projectiles = new ProjectileView(ctx.sceneMgr); // roket / plazma mermisi ve kurulu bombalar
  ctx.net = new Multiplayer();
  ctx.client = new GameClient();
  ctx.voice = new VoiceManager();

  // Bakılan nesneyle etkileşim sağlayıcıları (en yakın isabet interaction.js içinde seçilir)
  ctx.interaction.addProvider((me) => ctx.grab.candidates(me));
  ctx.interaction.addProvider((me) => ctx.corpses.candidates(me));
  ctx.interaction.addProvider((me) => ctx.knifeView.candidates(me));

  // ---- arayüz ----
  const uiRoot = document.getElementById('ui');
  ctx.ui = new UI(uiRoot);
  ctx.chat = new ChatUI(uiRoot);
  ctx.lookName = new LookName(ctx.ui.hud); // nişangâhın altında bakılan kişinin adı
  ctx.radial = new RadialMenu(uiRoot); // Q: ses menüsü
  ctx.voiceRadial = new RadialMenu(uiRoot, VOICE_MENU); // C (basılı tut): fısıltı / normal / bağırma
  ctx.playerList = new PlayerList(uiRoot);
  ctx.debug = new DebugPanel(uiRoot); // yalnızca debug odasının host'unda açılır
  const mobile = isTouchDevice() ? new MobileControls(uiRoot) : null;

  ctx.client.attach(ctx.net);
  ctx.ui.attach(ctx.net);
  ctx.ui.showMenu();

  const code = new URLSearchParams(location.search).get('oda');
  if (code) ctx.ui.prefillJoin(code);

  // ---- imleç kilidi / duraklatma ----
  ctx.input.onLockChange((locked) => {
    if (locked) {
      ctx.ui.hidePause(false);
      return;
    }
    setTimeout(() => {
      if (isTouchDevice() || ctx.input.locked) return;
      const live = ctx.phase === 'playing' || ctx.phase === 'ended';
      if (!live) return;
      if (ctx.chat.box.classList.contains('typing') || ctx.playerList.sticky || ctx.ui.modalOpen()) return;
      ctx.ui.showPause();
    }, 60);
  });
  canvas.addEventListener('click', () => {
    audio.unlock();
    const live = ctx.phase === 'playing' || ctx.phase === 'ended';
    if (live && !isTouchDevice() && !ctx.ui.modalOpen() && !ctx.playerList.sticky) ctx.input.requestLock();
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && ctx.playerList.sticky) ctx.playerList.closeMenu(true);
  });

  // Collision_* nesneleri görünür (yarı saydam turuncu): F3 / debug paneli ile aç-kapa, seçim kaydedilir (varsayılan: açık)
  ctx.toggleCollisionView = () => {
    const on = ctx.world.setCollisionView(!ctx.world.collision.debugOn);
    ctx.settings.showCollision = on;
    store.set('settings', ctx.settings);
    ctx.ui.toast(on ? 'Çarpışma nesneleri görünür' : 'Çarpışma nesneleri gizli', 1200);
    return on;
  };
  if (ctx.world.collisionMode === 'collision' && ctx.settings.showCollision !== false) ctx.world.setCollisionView(false);

  window.__game = ctx; // hata ayıklama için konsoldan erişim
  setLoading('Hazır', 1);
  loadingEl?.classList.add('done');
  setTimeout(() => loadingEl?.remove(), 600);

  // ---- döngü ----
  let last = performance.now();
  let errored = false;
  const frame = (now) => {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0.0005, (now - last) / 1000));
    last = now;
    try {
      step(dt, mobile);
    } catch (e) {
      if (!errored) console.error('[döngü hatası]', e);
      errored = true;
    }
  };
  requestAnimationFrame(frame);
}

function step(dt, mobile) {
  const live = (ctx.phase === 'playing' || ctx.phase === 'ended') && !!ctx.me;

  ctx.world.update(dt);
  if (ctx.input.wasPressed(KEYS.collisionView)) ctx.toggleCollisionView();
  ctx.radial.update(dt); // fare hareketini (sanal imleç) kamera dönmeden ÖNCE tüketir
  ctx.voiceRadial.update(dt);
  ctx.playerList.update(dt);
  if (live) {
    ctx.grab.handleInput();
    ctx.movement.update(dt);
    ctx.grab.updateHeld(dt);
    ctx.inventory.update(dt);
    ctx.interaction.update();
  } else {
    ctx.movement.update(dt); // menü / lobi: evin etrafında dönen kamera
    ctx.interaction.update(); // (hiçbir şey yapmaz, öneriyi temizler)
  }
  ctx.chat.update();
  ctx.voice.update(dt);

  ctx.players.update(dt);
  ctx.viewmodel.update(dt);
  ctx.corpses.update(dt);
  ctx.effects.update(dt);
  ctx.knifeView.update(dt);
  ctx.projectiles.update(dt);

  if (ctx.isHost && ctx.host) ctx.host.update(dt);
  ctx.client.update(dt);

  ctx.ui.update(dt);
  ctx.lookName.update(dt);
  ctx.debug.update(dt);
  mobile?.update();
  ctx.sceneMgr.update(dt);
  ctx.sceneMgr.render();
  ctx.input.endFrame();
}

boot().catch((e) => {
  console.error(e);
  setLoading(`Başlatılamadı: ${e?.message || e}`, 1);
  loadingEl?.classList.add('error');
});
