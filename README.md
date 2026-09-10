# Ledger

## Alarm yöntemi

**Seçilen:** Cihaza göre iki dal; ikisi de aynı işi yapar — telefonun kendi saat
uygulamasına **gerçek alarm** kurar, bildirim göndermez.

- **Android → §8.1** `intent://` ile `SET_ALARM`.
- **iPhone → §8.7** Kısayollar. Saat uygulamasının açık bir URL şeması yok, ama
  Kısayollar'ın `Alarm Oluştur` eylemi var ve bir kısayol `shortcuts://` ile
  dışarıdan çalıştırılabiliyor. Uygulama kısayola yalnız `SS:DD` metnini geçirir.

**iPhone'da iki kısayol var, bir değil.** Tekrar ayarı kısayolun içinde duruyor ve
dışarıdan verilemiyor:

| Kısayol | Tekrar | Neden |
|---|---|---|
| `Ledger Alarm` | tek seferlik | İmsak her gün kayıyor; tekrarlı bir alarm birkaç hafta sonra yanlış saatte çalardı. Ertesi gün yenisi kurulur. |
| `Ledger Kalkış` | her gün | Kalkış saati kullanıcının kendi seçtiği sabit saat. Bir kez kurulur, her sabah çalar. |

Tek kısayolda ayırmak için metni bölüp koşula sokmak gerekirdi — kurulum maliyeti
iki katına çıkardı (ölçüt 2). İkinci kısayol, birincinin **Çoğalt**'ı: ad değişir,
`Tekrarla → Her Gün` seçilir.

Kalkış alarmı tekrarlı olduğu için uygulama onu **güne değil saate** bağlı
işaretliyor: kullanıcı kalkış saatini değiştirmedikçe "kurulu" sayılıyor ve
düğmeye ikinci kez basılması istenmiyor — basılsaydı Saat uygulamasında ikinci bir
tekrarlı alarm kalırdı. Saat değişirse işaret düşüyor ve arayüz eskisini silmeyi
söylüyor.

Yanında iki destek katmanı: §8.6 uygulama içi bildirim (uygulama açık veya arka
plandayken) ve §8.2 ntfy (isteğe bağlı, kullanıcı kurarsa).

**Gerekçe:** §8'in dört ölçütü sırayla:

1. *Kullanıcı gerçekten uyanabiliyor mu?* Intent, bildirim göstermez — telefonun
   **gerçek alarmını** kurar. Sessiz modda çalar, ses seviyesi alarm kanalındadır,
   Rahatsız Etmeyin'i standart olarak deler. Web bildirimi bunların hiçbirini yapmaz.
2. *Kurulum maliyeti?* Android'de sıfır: bir düğmeye basılıyor. iPhone'da bir
   kerelik dört adımlık kısayol — iki eylem sürükleniyor, isim yazılıyor. İkisinde
   de uygulama kurulmuyor, hesap açılmıyor, cron ayarlanmıyor, sunucu gerekmiyor.
   Kısayollar iOS'ta zaten yüklü geliyor.
3. *Kaç hareketli parça?* Bir: tarayıcı → saat uygulaması. ntfy'de dört
   (cron-job.org → Vercel → ntfy sunucusu → ntfy uygulaması); zincirin herhangi bir
   halkası sessizce kopabilir.
4. *Bozulduğunda fark edilir mi?* Evet. Alarm kurma dokunuşu kullanıcının kendi
   hareketidir ve saat uygulaması onay verir. Intent ya da kısayol açılmazsa
   uygulama saatleri ekranda gösterip ne yapılacağını yazar — sessizce başarısız
   olmaz.

**Elenenler ve nedeni:**

- **§8.2 ntfy** — birincil olamaz çünkü bildirim, alarm değildir; "en yüksek öncelik
  için uyarmaya devam et" ayarı açılmazsa tek bir bip olur ve kullanıcı uyanmaz. O
  ayarın açık olduğunu uygulama doğrulayamaz. Ayrıca dört halkalı bir zincir ve
  Vercel Hobby cron'u günde bir kez çalıştığı için dışarıdan bir servise bağımlı.
  Yine de **isteğe bağlı ikinci katman olarak eksiksiz kuruldu** — vakit
  hatırlatmaları için iyi, uyandırma için değil.
- **§8.3 MacroDroid** — kullanıcıya uygulama kurdurup makro yazdırıyor. Ölçüt 2'de
  ntfy'den de pahalı, karşılığında ntfy'ye göre kazandırdığı tek şey esneklik.
