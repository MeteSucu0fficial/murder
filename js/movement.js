// Yerel oyuncunun hareketi, zıplaması ve BİRİNCİ ŞAHIS kamerası. (Üçüncü şahıs kamera yoktur.)
// Yön kuralı: yaw=0 → +Z'ye bakar; ileri = (sin yaw, 0, cos yaw); sağ = (-cos yaw, 0, sin yaw). Pozitif pitch yukarı bakar.
// Kamera gözün olduğu yerdedir (ayak + eyeHeight). Ölünce izlenen oyuncunun GÖZÜNDEN bakılır.
import * as THREE from 'three';
import { GAME_CONFIG, KEYS } from './config.js';
import { ctx } from './context.js';
import { clamp, damp } from './util.js';

const P = GAME_CONFIG.player;
const C = GAME_CONFIG.camera;
const LD = GAME_CONFIG.ladder;
const _t = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _f = new THREE.Vector3();

const approach = (a, b, d) => (a < b ? Math.min(b, a + d) : Math.max(b, a - d));

export class Movement {
  constructor() {
    this.yaw = 0;
    this.pitch = 0;
    this.bodyYaw = 0; // birinci şahısta gövde her zaman baktığın yöne döner (eski kodlar için yaw ile aynı)
    this.vel = new THREE.Vector3();
    this.grounded = false;
    this.shakeAmp = 0;
    this.spectateId = null;
    this.orbitAngle = 0;
    this.eye = new THREE.Vector3(); // sallanmasız göz konumu (nişan / etkileşim bundan çıkar)
    this.lookDir = new THREE.Vector3(0, 0, 1); // sallanmasız bakış yönü
    this.bobPhase = 0;
    this.bobAmp = 0;
    this.crouching = false; // eğilme durumu (Ctrl basılı ya da tavan altında kalkamıyorum)
    this.eyeH = P.eyeHeight; // yumuşatılmış göz yüksekliği (eğilince alçalır)
    this.climb = null; // merdivende: { ladder } (yoksa null)
    this.ladderCd = 0; // merdiveni bıraktıktan sonra tekrar tutunmadan önce bekleme (sn)
    ctx.sceneMgr.camera.rotation.order = 'YXZ';
  }

  /** Oyuncuyu belirli bir konuma yerleştirir (doğma, ışınlanma). */
  teleport(pos, yaw = null) {
    const me = ctx.me;
    if (!me) return;
    me.teleport(pos.x, pos.y, pos.z);
    // Duvarın / mobilyanın / zeminin İÇİNE ışınlandıysak dışarı çık (kapsülü bir kez çözümle).
    ctx.world?.collision?._resolveCapsule(me.pos, P.radius, P.height, P.walkableY);
    this.vel.set(0, 0, 0);
    this.grounded = false;
    this.crouching = false;
    this.eyeH = P.eyeHeight;
    this.climb = null;
    this.ladderCd = 0;
    if (yaw !== null) {
      this.yaw = yaw;
      this.bodyYaw = yaw;
      me.yaw = yaw;
    }
  }

  shake(amp) {
    this.shakeAmp = Math.max(this.shakeAmp, amp);
  }

  update(dt) {
    const me = ctx.me;
    const live = ctx.phase === 'playing' || ctx.phase === 'ended';
    if (live && me && me.alive) this._alive(dt, me);
    else if (live && me && !me.alive) this._spectate(dt, me);
    else this._orbit(dt);
    this._hideViewedBody(live, me);
  }

  /** Kamerayı taşıyan oyuncunun (kendim ya da izlediğim) gövdesi çizilmez: kafasının içindeyiz. */
  _hideViewedBody(live, me) {
    const viewed = this.viewedPlayer();
    for (const p of ctx.players.map.values()) p.hideBody = live && p === viewed;
    if (me) me.hideBody = true; // kendi gövdemi hiçbir zaman görmem
  }

  /** Şu an gözünden baktığım oyuncu: yaşıyorsam kendim, ölüysem izlediğim kişi (yoksa null). */
  viewedPlayer() {
    const me = ctx.me;
    if (!me) return null;
    if (me.alive) return me;
    const t = this.spectateId ? ctx.players.get(this.spectateId) : null;
    return t && t.alive ? t : null;
  }

  /** Turun ilk `ghostSeconds` saniyesinde (ve tur başlamadan önce) oyuncular birbirinin içinden geçebilir. */
  _ghost() {
    const goAt = ctx.round?.goAt;
    return !goAt || performance.now() / 1000 < goAt + P.ghostSeconds;
  }

