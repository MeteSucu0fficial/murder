// Dünya: Blender modelinden tanınan her şeyi (kapılar, ışıklar, kafes...) tek çatı altında toplar.
// YENİ NESNE TÜRÜ EKLEMEK İÇİN: (1) config.js → NAME_RULES'a kural, (2) bir sistem sınıfı yaz, (3) aşağıdaki SYSTEM_DEFS'e ekle.
// Her sistem şu arayüzü uygular: interactables[], applyEvent(ev), hostAct(act), update(dt), getState(), setState(s), reset().
import * as THREE from 'three';
import { GAME_CONFIG, QUALITY_PRESETS } from './config.js';
import { ctx } from './context.js';
import { CollisionWorld } from './collision.js';
import { classify, createAnimationController, meshesOf } from './blenderLoader.js';
import { convertToLambert } from './scene.js';
import { DoorSystem } from './doors.js';
import { LightSystem } from './lights.js';
import { CageSystem } from './cage.js';
import { PaintingSystem } from './paintings.js';
import { LadderSystem } from './ladders.js';
import { MidPaintSystem } from './midPaints.js';
import { SpecialDoorSystem } from './specialDoor.js';
import { ExecutionSystem } from './execution.js';
import { GrabManager } from './grab.js';
import { printMapReport } from './mapReport.js';
import { baseKey, num, pick, sameName } from './util.js';

const SYSTEM_DEFS = [
  { key: 'doors', events: ['door'], make: (w, k) => new DoorSystem(w, k.door || []) },
  { key: 'lights', events: ['switch', 'light'], make: (w, k) => new LightSystem(w, k.light || [], k.switch || []) },
  { key: 'cage', events: ['cage'], make: (w, k) => new CageSystem(w, k.cage || [], k.cageButton || []) },
  { key: 'specialDoor', events: ['specialDoor'], make: (w, k) => new SpecialDoorSystem(w, k.specialDoor || [], k.specialDoorButton || []) },
  { key: 'paintings', events: ['painting'], make: (w, k) => new PaintingSystem(w, k.painting || []) },
  // Serbest dönen tablolar (MidPaint_*): ağ olayı yok; host simüle eder, 'mp' mesajıyla herkese yayar (midPaints.js)
  { key: 'midPaints', events: [], make: (w, k) => new MidPaintSystem(w, k.midPaint || []) },
  // Merdivenler (Ladder_*): yalnızca "kapsül değiyor mu?" sorgusu; tırmanma yerel oyuncuda (movement.js)
  { key: 'ladders', events: [], make: (w, k) => new LadderSystem(w, k.ladder || []) },
  { key: 'execution', events: ['execution'], make: (w, k) => new ExecutionSystem(w, k.executionLever || [], k.deathZone || []) },
];

const NON_STATIC_KINDS = [
  'door', 'cage', 'cageButton', 'specialDoor', 'specialDoorButton', 'painting', 'midPaint', 'ladder', 'grab', 'switch',
  'executionLever', 'deathZone', 'room', 'spawn', 'interact', 'light',
];

const _p = new THREE.Vector3();
const _box = new THREE.Box3();
const _ride = new THREE.Vector3();

export class World {
  constructor({ sceneMgr, house, quality = 'high' }) {
    this.sceneMgr = sceneMgr;
    this.quality = quality;
    this.source = house.source;
    this.root = house.root;
    sceneMgr.worldGroup.add(this.root);
    if (QUALITY_PRESETS[quality]?.lambert && house.source === 'glb') convertToLambert(this.root);

    this.model = classify(this.root);
    this.kinds = this.model.kinds;
    this._prepareShadows();
    this.collision = new CollisionWorld();
    this.platforms = []; // üzerindeki oyuncuları taşıyan hareketli zeminler (kafes)
    this.onSound = null;
    this.onEffect = null;
    this._buildStaticCollision();

    this.systems = {};
    this.byEvent = {};
    for (const def of SYSTEM_DEFS) {
      const sys = def.make(this, this.kinds);
      this.systems[def.key] = sys;
      for (const ev of def.events) this.byEvent[ev] = sys;
    }
    this.doors = this.systems.doors;
    this.lights = this.systems.lights;
    this.cage = this.systems.cage;
    this.specialDoor = this.systems.specialDoor;
    this.paintings = this.systems.paintings;
    this.midPaints = this.systems.midPaints;
    this.ladders = this.systems.ladders;
    this.execution = this.systems.execution;
    this.grab = new GrabManager(this, this.kinds.grab || []);
    this.anim = createAnimationController(this.root, house.animations);

    this._buildRooms();
    this._buildSpawns();
    this._collectInteractables();
    this.root.updateMatrixWorld(true);
    this.collision.refreshDynamic();
  }