- **§8.4 Capacitor APK** — teknik olarak en iyi alarm bu (`AlarmManager`, uygulama
  kapalıyken çalar). Android Studio + JDK kurulumu, gradle sürüm hataları, her
  değişiklikte yeniden derleme gerekiyor. Ölçüt 2 bunu eliyor. Uygulama olgunlaşır
  ve alarm intent'i yetmezse doğru sonraki adım budur; kurulumu aşağıda.
- **§8.5 iOS `.ics`** — birincil olamaz: takvim bildirimi alarm değildir, sessiz
  modda susar ve tek uyarıyla geçer. §8.7 çıkınca ikincil katmana düştü; üretimi
  duruyor, arayüzde "bu bir alarm değil, takvim bildirimi" diye yazıyor.

**Bu yöntem şu durumda bozulur:**

- **Android'de tekrarlı alarm yok:** `SET_ALARM`'ın `DAYS` ek bilgisi
  `ArrayList<Integer>` ve `intent:` URI şemasında dizi yazılamıyor. Orada kalkış
  alarmı da tek seferlik kurulur, her akşam yeniden basmak gerekir.
- Kullanıcı Chrome dışında bir tarayıcı kullanırsa (Firefox `intent://` desteklemez).
- Cihaz üreticisi `SET_ALARM` intent'ini kısıtlarsa; bazı Xiaomi/Huawei ROM'larında
  `SKIP_UI` yok sayılır ve saat uygulaması açılır — alarm yine kurulur ama bir
  dokunuş daha ister.
- Uygulama ana ekrandan (standalone) açıldığında intent'i işleyen tarayıcı bağlamı
  değişebilir. Bu durumda uygulama saatleri gösterip elle kurmayı önerir.
- **iPhone'a özel:** kısayol hiç kurulmadıysa ya da adı uygulamadaki adla
  tutmuyorsa `shortcuts://` yalnız Kısayollar'ı açar, alarm kurulmaz. Uygulama
  bunu göremez; "kur"dan sonra "Kısayollar açılmadıysa kısayol yok ya da adı
  tutmuyor" uyarısını basar ve saat ekranda kalır. Kısayolun adı arayüzden
  değiştirilebilir.
- Kısayol URL'den ilk çalıştırıldığında iOS bir kez onay sorar; kullanıcı bunu
  kısayolun ayarlarından kapatmazsa her seferinde bir dokunuş daha ister.
- **Sessizce bozulmaz** ama **geriye dönük de çalışmaz:** alarm bir kez kurulur,
  kurulduktan sonra uygulama onu silemez veya güncelleyemez. Plan değişirse
  kullanıcının alarmı saat uygulamasından kendi düzeltmesi gerekir.

> **Doğrulama durumu — §8.7 gerçek bir iPhone'da baştan sona çalıştı.** Zincirin
> tamamı denendi: uygulamadaki bağlantı Safari'den Kısayollar'a geçti, `name`
> parametresindeki kısayolu buldu, `SS:DD` metnini `Get Dates from Input` ile
> tarihe çevirdi, `Create Alarm` o tarihte Saat uygulamasında **gerçek bir alarm
> kurdu**. §14'ün "gerçek bir cihazda denenmiş" maddesi iOS tarafında kapandı.
>
> Yol boyunca çıkan üç şey ve çözümleri:
>
> - Kısayol yokken Kısayollar "could not find the shortcut" diyor. Uyarı metni
>   "Kısayollar açılmadıysa" diyerek kullanıcıyı yanlış yere bakmaya gönderiyordu;
>   artık üç hâl ayrı yazılı.
> - Eylem adları cihazın diline göre değişiyor; Türkçe adlarla yazılmış yönerge
>   İngilizce telefonda aranamıyordu. İkisi de yazılıyor.
> - `x-success` kullanıcıyı ana ekrandaki uygulamadan Safari'ye atıyordu; artık
>   yalnız tarayıcıdayken veriliyor.
>
> **Hâlâ doğrulanmadı:** `Ledger Kalkış` kısayolunun `Her Gün` tekrarı ve
> **Android intent akışının tamamı** — elde Android telefon yok. §8.1 için §14
> maddesi açık duruyor.

## Yapı

