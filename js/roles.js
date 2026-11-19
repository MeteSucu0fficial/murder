// Rol tanımları, rastgele rol dağıtımı, kimlik (renk/kod adı) atama ve "kim neyi görür" kuralları.
// Yeni rol eklemek: ROLES'a bir kayıt + (varsa) config.js → ROLE_COUNTS / GAME_CONFIG.equipment|abilities ayarı.
// Rol kayıtları: equipment = silah türü (GAME_CONFIG.equipment anahtarı), ability = X tuşu yeteneği (GAME_CONFIG.abilities anahtarı),
// group = rolün kaç kişilik gruplar halinde verildiği (Aşık: 2'li çift; lobideki sayılar GRUP sayısıdır), maxPick = lobide seçilebilecek en çok grup.
import { IDENTITY, ROLE_COUNTS } from './config.js';
import { pick, shuffle } from './util.js';

export const TEAMS = { killer: 'Katil Takımı', innocent: 'Masum Takım' };

/** UMACI'NIN TAKIMI — tek yerden değişir: 'innocent' (Masum Takım, varsayılan) ya da 'killer' (Katil Takımı). Kazanma, görünürlük ve rol listeleri bunu izler. */
export const UMACI_TEAM = 'innocent';

export const ROLES = {
  killer: {
    id: 'killer', name: 'Katil', team: 'killer', color: '#ff5252', equipment: 'knife', ability: null,
    text: 'Bıçağın var: sol tık saldır, sağ tık fırlat (tek bıçak; alınmazsa 2 dk sonra eline geri döner). Gece herkesi ele, dedektife yakalanma. Oyuncu listesinde ({list}) bir oyuncuya sol tıklayıp "Baiter ver" diyebilirsin (tur başına 1 kez).',
  },
  mafia: {
    id: 'mafia', name: 'Mafya', team: 'killer', color: '#d9534f', equipment: 'rifle', ability: null,
    text: 'Tüfeğin var, gece odandan çıkıp bir odayı tarayıp kaç, tünellere girmen yasak. {equip} ile çek, sol tık ateş (30 mermi; elle reload: {reload}). Katille birlikte kazanırsın.',
  },
  s2g: {
    id: 's2g', name: 'S2G', team: 'killer', color: '#b0306a', equipment: null, ability: 's2g',
    text: 'Gece bir kişinin yanına git (1 m), ona bak ve {ability} tuşunu basılı tut: fermuar sesi bitince kurban ölür. Her gece yalnızca 1 kez. Katille birlikte kazanırsın.',
  },
  detective: {
    id: 'detective', name: 'Dedektif', team: 'innocent', color: '#4f8cff', equipment: 'pistol', ability: null,
    text: 'Silahın var, gece odaları gez, sorgula ve katili bul. Tek mermin var ({equip} ile çek, sol tık ateş; her atıştan sonra reload olur). Yanlış kişiyi vurma!',
  },
  civilPolice: {
    id: 'civilPolice', name: 'Sivil Polis', team: 'innocent', color: '#5bc0de', equipment: 'taser', ability: null,
    text: 'Elektro şokun var, gece tünellerde gez ve katili bulmaya çalış. {equip} ile çek, sol tık vur: 3 vuruşta öldürür, vurulan kısa süre sersemler.',
  },
  civilian: {
    id: 'civilian', name: 'Masum', team: 'innocent', color: '#9aa4b2', equipment: null, ability: null,
    text: 'Özel yeteneğin yok. Evde dolaş, konuş, sorgula ve katili bulmaya çalış.',
  },
  escort: {
    id: 'escort', name: 'Eskort', team: 'innocent', color: '#e68fb8', equipment: null, ability: null,
    text: 'Bilgilendirme rolüsün: yeteneğin yok. Gece odaları gez, gördüklerini diğerlerine anlat.',
  },
  sleepwalker: {
    id: 'sleepwalker', name: 'Uyurgezer', team: 'innocent', color: '#8e7cc3', equipment: null, ability: 'sleepwalker',
    text: '{ability} ile uyursun: 5 saniye ekran kararır ve hareket edemezsin, sonra rastgele bir odada uyanırsın (1 dakika bekleme).',
  },
  bomber: {
    id: 'bomber', name: 'Bombacı', team: 'innocent', color: '#f0ad4e', equipment: null, ability: 'bomber',
    text: '{ability} ile kendini patlat: yakındaki herkes (sen de) ölür. Baiter olarak seçilirsen görevi yapmak zorunda değilsin.',
  },
  medium: {
    id: 'medium', name: 'Medyum', team: 'innocent', color: '#6fd6c2', equipment: null, ability: 'medium',
    text: 'Gece (ışıklar kapalıyken) {ability} ile bir oyuncuyla gizli ses bağlantısı kur. Sabah ışıklar açılınca bağlantı kopar, gece tekrar kurabilirsin.',
  },
  umaci: {
    id: 'umaci', name: 'Umacı', team: UMACI_TEAM, color: '#a3d65c', equipment: null, ability: 'umaci',
    text: 'Gece (ışıklar kapalıyken) {ability} ile 1 dakika görünmez ol ve oyuncuların içinden geç. Hareketsizken tamamen görünmezsin; hareket edince vücudunda hafif bir dalgalanma (shimmer) belirir. Her gece 1 kez.',
  },
  lover: {
    id: 'lover', name: 'Aşık', team: 'innocent', color: '#ff7aa8', equipment: null, ability: null, group: 2, maxPick: 3,
    text: 'Bir sevgilin var: adı sağ altta ve bu ekranda yazar. Biriniz ölürse diğeriniz de ölür. İkiniz de Masum Takımdasınız: birlikte katili bulun ve hayatta kalın.',
  },
};