  // ---------------- Kurulum ----------------
  /**
   * Fener (SpotLight) gölge haritası için: ev mesh'leri gölge düşürür ve alır → ışık duvarın arkasına geçmez.
   * shadowSide = DoubleSide: tek yüzeyli (ince) duvarlar da ışığı keser. Gölge kapalıysa (low kalite) bu bayrakların maliyeti yoktur.
   */
  _prepareShadows() {
    this.root.traverse((n) => {
      if (!n.isMesh) return;
      n.castShadow = true;
      n.receiveShadow = true;
      for (const m of Array.isArray(n.material) ? n.material : [n.material]) if (m) m.shadowSide = THREE.DoubleSide;
    });
  }

  /** Debug: haritada tanınan / tanınmayan / beklenip bulunamayan tüm nesneleri konsola yazar (js/mapReport.js). */
  logReport(opts) {
    try {
      return printMapReport(this, opts);
    } catch (err) {
      // Rapor yalnızca bir yardımcıdır: hata verirse oyun akışı (tur başlangıcı vb.) bozulmasın.
      console.error('[world] Harita raporu oluşturulamadı:', err);
      return null;
    }
  }

  _buildStaticCollision() {
    const meshes = [];
    for (const e of this.kinds.collision || []) meshes.push(...meshesOf(e.node));
    // Statik dünyada OLMAYAN türlerin mesh'leri (kapı, tablo, oda kutusu...): hareketliler kendi dinamik çarpışmasını kullanır; harita raporu da bunu listeler.
    const nonStatic = new Set();
    for (const k of NON_STATIC_KINDS) for (const e of this.kinds[k] || []) e.node.traverse((n) => nonStatic.add(n));
    this.nonStaticMeshes = nonStatic;
    this.collisionMode = meshes.length ? 'collision' : 'visible';
    if (!meshes.length) {
      // Collision_* yoksa görünür mesh'ler engel sayılır (hareketli/etkileşimli nesneler hariç)
      this.root.traverse((n) => {
        if (n.isMesh && n.visible && !nonStatic.has(n)) meshes.push(n);
      });
      console.warn('[world] "Collision_*" nesnesi bulunamadı; görünür mesh\'ler çarpışma olarak kullanılıyor.');
    }
    this.root.updateMatrixWorld(true);
    this.collision.buildStatic(meshes);
    const st = this.collision.stats;
    console.info(`[world] Statik çarpışma (${this.collisionMode === 'collision' ? 'Collision_* nesneleri' : 'görünür mesh\'ler'}): ${st.meshes} mesh, ${st.triangles} üçgen`);
  }

  /** Debug: çarpışma gövdesini tel kafes olarak göster / gizle (debug paneli). Dönüş: görünüm açık mı. */
  setCollisionView(on) {
    return this.collision.setDebugView(this.sceneMgr.scene, on);
  }

  /** Ayarlar → Işık efektleri: kapalıyken gerçek ışık (oda lambaları, fener, yakın görüş) çizilmez, ortam düz aydınlatılır (scene.js / lights.js). */
  setLightsEnabled(on) {
    this.sceneMgr.setLightsEnabled(on);
    this.lights?.setEnabled(on);
  }

  _buildRooms() {
    this.rooms = (this.kinds.room || []).map((e) => {
      const n = parseInt((e.name.match(/(\d+)/) || [])[1], 10);
      const size = e.box.getSize(new THREE.Vector3());
      return {
        id: e.name,
        label: Number.isFinite(n) ? `Oda ${n}` : e.name,
        box: e.box,
        center: e.box.getCenter(new THREE.Vector3()),
        volume: size.x * size.y * size.z,
      };
    });
  }

  _buildSpawns() {
    this.spawns = (this.kinds.spawn || []).map((e) => {
      const pos = e.position.clone();
      const floor = this.collision.floorAt(pos.x, pos.y + 0.6, pos.z, 0, 3);
      if (floor !== null) pos.y = floor;
      return { id: e.name, pos, yaw: e.yaw };
    });
    if (!this.spawns.length) {
      console.warn('[world] "Spawn_*" bulunamadı; varsayılan doğma noktası kullanılıyor.');
      this.spawns.push({ id: 'Spawn_default', pos: new THREE.Vector3(0, 0.1, 0), yaw: 0 });
    }
  }