```
index.html      uygulamanın tamamı — tek sayfa, alt tab bar ile beş görünüm
manifest.json
sw.js           çevrimdışı kabuk (SURUM tema/özellik değişince artırılır)
icons/
api/plan.js     Gemini — günlük plan üretir
api/review.js   Gemini — gün sonu değerlendirmesi
api/chat.js     Gemini — sohbet, plan/profil düzenleme
api/parse.js    Gemini — serbest metni etkinliğe çevirir
api/beslenme.js Gemini — §15 program / alternatif yemek / fotoğraftan kalori
api/tarif.js    §15 — bir yemek için çalışan YouTube tarif linki
api/push.js     ntfy'ye bildirim gönderir
```

## Canlı doğrulama

Dört yapay zeka fonksiyonu da üretimde, gerçek anahtarla denendi:

| Uç nokta | Sonuç |
|---|---|
| `api/parse` | "12 Eylül saat 14te berber" → `2026-09-12 / 14:00 / Berber` |
| `api/chat` | "Sabahları koşamıyorum" → koşu 16:30'a taşındı, kahvaltı korundu, profile satır düştü |
| `api/review` | 120 kelime altı düz metin, somut gözlem + tek ölçülebilir öneri, liste yok |
| `api/plan` | Kurs sabit ve akşam namazı için bölünmüş, kurs günü uyku iki parçalı, kahvaltı spordan 40 dk sonra, kod bloğu profildeki kanıta göre 10:30, ikindi borcuna karşılık bir kaza namazı, yatmadan 20 dk kitap |

### Plan düne uyar (§6)

Plan artık düz bir şablon değil. `api/plan` isteğinde ayrı bir **"Dün"** bölümü
var: dünkü maddeler `[x]/[ ]` işaretiyle, notlar, o günün `gununNotu`'su, **gün
sonu değerlendirmesi** ve kullanıcının tek cümlelik "dün nasıl geçti" notu.
İstem modele "bugünü düne göre ayarla — yarım kalanı taşı, aksayan maddenin
saatini/süresini değiştir, sabit şablon üretme; esnek blokların sırasını günden
güne değiştir" diyor. Çerçevedeki maddeler (§6 Değişmeyenler) sabit kalır.

Arayüzde: bir gün için henüz "günü değerlendir" yapılmadıysa, **"plan üret"e
basınca** önce "dün nasıl geçti? (bir cümle)" kutusu çıkar; cümle hem dünün
kaydına yazılır hem de isteğe gider. "Bu adımı geç" ile atlanabilir; her iki
durumda o gün tekrar sorulmaz.

### Planı konuş (§6, §10)

Plan sekmesi bir etkileşim merkezi. Sohbet (`api/chat` — planı ve profili
düzenler) plan maddelerinin hemen altında, **açık** duruyor ("Planı konuş"),
kapalı bir düğmenin arkasında değil. Üç giriş:

- **Serbest metin:** "Sabahları koşamıyorum, akşama alalım." → plan güncellenir.
- **Hızlı çipler:** "yorgunum", "koda +1 saat", "koşu akşama", "erken yat" —
  tek dokunuşla `api/chat`'e gider.
- **Madde bazlı:** bir plan maddesine dokun → not alanının yanındaki **"sor"**
  düğmesi sohbet girişine `08:20 Ev sporu — ` diye ön-doldurur, o maddeyi
  konuşmaya başlarsın.

## Model (§12)

Arka planda **Google Gemini**, ücretsiz katman. `api/_ortak.js` bütün AI
uçlarının (`plan`, `review`, `chat`, `parse`, `beslenme`) tek geçiş noktası.

### Neden Gemini, neden Claude değil

Claude API ücretli ve ücretsiz katmanı yok (Claude Pro aboneliği API'yi
kapsamaz). Groq / Cerebras / Mistral gibi ücretsiz alternatiflerin görsel
(vision) tarafı yemek fotoğrafında belirgin zayıf. `api/beslenme`'nin
fotoğraftan kalori tahmini için ücretsiz + iyi vision pratikte Gemini demek.
O yüzden sağlayıcı değil, dayanıklılık sertleştirildi.

### Model zinciri

```
MODELLER = ["gemini-2.5-flash", "gemini-3.6-flash"]
```

Birincil **`gemini-2.5-flash`**: ücretsiz katmanda kararlı, vision +
yapılandırılmış çıktı var. `gemini-3.6-flash` yedekte (`3.6` üretimde
güvenilmez göründü; `2.0` ise bir kez emekliye ayrılıp API'yi 404'e
düşürmüştü). Birincil model 404 dönerse **anında** sonrakine geçilir (retry
yok); hepsi aynı istek şeklini destekliyor (`responseSchema`,
`systemInstruction`, görsel parça).