/** İkincil roller (ana rolün yanında gösterilir) ve onların açıklamaları. */
export const SECONDARY = {
  baiter: {
    name: 'Baiter', color: '#e8a33d', notice: 'Baiter atandı',
    text: 'Baitersın, amacın dedektifi kandırıp katile yardım edip katilin kazanmasını sağlamak.',
  },
};

// Rol metinlerindeki {equip} {ability} {reload} {list} gibi yer tutucular ui.js'te oyuncunun atadığı tuşun adıyla değişir (bkz. keybinds.js).

// Özel rollerin dağıtım önceliği (oyuncu azsa baştakiler önce verilir). Otomatik sayılar: config.js → ROLE_COUNTS
// Aşık (çift = 2 koltuk) eskort'tan sonra gelir: koltuk azsa Uyurgezer / Medyum / Umacı'dan önce verilir.
export const ROLE_PRIORITY = ['detective', 'mafia', 's2g', 'civilPolice', 'bomber', 'escort', 'lover', 'sleepwalker', 'medium', 'umaci'];
/** Zorunlu roller: her turda MUTLAKA var (otomatik ya da host ayarı ne olursa olsun). Katil her zaman 1; dedektif en az 1 (oyuncu ≥ 2 ise). */
export const MANDATORY_ROLES = ['killer', 'detective'];
/** Host bir rol için en çok bu kadar seçebilir (lobi seçicisi 1..bu). */
export const ROLE_MAX_PICK = 5;
/** Rolün kaç kişilik gruplar halinde verildiği (Aşık = 2'li çift; diğerleri 1) ve lobide seçilebilecek en çok grup sayısı. */
export const roleGroup = (r) => ROLES[r]?.group || 1;
export const roleMaxPick = (r) => ROLES[r]?.maxPick || ROLE_MAX_PICK;

export const teamOf = (roleId) => ROLES[roleId]?.team || 'innocent';
export const roleName = (roleId) => ROLES[roleId]?.name || roleId;

/**
 * HOST'UN ROL SEÇİMİ — cfg[rol] değeri (cfg = { detective: 2, medium: false, bomber: 'auto' ... }):
 *   false / 0          → bu rol oyunda YOK
 *   sayı N (1…5)       → bu rol oyunda VAR: en az 1, EN ÇOK N tane (her turda 1..N arası rastgele)
 *   eksik / 'auto'     → otomatik: config.js → ROLE_COUNTS (oyuncu sayısına göre sabit sayı; küçük oyunlarda 0 olabilir)
 * ZORUNLU roller (MANDATORY_ROLES: katil, dedektif) kapatılamaz: kapalı ya da otomatik olsa bile en az 1 tane çıkar.
 * Grup rollerinde (Aşık) sayılar GRUP (çift) sayısıdır. Dönüş: [en az, en çok] — oyuncu sayısı (koltuk) sınırı uygulanmadan önceki aralık.
 */
