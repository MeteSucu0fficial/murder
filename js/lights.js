// Işıklar ("Light_*") ve şalterler ("Switch_*").
// Hangi şalterin hangi ışıkları kontrol ettiği config.js → LIGHT_GROUPS içinde tanımlıdır.
// Işıklar kapanınca ortam kararır (SceneManager.setDarkness).
//
// IŞIK HAVUZU (performans): haritada kaç ışık olursa olsun GPU'ya aynı anda yalnızca kalite ayarındaki sayıda (QUALITY_PRESETS → maxLights)
// nokta ışığı gider: kameraya EN YAKIN ve açık olanlar. Işık sayısı sabit kaldığı için shader yeniden derlenmez; bir yuva başka ışığa
// geçerken önce söner, sonra yanar (zıplama olmaz). Önceden "ilk N ışık" gerçekti (sıraya göre); artık oyuncunun bulunduğu oda her zaman aydınlıktır.
// GLB'den gelen SpotLight / DirectionalLight gibi nokta olmayan ışıklar havuza girmez: olduğu gibi (sabit) kalır.
import * as THREE from 'three';
import { GAME_CONFIG, LIGHT_GROUPS, QUALITY_PRESETS } from './config.js';
import { clamp, damp, lookupName, matchesGroupEntry, num } from './util.js';

const BULB_GEO = new THREE.SphereGeometry(0.09, 10, 8);

/**
 * "Gece" mi? Işıkların büyük kısmı kapalıysa gece, açıksa gündüz (sabah) sayılır.
 * Medyum bağlantısı yalnızca gece kurulabilir ve ışıklar açılınca (sabah) otomatik kesilir.
 * Haritada hiç ışık yoksa kural devre dışıdır (hep "gece").
 */
export const isNight = (lights) => {
  if (!lights || !lights.lights.size) return true;
  return lights.litFraction < GAME_CONFIG.abilities.medium.nightLitFraction;
};

