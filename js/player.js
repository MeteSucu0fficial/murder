// Oyuncu varlıkları ve avatar sistemi.
// Karakter görünümü DEĞİŞTİRİLEBİLİR: registerAvatar('adi', (opts) => new MyAvatar(opts)); setAvatarKind('adi');
// Varsayılan model: humanAvatar.js (ceset modeliyle aynı kollu bacaklı gövde + basit yürüme / koşma / eğilme animasyonu).
// Avatar arayüzü: { group, setColor(hex), setEquipment(type|null), setPitch(rad), setFlashlight(bool), setMoving(0..2), setCrouch(0..1),
//                   setVisible(bool), update(dt), dispose() }   ← fener ışığı sahnedeki SpotLight'tan gelir; avatarda görünür ışık konisi yoktur
import * as THREE from 'three';
import { GAME_CONFIG, IDENTITY } from './config.js';
import { ctx } from './context.js';
import { clamp, damp, lerpAngle } from './util.js';
import { HumanAvatar } from './humanAvatar.js';
import { skinTone } from './ragdoll.js';

const P = GAME_CONFIG.player;

// ---- Avatar kayıt tablosu: yeni karakter modelleri buradan eklenir ----
export const AVATAR_FACTORIES = { human: (opts) => new HumanAvatar(opts) };
let avatarKind = 'human';
export const registerAvatar = (name, factory) => (AVATAR_FACTORIES[name] = factory);
export const setAvatarKind = (name) => AVATAR_FACTORIES[name] && (avatarKind = name);
export const createAvatar = (opts) => AVATAR_FACTORIES[avatarKind](opts);

export class PlayerEntity {
  constructor(id, name, isLocal = false) {
    this.id = id;
    this.name = name;
    this.isLocal = isLocal;
    this.alive = true;
    this.identity = { label: IDENTITY.voice.workerName, color: IDENTITY.voice.workerColor, colorName: 'Gri', code: '' };
    this.pos = new THREE.Vector3();
    this.netPos = new THREE.Vector3();
    this.netVel = new THREE.Vector3(); // konum paketlerinden tahmin edilen hız (m/sn): ölüm itişine "momentum" katar (combat.js → deathImpulse)
    this._netT = 0; // son konum paketinin zamanı (performance.now)
    this.yaw = 0; // gövde yönü
    this.netYaw = 0;
    this.pitch = 0;
    this.netPitch = 0;
    this.speed = 0; // 0 dur, 1 yürü, 2 koş (animasyon)
    this.eq = { out: false, type: null };
    this.flashlight = false;
    this.holding = null;
    this.carrying = null;
    this.talkLevel = GAME_CONFIG.voice.defaultLevel;
    this.talking = false;
    this.crouch = false; // eğiliyor (ağdan gelir; yerel oyuncuda movement.js yazar)
    this.wishX = 0; // yerel oyuncunun "istediği" yatay hız (m/sn): konum paketiyle host'a gider; dönen tabloyu itmek için (midPaints.js)
    this.wishZ = 0;
    this.eyeH = P.eyeHeight; // yumuşatılmış göz yüksekliği (eğilince alçalır)
    this.frozenLeft = 0; // hareket edemez (uyurgezer, elektroşok)
    this.hideBody = false; // kamera bu oyuncunun gözünde (kendim / izlediğim): gövdesi çizilmez
    this.hasNet = false;
    this.air = false; // havada (zıplıyor / düşüyor): animasyon (ağdan gelir; yerel oyuncuda movement.js yazar)
    this.climbing = false; // tırmanıyor
    this.invisible = false; // debug: görünmez (başkaları gövdesini görmez)
    this.umaci = false; // Umacı yeteneği açık (host belirler): hareketsizken gövde çizilmez, hareket edince dalgalanır; adı görünmez, içinden geçilir
    this.avatar = createAvatar({ color: this.identity.color, skin: skinTone(id) }); // kafa / eller: kimlikten sabit ten rengi (açık ya da kahverengi)
    ctx.sceneMgr.actorGroup.add(this.avatar.group);
  }

  setIdentity(idn) {
    this.identity = idn;
    this.avatar.setColor(idn.color);
    this.avatar.setFace?.(idn.face);
  }

  setAlive(alive) {
    this.alive = alive;
    this.avatar.setVisible(alive);
    if (!alive) {
      this.flashlight = false;
      this.avatar.setFlashlight(false);
      this.eq.out = false;
    }
  }

  teleport(x, y, z) {
    this.pos.set(x, y, z);
    this.netPos.set(x, y, z);
    this.netVel.set(0, 0, 0);
    this.hasNet = true;
  }

