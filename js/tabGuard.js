// Sekmenin kazara kapanmasına karşı koruma. Eğilme tuşu Ctrl olduğu için "Ctrl + W" (ileri + eğil) çok kolay basılır.
// Tarayıcılar sayfanın Ctrl+W'yi engellemesine izin vermez; bu yüzden üç katman vardır:
//  1) TAM EKRAN + KLAVYE KİLİDİ (Chrome / Edge): kısayol tuşları sayfaya iletilir, sekme KAPANMAZ. (Ayarlardan kapatılabilir.)
//  2) beforeunload: kısayol yine de ulaşırsa (Firefox / Safari, tam ekran dışı) "Sayfadan ayrılmak istiyor musun?" sorusu çıkar → İptal.
//  3) Oyun sırasında Ctrl + harf kısayollarının (kaydet, yazdır, bul...) varsayılan davranışı engellenir.
import { ctx } from './context.js';

const LOCK_KEYS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((c) => `Key${c}`);

const inGame = () => ctx.phase !== 'menu';

const isTyping = () => {
  const a = document.activeElement;
  return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
};

const lockKeys = () => {
  try {
    const p = navigator.keyboard?.lock?.(LOCK_KEYS);
    if (p && p.catch) p.catch(() => {});
  } catch {
    /* desteklenmiyor */
  }
};

export function initTabGuard() {
  window.addEventListener('beforeunload', (e) => {
    if (!inGame()) return undefined;
    e.preventDefault();
    e.returnValue = '';
    return '';
  });

  window.addEventListener(
    'keydown',
    (e) => {
      if (!inGame() || isTyping() || !e.ctrlKey || e.altKey || e.shiftKey || !/^Key[A-Z]$/.test(e.code)) return;
      e.preventDefault(); // Ctrl+S / D / F / P / U ... oyun sırasında hiçbir şey yapmasın (Ctrl+W tarayıcı tarafından yine de yakalanabilir: katman 1-2)
    },
    true,
  );

  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) lockKeys();
    else {
      try {
        navigator.keyboard?.unlock?.();
      } catch {
        /* yok say */
      }
    }
  });
}

/** Bir kullanıcı hareketi (tıklama / tuş) sırasında çağrılır: tam ekrana geçer ve kısayol tuşlarını kilitler. */
export function engageTabGuard() {
  if (ctx.settings.guardTab === false || !inGame()) return;
  if (!navigator.keyboard?.lock) return; // kilit desteklenmiyorsa tam ekrana zorlamanın anlamı yok (beforeunload yeter)
  if (navigator.userActivation && !navigator.userActivation.isActive) return; // kullanıcı hareketi yoksa tarayıcı reddeder
  if (document.fullscreenElement) {
    lockKeys();
    return;
  }
  try {
    const p = document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
    if (p && p.then) p.then(lockKeys, () => {});
  } catch {
    /* reddedildi */
  }
}
