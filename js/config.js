// =====================================================================
//  MERKEZİ AYARLAR — oyunun bütün önemli sayıları ve isim kuralları burada.
//  Blender nesne adlandırması (NAME_RULES) da sadece bu dosyada tanımlıdır.
//  Birimler: metre, saniye, radyan (aksi belirtilmedikçe).
// =====================================================================

// ---------------------------------------------------------------------
//  İnternet üzerinden bağlantı (WebRTC) için ICE sunucuları — HEM oyun verisi (multiplayer.js) HEM ses (voice.js) kullanır.
//  STUN çoğu ev ağında yeterlidir. Sıkı NAT / şirket / okul / bazı mobil ağlarda bağlantı kurulamazsa bir TURN sunucusu gerekir:
//  TURN_SERVERS içine kendi bilgilerini yaz (örn. metered.ca Open Relay ücretsiz katmanı, README'ye bak).
// ---------------------------------------------------------------------
export const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];
export const TURN_SERVERS = [
  // { urls: 'turn:<sunucu>:80', username: '<kullanıcı>', credential: '<parola>' },
  // { urls: 'turn:<sunucu>:443?transport=tcp', username: '<kullanıcı>', credential: '<parola>' },
];
export const ICE_SERVERS = [...STUN_SERVERS, ...TURN_SERVERS];

