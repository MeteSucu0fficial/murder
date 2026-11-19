# Irgat Murder — 3B Çok Oyunculu Gizli Rol Oyunu

Tarayıcıda çalışan, arkadaşlarla oynanan **birinci şahıs** 3B "Murder" / sosyal çıkarım oyunu.
**Three.js** (3B), **PeerJS DataConnection** (oda + oyun senkronu) ve **WebRTC** (yakınlık tabanlı sesli iletişim) kullanır. Oyun sunucusu yoktur; PeerJS Cloud yalnızca eşleri buluşturmak için sinyalleşme sağlar.
Evi Blender'da modelleyip `assets/house.glb` olarak koyarsın; oyun nesneleri **isimlerinden** otomatik tanır.

> `assets/house.glb` yoksa oyun otomatik olarak dahili bir **örnek ev** kurar (aynı isim kurallarıyla). Böylece her sistemi hemen deneyebilirsin.
> Menü → Ayarlar → Genel → "Örnek evi .glb olarak indir" ile bu evi Blender'a alıp kendi evin için şablon yapabilirsin.

**Yenilikler:** mikrofon seçimi · tuş atama · zıplama · yalnızca birinci şahıs · bakışa göre etkileşim/eşya alma · rollerde kullanım hakkı yok (Medyum sabah bağlantıyı keser) · **debug haritası** (tek kişilik, rol seç, hareketsiz bot ekle) · bıçak/kapı sessiz, silah sesleri duyulur.
**Son sürümde eklenenler:** ölüm tamamen sessiz · **patlama efekti** (bombacı) · üstte hayatta kalan sayısı yok · debug'ta **harita raporu** (konsol) · tutulan eşya duvarın içine girmez · **fener ışığı duvardan geçmez** · kapı **her zaman katı** ve çarptığı oyuncunun arkasında geri kapanır · **idam şalteri** (açıkken alandakilere sürekli hasar) · host'ta **rol seçimi (hangi roller + en çok kaç tane)** · **fizikli ceset (ragdoll)** + bir uzuvdan taşıma · oyuncular birbirinin içinden geçemez (turun ilk 10 sn'si hariç) · `Door_.001` / `Door.001` gibi Blender adları.
**v4'te eklenenler:** **zorunlu roller** (Katil + Dedektif her turda vardır) · yeni kötü rol **S2G** (gece fermuarla öldürür, ceset zıplar) · sessiz modda **yalnızca dedektif konuşur** (normal ↔ bağırma, mikrofon aç/kapa) · **kayma yok**, merdiven/rampadan otomatik çıkış · **eğilme (Ctrl)** · **Ctrl+W** ile sekme kapanmasına karşı koruma · oyuncular artık cesetle aynı **insan modeli** (kol, bacak, yürüme/eğilme animasyonu) · baktığın kişinin/cesedin **adı** nişangâhın altında (kendi renginde) · sol altta adın, sağ altta rolün · tur başında **5 sn siyah rol ekranı** (rol, bildiğin kişiler, rol açıklaması) · **Baiter / Aşık** ikincil rol olarak rolünün yanında · Uyurgezer uyurken siyah ekran · Q menüsünde çalan ses bitmeden aynı ses tekrar basılamaz · tutulan eşya nişangâhın hizasında durur.
**Son eklenenler:** **merdiven** (`Ladder_*`: değip **W / Boşluk** basılı tut, tırman) · **serbest dönen tablolar** (`MidPaint_*`: pivotları etrafında, nereden ve ne kadar sert değdiğine göre döner; atılan/düşen eşyalar da döndürür) · **tüm tablolar katıdır** (içinden geçilmez) · **TAB listesinde kimsenin rolü görünmez**.
**v4.2'de eklenenler:** tablolar yalnızca **kendi Y ekseninde** döner · **menziller kısaldı** (S2G aynı) · taramalı kısaldı, **tabanca + taramalı iki elle**, **elektrikli sopa**, düzeltilmiş bıçak tutuşu · **TAB'da sol tıkla Baiter ver** · karakterde **yalnızca üst renkli**, bacaklar gri, kafa açık ten / kahverengi · **cesetler kendi içinden geçmez** · yeni tutuş / saldırı **animasyonları** · **büyütülmüş örnek ev** + gizli tüneller (tabloların arkası) · **Bombacı anında patlar** · **C basılı tut: ses seviyesi dairesi** · debug: **noclip, görünmezlik, ölümsüzlük, öldür, diriltme (doğma noktası / ceset), ekrana yazı (herkese / tek kişiye), susturma, patlat, yanına git, önüme getir, gizli eşyalar (roketatar, bomba, plazma)** · **`Collision_*` nesneleri görünür** (yarı saydam turuncu; v4.3'te F3 kaldırıldı: yalnızca debug panelinde).
**v4.3'te eklenenler:** **mobil destek kaldırıldı** (v4.4'te dokunmatik arayüz yeniden eklendi) · karakterlere **yüz** (`assets/faces`: PNG / SVG, tur başında rastgele; PNG'nin arka planı şeffafsa kafanın ten rengi görünür; saç / göz / kaş modeli kaldırıldı) · **sevgililer** artık lobideki **Rol ayarları**ndan (Kapalı / Otomatik / 1–3 çift) · **TrollHacks:** normal oyunda konsola `TrollHacks.enabled = true;` yaz → **F2** paneli (bot ekleme hariç her şey) · panelde ve debug'ta oyuncuların **oyun içi adı (NATO) + rengi** · **X-ray** (duvar arkasındaki oyuncular + roller; debug ve TrollHacks) · **F3 kaldırıldı**, çarpışma görünümü yalnızca panelde · **ışık havuzu** (sana en yakın ışıklar gerçek ışık, daha az GPU yükü) · Ayarlar'da **Işık efektleri** aç / kapa (kapalıyken ortam düz aydınlatılır) · ışıklar kapalıyken **yakın görüş** · uzak oyuncuların fener gölgeleri yarı maliyetle.
**v4.3.1'de düzeltilenler:** lobiyi ve rol ayarlarını çökerten hata (`Sevgililer` satırı yanlış tabloya bakıyordu) giderildi → oda açılınca hata yok, host yine **hangi rolden kaç tane** olacağını seçebilir · davet bağlantısı artık **`sayfa#KOD`** (GitHub'da `?oda=KOD` kabul edilmiyordu; eski `?oda=` bağlantıları da çalışır) · **Işık efektleri kapalıyken** de oda ışıkları kapanınca **karanlık** olur (fener çalışır) · karanlıkta **yakın görüş mesafesi yarıya** indi (8 → 4 m) · başka oyuncuların başında **fener konisi yok**, yalnızca ışık.
**v4.4'te eklenenler:** **ölüm itmesi:** ölen oyuncu hemen yere yığılmaz; vurulan taraftan silaha göre bir kuvvetle itilir (yürüyüş hızın da eklenir; `corpse.stumble / stumbleLift / momentum`) · **ölünce görünmez dünya:** siyah arka plan, **üçüncü şahıs** kamera, yalnızca **ragdoll cesetler** görünür (çarpışma görünmez haritaya işlemeye devam eder; `deadView.*`); **ekrana tıkla / dokun** → birinci şahıs **oyuncu izleme** (v4.5: geri dönüş yok; **sol tık = sonraki, sağ tık = önceki** oyuncu) · **zıpla + eğil:** gövde aşağı inmez, **bacaklar yukarı çekilir** (CS tarzı; `player.airCrouchLift`) · çarpışma artık **silindir** (düz taban / tavan; `collision.capFlat`, `1` = eski kapsül) · **Medyum** her gece yalnızca **1 kişi** için kullanılabilir · **merdivende ortalanma yok** (tırmanırken yana çekilmezsin) · lobideki **TrollHacks seçici kaldırıldı** · **sessiz modda** dedektifin de rastgele **kod adı + rengi** olur · **mobil (dokunmatik) arayüz geri geldi:** yalnızca UI katmanı, **çoklu dokunuş**, her ekranda aynı oransal boyut (aşağıda "Mobil kontroller").
**v4.5'te eklenenler:** yeni rol **Umacı** (gece başına 1 kez **X: 60 sn görünmez**, oyuncuların içinden geçer; hareketsizken tamamen görünmez, hareket edince Wraith tarzı **dalgalanma**; varsayılan takım Masum: `roles.js → UMACI_TEAM`) · ölünce izleme **geri dönüşsüz**: boşluk kamerasında tıkla → birinci şahıs izleme, **sol tık sonraki / sağ tık önceki** oyuncu · **Aşıklar** artık TrollHacks / debug panelinden de seçilir (çift bağla / kaldır) · **elektrikli sopa** daha hızlı (bekleme 1,6 → 0,8 sn) · merdivende **baktığın yöne göre** tırmanış (yukarı bakıp W = yukarı, aşağı bakıp W = aşağı; yalnızca dikey hareket) · **Ayarlar → Mobil:** mobil kontrolleri aç / kapa, düğme boyutu / saydamlığı / bakış hassasiyeti, **sabit (kilitli) ya da serbest joystick** + **koşu kilidi**, **düğme düzenleyici** (sürükle, boyutlandır, gizle, sıfırla) · sağ altta **tam ekran düğmesi** (menülerde de) · **düzeltmeler:** mobilde **"Baiter ver"** çalışmıyordu (dokunmatik katman listeyi yutuyordu) · **Uyurgezer** artık dünyanın dışına ışınlanmıyor (rastgele varış noktası duvar / ev dışı için doğrulanır, geçersizse doğma noktasına düşer).
**v4.6'da eklenenler:** **Aşık artık birincil rol** (ikincil değil): lobideki **Rol ayarları**nda diğer roller gibi durur (Kapalı / Otomatik / Max 1–3 **çift**), **2 kişilik çift** olarak verilir ve koltuk alır (eşsiz Aşık kalmaz); ikisi de Masum Takımdadır, biri ölürse diğeri de ölür · debug / TrollHacks rol listesinde de **Aşık** var (rolü Aşık yapılanlar otomatik eşlenir) · yeni gizli eşya **Sniper tüfeği** (anında vuran ışın, tek atışta öldürür, 5 mermi, 120 m; **sağ tık basılı = dürbün / zoom**, mobilde **Dürbün** düğmesi) ve **6. eşya slotu** · **Umacı dalgalanması** artık sahne ışığıyla aydınlanan çok saydam bir malzeme: **karanlıkta görünmez**, ışıkta çok hafif belli olur (`abilities.umaci.shimmer`) · **Uyurgezer** ışınlanması yenilendi: odanın içinde ışınlarla geçerli nokta aranır, olmazsa başka oda denenir; yalnızca hiçbir odada yer yoksa doğma noktasına düşer (tarayıcı konsolunda `[Uyurgezer] … geçerli nokta bulunamadı (…)` uyarısı yazar).

---

## 1. Kurulum ve çalıştırma

Bu sürüm **statik web sitesi** olarak çalışır; `npm install`, `npm start`, Node.js oyun sunucusu veya `/ws` endpoint'i gerekmez.

- Geliştirme için proje klasörünü VS Code **Live Server** ile açabilirsin. `file://` üzerinden doğrudan açma; ES modülleri ve CDN importmap'i HTTP/HTTPS ister.
- Tek kişilik **Debug haritası** internet istemez (ağ kurmaz), ama sayfa yine de bir HTTP(S) adresinden açılmalıdır (Live Server yeterli).
- Odayı kuran kişi **host** olur. Host'un tarayıcısı oyun mantığını çalıştırır; oyuncular PeerJS DataConnection üzerinden doğrudan host'a bağlanır.
- Host oda açınca lobide görünen 5 karakterli kodu arkadaşlarına verir. Katılanlar yalnızca bu kodu girer; herkese açık oda listesi yoktur. Lobideki büyük koda tıklayınca **`sayfa#KOD`** biçiminde bir davet bağlantısı kopyalanır (örn. `https://kullanici.github.io/irgat/#K7X2M`); bağlantı açılınca kod "Odaya katıl" kutusuna kendiliğinden yazılır. (`?oda=KOD` yerine `#KOD` kullanılır: GitHub gibi siteler `?` ile gelen parametreyi kabul etmeyebilir.)
- **Host oyundan/sekmeden çıkarsa oda kapanır.** Sunucusuz mimaride host devri ve otomatik oda kurtarma yoktur.

### İnternetten arkadaşlarla oynamak (sesli)

1. Klasörü **HTTPS** veren bir statik hosta yükle (GitHub Pages, Netlify, Cloudflare Pages vb.). Herkes aynı adresi açar. Mikrofon yalnızca HTTPS veya `localhost` üzerinde çalışır.
2. Biri **Oda oluştur** der, lobideki kodu arkadaşlarına yollar; onlar **Odaya katıl** ile kodu girer.
3. Sesli modda tarayıcı mikrofon izni ister. Mikrofon cihazını **Ayarlar → Mikrofon** bölümünden seçersin (dahili / kulaklık / harici).

**Sesler birbirine ulaşmazsa (TURN):** PeerJS Cloud yalnızca bağlantıyı kurdurur; ses WebRTC ile doğrudan oyuncular arasında akar. Çoğu ev ağında Google STUN yeterlidir (`config.js → STUN_SERVERS`). Sıkı NAT, okul/şirket ağı veya bazı mobil ağlarda doğrudan bağlantı kurulamaz; o zaman bir **TURN** rölesi gerekir. Ücretsiz bir seçenek **Metered Open Relay**: ayda 20 GB ücretsiz TURN kullanımı sunar, ücretsiz hesap açıp API anahtarı almanı ister ([metered.ca/tools/openrelay](https://www.metered.ca/tools/openrelay/)).

1. metered.ca'da ücretsiz hesap aç, bir uygulama (app) oluştur; panelden TURN bilgilerini (ya da `https://<uygulamaadı>.metered.live/api/v1/turn/credentials?apiKey=<ANAHTAR>` adresinden dönen `iceServers` listesini) al.
2. `turn:` ile başlayan satırları `js/config.js → TURN_SERVERS` listesine yapıştır, örn.:
   ```js
   export const TURN_SERVERS = [
     { urls: 'turn:<sunucu>:80', username: '<kullanıcı>', credential: '<parola>' },
     { urls: 'turn:<sunucu>:443?transport=tcp', username: '<kullanıcı>', credential: '<parola>' },
   ];
   ```
3. Siteyi yeniden yükle. Hem oyun bağlantısı hem ses aynı listeyi kullanır; **herkesin aynı sürümü açması** yeterlidir.

> Statik sitede bu bilgiler tarayıcıya açıktır; yalnızca arkadaşlarınla paylaştığın ücretsiz katman anahtarını koy, ücretli bir anahtarı koyma.

---

## 2. Kontroller

Tüm tuşlar **Ayarlar → Tuşlar** bölümünden değiştirilebilir (bir eyleme tıkla, yeni tuşa bas; aynı tuş başka eylemdeyse ikisi yer değiştirir). Aşağıdakiler varsayılanlardır.

| Tuş | İşlev |
|---|---|
| **W A S D** | Hareket · **Shift** koş · **Boşluk** zıpla · **Ctrl** (basılı) **eğil** · merdivene değip **W / Boşluk** basılı tut: **tırman** (v4.5: **baktığın yöne göre** — yukarı bakıp W yükselir, aşağı bakıp W iner; **S** tersine; **Ctrl** bırakır) |
| **Fare** | Bakış (birinci şahıs; üçüncü şahıs kamera yoktur) |
| **E** | Baktığın şeyle etkileşim: kapı, şalter, buton, **eşya al/bırak**, **ceset tut/bırak** (bakılan uzuvdan) |
| **1 / 2** | Boş el / Ekipman (silah, bıçak, elektrikli sopa) · **3 / 4 / 5 / 6** debug'dan verilen **gizli eşyalar** (verilme sırasına göre; aşağıda "Gizli eşyalar") |
| **Sol tık** | Ekipmanla saldır · eşya tutuyorsan **fırlat** · boş elle tabloya tıkla |
| **Sağ tık** | Katilde bıçak fırlat · eşya tutuyorsan **döndür** (basılı tut + fare) |
| **R** | Doldur (reload) |
| **X** | Özel yetenek · **S2G**: gece bir kişiye bakıp (1 m) **basılı tut** |
| **F** | Fener aç/kapat |
| **Q** (basılı) | Dairesel ses menüsü: fareyi bir seçeneğe çek, Q'yu bırak · çalan ses bitene kadar o seçenek **kilitlidir** (gri), tekrar basılamaz |
| **TAB** (basılı) | Oyuncu listesi: ad, konuşma ışığı, durum (**kimsenin rolü görünmez**) · katil bir satıra **sol tıklayınca** "Baiter ver" menüsü açılır |
| **V** | Bas-konuş · **M** mikrofon aç/kapa · **sessiz modda** yalnızca **dedektif** konuşur: V gerekmez, mikrofon açıkken konuşur |
| **C** (basılı) | **Ses seviyesi dairesi:** C'ye basılı tut → 3 seçenekli daire açılır (solda **Fısıltı** 3 m · üstte **Normal** 8 m · sağda **Bağırma** 18 m); fareyi bir seçeneğe çek, C'yi bırak → seviye seçilir (tuşa basıp bırakmak artık seviye değiştirmez). Sessiz modda dedektifin yalnızca **Normal / Bağırma** seçeneği vardır. |
| **Enter** | Sohbet · ölüyken izlerken: **sol tık / →** sonraki, **sağ tık / ←** önceki oyuncu · **Esc** duraklat |
| **F2** | Debug paneli (debug odasının host'unda) · normal oyunda konsola `TrollHacks.enabled = true;` yazınca **TrollHacks paneli** (bölüm 4) |

### Mobil (dokunmatik) kontroller (v4.4; kişiselleştirme v4.5)

Dokunmatik cihazda (telefon / tablet) arayüz **kendiliğinden** açılır. Masaüstünde denemek için **Ayarlar → Mobil → Mobil kontroller → Açık** ya da adrese `?touch=1` ekle (`?touch=0` kapatır). Oyun **yatay** ekranda oynanır (dikeyde "Telefonu yatay çevir" uyarısı çıkar). Hepsi **yalnızca UI katmanıdır**: oyun mantığı değişmez; düğmeler sanal tuş / sanal fare basar (`input.js` köprüsü), bu yüzden menüler, dairesel menüler, oyuncu listesi ve sohbet masaüstüyle **aynı kodla** çalışır. **Çoklu dokunuş:** her parmak ayrı izlenir (aynı anda yürü + bak + ateş et + zıpla). Her ölçü `--u` biriminde (ekran yüksekliğinin %1'i; 16:9'dan dar ekranda genişliğe göre) olduğu için düğmeler **her ekranda aynı oransal büyüklükte** görünür.

| Bölge / düğme | İşlev |
|---|---|
| **Sol yarı (sürükle)** | Yüzen analog çubuk (Ayarlar → Mobil'den **sabit / kilitli** yapılabilir): parmağını koyduğun yerde belirir; **ucuna kadar it → koşar**, daha az it → yürür |
| **Sağ yarı (sürükle)** | Bakış (Ayarlar'daki hassasiyet çarpanı geçerli). Ölüyken: **dokun** → izlemeye geç (geri dönüş yok), izlerken **dokun = sonraki oyuncu** (◀ ▶ düğmeleri: önceki / sonraki) · **iki parmak** → uzaklaştır / yakınlaştır |
| **Ateş** (sağ alt, büyük) | Sol tık: saldır / ateş / eşya fırlat. **Basılı tutup kaydırırsan** nişan da alırsın |
| **Zıpla · Eğil** | Eğil **aç/kapa** düğmesidir (dokun: eğil, tekrar dokun: kalk) |
| **Etkileşim** (turuncu; bir şeye bakınca belirir) | E: kapı, eşya al/bırak, ceset tut… düğmenin yazısı ne yapacağını söyler |
| **Fırlat / Döndür · Doldur · Yetenek** | Sağ tık (bıçak fırlat; eşya tutarken **basılı tut + öbür parmakla kaydır = döndür**) · R · X — yalnızca işe yaradıklarında görünür |
| **Alt orta çanta çubuğu** | El · ekipman · gizli eşyalar (1–5) |
| **Sol kenar** | Fener · mikrofon (sesli modda bas-konuş **aç/kapa**; "açık mikrofon" ayarındaysa sustur/aç) |
| **Sağ üst** | ☰ duraklat / ayarlar · sohbet · oyuncu listesi (aç/kapa; kapatmak için boş yere dokun) · **Ses** ve **Seviye** (**basılı tut, parmağı kaydır, bırak** = Q / C dairesi) |
| **Sağ alt köşe** | **Tam ekran** düğmesi (menülerde de görünür). iPhone Safari tam ekran API'sini desteklemez: ipucu çıkar ("Ana Ekrana Ekle" ile tam ekran oynanır) |

Ayarlamak için: `js/touch.js` başındaki `LOOK_GAIN` (bakış hızı), `STICK_R` (çubuk boyu), `RUN_AT` (koşma eşiği); düğme yerleri / boyları `style.css` içindeki `.tb-*` satırları (birim `--u`); hangi düğmenin ne zaman göründüğü `js/touchButtons.js`.

**Ayarlar → Mobil (v4.5):**
* **Mobil kontroller:** Otomatik / Açık / Kapalı. Kapalıyken ekran düğmeleri kalkar (tabletle klavye + fare kullanırken işe yarar); telefonda kapatırsan geri açmak için ana menü → Ayarlar → Mobil.
* **Düğme boyutu · saydamlık · bakış hassasiyeti** kaydırıcıları: anında uygulanır, tarayıcıda saklanır.
* **Joystick:** **Serbest** (parmağın nereye değerse orada çıkar) ya da **Sabit / kilitli** (hep aynı yerde durur; yalnızca tabanına dokununca tutulur, ekranın geri kalanı bakış alanıdır; yeri ve boyutu düzenleyiciden ayarlanır). **Koşu kilidi:** çubuğu sonuna itince başlayan koşu, çubuk merkeze yaklaşana kadar sürer (parmağı uçta tutmak gerekmez).
* **Düğme düzenini düzenle:** tüm düğmeler görünür; **sürükleyerek taşı**, dokunup seç → **− / +** ile boyutlandır (%50–%220), **Gizle / Göster**, **Sıfırla**, **Bitti**. Menü (☰) düğmesi ve joystick gizlenemez (ayarlara dönüş yolu kapanmasın). Konumlar `--u` biriminde saklanır: her ekranda aynı oransal yerde durur; çanta çubuğu tek parça taşınır.
* Varsayılanlar: `js/touch.js → TOUCH_DEFAULTS`; kayıt: `ctx.settings.touchUI` (tarayıcıda).

**Bakışa göre etkileşim:** Etkileşim ve eşya alma mesafeye göre değil **nişangâhın baktığı nesneye** göre çalışır. Ekranın ortasındaki nokta, bir şeye bakınca halkaya dönüşür ve altta ne yapacağın yazar. Duvarın arkasındaki şeyler seçilemez. Azami erişim `config.js → GAME_CONFIG.interaction.reach` (3,2 m).

**Eşya taşıma:** Normal eşyalar (`Grab_*`) **ağır değildir**: taşırken yavaşlamazsın (`grab.weightSlow` = 0) ve eşya **tam nişangâhın hizasında**, baktığın yönde durur (`grab.holdDrop` = 0); nişangâhın altında asılı kalmaz. Duvara yaklaşınca eşya gözden en az `minWallClearance` kadar uzakta kalır, duvarın içine girmez. Ağır olan yalnızca **cesetlerdir** (aşağıda).

**Eğilme (Ctrl, basılı tut):** Göz 1,05 m'ye iner, çarpışma kapsülü 1,25 m olur, yarı hızda yürürsün (alçak geçitlerden geçilir). Başının üstünde tavan/engel varsa Ctrl'yi bıraksan da **kalkamazsın**; boşluğa çıkınca kalkarsın. Diğer oyuncular modelinin çömeldiğini görür. Ayarlar: `GAME_CONFIG.player.crouchHeight / crouchEyeHeight / crouchSpeed / crouchBlend`. Tuşu **Ayarlar → Tuşlar → Eğil** bölümünden değiştirebilirsin.

**Kayma yok, merdiven otomatik:** Eğimli zeminde ve kenarlarda **kaymazsın**; hareket anlıktır (buz gibi atalet yok), bıraktığın anda durursun. `player.stepHeight` (0,5 m) kadar yüksek basamaklar, merdivenler ve rampalar **kendiliğinden** çıkılır; inerken zemine yapışırsın (`snapDown`), sekmezsin. Zıplamak gerekmez. Yürünebilir eğim sınırı `player.walkableY` (≈ 56°). Havadayken zıpladığın yöndeki momentum korunur.

**Merdiven (`Ladder_*`):** Blender'da bir nesneye `Ladder_01` de; o nesne **tırmanılan merdiven** olur (kendisi katı değildir, içinden geçilir; tırmanma kutusu nesnenin kendi sınır kutusudur, döndürülmüş de olsa doğru çalışır). Tırmanmak için merdivene **değmen** (kapsülün kutuya `ladder.touchMargin` = 0,22 m yaklaşması), merdivene **dönük** olman ve **W** (ya da **Boşluk**) **basılı tutman** gerekir; yanından geçerken kapmaz.
* Tırmanırken **W / Boşluk** yukarı, **S** aşağı, **A / D** yana (yavaş); hiçbir şeye basmazsan olduğun yerde **asılı kalırsın** (düşmezsin). **Ctrl** (eğil), merdivenden uzaklaşmak ya da yana taşmak seni **bırakır** (düşersin); zemine inince tırmanma biter.
* **Tepeye** gelince (ayakların tepenin `topMargin` = 0,3 m altına çıkınca) **W / Boşluk** ile merdivene doğru **küçük bir sıçrama** yaparsın → platforma / üst kata çıkarsın. Merdiveni, çıkılacak yüzeyin biraz (≈ 0,25 m) üstünde bitir. Platformun **üstündeyken** (ayakların tepenin 0,3 m altına inmemişse) merdivene tutunmazsın; **inmek için** kenardan atla / düş, merdivene dön ve **W / Boşluk** basılı tutarak havada yakala, sonra **S** ile in.
* Mesh'i olmayan (Empty) merdiven de olur: kutu = Empty'nin ölçeği (yarı boyut), ya da özel özellik `size: [genişlik, yükseklik, derinlik]`.
* Ayarlar: `GAME_CONFIG.ladder` (`speed`, `strafeSpeed`, `touchMargin`, `faceDot`, `stick`, `topMargin`, `exitSpeed`, `exitUp`, `regrabDelay`). Tırmanma yalnızca yerel oyuncuda hesaplanır; diğerleri seni yukarı kayarken (yürüme animasyonuyla) görür.

**Serbest dönen tablolar (`MidPaint_*`):** `Painting_*` tablolar kayarak açılır; `MidPaint_01` (ya da `MidPoint_1`, `Mid_Painting_01`) ise **pivotu etrafında serbestçe döner**. **Pivot = nesnenin orijini**: Blender'da orijini plakanın **ortasına** koy (*Object → Set Origin → Origin to Geometry*); harita raporu ortada değilse uyarır. **Varsayılan olarak yalnızca kendi dikey (Y) ekseni etrafında döner** (kendi etrafında, döner kapı gibi; öne / yana devrilmez). `axis: 'free'` ile her yöne, `'normal'` ile duvardaki tablo gibi tekerlek şeklinde de döndürebilirsin.
* **Oyuncu itince:** plakaya **değip** üstüne doğru yürürsen dönmeye başlar. Dönüş **nereden değdiğine** (pivottan uzak noktadan itersen kolay, tam ortadan itersen çok az döner), **hızına** (yürürken yavaş, **koşarken hızlı**) ve plakanın **kütlesine** göre olur. Yüzeyde yana doğru sürtünerek yürürsen plakayı sürükler (duvara yapışık tabloyu tekerlek gibi çevirir). Plakaya yaslanıp dururken de itişin hesaba katılır.
* **Eşyalar da döndürür:** atılan ya da düşen bir eşya (`Grab_*`) plakaya çarparsa darbe verir: eşyanın **ağırlığı × çarpma hızı**, çarptığı noktaya göre döndürür. Yatan / yavaş değen eşya (`itemMinSpeed` altı) döndürmez.
* Sürtünmeyle yavaşlar ve **durduğu yerde kalır** (isteğe bağlı `restoreSpring` > 0 ile ilk duruşuna döner). **Katıdır**: içinden geçilmez, dönerken **duvara / zemine / kapıya girmez** (çarpınca yavaşça geri seker), dönen plaka oyuncuyu iter.
* **Nesne başına ayar** (Blender özel özelliği ya da `OBJECT_OVERRIDES`): `mass` (kütle), `damping` (sönüm), `maxSpin` (en yüksek dönüş hızı), `restoreSpring`, `axis`: `vertical` / `y` (yalnız dikey eksende: döner kapı gibi — **varsayılan**, `GAME_CONFIG.midPaint.axis`) · `free` (her yöne serbest) · `normal` (yalnız yüzeye dik eksende: duvardaki tabloyu **tekerlek** gibi çevirir) · `[x, y, z]` (kendi eksenin).
* Fizik **yalnızca host'ta** hesaplanır; durum ~15 Hz herkese yayınlanır, istemciler yumuşatır. Genel ayarlar: `GAME_CONFIG.midPaint` (`mass`, `damping`, `playerPush`, `playerGrip`, `friction`, `centerBias`, `itemPush`, `itemMinSpeed`, `restitution`, `blockByWorld`, `netHz` …).

**Tablolar katıdır:** Hem kayan `Painting_*` hem dönen `MidPaint_*` tabloların kendi mesh'i çarpışma olarak kullanılır: içlerinden **geçilemez**; kayan tablo hareket ederken çarpışması da onunla birlikte gider. Tabloya doğru atılan eşyalar, bıçak/mermi ve fener ışığı da tabloda durur. (Tablonun bir mesh'i olmalı; mesh'siz Empty'de çarpışma olmaz.)

**Ctrl+W (sekme kapanması):** Eğilme tuşu Ctrl olduğu için "ileri + eğil" yanlışlıkla Ctrl+W olabilir. Tarayıcılar sayfanın bu kısayolu engellemesine izin vermediği için üç katmanlı koruma vardır (`js/tabGuard.js`):
1. Oyuna girince (ekrana tıklayınca) **tam ekran + klavye kilidi**: kısayollar sayfaya gelir, sekme **kapanmaz** (Chrome / Edge / Brave gibi Chromium tarayıcılar).
2. Kısayol yine de tarayıcıya ulaşırsa (Firefox / Safari / tam ekran dışı) "Sayfadan ayrılmak istiyor musun?" sorusu çıkar → **İptal**.
3. Oyun sırasında Ctrl + harf kısayolları (kaydet, yazdır, bul…) devre dışıdır (yazı yazarken değil).

Tam ekranı istemezsen **Ayarlar → Genel → "Ctrl+W sekmeyi kapatmasın"** kutusunu kapat (varsayılan: açık). Eğil tuşunu Ctrl dışında bir tuşa da atayabilirsin.

**Karakter modeli:** Oyuncular artık cesetlerle **aynı insan modelidir**: kafa, gövde, kollar, bacaklar. Yürürken/koşarken bacaklar adım atar (zemine basan IK), kollar karşı yönde sallanır, eğilince model çömelir, elindeki ekipman sağ elde durur ve bakış yönüne göre kalkar. Ceset olunca aynı model fizikle yığılır. Kodu: `js/humanAvatar.js` (görünüm/animasyon) + `js/avatarPose.js` (tutuşlar, saldırı hareketleri) + `js/ragdoll.js` (ölçüler `TEMPLATE`).
* **Renkler:** yalnızca **üst** (gövde + kollar) oyuncunun rengindedir (sesli modda Irgat grisi, dedektif mavi, sessiz modda kod adı rengi); **bacaklar her zaman gri**; **kafa ve eller açık ten ya da kahverengi** (oyuncuya göre sabit; ceset yaşarkenki renginde yığılır). Renk listesi: `ragdoll.js → SKIN_TONES`, `LEG_GRAY`.
* **Tutuşlar ve hareketler:** taramalı, tabanca, plazma tüfeği, sniper ve roketatar **iki elle** tutulur (duruş hafif alçalır, gövde ve kafa öne eğilir: tehditkâr duruş); bıçak gövdenin yanında, ucu öne eğik tutulur ve **saplama** hareketi yapar; elektrikli sopa tek elde, kalkık tutulur ve vuruşta savrulur; ateş edince **geri tepme**, bıçak fırlatınca ve bomba koyunca ayrı hareketler çalışır. Havada, tırmanırken, koşarken ve eğilirken ayrı duruşlar; dururken nefes alma. Tutuş ayarları: `avatarPose.js → HOLDS` (omuza göre konum, eğim, hangi elin boşta kalacağı); birinci şahıs elleri: `equipment.js → GRIPS`.
* **Cesetler kendi içinden geçmez:** ragdoll uzuvları birbirine ve gövdeye girmez (uzuv–uzuv itme), yığılırken kollar / bacaklar gövdenin içine saplanmaz.

**Ekran yazıları (HUD):**
* **Sol alt:** oyundaki adın, **kendi rengiyle** (sesli modda gri "Irgat"; dedektifsen mavi "Dedektif"; sessiz modda kod adın, örn. "Echo", rastgele rengiyle) ve can çubuğu.
* **Sağ alt:** rolün. **Baiter** ikincil roldür: ana rolünün yanında ayrı etiket olarak görünür (örn. `Sivil` `Baiter`). **Aşık** (v4.6) ana roldür; sevgilin ayrı etiketle yazar (`Aşık` `♥ Aşkın: Ayşe`). Katil Baiter seçince seçilen kişide ekranda **"Baiter atandı"** başlığı ve altında *"Baitersın, amacın dedektifi kandırıp katile yardım edip katilin kazanmasını sağlamak"* yazar.
* **Nişangâhın altı:** baktığın oyuncunun ya da **cesedin** adı, küçük ve o kişinin renginde (renk adı yazılmaz: "Mavi Echo" değil **"Echo"**, mavi yazıyla). `lookName.showTime` (2,5 sn) sonra ya da başka birine bakınca kaybolur/değişir. Duvarın arkasındakinin adı görünmez; menzil `lookName.range` (14 m).
* **Kimlikler:** Dedektif herkese **mavi "Dedektif"** olarak görünür (herkes onun kim olduğunu bilir). Diğer herkes sesli modda gri **"Irgat"**, sessiz modda **rastgele renkli kod adıdır** (mavi dışında; kod adlarında renk adı yazmaz). Gerçek oyuncu adları yalnızca tur başı rol ekranında ve TAB listesinde görünür.
* **Tur başı siyah ekran (5 sn, `rounds.roleRevealTime`):** Üstte **rolün**; altında bildiğin kişiler (`Dedektif: Ayşe`, katilsen `Mafya: Ali`, `Baiter: …`, aşıksan `Aşkın: Zeynep`); ortanın altında **rol açıklaması** (örn. *"Silahın var, gece odaları gez, sorgula ve katili bul"*). Süre dolunca oyun başlar.
* **Uyurgezer** uyuyunca ekran tamamen kararır ve **"Uyuyorsun…"** yazar; uyanınca (ışınlanınca) açılır.
* **TAB listesi:** yalnızca oyuncu **adı**, konuşma ışığı ve **durum** (Hayatta / Ölü / İzleyici / Lobide) gösterir. **Hiç kimsenin rolü, Baiter'ı ya da sevgilisi gösterilmez** (ölüler ve tur sonunda da); kendi rollerin sağ altta, herkesin rolü tur sonu tablosunda görünür.

**Ceset taşıma:** Ölen oyuncu bir **ragdoll**a dönüşür; yere yığılır, duvara/kapıya çarpar, yürüyen oyuncular onu iter, patlama onu savurur. Cesede bakıp **E**'ye basınca **baktığın uzuvdan** (kol, bacak, baş, gövde) tutarsın. Eşyadan çok daha zordur:
* çok **yavaş** yürürsün; koşamaz ve zıplayamazsın (`corpse.carrySpeed`),
* tuttuğun uzuv zeminden en fazla ~0,75 m kalkar ve sana **sınırlı hızla** gelir (`corpse.maxLift`, `pullSpeed`) → sürüklenen ağır bir yük gibi hissedilir,
* **cesede bakmayı bırakırsan** (bakışın tuttuğun uzuvdan ~35°'den fazla sapar, ya da uzuv çok uzaklaşırsa) ceset **elinden düşer**; **E** ile de bırakırsın. Kafayı hızlı çevirmek de cesedi düşürür.

**Oyuncu çarpışması:** Canlı oyuncular birbirinin **içinden geçemez**. Tek istisna turun **ilk 10 saniyesidir** (`player.ghostSeconds`; doğma noktaları çakışabilir).

**Duvardan geçme koruması (v4.1):** Oyuncu **dikey bir silindirdir** (yarıçap 0,32 m × boy 1,75 m; eğilince 1,25 m; v4.4: kapsülün yuvarlak uçları dikeyde yassıltıldı = düz taban / tavan, `collision.capFlat` = 4; `1` yazarsan eski kapsül) ve şu katmanlarla duvara / zemine / tavana karşı korunur (`js/collision.js`, ayarlar `GAME_CONFIG.collision`):
* **Kesişme düzeltmesi:** Kapsülün ekseni bir yüzeyin *içinden* geçmişse (ince zemin, döşeme, tavan) kütüphanenin en yakın nokta hesabı bunu görmüyordu ve oyuncuyu yüzeyin *öbür tarafına* itebiliyordu; artık doğru yana çıkarılır.
* **Küçük alt adımlar:** Hareket, her biri en çok yarıçapın yarısı (`collision.substep`) kadar adımlara bölünür; hızlı koşu / düşüş ince bir duvarı atlayamaz.
* **Zemine adım adım iniş:** Yürürken kapsül önce basamak payı kadar (tavan varsa tavana kadar) kalkar, yatay hareket eder, sonra zemine DEĞENE kadar küçük adımlarla (`collision.descend`) iner → kapsül zeminin / döşemenin içine hiç girmez; kenardan çıkınca 0,5 m'lik ani aşağı sıçrama da olmaz.
* **Duvar geçme kilidi (`collision.crossGuard`):** Her alt adımdan sonra kapsül ekseninin üç noktası (ayak küresi, orta, baş küresi) için eski→yeni konum arasına ışın atılır; statik dünyada bir yüzeyi *kesiyorsa* o adım **geri alınır**. Başka hiçbir şey duvarı kaçırsa bile oyuncu içine giremez.
* **Hareketli nesneler (kapı, kafes, hareketli duvar, tablo):** Blender'da ölçeği **uygulanmamış** (`S` ile çekilmiş, x/y/z ölçeği farklı) nesnelerde çarpışma payı eskiden neredeyse sıfıra düşüyordu (ince kapı / tablo / duvardan geçilirdi); artık ölçek çarpışma gövdesine işlenir.
* **Merdiven:** Duvarın öbür yanındaki merdivene tutunulmaz. **Kamera:** yakın düzlem 0,05 m; duvara yaslanıp geniş açıyla yan bakınca duvarın içi görünmez.

Hâlâ bir duvarın içinden geçiyorsan o duvarın **çarpışması yok** demektir: **F2** panelindeki **"Çarpışma görünümü"** düğmesi (debug odası ya da TrollHacks) oyuncunun gerçekten çarptığı yüzeyleri görünür yapar (**yarı saydam turuncu** dolgu + kenar çizgisi: duvar / zemin / merdiven; **mavi tel kafes**: kapı / tablo / hareketli duvar). Turuncu dolgusu olmayan duvarın Blender'da adını `Collision_...` yap (ya da yanına aynı şekilde bir `Collision_` kutusu koy). Harita raporu da (F2 → *Harita raporu*) "ÇARPIŞMASI OLMAYAN büyük görünür mesh'ler" diye bu duvarları adlarıyla listeler.

**Kapılar:** Kapı açıkken bile içinden geçilmez (açık kapı kanadı da katıdır). Kapı hareket ederken bir oyuncuya çarparsa **geri döner** (açılıyorsa kapanır, kapanıyorsa açılır) → kapıyla kimse sıkışmaz.

**İdam alanı:** `Execution_Lever` bir **şalterdir** (buton değil): bir kez çekersen **AÇIK** kalır, tekrar çekene kadar `DeathZone` içindekilere **sürekli hasar** verir (varsayılan 0,5 sn'de bir 10 hasar). Alan açıkken kırmızı parlar. Ayarlar: `GAME_CONFIG.execution`.

**Fener (F):** Fener ışığı **duvardan geçmez**. Orta/Yüksek kalitede gerçek gölge haritası kullanılır; **Düşük** kalitede gölge yoktur, onun yerine ışığın menzili baktığın duvara göre kısılır. Fener yalnızca **ışık** olarak görünür: başka oyuncuların başında görünür bir ışık konisi yoktur (v4.3.1). Kalite ayarı sayfa yenilenince tam uygulanır.

**Işıklar (v4.3):** Haritada kaç ışık olursa olsun aynı anda yalnızca sana **en yakın** N tanesi gerçek ışık olarak çizilir (N = kalite ayarı: `config.js → QUALITY_PRESETS.maxLights`); yuvalar yumuşakça yanıp söner, ışık sayısı sabit kaldığı için takılma olmaz (önceden sıradaki ilk N ışık gerçekti). Oda ışıkları **kapalıyken** çok az **yakın görüş** vardır (`lights.nearVision`: kameraya bağlı sönük ışık; v4.3.1'de `distance` 8 → **4 m**'ye indi; `intensity` / `distance` ile ayarla, `intensity: 0` kapatır) ve ortam ışığı biraz artırıldı (`lights.ambientOff`). **Ayarlar → Genel → "Işık efektleri"** kutusunu kapatırsan oda lambaları ve yakın görüş ışığı çizilmez, ortam **düz aydınlatılır** (`lights.flat`): oda ışıkları yanıkken parlak (`intensity`), **kapanınca yine karanlık** (`darkIntensity` + yoğun sis `fogDark`; karanlıkta görüş mesafesini sis belirler), FPS belirgin artar; fener çalışmaya devam eder (anahtarı değiştirirken kısa bir takılma olabilir). Gece / gündüz kuralları (Medyum, S2G) bundan etkilenmez. Uzak oyuncuların fener gölge haritaları iki karede bir yenilenir.

---

## 3. Roller ve ekipmanlar

Roller her turda rastgele dağıtılır ve **gizlidir**. Herkes yalnızca kendi rolünü görür; katil takımı birbirini, sevgililer birbirini, ölüler herkesi görür. **Tek istisna Dedektif'tir: onun kim olduğunu herkes bilir** (mavi "Dedektif").
**Zorunlu roller:** **Katil** ve **Dedektif** her turda **mutlaka** vardır: host rol ayarlarında kapatamaz, "Otomatik" olsa bile en az 1 tane çıkar (`roles.js → MANDATORY_ROLES`; dedektif için en az 2 oyuncu gerekir). Diğer roller isteğe bağlıdır ve host tarafından açılıp kapatılır (aşağıda).
Kimse rolünü yapmak zorunda değildir: bu bir arkadaş oyunu, kodda rol dışına çıkmayı engelleyen hiçbir şey yok (örn. Baiter seçilen kişi görevi yapmayabilir).
**Rollerin kullanım hakkı (sınırı) yoktur**; yeteneklerin yalnızca bekleme süreleri (ve S2G / Umacı'da gece başına 1 kez kuralı) vardır.

**Rol açıklamaları** (tur başı siyah ekranda ve `roles.js` içinde, kendi dilinle değiştirebilirsin):
* Dedektif: *"Silahın var, gece odaları gez, sorgula ve katili bul."*
* Mafya: *"Tüfeğin var, gece odandan çıkıp bir odayı tarayıp kaç, tünellere girmen yasak."*
* Sivil Polis: *"Elektro şokun var, gece tünellerde gez ve katili bulmaya çalış."*
* Aşık: *"Bir sevgilin var: adı sağ altta ve bu ekranda yazar. Biriniz ölürse diğeriniz de ölür. İkiniz de Masum Takımdasınız: birlikte katili bulun ve hayatta kalın."*
* Baiter: *"Baitersın, amacın dedektifi kandırıp katile yardım edip katilin kazanmasını sağlamak."*

| Rol | Takım | Ekipman / yetenek |
|---|---|---|
| **Katil** | Katil | **Bıçak:** sol tık vurur (menzil **1,5 m**), sağ tık **fırlatır** (tek bıçak). Alınmazsa **2 dk sonra geri gelir ve zorla eline çekilir.** TAB'dan **Baiter** verebilir. |
| **Mafya** | Katil | **Taramalı:** iki elle tutulur; 30 mermilik şarjör, mermi başına 15 hasar, menzil **25 m**; mermi bitince otomatik (veya **R** ile) reload (2,6 sn). |
| **S2G** | Katil | **Gece başına 1 kez**, **yalnızca gece** (ışıklar kapalıyken): bir oyuncunun **1 m** yakınına git, ona **bak** ve **X'i basılı tut** (varsayılan **1 sn**, `abilities.s2g.holdTime`). Basılı tutarken yakındakiler **fermuar sesi** (`zip.mp3`) duyar, ortada ilerleme çubuğu dolar. Süre dolunca baktığın kişi **ölür**, `s2g.mp3` çalar ve **cesedi** ses bitene kadar her **0,25 sn**'de bir hafifçe **zıplar** (`jumpInterval`); ses bitince zıplama durur. Tuşu erken bırakırsan, hedeften uzaklaşırsan ya da bakışını kaçırırsan sayaç sıfırlanır ve hak **harcanmaz**. Elinde eşya/ceset varken kullanılamaz. |
| **Dedektif** | Masum | **Tek mermili tabanca:** iki elle tutulur, menzil **25 m**, her atıştan sonra reload (3 sn). **Zorunlu rol**; herkes onun dedektif olduğunu bilir. Sessiz modda **tek konuşabilen** oyuncudur (aşağıda). |
| **Sivil Polis** | Masum | **Elektrikli sopa:** (kauçuk saplı, uçta elektrotlar ve parlayan mavi akım) vuruş başına 35 hasar → **3 vuruşta öldürür**, vurulanı kısa süre sersemletir; menzil **1,8 m**; vuruşlar arası bekleme **0,8 sn** (v4.5; `equipment.taser.cooldown`). |
| **Sivil** | Masum | Yeteneği yok. |
| **Eskort** | Masum | **Yalnızca bilgilendirme rolü:** özel yeteneği ve kullanım hakkı yoktur. |
| **Uyurgezer** | Masum | **X:** 5 sn **uyur**: ekran **tamamen kararır, "Uyuyorsun…" yazar**, hareket edemez; sonra rastgele bir odaya ışınlanır ve ekran açılır (v4.5: varış noktası duvar / ev dışı için doğrulanır). **1 dk bekleme.** |
| **Bombacı** | Masum | **X:** düğmeye basınca **anında** patlar (bekleme yok); **4,5 m** içindeki **herkesi** (kendisi dahil) öldürür. |
| **Medyum** | Masum | **X:** yalnızca **gece** (ışıklar kapalıyken) bir oyuncu seç → onu mesafeden bağımsız duyarsın; karşılıklı ya da tek yönlü olabilir. **Sabah ışıklar açılınca bağlantı kendiliğinden kesilir.** **Her gece yalnızca 1 kişi için** kullanılır (v4.4): o gece seçtiğin kişiyi açıp kapatabilirsin ama başka birini seçemezsin; ertesi gece hakkın yenilenir. Yalnızca sesli modda işe yarar. |
| **Umacı** | Masum (varsayılan; `roles.js → UMACI_TEAM`) | **X (v4.5):** yalnızca **gece** (ışıklar kapalıyken), **her gece 1 kez**: **60 sn görünmez** olur ve **oyuncuların içinden geçer** (onlar da senin içinden geçer). Hareketsizken gövdesi **hiç çizilmez**; **hareket edince** Dead by Daylight'taki Wraith gibi vücudunda yarı saydam bir **dalgalanma (shimmer)** belirir. Görünmezken adı okunmaz ve feneri başkalarına görünmez; yine de vurulabilir. Ölünce ya da tur bitince görünmezlik biter. Ayarlar: `abilities.umaci` (`duration`, `nightOnly`, `shimmer`). |
| **Aşık** | Masum | **Birincil rol (v4.6):** özel yeteneği / silahı yoktur. **İki kişilik çift** olarak verilir (her çift 2 koltuk alır; eşsiz Aşık kalmaz); biri ölürse diğeri de ölür, birbirlerini bilirler (sağ altta `♥ Aşkın: <ad>`, açılış ekranında "Aşkın"). Host **Rol ayarları → Aşık (çift)** satırından seçer: *Kapalı* · *Otomatik* (5+ oyuncuda 1 çift; `GAME_CONFIG.lovers`) · *Max 1–3 çift* (koltuk yetmezse azalır). Koltuk azsa öncelik: Eskort'tan sonra, Uyurgezer / Medyum / Umacı'dan önce. Debug / TrollHacks'te rolü Aşık yapılanlar otomatik eşlenir; belirli bir çifti **♥ Bağla** kurar (ikisi de Aşık olur), **Kaldır** ikisini Masum yapar. |

**Gece / sabah:** Medyum kuralı ışıklara bağlıdır. Işıkların yarısından fazlası açıksa "gündüz", azı açıksa "gece" sayılır (`GAME_CONFIG.abilities.medium.nightLitFraction`). Şalterleri açıp kapatarak gece/gündüz oluşur; hiç ışık yoksa sürekli gece sayılır. **Işıklar her kapandığında yeni bir gece başlar** ve S2G'nin hakkı yenilenir (haritada hiç ışık yoksa tek bir sürekli gece olduğundan S2G tur başına 1 kez kullanır).

**Sesler:** Bıçak (savurma, fırlatma, isabet), kapı açma/kapama ve **ölüm tamamen sessizdir** — biri öldüğünde (ölümcül vuruşun "darbe" sesi dahil) hiçbir ses çıkmaz. Tabanca, taramalı, elektroşok ve patlama sesleri duyulur. Sessiz kalacak sesler `config.js → GAME_CONFIG.audio.silent` listesindedir.
**S2G sesleri (senin dosyaların):** `assets/sounds/zip.mp3` (fermuar; basılı tutarken çalar, tuş bırakılırsa/iptal olursa **kesilir**, en çok `zipRange` = 12 m'den duyulur) ve `assets/sounds/s2g.mp3` (ölüm sesi; kurbanın bulunduğu yerde çalar, `killRange` = 40 m'ye kadar duyulur; ceset bu sesin **süresi kadar** zıplar). Bu iki dosya projeye **dahil değildir**; kendi dosyalarını bu adlarla `assets/sounds/` klasörüne koy (yol/adlar `abilities.s2g.zipSound` / `killSound`). Dosya yoksa oyun hata vermez: ses çalmaz, ceset `fallbackSeconds` (6 sn) zıplar.

**Q menüsü kilidi:** Biri dairesel menüden bir ses çaldığında o ses **bitene kadar** (host süreyi ses dosyasından okur) o seçenek herkesin menüsünde **gri/kilitli** olur; ses bitmeden aynı ses tekrar basılamaz. Başka sesler basılabilir.

**Patlama (Bombacı):** X'e basılınca **hemen** ateş topu, şok dalgası halkası, kıvılcımlar, duman, yakındakilere **ekran flaşı + kamera sarsıntısı** çıkar; yerdeki cesetler savrulur. Fitil istersen `GAME_CONFIG.abilities.bomber.fuse` (sn; 0 = anında) ile geri eklenir.

**Menziller (v4.2'de kısaltıldı):** bıçak **1,5 m** (`equipment.knife.range`), elektrikli sopa **1,8 m** (`equipment.taser.range`), tabanca ve taramalı **25 m** (`equipment.pistol/rifle.range`), bombacı patlaması **4,5 m** (`abilities.bomber.radius`). **S2G'nin 1 m menzili** (`abilities.s2g.range`) aynen kaldı.

**Baiter:** Katil, **tur başına yalnızca 1 kez** bir oyuncuyu Baiter yapabilir ve **sonradan değiştirilemez**.
Baiter bir **ikincil roldür**: kişinin asıl rolünü (Sivil, Eskort…) değiştirmez, sağ alttaki rol etiketinin **yanında** `Baiter` etiketi olarak görünür. Seçilen kişi ekranda **"Baiter atandı"** başlığını ve altında *"Baitersın, amacın dedektifi kandırıp katile yardım edip katilin kazanmasını sağlamak"* yazısını görür; Baiter'ı yalnızca katil (ve kendisi, ölüler) bilir. (v4.6: **Aşık** artık ikincil değil, ana roldür.)

**Kazanma:** Katil ölürse katil takımı kaybeder ve masumlar kazanır (mafya hayatta olsa bile). Katil hayattayken bütün masumlar elenirse katil takımı (katil + mafya) kazanır. Süre dolarsa masumlar kazanır (`GAME_CONFIG.rounds.timeoutWinner`). Katil ile son masum aynı anda ölürse berabere.
Tur bitince kazanan + roller gösterilir; 8 sn sonra (`rounds.restartDelay`) **yeni tur otomatik** başlar: roller yeniden dağıtılır, dünya sıfırlanır, cesetler silinir. Yeterli oyuncu kalmadıysa (en az `minPlayersToStart` = 3) lobiye dönülür.

**Modlar**
* **Sesli mod:** yakınlık sesi. Herkes gri "Irgat", dedektif mavi "Dedektif". Karakter üstünde isim/rol yok.
* **Sessiz mod:** **yalnızca dedektif konuşabilir** (mikrofon açıkken; normal ↔ bağırma, aç/kapa). Diğer herkes **yazılı sohbet** kullanır. Dedektif dışındakilere rastgele renk + NATO kod adı verilir (nişangâhın altında renkli "Echo"). Gerçek adlar yalnızca TAB listesinde.
  Yaşayanlar yakınlarına yazar; ölüler ölülere yazar (oda ayarından "herkes görsün" yapılabilir).

### Host: rol seçimi (hangi roller, en çok kaç tane)

Lobide host **Rol ayarları** bölümünü açar. Her özel rolün yanında bir **onay kutusu** ve bir **sayı seçici** vardır:

* **Kutu kapalı:** o rol oyunda **yoktur** (hiç verilmez). **Katil ve Dedektif zorunludur**: bunların kutusu kapatılamaz / her turda en az 1 tane çıkar.
* **Kutu açık + `Max N` (1–5):** rol oyunda **vardır**; her turda **en az 1, en çok N** kişiye (rastgele) verilir. Örn. Mafya `Max 2` → bazı turlarda 1, bazılarında 2 mafya.
* **Kutu açık + Otomatik:** oyuncu sayısına göre sabit sayı (`config.js → ROLE_COUNTS`; az oyuncuda 0 olabilir). `Max N` seçersen oyuncu sayısı az olsa bile rol en az 1 kez verilir.
* **Aşık** ikişer kişilik **çift** olarak verilir: seçici "Max N **çift**" der (en çok 3), önizlemede `Aşık 1–2 çift` görünür; Otomatik'te 5+ oyuncuda 1 çifttir.
* **Katil her zaman 1 kişidir.** Kalan oyuncular Sivil olur; koltuk yetmezse öncelik sırası: Dedektif → Mafya → S2G → Sivil Polis → Bombacı → Eskort → Aşık (2 koltuk) → Uyurgezer → Medyum → Umacı (`roles.js → ROLE_PRIORITY`). Otomatik sayılar `config.js → ROLE_COUNTS` (örn. S2G 10+ oyuncuda 1).
* Altta "N oyuncu için roller: Dedektif 1 · Mafya 1–2 · Sivil 3–5 …" önizlemesi görünür (olası en az–en çok sayılar; diğer oyuncular da görür).
* **Hepsini otomatik yap** düğmesi ayarları sıfırlar.

**Oda ve lobi:** Oda kurarken ad, oyuncu sınırı (2–16), isteğe bağlı şifre, mod (sesli/sessiz), tur süresi (sınırsız – 20 dk) ve ölü sohbeti seçilir (sevgililer **Rol ayarları**ndadır). (v4.4: lobideki TrollHacks seçicisi kaldırıldı; TrollHacks yalnızca konsoldan açılır, misafir izni `host.js → DEFAULT_SETTINGS.troll` ile kapatılabilir.) Host bunları lobide de değiştirebilir, oyuncu atabilir ve en az 3 oyuncu varken oyunu başlatır. Tur sırasında içeri girenler izleyici olur.
**Oyuncu ayarları** (Menü → Ayarlar, tarayıcıda saklanır): fare hassasiyeti, görüş alanı (FOV), ses seviyesi, grafik kalitesi, **ışık efektleri (aç / kapa)**, ölü sohbetini gizleme · **Mikrofon:** cihaz seçimi, deneme çubuğu, açık mikrofon · **Tuşlar:** tuş atama.

---

## 4. Debug haritası (test modu)

Rolleri, silahları ve haritayı denemek için:

* **Tek kişilik:** Ana menü → **Debug haritası (tek kişilik)**. İnternet/PeerJS kullanmaz. Rolünü ve başlangıç botu sayısını seçip haritaya girersin.
* **İki (veya daha çok) kişilik:** **Oda oluştur** → "Debug odası" kutusunu işaretle. Arkadaşın koduyla katılır; lobide her oyuncunun rolünü host seçer. Tur başladıktan sonra katılan oyuncu izleyici olur; host **Turu yenile** deyince oyuna girer.

Debug odasında: roller elle seçilir, **tur kendiliğinden bitmez**, zaman sınırı yoktur. Herkesin rolü **F2 panelinde** görünür (TAB listesinde rol gösterilmez). Host oyun içinde **F2** ile paneli açar:

* **Seçili oyuncu** (panelin en üstündeki listeden kendini, bir oyuncuyu ya da bir botu seç; aşağıdaki her işlem **botlara da** uygulanır):
  * **Noclip** (aç/kapa): duvardan, zeminden, tavandan geçerek **uçarsın** (**Boşluk** yüksel · **Ctrl** alçal · **Shift** hızlı). Yalnızca seçilen oyuncuda çalışır; çarpışması kapanır.
  * **Görünmez** (aç/kapa, noclip'ten **ayrı**): diğer oyuncular modelini ve fener ışığını görmez (sesini yine duyarlar; susturmak ayrı). İkisi birlikte de açılabilir.
  * **Ölümsüz** (aç/kapa): bıçak, mermi, patlama, idam alanı, S2G ve sevgili zinciri dahil **hiçbir şey öldürmez**; yalnızca panelin **Öldür** düğmesi bunu aşar.
  * **Susturma** (aç/kapa): o oyuncunun mikrofonu kimseye iletilmez ve yazdığı sohbet mesajları düşürülür.
  * **Öldür** · **Patlat** (bombacı patlamasıyla patlatır; yakındakiler de etkilenir, ceset savrulur).
  * **Diriltme** + açılır liste: **doğma noktasında** ya da **cesedinde** (cesedinin durduğu yerde dirilir ve **ceset yok olur**; listedeki seçim kaydedilir). Yalnızca ölü oyuncuya uygulanır; rolü ve gizli eşyaları korunur.
  * **Yanına git** (seçilen oyuncunun hemen arkasına ışınlanırsın) · **Önüme getir** (seçilen oyuncu bakışının 1,8 m önüne, sana dönük ışınlanır; arada duvar varsa yaklaştırılır).
  * **Ona yaz / Herkese yaz:** kutuya yazdığın metin yalnızca seçilen oyuncunun / herkesin ekranının ortasında ~6 sn gösterilir.
  * **Gizli eşyalar:** **Roketatar**, **Bomba**, **Plazma tüfeği**, **Sniper tüfeği** (aşağıda).
* **Oyuncular ve roller:** kendi rolünü ve botların rollerini **anında** değiştir (silah, yetenek, can yenilenir). Her oyuncunun yanında **oyun içi kimliği** yazar: renk noktası + **NATO adı** (kalın) + gerçek adı (soluk); seçili oyuncu listesinde de aynıdır.
* **Bot ekle:** *Baktığım yere ekle* nişangâhın gösterdiği zemin noktasına sana dönük bir bot koyar; *Rastgele noktaya* bir doğma noktasına koyar. En fazla `GAME_CONFIG.debug.maxBots` (16) bot.
* **Harita raporu (konsol):** haritada **bulunan** (tür tür: ad, konum, ayarlar), **hiçbir kurala uymayan (tanınmayan)** ve **beklenip bulunamayan** her şeyi tarayıcı konsoluna yazar (**F12 → Console**). Ayrıca olası sorunları uyarır: `Collision_*` / `Spawn_*` yok, **çarpışması olmayan büyük görünür mesh'ler (içinden geçilen duvar / zemin)**, ölçeği uygulanmamış hareketli nesneler, doğma noktası oyuncudan az, şalterin hedef ışığı yok, idam şalteri var ama `DeathZone` yok, `Interact_*` hedefsiz, ayarlarda (`OBJECT_OVERRIDES`, `LIGHT_GROUPS`, `PAINTING_CONFIG`) haritada olmayan isimler, yazım hatası ihtimali (örn. `Dor_01`) vb. Debug odasında rapor **her tur başında kendiliğinden** da yazılır.
* **Çarpışma görünümü** (eski **F3** tuşu kaldırıldı, yalnızca bu panelde): `Collision_*` nesnelerini görünür yapar: statik duvar / zemin / merdiven **yarı saydam turuncu dolgu + açık turuncu kenar çizgileri**, kapı / tablo / hareketli duvar **mavi tel kafes** (hepsi duvarın içinden de görünür). Seçim kaydedilmez, **varsayılan kapalı**. "Bir duvardan geçiyorum" durumunda: o duvarda turuncu dolgu yoksa çarpışması yoktur.
* **X-ray** (Görünüm → X-ray): duvarların arkasındaki oyuncuları **yarı saydam siluet** (yalnızca bir şeyin *arkasında* kalan kısım çizilir) ve başlarının üstünde **rol + oyun içi adı** (Baiter / sevgili işaretiyle) olarak gösterir; ölüler gösterilmez.
* **Botları sil · Turu yenile** (herkes dirilir, botlar yerinde kalır; verilen gizli eşyalar da kalır) **· Lobiye dön.**

### TrollHacks (normal oyunda F2 paneli)

Debug olmayan **normal bir oyunda** tarayıcı konsoluna (**F12 → Console**) şunu yaz:

```js
TrollHacks.enabled = true;   // aç   (kapatmak: TrollHacks.enabled = false;)
```

Tur sürerken **F2** aynı paneli açar: **bot ekleme, turu yenileme ve lobiye dönme dışında her şey** vardır: rol değiştir, noclip / görünmezlik / ölümsüzlük / susturma, öldür / patlat / diriltme, yanına git / önüme getir, ekrana yazı, gizli eşyalar (roketatar, bomba, plazma), harita raporu, **çarpışma görünümü** ve **X-ray**. Oyuncular panelde **oyun içi adlarıyla** (NATO adı + renk, yanında gerçek ad) görünür.

* **Host da misafir de** açabilir. Misafirin işlemleri host'a istek olarak gider ve host uygular; roller / durumlar host'tan gelir (`trollInfo`, ~0,7 sn'de bir). Host kendi konsolundan her zaman açabilir.
* Misafirlerin TrollHacks'i açabilmesi host'ta `settings.troll` (varsayılan `true`, `js/host.js` başı) ile belirlenir; `false` yaparsan misafir açamaz ("Host bu odada TrollHacks kullanımına izin vermiyor" uyarısı çıkar). v4.4'te lobideki seçici kaldırıldı.
* Konsoldan `TrollHacks.xray = true;` ile X-ray panel açmadan da açılır; `TrollHacks.help()` kısa yardım yazar. Yetki bir arkadaş oyunu için "dürüstlük esaslıdır": istemci kendini ilan eder, host yalnızca lobideki ayara bakar. Herkese açık bir odada ayarı *Kapalı* bırak.

### Gizli eşyalar (debug / TrollHacks panelinden verilir)

Roller ve ekipmanlardan bağımsız, **herkese verilebilen** dört eşya. Panelde seçili oyuncu için düğmeye bas: eşya **verilir** (düğme `[slot] ✓` gösterir), tekrar basınca **geri alınır**. **Slot numarası verilme sırasına göre** değişir: ilk verilen **3**, sonraki **4**, **5**, dördüncüsü **6** olur (tuşlar `DEFAULT_KEYS.slot3 … slot6`, Ayarlar → Tuşlar'dan değiştirilebilir; dokunmatikte çubukta **Eşya 1–4**). Biri geri alınırsa sonrakilerin numarası kayar. Eşya sol tıkla kullanılır; **1 / 2** ile boş ele ya da rol ekipmanına dönersin.

| Eşya (`config.js → equipment`) | Kullanım |
|---|---|
| **Roketatar** (`rocket`) | Sol tık roket fırlatır (hız 24 m/sn, ~31 m menzil); duvara / oyuncuya çarpınca **4 m** yarıçapında patlar, patlamadakini **öldürür** (yakında patlarsa seni de). 1 mermi, doldurma 2,6 sn. |
| **Bomba** (`bomb`) | Sol tık baktığın yere (en çok 3 m) bomba **koyar**; **3 sn sonra** 4,5 m yarıçapta patlar ve öldürür (koyanı da). Sınırsız, yalnızca 2,5 sn bekleme. |
| **Plazma tüfeği** (`plasma`) | Sol tık / basılı tut **plazma mermisi** atar (hız 40 m/sn, ~28 m menzil); mermi başına 34 hasar, saniyede 5 atış, 20 mermilik şarjör, doldurma 2,2 sn (**R**). |
| **Sniper tüfeği** (`sniper`) | Sol tık **anında vuran ışın** (hitscan): **tek atışta öldürür**, menzil **120 m**, 5 mermilik şarjör, atışlar arası **1,3 sn** (sürgü), doldurma 3,4 sn (**R**). **Sağ tık basılı tut = dürbün:** görüş alanı **4×** daralır, fare hassasiyeti düşer, elindeki silah gizlenir ve dürbün çerçevesi çıkar (dokunmatikte sağdaki **Dürbün** düğmesi); doldururken ya da ölünce kapanır. Sesi 110 m'ye kadar duyulur. Ayarlar: `equipment.sniper` (`damage`, `magazine`, `cooldown`, `reloadTime`, `range`, `zoom`, `zoomSpeed`). |

Roket, plazma mermileri ve bombalar **host'ta** hesaplanır; herkes aynı patlamayı görür / duyar. Patlamalar cesetleri savurur.

Botların **yapay zekası yoktur**: olduğu yerde dururlar. Vurulunca/patlayınca ölür ve ceset bırakırlar; ceset sürüklenebilir. Botların sesi ve sohbeti yoktur.

---

## 5. Blender ile kendi evini ekleme

1. Evi Blender'da modelle. **Nesne adlarını** aşağıdaki tabloya göre ver (büyük/küçük harf önemsiz).
2. **File → Export → glTF 2.0 (.glb)**; "Format: glTF Binary", "+Y Up", **Apply Modifiers** açık, **Custom Properties** açık (nesne ayarları için), ışık/animasyon kullanıyorsan onlar da açık.
3. Dosyayı `assets/house.glb` olarak kaydet ve sayfayı yenile. Başka kod değişikliği gerekmez.

**Örnek (test) ev — v4.2'de büyütüldü** (`house.glb` yokken kurulur; `js/fallbackHouse.js`): **28 × 16 m, 2 katlı**; bütün sistemler içinde, hepsi Blender isim kurallarıyla (yani kendi evinde de aynı adlarla çalışır). `Collision_Walls / Floor / Stairs` grupları **F3** ile görünür.
* **Odalar ve kapılar:** `Room_01–09`, **7 kapı** (`Door_01–07`), **4 şalter** (`Switch_01` tüm ışıklar · `02` üst kat · `03` kuzey odalar · `04` tünel), **13 ışık** (salondaki `Light_08` kendi `Interact_Light_08` noktasıyla tek başına açılır), **13 doğma noktası**, **10 taşınabilir eşya** (`Grab_01–10`; `Grab_04` ve `Grab_08` ağır).
* **Düzenekler:** kafes çukuru (`Cage` + `Cage_Button`, Room_01), idam odası (`DeathZone` + `Execution_Lever`, Room_02), özel kapı (`Special_Door`, Room_04), iki alçak platform + `Ladder_01 / 02`, zemin kattan üst kata **iç merdiven**.
* **Tablolar:** 3 normal kayan (`Painting_01–03`), **3 serbest dönen** (`MidPaint_01` yalnız kendi Y ekseninde · `02` duvarda tekerlek gibi (`axis: 'normal'`) · `03` her yöne (`axis: 'free'`)) ve kapı boyunda **4 gizli geçit tablosu** (`Painting_04–07`).
* **Gizli tüneller:** `Painting_04` (Room_01) ve `Painting_05` (Room_03) tabloyu kaydırınca evin kuzey duvarının **dışındaki ~21 m'lik tünele** (`Room_09`; içinde 2 ışık, şalter, eşya, doğma noktası, ortada alçak sandık yığını) açılır; `Painting_06 / 07` Room_01 ile Room_02 arasındaki duvar geçidini iki yandan kapatır. Tabloya bakıp **sol tık** ya da **E**.
* Menü → Ayarlar → Genel → "Örnek evi .glb olarak indir" ile bu evi Blender'a aktarıp şablon yapabilirsin.

| Blender nesne adı | Ne olur |
|---|---|
| `Collision_*` | Görünmez çarpışma mesh'i (duvar, zemin, merdiven). Hiç yoksa görünür mesh'ler çarpışma sayılır. **`Collision_*` varsa YALNIZCA onlar çarpışır:** çarpışması olmayan bir duvarın içinden geçilir. **F2** panelindeki **"Çarpışma görünümü"** düğmesi `Collision_*` nesnelerini yarı saydam turuncu gösterir, harita raporu eksikleri listeler. Kapalı kutular (küp) en sağlam sonucu verir; zemini kalın bir küp yap. **Merdiven için** `Collision_Stairs` olarak eğimli bir rampa koyman en pürüzsüz sonucu verir (basamak yüksekliği 0,5 m'ye kadar zaten çıkılır). |
| `Spawn_01 …` | Doğma noktaları (Empty). Empty'nin Blender'daki **−Y** ekseni (glTF'te +Z) oyuncunun ilk bakış yönüdür; Empty'yi Z ekseninde döndürerek ayarla. Nokta sayısı oyuncudan azsa hafif sapmayla paylaşılır. |
| `Room_01 …` | Oda bölgeleri (görünmez kutu). Uyurgezer'in ışınlanma hedefleri buradan otomatik alınır. |
| `Door_01 …` | Kapı. **Menteşe = nesnenin orijini** (Blender'da orijini menteşe kenarına koy). Oyuncunun karşı tarafına doğru açılır. **Açıkken de katıdır** (içinden geçilmez); hareket ederken bir oyuncuya çarparsa geri döner. Sessizdir. |
| `Light_01 …` | Işık noktası (Point Light, Empty veya mesh olabilir). |
| `Switch_01 …` | Işık şalteri. Hangi ışıkları yönettiği `config.js → LIGHT_GROUPS` içinde. Işıklar kapanınca ortam kararır (gece). |
| `Interact_<HedefAdı>` | Hedef nesnenin etkileşim noktasını taşıyan Empty (örn. `Interact_Door_01`, `Interact_Switch_01`). Bu noktaya **bakınca** etkileşim çıkar. `Interact_Light_01` o lambayı tek başına açılıp kapanır yapar. Algı küresinin yarıçapı `hitRadius` özelliğiyle ayarlanır (varsayılan `interaction.anchorRadius`). |
| `Cage` + `Cage_Button` | Kafes: butonla aşağı iner/yukarı çıkar; üstündeki oyuncular birlikte hareket eder. Mesafe/süre/yön: `config.js → cage`. |
| `Special_Door` + `Special_Door_Button` | Hareketli duvar / ikinci kapı. Ayarlar: `config.js → specialDoor` (`direction` ile yana/yukarı kaydırabilirsin). |
| `Painting_01 …` | Kayan tablo. Açık/kapalı konumlar `config.js → PAINTING_CONFIG` (her tablo için ayrı `offset` / `rotationOffset`). Tabloya bakıp boş elle tıklayarak veya **E** ile açılır. **Katıdır** (içinden geçilmez; kendi mesh'i çarpışma olur, kayarken birlikte hareket eder). |
| `MidPaint_01 …` (`MidPoint_1`, `Mid_Painting_01` de olur) | **Serbest dönen tablo:** **pivotu = nesne orijini** (Blender'da plakanın ortasına koy) etrafında döner; oyuncu iterek ya da eşya çarparak döndürür, sürtünmeyle durur. Katıdır. Nesne ayarı: `mass`, `damping`, `maxSpin`, `restoreSpring`, `axis` (`vertical` = **varsayılan**, yalnız Y ekseni · `free` / `normal` / `[x,y,z]`). Mutlaka bir **mesh** olmalı. |
| `Ladder_01 …` | **Merdiven:** katı değildir; nesnenin sınır kutusuna **değip W / Boşluk basılı tutan** oyuncu tırmanır (S iner, tepede üste sıçrar). Mesh'siz Empty ise kutu = ölçek ya da `size: [genişlik, yükseklik, derinlik]`. Ayrıca zemin / platform için `Collision_*` gerekir. |
| `Execution_Lever` + `DeathZone` | İdam alanı: **şalter** (eski adıyla `Execution_Button` da şalter gibi çalışır). Şalter bir kez çevrilince **açık kalır**; açıkken `DeathZone` (görünmez kutu; `Execution_Zone`/`Execution_Area` de olur) içindeki herkese **sürekli hasar** verir, tekrar çevrilince kapanır (`GAME_CONFIG.execution`). Şalterin içinde `handle` / `arm` / `kol` / `stick` / `knob` adlı bir alt nesne varsa o devrilir, yoksa nesnenin kendisi döner. |
| `Grab_01 …` | Taşınabilir eşya: bakıp **E** al, sağ tık basılı tutarak döndür, sol tık fırlat, **E** bırak. Çarpışma küresi boyuttan otomatik hesaplanır (`collisionSize` ile boyutu elle verebilirsin). |

**Ad yazımı serbesttir:** Kural, adın kelimeyle başlamasıdır; kelimeden sonra **harf gelmediği sürece** eşleşir. Hepsi aynı kapıdır: `Door` · `Door_` · `Door_01` · `Door_1` · `Door_.001` · `Door.001` · `Door-2` (Blender bir nesneyi çoğaltınca `.001` ekler). Bu, bütün nesne türleri için geçerlidir; `OBJECT_OVERRIDES`, `LIGHT_GROUPS` ve `PAINTING_CONFIG` anahtarlarında da aynı esneklik vardır (örn. `Door_01` ayarı `Door_.001` için de bulunur). Not: glTF yükleyici adlardaki `.` işaretini siler (`Door_.001` → `Door_001`); kurallar buna da uyar. Harita raporu (debug) tanınmayan adları ve olası yazım hatalarını listeler.

**Nesne başına ayar:** Blender'da *Object Properties → Custom Properties* (glTF extras) veya `config.js → OBJECT_OVERRIDES`
(öncelik: OBJECT_OVERRIDES > Blender özelliği > varsayılan). Örnekler: kapı → `openAngle` (radyan), `duration`;
eşya → `weight`, `carryable`, `throwable`, `collisionSize: [x,y,z]`, `rotationLimit`; etkileşim noktası → `hitRadius`.

Animasyon: GLB içinde klip varsa adı `Auto` / `Loop` ile başlayanlar otomatik oynar. Kapı/kafes/tablo/duvar hareketleri Blender animasyonu olmadan JS ile üretilir.

---

## 6. Her şeyi nereden değiştiririm?

| Ne | Nerede |
|---|---|
| Oyuncu sınırı, tur süresi, yeniden başlama gecikmesi, hız, **zıplama**, can | `js/config.js → GAME_CONFIG` (`player.jumpSpeed`, `player.airControl`) |
| Silah hasarı/mermi/bekleme, yetenek süreleri | `GAME_CONFIG.equipment`, `GAME_CONFIG.abilities` |
| **Menziller** (bıçak 1,5 · elektrikli sopa 1,8 · tabanca / taramalı 25 · bombacı patlaması 4,5 m · S2G 1 m) | `equipment.knife / taser / pistol / rifle → range` · `abilities.bomber.radius` · `abilities.s2g.range` |
| Bombacı fitili (0 = anında patlar) | `GAME_CONFIG.abilities.bomber.fuse` |
| Gizli eşyalar (roketatar / bomba / plazma / sniper: hasar, hız, yarıçap, şarjör, dürbün zoom'u) · slot tuşları | `GAME_CONFIG.equipment.rocket / bomb / plasma / sniper` · `DEFAULT_KEYS.slot3 … slot6` |
| Serbest dönen tabloların varsayılan ekseni (`vertical` / `free` / `normal`) | `GAME_CONFIG.midPaint.axis` |
| Ses seviyesi dairesi tuşu (C, basılı) | `DEFAULT_KEYS.talkLevel` |
| Karakter yüzleri (klasör, doku boyutu, yüz boyutu, en çok dosya) | `GAME_CONFIG.faces` · `assets/faces/` · `js/faces.js` |
| Işık havuzu (kalite başına ışık sayısı) · yakın görüş · düz ışık modu · ambiyans | `QUALITY_PRESETS.maxLights` · `GAME_CONFIG.lights` (`maxActive`, `nearVision`, `flat`, `ambientOff`, `pickInterval`, `fadeSpeed`) |
| Aşık (otomatik çift ve en az oyuncu; çift başına kişi `group`, en çok çift `maxPick`) · TrollHacks izni | `GAME_CONFIG.lovers` · `roles.js → ROLES.lover` · `host.js` başındaki `troll` |
| İnsan modelinin renkleri (ten, bacak) · elindeki ekipmanın tutuşu | `ragdoll.js → SKIN_TONES, LEG_GRAY` · `avatarPose.js → HOLDS` · `equipment.js → GRIPS` (birinci şahıs) |
| Etkileşim erişimi, kamera (FOV, hassasiyet) | `GAME_CONFIG.interaction`, `GAME_CONFIG.camera` |
| Hangi sesler tamamen sessiz | `GAME_CONFIG.audio.silent` |
| Ses mesafeleri (3 / 8 / 18), bağlantı sınırları | `GAME_CONFIG.voice` |
| STUN / TURN sunucuları | `STUN_SERVERS`, `TURN_SERVERS` |
| Blender isim kuralları | `NAME_RULES` (**tek yer**) |
| Hangi şalter hangi ışığı yönetir | `LIGHT_GROUPS` |
| Tablo açık/kapalı konumları | `PAINTING_CONFIG` |
| Merdiven tırmanma (hız, değme payı, tepeden sıçrama) | `GAME_CONFIG.ladder` |
| Serbest dönen tablolar (kütle, sönüm, itiş gücü, eşya darbesi, duvara girmeme) | `GAME_CONFIG.midPaint` · nesne başına `OBJECT_OVERRIDES` / Blender özelliği (`mass`, `damping`, `maxSpin`, `restoreSpring`, `axis`) |
| Eğilme (yükseklik, hız) · göz yüksekliği | `GAME_CONFIG.player` (`crouchHeight`, `crouchEyeHeight`, `crouchSpeed`, `crouchBlend`) |
| Nişangâh altı isim (menzil, görünme süresi) | `GAME_CONFIG.lookName` |
| Tur başı siyah rol ekranı süresi | `GAME_CONFIG.rounds.roleRevealTime` |
| S2G yeteneği (basılı tutma, menzil, sesler, zıplama) | `GAME_CONFIG.abilities.s2g` |
| Umacı yeteneği (süre, yalnızca gece, shimmer görünümü) · takımı | `GAME_CONFIG.abilities.umaci` · `roles.js → UMACI_TEAM` |
| Mobil kişiselleştirme varsayılanları (boyut, saydamlık, joystick modu) | `js/touch.js → TOUCH_DEFAULTS` (oyuncu Ayarlar → Mobil'den değiştirir) |
| Q menüsündeki sesler | `RADIAL_MENU_ITEMS` (`{ name, sound }` ekle; dosyayı `assets/sounds/` içine koy) |
| Kaç kişide hangi özel rol çıkar (otomatik) | `ROLE_COUNTS` (host lobide rol açma/kapama + "Max N" ile elle de ayarlayabilir; üst sınır `roles.js → ROLE_MAX_PICK`) |
| Ceset fiziği ve taşıma (ağırlık, yürüme hızı, düşürme açısı, ağ sıklığı) | `GAME_CONFIG.corpse` · ölüm anı itişleri `corpse.stumble` · patlama savurması `abilities.bomber.blastImpulse` |
| İdam şalteri (hasar, aralık, şalter animasyonu) | `GAME_CONFIG.execution` |
| Kapı çarpınca geri dönme, açılma süresi | `GAME_CONFIG.doors` (`reverseOnBlock`, `blockCooldown`, `duration`) |
| Oyuncu çarpışması / ilk 10 sn serbest geçiş | `GAME_CONFIG.player` (`ghostSeconds`, `separationStep`) |
| Kapsül boyutu, basamak çıkma, eğilme | `GAME_CONFIG.player` (`radius`, `height`, `stepHeight`, `snapDown`, `crouchHeight`) |
| Duvar geçme koruması / çarpışma hassasiyeti | `GAME_CONFIG.collision` (`substep`, `maxSubsteps`, `iterations`, `descend`, `crossGuard`) |
| Fener (menzil, açı, gölge) · grafik kalitesi | `GAME_CONFIG.flashlight` · `QUALITY_PRESETS` (`shadows`, `shadowMap`) |
| Eşya tutarken duvara mesafe | `GAME_CONFIG.grab` (`minWallClearance`) |
| Sessiz mod renk/kod adları, sesli mod adları | `IDENTITY` |
| **Varsayılan** tuşlar | `DEFAULT_KEYS` (oyuncular kendi atamasını Ayarlar'dan yapar; tarayıcıda saklanır) |
| Debug botu sınırı | `GAME_CONFIG.debug.maxBots` |
| Karakter görünümü (gerçek 3B model) | `js/player.js → registerAvatar('ad', fabrika)` + `setAvatarKind('ad')` |

**Yeni rol:** `js/roles.js → ROLES`'a kayıt (+ varsa `ROLE_COUNTS`, `ROLE_PRIORITY`, `GAME_CONFIG.equipment/abilities`). Yetenek mantığı `js/combat.js → onAbility`. Rol metinlerinde `{equip}`, `{ability}`, `{reload}`, `{list}` yer tutucuları oyuncunun atadığı tuşun adına dönüşür.
**Yeni etkileşimli nesne türü:** `NAME_RULES`'a kural → bir sistem sınıfı yaz (bkz. `js/world.js` başındaki arayüz) → `SYSTEM_DEFS`'e ekle. Etkileşim adayı `{ object (mesh) veya position + hitRadius, label, use }` verir; nişan ışını en yakın adayı seçer.

---

## 7. Proje yapısı

```
murder/
├── index.html · style.css
├── assets/            house.glb (senin evin) · models/ · sounds/ (door.mp3, custom.mp3 — yer tutucu) · faces/ (karakter yüzleri: PNG / SVG + faces.json)
└── js/
    ├── main.js        başlatma + oyun döngüsü           ├── config.js     bütün ayarlar + isim kuralları
    ├── context.js     modüller arası ortak durum        ├── util.js · audio.js · input.js · keybinds.js (tuş atama)
    ├── scene.js       renderer, sis/karanlık, fener ışık havuzu
    ├── blenderLoader.js  GLB yükleme + isimle tanıma    ├── fallbackHouse.js  örnek ev
    ├── world.js       tanınan nesneleri sistemlere dağıtır
    ├── collision.js   BVH tabanlı silindir (yassı uçlu kapsül) çarpışma (kesişme düzeltmesi, duvar geçme kilidi), ışın testi, çarpışma görünümü
    ├── doors.js · lights.js (ışık havuzu) · cage.js · specialDoor.js · paintings.js · execution.js · kinematic.js
    ├── ladders.js     merdiven (Ladder_*): "kapsül değiyor mu?" sorgusu; tırmanma movement.js'te
    ├── midPaints.js   serbest dönen tablolar (MidPaint_*): host'ta rijit gövde fiziği + ağ yayını
    ├── grab.js        taşınabilir eşyalar (host fiziği)  ├── corpse.js   cesetler (taşıma, ağ)  ├── ragdoll.js  ceset fiziği + görünümü
    ├── mapReport.js   debug "harita raporu" (konsol)
    ├── player.js      karakter/avatar sistemi            ├── movement.js  hareket, zıplama, eğilme, merdiven, birinci şahıs kamera
    ├── humanAvatar.js insansı oyuncu modeli + animasyon  ├── lookName.js  nişangâh altı isim  ├── tabGuard.js  Ctrl+W koruması
    ├── avatarPose.js  iki kemikli IK, ekipman tutuşları (HOLDS), saldırı / atış hareketleri
    ├── interaction.js bakışa göre etkileşim seçimi       ├── inventory.js 1/2/3-5/X/F/saldırı (gizli eşya slotları dahil)
    ├── viewmodel.js   elimdeki silahın birinci şahıs görünümü (iki elli tutuşlar)
    ├── projectiles.js roket / plazma mermisi ve kurulu bombanın görüntüsü (hasar + patlama combat.js'te, host'ta)
    ├── roles.js · rounds.js · combat.js · host.js        (host otoritesi: roller, hasar, tur, ses rotaları, debug/bot)
    ├── multiplayer.js · client.js                        (ağ + mesajları oyuna uygulama; yerel debug odası)
    ├── voice.js       PeerJS yakınlık sesi + mikrofon seçimi  ├── chat.js · radialMenu.js · playerList.js
    ├── touch.js · touchButtons.js · touchIcons.js   dokunmatik (mobil) arayüz: çubuk, bakış, çoklu dokunuş, düğmeler (v4.4) · kişiselleştirme, düzenleyici, tam ekran (v4.5)
    └── ui.js · debug.js (debug / TrollHacks paneli) · troll.js (TrollHacks + X-ray) · faces.js · effects.js · equipment.js
```

**Ağ mimarisi:** Host'un tarayıcısı oyun durumunun tek sahibidir (roller, can, hasar, tur, kapı/eşya olayları). İstemciler yalnızca istek yollar; sonucu host doğrulayıp herkese yayınlar.
Roller yalnızca ilgili oyunculara özel mesajla gider. Sesli iletişimde host konumları izler ve her oyuncuya sadece menzildeki oyuncuların listesini verir; böylece 16 kişilik tam ağ (mesh) kurulmaz.
Ses taşıma kısmı `voice.js` içinde izole olduğu için ileride SFU'ya geçmek kolaydır.

---

## 8. Bilinen notlar

* Bu teslimde (v4.6) oyun tarayıcıda **çalıştırılıp denenmedi** (istenildiği gibi). Kod statik olarak denetlendi: sözdizimi, import/export eşleşmesi, tanımsız/kullanılmayan değişken taraması ve modüller arası çağrı kontrolü temiz.
* **v4.6'nın hepsi oyun içinde denenmedi:** (1) **Umacı dalgalanması** artık `MeshLambertMaterial` + `onBeforeCompile` ile yazıldı (GLSL parçaları three r170 bilgisine göre eklendi): dalga görünmüyorsa / fazla görünüyorsa `abilities.umaci.shimmer` (`opacity` ↓ = daha az görünür, `band`, `wobble`); shader hata verirse tarayıcı konsolunda `THREE.WebGLProgram` uyarısı çıkar. (2) **Uyurgezer** hâlâ odaya değil doğma noktasına gidiyorsa konsoldaki `[Uyurgezer] Room_… geçerli nokta bulunamadı (kutu y …, elenen: zemin · duvar · kenar · baş)` satırını gönder: hangi eleme nedeniyle başarısız olduğunu gösterir. (3) **Aşık** birincil rolü: çift eşleme, "Max N çift" önizlemesi, debug / TrollHacks'te rol değişince yeniden eşleme. (4) **Sniper:** ışın, dürbün zoom'u (`equipment.sniper.zoom`), dürbün çerçevesi (`style.css → .scope`), 6. slot ve mobil **Dürbün** düğmesi.
  İlk denemede bir sorun görürsen tarayıcı konsolundaki (F12) hata satırı sorunu hızla gösterir.
* **v4.3'ün hepsi oyun içinde denenmedi:** yüzler (boyut / konum / şeffaflık), TrollHacks (konsol bayrağı, host izni, misafir işlemleri), X-ray (siluet + etiket), ışık havuzu (yuva geçişleri), "Işık efektleri" kapalı modu (`lights.flat` → `intensity`, `darkIntensity`, `fogDark` gözle ayarlanmadı; karanlıkta çok açık / koyu gelirse bu üçünü değiştir) ve karanlıkta yakın görüş (`lights.nearVision` değerleri tahmindir: çok karanlık / aydınlık gelirse `intensity` / `distance` değiştir). Yüz dosyası yoksa kafa yüzsüz kalır; klasör listelenemiyorsa (GitHub Pages gibi) `assets/faces/faces.json` kullan.
* **v4.4'ün hepsi oyun içinde denenmedi:** ölüm itmesi (`corpse.stumble` / `stumbleLift` / `momentum`), görünmez dünya görünümü (`deadView.*`: kamera mesafesi / ışık), zıpla-eğil (`player.airCrouchLift`), silindir çarpışma (`collision.capFlat`; merdiven / basamak / eğilme / kapı yanında bir takılma görürsen önce `capFlat: 1` ile eski kapsülü dene), Medyum (gecede 1 kişi; seçtiğin kişi o gece ölse de hakkın yenilenmez), merdiven ("ortalanma" = tırmanırken merdivene doğru yana çekme kaldırıldı; yalnızca merdivenin ince ekseninde yapışma kaldı) ve **dokunmatik arayüz** (gerçek telefonda hiç denenmedi: düğme yerleşimi, çubuk / bakış hızı, çoklu dokunuş, iOS'ta sohbet klavyesi, tam ekran / yatay kilit). iPhone Safari tam ekran API'sini desteklemez: adres çubuğunu gizlemek için sayfayı **Ana ekrana ekle** ile aç.
* **v4.2'nin hepsi oyun içinde denenmedi:** iki elli tutuşlar, yeni silah modelleri, animasyonlar, gizli eşyalar, debug araçları, büyük örnek ev, çarpışma görünümü, basılı tutulan ses dairesi. Elde tutulan modellerin konumu (`equipment.js → GRIPS` / `TIPS`, `avatarPose.js → HOLDS`) gözle ayarlanmadı; bir silah elde yamuk ya da fazla uzun / yakın duruyorsa **yalnızca o satırdaki sayıları** değiştirmek yeter.
* **Çarpışma görünümü varsayılan kapalı** (v4.3): yalnızca F2 panelindeki (debug / TrollHacks) düğmeyle açılır, seçim kaydedilmez; F3 kısayolu kaldırıldı. Açıkken çok büyük haritada FPS düşebilir.
* **Gizli eşyalar / debug:** roket, plazma mermisi ve bomba **host'ta** hesaplanır (host'un gecikmesi herkesi etkiler); roketatar ve bomba yakında patlarsa seni de öldürür. **Noclip** seçilen oyuncunun kendi bilgisayarında hesaplanır (sunucu doğrulaması yok; yalnızca debug odasında). **Görünmez** modeli ve feneri gizler, sesi gizlemez. **Cesedinde diriltme**: ceset bulunamazsa oyuncu doğma noktasında dirilir.
* Host oyundan çıkarsa oda kapanır (host devri yok).
* Kalite ayarı ev materyallerini ve **fener gölgelerini** yüklemede belirler; tam etki için sayfayı yenile. Gölgeler yalnızca fener içindir (en fazla 1 + 3 ışık).
* **Ceset fiziği** yalnızca host'ta hesaplanır ve ~12 Hz yayınlanır; yavaş bağlantıda cesetler hafif gecikmeli yumuşak hareket eder. Çok sayıda ceset varken bile uyuyan cesetler hiç işlemci harcamaz.
* Ragdoll "kutu insan"dır (kafa, gövde, kol, bacak); gerçek karakter modeli eklendiğinde `ragdoll.js → RagdollView` yerine kendi görünümünü bağlayabilirsin (fizik noktaları aynı kalır).
* Kapı çarpma kontrolü ve idam hasarı host'ta çalışır; host'un kendi bilgisayarındaki bir gecikme herkesi etkiler.
* **Çarpışma (v4.1):** Duvar geçme kilidi yalnızca **statik** dünyaya (`Collision_*`) uygulanır; kapı / tablo gibi hareketli nesneler üzerine biner ya da oyuncuyu sıkıştırırsa oyuncu eskisi gibi nesnenin dışına itilir. Başlangıçta zaten bir duvarın içindeysen (ışınlanma, doğma) kilit o karede devre dışı kalır ki dışarı çıkabilesin (ışınlanmada kapsül ayrıca bir kez dışarı itilir). Kilidi tümden kapatmak için `GAME_CONFIG.collision.crossGuard = false`. Bu değişiklikler bu teslimde de **oyun içinde denenmedi**: bir takılma / "görünmez duvar" fark edersen konsol hatasıyla birlikte haber ver; `collision.substep` / `descend` değerlerini küçültmek önce denenecek ayardır.
* **Ctrl+W koruması** yalnızca Chromium tarayıcılarda (Chrome / Edge / Brave) tam çalışır (tam ekran + klavye kilidi). Firefox / Safari'de kısayol tarayıcıya ulaşırsa "Sayfadan ayrılmak istiyor musun?" uyarısı çıkar (İptal de).
* **Dönen tablolar (`MidPaint_*`):** pivotu nesnenin orijinidir; orijin plakanın ortasında değilse plaka o noktadan döner (debug harita raporu uyarır). Oyuncunun itişi host'a konum paketiyle gittiği için **itişte ağ gecikmesi kadar** (tipik 30–100 ms) gecikme olur; host'un kendi itişi anlıktır. Duvara tamamen yapışık bir tablo, duvara doğru eğilemez: `axis: 'normal'` ile tekerlek gibi döndürmen en doğal sonucu verir. Dönen plaka bir oyuncuyu sıkıştırırsa oyuncu plakadan dışarı itilir (içinden geçmez).
* **Merdiven:** tırmanma yalnızca yerel oyuncuda hesaplanır (sunucu doğrulaması yok, arkadaş oyunu için yeterli). Merdivenin tepesini çıkılacak yüzeyin 0,2–0,3 m üstünde bitir; çok alçak biterse tepeden sıçrama platformun kenarına takılabilir.
* Cesetlerin ince zeminin içinden geçip altında titreşmesini önleyen koruma (`ragdoll.js → _collide`: alttan itilen noktanın hareketi geri alınır) bu sürümde **oyun içinde denenmedi**. Takılan / titreyen bir ceset en geç `GAME_CONFIG.corpse.maxAwake` (15 sn) sonra zorla uyutulur; zeminin altında kalırsa o değeri düşür ya da haritadaki zemin `Collision_*` mesh'ini kalınlaştır (ince tek yüzlü zeminler en sorunlu olanlardır).
* Tuş atamada Esc (menü) ve fare düğmeleri sabittir; F5/F11/F12 gibi tarayıcı tuşları atanamaz.