  // ------------------------------------------------------------------ yaşayan oyuncu
  _alive(dt, me) {
    const input = ctx.input;
    const col = ctx.world.collision;

    const look = input.consumeLook();
    if (ctx.grab.rotating) ctx.grab.rotateBy(look.x, look.y);
    else {
      const s = C.sensitivity * ctx.settings.sensitivity;
      this.yaw -= look.x * s;
      this.pitch = clamp(this.pitch - look.y * s, C.minPitch, C.maxPitch);
    }

    const frozen = me.frozenLeft > 0;
    const mv = frozen ? { x: 0, y: 0 } : input.getMove(KEYS);

    if (this.noclip) {
      this._fly(dt, me, mv); // debug: duvarlardan geçerek uç
      return;
    }

    // Eğilme: Ctrl basılıyken eğilir; bırakınca ancak üstü boşsa (tavan yoksa) kalkar.
    if (!frozen && !me.carrying && input.isDown(KEYS.crouch)) this.crouching = true;
    else if (this.crouching && col.canStand(me.pos, P.radius, P.crouchHeight, P.height)) this.crouching = false;
    const height = this.crouching ? P.crouchHeight : P.height;
    this.eyeH = damp(this.eyeH, this.crouching ? P.crouchEyeHeight : P.eyeHeight, P.crouchBlend, dt);
    me.crouch = this.crouching;
    me.eyeH = this.eyeH;

    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    const wishX = sinY * mv.y - cosY * mv.x;
    const wishZ = cosY * mv.y + sinY * mv.x;
    const moving = Math.abs(mv.x) + Math.abs(mv.y) > 0.05;
    const running = moving && !this.crouching && input.isDown(KEYS.run) && !me.carrying;
    let speed = running ? P.runSpeed : P.walkSpeed;
    if (this.crouching) speed *= P.crouchSpeed;
    speed *= ctx.grab.speedMultiplier();
    if (me.carrying) speed *= GAME_CONFIG.corpse.carrySpeed; // ceset taşımak çok ağır
    const len = Math.hypot(wishX, wishZ);
    const tx = len > 0.001 ? (wishX / Math.max(1, len)) * speed : 0;
    const tz = len > 0.001 ? (wishZ / Math.max(1, len)) * speed : 0;
    // Serbest dönen tabloları (midPaints.js) itmek için "istediğim hız" konum paketiyle host'a gider (plakaya yaslanıp dururken de itiş bilinsin).
    me.wishX = tx;
    me.wishZ = tz;

    // Merdiven: tırmanıyorsam hız merdivenden gelir (yürüme / yerçekimi / zıplama uygulanmaz).
    const climbing = this._ladder(dt, me, mv, height, frozen || !!me.carrying);
    const climbAnim = climbing && (Math.abs(this.vel.y) > 0.1 || Math.abs(mv.x) > 0.1);
    if (climbing) {
      me.wishX = 0;
      me.wishZ = 0;
    } else if (this.grounded) {
      // KAYMA YOK: yerdeyken hız anında hedefe ulaşır; tuşu bırakınca anında durur.
      this.vel.x = tx;
      this.vel.z = tz;
      this.vel.y = Math.min(this.vel.y, 0);
    } else {
      // Havada: tuşa basılıyorsa sınırlı yön değiştirme; basılmıyorsa sürat korunur.
      if (len > 0.001) {
        const acc = P.acceleration * P.airControl;
        this.vel.x = approach(this.vel.x, tx, acc * dt);
        this.vel.z = approach(this.vel.z, tz, acc * dt);
      }
      this.vel.y = Math.max(this.vel.y - P.gravity * dt, -40);
    }

    // Zıplama: yerdeyken tuşa basınca yukarı hız ver (eğilirken zıplanmaz); havadaki kapsül modu zaten yukarı hareketi işler.
    if (!climbing && this.grounded && !frozen && !me.carrying && !this.crouching && input.wasPressed(KEYS.jump)) {
      this.vel.y = P.jumpSpeed;
      this.grounded = false;
    }

    // Kafes gibi hareketli zeminler oyuncuyu taşır
    const ride = ctx.world.getRideDelta(me.pos);
    if (ride) me.pos.add(ride);

    const px = me.pos.x;
    const pz = me.pos.z;
    const res = col.moveCapsule(me.pos, this.vel, dt, {
      radius: P.radius, height, stepHeight: P.stepHeight, snapDown: P.snapDown, grounded: this.grounded, walkableY: P.walkableY,
    });
    this.grounded = res.grounded;
    if (this.climb && res.grounded) this.climb = null; // merdivenden yere indim: tırmanma biter (yeniden W / Boşluk ile başlanır)
    if (this.grounded && dt > 0) {
      // duvara çarpınca hız sönsün (bir sonraki kare zaten hedefe döner)
      this.vel.x = (me.pos.x - px) / dt;
      this.vel.z = (me.pos.z - pz) / dt;
    }

    // Oyuncular birbirinin içinden GEÇEMEZ (sert çarpışma) — turun ilk `ghostSeconds` saniyesi hariç.
    // Üst üste doğmuş oyuncular kare başına en fazla `separationStep` metre itilerek ayrılır (ışınlanma / titreme olmasın).
    if (!this._ghost()) {
      let pushed = false;
      const min = P.radius * 2;
      for (const o of ctx.players.map.values()) {
        if (o === me || !o.alive || Math.abs(me.pos.y - o.pos.y) > P.height * 0.9) continue;
        let dx = me.pos.x - o.pos.x;
        let dz = me.pos.z - o.pos.z;
        let d = Math.hypot(dx, dz);
        if (d >= min) continue;
        if (d < 1e-4) {
          dx = Math.cos(this.yaw);
          dz = -Math.sin(this.yaw);
          d = 1;
        }
        const push = Math.min(min - d, P.separationStep);
        me.pos.x += (dx / d) * push;
        me.pos.z += (dz / d) * push;
        pushed = true;
      }
      if (pushed) col._resolveCapsule(me.pos, P.radius, height, P.walkableY);
    }

    if (me.pos.y < P.fallRespawnY) {
      const sp = ctx.world.randomSpawn();
      this.teleport(sp.pos, sp.yaw);
    }

    // Birinci şahıs: gövde ve bakış aynı yöne bakar (diğer oyuncular bunu görür).
    this.bodyYaw = this.yaw;
    me.yaw = this.yaw;
    me.pitch = this.pitch;
    me.speed = climbing ? (climbAnim ? 1 : 0) : moving && this.grounded ? (running ? 2 : 1) : 0;
    this._airT = this.grounded || climbing ? 0 : (this._airT || 0) + dt; // kısa kopmalar (merdiven / basamak) "havada" sayılmasın
    me.air = this._airT > 0.12;
    me.climbing = !!climbing;

    this._rig(dt, me.pos, this.yaw, this.pitch, me.speed, this.eyeH);
  }