export const GAME_CONFIG = {
  maxPlayers: 16,
  minPlayersToStart: 3, // arkadaşlarla test için düşük tutuldu (istersen 6-10 yap)
  interactionDistance: 3, // etkileşim nesnesi için yedek "yarıçap" (bakış ışını kullanılmadığı durumlarda)

  // Bakışa göre etkileşim: ekranın ortasından çıkan ışın nereye değiyorsa o seçilir (mesafe sıralaması YOK).
  // reach = ışının en fazla ne kadar uzağa bakacağı (metre). Duvarın arkasındaki şeyler seçilemez.
  interaction: { reach: 3.2, anchorRadius: 0.45 },

  assets: {
    house: 'assets/house.glb', // dosya yoksa otomatik olarak örnek ev kurulur
  },

  player: {
    radius: 0.32,
    height: 1.75,
    chestHeight: 1.25,
    eyeHeight: 1.55,
    size: [0.62, 1.75, 0.42], // (eski kutu model ölçüsü; artık yalnızca bilgi) görünür model: ragdoll.js şablonu
    walkSpeed: 3.6,
    runSpeed: 6.0,
    // KAYMA YOK: yerdeyken hız anında hedefe ulaşır (tuşu bırakınca anında durur, buz gibi kaymaz); havada airControl geçerli.
    acceleration: 38, // yalnızca havadayken (airControl ile çarpılır)
    airControl: 0.35, // havadayken yön değiştirme gücü (0-1)
    jumpSpeed: 6.4, // zıplama hızı (m/sn) → yaklaşık 0.85 m yükseklik
    gravity: 24,
    // Merdiven / basamak / eğimli zemin: oyuncu kendiliğinden çıkar (zıplamak gerekmez).
    // stepHeight kadar yüksek basamaklar otomatik çıkılır; snapDown kadar alçalırken zemine yapışır (basamak inerken sekmez).
    stepHeight: 0.5,
    snapDown: 0.5,
    walkableY: 0.55, // yüzey normalinin Y bileşeni bundan büyükse (≈ 56° altı eğim) YÜRÜNEBİLİR zemindir: yalnızca yukarı itilir, yana kaymaz
    // Eğilme (Ctrl, tuş atamadan değişir): basılı tutulur. Daha alçak kapsül, daha alçak göz, yavaş yürüme; tavan altındaysa kalkamaz.
    crouchHeight: 1.25,
    crouchEyeHeight: 1.05,
    crouchSpeed: 0.5, // yürüme hızı çarpanı
    crouchBlend: 11, // göz yüksekliği geçişinin hızı (büyük = hızlı)
    maxHp: 100,
    fallRespawnY: -40,
    // Canlı oyuncular birbirinin içinden GEÇEMEZ. Tek istisna: turun ilk ghostSeconds saniyesi (doğma noktaları çakışabilir).
    ghostSeconds: 10,
    separationStep: 0.18, // çakışan iki oyuncu birbirini her karede en fazla bu kadar (m) iter (ani ışınlanma olmasın)
  },

  // Çarpışma motoru (collision.js). Oyuncu bir DİKEY KAPSÜL'dür (player.radius × player.height); aşağıdakiler onu duvardan geçmeye karşı sağlamlaştırır.
  collision: {
    substep: 0.5, // her hareket alt adımı en çok (substep × yarıçap) metre: küçük = daha güvenli, biraz daha pahalı
    maxSubsteps: 16, // kare başına en çok alt adım (çok hızlı düşüşte de alt adım < yarıçap kalsın)
    iterations: 5, // bir kapsülü duvarlardan çıkarırken en çok itme turu (köşelerde birden çok yüzey birlikte iter)
    descend: 0.8, // yürürken zemine inme adımı = descend × yarıçap (< 1: kapsül ekseni zeminin içinden geçemez)
    crossGuard: true, // duvar geçme koruması: kapsül ekseni bir alt adımda statik bir yüzeyi KESERSE o alt adım geri alınır (kapatma)
  },

  // Nişangâhın altında, bakılan oyuncunun / cesedin adı (kendi renginde, küçük). Birkaç saniye sonra ya da başkasına bakınca değişir / kaybolur.
  lookName: { range: 14, showTime: 2.5 },

  // Oyun YALNIZCA birinci şahıs. Üçüncü şahıs kamerası yoktur.
  camera: {
    fov: 75,
    viewmodelFov: 60, // eldeki silahın ayrı çizim açısı
    bob: 0.012, // yürürken hafif baş sallanması (0 = kapalı)
    minPitch: -1.15,
    maxPitch: 1.15,
    sensitivity: 0.0023,
    touchSensitivity: 0.0048,
  },

  rounds: {
    restartDelay: 8,
    roleRevealTime: 5, // tur başında tam siyah ekran: rol + açıklama (sn)
    roundTime: 600, // saniye, 0 = sınırsız
    timeoutWinner: 'innocent', // süre dolarsa kazanan taraf
  },

  lovers: { enabled: true },

  // Kapı kanadı HER ZAMAN katıdır (açıkken de içinden geçilmez). Hareket ederken bir oyuncuya değerse geri döner:
  // açılırken çarparsa kapanır, kapanırken çarparsa açılır (oyuncu kapıya sıkışmaz / itilmez).
  doors: {
    openAngle: Math.PI * 0.5, // 90°
    duration: 0.8,
    interactDistance: 2.6,
    reverseOnBlock: true,
    blockMargin: 0.02, // çarpma toleransı (m): kapıya yaslanıp duran oyuncu "çarpma" sayılmaz
    blockCooldown: 0.4, // bir çarpmadan sonra bu kadar sn tekrar çarpma bakılmaz (ileri-geri titremesin)
  },

  cage: {
    moveDistance: 5,
    moveDuration: 2, // iniş süresi
    riseDuration: 2.5, // çıkış süresi
    startOffset: 0, // başlangıç konumu: Blender'daki yerinden bu kadar (yön boyunca) kaydır
    direction: [0, -1, 0],
  },

  specialDoor: {
    moveDistance: 4,
    moveDuration: 2,
    riseDuration: 2,
    startOffset: 0,
    direction: [0, -1, 0], // [x, y, z] dünya yönü; örn. [1,0,0] yana kayar
  },

  paintings: { duration: 0.7 },

  // Merdiven ("Ladder_*"): merdivene DEĞİP (kapsül, merdivenin kutusuna touchMargin kadar yaklaşınca) ileri (W) ya da Boşluk tuşuna BASILI tutarsan tırmanırsın.
  // S aşağı indirir · hiçbir şeye basmazsan olduğun yerde asılı kalırsın · Ctrl bırakır (düşersin) · yana kayarak ya da uzaklaşarak da bırakırsın.
  // Tepeye varınca (ayakların tepenin topMargin altına gelince) merdivene doğru küçük bir sıçrama yaparsın → platforma / üst kata çıkarsın.
  ladder: {
    speed: 3, // tırmanma hızı (m/sn)
    strafeSpeed: 1.2, // merdivende yana (A/D) hız (m/sn)
    touchMargin: 0.22, // kapsül merdiven kutusuna bu kadar (m) yaklaşırsa "değdi" sayılır
    faceDot: 0.2, // tırmanmaya başlamak için merdivene dönük olmalısın (bakış yönü · merdivene yön ≥ bu); yanından geçerken kapmasın diye
    stick: 1.2, // tırmanırken merdivene hafif çekim (m/sn): sürüklenip kopmasın
    topMargin: 0.3, // ayakların merdiven tepesinin bu kadar altına gelince üste sıçra
    exitSpeed: 3.4, // üstten çıkış sıçraması: ileri hız (m/sn)
    exitUp: 4.2, // üstten çıkış sıçraması: yukarı hız (m/sn)
    regrabDelay: 0.55, // merdiveni bıraktıktan / tepeden çıktıktan sonra tekrar tutunmadan önce bekleme (sn)
  },

  // Serbest dönen tablolar ("MidPaint_*" — "MidPoint_*" da olur): nesnenin ORİJİNİ (pivot) etrafında her eksende döner. Blender'da orijini plakanın ORTASINA koy.
  // Oyuncu ittikçe (nereden değdiğine ve hızına göre: yürürken yavaş, koşarken hızlı; yüzeyde kayarken sürükler) ya da bir eşya çarptıkça döner; sürtünmeyle yavaşlar.
  // Katıdır (içinden geçilmez; dönerken duvara / zemine girmez). Fizik yalnızca HOST'ta hesaplanır, herkese yayınlanır.
  // Nesne başına ayar (Blender özel özellikleri ya da OBJECT_OVERRIDES): mass, damping, maxSpin, restoreSpring, axis: 'free' | 'vertical' | 'normal' | [x,y,z]
  midPaint: {
    axis: 'vertical', // varsayılan: tablo yalnızca KENDİ Y ekseni etrafında döner (serbest yapmak için Blender'da axis = free)
    mass: 6, // kütle: büyük = zor döner
    minThickness: 0.12, // atalet hesabında kullanılan en küçük kalınlık (m): ince plaka aşırı çevik olmasın
    damping: 1.6, // dönme sönümü (1/sn): büyük = çabuk durur
    maxSpin: 12, // en yüksek dönme hızı (rad/sn)
    playerPush: 28, // oyuncu itişi: kuvvet = playerPush × yaklaşma hızı (büyük = el gibi hemen takip eder, küçük = tembel döner)
    playerGrip: 0.85, // bir karede plaka yüzeyi, itenin hızına en çok bu oranda yetişir (0..1)
    friction: 0.35, // yüzey boyunca kayarken sürükleme (itişin oranı)
    touchMargin: 0.1, // oyuncu kapsülü plakaya bu kadar (m) yaklaşınca "değdi" sayılır
    centerBias: 0.05, // tam ortasından itilince de dönsün diye en az bu kadar kol uzunluğu (m)
    itemPush: 0.9, // eşya çarpması: darbe çarpanı (eşya ağırlığı × çarpma hızı × bu)
    itemMinSpeed: 0.6, // bundan yavaş eşya teması (yatan / süzülen eşya) plakayı döndürmez (m/sn)
    restitution: 0.3, // dönerken duvara / zemine çarpınca geri sekme
    restoreSpring: 0, // 0 = döndüğü yerde kalır; > 0 = ilk duruşuna yavaşça döner (rad/sn² / rad)
    sleepSpin: 0.04, // bu açısal hızın altında durur (rad/sn)
    blockByWorld: true, // dönerken duvara / zemine / kapıya girmesin
    sampleRadius: 0.03, // engel testindeki örnek kürelerin yarıçapı (m)
    netHz: 15, // yayın sıklığı
    netSmooth: 18, // istemcide yayına yumuşatma hızı
  },

  // İdam alanı bir ŞALTERDİR (aç / kapa). Açıkken alanın (DeathZone) içindeki herkes her `interval` saniyede `damage` hasar alır.
  execution: {
    damage: 10, // her vuruşta
    interval: 0.5, // vuruşlar arası süre (sn) → saniyede 20 hasar
    leverTime: 0.35, // şalterin devrilme süresi
    leverAngle: 0.9, // şalter kolunun dönüş açısı (rad)
    toggleCooldown: 0.5, // üst üste çevirmeyi önleyen bekleme (sn)
  },

  lights: {
    intensity: 16, // PointLight şiddeti (candela)
    distance: 16,
    decay: 1,
    maxActive: 50, // aynı anda gerçek ışık olarak çalışacak en fazla nokta ışığı
    showBulbs: false, // Light_ nesnelerinin yerine küçük bir ampul küresi çiz
    ambientOn: 0.42,
    ambientOff: 0.035,
    fogOn: 0.012,
    fogOff: 0.09,
    transitionSpeed: 4,
  },

  flashlight: {
    range: 24,
    angle: 0.5,
    penumbra: 0.5,
    intensity: 95,
    color: 0xfff1cf,
    coneOpacity: 0.06,
    maxRemoteLights: 3, // diğer oyuncuların fenerleri için gerçek ışık havuzu
    beamLength: 10.8, // uzak oyuncunun fener konisinin (görsel) uzunluğu; duvara değince kısalır
    // Fener ışığı duvardan geçmez:
    //  · Orta/Yüksek kalite: gerçek gölge haritası (QUALITY_PRESETS → shadows).
    //  · Düşük kalite: gölge yok; ışık menzili baktığın yöndeki en yakın duvara göre kısılır (menzil = duvar mesafesi × clipScale + clipPad, en az clipMin).
    shadowBias: -0.0008,
    shadowNormalBias: 0.05,
    shadowNear: 0.06,
    muzzleOffset: 0.4, // ışık gözün ne kadar önünden çıkar
    muzzleClearance: 0.14, // önünde duvar varsa ışık duvara bu kadar yaklaşmadan durur (ışık duvarın içinde doğmasın)
    clipScale: 1.45,
    clipPad: 0.5,
    clipMin: 3,
  },

  voice: {
    whisperDistance: 3,
    normalDistance: 8,
    shoutDistance: 18,
    connectMargin: 2, // bağlantıyı menzil + bu kadar mesafede aç
    disconnectMargin: 6, // bu kadar mesafeden sonra kapat (histerezis)
    routeInterval: 0.5, // host'un ses rotalarını güncelleme aralığı (sn)
    maxConnectionsPerPeer: 8,
    defaultLevel: 1, // 0 fısıltı, 1 normal, 2 bağırma (tuşlar: aşağıdaki KEYS / ayarlardan değiştirilebilir)
  },

  grab: {
    holdDistance: 2,
    holdDrop: 0, // tutulan eşya tam nişangâhın (ekran ortasının) hizasında durur: aşağıda değil, bakılan yönde
    minHoldDistance: 0.9,
    minWallClearance: 0.22, // tutulan eşya duvara çok yaklaşırsa gözden en az bu kadar uzakta kalır
    throwForce: 8,
    gravity: 18,
    restitution: 0.35,
    friction: 0.82,
    rotateSpeed: 0.006,
    defaultWeight: 1,
    weightSlow: 0, // normal eşyalar ağır değildir: taşırken yavaşlamazsın (ağırlık başına yavaşlama; 0 = yok)
    reach: 3,
    sleepSpeed: 0.15,
    playerPush: 2.5,
  },

  // Cesetler: ölen oyuncu fizikli bir "ragdoll" olur (host hesaplar, herkese yayınlar). Bir uzvundan tutulup taşınır,
  // ama ağırdır: yavaş yürürsün, ceset hedefe geç gelir, tutulan uzuv sınırlı yüksekliğe kalkar ve
  // ona BAKMAYI BIRAKIRSAN (nişan cesetten uzaklaşırsa) elinden düşer.
  corpse: {
    reach: 2.4, // tutmak için bakış menzili (m)
    holdDistance: 1.1, // tutulan uzuv, bakış yönünde gözden bu kadar önde durmaya çalışır
    maxLift: 0.75, // tutulan uzuv ayaklardan en fazla bu kadar yukarı kalkar (kaldırması zor)
    pullSpeed: 2.2, // tutulan uzvun hedefe en fazla bu hızla (m/sn) gelebilmesi → ağırlık hissi
    carrySpeed: 0.35, // taşırken yürüme hızı çarpanı (koşma ve zıplama kapalı)
    dropAngle: 0.62, // bakışın tutulan uzva göre sapması (rad ≈ 35°); bundan fazlaysa...
    dropGrace: 0.35, // ...bu kadar saniye sürerse ceset elden düşer
    dropDistance: 3.2, // tutulan uzuv gözden bu kadar uzaklaşırsa da düşer
    // fizik (Verlet): yalnızca host'ta çalışır
    gravity: 20,
    damping: 0.992, // alt adım başına hız korunumu
    groundFriction: 0.06, // zemine değen noktanın yatay hız kaybı (alt adım başına)
    restitution: 0.06, // çarpınca geri zıplama (0 = hiç zıplamaz)
    smooth: 18, // istemcide ağdan gelen noktalara yumuşatma katsayısı
    iterations: 8, // kısıt çözüm turu (yüksek = tutulan ceset daha az uzar)
    substeps: 2,
    sleepSpeed: 0.12, // m/sn: tüm noktalar bu hızın altında sleepTime sn kalırsa ceset uyur
    sleepTime: 0.8,
    maxAwake: 15, // sn: bu kadar süre uyanık kalan ceset (titreşim vb.) zorla uyutulur
    netHz: 12, // uyanık cesetlerin yayın sıklığı
    pushPlayers: true, // yürüyen oyuncular cesetleri iter
    stumble: { rifle: 3.2, pistol: 4.5, plasma: 2.8, taser: 0.6, knife: 0.8, knifeThrow: 1.5, bomb: 0, execution: 0 }, // ölüm anı itişi (m/sn)
  },

  equipment: {
    knife: {
      name: 'Bıçak',
      damage: 1000,
      range: 1.5, // yakın dövüş menzili (m)
      cooldown: 0.75,
      coneCos: 0.3,
      throwSpeed: 26,
      throwGravity: 9,
      throwDamage: 100,
      throwCooldown: 0.4,
      returnAfter: 120, // atılan bıçak alınmazsa bu kadar sn sonra geri döner
      pickupRadius: 1.4,
    },
    pistol: { name: 'Tabanca', damage: 1000, magazine: 1, reloadTime: 3, cooldown: 0.25, range: 25, spread: 0 },
    rifle: { name: 'Taramalı', damage: 15, magazine: 30, reloadTime: 2.6, fireRate: 9, range: 25, spread: 0.025 },
    taser: { name: 'Elektrikli sopa', damage: 35, range: 1.8, cooldown: 1.6, stun: 1.2, coneCos: 0.45 },
    // Gizli eşyalar: yalnızca debug panelinden verilir. Slot numaraları (3, 4, 5) verilme sırasına göre atanır.
    // Roketatar: duvara / oyuncuya çarpınca patlar (radius içindeki herkes ölür). Menzil ≈ speed × life.
    rocket: { name: 'Roketatar', item: true, projectile: true, damage: 1000, magazine: 1, reloadTime: 2.6, cooldown: 0.6, speed: 24, life: 1.3, radius: 4, blastImpulse: 12 },
    // Bomba: baktığın yere (plantRange m) konur, fuse sn sonra patlar. Sınırsız; yalnızca bekleme süresi vardır.
    bomb: { name: 'Bomba', item: true, damage: 1000, cooldown: 2.5, fuse: 3, radius: 4.5, blastImpulse: 13, plantRange: 3 },
    // Plazma tüfeği: otomatik; yavaş-hızlı enerji topu (hasar vurduğu yerde, anlık değil). Menzil ≈ speed × life.
    plasma: { name: 'Plazma tüfeği', item: true, projectile: true, damage: 34, magazine: 20, reloadTime: 2.2, fireRate: 5, speed: 40, life: 0.7, spread: 0.01 },
  },

  // Yeteneklerin KULLANIM HAKKI (sayaç) yoktur. Sadece uyurgezerin bekleme süresi vardır.
  // Medyum: bağlantıyı yalnızca gece (ışıklar kapalıyken) kurabilir; ışıklar açılınca (sabah) bağlantı otomatik kesilir.
  abilities: {
    sleepwalker: { freezeTime: 5, cooldown: 60 },
    bomber: { radius: 4.5, fuse: 0, damage: 1000, hurtSelf: true, blastImpulse: 13 }, // fuse: 0 = düğmeye basınca ANINDA patlar (> 0 olursa o kadar sn fitil yanar); blastImpulse: patlamada cesetlerin savrulma hızı (m/sn)
    medium: { nightLitFraction: 0.5 }, // ışıkların bu oranından AZI açıksa "gece" sayılır
    // S2G: gece başına 1 kez. Hedefin yanına (range m) git, ona bak, yetenek tuşunu holdTime sn basılı tut (zip sesi çalar);
    // sonra hedef ölür, kill sesi çalar ve ceset ses bitene kadar her jumpInterval sn'de bir hafifçe zıplar.
    s2g: {
      holdTime: 1, // basılı tutma süresi (sn) — buradan ayarla
      range: 1, // hedefe en fazla bu kadar yakın (m)
      lookCos: 0.8, // hedefe bakış toleransı (bakış yönü ile hedef göğsü arasındaki açının kosinüsü)
      nightOnly: true, // yalnızca gece (ışıklar kapalıyken) kullanılır
      zipSound: 'assets/sounds/zip.mp3',
      killSound: 'assets/sounds/s2g.mp3',
      zipRange: 12, // fermuar sesi en fazla bu kadar uzaktan duyulur (m)
      killRange: 40, // s2g.mp3 (ölüm sesi) en fazla bu kadar uzaktan duyulur (m)
      jumpInterval: 0.25, // ceset zıplama aralığı (sn)
      jumpSpeed: 2.6, // zıplama hızı (m/sn): hafif
      fallbackSeconds: 6, // ses dosyası yüklenemezse zıplama süresi
    },
  },

  // Tamamen sessiz olan sesler: bıçak vurma/fırlatma, kapı ve ÖLÜM (biri ölünce hiçbir ses çıkmaz; ölümcül vuruşun "darbe" sesi de yok).
  // Silah (tabanca, taramalı, elektroşok) ve patlama sesleri açıktır.
  audio: { silent: ['stab', 'throw', 'door', 'death'] },

  // Debug haritası (tek/iki kişilik deneme modu)
  debug: { maxBots: 16, revealTime: 1 },

  chat: { maxLength: 200, cooldownMs: 500 },
  radial: { cooldown: 2 },

  net: {
    posHz: 15, // oyuncu konumu gönderme
    itemsHz: 12, // eşya durumu yayını
    meHz: 5, // kişisel durum (can, mermi...)
    interpolation: 12, // uzak oyuncu yumuşatma katsayısı
  },

  graphics: { quality: 'high' },
};

