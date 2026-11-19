// Dokunmatik düğme simgeleri: tek renkli, çizgi tabanlı (24×24). currentColor ile boyanır; her ekran boyunda keskin kalır.
const P = {
  fire: '<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/>',
  jump: '<path d="M12 19V6M6 11.5l6-6 6 6"/>',
  crouch: '<path d="M12 5v13M6 12.5l6 6 6-6"/>',
  grab: '<path d="M8 12V6.5M11 12V4.5M14 12V5.5M17 12V8"/><path d="M6 12.5v1.2c0 3.6 2.6 6.3 6 6.3s6-2.7 6-6.3V12"/>',
  reload: '<path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 5v6h-6"/>',
  rotate: '<path d="M4 13a8 8 0 102.3-5.7"/><path d="M4 7v6h6"/>',
  throw: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  scope: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  light: '<path d="M9 2.5h6v4l-1.5 2.2V20a1.5 1.5 0 01-3 0V8.7L9 6.5z"/><path d="M12 11.5v2.5"/>',
  skill: '<path d="M12 3l2.1 6 6.4 2.4-6.4 2.4L12 20l-2.1-6.2-6.4-2.4L9.9 9z"/>',
  menu: '<path d="M5 7h14M5 12h14M5 17h14"/>',
  chat: '<path d="M4 5.5h16v10.5H10l-4.5 3.5V16H4z"/>',
  list: '<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19a5.5 5.5 0 0111 0"/><path d="M16 6.2a3 3 0 010 5.6M18 14a5 5 0 013 4.6"/>',
  sound: '<path d="M4 9.5v5h3.5l4.5 4v-13l-4.5 4z"/><path d="M15.5 9a4 4 0 010 6M18 6.5a8 8 0 010 11"/>',
  level: '<path d="M6 18v-4M12 18V9M18 18V4"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0013 0M12 18v3"/>',
  prev: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  hand: '<path d="M8 12V6.5M11 12V4.5M14 12V5.5M17 12V8"/><path d="M6 12.5v1.2c0 3.6 2.6 6.3 6 6.3s6-2.7 6-6.3V12"/>',
  box: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>',
  fsEnter: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  fsExit: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
};

/** Simge adı → <svg> metni (sabit, güvenli içerik; innerHTML ile eklenir). */
export function icon(name) {
  const body = P[name];
  if (!body) return '';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
