// DEBUG HARİTA RAPORU: haritada (house.glb ya da örnek ev) hangi nesnelerin tanındığını, hangilerinin bulunamadığını konsola yazar.
//  1) ÖZET          : kaynak (GLB / örnek ev), mesh / üçgen sayısı, harita boyutu, animasyon klipleri
//  2) BULUNANLAR    : her tür için nesne adı + konum + ayrıntılar (console.table)
//  3) BULUNAMAYANLAR: beklenen ama haritada olmayan türler (örnek adlarıyla)
//  4) UYARILAR      : eksik eşleşmeler (düğmesiz kafes, hedefsiz şalter, kullanılmayan ayar anahtarları, menteşesi ortada kapı...)
//  5) TANINMAYANLAR : hiçbir kurala uymayan adlı nesneler (+ yazım hatası ipuçları)
// Ne zaman çalışır: debug odasında tur başlayınca otomatik, debug panelindeki "Harita raporu" düğmesiyle, ya da konsoldan: __game.world.logReport()
import * as THREE from 'three';
import { EXPECTED_KINDS, GAME_CONFIG, LIGHT_GROUPS, OBJECT_OVERRIDES, PAINTING_CONFIG, QUALITY_PRESETS } from './config.js';
import { matchesGroupEntry, sameName } from './util.js';

const KIND_LABEL = {
  collision: 'Çarpışma gövdesi (Collision_)',
  spawn: 'Doğma noktası (Spawn_)',
  room: 'Oda (Room_)',
  door: 'Kapı (Door_)',
  switch: 'Işık şalteri (Switch_)',
  light: 'Işık (Light_)',
  grab: 'Tutulabilir eşya (Grab_)',
  painting: 'Tablo (Painting_)',
  midPaint: 'Serbest dönen tablo (MidPaint_)',
  ladder: 'Merdiven (Ladder_)',
  cage: 'Kafes (Cage)',
  cageButton: 'Kafes düğmesi (Cage_Button)',
  specialDoor: 'Özel kapı / hareketli duvar (Special_Door)',
  specialDoorButton: 'Özel kapı düğmesi (Special_Door_Button)',
  executionLever: 'İdam şalteri (Execution_...)',
  deathZone: 'İdam alanı (DeathZone)',
  interact: 'Etkileşim noktası (Interact_)',
};

// Tanınmayan adlarda yazım hatası / yanlış önek ipucu için anahtar kelimeler
const KEYWORDS = [
  ['door', 'Door_01'], ['switch', 'Switch_01'], ['light', 'Light_01'], ['grab', 'Grab_01'], ['spawn', 'Spawn_01'], ['room', 'Room_01'],
  ['cage', 'Cage'], ['painting', 'Painting_01'], ['execution', 'Execution_Lever'], ['deathzone', 'DeathZone'], ['collision', 'Collision_Walls'],
  ['interact', 'Interact_Door_01'], ['ladder', 'Ladder_01'], ['midpaint', 'MidPaint_01'],
];

const r2 = (n) => Math.round(n * 100) / 100;
const fmtVec = (v) => (v ? `${r2(v.x)}, ${r2(v.y)}, ${r2(v.z)}` : '-');
const deg = (rad) => Math.round((rad * 180) / Math.PI);

function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[m][n];
}

/** Tanınmayan bir ad için ipucu: "kapıya benziyor ama Door ile başlamıyor" gibi. Yoksa ''. */
function hintFor(name) {
  const low = name.toLowerCase();
  const lead = (low.match(/^[a-zçğıöşü]+/) || [''])[0];
  for (const [word, example] of KEYWORDS) {
    if (lead && lead !== word && editDistance(lead, word) <= (word.length > 5 ? 2 : 1) && Math.abs(lead.length - word.length) <= 2) {
      return `yazım hatası olabilir → "${example}" gibi başlamalı`;
    }
  }
  for (const [word, example] of KEYWORDS) {
    if (low.includes(word) && !low.startsWith(word)) return `"${word}" geçiyor ama başta değil → "${example}" gibi başlamalı`;
  }
  return '';
}