  /** Diğer oyuncunun gönderdiği konum mesajı */
  applyNet(m) {
    const now = performance.now();
    const dtN = (now - this._netT) / 1000;
    if (this.hasNet && dtN > 0.01 && dtN < 0.5) {
      // yatay hız (düşüş / zıplama ölüm itişine karışmasın diye y alınmaz); ani sıçramalara (ışınlanma) karşı sınırlı, kaba bir yumuşatma
      const k = 0.5;
      const vx = Math.max(-9, Math.min(9, (m.x - this.netPos.x) / dtN));
      const vz = Math.max(-9, Math.min(9, (m.z - this.netPos.z) / dtN));
      this.netVel.x += (vx - this.netVel.x) * k;
      this.netVel.z += (vz - this.netVel.z) * k;
    } else {
      this.netVel.set(0, 0, 0);
    }
    this._netT = now;
    this.netPos.set(m.x, m.y, m.z);
    this.netYaw = m.yaw;
    this.netPitch = m.pitch;
    this.speed = m.m || 0;
    this.crouch = !!m.cr;
    this.flashlight = !!m.f;
    this.talkLevel = m.tl ?? this.talkLevel;
    this.talking = !!m.tk;
    this.holding = m.h?.i ?? null;
    this.carrying = m.c?.i ?? null;
    this.air = !!m.ar;
    this.climbing = !!m.cl;
    this.invisible = !!m.iv;
    this.umaci = !!m.um;
    if (!this.hasNet) {
      this.pos.copy(this.netPos);
      this.yaw = this.netYaw;
      this.hasNet = true;
    }
  }

  update(dt) {
    if (!this.isLocal) {
      const k = 1 - Math.exp(-GAME_CONFIG.net.interpolation * dt);
      if (this.pos.distanceToSquared(this.netPos) > 36) this.pos.copy(this.netPos);
      else this.pos.lerp(this.netPos, k);
      this.yaw = lerpAngle(this.yaw, this.netYaw, k);
      this.pitch += (this.netPitch - this.pitch) * k;
      this.eyeH = damp(this.eyeH, this.crouch ? P.crouchEyeHeight : P.eyeHeight, P.crouchBlend, dt);
    }
    const a = this.avatar;
    // Umacı: görünmezken yalnızca HAREKET EDERKEN (yürü / koş / zıpla / tırman) dalgalanma efekti çizilir; durunca gövde hiç çizilmez
    const cloak = this.umaci && this.alive;
    const moving = this.speed > 0 || this.air || this.climbing;
    const shown = this.alive && !this.hideBody && !this.invisible && (!cloak || moving);
    a.setVisible(shown);
    a.setShimmer?.(cloak);
    a.group.position.copy(this.pos);
    a.group.rotation.y = this.yaw;
    a.setPitch(this.pitch);
    a.setEquipment(this.alive && this.eq.out ? this.eq.type : null);
    const lit = this.alive && this.flashlight && !this.invisible && !cloak;
    a.setFlashlight(lit);
    a.setMoving(this.speed);
    a.setCrouch(clamp((P.eyeHeight - this.eyeH) / (P.eyeHeight - P.crouchEyeHeight), 0, 1));
    a.setAir?.(this.air);
    a.setClimb?.(this.climbing);
    a.setCarry?.(this.carrying ? 'corpse' : this.holding ? 'obj' : null);
    if (shown || this.alive) a.update(dt);
    if (this.frozenLeft > 0) this.frozenLeft = Math.max(0, this.frozenLeft - dt);
  }

  /** Tek seferlik hareket: 'stab' | 'throw' | 'shoot' | 'zap' | 'rocket' | 'plant' (saldıran oyuncunun modelinde oynar). */
  playAction(kind) {
    this.avatar.playAction?.(kind);
  }

  dispose() {
    this.avatar.dispose();
  }
}

export class PlayerManager {
  constructor() {
    this.map = new Map();
  }
  get(id) {
    return this.map.get(id);
  }
  ensure(id, name, isLocal = false) {
    let p = this.map.get(id);
    if (!p) {
      p = new PlayerEntity(id, name, isLocal);
      this.map.set(id, p);
    } else if (name) p.name = name;
    return p;
  }
  remove(id) {
    const p = this.map.get(id);
    if (!p) return;
    p.dispose();
    this.map.delete(id);
  }
  all() {
    return [...this.map.values()];
  }
  alive() {
    return this.all().filter((p) => p.alive);
  }
  update(dt) {
    for (const p of this.map.values()) p.update(dt);
  }
  clear() {
    for (const id of [...this.map.keys()]) this.remove(id);
  }
}