// shadows: fener (SpotLight) gölge haritası kullanır → ışık duvardan geçmez. shadowMap: gölge dokusu boyutu.
// "low" kalitede gölge yoktur; onun yerine fener menzili baktığın duvara göre kısılır.
export const QUALITY_PRESETS = {
  low: { pixelRatio: 1, antialias: false, lambert: true, maxLights: 5, shadows: false, shadowMap: 0 },
  medium: { pixelRatio: 1.25, antialias: false, lambert: false, maxLights: 10, shadows: true, shadowMap: 128 },
  high: { pixelRatio: 1.5, antialias: true, lambert: false, maxLights: 20, shadows: true, shadowMap: 256 },
};

// ---------------------------------------------------------------------
//  Blender isim kuralları. Sıra ÖNEMLİ: ilk eşleşen kural kazanır.
//  hide: true → nesne oyunda görünmez (yardımcı nesne), ama konumu/boyutu kullanılır.
//
//  Önek kuralı: ad, kelimeyle başlayıp ardından HARF gelmiyorsa eşleşir. Yani hepsi aynı kapı sayılır:
//    Door · Door_ · Door_01 · Door_1 · Door_.001 · Door.001 · Door-2        (Blender çoğaltınca ".001" ekler)
//  Not: GLTFLoader adlardaki "." işaretini siler (Door_.001 → Door_001, Door.001 → Door001); kurallar buna da uyumludur.
//  Ayarlar tablolarında (OBJECT_OVERRIDES, LIGHT_GROUPS, PAINTING_CONFIG) da aynı esneklik geçerlidir (util.js → lookupName).
// ---------------------------------------------------------------------
const pre = (word) => new RegExp(`^${word}(?![a-z])`, 'i');