/**
 * Görünür bir mesh'in (sınır kutusu box, boyutu size) statik çarpışmada bir "ikizi" var mı? En ince eksendeki iki ana yüzün ortası ve kutunun merkezi
 * statik üçgenlere ≤ 0.25 m yakınsa (aynı yerde duran bir Collision_ kutusu) true. Kutunun zemine / yan duvara DEĞEN yüzleri bilerek denenmez.
 */
function coveredByStatic(col, box, size) {
  if (!col.staticBvh) return false;
  const c = box.getCenter(new THREE.Vector3());
  let thin = 'x';
  for (const a of ['y', 'z']) if (size[a] < size[thin]) thin = a;
  const pts = [c, c.clone(), c.clone()];
  pts[1][thin] += size[thin] * 0.5;
  pts[2][thin] -= size[thin] * 0.5;
  const info = {};
  return pts.some((p) => {
    const r = col.staticBvh.closestPointToPoint(p, info, 0, 0.3);
    return !!r && r.distance < 0.25;
  });
}

/** Tür başına ayrıntı sütunları. */
function detailsOf(world, kind, e) {
  const d = {};
  const sys = world.systems || {};
  switch (kind) {
    case 'door': {
      const x = sys.doors?.doors.get(e.name);
      if (x) {
        d.açı = `${deg(x.cfg.openAngle)}°`;
        d.süre = `${x.cfg.duration}s`;
      }
      break;
    }
    case 'light': {
      const x = sys.lights?.lights.get(e.name);
      if (x) {
        d.şiddet = x.base;
        d.gerçekIşık = x.direct ? (x.real ? 'evet (sabit ışık)' : 'hayır (ışık bütçesi doldu)') : 'ışık havuzundan: sana yakınken gerçek ışık';
        d.nodeTürü = e.node.isLight ? 'Blender ışığı' : 'nokta (Empty/mesh)';
      }
      break;
    }
    case 'switch': {
      const x = sys.lights?.switches.get(e.name);
      if (x) d.kontrolEttiği = x.targets.length ? x.targets.join(', ') : '— (hiçbir ışık)';
      break;
    }
    case 'grab': {
      const x = world.grab?.items.get(e.name);
      if (x) {
        d.ağırlık = x.weight;
        d.boyut = `${r2(x.size.x)}×${r2(x.size.y)}×${r2(x.size.z)}`;
        d.taşınır = x.carryable;
        d.fırlatılır = x.throwable;
      }
      break;
    }
    case 'painting': {
      const x = sys.paintings?.paintings.get(e.name);
      if (x) d.süre = `${x.tween.forward}s`;
      break;
    }
    case 'midPaint': {
      const x = sys.midPaints?.byId.get(e.name);
      if (x) {
        d.boyut = `${r2(x.max.x - x.min.x)}×${r2(x.max.y - x.min.y)}×${r2(x.max.z - x.min.z)}`;
        d.kütle = x.mass;
        d.eksen = x.axis ? `${r2(x.axis.x)}, ${r2(x.axis.y)}, ${r2(x.axis.z)}` : 'serbest';
        d.sönüm = x.damping;
      }
      break;
    }
    case 'ladder': {
      const x = sys.ladders?.list.find((l) => l.id === e.name);
      if (x) {
        d.alt = r2(x.bottom);
        d.tepe = r2(x.top);
        d.yükseklik = r2(x.top - x.bottom);
      }
      break;
    }
    case 'cage':
    case 'specialDoor': {
      const s = kind === 'cage' ? sys.cage : sys.specialDoor;
      if (s?.cfg) {
        d.mesafe = s.cfg.moveDistance;
        d.yön = s.cfg.direction.map(r2).join(', ');
        d.süre = `${s.cfg.moveDuration}s / ${s.cfg.riseDuration}s`;
      }
      break;
    }
    case 'executionLever': {
      const l = sys.execution?.levers.find((x) => x.id === e.name);
      if (l) {
        d.kol = l.handle === l.node ? '(şalterin kendisi döner)' : l.handle.name;
        d.açı = `${deg(l.angle)}°`;
      }
      break;
    }
    case 'deathZone':
    case 'room': {
      if (e.box) {
        const s = e.box.getSize(new THREE.Vector3());
        d.boyut = `${r2(s.x)}×${r2(s.y)}×${r2(s.z)}`;
      }
      if (kind === 'deathZone') d.hasar = `${e.data.damage ?? GAME_CONFIG.execution.damage} / ${GAME_CONFIG.execution.interval}s`;
      break;
    }
    case 'spawn':
      d.yön = `${deg(e.yaw)}°`;
      break;
    case 'collision': {
      let tris = 0;
      let meshes = 0;
      e.node.traverse((n) => {
        if (n.isMesh && n.geometry) {
          meshes++;
          tris += (n.geometry.index ? n.geometry.index.count : n.geometry.attributes.position.count) / 3;
        }
      });
      d.mesh = meshes;
      d.üçgen = Math.round(tris);
      break;
    }
    default:
      break;
  }
  return d;
}