export class LightSystem {
  constructor(world, lightEntries, switchEntries) {
    this.world = world;
    this.lights = new Map();
    this.switches = new Map();
    this.interactables = [];
    this.enabled = true; // Ayarlar → Işık efektleri (kapalıysa gerçek ışık çizilmez)
    this.pool = []; // { light, src, keep, fade }
    this.pickT = 0;
    const L = GAME_CONFIG.lights;
    const maxReal = Math.min(L.maxActive, QUALITY_PRESETS[world.quality]?.maxLights ?? L.maxActive);
    let direct = 0; // havuza girmeyen (nokta olmayan) gerçek ışıklar
    let pooled = 0;

    for (const e of lightEntries) {
      const d = e.data;
      const node = e.node;
      const intensity = num(d.intensity, L.intensity);
      const distance = num(d.distance, L.distance);
      const pos = node.getWorldPosition(new THREE.Vector3());
      const isDirect = !!node.isLight && !node.isPointLight; // SpotLight / DirectionalLight: olduğu gibi kalır
      let light = null;
      let real = true;
      if (isDirect) {
        // GLB'den gelen ışık: Blender watt değerleri anlamsız olabildiği için şiddet normalize edilir.
        light = node;
        light.intensity = intensity;
        if (light.distance !== undefined) light.distance = distance;
        if (light.decay !== undefined) light.decay = L.decay;
        light.castShadow = false;
        real = direct < maxReal;
        if (real) direct++;
        else light.visible = false; // GPU ışık bütçesi doldu
      } else {
        if (node.isLight) node.visible = false; // kaynak nokta ışığı çizilmez; yakındakiler havuzdaki ışıklara taşınır
        pooled++;
      }

      let bulb = null;
      if (L.showBulbs && !node.isMesh) {
        bulb = new THREE.Mesh(BULB_GEO, new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
        if (node.isLight) {
          bulb.position.copy(pos); // gizlenen ışık nesnesinin çocuğu olsaydı ampul de gizlenirdi
          world.sceneMgr.scene.add(bulb);
        } else node.add(bulb);
      }
      this.lights.set(e.name, {
        id: e.name, node, light, base: intensity, cur: 1, on: true, direct: isDirect, real, bulb, slot: null, d2: 0,
        distance, pos, color: node.isLight ? node.color.clone() : new THREE.Color(0xfff0cc),
      });
    }

    const n = Math.max(0, Math.min(pooled, maxReal - direct));
    for (let i = 0; i < n; i++) {
      const light = new THREE.PointLight(0xfff0cc, 0, L.distance, L.decay);
      light.castShadow = false;
      world.sceneMgr.scene.add(light);
      this.pool.push({ light, src: null, keep: false, fade: 0 });
    }
    this._assign();
    for (const s of this.pool) s.fade = 1; // açılışta ışıklar hazır yansın

    for (const e of switchEntries) {
      const groups = lookupName(LIGHT_GROUPS, e.name) || [];
      if (!groups.length) console.warn(`[lights] ${e.name} için config.js → LIGHT_GROUPS içinde hedef ışık tanımlı değil.`);
      const targets = [...this.lights.keys()].filter((id) => groups.some((g) => matchesGroupEntry(id, g)));
      const sw = { id: e.name, node: e.node, on: true, targets };
      this.switches.set(e.name, sw);
      this.interactables.push({
        id: `switch:${e.name}`,
        targetName: e.name,
        kind: 'switch',
        priority: 3,
        position: new THREE.Box3().setFromObject(e.node).getCenter(new THREE.Vector3()),
        object: e.node, // bakış ışını şalterin kendisine değmeli
        hitRadius: 0.1, // küçük şalterler için nişan toleransı
        label: () => (sw.on ? 'Işıkları kapat' : 'Işıkları aç'),
        use: () => world.send({ k: 'switch', id: e.name }),
      });
    }

    // "Interact_Light_01" gibi bir Empty varsa o ışık tek başına açılıp kapanabilir (nokta bağlanınca etkinleşir)
    for (const l of this.lights.values()) {
      this.interactables.push({
        id: `light:${l.id}`,
        targetName: l.id,
        kind: 'switch',
        priority: 3,
        position: l.pos.clone(),
        requireAnchor: true, // yalnızca "Interact_<ışık>" noktası varsa etkin; o noktaya bakınca seçilir
        label: () => (l.on ? 'Lambayı kapat' : 'Lambayı aç'),
        use: () => world.send({ k: 'light', id: l.id }),
      });
    }
  }

  /** Ayarlar → Işık efektleri. Kapalıyken havuz ve sabit ışıklar çizilmez (ortam düz aydınlatılır: scene.js). */
  setEnabled(on) {
    this.enabled = !!on;
    for (const s of this.pool) s.light.visible = this.enabled;
    for (const l of this.lights.values()) if (l.direct && l.real) l.light.visible = this.enabled;
    this.pickT = 0;
  }

  applyEvent(ev) {
    if (ev.k === 'switch') {
      const sw = this.switches.get(ev.id);
      if (!sw) return;
      sw.on = !!ev.on;
      for (const id of sw.targets) this.lights.get(id).on = sw.on;
    } else if (ev.k === 'light') {
      const l = this.lights.get(ev.id);
      if (l) l.on = !!ev.on;
    }
    if (this.world.onSound) this.world.onSound('click', null);
  }

  hostAct(act) {
    if (act.k === 'switch') {
      const sw = this.switches.get(act.id);
      return sw ? { k: 'switch', id: sw.id, on: sw.on ? 0 : 1 } : null;
    }
    const l = this.lights.get(act.id);
    return l ? { k: 'light', id: l.id, on: l.on ? 0 : 1 } : null;
  }

  update(dt) {
    let onCount = 0;
    for (const l of this.lights.values()) {
      const t = l.on ? 1 : 0;
      l.cur = Math.abs(l.cur - t) < 0.01 ? t : damp(l.cur, t, 8, dt);
      if (l.direct && l.real) l.light.intensity = l.base * l.cur;
      if (l.bulb) l.bulb.material.color.setRGB(0.12 + 0.88 * l.cur, 0.12 + 0.82 * l.cur, 0.12 + 0.6 * l.cur);
      if (l.on) onCount++;
    }
    const n = this.lights.size;
    this.world.sceneMgr.setDarkness(n ? 1 - onCount / n : 0);
    if (this.enabled && this.pool.length) this._updatePool(dt);
  }

  /** Havuz yuvalarının yumuşak yanıp sönmesi + belirli aralıkla "en yakın ışıklar" seçimi. */
  _updatePool(dt) {
    const L = GAME_CONFIG.lights;
    this.pickT -= dt;
    if (this.pickT <= 0) {
      this.pickT = L.pickInterval;
      this._assign();
    }
    const step = dt * L.fadeSpeed;
    for (const s of this.pool) {
      const l = s.src;
      if (!l) continue;
      s.fade += clamp((s.keep ? 1 : 0) - s.fade, -step, step);
      s.light.intensity = l.base * l.cur * s.fade;
      if (!s.keep && s.fade <= 0.001) {
        // tamamen söndü: yuva boşaldı, sıradaki ışığa hemen verilsin
        s.light.intensity = 0;
        l.slot = null;
        s.src = null;
        this.pickT = 0;
      }
    }
  }

  /** Kameraya en yakın (açık ya da sönmekte olan) ışıkları seçer; yeni seçilenleri boş yuvalara koyar, uzaklaşanları söndürür. */
  _assign() {
    if (!this.pool.length) return;
    const cam = this.world.sceneMgr.camera.position;
    const cand = [];
    for (const l of this.lights.values()) {
      if (l.direct || (!l.on && l.cur < 0.02)) continue;
      l.d2 = l.pos.distanceToSquared(cam) * (l.slot ? 0.75 : 1); // zaten yanan ışığa pay: sınırda gidip gelmesin
      cand.push(l);
    }
    cand.sort((a, b) => a.d2 - b.d2);
    const want = new Set(cand.length > this.pool.length ? cand.slice(0, this.pool.length) : cand);
    for (const s of this.pool) if (s.src) s.keep = want.has(s.src);
    for (const l of want) {
      if (l.slot) continue;
      const s = this.pool.find((x) => !x.src);
      if (!s) break; // boş yuva yok: en uzaktaki sönünce (pickT = 0) yeniden denenir
      s.src = l;
      s.keep = true;
      s.fade = 0;
      l.slot = s;
      s.light.position.copy(l.pos);
      s.light.color.copy(l.color);
      s.light.distance = l.distance;
    }
  }

  /** 0 = hepsi kapalı, 1 = hepsi açık */
  get litFraction() {
    let c = 0;
    for (const l of this.lights.values()) if (l.on) c++;
    return this.lights.size ? c / this.lights.size : 1;
  }

  getState() {
    const sw = {};
    const li = {};
    for (const s of this.switches.values()) sw[s.id] = s.on ? 1 : 0;
    for (const l of this.lights.values()) li[l.id] = l.on ? 1 : 0;
    return { sw, li };
  }
  setState(s) {
    if (!s) return;
    for (const [id, v] of Object.entries(s.sw || {})) if (this.switches.has(id)) this.switches.get(id).on = !!v;
    for (const [id, v] of Object.entries(s.li || {})) if (this.lights.has(id)) this.lights.get(id).on = !!v;
  }
  reset() {
    for (const s of this.switches.values()) s.on = true;
    for (const l of this.lights.values()) l.on = true;
  }
}
