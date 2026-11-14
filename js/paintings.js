// Hareketli tablolar: "Painting_*". Her tablonun açık ve kapalı konumu config.js → PAINTING_CONFIG'ten ayrı ayrı ayarlanır.
// Tabloya doğrudan tıklanınca (boş el) veya E ile açılıp kapanır; durum herkese senkronize edilir.
// Tablolar KATIDIR (içinden geçilmez): kendi mesh'leri dinamik çarpışma olarak kaydedilir ve kayarken birlikte hareket eder.
// (Pivot etrafında serbestçe dönen tablolar için bkz. midPaints.js → "MidPaint_*".)
import * as THREE from 'three';
import { GAME_CONFIG, PAINTING_CONFIG } from './config.js';
import { Tween } from './kinematic.js';
import { lookupName, num, round3 } from './util.js';

const _raycaster = new THREE.Raycaster();

function resolveConfig(name, data) {
  const def = PAINTING_CONFIG.default || {};
  const own = lookupName(PAINTING_CONFIG, name) || {};
  return {
    duration: num(data.duration ?? own.duration ?? def.duration, GAME_CONFIG.paintings.duration),
    closed: { ...(def.closed || {}), ...(own.closed || {}) },
    open: { ...(own.open || def.open || {}) },
  };
}

export class PaintingSystem {
  constructor(world, entries) {
    this.world = world;
    this.paintings = new Map();
    this.interactables = [];
    for (const e of entries) {
      const cfg = resolveConfig(e.name, e.data);
      const node = e.node;
      const parent = node.parent;
      const toLocal = (arr) => (parent ? parent.worldToLocal(new THREE.Vector3(...arr)) : new THREE.Vector3(...arr));

      const closed = { pos: node.position.clone(), quat: node.quaternion.clone() };
      if (cfg.closed.position) closed.pos = toLocal(cfg.closed.position);
      if (cfg.closed.rotation) closed.quat.setFromEuler(new THREE.Euler(...cfg.closed.rotation));

      const open = { pos: closed.pos.clone(), quat: closed.quat.clone() };
      const o = cfg.open;
      if (o.position) open.pos = toLocal(o.position);
      else if (o.offset) open.pos.add(new THREE.Vector3(...o.offset).applyQuaternion(closed.quat));
      if (o.rotation) open.quat.setFromEuler(new THREE.Euler(...o.rotation));
      else if (o.rotationOffset) open.quat.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...o.rotationOffset)));

      const meshes = [];
      node.traverse((c) => c.isMesh && meshes.push(c));
      const p = { id: e.name, node, closed, open, meshes, tween: new Tween({ forward: cfg.duration, back: cfg.duration }) };
      this.paintings.set(e.name, p);
      this._apply(p);
      // KATI: tabloların içinden geçilmez. Tablonun kendi mesh'i çarpışma olur ve kayarken (açılıp kapanırken) kendisiyle birlikte hareket eder.
      p.collider = world.collision.addDynamic(e.name, node);

      node.updateWorldMatrix(true, false);
      const center = new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3());
      this.interactables.push({
        id: `painting:${e.name}`,
        targetName: e.name,
        kind: 'painting',
        priority: 4,
        position: center,
        object: node,
        label: () => (p.tween.target ? 'Tabloyu kapat' : 'Tabloyu kaydır'),
        use: () => world.send({ k: 'painting', id: e.name }),
      });
    }
  }

  _apply(p) {
    const t = p.tween.eased;
    p.node.position.lerpVectors(p.closed.pos, p.open.pos, t);
    p.node.quaternion.slerpQuaternions(p.closed.quat, p.open.quat, t);
    p.node.updateMatrixWorld(true);
  }

  /** Işınla vurulan tablo id'si (tıklama ile açma için). */
  pick(origin, dir, maxDist) {
    const all = [];
    for (const p of this.paintings.values()) all.push(...p.meshes);
    if (!all.length) return null;
    _raycaster.set(origin, dir);
    _raycaster.far = maxDist;
    const hit = _raycaster.intersectObjects(all, false)[0];
    if (!hit) return null;
    for (const p of this.paintings.values()) if (p.meshes.includes(hit.object)) return { id: p.id, distance: hit.distance };
    return null;
  }

  applyEvent(ev) {
    const p = this.paintings.get(ev.id);
    if (!p) return;
    p.tween.set(ev.o, ev.p);
    this._apply(p);
    if (this.world.onSound) this.world.onSound('door', p.node.position);
  }
  hostAct(act) {
    const p = this.paintings.get(act.id);
    return p ? { k: 'painting', id: p.id, o: p.tween.target ? 0 : 1, p: round3(p.tween.p) } : null;
  }
  update(dt) {
    for (const p of this.paintings.values()) if (p.tween.update(dt)) this._apply(p);
  }
  getState() {
    const s = {};
    for (const p of this.paintings.values()) s[p.id] = p.tween.getState();
    return s;
  }
  setState(s) {
    for (const [id, st] of Object.entries(s || {})) {
      const p = this.paintings.get(id);
      if (!p) continue;
      p.tween.setState(st);
      this._apply(p);
    }
  }
  reset() {
    for (const p of this.paintings.values()) {
      p.tween.set(0, 0);
      this._apply(p);
    }
  }
}
