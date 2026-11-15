
// Başlangıç noktası: sahneyi, evi (GLB veya örnek ev), sistemleri ve arayüzü kurar; oyun döngüsünü çalıştırır.
// Modüller birbirini doğrudan import etmek yerine ortak `ctx` nesnesi üzerinden konuşur (bkz. context.js).
import { GAME_CONFIG } from './config.js';
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
import { TrollHacks, XRay } from './troll.js';
import { store } from './util.js';
import { FACES } from './faces.js';
import { loadKeys } from './keybinds.js';
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
  initTabGuard();
  ctx.settings.quality = ctx.settings.quality || GAME_CONFIG.graphics.quality;
  audio.setVolume(ctx.settings.volume);
  loadKeys();

  // ---- sahne ----
  const canvas = document.getElementById('game');
  ctx.audio = audio;
  ctx.sceneMgr = new SceneManager(canvas, ctx.settings.quality);
  ctx.sceneMgr.setFov(ctx.settings.fov ?? GAME_CONFIG.camera.fov);
  ctx.viewmodel = new ViewModel(ctx.sceneMgr);
  ctx.sceneMgr.addOverlay(ctx.viewmodel);
  ctx.input = new Input(canvas);

  setLoading('Ev yükleniyor…', 0.1);
  const house = await loadHouse(
    GAME_CONFIG.assets.house,
    (f) => setLoading('Ev yükleniyor…', 0.1 + f * 0.7)
  );

  setLoading('Yüzler yükleniyor…', 0.82);
  // assets/faces listesi (en çok 2,5 sn beklenir; liste gecikirse oyun yine açılır, yüzler sonradan görünür)
  await Promise.race([FACES.init(), new Promise((resolve) => setTimeout(resolve, 2500))]);

  setLoading('Sistemler kuruluyor…', 0.85);
  ctx.world = new World({
    sceneMgr: ctx.sceneMgr,
    house,
    quality: ctx.settings.quality
  });
  ctx.world.setLightsEnabled(ctx.settings.lights !== false); // Ayarlar → Işık efektleri (varsayılan açık)

  ctx.grab = ctx.world.grab;
  ctx.world.onSound = (name, pos) =>
    audio.sfx(name, {
      pos,
      listener: ctx.sceneMgr.camera.position
    });

  ctx.world.onEffect = (name, arg) =>
    ctx.effects?.[name]?.(arg);

  // ---- oyun sistemleri ----
  ctx.players = new PlayerManager();
  ctx.movement = new Movement();
  ctx.interaction = new Interaction();
  ctx.inventory = new Inventory();
  ctx.corpses = new CorpseManager();
  ctx.effects = new Effects(ctx.sceneMgr);
  ctx.knifeView = new KnifeView(ctx.sceneMgr);
  ctx.projectiles = new ProjectileView(ctx.sceneMgr);
  ctx.net = new Multiplayer();
  ctx.client = new GameClient();
  ctx.voice = new VoiceManager();

  // Bakılan nesneyle etkileşim sağlayıcıları
  ctx.interaction.addProvider((me) => ctx.grab.candidates(me));
  ctx.interaction.addProvider((me) => ctx.corpses.candidates(me));
  ctx.interaction.addProvider((me) => ctx.knifeView.candidates(me));

  // ---- arayüz ----
  const uiRoot = document.getElementById('ui');
  ctx.ui = new UI(uiRoot);
  ctx.chat = new ChatUI(uiRoot);
  ctx.lookName = new LookName(ctx.ui.hud);
  ctx.radial = new RadialMenu(uiRoot);
  ctx.voiceRadial = new RadialMenu(uiRoot, VOICE_MENU);
  ctx.playerList = new PlayerList(uiRoot);
  ctx.debug = new DebugPanel(uiRoot);
  ctx.xray = new XRay(uiRoot);

  ctx.client.attach(ctx.net);
  ctx.ui.attach(ctx.net);
  ctx.ui.showMenu();

  // Davet bağlantısı: sayfa#KOD (GitHub gibi sitelerde ?oda=KOD kabul edilmiyor); eski ?oda=KOD bağlantıları da çalışır.
  // Sayfa açıkken yeni bir #KOD yapıştırılırsa (yalnızca hash değişir, sayfa yenilenmez) kod yine doldurulur.
  const inviteCode = () => {
    let c = location.hash.slice(1);
    try {
      c = decodeURIComponent(c);
    } catch (e) {
      /* bozuk % dizisi: olduğu gibi kullan */
    }
    c = c.replace(/^oda=/i, '') || new URLSearchParams(location.search).get('oda') || '';
    return c.replace(/[^A-Za-z0-9]/g, '').slice(0, 8);
  };
  const applyInvite = () => {
    const c = inviteCode();
    if (c) ctx.ui.prefillJoin(c);
  };
  applyInvite();
  window.addEventListener('hashchange', applyInvite);

  // ---- imleç kilidi / duraklatma ----
  ctx.input.onLockChange((locked) => {
    if (locked) {
      ctx.ui.hidePause(false);
      return;
    }

    setTimeout(() => {
      if (ctx.input.locked) return;

      const live = ctx.phase === 'playing' || ctx.phase === 'ended';
      if (!live) return;

      if (
        ctx.chat.box.classList.contains('typing') ||
        ctx.playerList.sticky ||
        ctx.ui.modalOpen()
      ) return;

      ctx.ui.showPause();
    }, 60);
  });

  canvas.addEventListener('click', () => {
    audio.unlock();

    const live = ctx.phase === 'playing' || ctx.phase === 'ended';

    if (
      live &&
      !ctx.ui.modalOpen() &&
      !ctx.playerList.sticky
    ) {
      ctx.input.requestLock();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && ctx.playerList.sticky) {
      ctx.playerList.closeMenu(true);
    }
  });

  // Çarpışma görünümü (Collision_* nesneleri) artık kısayol tuşuyla açılmaz: yalnızca debug / TrollHacks panelinden (varsayılan kapalı).

  window.__game = ctx;

  setLoading('Hazır', 1);
  loadingEl?.classList.add('done');
  setTimeout(() => loadingEl?.remove(), 600);

  // ---- oyun döngüsü ----
  let last = performance.now();
  let errored = false;

  const frame = (now) => {
    requestAnimationFrame(frame);

    const dt = Math.min(0.05, Math.max(0.0005, (now - last) / 1000));
    last = now;

    try {
      step(dt);
    } catch (e) {
      if (!errored) console.error('[döngü hatası]', e);
      errored = true;
    }
  };

  requestAnimationFrame(frame);
}

