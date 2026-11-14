// Ortak hareket yapı taşları: Tween (0..1 yumuşak geçiş), LinearMover (çizgisel hareket), MoverSystem (kafes / hareketli duvar).
// Animasyonlar Blender'da klip olmasa bile JS ile üretilir. Durum ağda {o: hedef(0/1), p: ilerleme} olarak taşınır.
import * as THREE from 'three';
import { easeInOut, num, vec3, round3 } from './util.js';

export class Tween {
  constructor({ forward = 1, back = 1 } = {}) {
    this.p = 0;
    this.target = 0;
    this.forward = forward;
    this.back = back;
  }
  set(target, p = null) {
    this.target = target ? 1 : 0;
    if (p != null && Number.isFinite(p)) this.p = Math.min(1, Math.max(0, p));
  }
  get eased() {
    return easeInOut(this.p);
  }
  /** Değiştiyse true döner. */
  update(dt) {
    if (this.p === this.target) return false;
    const dur = Math.max(0.01, this.target ? this.forward : this.back);
    this.p = this.target ? Math.min(1, this.p + dt / dur) : Math.max(0, this.p - dt / dur);
    return true;
  }
  getState() {
    return { o: this.target, p: round3(this.p) };
  }
  setState(s) {
    this.target = s.o ? 1 : 0;
    this.p = s.p ?? this.target;
  }
}

/** Nesneyi dünya uzayında bir doğrultu boyunca hareket ettirir (ebeveyn dönüşümünden bağımsız). */
export class LinearMover {
  constructor(obj, { direction, distance, forward, back, startOffset = 0 }) {
    this.obj = obj;
    this.tween = new Tween({ forward, back });
    obj.updateWorldMatrix(true, false);
    this.base = obj.getWorldPosition(new THREE.Vector3());
    this.dir = new THREE.Vector3(...direction).normalize();
    this.distance = distance;
    this.startOffset = startOffset;
    this.current = this.worldAt(0);
    this.delta = new THREE.Vector3();
    this.apply();
  }
  worldAt(p) {
    return this.base.clone().addScaledVector(this.dir, this.startOffset + this.distance * p);
  }
  apply() {
    const target = this.worldAt(this.tween.eased);
    this.delta.subVectors(target, this.current);
    this.current.copy(target);
    this.obj.position.copy(this.obj.parent ? this.obj.parent.worldToLocal(target.clone()) : target);
    this.obj.updateMatrixWorld(true);
  }
  update(dt) {
    if (!this.tween.update(dt)) {
      this.delta.set(0, 0, 0);
      return false;
    }
    this.apply();
    return true;
  }
}

/**
 * Düğme ile açılıp kapanan hareketli nesne sistemi (Cage + Cage_Button, Special_Door + Special_Door_Button).
 * Çarpışması nesnenin kendi mesh'inden gelir ve hareketle birlikte güncellenir.
 */
export class MoverSystem {
  constructor(world, { k, entries, buttons, defaults, labels, platform = false }) {
    this.k = k;
    this.world = world;
    this.interactables = [];
    this.mover = null;
    this.labels = labels;
    const e = entries[0];
    if (e) {
      const d = e.data;
      const cfg = {
        moveDistance: num(d.moveDistance, defaults.moveDistance),
        moveDuration: num(d.moveDuration, defaults.moveDuration),
        riseDuration: num(d.riseDuration, defaults.riseDuration ?? defaults.moveDuration),
        startOffset: num(d.startOffset, defaults.startOffset ?? 0),
        direction: vec3(d.direction, defaults.direction),
      };
      this.cfg = cfg;
      this.mover = new LinearMover(e.node, {
        direction: cfg.direction,
        distance: cfg.moveDistance,
        forward: cfg.moveDuration,
        back: cfg.riseDuration,
        startOffset: cfg.startOffset,
      });
      this.node = e.node;
      world.collision.addDynamic(e.name, e.node);
      if (platform) world.platforms.push({ id: e.name, node: e.node, mover: this.mover });
    }
    const toggle = () => world.send({ k });
    const label = () => (this.mover && this.mover.tween.target ? labels.close : labels.open);
    for (const b of buttons) {
      const center = new THREE.Box3().setFromObject(b.node).getCenter(new THREE.Vector3());
      this.interactables.push({
        id: `${k}:${b.name}`,
        targetName: b.name,
        kind: 'button',
        priority: 3,
        position: center,
        object: b.node, // bakış ışını düğmenin kendisine değmeli
        hitRadius: 0.1,
        label,
        use: toggle,
      });
    }
    if (e) {
      // "Interact_<Cage>" gibi bir Empty ile doğrudan nesneye etkileşim noktası bağlanabilsin
      this.interactables.push({
        id: `${k}:${e.name}`,
        targetName: e.name,
        kind: 'button',
        priority: 3,
        position: new THREE.Box3().setFromObject(e.node).getCenter(new THREE.Vector3()),
        requireAnchor: true,
        label,
        use: toggle,
      });
    }
  }

  applyEvent(ev) {
    if (!this.mover) return;
    this.mover.tween.set(ev.o, ev.p);
    this.mover.apply();
  }
  hostAct() {
    if (!this.mover) return null;
    return { k: this.k, o: this.mover.tween.target ? 0 : 1, p: round3(this.mover.tween.p) };
  }
  update(dt) {
    this.mover?.update(dt);
  }
  getState() {
    return this.mover ? this.mover.tween.getState() : null;
  }
  setState(s) {
    if (!this.mover || !s) return;
    this.mover.tween.setState(s);
    this.mover.apply();
  }
  reset() {
    if (!this.mover) return;
    this.mover.tween.set(0, 0);
    this.mover.apply();
  }
}
