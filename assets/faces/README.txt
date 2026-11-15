KARAKTER YÜZLERİ (assets/faces)
Buraya PNG veya SVG (ayrıca WEBP / JPG / GIF) yüz dosyaları koy. Her turun başında oyun herkese rastgele birini verir ve
kafanın ÖN yüzüne yapıştırır (herkes aynı oyuncuyu aynı yüzle görür; ceset de yaşarkenki yüzünü taşır).

* Arka plan ŞEFFAF olmalı (PNG'de arka plan yok, SVG'de arka plan dikdörtgeni yok): kafanın ten rengi yüzün arkasından görünür.
* Kare tasarla (örn. 512x512 PNG ya da viewBox="0 0 100 100" SVG). Yüz, kafanın ön yüzünün TAMAMINI (0.3 x 0.3 m) kaplar;
  kare olmayan görüntü oranı bozulmadan ortalanır. Göz / ağız gibi ayrıntıları kenarlardan biraz içeride tut.
* Dosya adında boşluk ve Türkçe karakter olabilir.
* Liste kendiliğinden bulunur: sunucun klasörü listeliyorsa (python -m http.server, npx serve, http-server) dosyayı atman yeter.
  Listelemeyen sunucularda (GitHub Pages vb.) dosya adını faces.json içine de yaz.
* İstemediğin yüzü klasörden sil (faces.json'da kalsa bile açılamayan dosya atlanır).
* En fazla 80 dosya okunur; ayarlar: js/config.js -> GAME_CONFIG.faces.

Buradaki yuz_*.svg dosyaları örnektir; silebilir ya da kendi yüzlerinle değiştirebilirsin.
