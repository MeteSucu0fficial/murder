// Three.js sahnesi: renderer, kamera, ortam ışığı/sis (gece atmosferi), fener ışık havuzu.
import * as THREE from 'three';
import { GAME_CONFIG, QUALITY_PRESETS } from './config.js';
import { clamp, damp, lerp } from './util.js';

const COLOR_DAY = new THREE.Color(0x1d2330);
const COLOR_NIGHT = new THREE.Color(0x020306);

export class SceneManager {
  constructor(canvas, quality = 'high') {
    this.canvas = canvas;
    this.quality = QUALITY_PRESETS[quality] ? quality : 'high';
    const q = QUALITY_PRESETS[this.quality];

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: q.antialias, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    // Gölge yalnızca fener (SpotLight) içindir: ışık duvardan geçmesin. "low" kalitede kapalıdır (yerine menzil kısılır → inventory.js).
    // Not: gölge ayarı sayfa yüklenirken belirlenir; çalışırken değişirse shader yeniden derleneceği için kalite menüsü sayfa yenilemesi ister.
    this.shadowsOn = !!q.shadows;
    this.renderer.shadowMap.enabled = this.shadowsOn;
    this.renderer.shadowMap.type = q.shadowMap >= 1024 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = COLOR_DAY.clone();
    this.scene.fog = new THREE.FogExp2(COLOR_DAY.getHex(), GAME_CONFIG.lights.fogOn);

    // near = 0.05: kapsül yarıçapı (0.32) varken duvara yaslanıp geniş açıyla yan bakınca bile yakın düzlem duvarın içine girmez (içini görmezsin).
    this.camera = new THREE.PerspectiveCamera(GAME_CONFIG.camera.fov, 1, 0.05, 140);
    this.scene.add(this.camera);

    this.hemi = new THREE.HemisphereLight(0xd8e0ff, 0x2a2622, GAME_CONFIG.lights.ambientOn);
    this.scene.add(this.hemi);

    this.worldGroup = new THREE.Group();
    this.actorGroup = new THREE.Group();
    this.fxGroup = new THREE.Group();
    this.scene.add(this.worldGroup, this.actorGroup, this.fxGroup);

    // Fener ışık havuzu: ışık sayısı sabit kalır (shader yeniden derlenmesin diye intensity 0 ile kapatılır).
    // castShadow da SABİT kalır (değişirse shader yeniden derlenir). Kullanımda olmayan ışığın gölge haritası çizilmez: acquire/release → shadow.autoUpdate.
    this.spots = [];
    const FL = GAME_CONFIG.flashlight;
    const spotCount = 1 + FL.maxRemoteLights;
    for (let i = 0; i < spotCount; i++) {
      const light = new THREE.SpotLight(FL.color, 0, FL.range, FL.angle, FL.penumbra, 1.6);
      light.castShadow = this.shadowsOn;
      if (this.shadowsOn) {
        const sh = light.shadow;
        sh.mapSize.set(q.shadowMap, q.shadowMap);
        sh.bias = FL.shadowBias;
        sh.normalBias = FL.shadowNormalBias;
        sh.camera.near = FL.shadowNear;
        sh.autoUpdate = false;
      }
      this.scene.add(light, light.target);
      this.spots.push({ light, inUse: false });
    }

    this.overlays = [];
    this.darkness = 0; // 0 aydınlık, 1 karanlık (hedef)
    this._dark = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
  }

  /** Havuzdan boş bir fener ışığı al (yoksa null). priority: yüksek = yerel oyuncu. */
  acquireSpot() {
    const s = this.spots.find((x) => !x.inUse);
    if (!s) return null;
    s.inUse = true;
    s.light.distance = GAME_CONFIG.flashlight.range;
    if (s.light.castShadow) s.light.shadow.autoUpdate = true; // gölge haritası her karede yenilenir
    return s;
  }
  releaseSpot(s) {
    if (!s) return;
    s.inUse = false;
    s.light.intensity = 0;
    if (s.light.castShadow) s.light.shadow.autoUpdate = false; // kullanılmayan ışık için gölge geçişi yapılmaz
  }

  setDarkness(d) {
    this.darkness = Math.min(1, Math.max(0, d));
  }

  setQuality(name) {
    if (!QUALITY_PRESETS[name]) return;
    this.quality = name;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY_PRESETS[name].pixelRatio));
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    const L = GAME_CONFIG.lights;
    this._dark = damp(this._dark, this.darkness, L.transitionSpeed, dt);
    this.hemi.intensity = lerp(L.ambientOn, L.ambientOff, this._dark);
    this.scene.fog.density = lerp(L.fogOn, L.fogOff, this._dark);
    this.scene.fog.color.copy(COLOR_DAY).lerp(COLOR_NIGHT, this._dark);
    this.scene.background.copy(this.scene.fog.color);
  }

  /** Görüş alanı (derece) — Ayarlar > Genel. Silah görünümünün kendi sabit FOV'u vardır. */
  setFov(deg) {
    this.camera.fov = clamp(Number(deg) || GAME_CONFIG.camera.fov, 60, 110);
    this.camera.updateProjectionMatrix();
  }

  /** Ana görüntünün üstüne çizilen katmanlar (birinci şahıs silah görünümü). { render(renderer, camera) } */
  addOverlay(o) {
    this.overlays.push(o);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
    for (const o of this.overlays) o.render(this.renderer, this.camera);
  }
}

/** Düşük kalite: PBR materyalleri daha ucuz Lambert materyale çevirir. */
export function convertToLambert(root) {
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const conv = (m) => {
      if (!m.isMeshStandardMaterial) return m;
      const n = new THREE.MeshLambertMaterial({
        color: m.color,
        map: m.map,
        emissive: m.emissive,
        emissiveMap: m.emissiveMap,
        emissiveIntensity: m.emissiveIntensity,
        transparent: m.transparent,
        opacity: m.opacity,
        side: m.side,
        alphaTest: m.alphaTest,
        vertexColors: m.vertexColors,
      });
      n.name = m.name;
      return n;
    };
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
  });
}
