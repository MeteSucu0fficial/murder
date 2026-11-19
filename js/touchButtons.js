// Dokunmatik düğme tanımları (yalnızca veri): konum / boyut style.css'teki .tb-* sınıflarında, davranış burada.
//  kind: 'hold'   → basılı tutulan sanal tuş (parmak kalkınca bırakılır)
//        'toggle' → dokun: aç, tekrar dokun: kapat (sanal tuş basılı kalır)
//        'tap'    → kısa basış (tuşa bas + bırak)
//        'radial' → basılı tut + parmağı kaydır (Q / C dairesel menüleri; bırakınca seçilir)
//        'fn'     → tek dokunuşta bir işlev çağırır
//  look: true → parmak düğmenin üstündeyken kaydırılırsa bakış da döner (ateş ederken nişan almak için)
//  show / text / icon / on / dim: her karede okunur (touch.js); sadece değişince DOM güncellenir.
import { GAME_CONFIG, KEYS } from './config.js';
import { ctx } from './context.js';
import { MOUSE_LEFT, MOUSE_RIGHT } from './input.js';
import { SOUND_MENU, VOICE_MENU } from './radialMenu.js';

const alive = () => !!ctx.me?.alive;
const inv = () => ctx.inventory;
const cfgOf = (t) => (t ? GAME_CONFIG.equipment?.[t] : null);
/** Elimdeki ekipman / eşya türü (boş el = null). */
const heldType = () => (inv() && inv().slot >= 2 ? inv().heldType : null);
const SKILL = { sleepwalker: 'Uyurgezer', bomber: 'Patlat', medium: 'Medyum', s2g: 'S2G', umaci: 'Görünmez' };

const fireText = () => {
  if (ctx.grab?.held) return 'Fırlat';
  const t = heldType();
  if (!t) return '';
  if (t === 'knife') return 'Vur';
  if (t === 'bomb') return 'Kur';
  return 'Ateş';
};

const useText = () => {
  const s = String(ctx.ui?.promptLabel || '');
  if (/^Bırakmak için/.test(s)) return 'Basılı tut';
  const t = s.split('·')[0].trim();
  return t.length > 22 ? `${t.slice(0, 21)}…` : t;
};

const altShow = () => alive() && (!!ctx.grab?.held || heldType() === 'sniper' || (heldType() === 'knife' && !ctx.me_state?.knifeAway));

const skillText = () => {
  const s = ctx.me_state;
  if (ctx.role?.ability === 'umaci') return s?.umaciLeft > 0 ? `${Math.ceil(s.umaciLeft)} sn` : SKILL.umaci; // Umacı: süre sayacı
  const cd = s?.abilityCd || 0;
  return cd > 0 ? `${Math.ceil(cd)} sn` : SKILL[ctx.role?.ability] || 'Yetenek';
};
/** Yetenek düğmesi sönük mü? (bekleme süresi · Umacı: görünmezken ya da bu gece kullandıysa) */
const skillDim = () => {
  const s = ctx.me_state;
  if (ctx.role?.ability === 'umaci') return (s?.umaciLeft || 0) > 0 || !!s?.umaciUsed;
  return (s?.abilityCd || 0) > 0;
};

const micOpen = () => !!ctx.settings?.openMic; // açık mikrofon: bas-konuş yerine "sustur / aç" düğmesi
const micShow = () => {
  const v = ctx.voice;
  if (!v?.enabled || !v.canSpeak() || ctx.phase === 'menu') return false;
  return micOpen() || !v.silentMode; // sessiz modda dedektif zaten sürekli konuşur
};

/** Slot düğmesi: 1 = boş el, 2 = ekipman, 3-6 = gizli eşyalar. */
const slotBtn = (n) => ({
  id: `slot${n}`,
  cls: `tb-slot tb-s${n}`,
  bar: true,
  kind: 'hold',
  code: () => (n === 1 ? KEYS.hand : n === 2 ? KEYS.equip : KEYS[`slot${n}`]),
  icon: () => (n === 1 ? 'hand' : 'box'),
  text: () => {
    if (n === 1) return 'El';
    const t = n === 2 ? inv()?.equipType : ctx.me_state?.items?.[n - 3];
    return cfgOf(t)?.name || '';
  },
  show: () => alive() && (n === 1 || (n === 2 ? !!inv()?.equipType : !!ctx.me_state?.items?.[n - 3])),
  on: () => inv()?.slot === n,
});

