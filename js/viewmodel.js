// Birinci şahıs "elimdeki ekipman" görünümü + iki kol (bıçak, tabanca, taramalı, elektrikli sopa, roketatar, bomba, plazma tüfeği, sniper).
// Tabanca / taramalı / roketatar / plazma / sniper / bomba İKİ elle, bıçak ve elektrikli sopa tek elle tutulur. Kollar: oyuncu renginde kol + ten rengi bilek / el.
// Ana görüntünün ÜSTÜNE ayrı bir sahne + ayrı kamerayla çizilir (derinlik tamponu sıfırlanır):
// duvara yaklaşınca silah duvarın içine girmez. Ölünce izlenen oyuncunun elindeki ekipman gösterilir.
import * as THREE from 'three';
import { GAME_CONFIG } from './config.js';
import { ctx } from './context.js';
import { buildEquipmentMesh, GRIPS, TIPS } from './equipment.js';
import { skinTone } from './ragdoll.js';
import { damp, lerp } from './util.js';

const C = GAME_CONFIG.camera;
const _p = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

// Kamera uzayında duruş (x sağ, y yukarı, -z ileri). p: modelin orijini, r: dönüş (radyan; +x namluyu yukarı kaldırır, +y sola çevirir).
// idle: bekleme sallanma şiddeti.
const POSE = {
  knife: { p: [0.17, -0.2, -0.36], r: [0.55, 0.2, -0.14], idle: 0.7 }, // bıçak ileri-yukarı, ucu hafif içe: tehditkar tutuş
  pistol: { p: [0.07, -0.16, -0.42], r: [0.03, 0.01, 0], idle: 0.5 },
  rifle: { p: [0.1, -0.18, -0.34], r: [0.03, 0.02, 0], idle: 0.5 },
  taser: { p: [0.18, -0.2, -0.38], r: [0.5, 0.12, -0.1], idle: 1.1 },
  rocket: { p: [0.15, -0.2, -0.46], r: [0.05, 0.03, 0], idle: 0.4 },
  bomb: { p: [0.0, -0.19, -0.38], r: [0.25, 0, 0], idle: 0.8 },
  plasma: { p: [0.11, -0.19, -0.34], r: [0.03, 0.02, 0], idle: 0.5 },
  sniper: { p: [0.1, -0.2, -0.3], r: [0.03, 0.02, 0], idle: 0.35 },
};
// Kolların ekranın dışındaki başlangıcı (omuz yönü)
const ANCHOR = { R: [0.3, -0.55, -0.02], L: [-0.27, -0.55, -0.02] };
const RECOIL = { pistol: 1, rifle: 0.7, taser: 0.4, rocket: 2.2, plasma: 0.45, sniper: 1.8 };
const FLASHES = new Set(['pistol', 'rifle', 'rocket', 'plasma', 'sniper']);

const ARM_GEO = new THREE.CylinderGeometry(1, 1, 1, 10).rotateX(Math.PI / 2).translate(0, 0, 0.5); // z: 0..1 arası uzanan silindir (yarıçap = ölçek)
const HAND_GEO = new THREE.BoxGeometry(1, 1, 1);

/** Tek kol: oyuncu renginde kol (sleeve) → ten rengi bilek → el. Başlangıçtan (omuz) ele düz uzanır. */
class Arm {
  constructor() {
    this.group = new THREE.Group();
    this.sleeveMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.85 });
    this.skinMat = new THREE.MeshStandardMaterial({ color: 0xeec3a0, roughness: 0.8 });
    this.sleeve = new THREE.Mesh(ARM_GEO, this.sleeveMat);
    this.wrist = new THREE.Mesh(ARM_GEO, this.skinMat);
    this.hand = new THREE.Mesh(HAND_GEO, this.skinMat);
    this.group.add(this.sleeve, this.wrist, this.hand);
    this.group.visible = false;
  }

  /** from (omuz yönü) → to (elin tuttuğu nokta); ikisi de kamera uzayında. */
  place(from, to) {
    const len = from.distanceTo(to);
    const sl = Math.max(0.05, len - 0.1);
    this.group.position.copy(from);
    this.group.lookAt(to);
    this.sleeve.scale.set(0.05, 0.05, sl);
    this.wrist.position.z = sl;
    this.wrist.scale.set(0.036, 0.036, 0.1);
    this.hand.position.z = len - 0.005;
    this.hand.scale.set(0.075, 0.06, 0.1);
  }

  dispose() {
    this.sleeveMat.dispose();
    this.skinMat.dispose();
  }
}

export class ViewModel {
  constructor(sceneMgr) {
    this.sceneMgr = sceneMgr;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(C.viewmodelFov, 1, 0.01, 8);
    this.scene.add(this.camera);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x4a4a55, 1.2);
    this.sun = new THREE.DirectionalLight(0xfff3dd, 1.5);
    this.sun.position.set(0.6, 1, 0.7);
    this.scene.add(this.hemi, this.sun);

