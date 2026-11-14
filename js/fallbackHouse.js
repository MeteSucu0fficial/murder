// house.glb yoksa kurulan ÖRNEK EV (BÜYÜK sürüm: 28 × 16 m, 2 kat, kafes çukuru, merdivenler, iki gizli tünel). Gerçek bir Blender modeliyle
// AYNI isim kurallarını kullanır; yani buradaki nesneler de blenderLoader.classify() ile tanınır. Oyunun her sistemini denemene yarar:
// kapılar, şalterler, ışıklar, kayan / serbest dönen tablolar, merdivenler, kafes + buton, özel kapı, idam alanı + şalter, tutulan eşyalar, odalar.
// GİZLİ TÜNELLER: Painting_04 / Painting_05 (kuzey duvar) evin DIŞINDAKİ uzun tünele açılır; Painting_06 / Painting_07 iki oda arasındaki duvar geçidini kapatır.
// (Menüden "Örnek evi GLB olarak indir" ile bunu Blender'a aktarıp kendi evin için şablon yapabilirsin.)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const H = 3.0; // duvar yüksekliği
const SLAB = 0.2;
const UP = 3.2; // üst kat zemin yüksekliği
const XW = 14; // evin yarı genişliği (x: -14..14)
const ZW = 8; // evin yarı derinliği (z: -8..8)
const SX0 = -5.5; // merdivenin başladığı x (üst kat deliği: SX0-0.1 .. SX0+4)
const CX = -9.5; // kafes merkezi (Room_01)
const CZ = -5;