export const NAME_RULES = [
  { kind: 'specialDoorButton', test: pre('Special_Door_Button') },
  { kind: 'specialDoor', test: pre('Special_Door') },
  { kind: 'cageButton', test: pre('Cage_Button') },
  { kind: 'cage', test: pre('Cage') },
  // İdam alanı: DeathZone (veya Execution_Zone / Execution_Area) = hasar bölgesi.
  // Diğer her "Execution*" bir ŞALTER'dir (Execution_Lever önerilir; eski adlar Execution_Button / Execution_Switch de şalter gibi çalışır).
  { kind: 'deathZone', test: /^(DeathZone|Execution_(Zone|Area))(?![a-z])/i, hide: true },
  { kind: 'executionLever', test: pre('Execution') },
  { kind: 'painting', test: pre('Painting') },
  // Serbest dönen tablo: MidPaint_01 · midpaint_ · MidPoint_1 · Mid_Painting_01 ... (pivot = nesne orijini)
  { kind: 'midPaint', test: /^Mid[\s_.\-]?(paint(ing)?|point)(?![a-z])/i },
  // Tırmanılan merdiven: Ladder_01 · ladder_ · Ladder.001 ...
  { kind: 'ladder', test: pre('Ladder') },
  { kind: 'grab', test: pre('Grab') },
  { kind: 'door', test: pre('Door') },
  { kind: 'switch', test: pre('Switch') },
  { kind: 'light', test: pre('Light') },
  { kind: 'spawn', test: pre('Spawn'), hide: true },
  { kind: 'room', test: pre('Room'), hide: true },
  { kind: 'interact', test: pre('Interact'), hide: true },
  { kind: 'collision', test: pre('Collision'), hide: false },
];