export function roleLimits(r, n, cfg = {}) {
  const must = MANDATORY_ROLES.includes(r);
  const v = cfg?.[r];
  if ((v === false || v === 0 || v === '0') && !must) return [0, 0];
  const num = typeof v === 'string' ? Number(v) : v;
  if (typeof num === 'number' && Number.isFinite(num) && num >= 1) return [1, Math.min(roleMaxPick(r), Math.floor(num))];
  const auto = ROLE_COUNTS[r]?.(n) ?? 0;
  return must ? [Math.max(1, auto), Math.max(1, auto)] : [auto, auto];
}

/**
 * Bu tur için rol sayıları: { killer: 1, detective: 1, ..., civilian: N } (karıştırılmamış).
 * Katil her zaman 1'dir. Her özel rol için roleLimits aralığından rastgele sayı çekilir;
 * koltuk (oyuncu) yetmezse ROLE_PRIORITY sırasındaki baştaki roller önce alınır. Kalanlar Sivil olur.
 */
export function roleCounts(n, cfg = {}, rand = Math.random) {
  const out = { killer: Math.min(1, n) };
  let left = n - out.killer;
  for (const r of ROLE_PRIORITY) {
    const [lo, hi] = roleLimits(r, n, cfg);
    const g = roleGroup(r); // Aşık: sayı ÇİFT sayısıdır → kişi = çift × 2 (koltuk yetmezse eşsiz Aşık kalmaz)
    const want = (lo + Math.floor(rand() * (hi - lo + 1))) * g;
    let c = Math.max(0, Math.min(want, left));
    c -= c % g;
    out[r] = c;
    left -= c;
  }
  out.civilian = left;
  return out;
}

/**
 * Lobi önizlemesi: n oyuncuyla roleCounts'un verebileceği en az / en çok sayılar → { rol: [en az, en çok] }.
 * Tüm rastgele seçimler ve koltuk sınırı hesaba katılır (olası "kalan koltuk" değerleri üzerinden tam hesap).
 */
export function roleRanges(n, cfg = {}) {
  const k = Math.min(1, n);
  const out = { killer: [k, k] };
  let states = new Set([n - k]); // önceki roller sonrası olası kalan koltuk sayıları
  for (const r of ROLE_PRIORITY) {
    const [lo, hi] = roleLimits(r, n, cfg);
    const g = roleGroup(r);
    let cmin = Infinity;
    let cmax = 0;
    const next = new Set();
    for (const left of states) {
      for (let want = lo; want <= hi; want++) {
        let c = Math.max(0, Math.min(want * g, left));
        c -= c % g;
        cmin = Math.min(cmin, c);
        cmax = Math.max(cmax, c);
        next.add(left - c);
      }
    }
    out[r] = [Number.isFinite(cmin) ? cmin : 0, cmax];
    states = next;
  }
  const rest = [...states];
  out.civilian = [Math.min(...rest), Math.max(...rest)];
  return out;
}

/** Oyuncu sayısına göre karıştırılmış rol listesi üretir (sayılar için roleCounts'a bak). */
export function buildRoleList(n, cfg = {}) {
  const counts = roleCounts(n, cfg);
  const list = [];
  for (const [r, c] of Object.entries(counts)) for (let i = 0; i < c; i++) list.push(r);
  return shuffle(list);
}

/** Sevgili listesi düz dizidir: [a1, b1, a2, b2, ...] — id'nin eşi (yoksa null). */
export function loverPartner(lovers, id) {
  const i = lovers ? lovers.indexOf(id) : -1;
  return i < 0 ? null : lovers[i ^ 1] ?? null;
}

/**
 * Rolü "Aşık" olanları ikişer ikişer eşler → [a1, b1, a2, b2, ...] | null.
 *  shuffled: eşleşmeler rastgele (normal tur) / ids sırasıyla (debug).
 *  keepOdd: eşsiz kalan Aşık rolünde kalır (debug) / Masum olur (normal tur; roles değiştirilir).
 */
