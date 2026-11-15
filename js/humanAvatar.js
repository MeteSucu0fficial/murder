// İnsan benzeri oyuncu modeli. Ceset modeliyle (ragdoll.js → RagdollView) AYNI kutu gövde, kafa, kol ve bacaklar kullanılır:
// canlıyken noktalar iskelet animasyonundan (dur / yürü / koş / eğil / zıpla / tırman / taşı / saldır) üretilir, ölünce aynı model fiziğe bırakılır.
// Yerel eksenler ceset şablonuyla aynıdır: x = karakterin SOLU, y = yukarı, z = ileri (grup yaw ile döndürülür).
// Bacaklar iki kemikli IK ile çözülür (ayak hep yere basar, diz öne bükülür); kollar karşı bacakla sallanır.
// Ekipman elde: iki elle tutulan silahlarda (tabanca, tarama, plazma, roketatar, bomba) iki kol da 3B IK ile silaha uzanır (avatarPose.js).
import * as THREE from 'three';
import { R, RagdollView, SKIN_TONES, TEMPLATE as T } from './ragdoll.js';
import { buildEquipmentMesh, GRIPS } from './equipment.js';
import { ACTION_DUR, HOLDS, actionPose, ik3 } from './avatarPose.js';

const { HEAD, LSH, RSH, LHIP, RHIP, LEL, REL, LHAND, RHAND, LKNEE, RKNEE, LFOOT, RFOOT, BACK } = R;
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const lerp = THREE.MathUtils.lerp;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ---- şablondan ölçüler (ceset modeliyle birebir aynı kemik boyları) ----
const dist3 = (a, b) => Math.hypot(T[a][0] - T[b][0], T[a][1] - T[b][1], T[a][2] - T[b][2]);
const L_THIGH = dist3(LHIP, LKNEE);
const L_SHIN = dist3(LKNEE, LFOOT);
const L_UARM = dist3(LSH, LEL);
const L_FARM = dist3(LEL, LHAND);
const MAX_LEG = (L_THIGH + L_SHIN) * 0.998;
const SH_X = T[LSH][0];
const HIP_X = T[LHIP][0];
const HIP_Y = T[LHIP][1];
const FOOT_Y = T[LFOOT][1];
const TORSO = T[LSH][1] - HIP_Y; // kalçadan omuza
const NECK = T[HEAD][1] - T[LSH][1]; // omuzdan kafa merkezine
const BACK_UP = T[BACK][1] - HIP_Y;
const BACK_Z = T[BACK][2];

const CROUCH_DROP = 0.4; // eğilince kalçanın inme miktarı (m)

// kol çözümleri: [0] = sol, [1] = sağ. fe/fh: serbest kol · we/wh: ekipman tutuşu · ce/ch: taşıma / tırmanma
const _fe = [V(), V()];
const _fh = [V(), V()];
const _we = [V(), V()];
const _wh = [V(), V()];
const _ce = [V(), V()];
const _ch = [V(), V()];
const _S = V();
const _wp = V();
const _t = V();
const POLE = [V(0.6, -0.8, -0.2), V(-0.6, -0.8, -0.2)]; // dirseğin büküldüğü yön (aşağı + dışarı + hafif geri)
const POLE_UP = [V(0.7, -0.5, -0.3), V(-0.7, -0.5, -0.3)];
const _wq = new THREE.Quaternion();
const _yq = new THREE.Quaternion();
const _hq = new THREE.Quaternion();

const _k = { ky: 0, kz: 0 };
/** Yan düzlemde (y yukarı, z ileri) iki kemikli bağlantı: (hy,hz) → hedef (ty,tz). Dönüş: diz (_k.ky,_k.kz); hedef erişilemezse kısalır. */
function twoBone(hy, hz, ty, tz, l1, l2, maxLen) {
  let dy = ty - hy;
  let dz = tz - hz;
  let d = Math.hypot(dy, dz);
  if (d > maxLen) {
    dy *= maxLen / d;
    dz *= maxLen / d;
    d = maxLen;
  }
  if (d < 1e-4) {
    dy = -1e-4;
    dz = 0;
    d = 1e-4;
  }
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const uy = dy / d;
  const uz = dz / d;
  let py = -uz;
  let pz = uy;
  if (pz < 0) {
    py = -py;
    pz = -pz; // diz her zaman ÖNE bükülür
  }
  _k.ky = hy + uy * a + py * h;
  _k.kz = hz + uz * a + pz * h;
}