let trollErrored = false;

function step(dt) {
  const live =
    (ctx.phase === 'playing' || ctx.phase === 'ended') &&
    !!ctx.me;

  ctx.world.update(dt);

  ctx.radial.update(dt);
  ctx.voiceRadial.update(dt);
  ctx.playerList.update(dt);

  if (live) {
    ctx.grab.handleInput();
    ctx.movement.update(dt);
    ctx.grab.updateHeld(dt);
    ctx.inventory.update(dt);
    ctx.interaction.update();
  } else {
    ctx.movement.update(dt);
    ctx.interaction.update();
  }

  ctx.chat.update();
  ctx.voice.update(dt);

  ctx.players.update(dt);
  ctx.viewmodel.update(dt);
  ctx.corpses.update(dt);
  ctx.effects.update(dt);
  ctx.knifeView.update(dt);
  ctx.projectiles.update(dt);

  if (ctx.isHost && ctx.host) {
    ctx.host.update(dt);
  }

  ctx.client.update(dt);

  ctx.ui.update(dt);
  ctx.lookName.update(dt);
  ctx.debug.update(dt);
  try {
    TrollHacks.update(dt);
    ctx.xray.update();
  } catch (e) {
    // hile araçlarındaki bir hata oyunun çizimini durdurmasın
    if (!trollErrored) console.error('[TrollHacks / X-ray hatası]', e);
    trollErrored = true;
  }

  ctx.sceneMgr.update(dt);
  ctx.sceneMgr.render();

  ctx.input.endFrame();
}

boot().catch((e) => {
  console.error(e);
  setLoading(`Başlatılamadı: ${e?.message || e}`, 1);
  loadingEl?.classList.add('error');
});
