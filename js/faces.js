// KARAKTER YÜZLERİ: assets/faces klasöründeki PNG / SVG (ayrıca WEBP, JPG, GIF) dosyaları kafanın ÖN yüzüne yapışır.
//  • Liste: önce assets/faces/faces.json (["a.png", "b.svg"] ya da { "faces": [...] }), sonra klasör dizini (python http.server, npx serve,
//    http-server gibi sunucular listeler; GitHub Pages listelemez → faces.json kullan). İkisi birleştirilir; açılamayan dosya listeden atılır.
//  • Her turun başında host herkese rastgele (mümkünse farklı) bir yüz seçer; ad kimlikle (idn.f) yayınlanır, herkes aynı yüzü görür.
//  • Boyut: görüntü 256×256 (config.js → faces.textureSize) bir tuvale ORANI BOZULMADAN sığdırılır (contain) ve kafanın ön yüzünün tamamına
//    (0.3 × 0.3 m) oturur. PNG / SVG arka planı ŞEFFAF olmalı: kafanın ten rengi yüzün arkasından görünür.
import * as THREE from 'three';
import { GAME_CONFIG } from './config.js';
import { shuffle } from './util.js';

const FC = GAME_CONFIG.faces;
const EXT = /\.(png|svg|webp|jpe?g|gif)$/i;

class FaceBook {
  constructor() {
    this.names = []; // listedeki dosya adları
    this.ok = new Set(); // başarıyla yüklenenler
    this.cache = new Map(); // ad → Promise<Texture | null>
    this.ready = null;
    // dokusu henüz gelmemiş yüzler için ortak şeffaf 1×1 doku (malzeme baştan "map" ile derlenir: sonradan yeniden derleme takılması olmasın)
    this.blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    this.blank.needsUpdate = true;
  }

  url(name) {
    return FC.dir + encodeURIComponent(name);
  }

  /** Dosya listesini bir kez yükler (sonraki çağrılar aynı sözü döndürür). Dönen liste doğrulanmadan önceki ham listedir. */
  init() {
    if (!this.ready) this.ready = this._init().catch(() => this.names);
    return this.ready;
  }

  async _init() {
    const found = [];
    try {
      const r = await fetch(`${FC.dir}faces.json`, { cache: 'no-cache' });
      if (r.ok) {
        const j = await r.json();
        for (const n of Array.isArray(j) ? j : j.faces || []) found.push(String(n));
      }
    } catch { /* manifest yok */ }
    try {
      const r = await fetch(FC.dir, { cache: 'no-cache' });
      if (r.ok) {
        const html = await r.text();
        const base = new URL(FC.dir, location.href);
        for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
          try {
            const last = decodeURIComponent(new URL(m[1], base).pathname.split('/').pop() || '');
            if (EXT.test(last)) found.push(last);
          } catch { /* geçersiz bağlantı */ }
        }
      }
    } catch { /* dizin listelenemiyor */ }
    this.names = [...new Set(found)].filter((n) => EXT.test(n)).slice(0, FC.maxFaces);
    this._validate(this.names.slice());
    return this.names;
  }

  /** Arka planda (4'lü gruplar halinde) hepsini yükleyip geçerli olanları ok kümesine alır. */
  async _validate(list) {
    const worker = async () => {
      while (list.length) await this.load(list.shift());
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
  }

  /** Ad → Promise<Texture | null> (önbellekli; hata olursa null). */
  load(name) {
    let p = this.cache.get(name);
    if (!p) {
      p = this._make(name).catch(() => null);
      this.cache.set(name, p);
      p.then((t) => t && this.ok.add(name));
    }
    return p;
  }

  async _make(name) {
    const img = new Image();
    img.decoding = 'async';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error(`yüz yüklenemedi: ${name}`));
      img.src = this.url(name);
    });
    const S = FC.textureSize;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d');
    g.clearRect(0, 0, S, S); // zemin şeffaf kalır
    const nw = img.naturalWidth || 0;
    const nh = img.naturalHeight || 0;
    const ar = nw > 0 && nh > 0 ? nw / nh : 1; // boyutsuz SVG: kare varsay
    let dw = S;
    let dh = S;
    if (ar > 1) dh = S / ar;
    else dw = S * ar;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, (S - dw) / 2, (S - dh) / 2, dw, dh); // oran bozulmadan, ortalanmış
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.premultiplyAlpha = true;
    tex.anisotropy = 4;
    return tex;
  }

  /** n kişi için yüz adları: karıştırılmış; yeterli yüz yoksa tekrar eder. Liste boşsa [] (yüzsüz kafa). Yalnızca host çağırır. */
  pick(n) {
    const pool = this.ok.size ? [...this.ok] : this.names.slice();
    if (!pool.length) return [];
    const out = [];
    while (out.length < n) out.push(...shuffle(pool));
    return out.slice(0, n);
  }
}

export const FACES = new FaceBook();