export class HumanAvatar {
  constructor({ color, skin = SKIN_TONES[0] }) {
    this.group = new THREE.Group();
    this.view = new RagdollView(color, { shade: 0.9, skin });
    this.group.add(this.view.group);

    // elde tutulan eşya (namlu / uç +Z; kavrama noktası orijinde; her karede tutuşa göre yerleştirilir)
    this.mount = new THREE.Group();
    this.group.add(this.mount);

    // Fener yanıyor mu? Yalnızca kafa animasyonu içindir; ışığın kendisi scene.js'teki SpotLight havuzundan gelir (görünür ışık konisi YOK).
    this.lit = false;

    this.phase = Math.random() * 6.28;
    this.climbPhase = 0;
    this.t = Math.random() * 10;
    this.moving = 0; // 0 dur, 1 yürü, 2 koş
    this.gait = 0; // yumuşatılmış yürüyüş durumu (0..2)
    this.crouchT = 0; // 0 ayakta, 1 tam eğilmiş
    this.pitch = 0;
    this.equipType = null;
    this.armed = 0; // 0..1: elinde ekipman var mı (kol geçişi)
    this.gunT = 0; // 0..1: iki elle tutulan ateşli silah duruşu
    this.air = false;
    this.airT = 0;
    this.climb = false;
    this.climbT = 0;
    this.carry = null; // null | 'obj' (eşya tutuyor) | 'corpse' (ceset taşıyor)
    this.carryKind = 'obj';
    this.carryT = 0;
    this.act = null; // { kind, t, dur }: saldırı / atış hareketi
  }

  setColor(hex) {
    this.view.setColor(hex);
  }

  setSkin(hex) {
    this.view.setSkin(hex);
  }

  /** Yüz dosyası adı (assets/faces); kimlikle birlikte gelir. */
  setFace(name) {
    this.view.setFace(name);
  }

  setEquipment(type) {
    if (type === this.equipType) return;
    this.equipType = type;
    this.mount.clear();
    const m = type ? buildEquipmentMesh(type) : null;
    if (m) this.mount.add(m);
    else this.equipType = null;
  }

  setPitch(p) {
    this.pitch = p;
  }

  setFlashlight(on) {
    this.lit = !!on;
  }

  setMoving(v) {
    this.moving = v;
  }

  setCrouch(t) {
    this.crouchT = clamp01(t);
  }

  /** Havada (zıplama / düşme): bacaklar toplanır, kollar açılır. */
  setAir(on) {
    this.air = !!on;
  }

  /** Tırmanma: eller yukarıda sırayla uzanır, ayaklar basamak basar. */
  setClimb(on) {
    this.climb = !!on;
  }

  /** 'obj' = bir eşyayı iki elle tutuyor · 'corpse' = ceset taşıyor · null = yok. */
  setCarry(kind) {
    this.carry = kind || null;
    if (kind) this.carryKind = kind;
  }

  /** Tek seferlik hareket: 'stab' (bıçak hamlesi), 'throw' (bıçak fırlatma), 'shoot', 'zap' (sopa), 'rocket', 'plant' (bomba kurma). */
  playAction(kind) {
    const dur = ACTION_DUR[kind];
    if (dur) this.act = { kind, t: 0, dur };
  }

  setVisible(v) {
    this.group.visible = v;
  }

