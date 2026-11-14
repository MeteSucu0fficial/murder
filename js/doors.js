// Kapılar: "Door_*" (Door_1, Door_.001, Door.001 ... hepsi tanınır). Menteşe noktası = Blender'daki nesne orijini (Y ekseni etrafında döner).
// Kapı kanadı HER ZAMAN katıdır: kendi mesh'i çarpışma olarak kalır, açıkken bile içinden geçilmez.
// Hareket ederken bir oyuncuya çarparsa (HOST kontrol eder) yönünü tersine çevirir:
//   açılırken çarparsa geri kapanır, kapanırken çarparsa geri açılır → oyuncu kapıya sıkışmaz.
import * as THREE from 'three';
import { GAME_CONFIG } from './config.js';
import { Tween } from './kinematic.js';
import { num, round3 } from './util.js';

const Y = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();

export class DoorSystem {
  constructor(world, entries) {
    this.world = world;
    this.doors = new Map();
    this.interactables = [];
    for (const e of entries) {
      const D = GAME_CONFIG.doors;
      const cfg = {
        openAngle: num(e.data.openAngle, D.openAngle),
        duration: num(e.data.duration, D.duration),
      };
      const node = e.node;
      node.updateWorldMatrix(true, false);
      const center = new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3());
      const hinge = node.getWorldPosition(new THREE.Vector3());
      const baseQuat = node.quaternion.clone();
      const parentQuat = node.parent ? node.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
      const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(parentQuat.multiply(baseQuat.clone()));
      const door = {
        id: e.name,
        node,
        cfg,
        tween: new Tween({ forward: cfg.duration, back: cfg.duration }),
        dir: 1,
        baseQuat,
        center,
        hinge,
        normal,
        blockCd: 0, // HOST: bir çarpmadan sonra kısa süre tekrar çarpma bakılmaz (ileri-geri titremesin)
        collider: world.collision.addDynamic(e.name, node),
      };
      this.doors.set(e.name, door);
      this.interactables.push({
        id: `door:${e.name}`,
        targetName: e.name,
        kind: 'door',
        priority: 4,
        position: center,
        object: node, // bakış ışını kapının kendisine değmeli
        label: () => (door.tween.target ? 'Kapıyı kapat' : 'Kapıyı aç'),
        use: (player) => {
          const side = player ? Math.sign(_p.subVectors(player.pos, door.hinge).dot(door.normal)) || 1 : 1;
          world.send({ k: 'door', id: e.name, side });
        },
      });
    }
  }

  _apply(d) {
    const ang = d.dir * d.cfg.openAngle * d.tween.eased;
    d.node.quaternion.copy(d.baseQuat).multiply(_q.setFromAxisAngle(Y, ang));
    d.collider.enabled = true; // açıkken de katı
    d.node.updateMatrixWorld(true);
  }

  applyEvent(ev) {
    const d = this.doors.get(ev.id);
    if (!d) return;
    // Açılırken yön seçilir (oyuncunun karşı tarafına doğru savrulur); kapanırken aynı yön korunur
    if (ev.o && d.tween.p < 0.02) d.dir = ev.d >= 0 ? 1 : -1;
    d.tween.set(ev.o, ev.p);
    this._apply(d);
    if (this.world.onSound) this.world.onSound('door', d.center);
  }

  hostAct(act) {
    const d = this.doors.get(act.id);
    if (!d) return null;
    return { k: 'door', id: d.id, o: d.tween.target ? 0 : 1, d: act.side >= 0 ? 1 : -1, p: round3(d.tween.p) };
  }

  /**
   * HOST: hareket halindeki kapılar için "birine çarptı mı" kontrolü.
   * targets: [{ pos }] canlı oyuncuların ayak konumları. Dönüş: herkese yayınlanacak kapı olayları (yön tersine çevrilmiş).
   * Çarpma yalnızca kapı HAREKET EDERKEN aranır; duran kapıya yaslanan oyuncu sayılmaz (blockMargin toleransı).
   */
  hostBlockCheck(targets, dt) {
    const D = GAME_CONFIG.doors;
    const P = GAME_CONFIG.player;
    const out = [];
    if (!D.reverseOnBlock) return out;
    for (const d of this.doors.values()) {
      if (d.blockCd > 0) d.blockCd = Math.max(0, d.blockCd - dt);
      if (d.blockCd > 0 || d.tween.p === d.tween.target) continue; // duruyor
      for (const t of targets) {
        if (!this.world.collision.overlapsDynamic(d.id, t.pos, P.radius, P.height, D.blockMargin)) continue;
        d.tween.set(d.tween.target ? 0 : 1); // ilerleme (p) korunur, yalnızca hedef tersine döner
        d.blockCd = D.blockCooldown;
        out.push({ k: 'door', id: d.id, o: d.tween.target, d: d.dir, p: round3(d.tween.p), bump: 1 });
        break;
      }
    }
    return out;
  }

  update(dt) {
    for (const d of this.doors.values()) if (d.tween.update(dt)) this._apply(d);
  }

  getState() {
    const s = {};
    for (const d of this.doors.values()) s[d.id] = { ...d.tween.getState(), d: d.dir };
    return s;
  }
  setState(s) {
    for (const [id, st] of Object.entries(s || {})) {
      const d = this.doors.get(id);
      if (!d) continue;
      d.dir = st.d >= 0 ? 1 : -1;
      d.tween.setState(st);
      this._apply(d);
    }
  }
  reset() {
    for (const d of this.doors.values()) {
      d.tween.set(0, 0);
      d.dir = 1;
      d.blockCd = 0;
      this._apply(d);
    }
  }
}
