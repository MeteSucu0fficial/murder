// Modüller arası paylaşılan tek nesne. main.js bunu doldurur; diğer modüller sadece okur.
// (Döngüsel import sorunlarını önlemek için hiçbir şey import etmez.)
export const ctx = {
  sceneMgr: null, // SceneManager
  world: null, // World (ev + etkileşimli nesneler)
  net: null, // Multiplayer
  client: null, // GameClient (mesajları uygulayan)
  host: null, // HostGame (sadece host'ta)
  input: null,
  players: null, // PlayerManager
  me: null, // yerel PlayerEntity
  inventory: null,
  grab: null,
  corpses: null,
  effects: null,
  interaction: null,
  movement: null,
  voice: null,
  chat: null,
  ui: null,

  viewmodel: null, // birinci şahıs: elimdeki ekipmanın görünümü
  debug: null, // debug panel + bot yönetimi (yalnızca debug odasında etkin)
  knifeView: null, // bıçağın havadaki/yerdeki görünümü
  playerList: null, // TAB listesi
  radial: null, // Q menüsü
  lookName: null, // nişangâhın altındaki isim etiketi
  audio: null,

  lover: null, // sevgilimin oyuncu id'si (varsa)
  endInfo: null, // tur sonu özeti { winner, roles, ... }
  roundIds: null, // bu turda oynayan oyuncu id'leri (Set)

  myId: null,
  isHost: false,
  room: null, // sunucudan gelen oda bilgisi
  phase: 'menu', // menu | lobby | playing | ended
  round: { n: 0, endsAt: 0, winner: null },
  role: null, // yalnızca KENDİ rolüm: { id, name, team, ... }
  vis: {}, // { playerId: { role, baiter, lover, team } } yetkili olduğum bilgiler
  me_state: { hp: 100, ammo: null, reloading: false, abilityCd: 0, baiter: false, knifeAway: false },
  settings: { sensitivity: 1, volume: 0.8, quality: 'high', showDeadChat: true, openMic: false, guardTab: true, fov: null }, // fov null = config.js varsayılanı
};