### Geçici hatada yeniden deneme

- **Geçici:** HTTP `429, 500, 502, 503, 504`, ağ hatası, timeout, biçimsiz/boş
  cevap. Model başına **3 deneme**, üstel gecikmeyle (~0.4 sn → ~0.9 sn).
- **Kalıcı:** `400/401/403` → tek deneme, hemen bırak.
- Tüm zincir **40 sn bütçeyle** sınırlı; bittiğinde son hata `hataVer` ile
  ayrıştırılır (`429 → kota`, `503 → yogun`, diğer → `502`). İstemcinin
  "geçici yoğunluk yapay zekayı kalıcı kapatmasın" mantığı aynen duruyor.
- `vercel.json` `functions.maxDuration = 60` — retry bütçesi tek denemeden
  uzun sürebiliyor.

Ek maliyet yok, anahtar aynı `GEMINI_API_KEY`. Test: `test/api.js` içinde
"§12 sertleştirme" bölümü (503→toparlama, 404→ikincil model, zincir tükenişi,
400 tek-deneme).

## Görsel tasarım (§13, v2)

İlk §13 bilinçli olarak sade ve gamification'sızdı: kart yok (bölümler ince
çizgiyle ayrılırdı), tek vurgu rengi yalnız aktif vakitte, övgü ve rozet yok.
Kullanıcı "Grit / habit planner" görünümünü istedi; §13 o yönde yeniden yazıldı.
Değişen kararlar:

- **Kart tabanlı, camsı (glass) yüzeyler.** Her bölüm yuvarlak köşeli bir kart;
  namaz ve yarın kartları `backdrop-filter` ile camsı. Zeminde sıcak, çok soluk
  bir radyal ışıma (aktif vurgu ailesinden).
- **Vurgu artık tema rengi.** Hâlâ tek kaynak — `--vakit`, aktif namaz vaktine
  göre kayıyor (Sabah moru → Öğle altını → İkindi turuncusu → Akşam kızılı →
  Yatsı mavisi) — ama artık dar bir yerde değil: birincil düğmeler, ilerleme
  halkaları, plan saatleri, aktif sekme hep ondan besleniyor. Kural: bileşenler
  vurgu için `var(--vakit)` yazar, vakit hex'ini elle kopyalamaz (test bunu
  koruyor). Su kendi mavisini (`--su`), seri alevi kendi altınını (`--alev`)
  kullanır; ikisi de vakitten bağımsız.
- **Günlük seri (streak) ve ilerleme halkaları.** "Bugün" görünümünün üstünde
  ardışık *tam gün* sayısı (beş vaktin hepsi işaretli) ve üç halka: namaz, su,
  plan. Seri bugün bitmediyse dünden sayılır. Tonu olgu: "bugün tamam",
  "bugünün N vakti kaldı" — kutlama, "seri bozuldu", emoji yok (§14 hâlâ koruyor).
- **Alt tab bar.** Tek sayfa dört görünüme bölündü: **Bugün** (özet + namaz +
  kaza + su), **Seri** (istatistik), **Plan** (plan + etkinlik + gün sonu +
  sohbet), **Ayarlar** (yarın + profil + ayarlar). Seçilen sekme saklanır.
- **Seri / istatistik ekranı.** Ay takvimi (tam gün / kısmi / boş), son 7 günün
  başarı yüzdesi ve mini sütun grafiği, vakit bazında oranlar (her vakit kendi
  renginde), rozetler (7 gün kesintisiz, N tam gün, kaza kalmadı…). Hepsi mevcut
  gün kayıtlarından türetilir; yeni bir durum alanı tutulmaz.

Korunan §13 maddeleri: tek sütun, ortalı düzen; `tabular-nums` ile titremeyen
rakamlar; `prefers-reduced-motion` desteği; klavye erişimi ve görünür odak
halkası; hiçbir metnin kullanıcıyı övmemesi ve emoji kullanılmaması (§14).

## §15 — Beslenme (kilo alma odaklı)

Alt tab bar'a beşinci sekme **Beslenme**. Arkada Gemini; profil → kalori/makro
hedefi → günlük beslenme programı → öğün ve kilo takibi.