export function buildFallbackHouse() {
  const root = new THREE.Group();
  root.name = 'ExampleHouse';

  const mat = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, ...extra });
  const M = {
    wall: mat(0xd9d2c3),
    floor: mat(0x8a6a4a),
    ceil: mat(0xeeeeee),
    stair: mat(0x7a5a3c),
    door: mat(0x5a3b22),
    metal: mat(0x3a3f47),
    red: mat(0xb02020),
    paint: [mat(0x3a6ea5), mat(0xa5513a), mat(0x4aa56a), mat(0x8a5ab0), mat(0xc9a23c)],
    crate: mat(0xb08a4a),
    barrel: mat(0x2f6f6f),
    ball: mat(0xd0b030),
    heavy: mat(0x555a66),
    pit: mat(0x111111),
    tunnel: mat(0x4a463f),
    tunnelFloor: mat(0x39362f),
    rug: mat(0x7a2f3a),
  };

  const visual = new THREE.Group();
  visual.name = 'Visual';
  const colWalls = new THREE.Group();
  colWalls.name = 'Collision_Walls';
  const colFloor = new THREE.Group();
  colFloor.name = 'Collision_Floor';
  const colStairs = new THREE.Group();
  colStairs.name = 'Collision_Stairs';
  root.add(visual, colWalls, colFloor, colStairs);

  const box = (parent, w, h, d, x, y, z, m) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const colMat = new THREE.MeshBasicMaterial();
  /** Hem görsel hem çarpışma kutusu: min/max köşe koordinatlarıyla. */
  const solid = (x1, y1, z1, x2, y2, z2, m, group = colWalls) => {
    const w = Math.abs(x2 - x1);
    const h = Math.abs(y2 - y1);
    const d = Math.abs(z2 - z1);
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const cz = (z1 + z2) / 2;
    box(visual, w, h, d, cx, cy, cz, m);
    box(group, w, h, d, cx, cy, cz, colMat);
  };
  const wallX = (x1, x2, z, y0, t = 0.3, m = M.wall) => solid(x1, y0, z - t / 2, x2, y0 + H, z + t / 2, m);
  const wallZ = (z1, z2, x, y0, t = 0.3, m = M.wall) => solid(x - t / 2, y0, z1, x + t / 2, y0 + H, z2, m);
  /** X ekseni boyunca duvar; gaps = [[merkez, genişlik], ...] kapı boşlukları (üstte lento kalır). */
  const wallXGaps = (x1, x2, z, y0, gaps) => {
    let cur = x1;
    for (const [c, w] of [...gaps].sort((a, b) => a[0] - b[0])) {
      wallX(cur, c - w / 2, z, y0);
      solid(c - w / 2, y0 + 2.2, z - 0.15, c + w / 2, y0 + H, z + 0.15, M.wall);
      cur = c + w / 2;
    }
    wallX(cur, x2, z, y0);
  };
  const wallZGaps = (z1, z2, x, y0, gaps) => {
    let cur = z1;
    for (const [c, w] of [...gaps].sort((a, b) => a[0] - b[0])) {
      wallZ(cur, c - w / 2, x, y0);
      solid(x - 0.15, y0 + 2.2, c - w / 2, x + 0.15, y0 + H, c + w / 2, M.wall);
      cur = c + w / 2;
    }
    wallZ(cur, z2, x, y0);
  };

  // ---------- Zeminler ----------
  // Zemin kat: kafes çukuru (CX ± 1, CZ ± 1) için delikli
  solid(-XW, -0.2, -ZW, XW, 0, CZ - 1, M.floor, colFloor);
  solid(-XW, -0.2, CZ - 1, CX - 1, 0, CZ + 1, M.floor, colFloor);
  solid(CX + 1, -0.2, CZ - 1, XW, 0, CZ + 1, M.floor, colFloor);
  solid(-XW, -0.2, CZ + 1, XW, 0, ZW, M.floor, colFloor);
  // Çukur tabanı ve duvarları
  solid(CX - 1.2, -5.6, CZ - 1.2, CX + 1.2, -5.4, CZ + 1.2, M.pit, colFloor);
  solid(CX - 1.2, -5.4, CZ - 1.2, CX - 1, 0, CZ + 1.2, M.pit);
  solid(CX + 1, -5.4, CZ - 1.2, CX + 1.2, 0, CZ + 1.2, M.pit);
  solid(CX - 1, -5.4, CZ - 1.2, CX + 1, 0, CZ - 1, M.pit);
  solid(CX - 1, -5.4, CZ + 1, CX + 1, 0, CZ + 1.2, M.pit);

  // Üst kat zemini: merdiven deliği x SX0-0.1 .. SX0+4, z 0.4..2.6
  solid(-XW, UP - SLAB, -ZW, XW, UP, 0.4, M.floor, colFloor);
  solid(-XW, UP - SLAB, 2.6, XW, UP, ZW, M.floor, colFloor);
  solid(SX0 + 4, UP - SLAB, 0.4, XW, UP, 2.6, M.floor, colFloor);
  solid(-XW, UP - SLAB, 0.4, SX0 - 0.1, UP, 2.6, M.floor, colFloor);
  // Çatı
  solid(-XW - 0.2, UP + H, -ZW - 0.2, XW + 0.2, UP + H + SLAB, ZW + 0.2, M.ceil);

  // ---------- Dış duvarlar (zemin katın kuzeyinde iki tünel girişi boşluğu: x = -9.5 ve 9.5) ----------
  for (const y0 of [0, UP]) {
    wallXGaps(-XW - 0.15, XW + 0.15, -ZW, y0, y0 === 0 ? [[-9.5, 1.2], [9.5, 1.2]] : []);
    wallX(-XW - 0.15, XW + 0.15, ZW, y0);
    wallZ(-ZW, ZW, -XW, y0);
    wallZ(-ZW, ZW, XW, y0);
  }

  // ---------- Zemin kat iç duvarları ----------
  // Kuzey sıra (Room_01 | Room_02 | Room_03) ile koridor arası: Door_01, Door_02, Door_03
  wallXGaps(-XW, XW, -2, 0, [[-9.5, 1.2], [0, 1.2], [9.5, 1.2]]);
  wallZGaps(-ZW, -2, -5, 0, [[-5, 1.2]]); // Room_01 | Room_02: GİZLİ geçit (iki yanında Painting_06 / Painting_07)
  wallZ(-ZW, -2, 5, 0, 0.4); // Room_02 | Room_03
  // Güney: Room_05 (GB) ve Room_04 (GD); ortası açık salon (Room_07)
  wallXGaps(-XW, -7, 2, 0, [[-10.5, 1.2]]); // Door_05
  wallZ(2, ZW, -7, 0);
  wallXGaps(4, XW, 2, 0, [[9, 1.2]]); // Door_04
  wallZGaps(2, ZW, 4, 0, [[5, 1.2]]); // Room_04 batı duvarı: Special_Door geçidi
  // Üst kat: kuzeyde iki oda (Door_06, Door_07), güneyi açık
  wallXGaps(-XW, XW, -2, UP, [[-7, 1.2], [7, 1.2]]);
  wallZ(-ZW, -2, 0, UP, 0.4);

  // ---------- Merdiven ----------
  const sz1 = 0.6;
  const sz2 = 2.4;
  for (let i = 1; i <= 16; i++) {
    const x1 = SX0 + (i - 1) * 0.25;
    box(visual, 0.25, i * 0.2, sz2 - sz1, x1 + 0.125, (i * 0.2) / 2, (sz1 + sz2) / 2, M.stair);
  }
  {
    const ax = SX0;
    const bx = SX0 + 3.875;
    const ay = 0.1;
    const by = 3.2;
    const len = Math.hypot(bx - ax, by - ay);
    const ang = Math.atan2(by - ay, bx - ax);
    const ramp = box(colStairs, len, 0.2, sz2 - sz1, 0, 0, (sz1 + sz2) / 2, colMat);
    const n = new THREE.Vector3(-Math.sin(ang), Math.cos(ang), 0);
    ramp.rotation.z = ang;
    ramp.position.set((ax + bx) / 2, (ay + by) / 2, (sz1 + sz2) / 2).addScaledVector(n, -0.1);
  }

  // ---------- GİZLİ TÜNEL: evin kuzey duvarının DIŞINDA (z -10.3 .. -8.15), iki ucundaki tablonun arkasından girilir ----------
  {
    const TZ = -ZW - 0.15; // kuzey dış duvarın dış yüzü
    solid(-11, -0.2, -10.6, 11, 0, TZ, M.tunnelFloor, colFloor); // zemin
    solid(-11, 2.6, -10.6, 11, 2.8, TZ, M.tunnel); // tavan
    solid(-11, 0, -10.6, 11, 2.6, -10.3, M.tunnel); // kuzey duvar
    solid(-11, 0, -10.3, -10.7, 2.6, TZ, M.tunnel); // batı ucu
    solid(10.7, 0, -10.3, 11, 2.6, TZ, M.tunnel); // doğu ucu
    solid(-1.5, 0, -10.3, 1.5, 0.5, -9.7, M.crate); // ortada alçak sandık yığını (üstünden zıplanır / eğilip geçilir)
  }

  // ---------- Odalar (görünmez bölgeler) ----------
  const room = (name, x1, y1, z1, x2, y2, z2) => {
    const r = box(root, x2 - x1, y2 - y1, z2 - z1, (x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2, colMat);
    r.name = name;
  };
  room('Room_01', -XW, 0, -ZW, -5.2, 3, -2.2); // kafes odası (KB)
  room('Room_02', -4.8, 0, -ZW, 4.8, 3, -2.2); // idam odası (K)
  room('Room_03', 5.2, 0, -ZW, XW, 3, -2.2); // (KD)
  room('Room_04', 4.2, 0, 2.2, XW, 3, ZW); // merdiven + alçak platform + özel kapı (GD)
  room('Room_05', -XW, 0, 2.2, -7.2, 3, ZW); // depo (GB)
  room('Room_06', -XW, 0, -1.8, XW, 3, 1.8); // koridor
  room('Room_07', -6.8, 0, 2.2, 3.8, 3, ZW); // salon
  room('Room_08', -XW, UP, -ZW, XW, UP + 3, ZW); // üst kat
  room('Room_09', -10.7, 0, -10.3, 10.7, 2.6, -8.15); // gizli tünel

  // ---------- Kapılar (menteşe orijinde) ----------
  const door = (name, hx, hz, y = 0) => {
    const g = new THREE.BoxGeometry(1.15, 2.15, 0.07);
    g.translate(0.575, 1.075, 0);
    const d = new THREE.Mesh(g, M.door);
    d.name = name;
    d.position.set(hx, y, hz);
    root.add(d);
  };
  door('Door_01', -10.1, -2); // Room_01
  door('Door_02', -0.6, -2); // Room_02
  door('Door_03', 8.9, -2); // Room_03
  door('Door_04', 8.4, 2); // Room_04
  door('Door_05', -11.1, 2); // Room_05
  door('Door_06', -7.6, -2, UP); // üst kat, batı oda
  door('Door_07', 6.4, -2, UP); // üst kat, doğu oda

  // ---------- Işıklar ve şalterler ----------
  const light = (name, x, y, z) => {
    const l = new THREE.PointLight(0xfff0cc, 20, 14, 2);
    l.name = name;
    l.position.set(x, y, z);
    root.add(l);
  };
  light('Light_01', -9.5, 2.7, -5); // Room_01
  light('Light_02', 0, 2.7, -5); // Room_02
  light('Light_07', 9.5, 2.7, -5); // Room_03
  light('Light_05', -7, 2.7, 0); // koridor (batı)
  light('Light_06', 7, 2.7, 0); // koridor (doğu)
  light('Light_08', -1.5, 2.7, 5.5); // salon (kendi başına açılır: Interact_Light_08)
  light('Light_09', -10.5, 2.7, 5); // Room_05
  light('Light_10', 9, 2.7, 5); // Room_04
  light('Light_03', -7, UP + 2.7, -5); // üst kat batı oda
  light('Light_04', 7, UP + 2.7, -5); // üst kat doğu oda
  light('Light_11', 0, UP + 2.7, 3.5); // üst kat güney
  light('Light_12', -6, 2.2, -9.2); // tünel
  light('Light_13', 6, 2.2, -9.2); // tünel

  const sw = (name, x, y, z) => {
    const s = box(root, 0.18, 0.28, 0.06, x, y, z, M.metal);
    s.name = name;
  };
  sw('Switch_01', -1.2, 1.3, -1.82); // koridor duvarı: tüm ışıklar
  sw('Switch_02', -3.2, UP + 1.3, ZW - 0.18); // üst kat: Light_03, 04, 11
  sw('Switch_03', -2.5, 1.3, -2.18); // Room_02: kuzey odaların ışıkları
  sw('Switch_04', 0, 1.3, -10.27); // tünelin ışıkları
  {
    // Işığa ayrı etkileşim noktası: Interact_<Hedef> (salondaki Light_08 tek başına açılır / kapanır)
    const a = new THREE.Object3D();
    a.name = 'Interact_Light_08';
    a.position.set(3.7, 1.5, 6.4);
    root.add(a);
  }

  // ---------- Kafes + buton (Room_01) ----------
  {
    const cage = new THREE.Group();
    cage.name = 'Cage';
    cage.position.set(CX, 0, CZ);
    const bars = [];
    const bar = (w, h, d, x, y, z) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(x, y, z);
      bars.push(g);
    };
    const half = 0.95;
    for (const sx of [-half, half]) for (const sz of [-half, half]) bar(0.08, 2.4, 0.08, sx, 1.2, sz);
    for (let i = -3; i <= 3; i++) {
      const v = i * 0.28;
      bar(0.04, 2.3, 0.04, v, 1.2, -half); // kuzey
      bar(0.04, 2.3, 0.04, -half, 1.2, v); // batı
      bar(0.04, 2.3, 0.04, half, 1.2, v); // doğu
    }
    for (const y of [0.5, 1.2, 1.9]) {
      bar(1.9, 0.05, 0.05, 0, y, -half);
      bar(0.05, 0.05, 1.9, -half, y, 0);
      bar(0.05, 0.05, 1.9, half, y, 0);
    }
    bar(1.9, 0.08, 0.08, 0, 2.3, half); // güney kapı lentosu
    bar(1.9, 0.08, 1.9, 0, 2.4, 0); // tavan
    cage.add(new THREE.Mesh(mergeGeometries(bars), M.metal));
    box(cage, 1.98, 0.12, 1.98, 0, -0.06, 0, M.metal);
    root.add(cage);
    const b = box(root, 0.2, 0.2, 0.08, -XW + 0.2, 1.2, CZ, M.red);
    b.name = 'Cage_Button';
    b.rotation.y = Math.PI / 2;
  }

  // ---------- Tablolar ----------
  // Kayan tablolar (Painting_*): config.js → PAINTING_CONFIG. Boyut: w × h. Tablonun GERİSİNDEKİ boşluk / girinti görünür.
  const painting = (name, i, x, y, z, rotY, w = 1.2, h = 0.8) => {
    const p = box(root, w, h, 0.05, x, y, z, M.paint[i]);
    p.name = name;
    p.rotation.y = rotY;
  };
  painting('Painting_01', 0, -2, 1.7, -ZW + 0.18, 0); // Room_02 kuzey duvarı
  box(visual, 1.6, 1.2, 0.04, -2, 1.7, -ZW + 0.16, M.pit); // Painting_01'in arkasındaki girinti
  painting('Painting_02', 1, 9.5, 1.7, -ZW + 0.18, 0); // Room_03 kuzey duvarı (sağdan kayar)
  painting('Painting_03', 2, 6, UP + 1.7, -ZW + 0.18, 0); // üst kat
  // GİZLİ GEÇİTLER: tabloyu kaydır → arkasında kapı boyunda boşluk. (Tablo kapı kadar yüksek.)
  painting('Painting_04', 3, -9.5, 1.1, -ZW + 0.18, 0, 1.3, 2.2); // Room_01 → kuzey tünel (batı girişi)
  painting('Painting_05', 4, 9.5, 1.1, -ZW + 0.18, 0, 1.3, 2.2); // Room_03 → kuzey tünel (doğu girişi)
  painting('Painting_06', 3, -4.82, 1.1, -5, Math.PI / 2, 1.3, 2.2); // Room_02 tarafı: iki oda arası geçit
  painting('Painting_07', 4, -5.18, 1.1, -5, Math.PI / 2, 1.3, 2.2); // Room_01 tarafı: aynı geçit

  // ---------- Serbest dönen tablolar (MidPaint_*) ----------
  // Pivot = nesnenin orijini = plakanın ORTASI (Blender'da da orijini plakanın ortasına koy). Değince / iterken / eşya çarpınca döner; katıdır.
  // Varsayılan: yalnızca kendi Y ekseni etrafında döner (axis: 'vertical'); 'normal' = kendi düzleminde tekerlek gibi, 'free' = her yöne.
  {
    const free = box(root, 1.1, 1.4, 0.06, 0.5, 1.4, 5.0, M.paint[1]);
    free.name = 'MidPaint_01'; // salonda asılı: yüzü x yönüne bakar, yürüyenler iter
    free.rotation.y = Math.PI / 2;
    const wheel = box(root, 0.9, 0.9, 0.05, -3, 1.7, ZW - 0.215, M.paint[2]);
    wheel.name = 'MidPaint_02'; // güney duvarına yapışık: tekerlek gibi kendi düzleminde döner
    wheel.userData.axis = 'normal';
    const ball = box(root, 0.8, 1.0, 0.06, 3.4, 1.4, -5.6, M.paint[0]);
    ball.name = 'MidPaint_03'; // Room_02'de asılı: her yöne serbest döner
    ball.rotation.y = Math.PI / 2;
    ball.userData.axis = 'free';
  }

  // ---------- Merdivenler (Ladder_*) + alçak platformlar (GD ve GB köşeleri) ----------
  // Platformun üstü 1.1 m: zıplayarak çıkılamaz. Merdivene değip W / Boşluk basılı tutarak tırman; tepede platforma sıçrarsın. Merdiven KATI DEĞİLDİR.
  const ladderTop = 1.1 + 0.25;
  const ladder = (name, x, zMid) => {
    const g = new THREE.Group();
    g.name = name;
    for (const z of [zMid - 0.2, zMid + 0.2]) box(g, 0.05, ladderTop, 0.05, x, ladderTop / 2, z, M.metal); // dikmeler
    for (let y = 0.2; y < ladderTop - 0.05; y += 0.25) box(g, 0.04, 0.04, 0.45, x, y, zMid, M.metal); // basamaklar
    root.add(g);
  };
  solid(11.2, 0, 6.4, 13.85, 1.1, 7.85, M.crate);
  ladder('Ladder_01', 11.14, 7.15);
  solid(-13.85, 0, 6.4, -11.2, 1.1, 7.85, M.crate);
  ladder('Ladder_02', -11.14, 7.15);

  // ---------- Özel kapı (hareketli duvar) + buton ----------
  {
    const sd = box(root, 0.3, 2.2, 1.2, 4, 1.1, 5, M.metal);
    sd.name = 'Special_Door';
    const b = box(root, 0.2, 0.2, 0.08, 3.81, 1.2, 3.8, M.red);
    b.name = 'Special_Door_Button';
    b.rotation.y = Math.PI / 2;
  }

  // ---------- İdam alanı (Room_02) ----------
  {
    const dz = box(root, 2.6, 2.2, 2.6, 0, 1.1, -5, colMat);
    dz.name = 'DeathZone';
    box(visual, 2.6, 0.02, 2.6, 0, 0.01, -5, M.red);
    // İdam ŞALTERİ: duvara monte plaka (Execution_Lever) + tabanından menteşeli kol (Execution_Lever_Handle).
    // Grup Y'de 180° döndürülür: kol odaya (oyuncuya) doğru devrilir. Kapalı: duvara yatık, açık: öne yatık.
    const lever = new THREE.Group();
    lever.name = 'Execution_Lever';
    lever.position.set(2, 1.1, -2.2);
    lever.rotation.y = Math.PI;
    box(lever, 0.3, 0.42, 0.06, 0, 0, 0, M.metal);
    const handle = new THREE.Group();
    handle.name = 'Execution_Lever_Handle';
    handle.position.set(0, -0.12, 0.04);
    handle.rotation.x = -0.45;
    box(handle, 0.05, 0.3, 0.05, 0, 0.15, 0, M.red);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), M.red);
    knob.position.set(0, 0.32, 0);
    handle.add(knob);
    lever.add(handle);
    root.add(lever);
  }

  // ---------- Süs: salonda halı (yalnızca görsel) ----------
  box(visual, 3.4, 0.02, 2.2, -1.5, 0.01, 5.5, M.rug);

  // ---------- Taşınabilir eşyalar ----------
  const grab = (name, geo, m, x, y, z) => {
    const g = new THREE.Mesh(geo, m);
    g.name = name;
    g.position.set(x, y, z);
    root.add(g);
  };
  const crate = () => new THREE.BoxGeometry(0.4, 0.4, 0.4);
  const barrel = () => new THREE.CylinderGeometry(0.22, 0.22, 0.6, 14);
  const ball = () => new THREE.SphereGeometry(0.2, 14, 10);
  grab('Grab_01', crate(), M.crate, -12.5, 0.2, -3); // Room_01
  grab('Grab_02', barrel(), M.barrel, 9.5, 0.3, -3.5); // Room_03
  grab('Grab_03', ball(), M.ball, -3.5, 0.2, 4.5); // salon
  grab('Grab_04', new THREE.BoxGeometry(0.55, 0.35, 0.35), M.heavy, 5.5, UP + 0.18, 3); // üst kat (ağır)
  grab('Grab_05', crate(), M.crate, -12.5, 0.2, 5); // Room_05
  grab('Grab_06', barrel(), M.barrel, 12.5, 0.3, 3.5); // Room_04
  grab('Grab_07', ball(), M.ball, -9.5, 0.2, -9.2); // tünel
  grab('Grab_08', new THREE.BoxGeometry(0.55, 0.35, 0.35), M.heavy, 2.8, 0.18, -4); // Room_02 (ağır)
  grab('Grab_09', crate(), M.crate, -3, UP + 0.2, -4); // üst kat
  grab('Grab_10', barrel(), M.barrel, 0, 0.3, 0.6); // koridor

  // ---------- Doğma noktaları (zemin katta, tünel dahil) ----------
  const spawns = [
    [-12, -4, 0], [-7.5, -6, 0], [-2.5, -6.5, 0], [3, -6, Math.PI], [8, -4, Math.PI], [12.5, -6, Math.PI],
    [-12, 0, Math.PI / 2], [12, 0, -Math.PI / 2], [-2, 5.5, 0], [1.5, 6.5, Math.PI], [-11, 4.5, 0], [8, 4.5, Math.PI], [0, -8.9, Math.PI / 2],
  ];
  spawns.forEach(([x, z, yaw], i) => {
    const s = new THREE.Object3D();
    s.name = `Spawn_${String(i + 1).padStart(2, '0')}`;
    s.position.set(x, 0, z);
    s.rotation.y = yaw;
    root.add(s);
  });

  // (Işık ampulleri LightSystem tarafından otomatik eklenir.)
  return root;
}
