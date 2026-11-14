// İdam sistemi: "Execution_*" ŞALTERİ + "DeathZone" alanı (ikisi de Blender'da tanımlanır).
//  • Şalter bir AÇ / KAPA anahtarıdır (düğme değil): bir kez çevirince açık kalır, tekrar çevirince kapanır.
//  • AÇIKKEN alanın (DeathZone) içindeki herkes her `interval` saniyede `damage` hasar alır (hasarı HOST hesaplar).
//  • Şalter kolu animasyonla döner; alan açıkken kırmızı parıldar. Birden çok şalter aynı durumu paylaşır.
// Şalter kolu: Execution_* düğümünün altında adında handle/arm/kol/stick geçen bir alt nesne varsa o döner (pivot = kendi orijini);
// yoksa düğümün kendisi döner. Eksen / açı / süre Blender özel özellikleriyle (veya OBJECT_OVERRIDES ile) ayarlanır:
//   axis: 'x' | 'y' | 'z' (varsayılan x), leverAngle (rad, eksi = ters yön), leverTime (sn), damage (alan başına hasar).
import * as THREE from 'three';
import { GAME_CONFIG } from './config.js';
import { Tween } from './kinematic.js';
import { num, round3 } from './util.js';

const HANDLE_NAME = /(handle|arm|stick|knob|lever_?bar|kol|sap)/i;
const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const _q = new THREE.Quaternion();
const _tmp = new THREE.Vector3();
const PROBE_HEIGHTS = [0.15, 0.9, 1.6]; // ayak / göğüs / baş: ince zemin alanları da algılansın