**Kalori hedefi istemcide hesaplanır.** Boy, kilo, yaş, cinsiyet ve aktivite ile
Mifflin-St Jeor BMR, aktivite faktörüyle çarpılıp TDEE; haftalık kilo hedefine
karşılık gelen kalori fazlası eklenir (`+0.35 kg/hafta ≈ +385 kcal`, 25'e
yuvarlı). Protein 1,8 g/kg, yağ kalorinin %25'i, karb kalanı. Deterministik,
çevrimdışı çalışır, test edilir (`kaloriHedefi`). Model bu hedefi bir girdi
olarak alır, kendi hesaplamaz. Güncel kilo son tartımdan gelir.

**Program** (`api/beslenme` `mod:program`). Profil + hedef + sevmediklerin +
(varsa) mevcut program → 4-6 öğün, her yemek için gramaj, kalori, makro, sade
market adlarıyla `malzemeler` listesi ve kısa bir tarif. Yapılandırılmış çıktı
(`responseSchema`) zorunlu. Günde en fazla 3 üretim; sayaç istemcide
(`beslenme.sayac`), `PLAN_SINIR` ile aynı kalıp. `GEMINI_API_KEY` yoksa üretim
kapanır; elle öğün girişi ve tartım çalışır. Ağ/model hatasında eldeki program
silinmez.

**Market (tarif malzemeleri + alışveriş listesi).** Elle malzeme girişi yok,
her şey onay kutusu. Bir yemeğin tarifi açıldığında malzemeler onay kutusu
olarak listelenir; işaretli = mutfağında var. Tek saklanan alan
`beslenme.market` (işaretli malzemeler); **Market listesi** bundan türetilir:
programdaki tüm malzemeler eksi işaretli olanlar (ada göre, büyük/küçük harf
duyarsız — `toLocaleLowerCase("tr")` — ve tekilleştirilmiş). Program'ın altında
iki blok: **Market listesi** (alınacaklar; işaretleyince mutfağa geçer) ve
**Mutfağımda** (işareti kaldırınca alışveriş listesine geri döner). Bir tarifte,
Market listesinde ve Mutfağımda'da aynı malzemenin kutusu hep aynı durumu
gösterir. Program da mutfak da boşsa blok çizilmez. `malzemeler` alanı §15'e
sonradan eklendi; daha önce üretilmiş bir programda bu alan yoktur — o zaman
hem tarif kartı hem Market listesi "programı yeniden üret" uyarısı gösterir.
Tamamen istemcide, `localStorage`'da; anahtar gerektirmez.

**Alternatif** (`mod:alternatif`). Bir yemeğe "beğenmedim" dersen, kalorisi ve
makroları yakın (±80 kcal) tek bir yemek gelir, yerine geçer; beğenmediğin yemek
`beslenme.sevmedigim`'e yazılır ve sonraki programlar da kaçınır.

**Tarif videosu** (`api/tarif`). Yemek adı → **çalışan** bir YouTube linki.
Katmanlı: `YOUTUBE_API_KEY` varsa Data API araması (kesin `watch?v=` linki);
yoksa `youtube.com/results` sayfasından ilk `videoId` çekilir; o da olmazsa arama
linkine düşer. Sonuç yemeğin içine önbelleklenir; ikinci açışta istek gitmez.
Bu uç nokta `GEMINI_API_KEY`'e bağlı değil.

**Öğün günlüğü.** "Bugün" görünümünde namaz/su/plan halkalarının yanına dördüncü
bir **kalori halkası** (bugün yenen / hedef) ve **Öğünler** kartı gelir (profil
varsa). Ne yediğini elle (ad + kcal) ya da **fotoğraftan** eklersin: istemci
görseli canvas ile ~768 px'e küçültüp `mod:foto` ile gönderir (Gemini görsel
destekli), yemek + kalori + makro tahmini döner, sen düzeltip onaylarsın.
`localStorage` şişmesin diye tam çözünürlük saklanmaz — ~256 px'lik bir önizleme
ve çözümlenen değerler tutulur. Fotoğraf akışı yalnız tarayıcıda çalışır;
`FileReader`/canvas yoksa sessizce elle girişe yönlendirir.

**Tartım.** Kilo günlüğü (`beslenme.tartim`), aynı güne ikinci giriş üzerine
yazılır. Küçük bir SVG eğri ve en küçük karelerle hesaplanan kg/hafta eğilimi
gösterilir — hedef hızıyla karşılaştırmak için.

