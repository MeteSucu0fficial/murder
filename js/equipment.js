// Ekipman modelleri (kutu / silindir / küre). Namlu / uç her zaman +Z yönünü gösterir; model başlangıcı = ana el (sağ el) kavraması.
// Yeni ekipman eklemek: buraya bir builder + GRIPS (el noktaları) ekle + config.js → GAME_CONFIG.equipment'a ayar ekle.
// GRIPS: R = sağ elin tuttuğu nokta, L = sol elin tuttuğu nokta (yoksa tek el). İnsan modeli (humanAvatar.js) ve birinci şahıs kolları (viewmodel.js) bunu kullanır.
import * as THREE from 'three';

const mats = new Map();
function mat(c, em = 0) {
  const k = `${c}:${em}`;
  let m = mats.get(k);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: c, emissive: em ? c : 0x000000, emissiveIntensity: em });
    mats.set(k, m);
  }
  return m;
}
const glowMat = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.95, depthWrite: false });

const geos = new Map();
function geo(key, make) {
  let g = geos.get(key);
  if (!g) {
    g = make();
    geos.set(key, g);
  }
  return g;
}

const box = (w, h, d, c, x = 0, y = 0, z = 0, rx = 0, em = 0) => {
  const m = new THREE.Mesh(geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), mat(c, em));
  m.position.set(x, y, z);
  m.rotation.x = rx;
  return m;
};
/** Z ekseni boyunca silindir: r1 = +Z ucundaki yarıçap, r2 = arka uç. */
const cyl = (r1, r2, len, c, x = 0, y = 0, z = 0, em = 0) => {
  const m = new THREE.Mesh(
    geo(`c${r1},${r2},${len}`, () => {
      const g = new THREE.CylinderGeometry(r1, r2, len, 12);
      g.rotateX(Math.PI / 2);
      return g;
    }),
    mat(c, em),
  );
  m.position.set(x, y, z);
  return m;
};
const ball = (r, c, x = 0, y = 0, z = 0, em = 0) => {
  const m = new THREE.Mesh(geo(`s${r}`, () => new THREE.SphereGeometry(r, 14, 10)), mat(c, em));
  m.position.set(x, y, z);
  return m;
};

/** Bıçak ağzı: sırt düz, kesen kenar aşağıda kavisle uca çıkar (uzunluk +Z, kalınlık X). */
function bladeGeo() {
  const s = new THREE.Shape();
  s.moveTo(0, 0.02);
  s.lineTo(0.22, 0.02);
  s.lineTo(0.31, -0.004);
  s.quadraticCurveTo(0.2, -0.03, 0, -0.022);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false });
  g.translate(0, 0, -0.006);
  g.rotateY(-Math.PI / 2);
  return g;
}