const glowMat = () =>
  new THREE.MeshBasicMaterial({
    color: 0xff2a14,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

export class ExecutionSystem {
  constructor(world, leverEntries, zoneEntries) {
    this.world = world;
    const X = GAME_CONFIG.execution;
    this.cfg = X;
    this.on = false;
    this.acc = 0; // HOST: bir sonraki hasar vuruşuna kalan birikim
    this.toggleCd = 0; // HOST: üst üste çevirmeyi önleyen bekleme
    this.pulse = 0;
    this.glow = 0; // 0..1 yumuşak parıltı
    this.interactables = [];

    this.zones = zoneEntries.map((e) => ({ id: e.name, box: e.box.clone(), damage: num(e.data.damage, X.damage) }));
    this.glowMeshes = [];
    for (const z of this.zones) {
      const size = z.box.getSize(new THREE.Vector3());
      const center = z.box.getCenter(new THREE.Vector3());
      const volume = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.05, size.x), Math.max(0.05, size.y), Math.max(0.05, size.z)), glowMat());
      volume.position.copy(center);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(0.05, size.x), Math.max(0.05, size.z)), glowMat());
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(center.x, z.box.min.y + 0.03, center.z);
      for (const m of [volume, floor]) {
        m.visible = false;
        m.renderOrder = 6;
        m.castShadow = false;
        m.receiveShadow = false;
        world.sceneMgr.worldGroup.add(m);
      }
      this.glowMeshes.push({ volume, floor });
    }

    this.levers = leverEntries.map((e) => {
      const node = e.node;
      const handle = node.children.find((c) => HANDLE_NAME.test(c.name)) || node;
      const axisKey = String(e.data.axis || 'x').toLowerCase();
      const lever = {
        id: e.name,
        node,
        handle,
        axis: AXES[axisKey] || AXES.x,
        angle: num(e.data.leverAngle, X.leverAngle),
        baseQuat: handle.quaternion.clone(),
        tween: new Tween({ forward: num(e.data.leverTime, X.leverTime), back: num(e.data.leverTime, X.leverTime) }),
      };
      this._applyLever(lever);
      const center = new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3());
      this.interactables.push({
        id: `execution:${e.name}`,
        targetName: e.name,
        kind: 'button',
        priority: 3,
        position: center,
        object: node, // bakış ışını şalterin kendisine değmeli
        hitRadius: 0.12,
        label: () => (this.on ? 'İdam şalterini KAPAT' : 'İdam şalterini AÇ'),
        use: () => world.send({ k: 'execution' }),
      });
      return lever;
    });
  }

  _applyLever(l) {
    l.handle.quaternion.copy(l.baseQuat).multiply(_q.setFromAxisAngle(l.axis, l.angle * l.tween.eased));
    l.handle.updateMatrixWorld(true);
  }

  /** Ayak konumu (pos) herhangi bir DeathZone içinde mi? Ayak, göğüs ve baş noktalarından biri yeter. */
  zoneAt(pos) {
    for (const z of this.zones) {
      for (const h of PROBE_HEIGHTS) if (z.box.containsPoint(_tmp.set(pos.x, pos.y + h, pos.z))) return z;
    }
    return null;
  }
  inside(pos) {
    return !!this.zoneAt(pos);
  }

  // ---------------- Ağ ----------------
  /** HOST: şalteri çevirir (çok hızlı üst üste çevirme engellenir). */
  hostAct() {
    if (this.toggleCd > 0) return null;
    this.toggleCd = this.cfg.toggleCooldown;
    const lever = this.levers[0];
    return { k: 'execution', on: this.on ? 0 : 1, p: lever ? round3(lever.tween.p) : 0 };
  }
  applyEvent(ev) {
    this.on = !!ev.on;
    this.acc = 0;
    for (const l of this.levers) {
      l.tween.set(this.on ? 1 : 0, ev.p);
      this._applyLever(l);
    }
    if (this.world.onSound) this.world.onSound('click', null);
  }

  /**
   * HOST: şalter AÇIKKEN her `interval` saniyede bir çağrılır → alandaki canlı oyunculara hasar listesi döner.
   * players: [{ id, pos }] (ayak konumları). Alanda kimse yoksa ya da şalter kapalıysa boş liste.
   */
  hostTick(dt, players) {
    if (!this.on || !this.zones.length) {
      this.acc = 0;
      return [];
    }
    this.acc += dt;
    if (this.acc < this.cfg.interval) return [];
    this.acc = Math.min(this.acc - this.cfg.interval, this.cfg.interval);
    const hits = [];
    for (const p of players) {
      const z = this.zoneAt(p.pos);
      if (z) hits.push({ id: p.id, dmg: z.damage });
    }
    return hits;
  }

  update(dt) {
    if (this.toggleCd > 0) this.toggleCd = Math.max(0, this.toggleCd - dt);
    for (const l of this.levers) if (l.tween.update(dt)) this._applyLever(l);
    // alan parıltısı
    this.pulse += dt;
    this.glow += ((this.on ? 1 : 0) - this.glow) * Math.min(1, dt * 6);
    const show = this.glow > 0.01;
    const beat = 0.5 + 0.5 * Math.sin(this.pulse * 7);
    for (const g of this.glowMeshes) {
      g.volume.visible = g.floor.visible = show;
      if (!show) continue;
      g.volume.material.opacity = this.glow * (0.07 + 0.07 * beat);
      g.floor.material.opacity = this.glow * (0.28 + 0.22 * beat);
    }
  }

  getState() {
    const l = this.levers[0];
    return { on: this.on ? 1 : 0, p: l ? round3(l.tween.p) : this.on ? 1 : 0 };
  }
  setState(s) {
    this.on = !!s?.on;
    this.glow = this.on ? 1 : 0;
    for (const l of this.levers) {
      l.tween.set(this.on ? 1 : 0, s?.p ?? (this.on ? 1 : 0));
      this._applyLever(l);
    }
  }
  reset() {
    this.on = false;
    this.acc = 0;
    this.toggleCd = 0;
    this.glow = 0;
    for (const l of this.levers) {
      l.tween.set(0, 0);
      this._applyLever(l);
    }
    for (const g of this.glowMeshes) g.volume.visible = g.floor.visible = false;
  }
}
