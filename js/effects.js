// Görsel efektler (mermi izi, patlama, bölge flaşı) ve bıçağın havada/yerde görünümü.
// Gerçek ışık (PointLight) kullanılmaz: ışık sayısı değişince shader yeniden derlenip takılma yapar.
import * as THREE from 'three';
import { ctx } from './context.js';
import { buildEquipmentMesh } from './equipment.js';

const _a = new THREE.Vector3();

export class Effects {
  constructor(sceneMgr) {
    this.group = sceneMgr.fxGroup;
    this.live = [];
    this.sphereGeo = new THREE.SphereGeometry(1, 14, 10);
    this.boxGeo = new THREE.BoxGeometry(1, 1, 1);
  }

  _add(obj, ttl, onUpdate) {
    this.group.add(obj);
    this.live.push({ obj, ttl, life: ttl, onUpdate });
  }

  tracer(from, to, color = 0xffe9a0) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geo, mat);
    this._add(line, 0.09, (t) => (mat.opacity = t));
  }

  flash(pos, color = 0xffd080, size = 0.15, ttl = 0.12) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false });
    const m = new THREE.Mesh(this.sphereGeo, mat);
    m.position.copy(pos);
    m.scale.setScalar(size);
    this._add(m, ttl, (t) => {
      mat.opacity = t;
      m.scale.setScalar(size * (1.6 - t * 0.6));
    });
  }

  impact(point) {
    this.flash(point, 0xffd9a0, 0.12, 0.14);
  }

  zap(pos) {
    this.flash(pos, 0x9fd8ff, 0.35, 0.25);
  }

  /**
   * PATLAMA EFEKTİ (bombacı): ateş topu (parlak çekirdek + turuncu kabuk) · yerde şok dalgası halkası · uçuşan kıvılcım / kırıntılar ·
   * yükselen duman · yakındakilere ekran flaşı + kamera sarsıntısı. Gerçek ışık kullanılmaz (shader yeniden derlenmesin).
   */
  explosion(pos, radius) {
    const R = Math.max(2, radius);

    // 1) ateş topu
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xfff3c0, transparent: true, opacity: 1, depthWrite: false });
    const core = new THREE.Mesh(this.sphereGeo, coreMat);
    core.position.copy(pos);
    this._add(core, 0.5, (t) => {
      core.scale.setScalar(Math.max(0.05, R * 0.38 * Math.sqrt(1 - t + 0.04)));
      coreMat.opacity = Math.min(1, t * 1.7);
    });
    const shellMat = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.8, depthWrite: false });
    const shell = new THREE.Mesh(this.sphereGeo, shellMat);
    shell.position.copy(pos);
    this._add(shell, 0.85, (t) => {
      shell.scale.setScalar(Math.max(0.1, R * (0.15 + 0.85 * Math.sqrt(1 - t)))); // hızlı büyür, sonra yavaşlar
      shellMat.opacity = t * 0.75;
      shellMat.color.setHex(t > 0.55 ? 0xffb347 : 0xff5a14);
    });

    // 2) şok dalgası halkası (zemine yakın, yatay)
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffe0b0, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, pos.y - 0.8, pos.z);
    this._add(ring, 0.55, (t) => {
      ring.scale.setScalar(Math.max(0.1, R * 1.25 * Math.sqrt(1 - t)));
      ringMat.opacity = t * 0.7;
    });

    // 3) kıvılcım / kırıntı (balistik)
    const speedScale = Math.min(1.4, R / 5);
    for (let i = 0; i < 28; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: [0xffe9a0, 0xff9a2a, 0x4a3a30][i % 3], transparent: true, opacity: 1, depthWrite: false });
      const m = new THREE.Mesh(this.boxGeo, mat);
      m.position.copy(pos);
      const s = 0.05 + Math.random() * 0.09;
      m.scale.set(s, s, s * (1 + Math.random() * 2));
      const a = Math.random() * Math.PI * 2;
      const sp = (4 + Math.random() * 8) * speedScale;
      const vel = new THREE.Vector3(Math.cos(a) * sp, (0.3 + Math.random() * 0.9) * sp * 0.9, Math.sin(a) * sp);
      const spin = new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8);
      this._add(m, 0.7 + Math.random() * 0.7, (t, dt) => {
        vel.y -= 14 * dt;
        m.position.addScaledVector(vel, dt);
        m.rotation.x += spin.x * dt;
        m.rotation.y += spin.y * dt;
        mat.opacity = Math.min(1, t * 2.2);
      });
    }

    // 4) duman: koyu, yükselen, büyüyen, sönen küreler
    for (let i = 0; i < 9; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x2a2623, transparent: true, opacity: 0, depthWrite: false });
      const m = new THREE.Mesh(this.sphereGeo, mat);
      m.position.set(pos.x + (Math.random() - 0.5) * R * 0.7, pos.y + (Math.random() - 0.2) * R * 0.35, pos.z + (Math.random() - 0.5) * R * 0.7);
      const size = R * (0.22 + Math.random() * 0.2);
      this._add(m, 1.6 + Math.random() * 0.8, (t, dt) => {
        const k = 1 - t;
        m.position.y += 0.9 * dt;
        m.scale.setScalar(size * (0.5 + 0.9 * Math.sqrt(k)));
        mat.opacity = 0.55 * Math.min(1, k * 6) * t;
      });
    }

    // 5) yakındakilere ekran flaşı + kamera sarsıntısı (uzaklık izleyicinin kamerasına göre)
    const d = ctx.sceneMgr.camera.position.distanceTo(pos);
    ctx.ui?.flashScreen(1 - d / (R * 2.4));
    ctx.movement?.shake(Math.max(0, 0.9 - d * 0.04));
  }

  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const e = this.live[i];
      e.ttl -= dt;
      if (e.ttl <= 0) {
        e.obj.removeFromParent();
        e.obj.geometry !== this.sphereGeo && e.obj.geometry !== this.boxGeo && e.obj.geometry?.dispose();
        e.obj.material?.dispose();
        this.live.splice(i, 1);
      } else e.onUpdate?.(e.ttl / e.life, dt);
    }
  }
}