// Haritada bulunması BEKLENEN nesne türleri ve örnek adları (debug haritası raporu "bulunamadı" listesi için).
// required: true → yoksa oyun yine çalışır ama uyarı verilir. Alt bilgi yalnızca raporda kullanılır.
export const EXPECTED_KINDS = [
  { kind: 'collision', example: 'Collision_Walls', note: 'çarpışma gövdesi; yoksa görünen tüm mesh\'ler çarpışır', required: false },
  { kind: 'spawn', example: 'Spawn_01', note: 'doğma noktaları; yoksa harita ortasında doğulur', required: true },
  { kind: 'room', example: 'Room_01', note: 'Uyurgezer ışınlanması ve oda adları', required: false },
  { kind: 'door', example: 'Door_01', note: 'açılıp kapanan kapılar', required: false },
  { kind: 'switch', example: 'Switch_01', note: 'ışık şalteri', required: false },
  { kind: 'light', example: 'Light_01', note: 'şalterle açılıp kapanan ışıklar', required: false },
  { kind: 'grab', example: 'Grab_01', note: 'tutulabilir eşyalar', required: false },
  { kind: 'painting', example: 'Painting_01', note: 'kayan tablolar', required: false },
  { kind: 'midPaint', example: 'MidPaint_01', note: 'değince pivotu (orijini) etrafında dönen serbest tablolar', required: false },
  { kind: 'ladder', example: 'Ladder_01', note: 'tırmanılan merdiven (değip W / Boşluk basılı tut)', required: false },
  { kind: 'cage', example: 'Cage', note: 'kafes (+ Cage_Button)', required: false },
  { kind: 'cageButton', example: 'Cage_Button', note: 'kafes düğmesi', required: false },
  { kind: 'specialDoor', example: 'Special_Door', note: 'hareketli duvar (+ Special_Door_Button)', required: false },
  { kind: 'specialDoorButton', example: 'Special_Door_Button', note: 'hareketli duvar düğmesi', required: false },
  { kind: 'executionLever', example: 'Execution_Lever', note: 'idam şalteri (+ DeathZone)', required: false },
  { kind: 'deathZone', example: 'DeathZone', note: 'idam hasar alanı', required: false },
  { kind: 'interact', example: 'Interact_Door_01', note: 'isteğe bağlı etkileşim noktaları', required: false },
];

