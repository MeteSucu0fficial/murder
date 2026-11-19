// Yazılı sohbet penceresi. Sessiz modun asıl iletişim yolu; sesli modda da (istenirse) kullanılabilir.
// Enter: yazmaya başla / gönder. Mesajlarda gerçek isim DEĞİL oyun içi kimlik gösterilir (lobi hariç).
// Yaşayanlar yalnızca yakınlarına yazar; ölüler birbirine yazar ("ölü sohbeti", ayarlardan gizlenebilir).
import { GAME_CONFIG, KEYS } from './config.js';
import { ctx } from './context.js';
import { h } from './util.js';

const hex = (n) => `#${(n >>> 0).toString(16).padStart(6, '0').slice(-6)}`;

export class ChatUI {
  constructor(root) {
    this.open = false;
    this.pinned = true; // pencere açık/kapalı (kullanıcı değiştirir)
    this.fadeAt = 0;
    this.log = h('div', { class: 'chat-log' });
    this.input = h('input', {
      class: 'chat-input', type: 'text', maxlength: String(GAME_CONFIG.chat.maxLength), placeholder: 'Mesaj yaz ve Enter\'a bas…', autocomplete: 'off', enterkeyhint: 'send',
    });
    this.toggleBtn = h('button', { class: 'chat-toggle', type: 'button', title: 'Sohbeti aç/kapat', onclick: () => this.setPinned(!this.pinned) }, 'Sohbet');
    this.form = h('form', { class: 'chat-form', onsubmit: (e) => this.submit(e) }, this.input);
    this.box = h('div', { class: 'chat' }, this.toggleBtn, this.log, this.form);
    root.appendChild(this.box);

    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') this.close(true);
    });
    this.input.addEventListener('blur', () => {
      this.open = false;
      this.box.classList.remove('typing');
    });
    this.setPinned(true);
    this.hide();
  }

  // ---- görünürlük ----
  show() {
    this.box.classList.remove('hidden');
  }
  hide() {
    this.box.classList.add('hidden');
  }
  setPinned(v) {
    this.pinned = v;
    this.box.classList.toggle('collapsed', !v);
    this.toggleBtn.textContent = v ? 'Sohbet ▾' : 'Sohbet ▸';
  }

  /** Oyun/lobi durumuna göre pencereyi göster. */
  refreshVisibility() {
    const inRoom = ctx.phase === 'lobby' || ctx.phase === 'playing' || ctx.phase === 'ended';
    if (inRoom) this.show();
    else this.hide();
  }

  // ---- yazma ----
  /** sync: dokunmatik düğmeden çağrılırsa hemen odaklanır (iOS / Android klavyesi yalnızca kullanıcı hareketi içinde açılır). */
  focus(sync = false) {
    if (!ctx.me) return;
    this.setPinned(true);
    this.open = true;
    this.box.classList.add('typing');
    ctx.input.exitLock();
    if (sync) this.input.focus();
    else setTimeout(() => this.input.focus(), 0);
  }
  close(relock) {
    this.input.value = '';
    this.input.blur();
    if (relock && ctx.phase !== 'lobby' && !ctx.ui?.modalOpen()) ctx.input.requestLock();
  }
  submit(e) {
    e.preventDefault();
    const text = this.input.value.trim();
    if (text) ctx.client.toHost({ t: 'chat', text });
    this.close(true);
  }

  update() {
    const input = ctx.input;
    if (!ctx.me || ctx.phase === 'menu') return;
    if (input.wasPressed(KEYS.chat) && !ctx.ui.modalOpen()) this.focus();
    if (this.box.classList.contains('typing')) this.fadeAt = performance.now() + 9000;
    this.box.classList.toggle('faded', !this.box.classList.contains('typing') && performance.now() > this.fadeAt);
  }

  // ---- mesajlar ----
  add(m) {
    if (m.ch === 'dead' && ctx.settings.showDeadChat === false) return; // ölü mesajlarını görmek istemeyenler için
    let row;
    if (m.ch === 'sys') row = h('div', { class: 'chat-row sys' }, m.text);
    else {
      const name = h('span', { class: 'chat-name', style: { color: hex(m.c ?? 0xffffff) } }, (m.ch === 'dead' ? '☠ ' : '') + m.l);
      row = h('div', { class: `chat-row ${m.ch || 'say'}${m.from === ctx.myId ? ' me' : ''}` }, name, ': ', h('span', { class: 'chat-text', text: m.text }));
    }
    this.log.appendChild(row);
    while (this.log.children.length > 80) this.log.firstChild.remove();
    this.log.scrollTop = this.log.scrollHeight;
    this.fadeAt = performance.now() + 9000;
    if (!this.pinned && m.ch !== 'sys') this.toggleBtn.classList.add('ping');
    else this.toggleBtn.classList.remove('ping');
  }

  onRound(n) {
    this.add({ ch: 'sys', text: `— Tur ${n} başladı —` });
  }

  clear() {
    this.log.replaceChildren();
  }
}
