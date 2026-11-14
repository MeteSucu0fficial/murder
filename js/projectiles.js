// Gizli eşyaların dünyadaki görünümü: roket / plazma mermisi (host'un yolladığı konum + hızla uçar) ve kurulu bomba (yanıp söner).
// Gerçek çarpışma, hasar ve patlama host'ta (combat.js); burada yalnızca görsel + ses. Bitişi host'un 'projEnd' mesajı belirler.
import * as THREE from 'three';
import { GAME_CONFIG } from './config.js';
import { ctx } from './context.js';
import { audio } from './audio.js';
import { buildEquipmentMesh } from './equipment.js';

const E = GAME_CONFIG.equipment;
const toVec = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const _a = new THREE.Vector3();

// Ortak geometri / malzemeler (mermiler arasında paylaşılır; tek tek dispose edilmez)
const GEO = {
  body: new THREE.CylinderGeometry(0.04, 0.04, 0.34, 10).rotateX(Math.PI / 2), // eksen: z (ileri)
  nose: new THREE.ConeGeometry(0.04, 0.13, 10).rotateX(Math.PI / 2),
  fin: new THREE.BoxGeometry(0.11, 0.012, 0.08),
  sphere: new THREE.SphereGeometry(1, 10, 8),
};
const MAT = {
  body: new THREE.MeshStandardMaterial({ color: 0x59664a, roughness: 0.6, metalness: 0.3 }),
  nose: new THREE.MeshStandardMaterial({ color: 0xb02b22, roughness: 0.5 }),
  fin: new THREE.MeshStandardMaterial({ color: 0x2c3125, roughness: 0.7 }),
  flame: new THREE.MeshBasicMaterial({ color: 0xffa23a, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }),
  boltCore: new THREE.MeshBasicMaterial({ color: 0xeafffb }),
  boltHalo: new THREE.MeshBasicMaterial({ color: 0x4fe3c1, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
};

function makeRocket() {
  const g = new THREE.Group();
  const nose = new THREE.Mesh(GEO.nose, MAT.nose);
  nose.position.z = 0.235;
  g.add(new THREE.Mesh(GEO.body, MAT.body), nose);
  const f1 = new THREE.Mesh(GEO.fin, MAT.fin);
  const f2 = new THREE.Mesh(GEO.fin, MAT.fin);
  f1.position.z = f2.position.z = -0.14;
  f2.rotation.z = Math.PI / 2;
  g.add(f1, f2);
  const flame = new THREE.Mesh(GEO.sphere, MAT.flame);
  flame.position.z = -0.27;
  flame.scale.set(0.05, 0.05, 0.14);
  g.add(flame);
  g.userData.flame = flame;
  return g;
}

function makeBolt() {
  const g = new THREE.Group();
  const halo = new THREE.Mesh(GEO.sphere, MAT.boltHalo);
  halo.scale.set(0.1, 0.1, 0.42);
  const core = new THREE.Mesh(GEO.sphere, MAT.boltCore);
  core.scale.set(0.042, 0.042, 0.22);
  g.add(halo, core);
  return g;
}

export class ProjectileView {
  constructor(sceneMgr) {
    this.group = sceneMgr.fxGroup;
    this.shots = new Map(); // id → { mesh, pos, v, kind, life, puff }
    this.bombs = new Map(); // id → { mesh, t, fuse, beep, flash }
  }

  /** Host: roket / plazma mermisi doğdu. Görsel, namluya yakın (gözün biraz önü / altı) başlar. */
  spawn(m) {
    const pos = toVec(m.p);
    const v = toVec(m.v);
    const dir = v.clone().normalize();
    pos.addScaledVector(dir, 0.55);
    pos.y -= 0.12;
    const mesh = m.k === 'rocket' ? makeRocket() : makeBolt();
    mesh.position.copy(pos);
    _a.copy(pos).add(dir);
    mesh.lookAt(_a);
    this.group.add(mesh);
    this.shots.set(m.id, { mesh, pos, v, kind: m.k, life: (E[m.k]?.life ?? 1) + 0.8, puff: 0 });
  }

  /** Host: mermi bir şeye çarptı / menzili bitti. Roket patlaması ayrı 'explosion' mesajıyla gelir. */
  end(m) {
    this._drop(this.shots, m.id);
    if (m.k !== 'plasma') return;
    const p = toVec(m.p);
    ctx.effects.flash(p, 0x7dffd0, m.hit ? 0.32 : 0.22, 0.22);
    ctx.effects.flash(p, 0xffffff, 0.1, 0.1);
  }

  /** Kurulan bomba: kısık "bip"lerle yanıp söner; fitil bittikçe sıklaşır. */
  plant(m) {
    const mesh = buildEquipmentMesh('bomb');
    const pos = toVec(m.p);
    pos.y -= 0.05;
    mesh.position.copy(pos);
    mesh.scale.setScalar(1.15);
    this.group.add(mesh);
    this.bombs.set(m.id, { mesh, t: 0, fuse: m.fuse || 3, beep: 0, flash: 0 });
    audio.sfx('click', { pos: toVec(m.p), listener: ctx.sceneMgr.camera.position, volume: 0.7 });
  }

  unplant(id) {
    this._drop(this.bombs, id);
  }

  _drop(map, id) {
    const o = map.get(id);
    if (!o) return;
    o.mesh.removeFromParent();
    if (map === this.bombs) o.mesh.traverse((c) => c.material?.dispose?.()); // bomba modelinin malzemeleri kendine ait
    map.delete(id);
  }

  update(dt) {
    if (!this.shots.size && !this.bombs.size) return;
    const cam = ctx.sceneMgr.camera.position;
    for (const [id, s] of this.shots) {
      s.pos.addScaledVector(s.v, dt);
      s.mesh.position.copy(s.pos);
      s.life -= dt;
      if (s.kind === 'rocket') {
        const fl = s.mesh.userData.flame;
        if (fl) fl.scale.z = 0.1 + Math.random() * 0.1; // alev titremesi
        s.puff -= dt;
        if (s.puff <= 0) {
          s.puff = 0.04;
          _a.copy(s.pos).addScaledVector(s.v, -0.012);
          ctx.effects.flash(_a, 0xb9b9b9, 0.08 + Math.random() * 0.05, 0.5); // duman izi
          ctx.effects.flash(_a, 0xffa040, 0.07, 0.1);
        }
      }
      if (s.life <= 0) this._drop(this.shots, id); // 'projEnd' kaybolduysa görsel de kaybolsun
    }
    for (const b of this.bombs.values()) {
      b.t += dt;
      const left = Math.max(0.05, b.fuse - b.t);
      b.beep -= dt;
      if (b.beep <= 0) {
        b.beep = Math.max(0.12, 0.08 + 0.5 * (left / b.fuse)); // fitil azaldıkça sıklaşır
        b.flash = 0.09;
        audio.sfx('beep', { pos: b.mesh.position, listener: cam, volume: 0.8 });
      }
      b.flash = Math.max(0, b.flash - dt);
      const glow = b.mesh.userData.glow;
      if (glow) {
        glow.scale.setScalar(b.flash > 0 ? 2.8 : 0.9);
        glow.material.color.setHex(b.flash > 0 ? 0xff3020 : 0xffa030);
      }
    }
  }

  clear() {
    for (const id of [...this.shots.keys()]) this._drop(this.shots, id);
    for (const id of [...this.bombs.keys()]) this._drop(this.bombs, id);
  }
}