  update(dt) {
    this.t += dt;
    const sm = (v, to, rate) => v + (to - v) * (1 - Math.exp(-rate * dt));
    this.gait = sm(this.gait, this.moving, 10);
    const hold = this.equipType ? HOLDS[this.equipType] : null;
    this.armed = sm(this.armed, hold ? 1 : 0, 9);
    this.gunT = sm(this.gunT, hold?.gun ? 1 : 0, 6);
    this.airT = sm(this.airT, this.air ? 1 : 0, 12);
    this.climbT = sm(this.climbT, this.climb ? 1 : 0, 10);
    this.carryT = sm(this.carryT, this.carry ? 1 : 0, 8);
    const walkAmt = clamp01(this.gait);
    const runAmt = clamp01(this.gait - 1);
    const c = this.crouchT;
    const air = this.airT;
    const climb = this.climbT;
    const A = this.armed;
    const G = this.gunT;

    // ---- tek seferlik hareket (bıçak hamlesi, atış geri tepmesi...) ----
    let adz = 0;
    let ady = 0;
    let arx = 0;
    let alean = 0;
    let astep = 0;
    if (this.act) {
      this.act.t += dt;
      const u = this.act.t / this.act.dur;
      if (u >= 1) this.act = null;
      else {
        const a = actionPose(this.act.kind, u);
        adz = a.dz;
        ady = a.dy;
        arx = a.rx;
        alean = a.lean;
        astep = a.step;
      }
    }

    // adım ölçüleri (yürüme → koşma), eğilince kısalır; havada / tırmanırken yer adımı yok
    const grounded = (1 - air) * (1 - climb);
    const stride = lerp(lerp(0, 0.36, walkAmt), 0.46, runAmt) * (1 - 0.45 * c) * grounded; // ayağın öne/arkaya yarı salınımı
    const liftMax = lerp(lerp(0, 0.09, walkAmt), 0.17, runAmt) * (1 - 0.3 * c);
    const armAmp = lerp(lerp(0, 0.55, walkAmt), 0.95, runAmt) * (1 - 0.5 * c) * (1 - 0.55 * A);
    const rate = lerp(lerp(8, 12, walkAmt), 15, runAmt) * (1 - 0.25 * c);
    if (this.gait > 0.02) this.phase += dt * rate;
    if (this.moving > 0 && climb > 0.05) this.climbPhase += dt * (4 + this.moving * 2);

    // ---- bacaklar: ayak yörüngesi (yerde geriye kayar, havada öne savrulup kalkar) ----
    const footX = HIP_X + 0.04 * c + 0.025 * A;
    const phL = this.phase;
    const phR = this.phase + Math.PI;
    const stag = 0.07 * A * (1 - walkAmt) * grounded; // elinde silahla dururken ayaklar çaprazlanır (dövüş duruşu)
    const cp = this.climbPhase;
    let fzL = stride * Math.cos(phL) + stag + astep * 0.22;
    let fzR = stride * Math.cos(phR) - stag * 1.4;
    let fyL = FOOT_Y + liftMax * Math.max(0, -Math.sin(phL)) * grounded;
    let fyR = FOOT_Y + liftMax * Math.max(0, -Math.sin(phR)) * grounded;
    if (air > 0.01) {
      fyL = lerp(fyL, FOOT_Y + 0.22, air);
      fzL = lerp(fzL, 0.2, air);
      fyR = lerp(fyR, FOOT_Y + 0.3, air);
      fzR = lerp(fzR, -0.12, air);
    }
    if (climb > 0.01) {
      fyL = lerp(fyL, FOOT_Y + 0.12 + 0.2 * Math.max(0, Math.sin(cp)), climb);
      fyR = lerp(fyR, FOOT_Y + 0.12 + 0.2 * Math.max(0, -Math.sin(cp)), climb);
      fzL = lerp(fzL, 0.12, climb);
      fzR = lerp(fzR, 0.12, climb);
    }

    // kalça yüksekliği: ayakta HIP_Y, eğilince alçalır; basan bacak yetişemezse kalça iner (yürürken doğal sekme)
    const breath = Math.sin(this.t * 1.9) * 0.005 * (1 - walkAmt);
    let H = HIP_Y - CROUCH_DROP * c - 0.03 * G * (1 - c) - 0.04 * air + breath;
    H = Math.min(H, fyL + Math.sqrt(Math.max(0, MAX_LEG * MAX_LEG - fzL * fzL)), fyR + Math.sqrt(Math.max(0, MAX_LEG * MAX_LEG - fzR * fzR)));

    // ---- gövde eğimi: eğilince, koşarken, silahla öne; ceset taşırken geriye ----
    const carryLean = this.carryKind === 'corpse' ? -0.2 * this.carryT : 0;
    const lean = 0.55 * c + 0.1 * runAmt + 0.06 * G + 0.04 * A + 0.1 * climb + 0.08 * air + alean + carryLean;
    const sl = Math.sin(lean);
    const cl = Math.cos(lean);
    const shY = H + TORSO * cl + breath * 0.6;
    const shZ = TORSO * sl;
    // omuz dönüşü: yürürken karşı bacakla; silah tutarken sağ omuz geride (yan duruş)
    const twist = (0.035 * walkAmt + 0.045 * runAmt) * (1 - 0.5 * A) * grounded;
    const aimTw = 0.05 * G;
    const shZL = shZ - twist * Math.cos(phL) + aimTw;
    const shZR = shZ + twist * Math.cos(phL) - aimTw;
    const headLean = lean * 0.4 - 0.05 * A; // silahlıyken kafa biraz öne uzar (tehditkâr duruş)
    const hdY = shY + NECK * Math.cos(headLean);
    const hdZ = shZ + NECK * Math.sin(headLean) + 0.03 * A;
    const bkY = H + BACK_UP * cl - BACK_Z * sl;
    const bkZ = BACK_UP * sl + BACK_Z * cl;

    const p = this.view.pts;
    p[HEAD].set(0, hdY, hdZ);
    p[LSH].set(SH_X, shY, shZL);
    p[RSH].set(-SH_X, shY, shZR);
    p[LHIP].set(HIP_X, H, 0);
    p[RHIP].set(-HIP_X, H, 0);
    p[BACK].set(0, bkY, bkZ);

    twoBone(H, 0, fyL, fzL, L_THIGH, L_SHIN, MAX_LEG);
    p[LKNEE].set(footX, _k.ky, _k.kz);
    p[LFOOT].set(footX, Math.min(fyL, H - 0.001), fzL);
    twoBone(H, 0, fyR, fzR, L_THIGH, L_SHIN, MAX_LEG);
    p[RKNEE].set(-footX, _k.ky, _k.kz);
    p[RFOOT].set(-footX, Math.min(fyR, H - 0.001), fzR);

    // ---- kollar ----
    // 1) serbest sallanma: karşı bacakla; havada öne-yukarı açılır
    const bend = 0.12 + 0.3 * walkAmt + 0.55 * runAmt;
    const idle = 0.03 * Math.sin(this.t * 1.7) * (1 - walkAmt);
    const aL = lerp(-armAmp * Math.cos(phL) + idle, 0.75, air);
    const aR = lerp(armAmp * Math.cos(phL) - idle, 0.75, air);
    this._freeArm(1, shY, shZL, aL, aL + bend + 0.25 * Math.max(0, aL) + 0.3 * air, _fe[0], _fh[0], 0.06 + 0.1 * air);
    this._freeArm(-1, shY, shZR, aR, aR + bend + 0.25 * Math.max(0, aR) + 0.3 * air, _fe[1], _fh[1], 0.06 + 0.1 * air);

    // 2) ekipman tutuşu: silah bakış eğimiyle birlikte omuz ortası etrafında döner; eller tutuş noktalarına uzanır
    if (hold) {
      _S.set(0, shY, (shZL + shZR) / 2);
      const pa = -this.pitch * hold.pk;
      _wp.set(hold.o[0], hold.o[1] + ady, hold.o[2] + adz).applyAxisAngle(X_AXIS, pa).add(_S);
      _wq.setFromAxisAngle(X_AXIS, pa - hold.rx - arx);
      if (hold.ry) {
        _yq.setFromAxisAngle(Y_AXIS, hold.ry);
        _wq.premultiply(_yq);
      }
      this.mount.position.copy(_wp);
      this.mount.quaternion.copy(_wq);
      const gr = GRIPS[this.equipType];
      _t.set(gr.R[0], gr.R[1], gr.R[2]).applyQuaternion(_wq).add(_wp);
      ik3(p[RSH], _t, L_UARM, L_FARM, POLE[1], _we[1], _wh[1]);
      if (gr.L) _t.set(gr.L[0], gr.L[1], gr.L[2]).applyQuaternion(_wq).add(_wp);
      else _t.set(hold.free[0], hold.free[1], hold.free[2]).applyAxisAngle(X_AXIS, pa).add(_S);
      ik3(p[LSH], _t, L_UARM, L_FARM, POLE[0], _we[0], _wh[0]);
      const glow = this.mount.children[0]?.userData.glow;
      if (glow?.material.isMeshBasicMaterial) glow.scale.setScalar(0.85 + Math.random() * 0.5 + (this.act?.kind === 'zap' ? 0.9 : 0)); // sopa / fitil kıvılcımı
    }

    // 3) taşıma (eşya / ceset) ve tırmanma
    if (this.carryT > 0.01) {
      const drop = this.carryKind === 'corpse' ? -0.4 : -0.2;
      for (let i = 0; i < 2; i++) {
        _t.set(i === 0 ? 0.13 : -0.13, shY + drop, shZ + 0.34);
        ik3(p[i === 0 ? LSH : RSH], _t, L_UARM, L_FARM, POLE[i], _ce[i], _ch[i]);
      }
    }
    const climbArm = (i) => {
      const s = i === 0 ? 1 : -1;
      _t.set(s * 0.16, shY + 0.3 + 0.18 * Math.sin(cp + (i === 0 ? 0 : Math.PI)), shZ + 0.2);
      ik3(p[i === 0 ? LSH : RSH], _t, L_UARM, L_FARM, POLE_UP[i], _ce[i], _ch[i]);
    };

    // 4) karışım: serbest → ekipman → taşıma → tırmanma
    const iEl = [LEL, REL];
    const iHand = [LHAND, RHAND];
    for (let i = 0; i < 2; i++) {
      const e = p[iEl[i]];
      const h = p[iHand[i]];
      e.copy(_fe[i]);
      h.copy(_fh[i]);
      if (A > 0.001) {
        e.lerp(_we[i], A);
        h.lerp(_wh[i], A);
      }
      if (this.carryT > 0.01) {
        e.lerp(_ce[i], this.carryT);
        h.lerp(_ch[i], this.carryT);
      }
      if (climb > 0.01) {
        climbArm(i);
        e.lerp(_ce[i], climb);
        h.lerp(_ch[i], climb);
      }
    }

    this.view.update(false); // dünya matrisleri çizim sırasında hesaplanır
    // kafa: tam bakılan yöne eğilir (fener / yüz); dururken ve fener kapalıyken hafifçe etrafa bakınır
    const look = this.lit ? 0 : Math.sin(this.t * 0.6) * 0.18 * (1 - walkAmt) * (1 - 0.8 * A);
    _hq.setFromAxisAngle(X_AXIS, -this.pitch);
    _yq.setFromAxisAngle(Y_AXIS, look);
    this.view.head.quaternion.copy(_hq.premultiply(_yq));
  }

  /** Serbest sallanan kol: a1 = üst kol açısı (aşağıdan ileri doğru, rad); a2 = ön kol mutlak açısı. */
  _freeArm(side, sy, sz, a1, a2, outE, outH, elOut) {
    const elY = sy - L_UARM * Math.cos(a1);
    const elZ = sz + L_UARM * Math.sin(a1);
    outE.set(side * (SH_X + elOut), elY, elZ);
    outH.set(side * (SH_X + elOut + 0.02), elY - L_FARM * Math.cos(a2), elZ + L_FARM * Math.sin(a2));
  }

  dispose() {
    this.group.removeFromParent();
    this.view.dispose();
  }
}