  /** Debug: noclip açık / kapalı. Kapanırken duvarın içinde kaldıysan dışarı itilirsin. */
  setNoclip(on) {
    this.noclip = !!on;
    this.vel.set(0, 0, 0);
    if (!on && ctx.me) ctx.world.collision._resolveCapsule(ctx.me.pos, P.radius, P.height, P.walkableY);
  }

  /** Debug uçuş: W/S bakış yönünde, A/D yana, Boşluk yukarı, Ctrl aşağı, koş tuşu = 2x hız. Çarpışma YOK. */
  _fly(dt, me, mv) {
    const input = ctx.input;
    const sp = input.isDown(KEYS.run) ? 14 : 7;
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    const cp = Math.cos(this.pitch);
    let vx = sinY * cp * mv.y - cosY * mv.x;
    let vy = Math.sin(this.pitch) * mv.y;
    let vz = cosY * cp * mv.y + sinY * mv.x;
    if (input.isDown(KEYS.jump)) vy += 1;
    if (input.isDown(KEYS.crouch)) vy -= 1;
    const l = Math.hypot(vx, vy, vz);
    if (l > 1) {
      vx /= l;
      vy /= l;
      vz /= l;
    }
    me.pos.x += vx * sp * dt;
    me.pos.y += vy * sp * dt;
    me.pos.z += vz * sp * dt;
    this.vel.set(0, 0, 0);
    this.grounded = false;
    this.climb = null;
    this.crouching = false;
    this.eyeH = damp(this.eyeH, P.eyeHeight, P.crouchBlend, dt);
    me.crouch = false;
    me.eyeH = this.eyeH;
    me.wishX = 0;
    me.wishZ = 0;
    this.bodyYaw = this.yaw;
    me.yaw = this.yaw;
    me.pitch = this.pitch;
    me.speed = l > 0.05 ? 1 : 0;
    me.air = false;
    me.climbing = false;
    this._rig(dt, me.pos, this.yaw, this.pitch, me.speed, this.eyeH);
  }