/** Raporu hesaplar (konsola yazmaz). Dönen nesne: { summary, found, missing, warnings, unmatched, text }. */
export function buildMapReport(world) {
  const model = world.model;
  const kinds = world.kinds;
  const sys = world.systems || {};

  // ---------- özet ----------
  let meshes = 0;
  let tris = 0;
  let named = 0;
  world.root.traverse((n) => {
    if (n.name) named++;
    if (n.isMesh && n.geometry) {
      meshes++;
      tris += (n.geometry.index ? n.geometry.index.count : n.geometry.attributes.position.count) / 3;
    }
  });
  const size = world.bounds.getSize(new THREE.Vector3());
  const clips = world.anim?.names?.() || [];
  const summary = {
    kaynak: world.source === 'glb' ? 'house.glb (Blender modeli)' : 'ÖRNEK EV (assets/house.glb bulunamadı / yüklenemedi)',
    mesh: meshes,
    üçgen: Math.round(tris),
    adlıNesne: named,
    haritaBoyutu: `${r2(size.x)} × ${r2(size.y)} × ${r2(size.z)} m`,
    animasyonKlipleri: clips.length ? clips.join(', ') : '—',
    tanınanNesne: model.entries.length,
    tanınmayanAd: model.unmatched.length,
    çarpışma: `${world.collisionMode === 'collision' ? 'Collision_* nesneleri' : 'görünür mesh\'ler (Collision_* yok)'} — ${world.collision.stats.meshes} mesh, ${world.collision.stats.triangles} üçgen; hareketli: ${world.collision.dynamic.size} nesne`,
  };

  // ---------- bulunanlar ----------
  const found = {};
  const order = [...EXPECTED_KINDS.map((k) => k.kind), ...Object.keys(kinds).filter((k) => !EXPECTED_KINDS.some((x) => x.kind === k))];
  for (const kind of order) {
    const list = kinds[kind];
    if (!list?.length) continue;
    found[kind] = list.map((e) => ({ ad: e.name, konum: fmtVec(e.position), ...detailsOf(world, kind, e) }));
  }

  // ---------- bulunamayanlar ----------
  const missing = EXPECTED_KINDS.filter((k) => !kinds[k.kind]?.length).map((k) => ({
    tür: KIND_LABEL[k.kind] || k.kind,
    örnekAd: k.example,
    açıklama: k.note,
    zorunlu: k.required ? 'EVET' : 'hayır',
  }));

  // ---------- uyarılar ----------
  const warnings = [];
  const has = (k) => !!kinds[k]?.length;

  if (!has('collision')) warnings.push('Collision_* yok: görünen tüm mesh\'ler çarpışma gövdesi sayıldı (yavaş ve fazla katı olabilir). Duvar/zemin için "Collision_Walls" gibi bir grup ekle.');
  if (!has('spawn')) warnings.push('Spawn_* yok: herkes harita ortasında (0,0,0) doğar. "Spawn_01 ... Spawn_16" boş nesneleri ekle.');
  else if (kinds.spawn.length < GAME_CONFIG.maxPlayers) warnings.push(`${kinds.spawn.length} doğma noktası var, ${GAME_CONFIG.maxPlayers} oyuncuya yetmez: fazla oyuncular noktaların üstüne yakın doğar.`);
  if (!has('room')) warnings.push('Room_* yok: Uyurgezer ışınlanması rastgele noktaya gider; oyuncu listesinde oda adı görünmez.');

  if (has('cage') && !has('cageButton') && !kinds.interact?.some((e) => /cage/i.test(e.name))) warnings.push('Cage var ama Cage_Button (ya da Interact_Cage) yok: kafes çalıştırılamaz.');
  if (!has('cage') && has('cageButton')) warnings.push('Cage_Button var ama Cage yok: düğme hiçbir şeyi hareket ettirmez.');
  if (has('specialDoor') && !has('specialDoorButton') && !kinds.interact?.some((e) => /special/i.test(e.name))) warnings.push('Special_Door var ama Special_Door_Button yok: özel kapı çalıştırılamaz.');
  if (!has('specialDoor') && has('specialDoorButton')) warnings.push('Special_Door_Button var ama Special_Door yok.');
  if (has('executionLever') && !has('deathZone')) warnings.push('İdam şalteri var ama DeathZone (hasar alanı) yok: şalter çevrilince kimse hasar almaz.');
  if (!has('executionLever') && has('deathZone')) warnings.push('DeathZone var ama idam şalteri (Execution_Lever ...) yok: alan hiç açılamaz.');
  if (has('deathZone') && has('executionLever') && sys.execution) {
    for (const l of sys.execution.levers) if (l.handle === l.node) warnings.push(`${l.id}: altında "handle/arm/kol" adlı bir kol nesnesi yok → şalterin KENDİSİ döner (pivot = nesne orijini).`);
  }

  if (sys.lights) {
    for (const sw of sys.lights.switches.values()) if (!sw.targets.length) warnings.push(`${sw.id}: hiçbir ışığı kontrol etmiyor (config.js → LIGHT_GROUPS içinde tanımla).`);
    const controlled = new Set();
    for (const sw of sys.lights.switches.values()) sw.targets.forEach((t) => controlled.add(t));
    const lonely = [...sys.lights.lights.keys()].filter((id) => !controlled.has(id));
    if (lonely.length && sys.lights.switches.size) warnings.push(`Hiçbir şalterin kontrol etmediği ışıklar: ${lonely.join(', ')}`);
    const maxReal = Math.min(GAME_CONFIG.lights.maxActive, QUALITY_PRESETS[world.quality]?.maxLights ?? GAME_CONFIG.lights.maxActive);
    if (sys.lights.lights.size > maxReal) warnings.push(`${sys.lights.lights.size} ışık var ama "${world.quality}" kalitesinde aynı anda yalnızca sana en yakın ${maxReal} tanesi gerçek ışık olarak çizilir (ışık havuzu). Performans için normaldir.`);
    if (!sys.lights.lights.size && sys.lights.switches.size) warnings.push('Switch_* var ama Light_* yok: şalter hiçbir şeyi açıp kapatmaz.');
  }

  // Kapı menteşesi: orijin kapının ortasındaysa kapı ortasından döner
  for (const e of kinds.door || []) {
    const box = new THREE.Box3().setFromObject(e.node);
    const c = box.getCenter(new THREE.Vector3());
    const s = box.getSize(new THREE.Vector3());
    const half = Math.max(s.x, s.z) / 2;
    if (half > 0.3 && Math.hypot(e.position.x - c.x, e.position.z - c.z) < half * 0.25) {
      warnings.push(`${e.name}: nesne orijini kapının ORTASINDA görünüyor → kapı ortasından döner. Blender'da orijini menteşeye taşı (Object > Set Origin > Origin to 3D Cursor).`);
    }
  }

  // Serbest dönen tablo: pivot (nesne orijini) plakanın ortasında olmalı; değilse plaka o noktadan döner
  for (const b of sys.midPaints?.list || []) {
    const off = Math.hypot((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
    if (off > 0.15) warnings.push(`${b.id}: pivot (nesne orijini) plakanın ORTASINDA değil (${r2(off)} m kaçık) → plaka ortasından değil o noktadan döner. Blender'da orijini ortaya al (Object > Set Origin > Origin to Geometry).`);
    let meshCount = 0;
    b.node.traverse((n) => n.isMesh && meshCount++);
    if (!meshCount) warnings.push(`${b.id}: altında mesh yok (Empty): çarpışma gövdesi olmaz, plaka içinden geçilir. Bir mesh (tablo) olmalı.`);
  }
  // Merdiven: mesh'siz (Empty) ise kutu = ölçek (ya da "size" özelliği)
  for (const l of sys.ladders?.list || []) {
    let meshCount = 0;
    l.node.traverse((n) => n.isMesh && meshCount++);
    if (!meshCount) warnings.push(`${l.id}: altında mesh yok (Empty): tırmanma kutusu nesnenin ölçeğinden (ya da "size": [genişlik, yükseklik, derinlik] özelliğinden) alınır.`);
  }

  // Interact_* hedefleri
  for (const link of world.anchorLinks || []) if (!link.target) warnings.push(`${link.name}: hedef nesne bulunamadı (adı "Interact_<HedefAdı>" olmalı, örn. Interact_Door_01).`);

  // Kullanılmayan ayar anahtarları
  const entryNames = model.entries.map((e) => e.name);
  for (const key of Object.keys(OBJECT_OVERRIDES)) {
    if (!entryNames.some((n) => sameName(n, key))) warnings.push(`config.js → OBJECT_OVERRIDES["${key}"]: haritada karşılığı yok (kullanılmıyor).`);
  }
  for (const key of Object.keys(PAINTING_CONFIG)) {
    if (key === 'default') continue;
    if (!(kinds.painting || []).some((e) => sameName(e.name, key))) warnings.push(`config.js → PAINTING_CONFIG["${key}"]: haritada böyle bir tablo yok.`);
  }
  for (const [key, groups] of Object.entries(LIGHT_GROUPS)) {
    if (!(kinds.switch || []).some((e) => sameName(e.name, key))) warnings.push(`config.js → LIGHT_GROUPS["${key}"]: haritada böyle bir şalter yok.`);
    for (const g of groups) {
      if (!(kinds.light || []).some((e) => matchesGroupEntry(e.name, g))) warnings.push(`config.js → LIGHT_GROUPS["${key}"] içindeki "${g}" hiçbir ışıkla eşleşmiyor.`);
    }
  }

  // Aynı tür içinde aynı kanonik ad (Door_1 ve Door_01 gibi)
  for (const [kind, list] of Object.entries(kinds)) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (sameName(list[i].name, list[j].name)) warnings.push(`${KIND_LABEL[kind] || kind}: "${list[i].name}" ile "${list[j].name}" aynı sayılıyor (ayarlar ikisine de uygulanır).`);
      }
    }
  }

  // Çarpışma kapsamı: görünen ama ÇARPIŞMAYAN büyük mesh'ler ("duvarın içinden geçiyorum" nedeni) + ölçeği uygulanmamış hareketli nesneler
  {
    const col = world.collision;
    const dynMeshes = new Set();
    const skewed = [];
    for (const c of col.dynamic.values()) {
      for (const p of c.parts) {
        dynMeshes.add(p.mesh);
        const hi = Math.max(p.sx, p.sy, p.sz);
        if (hi - Math.min(p.sx, p.sy, p.sz) > 0.01 * Math.max(hi, 1e-6)) skewed.push(`${c.id} (${r2(p.sx)}, ${r2(p.sy)}, ${r2(p.sz)})`);
      }
    }
    const uncovered = [];
    const bb = new THREE.Box3();
    world.root.traverseVisible((n) => {
      if (!n.isMesh || !n.geometry || n.userData?.isCollisionView || col.staticMeshes.has(n) || dynMeshes.has(n)) return;
      bb.setFromObject(n);
      if (bb.isEmpty()) return;
      const s = bb.getSize(new THREE.Vector3());
      const big = Math.max(s.x, s.y, s.z);
      if (big < 1.2 || coveredByStatic(col, bb, s)) return; // küçük dekor ya da çarpışma ikizi (aynı yerdeki Collision_ kutusu) var
      const nm = n.name || n.parent?.name || '(adsız)';
      uncovered.push({ big, text: `${nm} (${r2(s.x)}×${r2(s.y)}×${r2(s.z)})` });
    });
    uncovered.sort((a, b) => b.big - a.big);
    if (uncovered.length) {
      warnings.push(`ÇARPIŞMASI OLMAYAN büyük görünür mesh'ler (${uncovered.length}): ${uncovered.slice(0, 15).map((u) => u.text).join(', ')}${uncovered.length > 15 ? ', ...' : ''} → bunlar duvar / zemin ise İÇİNDEN GEÇİLİR. Blender'da adını "Collision_..." yap ya da aynı şekilde bir Collision_ nesnesi ekle. Debug panelindeki "Çarpışmayı göster" ile kontrol et.`);
    }
    if (skewed.length) {
      warnings.push(`Ölçeği UYGULANMAMIŞ hareketli nesneler (x, y, z ölçeği farklı): ${skewed.slice(0, 12).join(', ')} → çarpışma yine de doğru hesaplanır; yine de Blender'da Ctrl+A → Scale uygulaman önerilir.`);
    }
  }

  // ---------- tanınmayanlar ----------
  const unmatched = model.unmatched.map((u) => ({ ad: u.name, tür: u.type, altNesne: u.children, ipucu: hintFor(u.name) }));

  // ---------- düz metin (kopyalamak için) ----------
  const lines = [];
  lines.push(`HARİTA RAPORU — ${summary.kaynak}`);
  for (const [k, v] of Object.entries(summary)) lines.push(`  ${k}: ${v}`);
  lines.push('BULUNANLAR:');
  for (const [kind, rows] of Object.entries(found)) lines.push(`  ${KIND_LABEL[kind] || kind} [${rows.length}]: ${rows.map((x) => x.ad).join(', ')}`);
  lines.push('BULUNAMAYANLAR:');
  for (const m of missing) lines.push(`  ${m.tür} → örnek ad "${m.örnekAd}" (${m.açıklama})${m.zorunlu === 'EVET' ? ' [ZORUNLU]' : ''}`);
  lines.push('UYARILAR:');
  for (const w of warnings) lines.push(`  ! ${w}`);
  lines.push('TANINMAYAN ADLAR:');
  for (const u of unmatched) lines.push(`  ${u.ad} (${u.tür})${u.ipucu ? ` — ${u.ipucu}` : ''}`);

  return { summary, found, missing, warnings, unmatched, text: lines.join('\n') };
}