export function pairLovers(roles, ids, { shuffled = true, keepOdd = false } = {}) {
  const found = ids.filter((id) => roles[id] === 'lover');
  const pool = shuffled ? shuffle(found) : found;
  if (pool.length % 2 && !keepOdd) roles[pool.pop()] = 'civilian';
  const n = pool.length - (pool.length % 2);
  return n > 0 ? pool.slice(0, n) : null;
}

/** Dönüş: { roles: {id: roleId}, lovers: [a1, b1, a2, b2...] | null } — Aşık rolü verilenler (sayıları çifttir) kendi aralarında eşlenir. */
export function assignRoles(ids, settings = {}) {
  const list = buildRoleList(ids.length, settings.roles || {});
  const roles = {};
  ids.forEach((id, i) => (roles[id] = list[i]));
  return { roles, lovers: pairLovers(roles, ids) };
}

/**
 * Kimlikler (herkesin gördüğü ad):
 *  - SESSİZ modda HERKES (dedektif dahil) rastgele renk + NATO kod adı alır: yalnızca kod adı gösterilir ("Echo", rengiyle birlikte). Kod adları tekrar etmez.
 *    (Dedektif artık "Dedektif" yazmaz / mavi olmak zorunda değildir; tek konuşabilen olduğu sesinden anlaşılır.)
 *  - SESLİ modda dedektif mavi "Dedektif", diğer herkes gri "Irgat".
 * Ağ biçimi: { l: görünen ad, c: renk(hex sayı), cn: renk adı, k: kod adı }
 */
export function makeIdentities(ids, roles, mode) {
  const out = {};
  const V = IDENTITY.voice;
  const codes = shuffle(IDENTITY.codes);
  const colors = IDENTITY.colors; // sessiz modda dedektif de rastgele renk alır: mavi de havuzda
  let ci = 0;
  for (const id of ids) {
    if (mode === 'silent') {
      const col = pick(colors);
      const code = codes[ci++ % codes.length];
      out[id] = { l: code, c: col.hex, cn: col.name, k: code };
    } else if (roles[id] === 'detective') out[id] = { l: V.detectiveName, c: V.detectiveColor, cn: 'Mavi', k: '' };
    else out[id] = { l: V.workerName, c: V.workerColor, cn: 'Gri', k: '' };
  }
  return out;
}

/**
 * İzleyicinin (viewerId) görebildiği gizli bilgiler. Rolleri hiçbir şekilde herkese göstermez.
 *  - Herkes kendi rolünü görür.
 *  - Katil takımı birbirini görür; katil baiter'ını görür.
 *  - Sevgililer birbirini bilir.
 *  - DEDEKTİF herkese açıktır (zaten "Dedektif" adıyla, mavi renkte dolaşır).
 *  - Ölüler herkesin rolünü görebilir.
 * st: { players: {id: {role, alive}}, baiterId, lovers }
 */
export function computeVisibility(viewerId, st) {
  const out = {};
  const me = st.players[viewerId];
  if (!me) return out;
  const isLover = (id) => !!st.lovers && st.lovers.includes(id);
  if (!me.alive) {
    for (const [id, p] of Object.entries(st.players)) {
      if (p.spectator) continue;
      out[id] = { role: p.role, baiter: id === st.baiterId, lover: isLover(id) };
    }
    return out;
  }
  out[viewerId] = { role: me.role, baiter: viewerId === st.baiterId, lover: isLover(viewerId) };
  if (teamOf(me.role) === 'killer') {
    for (const [id, p] of Object.entries(st.players)) if (id !== viewerId && !p.spectator && teamOf(p.role) === 'killer') out[id] = { role: p.role };
  }
  for (const [id, p] of Object.entries(st.players)) if (id !== viewerId && !p.spectator && p.role === 'detective') (out[id] ||= {}).role = 'detective';
  if (me.role === 'killer' && st.baiterId && st.players[st.baiterId]) (out[st.baiterId] ||= {}).baiter = true;
  if (isLover(viewerId)) {
    const partner = loverPartner(st.lovers, viewerId);
    if (partner) (out[partner] ||= {}).lover = true;
  }
  return out;
}