  // ------------------------------------------------------------------ merdiven
  /**
   * Merdiven tırmanma (yalnızca yerel oyuncu). Bu karede tırmanıyorsam true döner ve hızı this.vel'e yazar.
   * Başlama: merdivene DEĞİYORSAN (kapsül kutuya touchMargin kadar yakın), merdivene DÖNÜKSEN (faceDot), W / Boşluk / ileri çubuğa BASIYORSAN
   *   ve ayakların tepenin topMargin altındaysa (platformun / üst katın ÜSTÜNDEYKEN tutunmaz: kenardan merdivene doğru yürü / düş, havada yakalarsın).
   * Tırmanırken: W / Boşluk yukarı, S aşağı, A / D yana (yavaş), hiçbiri = asılı kal. Ctrl, donma, ceset taşıma ya da temas kaybı bırakır.
   * Tepeye gelince (ayaklar tepenin topMargin altına çıkınca) W / Boşluk ile merdivene doğru küçük bir sıçrama yapıp üste çıkarsın.
   * Zemine inince tırmanma biter (_alive içinde, hareketten sonra).
   */
  _ladder(dt, me, mv, height, blocked) {
    const sys = ctx.world.ladders;
    if (this.ladderCd > 0) this.ladderCd = Math.max(0, this.ladderCd - dt);
    if (!sys || !sys.list.length) {
      this.climb = null;
      return false;
    }
    const up = mv.y > 0.3 || ctx.input.isDown(KEYS.jump);
    const down = mv.y < -0.3;
    // Merdivenle aramda duvar varsa (duvarın öbür yanındaki merdivene) tutunulmaz / tırmanma bırakılır.
    const behindWall = (h) => !h.flat && ctx.world.collision.blocked(_t.set(me.pos.x, me.pos.y + height * 0.5, me.pos.z), _dir.set(h.px, h.py, h.pz), 0.15);

    if (!this.climb) {
      if (blocked || this.crouching || this.ladderCd > 0 || !up) return false;
      const hit = sys.touch(me.pos, P.radius, height, LD.touchMargin);
      if (!hit || behindWall(hit)) return false;
      if (me.pos.y >= hit.top - LD.topMargin) return false; // tepede / platformun üstünde: tutunma (üstte asılı kalıp içeri sıkışmasın)
      // yanından geçerken kapmasın: merdivene dönük olmalısın (kutunun içindeysen yön tanımsızdır → geçerli)
      if (!hit.flat && Math.sin(this.yaw) * hit.nx + Math.cos(this.yaw) * hit.nz < LD.faceDot) return false;
      this.climb = { ladder: hit.ladder };
      this.vel.set(0, 0, 0);
      this.grounded = false;
    }

    // temas sürüyor mu? (küçük histerezis: kenarda titrememesi için)
    const hit = sys.touch(me.pos, P.radius, height, LD.touchMargin + 0.06);
    if (!hit || blocked || this.crouching || behindWall(hit)) {
      this.climb = null;
      this.ladderCd = LD.regrabDelay;
      this.vel.set(0, Math.min(this.vel.y, 0), 0);
      return false;
    }
    this.climb.ladder = hit.ladder;

    const vy = (up ? LD.speed : 0) - (down ? LD.speed : 0);
    if (up && !down && me.pos.y >= hit.top - LD.topMargin) {
      // tepe: merdivene (platforma / üst kata) doğru sıçra ve bırak
      this.vel.set(hit.flat ? Math.sin(this.yaw) * LD.exitSpeed : hit.nx * LD.exitSpeed, LD.exitUp, hit.flat ? Math.cos(this.yaw) * LD.exitSpeed : hit.nz * LD.exitSpeed);
      this.climb = null;
      this.ladderCd = LD.regrabDelay;
      this.grounded = false;
      return false;
    }

    // yana kayma (kamera yönüne göre) + merdivene hafif çekim (kutuya zaten yakınsan çekme: içine girmesin)
    let vx = -Math.cos(this.yaw) * mv.x * LD.strafeSpeed;
    let vz = Math.sin(this.yaw) * mv.x * LD.strafeSpeed;
    if (!hit.flat && hit.h > 0.12) {
      vx += hit.nx * LD.stick;
      vz += hit.nz * LD.stick;
    }
    this.vel.set(vx, vy, vz);
    return true;
  }