/** Düzenleme ekranında (Ayarlar → Mobil → Düğme düzenini düzenle) düğmelerin adı. */
export const LABELS = {
  fire: 'Ateş / Fırlat', jump: 'Zıpla', crouch: 'Eğil', use: 'Etkileşim', alt: 'Fırlat / Döndür / Dürbün', reload: 'Doldur', skill: 'Yetenek',
  light: 'Fener', mic: 'Mikrofon', pause: 'Menü', chat: 'Sohbet', list: 'Oyuncu listesi', sound: 'Ses menüsü', level: 'Ses seviyesi',
  slot1: 'El', slot2: 'Ekipman', slot3: 'Eşya 1', slot4: 'Eşya 2', slot5: 'Eşya 3', slot6: 'Eşya 4', prev: 'Önceki', next: 'Sonraki',
};

export const BUTTONS = [
  // ---- sağ alt: eylem kümesi ----
  { id: 'fire', cls: 'tb-fire', kind: 'hold', look: true, code: () => MOUSE_LEFT, icon: () => (ctx.grab?.held ? 'throw' : 'fire'), text: fireText, show: alive },
  { id: 'jump', cls: 'tb-jump', kind: 'hold', code: () => KEYS.jump, icon: () => 'jump', text: () => 'Zıpla', show: alive },
  { id: 'crouch', cls: 'tb-crouch', kind: 'toggle', code: () => KEYS.crouch, icon: () => 'crouch', text: () => 'Eğil', show: alive },
  { id: 'use', cls: 'tb-use', kind: 'hold', code: () => KEYS.interact, icon: () => 'grab', text: useText, show: () => alive() && !!ctx.ui?.promptKey },
  {
    id: 'alt', cls: 'tb-alt', kind: 'hold', look: true, code: () => MOUSE_RIGHT,
    icon: () => (ctx.grab?.held ? 'rotate' : heldType() === 'sniper' ? 'scope' : 'throw'),
    text: () => (ctx.grab?.held ? 'Döndür' : heldType() === 'sniper' ? 'Dürbün' : 'Fırlat'), show: altShow,
  },
  {
    id: 'reload', cls: 'tb-reload', kind: 'hold', code: () => KEYS.reload, icon: () => 'reload', text: () => 'Doldur',
    show: () => alive() && !!cfgOf(heldType())?.magazine, dim: () => (ctx.me_state?.reload || 0) > 0,
  },
  {
    id: 'skill', cls: 'tb-skill', kind: 'hold', code: () => KEYS.ability, icon: () => 'skill', text: skillText,
    show: () => alive() && !!ctx.role?.ability, dim: skillDim,
  },
  // ---- sol kenar ----
  { id: 'light', cls: 'tb-light', kind: 'hold', code: () => KEYS.flashlight, icon: () => 'light', text: () => 'Fener', show: alive },
  {
    id: 'mic', cls: 'tb-mic', kind: () => (micOpen() ? 'tap' : 'toggle'), code: () => (micOpen() ? KEYS.mic : KEYS.ptt),
    icon: () => 'mic', text: () => (micOpen() ? 'Mik' : 'Konuş'), show: micShow,
    on: () => (micOpen() ? !!ctx.voice?.micOn : !!ctx.voice?.transmitting),
  },
  // ---- üst sağ: yardımcı düğmeler ----
  { id: 'pause', cls: 'tb-pause', kind: 'fn', icon: () => 'menu', fn: () => ctx.ui?.showPause(), show: () => true },
  { id: 'chat', cls: 'tb-chat', kind: 'fn', icon: () => 'chat', fn: () => ctx.chat?.focus(true), show: () => !!ctx.chat && !!ctx.me },
  { id: 'list', cls: 'tb-list', kind: 'fn', icon: () => 'list', fn: () => ctx.playerList?.touchToggle(), show: () => !!ctx.playerList, on: () => !!ctx.playerList?.touchOpen },
  { id: 'sound', cls: 'tb-sound', kind: 'radial', code: () => KEYS.radial, icon: () => 'sound', text: () => 'Ses', show: () => SOUND_MENU.canUse() },
  {
    id: 'level', cls: 'tb-level', kind: 'radial', code: () => KEYS.talkLevel, icon: () => 'level', text: () => 'Seviye',
    show: () => !!ctx.voice?.enabled && VOICE_MENU.canUse(),
  },
  // ---- alt orta: çanta çubuğu ----
  slotBtn(1), slotBtn(2), slotBtn(3), slotBtn(4), slotBtn(5), slotBtn(6),
  // ---- ölüyken: izleyici okları ----
  { id: 'prev', cls: 'tb-prev', kind: 'hold', code: () => KEYS.prevSpectate, icon: () => 'prev', text: () => '', show: () => !!ctx.me && !ctx.me.alive },
  { id: 'next', cls: 'tb-next', kind: 'hold', code: () => KEYS.nextSpectate, icon: () => 'next', text: () => '', show: () => !!ctx.me && !ctx.me.alive },
];