const BUILDERS = {
  knife() {
    const g = new THREE.Group();
    const blade = new THREE.Mesh(geo('blade', bladeGeo), mat(0xd9dfe6));
    blade.position.z = 0.01;
    g.add(blade);
    g.add(box(0.014, 0.006, 0.17, 0x9aa4ae, 0, 0.009, 0.12)); // kan oluğu
    g.add(box(0.018, 0.064, 0.02, 0x323941, 0, -0.004, 0)); // siper
    g.add(box(0.034, 0.046, 0.115, 0x1c1a18, 0, 0, -0.068)); // sap
    g.add(box(0.038, 0.01, 0.014, 0x34302c, 0, 0, -0.04), box(0.038, 0.01, 0.014, 0x34302c, 0, 0, -0.075), box(0.038, 0.01, 0.014, 0x34302c, 0, 0, -0.11)); // tutuş girintileri
    g.add(box(0.04, 0.052, 0.016, 0x323941, 0, 0, -0.132)); // kafa
    return g;
  },
  pistol() {
    const g = new THREE.Group();
    g.add(box(0.032, 0.04, 0.2, 0x2c3037, 0, 0.045, 0.1)); // kayar
    g.add(box(0.03, 0.026, 0.17, 0x1d2024, 0, 0.016, 0.085)); // gövde
    g.add(cyl(0.009, 0.009, 0.03, 0x14161a, 0, 0.045, 0.215)); // namlu ucu
    g.add(box(0.032, 0.095, 0.05, 0x15171a, 0, -0.035, 0.02, 0.18)); // kabze
    g.add(box(0.01, 0.012, 0.045, 0x1d2024, 0, -0.012, 0.075)); // tetik siperi
    g.add(box(0.008, 0.012, 0.012, 0xe6e6e6, 0, 0.069, 0.195), box(0.016, 0.01, 0.012, 0xe6e6e6, 0, 0.069, 0.01)); // arpacık / gez
    return g;
  },
  rifle() {
    const g = new THREE.Group();
    g.add(box(0.05, 0.075, 0.23, 0x2f3339, 0, 0.01, 0.075)); // gövde
    g.add(box(0.034, 0.014, 0.22, 0x23262b, 0, 0.056, 0.08)); // ray
    g.add(box(0.034, 0.034, 0.085, 0x14161a, 0, 0.082, 0.07)); // nişangâh
    g.add(box(0.026, 0.026, 0.004, 0x66ccff, 0, 0.082, 0.114, 0, 0.9)); // mercek
    g.add(box(0.052, 0.062, 0.17, 0x3a3f46, 0, 0.005, 0.275)); // el koruması
    g.add(cyl(0.011, 0.011, 0.12, 0x15171a, 0, 0.012, 0.4)); // namlu
    g.add(cyl(0.016, 0.016, 0.04, 0x1a1c20, 0, 0.012, 0.47)); // namlu frenı
    g.add(box(0.008, 0.03, 0.008, 0x15171a, 0, 0.04, 0.44)); // arpacık
    g.add(box(0.045, 0.085, 0.15, 0x4a3a2a, 0, -0.005, -0.115)); // dipçik
    g.add(box(0.05, 0.1, 0.014, 0x1a1a1a, 0, -0.008, -0.192)); // dipçik pedi
    g.add(box(0.034, 0.09, 0.045, 0x1a1c20, 0, -0.075, -0.01, 0.25)); // kabze
    g.add(box(0.035, 0.12, 0.05, 0x1a1c20, 0, -0.095, 0.11, -0.2)); // şarjör
    return g;
  },
  taser() {
    // elektrikli sopa: kauçuk saplı, gümüş yakalı, uçta elektrotlar ve mavi akım
    const g = new THREE.Group();
    g.add(cyl(0.02, 0.02, 0.15, 0x16181b, 0, 0, -0.02)); // sap
    for (const z of [-0.07, -0.035, 0, 0.03]) g.add(cyl(0.024, 0.024, 0.01, 0x2b2f35, 0, 0, z)); // kauçuk halkalar
    g.add(cyl(0.025, 0.025, 0.025, 0xc8ccd2, 0, 0, 0.065)); // gümüş yaka
    g.add(cyl(0.016, 0.016, 0.31, 0x30353c, 0, 0, 0.23)); // gövde
    g.add(cyl(0.023, 0.023, 0.095, 0x20242a, 0, 0, 0.42)); // baş
    g.add(cyl(0.027, 0.027, 0.007, 0x66ccff, 0, 0, 0.4, 1), cyl(0.027, 0.027, 0.007, 0x66ccff, 0, 0, 0.44, 1)); // akım halkaları
    g.add(cyl(0.005, 0.005, 0.05, 0xdfe6ee, 0.013, 0, 0.495), cyl(0.005, 0.005, 0.05, 0xdfe6ee, -0.013, 0, 0.495)); // elektrotlar
    const glow = new THREE.Mesh(geo('glow', () => new THREE.SphereGeometry(0.022, 10, 8)), glowMat(0x7fd8ff));
    glow.position.z = 0.51;
    g.add(glow);
    g.userData.glow = glow;
    return g;
  },
  rocket() {
    const g = new THREE.Group();
    g.add(cyl(0.075, 0.075, 0.9, 0x4d5a3c, 0, 0, 0.1)); // tüp
    g.add(cyl(0.095, 0.075, 0.1, 0x3a4430, 0, 0, -0.33)); // arka kıvrım
    g.add(cyl(0.075, 0.095, 0.1, 0x3a4430, 0, 0, 0.53)); // ön kıvrım
    g.add(cyl(0.078, 0.078, 0.03, 0xd9c34a, 0, 0, 0.3)); // uyarı bandı
    g.add(cyl(0.002, 0.056, 0.14, 0xb02b22, 0, 0, 0.62)); // füze başlığı
    g.add(box(0.04, 0.12, 0.05, 0x1b1d20, 0, -0.12, 0, 0.2)); // kabze
    g.add(box(0.04, 0.1, 0.04, 0x1b1d20, 0, -0.115, 0.22)); // ön tutamak
    g.add(box(0.03, 0.07, 0.04, 0x14161a, 0.03, 0.1, 0.15)); // nişangâh
    return g;
  },
  bomb() {
    // karikatür bomba: koyu küre, boyun, fitil ve kıvılcım
    const g = new THREE.Group();
    g.add(ball(0.09, 0x23262b));
    const neck = new THREE.Mesh(geo('neck', () => new THREE.CylinderGeometry(0.028, 0.034, 0.04, 10)), mat(0x4a4f57));
    neck.position.y = 0.1;
    g.add(neck);
    const fuse = new THREE.Mesh(geo('fuse', () => new THREE.CylinderGeometry(0.006, 0.006, 0.09, 6)), mat(0xc9b27a));
    fuse.position.set(0.02, 0.15, 0);
    fuse.rotation.z = -0.5;
    g.add(fuse);
    g.add(box(0.19, 0.016, 0.016, 0xb02b22, 0, 0, 0.0, 0, 0)); // kırmızı bant
    const spark = new THREE.Mesh(geo('spark', () => new THREE.SphereGeometry(0.018, 8, 6)), glowMat(0xffa030));
    spark.position.set(0.044, 0.19, 0);
    g.add(spark);
    g.userData.glow = spark;
    return g;
  },
  plasma() {
    const g = new THREE.Group();
    g.add(box(0.06, 0.08, 0.3, 0x3b4a63, 0, 0.01, 0.1)); // gövde
    const cells = box(0.064, 0.03, 0.12, 0x58e1ff, 0, 0.012, 0.1, 0, 0.8); // enerji hücreleri
    g.add(cells);
    g.userData.glow = cells;
    g.add(cyl(0.03, 0.025, 0.2, 0x2a3140, 0, 0.015, 0.33)); // namlu gövdesi
    for (const z of [0.27, 0.33, 0.39]) g.add(cyl(0.036, 0.036, 0.012, 0x58e1ff, 0, 0.015, z, 1)); // bobinler
    g.add(cyl(0.038, 0.038, 0.03, 0x7ff0ff, 0, 0.015, 0.45, 1)); // yayıcı
    g.add(box(0.036, 0.09, 0.045, 0x1a1c20, 0, -0.075, 0, 0.25)); // kabze
    g.add(box(0.05, 0.07, 0.14, 0x2a3140, 0, 0, -0.12)); // dipçik
    g.add(box(0.012, 0.04, 0.16, 0x2a3140, 0, 0.06, 0.08)); // üst kanat
    return g;
  },
  sniper() {
    // keskin nişancı tüfeği: uzun namlu + namlu freni, üstte dürbün, sürgü kolu, ahşap dipçik, katlı iki ayak
    const g = new THREE.Group();
    g.add(box(0.05, 0.07, 0.34, 0x2c3138, 0, 0.01, 0.1)); // gövde
    g.add(box(0.046, 0.052, 0.3, 0x4a3a2a, 0, -0.004, 0.42)); // ön ahşap
    g.add(cyl(0.011, 0.011, 0.62, 0x15171a, 0, 0.014, 0.58)); // uzun namlu
    g.add(cyl(0.018, 0.018, 0.07, 0x1a1c20, 0, 0.014, 0.905)); // namlu freni
    g.add(cyl(0.02, 0.02, 0.3, 0x202327, 0, 0.088, 0.1)); // dürbün tüpü
    g.add(cyl(0.032, 0.022, 0.07, 0x202327, 0, 0.088, 0.27)); // ön mercek yuvası
    g.add(cyl(0.022, 0.03, 0.05, 0x202327, 0, 0.088, -0.07)); // göz mercek yuvası
    g.add(cyl(0.027, 0.027, 0.004, 0x66ccff, 0, 0.088, 0.307, 0.9)); // ön mercek parıltısı
    g.add(box(0.026, 0.03, 0.024, 0x15171a, 0, 0.058, 0.0), box(0.026, 0.03, 0.024, 0x15171a, 0, 0.058, 0.2)); // dürbün bağları
    g.add(box(0.05, 0.008, 0.008, 0x9aa4ae, -0.045, 0.02, 0.0), ball(0.014, 0x1c1a18, -0.077, 0.02, 0.0)); // sürgü kolu (sağ yan)
    g.add(box(0.032, 0.06, 0.07, 0x1a1c20, 0, -0.05, 0.12)); // şarjör
    g.add(box(0.034, 0.09, 0.045, 0x1a1c20, 0, -0.075, -0.015, 0.25)); // kabze
    g.add(box(0.046, 0.09, 0.3, 0x4a3a2a, 0, -0.01, -0.22)); // dipçik
    g.add(box(0.04, 0.03, 0.14, 0x3b2e21, 0, 0.045, -0.2)); // yanak desteği
    g.add(box(0.05, 0.11, 0.016, 0x1a1a1a, 0, -0.012, -0.378)); // dipçik pedi
    g.add(box(0.008, 0.008, 0.2, 0x15171a, 0.032, -0.04, 0.5), box(0.008, 0.008, 0.2, 0x15171a, -0.032, -0.04, 0.5), box(0.08, 0.014, 0.014, 0x23262b, 0, -0.03, 0.6)); // katlı ayaklar
    return g;
  },
};