  // ------------------------------------------------------------------ ölü oyuncu (izleyici)
  _spectate(dt, me) {
    const input = ctx.input;
    const look = input.consumeLook();
    if (input.wasPressed(KEYS.prevSpectate)) this.cycleSpectate(-1);
    if (input.wasPressed(KEYS.nextSpectate)) this.cycleSpectate(1);
    const target = this.viewedPlayer();
    if (!target) {
      // izlenecek kimse yok: öldüğüm yerden serbestçe etrafa bakarım (hayalet bakışı)
      this.spectateId = null;
      const s = C.sensitivity * ctx.settings.sensitivity;
      this.yaw -= look.x * s;
      this.pitch = clamp(this.pitch - look.y * s, C.minPitch, C.maxPitch);
      this._rig(dt, me.pos, this.yaw, this.pitch, 0, P.eyeHeight);
      return;
    }
    // izlenen oyuncunun gözünden bak: onun baktığı yöne döneriz (fare ile serbest bakış yok)
    this.yaw = target.yaw;
    this.pitch = target.pitch;
    this._rig(dt, target.pos, target.yaw, target.pitch, target.speed || 0, target.eyeH || P.eyeHeight);
  }

  cycleSpectate(dir) {
    const list = ctx.players.all().filter((p) => p.alive && p !== ctx.me);
    if (!list.length) {
      this.spectateId = null;
      return;
    }
    const i = list.findIndex((p) => p.id === this.spectateId);
    this.spectateId = list[(i + dir + list.length * 2) % list.length].id;
  }

  // ------------------------------------------------------------------ menü / lobi kamerası
  _orbit(dt) {
    const w = ctx.world;
    const cam = ctx.sceneMgr.camera;
    if (!w) return;
    ctx.input.consumeLook();
    const b = w.bounds;
    const c = b.getCenter(_t);
    const size = b.getSize(_dir);
    this.orbitAngle += dt * 0.12;
    const r = Math.max(size.x, size.z) * 0.55 + 4;
    cam.position.set(c.x + Math.sin(this.orbitAngle) * r, c.y + size.y * 0.55 + 2, c.z + Math.cos(this.orbitAngle) * r);
    cam.lookAt(c.x, c.y + size.y * 0.25, c.z);
  }

  // ------------------------------------------------------------------ kamera (birinci şahıs)
  /** pos: ayak konumu. walk: 0 dur, 1 yürü, 2 koş (baş sallanması için). eyeH: göz yüksekliği (eğilince alçalır). */
  _rig(dt, pos, yaw, pitch, walk = 0, eyeH = P.eyeHeight) {
    const cam = ctx.sceneMgr.camera;
    const cp = Math.cos(pitch);
    this.lookDir.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
    this.eye.set(pos.x, pos.y + eyeH, pos.z);

    // yürürken hafif baş sallanması (config.js → camera.bob; 0 = kapalı)
    this.bobAmp = damp(this.bobAmp, walk > 0 ? 1 : 0, 10, dt);
    if (walk > 0) this.bobPhase += dt * (walk >= 2 ? 13 : 9);
    const bob = C.bob * this.bobAmp;
    _t.copy(this.eye);
    _t.y += Math.abs(Math.sin(this.bobPhase)) * bob;
    _t.x += Math.cos(yaw) * Math.sin(this.bobPhase) * bob * 0.5;
    _t.z -= Math.sin(yaw) * Math.sin(this.bobPhase) * bob * 0.5;

    if (this.shakeAmp > 0.001) {
      _t.x += (Math.random() - 0.5) * this.shakeAmp;
      _t.y += (Math.random() - 0.5) * this.shakeAmp;
      this.shakeAmp = damp(this.shakeAmp, 0, 6, dt);
    }
    cam.position.copy(_t);
    cam.rotation.set(pitch, yaw + Math.PI, 0); // YXZ sırası (kurucuda ayarlandı)
  }

  /** Nişan çizgisi: ekranın ORTASINDAN çıkar. { o: göz konumu, d: yön, point: vurulan nokta }. */
  aimRay(maxDist = 120) {
    const col = ctx.world.collision;
    _f.copy(this.lookDir);
    const o = this.eye.clone();
    const hit = col.raycast(o, _f, maxDist);
    const point = o.clone().addScaledVector(_f, hit ? hit.distance : maxDist);
    return { o, d: _f.clone(), point };
  }
}