  _collectInteractables() {
    const list = [];
    for (const sys of Object.values(this.systems)) if (sys.interactables) list.push(...sys.interactables);
    this.anchorLinks = []; // harita raporu için: her Interact_* hangi hedefe bağlandı
    // "Interact_<Hedef>" Empty'leri: hedef nesnenin etkileşim noktasını bu Empty'nin konumuna taşır
    for (const e of this.kinds.interact || []) {
      const target = e.name.replace(/^Interact[\s_.\-]*/i, '');
      const tk = baseKey(target);
      let best = null;
      for (const it of list) {
        if (!it.targetName) continue;
        if (sameName(it.targetName, target)) {
          best = it;
          break;
        }
        // "Interact_Door_01_Handle" → "Door_01" önekiyle eşleşir (sonraki karakter rakam olmamalı: Door_01 ≠ Door_010)
        const ik = baseKey(it.targetName);
        if (ik && tk.startsWith(ik) && !/\d/.test(tk[ik.length] ?? '') && (!best || it.targetName.length > best.targetName.length)) best = it;
      }
      if (best) {
        // Bakışa göre etkileşimde bu nokta bir "hedef küre"dir: oyuncu Empty'nin olduğu yere bakınca seçilir.
        // Küre yarıçapı Blender özel özelliği "hitRadius" ile (varsayılan: config.js → interaction.anchorRadius).
        best.position = e.position.clone();
        best.hitRadius = num(e.data.hitRadius, GAME_CONFIG.interaction.anchorRadius);
        best.anchored = true;
        this.anchorLinks.push({ name: e.name, target: best.targetName });
      } else {
        this.anchorLinks.push({ name: e.name, target: null });
        console.warn(`[world] ${e.name} için hedef nesne bulunamadı.`);
      }
    }
    this.interactables = list.filter((it) => !it.requireAnchor || it.anchored);
  }

  // ---------------- Ağ ----------------
  /** Etkileşim isteğini host'a gönderir. */
  send(act) {
    ctx.client?.sendAct(act);
  }
  applyEvent(ev) {
    this.byEvent[ev.k]?.applyEvent(ev);
  }
  /** HOST: isteği doğrular ve yayınlanacak olayı üretir (veya null). */
  hostAct(act, info) {
    return this.byEvent[act.k]?.hostAct(act, info) || null;
  }

  getState() {
    const s = { grab: this.grab.getState() };
    for (const [key, sys] of Object.entries(this.systems)) s[key] = sys.getState();
    return s;
  }
  setState(s) {
    if (!s) return;
    for (const [key, sys] of Object.entries(this.systems)) if (s[key]) sys.setState(s[key]);
    if (s.grab) this.grab.setState(s.grab);
  }
  reset() {
    for (const sys of Object.values(this.systems)) sys.reset();
    this.grab.reset();
  }

  update(dt) {
    this.anim.update(dt);
    for (const sys of Object.values(this.systems)) sys.update(dt);
    this.collision.refreshDynamic();
    this.grab.update(dt);
  }

  // ---------------- Sorgular ----------------
  /** Ayak konumuna göre oda (yoksa null). */
  roomAt(pos) {
    _p.set(pos.x, pos.y + 0.9, pos.z);
    let best = null;
    for (const r of this.rooms) if (r.box.containsPoint(_p) && (!best || r.volume < best.volume)) best = r;
    return best;
  }

  /** Odanın içinde rastgele (geçerli bir zemini olan) nokta. */
  randomPointInRoom(room) {
    const b = room.box;
    const size = b.getSize(new THREE.Vector3());
    for (let i = 0; i < 12; i++) {
      const x = room.center.x + (Math.random() - 0.5) * size.x * 0.7;
      const z = room.center.z + (Math.random() - 0.5) * size.z * 0.7;
      const y = this.collision.floorAt(x, b.min.y + 1.2, z, 0, 3);
      if (y === null) continue;
      // baş üstü boşluk kontrolü
      const head = this.collision.raycast(new THREE.Vector3(x, y + 0.1, z), new THREE.Vector3(0, 1, 0), 1.7);
      if (!head) return new THREE.Vector3(x, y + 0.02, z);
    }
    const y = this.collision.floorAt(room.center.x, b.min.y + 1.2, room.center.z, 0, 3);
    return new THREE.Vector3(room.center.x, (y ?? b.min.y) + 0.02, room.center.z);
  }

  /** Hareketli zemin (kafes) üzerinde duran oyuncuya bu karede uygulanacak kayma. */
  getRideDelta(pos) {
    for (const p of this.platforms) {
      const d = p.mover.delta;
      if (d.lengthSq() < 1e-10) continue;
      _box.setFromObject(p.node);
      if (pos.x > _box.min.x + 0.05 && pos.x < _box.max.x - 0.05 && pos.z > _box.min.z + 0.05 && pos.z < _box.max.z - 0.05 &&
          pos.y > _box.min.y - 0.3 && pos.y < _box.min.y + 0.7) {
        return _ride.copy(d);
      }
    }
    return null;
  }

  randomSpawn() {
    return pick(this.spawns);
  }

  /** Dünya sınırları (menü kamerası için). */
  get bounds() {
    return this.collision.bounds;
  }
}
