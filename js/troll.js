// TROLLHACKS: normal bir oyunda tarayıcı konsoluna  TrollHacks.enabled = true;  yazınca açılan hile araçları + X-ray.
//   • F2 paneli (debug.js): rol değiştir, silah / gizli eşya ver, öldür / patlat / diriltme, ışınlama (yanına git / önüme getir), noclip,
//     ölümsüzlük, görünmezlik, susturma, ekrana yazı, çarpışma görünümü ve X-ray. BOT EKLEME ve tur yenileme yoktur (debug odasına özel).
//   • Oyuncular panelde oyun içi kimlikleriyle (NATO adı + renk) görünür.
//   • X-ray (TrollHacks.xray): duvar arkasındaki oyuncuları yarı saydam siluet + rol etiketiyle gösterir.
//   • Kapatmak: TrollHacks.enabled = false;   Yardım: TrollHacks.help();
//   Yetki: istemci kendini ilan eder ({t:'troll'}), host lobideki "TrollHacks" ayarına bakıp kabul eder (host kendi konsolundan hep açabilir).
//   Bütün işlemleri ve gizli bilgiyi (trollInfo: roller, hayat, işaretler) host uygular / verir.
import * as THREE from 'three';
import { GAME_CONFIG } from './config.js';
import { ctx } from './context.js';
import { ROLES } from './roles.js';
import { clamp, colorCss, h } from './util.js';

const P = GAME_CONFIG.player;
const _v = new THREE.Vector3();

class Troll {
  constructor() {
    this._on = false;
    this.allowed = false; // misafirde: host izin verdi (trollAck / trollInfo)
    this.denied = false; // "izin yok" uyarısı bir kez gösterilsin
    this.xray = false; // duvar arkası görüş (panelden)
    this.info = {}; // misafirde son trollInfo: { id: [rol, hayatta, işaretler, eşyalar] }
    this.baiter = null;
    this.lovers = null;
    this.beat = 0;
  }

  get enabled() {
    return this._on;
  }

  set enabled(v) {
    v = !!v;
    if (v === this._on) return;
    this._on = v;
    if (!v) {
      this.allowed = false;
      this.denied = false;
      this.xray = false;
      this.info = {};
    }
    this.beat = 4;
    this.sync();
    const msg = v ? 'TrollHacks açık: oyundayken F2 ile paneli aç.' : 'TrollHacks kapalı.';
    console.info(`[TrollHacks] ${msg}`);
    ctx.ui?.toast(msg, 3000);
  }

  /** Debug odasının host'u mu (bot ekleme, tur yenileme vb. de açık). */
  get debugRoom() {
    return !!(ctx.isHost && ctx.host?.debug);
  }

  /** Panel ve X-ray kullanılabilir mi: debug odası host'u ya da TrollHacks açık + (host ya da host izinli). */
  get usable() {
    return this.debugRoom || (this._on && (ctx.isHost || this.allowed));
  }

  /** Durumu host'a bildirir (misafir) / TAB listesi rollerini yeniler (host). */
  sync() {
    try {
      if (ctx.isHost && ctx.host) ctx.host.sendVis(ctx.myId);
      else if (ctx.room && ctx.myId) ctx.client?.toHost({ t: 'troll', on: this._on ? 1 : 0 });
    } catch (e) {
      /* henüz bağlı değil: sonraki kalp atışında yeniden denenir */
    }
  }

  /** Panel işlemi: host'ta doğrudan uygulanır, misafirde host'a istek olarak gider. */
  op(name, ...a) {
    if (ctx.isHost && ctx.host) return ctx.host.trollOp(ctx.myId, { op: name, a });
    ctx.client?.toHost({ t: 'trollOp', op: name, a });
    return true;
  }

  onInfo(m) {
    this.allowed = true;
    this.denied = false;
    this.info = m.p || {};
    this.baiter = m.b ?? null;
    this.lovers = m.l || null;
  }

  onAck(m) {
    this.allowed = !!m.ok;
    if (m.ok) this.denied = false;
    else if (this._on && !this.denied) {
      this.denied = true;
      ctx.ui?.toast('Host bu odada TrollHacks kullanımına izin vermiyor.', 3500);
    }
  }

  /** id → { role, alive, god, ghost, noclip, mute, items } (host: doğrudan durumdan; misafir: son trollInfo'dan). Yoksa null. */
  infoOf(id) {
    if (ctx.isHost && ctx.host) {
      const S = ctx.host.state;
      const st = S.players[id];
      if (!st) return null;
      const f = S.dbg?.[id] || {};
      return { role: st.role, alive: !!st.alive, god: !!f.god, ghost: !!f.ghost, noclip: !!f.noclip, mute: !!f.mute, items: st.items || [] };
    }
    const a = this.info?.[id];
    if (!a) return null;
    const f = a[2] || '';
    return { role: a[0], alive: !!a[1], god: f.includes('g'), ghost: f.includes('h'), noclip: f.includes('n'), mute: f.includes('m'), items: a[3] || [] };
  }

  isBaiter(id) {
    return (ctx.isHost && ctx.host ? ctx.host.state.baiterId : this.baiter) === id;
  }