// Her nesneye özel ayar (isteğe bağlı). Blender'da Custom Properties olarak da girilebilir
// (glTF extras → userData); öncelik: bu tablo > Blender özellikleri > varsayılan.
export const OBJECT_OVERRIDES = {
  // Door_01: { openAngle: 1.9, duration: 0.6 },
  // Grab_01: { weight: 3, carryable: true, throwable: true, collisionSize: [0.4, 0.4, 0.4], rotationLimit: { pitch: [-0.8, 0.8] } },
  // Interact_Door_01: { radius: 2.2 },
  Grab_01: { weight: 1 },
  Grab_02: { weight: 2 },
  Grab_03: { weight: 0.6 },
  Grab_04: { weight: 4, throwable: false },
  Grab_08: { weight: 4, throwable: false },
};

// Şalter → kontrol ettiği ışıklar. Değerler önek (startsWith) veya tam isimdir.
export const LIGHT_GROUPS = {
  Switch_01: ['Light_']
};

// Tablo konumları (açık / kapalı). Konum = dünya koordinatı, offset = tablonun KENDİ eksenlerinde kayma.
// closed boş bırakılırsa Blender'daki başlangıç konumu "kapalı" sayılır.
export const PAINTING_CONFIG = {
  default: { duration: 0.7, closed: {}, open: { offset: [0, 2, 0], rotationOffset: [0, 0, 0] } }
};