/** Raporu konsola yazar ve nesne olarak döndürür. */
export function printMapReport(world, { title = 'HARİTA RAPORU' } = {}) {
  const rep = buildMapReport(world);
  const css = 'font-weight:bold;color:#7ad0ff';
  console.group(`%c${title}`, css);

  console.group('%cÖZET', css);
  console.table(rep.summary);
  console.groupEnd();

  console.group(`%cBULUNANLAR (${Object.keys(rep.found).length} tür)`, 'font-weight:bold;color:#6bdc7a');
  for (const [kind, rows] of Object.entries(rep.found)) {
    console.groupCollapsed(`${KIND_LABEL[kind] || kind} — ${rows.length} adet`);
    console.table(rows);
    console.groupEnd();
  }
  console.groupEnd();

  console.group(`%cBULUNAMAYANLAR (${rep.missing.length})`, 'font-weight:bold;color:#ffb347');
  if (rep.missing.length) console.table(rep.missing);
  else console.log('Beklenen tüm nesne türleri haritada var.');
  console.groupEnd();

  console.group(`%cUYARILAR (${rep.warnings.length})`, 'font-weight:bold;color:#ff6b6b');
  if (rep.warnings.length) for (const w of rep.warnings) console.warn(w);
  else console.log('Uyarı yok.');
  console.groupEnd();

  console.group(`%cTANINMAYAN ADLAR (${rep.unmatched.length})`, 'font-weight:bold;color:#c9a0ff');
  if (rep.unmatched.length) {
    console.log('Bu adlı nesneler hiçbir kurala uymadı: normal dekor olabilir; kapı/ışık vb. olmasını bekliyorsan adını kontrol et.');
    console.table(rep.unmatched);
  } else console.log('Tüm adlı nesneler bir kurala uydu.');
  console.groupEnd();

  console.log('Düz metin (kopyalamak için): __game.world.lastReport.text');
  console.groupEnd();
  world.lastReport = rep;
  return rep;
}