/**
 * Katilin bıçağı elinden çıkınca (fırlatılınca) dünyada görünen hali.
 * Durum host'tan gelir: { s: 'held' | 'flying' | 'landed', p, d }.
 */
export class KnifeView {
  constructor(sceneMgr) {
    this.mesh = buildEquipmentMesh('knife');
    this.mesh.scale.setScalar(1.6);
    this.mesh.visible = false;
    sceneMgr.fxGroup.add(this.mesh);
    this.state = 'held';
    this.pos = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.dir = new THREE.Vector3(0, 0, 1);
    this.spin = 0;
  }

  apply({ s, p, d }) {
    this.state = s;
    if (p) {
      this.target.set(...p);
      if (this.pos.distanceToSquared(this.target) > 25 || !this.mesh.visible) this.pos.copy(this.target);
    }
    if (d) this.dir.set(...d).normalize();
    this.mesh.visible = s !== 'held';
  }

  /** Katil için "Bıçağı al" adayı */
  candidates(me) {
    if (this.state !== 'landed' || ctx.role?.id !== 'killer' || !me?.alive) return [];
    return [{
      id: 'knife',
      kind: 'knife',
      priority: 2,
      position: this.pos.clone(),
      object: this.mesh,
      hitRadius: 0.22, // küçük nesne: nişan toleransı
      label: () => 'Bıçağı al',
      use: () => ctx.client.toHost({ t: 'knifePickup' }),
    }];
  }

  update(dt) {
    if (!this.mesh.visible) return;
    this.pos.lerp(this.target, 1 - Math.exp(-18 * dt));
    this.mesh.position.copy(this.pos);
    _a.copy(this.pos).add(this.dir);
    this.mesh.lookAt(_a);
    if (this.state === 'flying') {
      this.spin += dt * 25;
      this.mesh.rotateZ(this.spin);
    }
  }

  reset() {
    this.state = 'held';
    this.mesh.visible = false;
  }
}