// Q dairesel menüsü. Buraya öğe eklemek yeterli.
export const RADIAL_MENU_ITEMS = [
  { name: 'YA GELSENE BURAYA OROSPU ÇOCU', sound: 'assets/sounds/ya gelsene.mp3' },
  { name: 'ADAM ÖLDÜ AQ', sound: 'assets/sounds/adam oldu aq.mp3' },
  { name: 'MAHORAGA HELP!', sound: 'assets/sounds/mahoragahelp.mp3' },
  { name: 'Its quandale dingle here!', sound: 'assets/sounds/whatsupguys.mp3' }
];

// Sessiz mod kimlikleri
export const IDENTITY = {
  colors: [
    { id: 'blue', name: 'Mavi', hex: 0x2f6bff },
    { id: 'pink', name: 'Pembe', hex: 0xff6fb5 },
    { id: 'green', name: 'Yeşil', hex: 0x2fb85a },
    { id: 'yellow', name: 'Sarı', hex: 0xf2d11b },
    { id: 'brown', name: 'Kahverengi', hex: 0x8a5a2b },
    { id: 'gray', name: 'Gri', hex: 0x8d949c },
    { id: 'red', name: 'Kırmızı', hex: 0xe0332f },
    { id: 'orange', name: 'Turuncu', hex: 0xf28a1b },
    { id: 'purple', name: 'Mor', hex: 0x8a4fd6 },
    { id: 'white', name: 'Beyaz', hex: 0xf1f1f1 },
  ],
  codes: [
    'Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliett', 'Kilo', 'Lima', 'Mike',
    'November', 'Oscar', 'Papa', 'Quebec', 'Romeo', 'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey', 'X-ray', 'Yankee', 'Zulu',
  ],
  voice: { workerName: 'Irgat', workerColor: 0x8d949c, detectiveName: 'Dedektif', detectiveColor: 0x2f6bff },
};

