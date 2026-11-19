// Tuş atamaları: config.js → KEYS nesnesini oyuncunun kayıtlı seçimleriyle günceller. Ayarlar ekranı buradan beslenir.
// KEYS her karede okunduğu için bir tuşu değiştirmek ANINDA geçerli olur (oyunu yeniden başlatmak gerekmez).
// Sabit tuşlar: Esc (menü/duraklat) ve fare düğmeleri (sol/sağ tık).
import { DEFAULT_KEYS, KEYS } from './config.js';
import { store } from './util.js';

/** Ayarlarda gösterilen, değiştirilebilir eylemler. Sıra = ekrandaki sıra. */
export const KEY_ACTIONS = [
  { id: 'forward', label: 'İleri', group: 'Hareket' },
  { id: 'back', label: 'Geri', group: 'Hareket' },
  { id: 'left', label: 'Sola', group: 'Hareket' },
  { id: 'right', label: 'Sağa', group: 'Hareket' },
  { id: 'jump', label: 'Zıpla', group: 'Hareket' },
  { id: 'run', label: 'Koş', group: 'Hareket' },
  { id: 'crouch', label: 'Eğil (basılı tut)', group: 'Hareket' },
  { id: 'interact', label: 'Etkileşim / eşya al', group: 'Eylem' },
  { id: 'hand', label: 'Boş el', group: 'Eylem' },
  { id: 'equip', label: 'Ekipman çek / kaldır', group: 'Eylem' },
  { id: 'slot3', label: 'Gizli eşya — 3. slot (debug)', group: 'Eylem' },
  { id: 'slot4', label: 'Gizli eşya — 4. slot (debug)', group: 'Eylem' },
  { id: 'slot5', label: 'Gizli eşya — 5. slot (debug)', group: 'Eylem' },
  { id: 'slot6', label: 'Gizli eşya — 6. slot (debug)', group: 'Eylem' },
  { id: 'ability', label: 'Yetenek', group: 'Eylem' },
  { id: 'flashlight', label: 'Fener', group: 'Eylem' },
  { id: 'reload', label: 'Doldur (reload)', group: 'Eylem' },
  { id: 'ptt', label: 'Bas-konuş', group: 'İletişim' },
  { id: 'talkLevel', label: 'Ses seviyesi menüsü (basılı tut: fısıltı/normal/bağırma)', group: 'İletişim' },
  { id: 'mic', label: 'Mikrofonu aç / kapat', group: 'İletişim' },
  { id: 'chat', label: 'Sohbet', group: 'İletişim' },
  { id: 'radial', label: 'Ses menüsü (basılı tut)', group: 'Arayüz' },
  { id: 'list', label: 'Oyuncu listesi (basılı tut)', group: 'Arayüz' },
  { id: 'prevSpectate', label: 'İzleyici: önceki oyuncu', group: 'Arayüz' },
  { id: 'nextSpectate', label: 'İzleyici: sonraki oyuncu', group: 'Arayüz' },
  { id: 'debug', label: 'Debug paneli (yalnızca debug odası)', group: 'Arayüz' },];

const FIXED = new Set(['Escape']); // atanamaz

const NAMES = {
  Space: 'Boşluk', ShiftLeft: 'Sol Shift', ShiftRight: 'Sağ Shift', ControlLeft: 'Sol Ctrl', ControlRight: 'Sağ Ctrl',
  AltLeft: 'Sol Alt', AltRight: 'Sağ Alt', Tab: 'Tab', Enter: 'Enter', Escape: 'Esc', Backspace: 'Backspace',
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', CapsLock: 'Caps Lock',
  Mouse0: 'Sol tık', Mouse1: 'Orta tık', Mouse2: 'Sağ tık',
};

let layout = null; // klavye düzeni haritası (Chrome/Edge): Türkçe Q klavyede Ğ, Ü, Ş, İ, Ö, Ç gibi tuşların adı için
try {
  navigator.keyboard?.getLayoutMap?.().then((m) => { layout = m; }, () => {});
} catch {
  /* desteklenmiyor: kod adı gösterilir */
}

/** "KeyE" → "E", "Space" → "Boşluk". Zaten okunabilir bir metin verilirse aynen döner. */
export function keyLabel(code) {
  if (!code) return '—';
  if (NAMES[code]) return NAMES[code];
  const fromLayout = layout?.get(code);
  if (fromLayout) return fromLayout.length === 1 ? fromLayout.toLocaleUpperCase('tr') : fromLayout;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return `Num ${code.slice(6)}`;
  return code;
}

export function loadKeys() {
  const saved = store.get('keys', {});
  if (!saved || typeof saved !== 'object') return;
  for (const id of Object.keys(DEFAULT_KEYS)) {
    const v = saved[id];
    if (typeof v === 'string' && v && !FIXED.has(v)) KEYS[id] = v;
  }
}

function saveKeys() {
  const diff = {};
  for (const id of Object.keys(DEFAULT_KEYS)) if (KEYS[id] !== DEFAULT_KEYS[id]) diff[id] = KEYS[id];
  store.set('keys', diff);
}

/**
 * Bir eyleme tuş atar. Aynı tuş başka bir eylemde kullanılıyorsa iki eylemin tuşları yer değiştirir
 * (böylece hiçbir eylem tuşsuz kalmaz). Dönüş: yer değiştiren eylemin id'si (yoksa null) | false (geçersiz tuş).
 */
export function setKey(action, code) {
  if (!(action in DEFAULT_KEYS) || !code || FIXED.has(code)) return false;
  const old = KEYS[action];
  let swapped = null;
  for (const id of Object.keys(KEYS)) {
    if (id !== action && KEYS[id] === code && id in DEFAULT_KEYS && id !== 'menu') {
      KEYS[id] = old;
      swapped = id;
    }
  }
  KEYS[action] = code;
  saveKeys();
  return swapped;
}

export function resetKeys() {
  Object.assign(KEYS, DEFAULT_KEYS);
  saveKeys();
}

export const actionLabel = (id) => KEY_ACTIONS.find((a) => a.id === id)?.label || id;
