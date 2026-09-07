# Ledger

## Alarm yöntemi

**Seçilen:** Cihaza göre iki dal; ikisi de aynı işi yapar — telefonun kendi saat
uygulamasına **gerçek alarm** kurar, bildirim göndermez.

- **Android → §8.1** `intent://` ile `SET_ALARM`.
- **iPhone → §8.7** Kısayollar. Saat uygulamasının açık bir URL şeması yok, ama
  Kısayollar'ın `Alarm Oluştur` eylemi var ve bir kısayol `shortcuts://` ile
  dışarıdan çalıştırılabiliyor. Uygulama kısayola yalnız `SS:DD` metnini geçirir.

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

> **Doğrulama durumu:** Her iki akış da sahte DOM'da, kendi cihaz kimlikleriyle
> test edildi (§8.1 intent adresi, §8.7 kısayol adresi, kurulum yönergesinin yalnız
> iPhone'da çıkması, kısayol adının bağlantıya taşınması).
>
> **Gerçek iPhone'da doğrulanan:** `shortcuts://x-callback-url/run-shortcut`
> bağlantısı Safari'den açılıyor, Kısayollar uygulaması devralıyor ve `name`
> parametresindeki adı arıyor — kısayol yokken "kısayol bulunamadı" hatası
> veriyor. Yani şema ve ad geçişi çalışıyor.
>
> **Hâlâ doğrulanmadı:** `Alarm Oluştur` eyleminin saat alanının
> `Metinden Tarih Al` çıktısını kabul edip Saat uygulamasında gerçekten alarm
> kurması. §14'ün "gerçek bir cihazda denenmiş" maddesi bu yüzden açık duruyor.
> Android intent akışı da gerçek cihazda hiç denenmedi.

## Yapı

```
index.html      uygulamanın tamamı
manifest.json
sw.js           çevrimdışı kabuk
icons/
api/plan.js     Gemini — günlük plan üretir
api/review.js   Gemini — gün sonu değerlendirmesi
api/chat.js     Gemini — sohbet, plan/profil düzenleme
api/parse.js    Gemini — serbest metni etkinliğe çevirir
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

## Model

§12 `gemini-2.0-flash` diyordu; o model emekliye ayrıldı ve API 404 ile
`models/gemini-3.6-flash` kullanılmasını söylüyor. Google'ın gösterdiği halefe
geçildi — `api/_ortak.js` içinde tek satır. Yapılandırılmış çıktı ve ücretsiz
katman aynı şekilde çalışıyor.

## Yayına alma

**Canlı:** <https://ledger-muhammetsaltuks-projects.vercel.app>

Vercel projesi `muhammetsaltuks-projects/ledger`. Dağıtım koruması kapalı, yani
telefondan giriş yapmadan açılıyor.

Telefonda: adresi aç → paylaş → **Ana ekrana ekle**.

### Yeniden dağıtmak

Repo Vercel'e git ile bağlı **değil** — bağlamak için GitHub tarafında
[Vercel uygulamasının](https://github.com/apps/vercel) `ledger` reposuna kurulu
olması gerekiyor. Kurulduktan sonra `npx vercel git connect` bir kez çalıştırılır
ve her push kendiliğinden dağıtılır. O zamana kadar elle:

```bash
npx vercel deploy --prod
```

### Gemini anahtarı

```bash
npx vercel env add GEMINI_API_KEY production
npx vercel deploy --prod
```

Anahtar ücretsiz, kredi kartı istemiyor: <https://aistudio.google.com/apikey>
→ "Create API key". Komut anahtarı soracak, terminale yapıştırırsın; kodda ve
git geçmişinde yer almaz.

`GEMINI_API_KEY` tanımlı olmasa da uygulama çalışır: namaz vakitleri, kaza borcu,
su, plan işaretleme ve notlar yapay zekâ olmadan işler. Sadece plan üretimi,
değerlendirme, sohbet ve etkinlik çözümleme devre dışı kalır — arayüzde
"Yapay zeka kapalı (GEMINI_API_KEY tanımlı değil)" yazar.

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

`node test/hepsi.js` ve `node test/api.js` ile fiilen deneniyor; tarayıcı
kontrolleri headless Edge ile yapıldı.

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
| "Koşuyu akşama al" hem planı hem profili değiştirir | ✓ test |
| "12 Eylül saat 14'te berber" doğru çevrilir | ✓ test |
| Vurgu rengi ikindide turuncuya döner | ✓ test |
| `GEMINI_API_KEY` yokken uygulama çalışır | ✓ test |
| Uçak modunda çökmez | ✓ test |
| Ana ekrana eklenince adres çubuğu görünmez | ✓ manifest |
| 360 px'de yatay kaydırma yok | ✓ tarayıcı |
| Klavyeyle gezilebilir, odak halkası görünür | ✓ tarayıcı |
| Seçilen alarm yöntemi gerçek cihazda denenmiş | ✗ **sende kaldı** |
| Alarm başarısız olunca kullanıcı görür | ✓ test |

Son iki satır dışında hepsi otomatik denetimde. Alarm intent'i gerçek bir
Android telefonda denenmedi — bunu ancak sen doğrulayabilirsin: Ayarlar'ın
üstündeki **Yarın** bölümünde "kur" düğmesine bas, saat uygulamasını aç, alarm
görünüyor mu bak. Sonucu bu dosyaya yaz.

### Erişilebilirlik ölçümleri

Metin/zemin kontrastı (§13 en az 4.5:1 istiyor):

| Renk | Oran |
|---|---|
| `--metin` | 14.98 |
| `--sonuk` | 5.26 |
| `--tamam` | 5.95 |
| `--eksik` | 4.03 — bu yüzden metin rengi olarak kullanılmıyor, yalnız kenar çizgisi |

Vurgu rengi (`--vakit`) 2,6 rem'lik aktif vakit adında kullanılıyor. Öğle
(11.14), İkindi (7.92), Akşam (5.35) ve Sabah (4.79) sınırı geçiyor; **Yatsı
(#6478A8) 2.85'te kalıyor.** §13 hem paleti hem 4.5:1 kuralını sabitlediği
için bu ikisi aynı anda tutmuyor; şartname değeri olduğu gibi bırakıldı.

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
```

`test/kosum.js` index.html içindeki betiği sahte bir DOM'da çalıştırır; saati
ileri alabildiği için "üç gün sonra açılınca borç doğru mu", "00:30'da
işaretlenen yatsı hangi güne yazılıyor" gibi şeyler fiilen denenebiliyor.
Ağ isteği atılmaz: aladhan ve `api/` uydurulur. Tarayıcı gerekmez.

Şartnamede test istenmiyordu; §0'ın "çalıştır, tarihi ileri al, sınır
durumlarını dene" maddesini kodu okuyarak yerine getirmenin yolu yoktu.
