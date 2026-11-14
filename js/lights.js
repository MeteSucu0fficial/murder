// Işıklar ("Light_*") ve şalterler ("Switch_*").
// Hangi şalterin hangi ışıkları kontrol ettiği config.js → LIGHT_GROUPS içinde tanımlıdır.
// Işıklar kapanınca ortam kararır (SceneManager.setDarkness).
import * as THREE from 'three';
import { GAME_CONFIG, LIGHT_GROUPS, QUALITY_PRESETS } from './config.js';
import { damp, lookupName, matchesGroupEntry, num } from './util.js';

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
    const L = GAME_CONFIG.lights;
    const maxReal = Math.min(L.maxActive, QUALITY_PRESETS[world.quality]?.maxLights ?? L.maxActive);
    let real = 0;

    for (const e of lightEntries) {
      const d = e.data;
      const intensity = num(d.intensity, L.intensity);
      let light = e.node.isLight ? e.node : null;
      if (light) {
        // GLB'den gelen ışık: Blender watt değerleri anlamsız olabildiği için şiddet normalize edilir.
        light.intensity = intensity;
        if (light.distance !== undefined) light.distance = num(d.distance, L.distance);
        if (light.decay !== undefined) light.decay = L.decay;
        light.castShadow = false;
      } else {
        light = new THREE.PointLight(0xfff0cc, intensity, num(d.distance, L.distance), L.decay);
        e.node.add(light);
      }
      const isReal = real < maxReal;
      if (isReal) real++;
      else light.visible = false; // GPU ışık bütçesi doldu: sadece ampul görseli kalır

      let bulb = null;
      if (L.showBulbs && !e.node.isMesh) {
        bulb = new THREE.Mesh(BULB_GEO, new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
        e.node.add(bulb);
      }
      this.lights.set(e.name, { id: e.name, node: e.node, light, base: intensity, cur: 1, on: true, real: isReal, bulb });
    }

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
        position: l.node.getWorldPosition(new THREE.Vector3()),
        requireAnchor: true, // yalnızca "Interact_<ışık>" noktası varsa etkin; o noktaya bakınca seçilir
        label: () => (l.on ? 'Lambayı kapat' : 'Lambayı aç'),
        use: () => world.send({ k: 'light', id: l.id }),
      });
    }
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
      if (l.real) l.light.intensity = l.base * l.cur;
      if (l.bulb) l.bulb.material.color.setRGB(0.12 + 0.88 * l.cur, 0.12 + 0.82 * l.cur, 0.12 + 0.6 * l.cur);
      if (l.on) onCount++;
    }
    const n = this.lights.size;
    this.world.sceneMgr.setDarkness(n ? 1 - onCount / n : 0);
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