  isLover(id) {
    const l = ctx.isHost && ctx.host ? ctx.host.state.lovers : this.lovers;
    return !!l && l.includes(id);
  }

  /** Her kare: misafir kalp atışı (yeniden bağlanan oyuncu yeniden tanınsın) + yetki gidince açık araçları kapat. */
  update(dt) {
    if (this._on && !ctx.isHost && ctx.room) {
      this.beat -= dt;
      if (this.beat <= 0) {
        this.beat = 4;
        this.sync();
      }
    }
    if (!this.usable) {
      this.xray = false;
      if (ctx.world?.collision?.debugOn) ctx.world.setCollisionView(false);
    }
  }

  help() {
    console.info('[TrollHacks] TrollHacks.enabled = true;  → oyundayken F2 paneli · TrollHacks.xray = true;  → duvar arkası görüş · TrollHacks.enabled = false;  → kapat');
  }
}

export const TrollHacks = new Troll();
window.TrollHacks = TrollHacks;

/** X-ray: derinlik testi "daha uzakta" (GreaterDepth) olduğundan siluet yalnızca bir şeyin ARKASINDA kalan yerlerde çizilir; rol etiketi ekrana (DOM) yansıtılır. */
export class XRay {
  constructor(root) {
    this.group = new THREE.Group();
    this.group.name = '__xray';
    this.group.visible = false;
    ctx.sceneMgr.scene.add(this.group);
    this.geo = new THREE.CapsuleGeometry(0.36, 1.04, 2, 10); // boy ≈ 1,76 m
    this.mats = new Map();
    this.items = new Map(); // oyuncu id → { mesh, el, sig }
    this.tags = h('div', { class: 'xray-layer', style: { display: 'none' } });
    root.appendChild(this.tags);
    this.shown = false;
  }

  mat(color) {
    let m = this.mats.get(color);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false, fog: false, toneMapped: false });
      m.depthFunc = THREE.GreaterDepth;
      this.mats.set(color, m);
    }
    return m;
  }

  drop(id) {
    const it = this.items.get(id);
    if (!it) return;
    this.group.remove(it.mesh);
    it.el.remove();
    this.items.delete(id);
  }

  update() {
    const on = !!(TrollHacks.xray && TrollHacks.usable && ctx.me && (ctx.phase === 'playing' || ctx.phase === 'ended'));
    if (on !== this.shown) {
      this.shown = on;
      this.group.visible = on;
      this.tags.style.display = on ? '' : 'none';
    }
    if (!on) {
      for (const id of [...this.items.keys()]) this.drop(id);
      return;
    }
    const cam = ctx.sceneMgr.camera;
    cam.updateMatrixWorld();
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    const W = window.innerWidth;
    const H = window.innerHeight;
    const seen = new Set();
    for (const p of ctx.players.all()) {
      if (p.isLocal || p.id === ctx.myId || !p.alive || p.hideBody) continue;
      seen.add(p.id);
      let it = this.items.get(p.id);
      if (!it) {
        const mesh = new THREE.Mesh(this.geo, this.mat('#ffffff'));
        mesh.renderOrder = 997;
        const el = h('div', { class: 'xray-tag' });
        this.group.add(mesh);
        this.tags.appendChild(el);
        it = { mesh, el, sig: '' };
        this.items.set(p.id, it);
      }
      const role = TrollHacks.infoOf(p.id)?.role || ctx.vis?.[p.id]?.role || null;
      const R = ROLES[role];
      const color = R?.color || (p.identity?.color != null ? colorCss(p.identity.color) : '#ffffff'); // rol rengi CSS dizgesi; kimlik rengi sayı
      const k = clamp((p.eyeH || P.eyeHeight) / P.eyeHeight, 0.6, 1); // eğilince siluet de alçalır
      it.mesh.material = this.mat(color);
      it.mesh.scale.y = k;
      it.mesh.position.set(p.pos.x, p.pos.y + 0.88 * k, p.pos.z);

      const tag = `${p.identity?.label || p.name}${TrollHacks.isBaiter(p.id) ? ' · Baiter' : ''}${TrollHacks.isLover(p.id) ? ' · ♥' : ''}`;
      const sig = `${role}|${color}|${tag}`;
      if (sig !== it.sig) {
        it.sig = sig;
        it.el.replaceChildren(h('b', { style: { color } }, R?.name || '?'), h('small', {}, tag));
      }
      _v.set(p.pos.x, p.pos.y + 1.95 * k, p.pos.z).applyMatrix4(cam.matrixWorldInverse);
      if (_v.z > -0.1) {
        it.el.style.display = 'none'; // kameranın arkasında
        continue;
      }
      _v.applyMatrix4(cam.projectionMatrix);
      it.el.style.display = '';
      it.el.style.transform = `translate(${((_v.x * 0.5 + 0.5) * W).toFixed(1)}px, ${((-_v.y * 0.5 + 0.5) * H).toFixed(1)}px) translate(-50%, -100%)`;
    }
    for (const id of [...this.items.keys()]) if (!seen.has(id)) this.drop(id);
  }
}