**Felsefe.** §13/§14 ile aynı: övgü ve emoji yok ("2400 / 3029 kcal", "yaklaşık
+0.3 kg/hafta" gibi kuru olgu); veri telefonda; anahtarsız da temel işlevler
çalışır; sunucu durumsuz; kota istemcide.

## Yayına alma

**Canlı:** <https://ledger-muhammetsaltuks-projects.vercel.app>

Vercel projesi `muhammetsaltuks-projects/ledger`. Dağıtım koruması kapalı, yani
telefondan giriş yapmadan açılıyor.

Telefonda: adresi aç → paylaş → **Ana ekrana ekle**.

### Yeniden dağıtmak

Repo Vercel'e git ile **bağlı** (`muhammetsaltuks-projects/ledger`). `main`'e her
push otomatik olarak production'a dağıtılır; başka bir şey yapmaya gerek yok.

Bağlantı bir kez şöyle kuruldu: GitHub'da
[Vercel uygulamasına](https://github.com/apps/vercel) `ledger` reposu için erişim
verildi, sonra repo kökünde `npx vercel link` (mevcut `ledger` projesi seçildi) ve
`npx vercel git connect` çalıştırıldı.

Elle dağıtım (git bağlantısı koparsa ya da acil durumda):

```bash
npx vercel deploy --prod
```

### Gemini anahtarı

```bash
npx vercel env add GEMINI_API_KEY production
npx vercel deploy --prod        # veya main'e boş bir commit push et
```

`vercel env add` tek başına yeni dağıtım tetiklemez; anahtarın devreye girmesi için
bir dağıtım daha gerekir. Anahtar ücretsiz, kredi kartı istemiyor:
<https://aistudio.google.com/apikey>
→ "Create API key". Komut anahtarı soracak, terminale yapıştırırsın; kodda ve
git geçmişinde yer almaz.

`GEMINI_API_KEY` tanımlı olmasa da uygulama çalışır: namaz vakitleri, kaza borcu,
su, plan işaretleme, notlar, **beslenme kalori hedefi, elle öğün girişi ve
tartım** yapay zekâ olmadan işler. Sadece plan üretimi, değerlendirme, sohbet,
etkinlik çözümleme ve **beslenme programı / fotoğraftan kalori** devre dışı
kalır — arayüzde "Yapay zeka kapalı (GEMINI_API_KEY tanımlı değil)" yazar.

### İsteğe bağlı — YOUTUBE_API_KEY (§15)

Beslenme programındaki her yemek için gerçek bir YouTube tarif videosu linki
istiyorsan:

```bash
npx vercel env add YOUTUBE_API_KEY production
npx vercel deploy --prod
```

Anahtar [Google Cloud Console](https://console.cloud.google.com) → "YouTube Data
API v3" etkinleştir → "API key" ile alınır; ücretsiz katman günde 100 arama.
Tanımlı değilse `api/tarif` yine çalışır: `youtube.com/results` sayfasından ilk
videoyu çeker, o da olmazsa arama linkine düşer.

### İsteğe bağlı — ntfy (§8.2)

1. Telefona [ntfy](https://ntfy.sh) uygulamasını kur.
2. Ledger → Ayarlar → ntfy → önerilen rastgele topic adını kopyala.
3. ntfy uygulamasında o topic'e abone ol. Ayarlarda **"en yüksek öncelik için
   uyarmaya devam et"** ve **"anlık teslimat"** seçeneklerini aç.
4. [cron-job.org](https://cron-job.org) (ücretsiz, kredi kartı istemez) üzerinde beş
   dakikada bir çalışan bir iş oluştur; adres Ayarlar bölümünde hazır üretiliyor.

Topic adı gizli anahtar gibidir — bilen herkes sana bildirim gönderebilir. Uygulama
tahmin edilemez bir ad üretir; kendin bir şey yazma.

## Sonraki adımlar

**Capacitor APK (§8.4)** — intent yetmezse:

```bash
npm i -D @capacitor/cli @capacitor/core @capacitor/android
npx cap init Ledger com.muhammetsaltuk.ledger --web-dir=.
npx cap add android
npx cap sync
npx cap open android      # Android Studio açılır, Build > Build APK
```

`AlarmManager.setExactAndAllowWhileIdle` ile gerçek alarm kurulabilir; Play Store
hesabı gerekmez, APK doğrudan telefona yüklenir. Android 13+ için
`SCHEDULE_EXACT_ALARM` ve `POST_NOTIFICATIONS` izinleri manifeste eklenmeli.

**MacroDroid (§8.3)** — MacroDroid → Yeni makro → Tetikleyici: Webhook (URL) →
Eylem: Alarm kur. Üretilen webhook adresini `api/push.js`'e ikinci hedef olarak ver.


## Kabul kriterleri (§14)

`node test/hepsi.js` (166 test) ve `node test/api.js` (58 test) ile fiilen
deneniyor; tarayıcı-görünümü kontrolleri sahte DOM'da koşuyor. Düzen ölçümü
gereken bir şey için `test/kaydirma.mjs` (opsiyonel, playwright + WebKit ister).

| Kriter | Durum |
|---|---|
| Konum izni verilince o konuma, verilmeyince Bursa'ya göre | ✓ test |
| 07:30'da "aktif vakit yok, sıradaki Öğle" | ✓ test |
| Yatsı işaretlenmeden imsak geçince borç 1 artar | ✓ test |
| Günde beş kez açılınca borç bir kez artar | ✓ test |
| Üç gün açılmayıp sonra açılınca bütün vakitler doğru | ✓ test |
| Borç sıfırsa kaza bölümü hiç görünmez | ✓ test |
| 00:30'da işaretlenen yatsı dünün kaydına yazılır | ✓ test |
| Maddeye yazılan not ertesi günün plan isteğine girer | ✓ test |
| §6 plan düne uyar: "Dün" bölümü + gün sonu değerlendirmesi isteme girer | ✓ test |
| §6 "plan üret" değerlendirme yoksa önce "dün nasıl geçti?" sorar | ✓ test |
| "Koşuyu akşama al" hem planı hem profili değiştirir | ✓ test |
| §6/§10 "Planı konuş" paneli plan sekmesinde açık başlar | ✓ test |
| §6 hızlı çip doğrudan api/chat'e gider | ✓ test |
| §6 plan maddesinden "sor" sohbet girişini ön-doldurur | ✓ test |
| "12 Eylül saat 14'te berber" doğru çevrilir | ✓ test |
| Vurgu rengi ikindide turuncuya döner | ✓ test |
| `GEMINI_API_KEY` yokken uygulama çalışır | ✓ test |
| Uçak modunda çökmez | ✓ test |
| §12 geçici Gemini hatası (503/ağ) tek seferde toparlanır | ✓ test |
| §12 birincil model 404 (emekli) → ikincil modele düşülür | ✓ test |
| §12 kalıcı hata (400) yeniden denenmez | ✓ test |
| Beş vakti işaretli gün "tam", seri ardışık tam günü sayar | ✓ test |
| Bir vakit eksikse gün tam değil, seri o günde kırılır | ✓ test |
| İlerleme halkası deger/toplam gösterir; övgü, emoji yok | ✓ test |
| İstatistik çizimi boş gün kaydı oluşturmaz | ✓ test |
| Alt tab: "seri" istatistiği açar, Bugün bölümlerini gizler | ✓ test |
| Açılışta saklı sekme geri yüklenir | ✓ test |
| §15 kalori hedefi Mifflin-St Jeor + aktivite + fazla ile hesaplanır | ✓ test |
| §15 eksik/geçersiz profil hedefi vermez; kadın formülü ayrı | ✓ test |
| §15 tartım aynı güne üzerine yazar; kg/hafta eğilimi en küçük kareler | ✓ test |
| §15 program isteği hedefi taşır, kota 3/gün ve istemcide | ✓ test |
| §15 "beğenmedim" yemeği değiştirir, sevmediklerine ekler | ✓ test |
| §15 tarif malzemeleri onay kutusu; işaretsizler türetilmiş alışveriş listesi | ✓ test |
| §15 Market listesi ⇄ Mutfağımda kutuları aynı `beslenme.market` durumunu paylaşır | ✓ test |
| §15 malzemesiz eski program: tarif ve Market listesi "yeniden üret" uyarır | ✓ test |
| §15 program/alternatif istemi `malzemeler` ister, dizi olarak temizlenir | ✓ test |
| §15 api/tarif: anahtar varsa Data API, yoksa kazıma, sonra arama linki | ✓ test |
| §15 fotoğraf: görsel parça API'ye gider; güven geçersizse "dusuk" | ✓ test |
| §15 kalori halkası öğün toplamını yansıtır; profil yoksa çizilmez | ✓ test |
| §15 fotoğraf akışı tarayıcı yoksa sessizce elle girişe düşer | ✓ test |
| Hiçbir metin kullanıcıyı övmüyor, emoji yok | ✓ test |
| Vurgu tek kaynaktan (`--vakit`) gelir, su şeridine bulaşmaz | ✓ test |
| Ana ekrana eklenince adres çubuğu görünmez | ✓ manifest |
| Klavyeyle gezilebilir, odak halkası görünür | ✓ CSS + sahte DOM |
| 360-414 px'de hiçbir sekmede yatay kaydırma yok | ✓ WebKit render (`test/kaydirma.mjs`) + CSS regresyon |
| Seçilen alarm yöntemi gerçek cihazda denenmiş | ✗ **sende kaldı** |
| Alarm başarısız olunca kullanıcı görür | ✓ test |

Alarm intent'i gerçek bir Android telefonda denenmedi — bunu ancak sen
doğrulayabilirsin: **Ayarlar** sekmesindeki **Yarın** kartında "kur" düğmesine
bas, saat uygulamasını aç, alarm görünüyor mu bak. Sonucu bu dosyaya yaz.
Yeni tema gerçek bir telefonda göz denetiminden geçmedi (cam yüzeylerin
`backdrop-filter` görünümü, alt tab bar'ın güvenli alan payı). §15 fotoğraf
akışı (canvas küçültme, `capture` ile kamera, Gemini görsel çözümlemesi) ve
`api/tarif`'in gerçek YouTube kazıması da gerçek cihazda / gerçek ağda
denenmedi — sahte DOM'da yalnız çevresi test edildi.

### Erişilebilirlik ölçümleri

Metin/zemin kontrastı (`#0E1318` zemine karşı):

| Renk | Oran |
|---|---|
| `--metin` | 14.98 |
| `--sonuk` | 5.26 |
| `--tamam` | 5.95 |
| `--eksik` | 4.03 — metin rengi olarak kullanılmıyor, yalnız kenar çizgisi |

Vurgu (`--vakit`) v2'de geniş kullanılıyor. İki ayrı kullanım, iki ayrı eşik:

- **Dolgu olarak** (birincil düğme, takvimde "tam gün", halka çizgisi): üstündeki
  yazı koyu (`#15100A`), kontrast beş rengin hepsinde 7:1'in üstünde.
- **Zemine karşı çizgi/işaret rengi olarak** (halka yayı, aktif vakit adı, aktif
  sekme): Öğle 11.1, İkindi 7.9, Akşam 5.3, Sabah 4.8 — hepsi 4.5:1'i geçiyor;
  **Yatsı 3.90**, WCAG'ın metin eşiğinin altında ama grafik/arayüz bileşeni
  eşiğinin (3:1) ve büyük-metin eşiğinin üstünde. Aktif vakit adı 1,9 rem
  (büyük metin) olduğu için kalıyor; şartname rengi korundu.

## Geliştirme

Derleme yok, bağımlılık yok. Yerelde:

```bash
npx serve .          # veya: python -m http.server
```

`api/*` fonksiyonlarını yerelde çalıştırmak için `npx vercel dev` gerekir.

### Test

```bash
node test/hepsi.js   # uygulama: §14 kabul kriterleri
node test/api.js     # api/ fonksiyonları

# opsiyonel — gerçek düzen ölçümü (dep + tarayıcı iner):
npm i -D playwright && npx playwright install webkit
node test/kaydirma.mjs   # 360-414 px'de her sekmede yatay kaydırma var mı
```

`test/kosum.js` index.html içindeki betiği sahte bir DOM'da çalıştırır; saati
ileri alabildiği için "üç gün sonra açılınca borç doğru mu", "00:30'da
işaretlenen yatsı hangi güne yazılıyor" gibi şeyler fiilen denenebiliyor.
Ağ isteği atılmaz: aladhan ve `api/` uydurulur. Tarayıcı gerekmez.

`test/kaydirma.mjs` sahte DOM'un ölçemediği tek şey için: WebKit'te gerçek
render, bütün bölümleri uzun bölünemez metinlerle doldurup her sekmede
`scrollWidth <= innerWidth` kontrol eder. "no deps" kuralının dışında, o yüzden
varsayılan akışta değil; `hepsi.js` yalnız ilgili CSS değişmezlerini denetler.

Şartnamede test istenmiyordu; §0'ın "çalıştır, tarihi ileri al, sınır
durumlarını dene" maddesini kodu okuyarak yerine getirmenin yolu yoktu.