// Varsayılan tuşlar. Oyuncu ayarlardan değiştirebilir (keybinds.js, tarayıcıda saklanır).
// KEYS nesnesi çalışma anında güncellenir; bütün modüller her karede KEYS.<eylem> okuduğu için anında geçerli olur.
export const DEFAULT_KEYS = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  run: 'ShiftLeft',
  interact: 'KeyE',
  ptt: 'KeyV',
  talkLevel: 'KeyC',
  mic: 'KeyM',
  list: 'Tab',
  radial: 'KeyQ',
  crouch: 'ControlLeft',
  hand: 'Digit1',
  equip: 'Digit2',
  slot3: 'Digit3', // gizli eşya slotları (debug'dan verilenler; verilme sırasına göre 3, 4, 5)
  slot4: 'Digit4',
  slot5: 'Digit5',
  ability: 'KeyX',
  flashlight: 'KeyF',
  reload: 'KeyR',
  chat: 'Enter',
  debug: 'F2', // debug panelini aç/kapat (yalnızca debug odasında)
  collisionView: '', // Collision_* nesnelerini göster / gizle (yarı saydam turuncu)
  menu: 'Escape',
  prevSpectate: 'ArrowLeft',
  nextSpectate: 'ArrowRight',
};
export const KEYS = { ...DEFAULT_KEYS };

// Rol seçim tablosu: oyuncu sayısına göre her özel rolden kaç tane olacağı.
// (roles.js bu tabloyu kullanır; sadece buradan değiştirmen yeterli.)
export const ROLE_COUNTS = {
  detective: (n) => (n >= 2 ? 1 : 0), // ZORUNLU rol (roles.js → MANDATORY_ROLES): en az 1
  mafia: (n) => (n >= 14 ? 2 : n >= 8 ? 1 : 0),
  s2g: (n) => (n >= 10 ? 1 : 0),
  civilPolice: (n) => (n >= 6 ? 1 : 0),
  bomber: (n) => (n >= 7 ? 1 : 0),
  escort: (n) => (n >= 5 ? 1 : 0),
  sleepwalker: (n) => (n >= 6 ? 1 : 0),
  medium: (n) => (n >= 9 ? 1 : 0),
};