    this.root = new THREE.Group(); // duruş + animasyon
    this.holder = new THREE.Group(); // modelin namlusu (+Z) ekrana doğru (-Z) bakacak şekilde döner
    this.holder.rotation.y = Math.PI;
    this.root.add(this.holder);
    this.scene.add(this.root);

    this.arms = { R: new Arm(), L: new Arm() }; // kamera uzayında (root'tan bağımsız); eller silahın tutamaklarına bakar
    this.scene.add(this.arms.R.group, this.arms.L.group);
    this.armKey = '';

    this.muzzle = new THREE.Object3D();
    this.flashMat = new THREE.MeshBasicMaterial({ color: 0xffd890, transparent: true, depthTest: false, blending: THREE.AdditiveBlending });
    this.flashMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), this.flashMat);
    this.flashMesh.visible = false;
    this.muzzle.add(this.flashMesh);

    this.type = null;
    this.mesh = null;
    this.show = 0; // 0 indirilmiş, 1 kaldırılmış (çekme animasyonu)
    this.recoil = 0;
    this.swing = 0; // bıçak savurma ilerlemesi (1 → 0)
    this.plant = 0; // bomba kurma
    this.zap = 0; // elektrikli sopa çarpması
    this.flash = 0;
    this.reloadT = 0;
    this.t = 0;
    this.visible = false;
    this.root.visible = false;
  }

  _setType(type) {
    if (this.mesh) {
      this.holder.remove(this.mesh);
      this.mesh = null;
    }
    this.muzzle.removeFromParent();
    this.type = type;
    if (!type) return;
    const m = buildEquipmentMesh(type);
    if (!m) {
      this.type = null;
      return;
    }
    this.mesh = m;
    this.holder.add(m);
    this.muzzle.position.set(0, 0.02, TIPS[type] ?? 0.3);
    this.holder.add(this.muzzle);
    this.flashMat.color.setHex(type === 'plasma' ? 0x7dffd0 : 0xffd890);
    this.show = 0;
  }

  /** Yerel oyuncu ateş etti / vurdu: geri tepme, savurma, namlu ışığı. */
  kick(type) {
    if (type === 'knife') this.swing = 1;
    else if (type === 'bomb') this.plant = 1;
    else {
      this.recoil = RECOIL[type] ?? 1;
      if (FLASHES.has(type)) this.flash = 1;
      if (type === 'taser') this.zap = 1;
    }
  }

  /** İzlediğim oyuncunun atışı (kendi atışım zaten kick ile gösterildi). */
  onShot(m) {
    if (m.from !== ctx.myId && m.from === ctx.movement.spectateId) this.kick(m.k === 'pistol' || m.k === 'rifle' || m.k === 'sniper' ? m.k : 'taser');
  }
  onStab(m) {
    if (m.from !== ctx.myId && m.from === ctx.movement.spectateId) this.kick('knife');
  }
  onProj(m) {
    if (m.from !== ctx.myId && m.from === ctx.movement.spectateId) this.kick(m.k);
  }
  onPlant(m) {
    if (m.from !== ctx.myId && m.from === ctx.movement.spectateId) this.kick('bomb');
  }

  update(dt) {
    const mv = ctx.movement;
    const viewed = mv.viewedPlayer();
    const type = viewed && viewed.alive && viewed.eq.out ? viewed.eq.type : null;
    if (type && type !== this.type) this._setType(type);
    this.show = damp(this.show, type ? 1 : 0, 14, dt);
    if (!type && this.show < 0.02 && this.mesh) this._setType(null);
    // Sniper dürbünü açıkken kendi silahım gizlenir (dürbün çerçevesi ekranı kaplar)
    const scoped = viewed === ctx.me && (ctx.inventory?.scopeAmt ?? 0) > 0.2;
    this.visible = !!this.mesh && this.show > 0.02 && !scoped;
    this.root.visible = this.visible;
    if (!this.visible) {
      this.arms.R.group.visible = this.arms.L.group.visible = false;
      return;
    }

    this.t += dt;
    const P = POSE[this.type] || POSE.pistol;
    const reloading = viewed === ctx.me && (ctx.me_state.reload || 0) > 0;
    this.reloadT = damp(this.reloadT, reloading ? 1 : 0, 10, dt);
    this.recoil = damp(this.recoil, 0, 16, dt);
    this.swing = Math.max(0, this.swing - dt / 0.34);
    this.plant = Math.max(0, this.plant - dt / 0.45);
    this.zap = Math.max(0, this.zap - dt / 0.35);
    this.flash = Math.max(0, this.flash - dt / 0.07);

    // bıçak: toparlan (0→0.3) → hızlı savur (0.3→1)
    const q = 1 - this.swing;
    const on = this.swing > 0;
    const wind = !on ? 0 : q < 0.3 ? q / 0.3 : q < 0.45 ? 1 - (q - 0.3) / 0.15 : 0;
    const strike = !on || q < 0.3 ? 0 : Math.sin(((q - 0.3) / 0.7) * Math.PI);
    const pl = this.plant > 0 ? Math.sin((1 - this.plant) * Math.PI) : 0; // bomba kurma: öne uzan, bırak

    // yürürken hafif sallanma (kamera sallanmasıyla uyumlu) + bekleme nefesi
    const bob = mv.bobAmp * (C.bob > 0 ? 1 : 0);
    const bx = Math.sin(mv.bobPhase) * 0.012 * bob + Math.sin(this.t * 1.1) * 0.0035 * P.idle;
    const by = Math.abs(Math.sin(mv.bobPhase)) * -0.01 * bob + Math.sin(this.t * 0.8 + 1) * 0.003 * P.idle;
    const lower = (1 - this.show) * 0.4 + this.reloadT * 0.2;
    const jit = this.zap > 0 ? 0.012 * this.zap : 0; // elektrik çarpması titremesi

    this.root.position.set(
      P.p[0] + bx + (Math.random() - 0.5) * jit - strike * 0.2 + wind * 0.05,
      P.p[1] + by + (Math.random() - 0.5) * jit - lower - strike * 0.1 + wind * 0.07 - pl * 0.07,
      P.p[2] + this.recoil * 0.07 - strike * 0.3 + wind * 0.07 - pl * 0.2,
    );
    this.root.rotation.set(
      P.r[0] + this.recoil * 0.1 + this.reloadT * 0.7 + (1 - this.show) * 0.6 + wind * 0.5 - strike * 1.15 + pl * 0.2,
      P.r[1] + strike * 0.6 - wind * 0.25,
      P.r[2] + strike * 0.45 - wind * 0.2,
    );

    this.flashMesh.visible = this.flash > 0;
    if (this.flash > 0) {
      this.flashMesh.scale.setScalar((this.type === 'rocket' ? 0.05 : 0.025) + 0.04 * this.flash);
      this.flashMat.opacity = this.flash;
    }
    // sopanın / bombanın kıvılcımı
    const glow = this.mesh.userData.glow;
    if (glow?.material?.isMeshBasicMaterial) glow.scale.setScalar(0.85 + Math.random() * 0.5 + this.zap * 2.2);

    // ---- kollar: oyuncu rengi + ten rengi; her el silahın kendi tutamağında ----
    const key = `${viewed?.id}|${viewed?.identity?.color}`;
    if (key !== this.armKey) {
      this.armKey = key;
      const col = viewed?.identity?.color ?? 0x888888;
      const skin = skinTone(viewed?.id);
      for (const a of Object.values(this.arms)) {
        a.sleeveMat.color.setHex(col);
        a.skinMat.color.setHex(skin);
      }
    }
    this.root.updateMatrixWorld(true);
    const grips = GRIPS[this.type] || {};
    for (const side of ['R', 'L']) {
      const arm = this.arms[side];
      const g = grips[side];
      arm.group.visible = !!g;
      if (!g) continue;
      _a.set(g[0], g[1], g[2]);
      this.holder.localToWorld(_a); // model uzayı → kamera uzayı
      _b.set(ANCHOR[side][0], ANCHOR[side][1], ANCHOR[side][2]);
      arm.place(_b, _a);
    }
  }

  /** Ana görüntü çizildikten sonra çağrılır (SceneManager.render). */
  render(renderer, mainCamera) {
    if (!this.visible) return;
    if (this.camera.aspect !== mainCamera.aspect) {
      this.camera.aspect = mainCamera.aspect;
      this.camera.updateProjectionMatrix();
    }
    const dark = this.sceneMgr._dark || 0;
    this.hemi.intensity = lerp(1.2, 0.5, dark);
    this.sun.intensity = lerp(1.5, 0.35, dark);
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = true;
  }

  /**
   * Namlunun ekrandaki yerine karşılık gelen dünya noktası (mermi izi / namlu ışığı oradan başlasın).
   * Ekipman görünmüyorsa null.
   */
  muzzleWorld(out) {
    if (!this.visible || !this.mesh) return null;
    this.root.updateMatrixWorld(true);
    this.muzzle.getWorldPosition(_p); // vm kamerası orijinde olduğundan bu kamera uzayı koordinatıdır
    _p.project(this.camera);
    const main = this.sceneMgr.camera;
    main.updateMatrixWorld(true);
    _a.set(_p.x, _p.y, -1).unproject(main);
    _b.set(_p.x, _p.y, 1).unproject(main);
    _b.sub(_a).normalize();
    return out.copy(main.position).addScaledVector(_b, 0.7);
  }
}