/** Ellerin tuttuğu noktalar (model uzayı: x = SOL, y yukarı, z namlu yönü). L yoksa ekipman tek elle tutulur. */
export const GRIPS = {
  knife: { R: [0, 0, -0.07] },
  pistol: { R: [0, -0.03, 0.025], L: [0.04, -0.065, 0.06] },
  rifle: { R: [0, -0.07, -0.01], L: [0, -0.035, 0.26] },
  taser: { R: [0, 0, -0.02] },
  rocket: { R: [0, -0.14, 0.0], L: [0, -0.14, 0.22] },
  bomb: { R: [-0.095, 0, 0], L: [0.095, 0, 0] },
  plasma: { R: [0, -0.07, 0.0], L: [0, -0.04, 0.24] },
  sniper: { R: [0, -0.075, -0.012], L: [0, -0.03, 0.33] },
};

/** Namlu / uç ucunun modeldeki z'si (namlu ışığı, ışın başlangıcı). */
export const TIPS = { knife: 0.32, pistol: 0.23, rifle: 0.49, taser: 0.52, rocket: 0.7, bomb: 0.1, plasma: 0.48, sniper: 0.94 };

/** Ekipman modeli üretir; bilinmeyen tür için null. */
export function buildEquipmentMesh(type) {
  const b = BUILDERS[type];
  return b ? b() : null;
}

export const EQUIPMENT_TYPES = Object.keys(BUILDERS);
