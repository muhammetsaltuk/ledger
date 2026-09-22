/* api/ fonksiyonlarını doğrudan çalıştırır: gövde doğrulama, istem kurulumu,
   şema zorlaması ve hata yolları. Gemini'ye gerçek istek atılmaz, uydurulur.
   node test/api.js */

process.env.LEDGER_TEST = "1";     // §12 retry backoff'u testte beklemesin

let gecen = 0, kalan = 0;

function bolum(ad){ console.log("\n— " + ad); }
async function dene(ad, f){
  try{ await f(); gecen++; console.log("  ✓ " + ad); }
  catch(e){ kalan++; console.log("  ✗ " + ad + "\n      " + (e && e.message)); }
}
function esit(a, b, not){
  if(a !== b) throw new Error((not ? not + ": " : "") + "beklenen " + JSON.stringify(b) + ", gelen " + JSON.stringify(a));
}
function dogru(k, not){ if(!k) throw new Error(not || "doğru bekleniyordu"); }
function icerir(m, p){
  if(String(m).indexOf(p) === -1) throw new Error("bulunamadı: " + JSON.stringify(p));
}
function icermez(m, p){
  if(String(m).indexOf(p) !== -1) throw new Error("olmamalıydı: " + JSON.stringify(p));
}

/* --- Sahte istek / cevap --------------------------------------- */
function istek(govde, yontem){
  return { method: yontem || "POST", body: govde };
}
function cevap(){
  const c = { kod:null, veri:null };
  c.status = k => { c.kod = k; return c; };
  c.json   = v => { c.veri = v; return c; };
  return c;
}

/** Gemini'yi taklit et; her çağrıyı sakla. `uret(govde, cagriNo)` çağrı sırasına
    göre farklı cevap verebilir. Dönüş biçimleri:
      { metin: "..." }            → 200, gövdesi bu metin
      { durum: 503, metin: "…" }  → HTTP hatası
      { at: "ağ yok" }            → fetch fırlatır (ağ/timeout)               */
function geminiTaklit(uret){
  const kayit = { istekler: [] };
  global.fetch = async (url, secenek) => {
    const govde = JSON.parse(secenek.body);
    kayit.istekler.push({ url, govde });
    const sonuc = uret(govde, kayit.istekler.length) || {};
    if(sonuc.at) throw new Error(sonuc.at);
    if(sonuc.durum && sonuc.durum !== 200){
      return { ok:false, status:sonuc.durum, text: async () => sonuc.metin || "hata" };
    }
    return {
      ok: true, status: 200,
      text: async () => (typeof sonuc.ham === "string" ? sonuc.ham : JSON.stringify({
        candidates: [{ content: { parts: [{ text: sonuc.metin }] } }]
      }))
    };
  };
  return kayit;
}
/** Modelleri URL'den çıkar (istek sırasında). */
function cagriModelleri(kayit){
  return kayit.istekler.map(i => (String(i.url).match(/models\/([\w.-]+):/) || [])[1]);
}

const PLAN_CEVABI = JSON.stringify({
  tarih: "2026-09-07",
  maddeler: [
    { saat:"09:05", sure:30,  baslik:"Kahvaltı", tur:"yemek", gerekce:"" },
    { saat:"08:00", sure:10,  baslik:"Kalk, bir bardak su", tur:"uyku", gerekce:"Dün 08:40" },
    { saat:"18:00", sure:240, baslik:"İngilizce kursu", tur:"kurs" },
    { saat:"bozuk", sure:"x", baslik:"Saati bozuk madde", tur:"uydurma-tur" },
    { saat:"22:30", sure:20,  baslik:"" }                       // başlıksız: elenmeli
  ],
  gununNotu: "Pazartesi kursun 18:00'de."
});

const ORNEK_GOVDE = {
  tarih: "2026-09-07",
  gunAdi: "Pazartesi",
  kurs: { bas:"18:00", bit:"22:00" },
  vakitler: { Sabah:"05:02–06:30", Öğle:"13:07–16:43" },
  etkinlikler: [{ tarih:"2026-09-12", saat:"14:00", sure:60, baslik:"Berber" }],
  profil: "08:00 alarmına rağmen ortalama 08:35'te kalkıyor.",
  son14: [{ tarih:"2026-09-06", gunAdi:"Pazar", namaz:"yatsi:vaktinde", su:6,
            maddeler:[{ saat:"08:00", baslik:"Kalk", yapildi:false, not:"09:10'da kalktım" }] }],
  borc: { sabah:0, ogle:0, ikindi:2, aksam:0, yatsi:1 }
};

(async function(){

bolum("api/plan — anahtar ve yöntem");

await dene("anahtar yoksa 503 döner, uygulama bunu anlayabilir", async () => {
  delete process.env.GEMINI_API_KEY;
  delete require.cache[require.resolve("../api/_ortak")];
  delete require.cache[require.resolve("../api/plan")];
  const plan = require("../api/plan");
  const c = cevap();
  await plan(istek(ORNEK_GOVDE), c);
  esit(c.kod, 503);
  esit(c.veri.hata, "anahtar-yok");
});

await dene("GET reddedilir", async () => {
  process.env.GEMINI_API_KEY = "test-anahtari";
  delete require.cache[require.resolve("../api/_ortak")];
  delete require.cache[require.resolve("../api/plan")];
  const plan = require("../api/plan");
  const c = cevap();
  await plan(istek(ORNEK_GOVDE, "GET"), c);
  esit(c.kod, 405);
});

bolum("api/plan — istem ve şema");

process.env.GEMINI_API_KEY = "test-anahtari";
delete require.cache[require.resolve("../api/_ortak")];
delete require.cache[require.resolve("../api/plan")];
const plan = require("../api/plan");

await dene("istem §6'nın bütün girdilerini taşır", async () => {
  const kayit = geminiTaklit(() => ({ metin: PLAN_CEVABI }));
  const c = cevap();
  await plan(istek(ORNEK_GOVDE), c);
  esit(c.kod, 200);

  const g = kayit.istekler[0].govde;
  const metin = g.contents[0].parts[0].text;
  icerir(metin, "2026-09-07");
  icerir(metin, "Pazartesi");
  icerir(metin, "18:00 - 22:00");            // kurs saatleri
  icerir(metin, "Sabah: 05:02–06:30");       // namaz vakitleri
  icerir(metin, "ikindi 2");                 // kaza borcu
  icerir(metin, "Berber");                   // yaklaşan etkinlik
  icerir(metin, "08:35");                    // profil
  icerir(metin, "09:10'da kalktım");         // dünün notları
  icerir(metin, "Kahvaltı, spordan sonraki 45 dakika içinde");   // çerçeve
});

await dene("§17 java yoksa istemde 'aktif değil' notu, java varsa hafta/faz/gün türü", async () => {
  const kayit = geminiTaklit(() => ({ metin: PLAN_CEVABI }));
  await plan(istek(ORNEK_GOVDE), cevap());
  icerir(kayit.istekler[0].govde.contents[0].parts[0].text,
    "Roadmap bu tarihte aktif değil");

  const kayit2 = geminiTaklit(() => ({ metin: PLAN_CEVABI }));
  const govde = Object.assign({}, ORNEK_GOVDE, {
    java: { hafta: 5, tur: "calisma", faz: "Web ve veritabanı temelleri" }
  });
  await plan(istek(govde), cevap());
  const metin = kayit2.istekler[0].govde.contents[0].parts[0].text;
  icerir(metin, "Hafta 5/20 — Web ve veritabanı temelleri");
  icerir(metin, "toplam 4,5 saat Java eğitimi");
  icerir(metin, "1 saat");        // çerçevedeki sabit blok tarifi
  icerir(metin, "ogrenme");       // yeni tür, çerçevede geçiyor
});

/** api/plan hem Gemini'ye (generativelanguage) hem Notion'a (api.notion.com)
    istek atar; iki ayrı sahte servisi tek fetch'te birbirinden ayırır. */
function planIleNotionTaklit(sayfalar){
  const genKayit = { istekler: [] };
  global.fetch = async (url, secenek) => {
    const u = String(url);
    if(u.indexOf("generativelanguage") !== -1){
      const govde = JSON.parse(secenek.body);
      genKayit.istekler.push({ url, govde });
      return { ok:true, status:200, text: async () => JSON.stringify({
        candidates: [{ content: { parts: [{ text: PLAN_CEVABI }] } }]
      }) };
    }
    const m = u.match(/\/blocks\/([\w-]+)\/children/);
    if(m) return { ok:true, status:200, json: async () => ({
      results: sayfalar[m[1]] || [], has_more:false, next_cursor:null }) };
    return { ok:false, status:404, text: async () => "bulunamadı" };
  };
  return genKayit;
}

await dene("§17 bugünün Java konusu Notion'dan okunup hem prompta hem cevaba giriyor", async () => {
  process.env.NOTION_API_KEY = "test-notion-anahtari";
  const genKayit = planIleNotionTaklit({
    "3e2921af4e678190969bf7c335da3e0c": [
      baslik("Hafta 5 — HTTP ve REST"),
      paragraf("Hafta sonunda REST tasarımı yapabilmelisin."),
      tablo("tablo-5"),
      paragraf("Algoritma (her gün 1 saat): 7 soru."),
      { type:"divider", divider:{} }
    ],
    "tablo-5": [
      satir([hucre("Gün"), hucre("Konu"), hucre("Kaynak"), hucre("Uygulama")]),
      satir([hucre("1"), hucre("HTTP metotları, durum kodları"),
             hucre("MDN HTTP", "https://developer.mozilla.org/HTTP"),
             hucre("Postman ile GET/POST dene")]),
      satir([hucre("2"), hucre("REST tasarımı"), hucre("REST API Tutorial"), hucre("Basit bir API tasarla")])
    ]
  });

  const govde = Object.assign({}, ORNEK_GOVDE, {
    java: { hafta:5, tur:"calisma", faz:"Web ve veritabanı temelleri", gun:1 }
  });
  const c = cevap();
  await plan(istek(govde), c);
  esit(c.kod, 200);

  const metin = genKayit.istekler[0].govde.contents[0].parts[0].text;
  icerir(metin, "HTTP metotları, durum kodları");
  icerir(metin, "developer.mozilla.org/HTTP");
  icerir(metin, "Postman ile GET/POST dene");
  icerir(metin, "Algoritma (her gün 1 saat): 7 soru.");

  dogru(c.veri.javaGunu, "javaGunu cevaba girmeli");
  esit(c.veri.javaGunu.hafta, 5);
  esit(c.veri.javaGunu.konu, "HTTP metotları, durum kodları");

  delete process.env.NOTION_API_KEY;
});

await dene("§17 Notion okunamazsa plan yine üretilir, javaGunu null olur", async () => {
  process.env.NOTION_API_KEY = "test-notion-anahtari";
  const genKayit = { istekler: [] };
  global.fetch = async (url, secenek) => {
    if(String(url).indexOf("generativelanguage") !== -1){
      genKayit.istekler.push(url);
      return { ok:true, status:200, text: async () => JSON.stringify({
        candidates: [{ content: { parts: [{ text: PLAN_CEVABI }] } }]
      }) };
    }
    return { ok:false, status:500, text: async () => "notion çöktü" };
  };
  const govde = Object.assign({}, ORNEK_GOVDE, {
    java: { hafta:5, tur:"calisma", faz:"Web ve veritabanı temelleri", gun:1 }
  });
  const c = cevap();
  await plan(istek(govde), c);
  esit(c.kod, 200, "Notion çökse de plan üretimi başarısız olmamalı");
  esit(c.veri.javaGunu, null);
  dogru(genKayit.istekler.length > 0, "Gemini yine de çağrılmalı");
  delete process.env.NOTION_API_KEY;
});

await dene("§17 tatil gününde Notion'a hiç gidilmez (anahtar var olsa da)", async () => {
  process.env.NOTION_API_KEY = "test-notion-anahtari";
  const genKayit = geminiTaklit(() => ({ metin: PLAN_CEVABI }));
  const govde = Object.assign({}, ORNEK_GOVDE, {
    java: { hafta:5, tur:"tatil", faz:"Web ve veritabanı temelleri", gun:null }
  });
  const c = cevap();
  await plan(istek(govde), c);
  esit(c.kod, 200);
  esit(c.veri.javaGunu, null);
  esit(genKayit.istekler.length, 1, "yalnız Gemini'ye gidilmeli, Notion'a değil");
  delete process.env.NOTION_API_KEY;
});

await dene("§17 NOTION_API_KEY yokken çalışma gününde de Notion'a hiç gidilmez", async () => {
  delete process.env.NOTION_API_KEY;
  const genKayit = geminiTaklit(() => ({ metin: PLAN_CEVABI }));
  const govde = Object.assign({}, ORNEK_GOVDE, {
    java: { hafta:5, tur:"calisma", faz:"Web ve veritabanı temelleri", gun:1 }
  });
  const c = cevap();
  await plan(istek(govde), c);
  esit(c.kod, 200);
  esit(c.veri.javaGunu, null);
  esit(genKayit.istekler.length, 1, "yalnız Gemini'ye gidilmeli, Notion'a değil");
});

await dene("§6 dün uyumu: 'Dün' bölümü + değerlendirme + tek cümle isteme girer", async () => {
  const kayit = geminiTaklit(() => ({ metin: PLAN_CEVABI }));
  const govde = Object.assign({}, ORNEK_GOVDE, {
    dun: "akşam yoruldum, kodu bitiremedim",
    son14: [
      { tarih:"2026-08-30", gunAdi:"Cumartesi", namaz:"", su:4,
        maddeler:[{ saat:"10:00", baslik:"Eski madde", yapildi:true, not:"" }] },
      { tarih:"2026-09-06", gunAdi:"Pazar", namaz:"yatsi:vaktinde", su:6,
        maddeler:[
          { saat:"09:00", baslik:"Kod bloğu", yapildi:false, not:"yarıda bıraktım" },
          { saat:"16:30", baslik:"Koşu", yapildi:true, not:"" }
        ],
        gununNotu:"Pazar, kurs yok.",
        degerlendirme:"Kod bloğunu yarıda bırakıyorsun. Yarın 10:30'da başlat.",
        kullaniciNotu:"" }
    ]
  });
  await plan(istek(govde), cevap());
  const metin = kayit.istekler[0].govde.contents[0].parts[0].text;
  icerir(metin, "## Dün");
  icerir(metin, "[x] 16:30 Koşu");                          // yapıldı işareti
  icerir(metin, "[ ] 09:00 Kod bloğu");                     // yapılmadı işareti
  icerir(metin, "yarıda bıraktım");
  icerir(metin, "gün sonu değerlendirmesi: Kod bloğunu yarıda");
  icerir(metin, "Kullanıcının az önce yazdığı: akşam yoruldum");
  icerir(metin, "## Daha önceki günler");
  icerir(metin, "2026-08-30");                              // eski gün geçmişte
  if(metin.indexOf("## Dün") > metin.indexOf("## Daha önceki günler"))
    throw new Error("'Dün' bölümü 'Daha önceki günler'den önce olmalı");
});

await dene("§6 dün uyumu: sabit-şablon-üretme ve düne-göre-ayarla talimatı istemde", async () => {
  const kayit = geminiTaklit(() => ({ metin: PLAN_CEVABI }));
  await plan(istek(ORNEK_GOVDE), cevap());
  const metin = kayit.istekler[0].govde.contents[0].parts[0].text;
  icerir(metin, "Sabit şablon üretme");
  icerir(metin, "Bugünü düne göre ayarla");
  icerir(metin, "Çerçevedeki maddeler");                    // frame sabit kalıyor
});

await dene("sistem promptu §12'deki kurallarla gider", async () => {
  const kayit = geminiTaklit(() => ({ metin: PLAN_CEVABI }));
  await plan(istek(ORNEK_GOVDE), cevap());
  const sis = kayit.istekler[0].govde.systemInstruction.parts[0].text;
  icerir(sis, "Övme.");
  icerir(sis, "Emoji kullanma.");
  icerir(sis, "suçlayıcı veya utandırıcı");
});

await dene("yapılandırılmış çıktı zorunlu, birincil model gemini-2.5-flash", async () => {
  const kayit = geminiTaklit(() => ({ metin: PLAN_CEVABI }));
  await plan(istek(ORNEK_GOVDE), cevap());
  const g = kayit.istekler[0].govde;
  esit(g.generationConfig.responseMimeType, "application/json");
  dogru(g.generationConfig.responseSchema, "responseSchema gitmeli");
  icerir(kayit.istekler[0].url, "gemini-2.5-flash:generateContent");
  icerir(kayit.istekler[0].url, "key=test-anahtari");
});

bolum("api/plan — gelen veri sağlaması");

await dene("saate göre sıralanır, bozuk alanlar temizlenir, başlıksız madde elenir", async () => {
  geminiTaklit(() => ({ metin: PLAN_CEVABI }));
  const c = cevap();
  await plan(istek(ORNEK_GOVDE), c);
  const m = c.veri.maddeler;
  esit(m.length, 4, "başlıksız madde elenmeli");
  esit(m[0].saat, "08:00", "saate göre sıralı");
  esit(m[1].saat, "09:05");
  const bozuk = m.find(x => x.baslik === "Saati bozuk madde");
  esit(bozuk.saat, "", "geçersiz saat boşaltılmalı");
  esit(bozuk.sure, null, "geçersiz süre null olmalı");
  esit(bozuk.tur, "bos", "bilinmeyen tür 'bos'a düşmeli");
});

await dene("model ```json ile sararsa da çözülür", async () => {
  geminiTaklit(() => ({ metin: "```json\n" + PLAN_CEVABI + "\n```" }));
  const c = cevap();
  await plan(istek(ORNEK_GOVDE), c);
  esit(c.kod, 200);
  dogru(c.veri.maddeler.length > 0);
});

bolum("api/plan — hata yolları");

await dene("boş plan gelirse 502, sessizce boş plan yazılmaz", async () => {
  geminiTaklit(() => ({ metin: JSON.stringify({ tarih:"2026-09-07", maddeler:[] }) }));
  const c = cevap();
  await plan(istek(ORNEK_GOVDE), c);
  esit(c.kod, 502);
  esit(c.veri.hata, "model");
});

await dene("kota hatası 429 olarak geçer, mesajı kullanıcıya uygun", async () => {
  geminiTaklit(() => ({ durum:429, metin:"RESOURCE_EXHAUSTED" }));
  const c = cevap();
  await plan(istek(ORNEK_GOVDE), c);
  esit(c.kod, 429);
  esit(c.veri.hata, "kota");
  icerir(c.veri.mesaj, "kotası doldu");
});

await dene("geçici yoğunluk 503 olarak ayrı geçer, kota ile karışmaz", async () => {
  geminiTaklit(() => ({ durum:503, metin:"UNAVAILABLE" }));
  const c = cevap();
  await plan(istek(ORNEK_GOVDE), c);
  esit(c.kod, 503);
  esit(c.veri.hata, "yogun");
  icerir(c.veri.mesaj, "yoğun");
});

await dene("sistem promptu kullanıcıya 'sen' diye hitap ettirir", async () => {
  const kayit = geminiTaklit(() => ({ metin: PLAN_CEVABI }));
  await plan(istek(ORNEK_GOVDE), cevap());
  icerir(kayit.istekler[0].govde.systemInstruction.parts[0].text, '"sen" diye hitap et');
});

await dene("gövde okunamazsa 400", async () => {
  const c = cevap();
  await plan(istek("bu json değil"), c);
  esit(c.kod, 400);
});

await dene("anahtar hiçbir hata mesajında geçmez", async () => {
  geminiTaklit(() => ({ durum:400, metin:"API key not valid: test-anahtari" }));
  const c = cevap();
  await plan(istek(ORNEK_GOVDE), c);
  const yazi = JSON.stringify(c.veri);
  if(yazi.indexOf("test-anahtari") !== -1) throw new Error("anahtar cevaba sızdı");
});

/* --------------------------------------------------------------- */

bolum("api/_ortak — §12 sertleştirme: retry + model zinciri");

await dene("503 sonra başarı: kendini toparlar, kullanıcı hata görmez", async () => {
  const kayit = geminiTaklit((g, n) => n === 1 ? { durum:503, metin:"UNAVAILABLE" } : { metin: PLAN_CEVABI });
  const c = cevap();
  await plan(istek(ORNEK_GOVDE), c);
  esit(c.kod, 200, "ikinci denemede başarılı");
  esit(kayit.istekler.length, 2);
  esit(cagriModelleri(kayit)[1], "gemini-2.5-flash", "aynı modelde yeniden denendi");
});

await dene("ağ/timeout hatası da geçici sayılır, yeniden denenir", async () => {
  const kayit = geminiTaklit((g, n) => n === 1 ? { at:"ECONNRESET" } : { metin: PLAN_CEVABI });
  const c = cevap();
  await plan(istek(ORNEK_GOVDE), c);
  esit(c.kod, 200);
  esit(kayit.istekler.length, 2);
});

await dene("birincil model 404 (emekli) → retry yok, ikincil modele düşer", async () => {
  const kayit = geminiTaklit((g, n) => n === 1
    ? { durum:404, metin:"models/gemini-2.5-flash is not found" }
    : { metin: PLAN_CEVABI });
  const c = cevap();
  await plan(istek(ORNEK_GOVDE), c);
  esit(c.kod, 200);
  esit(kayit.istekler.length, 2, "404'te aynı modelde tekrar denenmez");
  esit(cagriModelleri(kayit)[0], "gemini-2.5-flash");
  esit(cagriModelleri(kayit)[1], "gemini-3.6-flash", "ikincil modele geçildi");
});

await dene("birincil model geçici hatada tükenince ikincile geçilir", async () => {
  const kayit = geminiTaklit((g, n) => n <= 3 ? { durum:503, metin:"UNAVAILABLE" } : { metin: PLAN_CEVABI });
  const c = cevap();
  await plan(istek(ORNEK_GOVDE), c);
  esit(c.kod, 200);
  esit(kayit.istekler.length, 4, "birincil 3 deneme + ikincil 1");
  esit(cagriModelleri(kayit).slice(0,3).join(","), "gemini-2.5-flash,gemini-2.5-flash,gemini-2.5-flash");
  esit(cagriModelleri(kayit)[3], "gemini-3.6-flash");
});

await dene("her iki model de 503: zincir tükenince 503 döner, kota ile karışmaz", async () => {
  const kayit = geminiTaklit(() => ({ durum:503, metin:"UNAVAILABLE" }));
  const c = cevap();
  await plan(istek(ORNEK_GOVDE), c);
  esit(c.kod, 503);
  esit(c.veri.hata, "yogun");
  esit(kayit.istekler.length, 6, "2 model × 3 deneme");
});

await dene("400 kötü istek: geçici değil, hiç yeniden denenmez", async () => {
  const kayit = geminiTaklit(() => ({ durum:400, metin:"INVALID_ARGUMENT" }));
  const c = cevap();
  await plan(istek(ORNEK_GOVDE), c);
  esit(c.kod, 502);
  esit(kayit.istekler.length, 1, "400'de tek deneme");
});

await dene("429 kota: yeniden denenir ama tükenince 429/kota olarak geçer", async () => {
  const kayit = geminiTaklit(() => ({ durum:429, metin:"RESOURCE_EXHAUSTED" }));
  const c = cevap();
  await plan(istek(ORNEK_GOVDE), c);
  esit(c.kod, 429);
  esit(c.veri.hata, "kota");
  dogru(kayit.istekler.length > 1, "kota da geçici, yeniden denenir");
});

await dene("biçimsiz cevap geçici sayılır; ikinci deneme düzgünse başarı", async () => {
  const kayit = geminiTaklit((g, n) => n === 1 ? { ham:"bu json değil <<<" } : { metin: PLAN_CEVABI });
  const c = cevap();
  await plan(istek(ORNEK_GOVDE), c);
  esit(c.kod, 200);
  esit(kayit.istekler.length, 2);
});

/* --------------------------------------------------------------- */

bolum("api/parse — §7");

delete require.cache[require.resolve("../api/parse")];
const parse = require("../api/parse");

await dene("bugünün tarihi ve gün adı isteme girer", async () => {
  const kayit = geminiTaklit(() => ({
    metin: JSON.stringify({ tarih:"2026-09-12", saat:"14:00", sure:60, baslik:"Berber" }) }));
  const c = cevap();
  await parse(istek({ metin:"12 Eylül saat 14'te berber randevum var", bugun:"2026-09-06" }), c);
  esit(c.kod, 200);
  const metin = kayit.istekler[0].govde.contents[0].parts[0].text;
  icerir(metin, "2026-09-06 Pazar");
  icerir(metin, "12 Eylül saat 14'te berber");
  icerir(metin, "Tahmin etme.");
});

await dene("etkinlik alanları doğrulanır", async () => {
  geminiTaklit(() => ({
    metin: JSON.stringify({ tarih:"2026-09-12", saat:"14:00", sure:60, baslik:"Berber" }) }));
  const c = cevap();
  await parse(istek({ metin:"12 Eylül 14'te berber", bugun:"2026-09-06" }), c);
  esit(c.veri.tarih, "2026-09-12");
  esit(c.veri.saat, "14:00");
  esit(c.veri.sure, 60);
  esit(c.veri.baslik, "Berber");
});

await dene("uydurulmuş biçimler boşaltılır, tahmin kabul edilmez", async () => {
  geminiTaklit(() => ({
    metin: JSON.stringify({ tarih:"12 Eylül", saat:"öğleden sonra", sure:-5, baslik:"Berber" }) }));
  const c = cevap();
  await parse(istek({ metin:"berber", bugun:"2026-09-06" }), c);
  esit(c.veri.tarih, "", "biçimsiz tarih boş kalmalı");
  esit(c.veri.saat, "", "biçimsiz saat boş kalmalı");
  esit(c.veri.sure, 0);
});

await dene("geçmişe düşen tarih boşaltılır", async () => {
  geminiTaklit(() => ({
    metin: JSON.stringify({ tarih:"2026-08-12", saat:"14:00", sure:0, baslik:"Berber" }) }));
  const c = cevap();
  await parse(istek({ metin:"12 Ağustos berber", bugun:"2026-09-06" }), c);
  esit(c.veri.tarih, "", "geçmiş tarih neredeyse her zaman yanlış çözümdür");
});

await dene("boş metin 400", async () => {
  const c = cevap();
  await parse(istek({ metin:"   ", bugun:"2026-09-06" }), c);
  esit(c.kod, 400);
});

/* --------------------------------------------------------------- */

bolum("api/review — §12 gün sonu, §9 profil");

delete require.cache[require.resolve("../api/review")];
const review = require("../api/review");

const REVIEW_GOVDE = {
  tur: "gun", tarih: "2026-09-06", gunAdi: "Pazar",
  profil: "Koşuyu üç haftadır cumartesi hiç yapmadı.",
  son14: [{ tarih:"2026-09-05", gunAdi:"Cumartesi", namaz:"sabah:kaza", su:4,
            maddeler:[{ saat:"09:30", baslik:"Kod bloğu", yapildi:false,
                        not:"yarım saatte bıraktım" }] }]
};

await dene("gün değerlendirmesi düz metin ister, liste yasak", async () => {
  const kayit = geminiTaklit(() => ({ metin:"Kod bloğunu yarıda bırakıyorsun. Yarın 10:30'da başlat." }));
  const c = cevap();
  await review(istek(REVIEW_GOVDE), c);
  esit(c.kod, 200);
  icerir(c.veri.metin, "10:30");
  const g = kayit.istekler[0].govde;
  dogru(!g.generationConfig.responseSchema, "review şema kullanmaz, düz metin döner");
  const metin = g.contents[0].parts[0].text;
  icerir(metin, "En fazla 120 kelime");
  icerir(metin, "Liste yapma");
  icerir(metin, "yarım saatte bıraktım");     // notlar girdi
  icerir(metin, "cumartesi");                 // profil girdi
});

await dene("120 kelimeyi aşan cevap kesilir", async () => {
  const uzun = Array.from({ length: 200 }, (_, i) => "kelime" + i).join(" ");
  geminiTaklit(() => ({ metin: uzun }));
  const c = cevap();
  await review(istek(REVIEW_GOVDE), c);
  const adet = c.veri.metin.split(/\s+/).length;
  dogru(adet <= 121, "120 kelimeyle sınırlı olmalı, geldi: " + adet);
});

await dene("profil modu §9'un istemini kullanır ve 400 kelimeyle sınırlı", async () => {
  const uzun = Array.from({ length: 600 }, (_, i) => "gozlem" + i).join(" ");
  const kayit = geminiTaklit(() => ({ metin: uzun }));
  const c = cevap();
  await review(istek(Object.assign({}, REVIEW_GOVDE, { tur:"profil" })), c);
  esit(c.kod, 200);
  dogru(c.veri.profil, "profil alanı dönmeli");
  dogru(c.veri.profil.split(/\s+/).length <= 401, "400 kelimeyle sınırlı");
  const metin = kayit.istekler[0].govde.contents[0].parts[0].text;
  icerir(metin, "Sadece kayıtta kanıtı olan gözlemleri yaz. Tahmin yürütme.");
  icerir(metin, "En fazla 400 kelime.");
  icerir(metin, "gözlemlenmiş davranışıdır, hedefleri değil");
});

await dene("model boş dönerse 502", async () => {
  geminiTaklit(() => ({ metin: "   " }));
  const c = cevap();
  await review(istek(REVIEW_GOVDE), c);
  esit(c.kod, 502);
});

/* --------------------------------------------------------------- */

bolum("api/chat — §10");

delete require.cache[require.resolve("../api/chat")];
const chat = require("../api/chat");

const CHAT_GOVDE = {
  metin: "Sabahları koşamıyorum, akşama alalım.",
  tarih: "2026-09-06", gunAdi: "Pazar",
  kurs: null,
  vakitler: { Sabah:"05:01–06:29" },
  plan: [{ saat:"07:30", sure:40, baslik:"Koşu", tur:"spor", yapildi:false, not:"" }],
  profil: "Koşuyu cumartesi hiç yapmadı.",
  sohbet: [{ kim:"ben", metin:"dün nasıldı" }, { kim:"model", metin:"iyiydi" }]
};

await dene("dört alanlı yapılandırılmış çıktı istenir", async () => {
  const kayit = geminiTaklit(() => ({ metin: JSON.stringify({
    cevap:"Koşuyu 19:30'a aldım.",
    planGuncelle:{ tarih:"2026-09-06", maddeler:[
      { saat:"19:30", sure:40, baslik:"Koşu", tur:"spor", gerekce:"" }], gununNotu:"" },
    etkinlikEkle:null,
    profilEki:"Sabah koşusunu yapmıyor, akşamı tercih ediyor."
  }) }));
  const c = cevap();
  await chat(istek(CHAT_GOVDE), c);
  esit(c.kod, 200);
  esit(c.veri.cevap, "Koşuyu 19:30'a aldım.");
  esit(c.veri.planGuncelle.maddeler[0].saat, "19:30");
  esit(c.veri.etkinlikEkle, null);
  icerir(c.veri.profilEki, "akşamı tercih ediyor");

  const s = kayit.istekler[0].govde.generationConfig.responseSchema;
  esit(s.properties.cevap.type, "string");
  dogru(s.properties.planGuncelle, "planGuncelle şemada olmalı");
  dogru(s.properties.etkinlikEkle, "etkinlikEkle şemada olmalı");
  dogru(s.properties.profilEki, "profilEki şemada olmalı");
});

await dene("isteme bugünün planı, profil ve son konuşma girer", async () => {
  const kayit = geminiTaklit(() => ({ metin: JSON.stringify({ cevap:"tamam" }) }));
  await chat(istek(CHAT_GOVDE), cevap());
  const metin = kayit.istekler[0].govde.contents[0].parts[0].text;
  icerir(metin, "07:30 Koşu");
  icerir(metin, "Koşuyu cumartesi hiç yapmadı");
  icerir(metin, "Kullanıcı: dün nasıldı");
  icerir(metin, "Sabahları koşamıyorum");
  icerir(metin, "planın **tamamını** yaz");
});

await dene("sohbet geçmişi son 20 mesajla sınırlanır", async () => {
  const uzun = Array.from({ length: 40 }, (_, i) => ({ kim:"ben", metin:"mesaj"+i }));
  const kayit = geminiTaklit(() => ({ metin: JSON.stringify({ cevap:"tamam" }) }));
  await chat(istek(Object.assign({}, CHAT_GOVDE, { sohbet: uzun })), cevap());
  const metin = kayit.istekler[0].govde.contents[0].parts[0].text;
  icerir(metin, "mesaj39");
  if(metin.indexOf("mesaj5\n") !== -1) throw new Error("20'den eski mesaj gitmemeli");
});

await dene("geçmişe düşen veya biçimsiz etkinlik reddedilir", async () => {
  geminiTaklit(() => ({ metin: JSON.stringify({
    cevap:"ekledim", etkinlikEkle:{ tarih:"2026-08-01", saat:"14:00", sure:60, baslik:"Berber" } }) }));
  const c = cevap();
  await chat(istek(CHAT_GOVDE), c);
  esit(c.veri.etkinlikEkle, null, "geçmiş tarih kabul edilmemeli");

  geminiTaklit(() => ({ metin: JSON.stringify({
    cevap:"ekledim", etkinlikEkle:{ tarih:"yarın", baslik:"Berber" } }) }));
  const c2 = cevap();
  await chat(istek(CHAT_GOVDE), c2);
  esit(c2.veri.etkinlikEkle, null, "biçimsiz tarih kabul edilmemeli");
});

await dene("boş maddeli planGuncelle yok sayılır, plan silinmez", async () => {
  geminiTaklit(() => ({ metin: JSON.stringify({
    cevap:"tamam", planGuncelle:{ tarih:"2026-09-06", maddeler:[{ saat:"08:00", baslik:"" }] } }) }));
  const c = cevap();
  await chat(istek(CHAT_GOVDE), c);
  esit(c.veri.planGuncelle, null);
});

await dene("boş metin 400, boş cevap 502", async () => {
  const c = cevap();
  await chat(istek(Object.assign({}, CHAT_GOVDE, { metin:"  " })), c);
  esit(c.kod, 400);

  geminiTaklit(() => ({ metin: JSON.stringify({ cevap:"" }) }));
  const c2 = cevap();
  await chat(istek(CHAT_GOVDE), c2);
  esit(c2.kod, 502);
});

/* --------------------------------------------------------------- */

bolum("api/push — §8.2 ntfy");

delete require.cache[require.resolve("../api/push")];
const push = require("../api/push");

/** aladhan + ntfy taklidi; ntfy'ye gidenleri saklar. */
function pushTaklit(vakitler){
  const kayit = { ntfy: [], aladhan: [] };
  global.fetch = async (url, secenek) => {
    if(String(url).indexOf("ntfy.sh") !== -1){
      const g = JSON.parse(secenek.body);
      kayit.ntfy.push({ url, topic:g.topic, baslik:g.title, oncelik:g.priority, govde:g.message });
      return { ok:true, status:200, text: async () => "ok" };
    }
    kayit.aladhan.push(url);
    return { ok:true, status:200, json: async () => ({ data:{
      timings: vakitler || { Fajr:"05:01", Sunrise:"06:29", Dhuhr:"13:07",
                             Asr:"16:44", Maghrib:"19:35", Isha:"20:56" },
      meta:{ timezone:"Europe/Istanbul" } } }) };
  };
  return kayit;
}

/** Şimdiyi sabitle: yerelZaman Intl kullandığı için Date'i taklit ediyoruz. */
function zamanSabitle(utcIso){
  const Gercek = Date;
  global.Date = class extends Gercek {
    constructor(...a){ if(!a.length) super(utcIso); else super(...a); }
    static now(){ return new Gercek(utcIso).getTime(); }
  };
  return () => { global.Date = Gercek; };
}

await dene("topic yoksa 400", async () => {
  const c = cevap();
  await push({ url:"/api/push", query:{} }, c);
  esit(c.kod, 400);
});

await dene("vakit girdiği pencerede ntfy'ye gider", async () => {
  const kayit = pushTaklit();
  const geri = zamanSabitle("2026-09-06T13:59:00Z");     // Istanbul 16:59 → ikindi 16:44+15? hayır
  const c = cevap();
  await push({ url:"/api/push?topic=t&tz=Europe/Istanbul&pencere=5", query:{} }, c);
  geri();
  esit(c.kod, 200);
  esit(c.veri.saat, "16:59");
  esit(kayit.ntfy.length, 0, "16:59 hiçbir vaktin ilk 5 dakikası değil");
});

await dene("ikindi 16:44'te, penceredeyken tam bir kez gönderilir", async () => {
  const kayit = pushTaklit();
  const geri = zamanSabitle("2026-09-06T13:46:00Z");     // Istanbul 16:46
  const c = cevap();
  await push({ url:"/api/push?topic=gizli&tz=Europe/Istanbul&pencere=5", query:{} }, c);
  geri();
  esit(kayit.ntfy.length, 1);
  esit(kayit.ntfy[0].baslik, "İkindi namazı", "Türkçe başlık bozulmadan gitmeli");
  esit(kayit.ntfy[0].topic, "gizli");
  icerir(kayit.ntfy[0].govde, "Vakit girdi, çıkmasına");
  esit(c.veri.gonderilen[0], "ikindi");
});

await dene("sabah namazı en yüksek öncelikle gider", async () => {
  const kayit = pushTaklit();
  const geri = zamanSabitle("2026-09-06T02:02:00Z");     // Istanbul 05:02
  await push({ url:"/api/push?topic=t&tz=Europe/Istanbul&pencere=5", query:{} }, cevap());
  geri();
  esit(kayit.ntfy.length, 1);
  esit(kayit.ntfy[0].oncelik, 5, "sabah namazı öncelik 5 olmalı");
});

await dene("yatsının bitişi için ertesi günün imsağı çekilir", async () => {
  const kayit = pushTaklit();
  const geri = zamanSabitle("2026-09-06T17:57:00Z");     // Istanbul 20:57
  const c = cevap();
  await push({ url:"/api/push?topic=t&tz=Europe/Istanbul&pencere=5", query:{} }, c);
  geri();
  esit(c.veri.gonderilen[0], "yatsi");
  esit(kayit.aladhan.length, 2, "bugün ve yarın çekilmeli");
  icerir(kayit.ntfy[0].govde, "saat");
});

await dene("deneme bildirimi doğrudan gider, aladhan'a çıkmaz", async () => {
  const kayit = pushTaklit();
  const c = cevap();
  await push({ url:"/api/push?topic=t&deneme=1", query:{} }, c);
  esit(c.kod, 200);
  esit(kayit.aladhan.length, 0);
  esit(kayit.ntfy.length, 1);
  icerir(kayit.ntfy[0].govde, "kurulum tamam");
});

await dene("aladhan çökerse 502, topic hata mesajında geçmez", async () => {
  global.fetch = async () => ({ ok:false, status:500, json: async () => ({}) });
  const c = cevap();
  await push({ url:"/api/push?topic=gizli-topic-adi&tz=Europe/Istanbul", query:{} }, c);
  esit(c.kod, 502);
  if(JSON.stringify(c.veri).indexOf("gizli-topic-adi") !== -1)
    throw new Error("topic cevaba sızdı");
});

/* --------------------------------------------------------------- */

bolum("api/beslenme — §15 program / alternatif / foto");

process.env.GEMINI_API_KEY = "test-anahtari";
delete require.cache[require.resolve("../api/_ortak")];
delete require.cache[require.resolve("../api/beslenme")];
const beslenme = require("../api/beslenme");

const BESLENME_GOVDE = {
  mod: "program",
  profil: { boy:178, kilo:72, yas:25, cinsiyet:"erkek", aktivite:"orta", haftalikHedef:0.35,
            metin:"Bir buçuk yıldır işsiz, düzen kurmaya çalışıyor." },
  hedef: { hedef:3029, protein:130, karb:438, yag:84 },
  sevmedigim: ["kuru fasulye", "karnabahar"]
};

const PROGRAM_CEVABI = JSON.stringify({
  gunlukKalori: 3020,
  makro: { protein:132, karb:430, yag:85 },
  ogunler: [
    { ad:"Kahvaltı", saat:"08:30", yemekler:[
      { ad:"Yulaf ezmesi + süt + muz", miktar:"80 g yulaf, 300 ml süt, 1 muz",
        kalori:520, protein:22, karb:78, yag:12, tarif:"Yulafı sütle 3 dk pişir, muzu dilimle ekle." } ] },
    { ad:"Ara öğün", yemekler:[
      { ad:"Ceviz + kuru üzüm", miktar:"30 g ceviz, 30 g üzüm", kalori:290,
        protein:5, karb:25, yag:19, tarif:"Karıştır." } ] },
    { ad:"", yemekler:[] },                                  // elenmeli
    { ad:"Öğle", yemekler:[ { ad:"", miktar:"", kalori:0 } ] } // yemeği başlıksız → elenir → öğün de
  ],
  not: "Ara öğünler kalori açığını kapatmak için."
});

await dene("program modu: profil, hedef ve sevmedikleri isteme girer", async () => {
  const kayit = geminiTaklit(() => ({ metin: PROGRAM_CEVABI }));
  const c = cevap();
  await beslenme(istek(BESLENME_GOVDE), c);
  esit(c.kod, 200);
  const metin = kayit.istekler[0].govde.contents[0].parts[0].text;
  icerir(metin, "178 cm");
  icerir(metin, "72 kg");
  icerir(metin, "3029 kcal");
  icerir(metin, "Protein: 130 g");
  icerir(metin, "kuru fasulye, karnabahar");
  icerir(metin, "Bir buçuk yıldır işsiz");
  icerir(metin, "Övme");
  const g = kayit.istekler[0].govde;
  esit(g.generationConfig.responseMimeType, "application/json");
});

await dene("program: boş/başlıksız öğünler elenir, sayılar tamsayıya çekilir", async () => {
  geminiTaklit(() => ({ metin: PROGRAM_CEVABI }));
  const c = cevap();
  await beslenme(istek(BESLENME_GOVDE), c);
  esit(c.veri.ogunler.length, 2, "boş ve başlıksız öğün elenmeli");
  esit(c.veri.ogunler[0].ad, "Kahvaltı");
  esit(c.veri.ogunler[0].yemekler[0].kalori, 520);
  dogru(c.veri.not.length > 0);
});

await dene("program: istem malzeme listesi ister, malzemeler diziye çekilir", async () => {
  const kayit = geminiTaklit(() => ({ metin: JSON.stringify({
    gunlukKalori: 3000, makro:{ protein:130, karb:400, yag:80 },
    ogunler: [
      { ad:"Kahvaltı", yemekler:[
        { ad:"Menemen", miktar:"1 tabak", kalori:320,
          malzemeler:["yumurta"," domates ", "", "biber"], tarif:"Kavur." } ] },
      { ad:"Öğle", yemekler:[
        { ad:"Pilav", miktar:"1 kase", kalori:400, tarif:"Pişir." } ] }   // malzemeler yok
    ]
  }) }));
  const c = cevap();
  await beslenme(istek(BESLENME_GOVDE), c);
  esit(c.kod, 200);
  icerir(kayit.istekler[0].govde.contents[0].parts[0].text, "`malzemeler`");
  esit(c.veri.ogunler[0].yemekler[0].malzemeler.join(","), "yumurta,domates,biber");
  esit(Array.isArray(c.veri.ogunler[1].yemekler[0].malzemeler), true);
  esit(c.veri.ogunler[1].yemekler[0].malzemeler.length, 0);
});

await dene("alternatif modu: malzemeler döner ve istemde istenir", async () => {
  const kayit = geminiTaklit(() => ({ metin: JSON.stringify({
    ad:"Tavuklu pilav", miktar:"1 tabak", kalori:560, protein:45, karb:70, yag:10,
    malzemeler:["pirinç","tavuk göğsü","tereyağı"], tarif:"Pişir." }) }));
  const c = cevap();
  await beslenme(istek({ mod:"alternatif",
    yemek:{ ad:"Kuru fasulye", miktar:"1 kase", kalori:520 }, ogun:"Öğle" }), c);
  esit(c.kod, 200);
  esit(c.veri.malzemeler.join(","), "pirinç,tavuk göğsü,tereyağı");
  icerir(kayit.istekler[0].govde.contents[0].parts[0].text, "`malzemeler`");
});

await dene("program tamamen boş gelirse 502", async () => {
  geminiTaklit(() => ({ metin: JSON.stringify({ gunlukKalori:3000, makro:{}, ogunler:[] }) }));
  const c = cevap();
  await beslenme(istek(BESLENME_GOVDE), c);
  esit(c.kod, 502);
});

await dene("alternatif modu: değişecek yemeğin kalorisi isteme girer, tek yemek döner", async () => {
  const kayit = geminiTaklit(() => ({ metin: JSON.stringify({
    ad:"Tam buğday makarna + tavuk", miktar:"100 g makarna, 120 g tavuk",
    kalori:560, protein:45, karb:70, yag:10, tarif:"Makarnayı haşla, tavuğu ızgara yap." }) }));
  const c = cevap();
  await beslenme(istek({ mod:"alternatif",
    yemek:{ ad:"Kuru fasulye", miktar:"1 kase", kalori:520, protein:20, karb:60, yag:12 },
    ogun:"Öğle", sevmedigim:["kuru fasulye"] }), c);
  esit(c.kod, 200);
  esit(c.veri.ad, "Tam buğday makarna + tavuk");
  esit(c.veri.kalori, 560);
  const metin = kayit.istekler[0].govde.contents[0].parts[0].text;
  icerir(metin, "Kuru fasulye");
  icerir(metin, "520 kcal");
  icerir(metin, "Öğün: Öğle");
});

await dene("foto modu: görsel parça olarak gönderilir, tahmin doğrulanır", async () => {
  const kayit = geminiTaklit(() => ({ metin: JSON.stringify({
    yemek:"Tavuklu pilav", kalori:640, protein:38, karb:70, yag:18, guven:"orta",
    not:"Bir tabak porsiyonu varsaydım." }) }));
  const c = cevap();
  await beslenme(istek({ mod:"foto", foto:"x".repeat(200), mime:"image/jpeg",
    ipucu:"öğle yemeği" }), c);
  esit(c.kod, 200);
  esit(c.veri.yemek, "Tavuklu pilav");
  esit(c.veri.kalori, 640);
  esit(c.veri.guven, "orta");

  const parts = kayit.istekler[0].govde.contents[0].parts;
  icerir(parts[0].text, "öğle yemeği");
  dogru(parts[1] && parts[1].inline_data, "görsel parça gitmeli");
  esit(parts[1].inline_data.mime_type, "image/jpeg");
  esit(parts[1].inline_data.data.length, 200);
});

await dene("foto: veri yoksa 400; güven değeri geçersizse 'dusuk'a düşer", async () => {
  const c = cevap();
  await beslenme(istek({ mod:"foto", foto:"kisa" }), c);
  esit(c.kod, 400);

  geminiTaklit(() => ({ metin: JSON.stringify({ yemek:"Çorba", kalori:200, guven:"belki" }) }));
  const c2 = cevap();
  await beslenme(istek({ mod:"foto", foto:"y".repeat(150) }), c2);
  esit(c2.veri.guven, "dusuk");
});

await dene("anahtar yoksa 503 (program da AI'ye bağlı)", async () => {
  delete process.env.GEMINI_API_KEY;
  delete require.cache[require.resolve("../api/_ortak")];
  delete require.cache[require.resolve("../api/beslenme")];
  const b = require("../api/beslenme");
  const c = cevap();
  await b(istek(BESLENME_GOVDE), c);
  esit(c.kod, 503);
  esit(c.veri.hata, "anahtar-yok");
  process.env.GEMINI_API_KEY = "test-anahtari";
  delete require.cache[require.resolve("../api/_ortak")];
  delete require.cache[require.resolve("../api/beslenme")];
});

/* --------------------------------------------------------------- */

bolum("api/tarif — §15 YouTube linki");

delete require.cache[require.resolve("../api/tarif")];
const tarif = require("../api/tarif");

function istekGet(url){ return { method:"GET", url }; }

await dene("YOUTUBE_API_KEY varsa Data API'den gerçek watch linki döner", async () => {
  process.env.YOUTUBE_API_KEY = "yt-anahtari";
  const gorulen = [];
  global.fetch = async (url) => {
    gorulen.push(url);
    return { ok:true, status:200, json: async () => ({
      items: [{ id: { videoId: "abcdef12345" } }] }) };
  };
  const c = cevap();
  await tarif(istek({ yemek:"Mercimek çorbası" }), c);
  esit(c.kod, 200);
  esit(c.veri.url, "https://www.youtube.com/watch?v=abcdef12345");
  esit(c.veri.kaynak, "api");
  icerir(gorulen[0], "googleapis.com/youtube/v3/search");
  icerir(gorulen[0], "key=yt-anahtari");
  icerir(gorulen[0], "Mercimek");
});

await dene("anahtar yoksa results sayfasından ilk videoId çekilir", async () => {
  delete process.env.YOUTUBE_API_KEY;
  global.fetch = async (url) => {
    icerir(url, "youtube.com/results");
    return { ok:true, status:200, text: async () =>
      'xxx {"videoId":"ZZZ0aaa1bbb"} yyy {"videoId":"sonraki0000"}' };
  };
  const c = cevap();
  await tarif(istekGet("/api/tarif?yemek=" + encodeURIComponent("Tavuk sote")), c);
  esit(c.veri.url, "https://www.youtube.com/watch?v=ZZZ0aaa1bbb");
  esit(c.veri.kaynak, "kazima");
});

await dene("hiçbiri olmazsa arama linkine düşer", async () => {
  delete process.env.YOUTUBE_API_KEY;
  global.fetch = async () => ({ ok:false, status:429, text: async () => "" });
  const c = cevap();
  await tarif(istek({ yemek:"Karnıyarık" }), c);
  esit(c.kod, 200);
  esit(c.veri.kaynak, "arama");
  icerir(c.veri.url, "youtube.com/results?search_query=");
  icerir(c.veri.url, "Kar");
});

await dene("yemek adı boşsa 400", async () => {
  const c = cevap();
  await tarif(istek({ yemek:"  " }), c);
  esit(c.kod, 400);
});

bolum("api/notion — §18 haftalık kontrol");

const notion = require("../api/notion");

/** Notion API'yi taklit et. `cocuklar`: hedef sayfanın /children'ından dönen
    results dizisi (testte tek sayfa yeterli, sayfalama ayrıca denenir).
    PATCH istekleri `kayit.patchler`'e, hepsi `kayit.istekler`'e düşer. */
function notionTaklit(cocuklar, hataKodu){
  const kayit = { istekler: [], patchler: [] };
  global.fetch = async (url, opt) => {
    const yontem = (opt && opt.method) || "GET";
    kayit.istekler.push({ url, yontem });
    if(hataKodu) return { ok:false, status:hataKodu, text: async () => "notion hata" };
    if(yontem === "GET")
      return { ok:true, status:200, json: async () => ({ results:cocuklar, has_more:false, next_cursor:null }) };
    const govde = JSON.parse(opt.body);
    kayit.patchler.push({ url, govde });
    return { ok:true, status:200, json: async () => ({}) };
  };
  return kayit;
}

function baslik(metin){
  return { type:"heading_2", heading_2:{ rich_text:[{ plain_text: metin }] } };
}
function ayrac(){ return { type:"divider", divider:{} }; }
function toDo(id, checked){
  return { id, type:"to_do", to_do:{ checked: !!checked, rich_text:[{ plain_text:"madde " + id }] } };
}

/* --- §17/§19 için: paragraf/tablo bloğu taklitleri --------------------- */
function paragraf(metin){
  return { type:"paragraph", paragraph:{ rich_text:[{ plain_text: metin }] } };
}
function tablo(id){ return { id, type:"table", table:{ table_width:4 } }; }
function hucre(metin, url){
  return [{ plain_text: metin, text: url ? { link:{ url } } : {} }];
}
function satir(hucreler){ return { type:"table_row", table_row:{ cells: hucreler } }; }

/** Birden çok blok kümesini (sayfa kökü + tablo id'leri) id'ye göre taklit
    eder. `sayfalar`: { [blokId]: block[] }. §18'in tek-sayfalık `notionTaklit`'i
    yerine, birden çok /children isteği (sayfa + tablo) gerektiren §17/§19
    testlerinde kullanılır. PATCH isteklerini de `kayit.patchler`'e düşer. */
function sayfaTaklit(sayfalar){
  const kayit = { istekler: [], patchler: [] };
  global.fetch = async (url, opt) => {
    const yontem = (opt && opt.method) || "GET";
    kayit.istekler.push({ url, yontem });
    const m = String(url).match(/\/blocks\/([\w-]+)\/children/);
    if(m && yontem === "GET"){
      const sonuc = sayfalar[m[1]] || [];
      return { ok:true, status:200, json: async () => ({ results:sonuc, has_more:false, next_cursor:null }) };
    }
    if(yontem === "PATCH"){
      kayit.patchler.push({ url, govde: JSON.parse(opt.body) });
      return { ok:true, status:200, json: async () => ({}) };
    }
    return { ok:false, status:404, text: async () => "bulunamadı" };
  };
  return kayit;
}

/* Hafta 1: 5 madde ve ayraç. Hafta 2: 5 madde, sayfa burada bitiyor (ayraçsız) —
   gerçek Faz sayfalarında son haftanın kontrolü de tam böyle. */
const IKI_HAFTA = [
  baslik("Hafta 1 — Terminal, Git ve Java'ya dönüş"),
  { type:"paragraph", paragraph:{ rich_text:[{ plain_text:"Haftalık kontrol:" }] } },
  toDo("h1-a"), toDo("h1-b"), toDo("h1-c"), toDo("h1-d"), toDo("h1-e"),
  ayrac(),
  baslik("Hafta 2 — OOP"),
  toDo("h2-a"), toDo("h2-b"), toDo("h2-c"), toDo("h2-d"), toDo("h2-e")
];

process.env.NOTION_API_KEY = "test-notion-anahtari";

await dene("yalnız POST", async () => {
  const c = cevap();
  await notion(istek({ hafta:1 }, "GET"), c);
  esit(c.kod, 405);
});

await dene("anahtar yoksa 503", async () => {
  delete process.env.NOTION_API_KEY;
  const c = cevap();
  await notion(istek({ hafta:1 }), c);
  esit(c.kod, 503);
  esit(c.veri.hata, "anahtar-yok");
  process.env.NOTION_API_KEY = "test-notion-anahtari";
});

await dene("geçersiz hafta 400 döner (0, 21, sayı değil)", async () => {
  for(const h of [0, 21, "x", null]){
    const c = cevap();
    await notion(istek({ hafta:h }), c);
    esit(c.kod, 400, "hafta=" + h);
  }
});

await dene("hafta 1'in beş to_do'su işaretlenir, hafta 2'ye dokunulmaz", async () => {
  const kayit = notionTaklit(IKI_HAFTA);
  const c = cevap();
  await notion(istek({ hafta:1 }), c);
  esit(c.kod, 200);
  esit(c.veri.isaretlenen, 5);
  esit(c.veri.toplam, 5);
  esit(kayit.patchler.length, 5, "yalnız hafta 1'in 5 maddesi PATCH edilmeli");
  dogru(kayit.patchler.every(p => p.url.indexOf("/h1-") !== -1), "yalnız h1-* blokları");
  dogru(kayit.patchler.every(p => p.govde.to_do.checked === true), "checked:true gönderilmeli");
});

await dene("zaten işaretli maddeler tekrar PATCH edilmez", async () => {
  const kismenIsaretli = IKI_HAFTA.map(b =>
    (b.id === "h1-a" || b.id === "h1-b") ? toDo(b.id, true) : b);
  const kayit = notionTaklit(kismenIsaretli);
  const c = cevap();
  await notion(istek({ hafta:1 }), c);
  esit(c.veri.isaretlenen, 3, "yalnız işaretsiz 3 madde");
  esit(c.veri.toplam, 5);
  esit(kayit.patchler.length, 3);
});

await dene("son haftada (sayfa sonu, ayraçsız) doğru toplanır", async () => {
  const kayit = notionTaklit(IKI_HAFTA);
  const c = cevap();
  await notion(istek({ hafta:2 }), c);
  esit(c.kod, 200);
  esit(c.veri.isaretlenen, 5);
  dogru(kayit.patchler.every(p => p.url.indexOf("/h2-") !== -1), "yalnız h2-* blokları");
});

await dene("eşleşen checklist yoksa 404", async () => {
  notionTaklit([baslik("Hafta 9 — başka bir şey"), toDo("x")]);
  const c = cevap();
  await notion(istek({ hafta:1 }), c);
  esit(c.kod, 404);
  esit(c.veri.hata, "kontrol-listesi-bulunamadi");
});

await dene("Notion isteği başarısız olursa 502, anahtar mesajda geçmez", async () => {
  notionTaklit(IKI_HAFTA, 401);
  const c = cevap();
  await notion(istek({ hafta:1 }), c);
  esit(c.kod, 502);
  esit(c.veri.hata, "notion");
  icermez(c.veri.mesaj, "test-notion-anahtari");
});

await dene("gövde okunamazsa 400", async () => {
  const c = cevap();
  await notion(istek("bu json değil"), c);
  esit(c.kod, 400);
});

await dene("çocuklar sayfalıysa (has_more) hepsi toplanır", async () => {
  const patchler = [];
  let cagri = 0;
  global.fetch = async (url, opt) => {
    const yontem = (opt && opt.method) || "GET";
    if(yontem === "GET"){
      cagri++;
      return cagri === 1
        ? { ok:true, status:200, json: async () => ({
            results:[baslik("Hafta 1 — a"), toDo("h1-a")],
            has_more:true, next_cursor:"devam" }) }
        : { ok:true, status:200, json: async () => ({
            results:[toDo("h1-b"), ayrac()], has_more:false, next_cursor:null }) };
    }
    patchler.push({ url, govde: JSON.parse(opt.body) });
    return { ok:true, status:200, json: async () => ({}) };
  };
  const c = cevap();
  await notion(istek({ hafta:1 }), c);
  esit(c.kod, 200);
  esit(c.veri.toplam, 2, "iki sayfadaki iki to_do da bulunmalı");
  esit(patchler.length, 2);
  dogru(cagri >= 2, "ikinci sayfa da çekilmeli");
});

bolum("api/roadmap — §19 haftalık müfredat (salt okuma)");

const roadmap = require("../api/roadmap");
const HAFTA1_SAYFASI = "3e2921af4e6781ce903adf5ccd27e5b1";
const HAFTA1_SAYFALARI = {
  [HAFTA1_SAYFASI]: [
    baslik("Hafta 1 — Terminal, Git ve Java'ya dönüş"),
    paragraf("Hafta sonunda terminali kullanabilmelisin."),
    tablo("t1"),
    paragraf("Algoritma (her gün 1 saat): 7 soru."),
    paragraf("Haftalık kontrol (bakmadan):"),
    toDo("kb1", false), toDo("kb2", true),
    { type:"divider", divider:{} }
  ],
  "t1": [
    satir([hucre("Gün"), hucre("Konu"), hucre("Kaynak"), hucre("Uygulama")]),
    satir([hucre("1"), hucre("Terminal komutları"),
           hucre("Linux Journey", "https://linuxjourney.com"), hucre("Klasör yapısı kur")]),
    satir([hucre("6"), hucre("Tekrar + haftalık kontrol"), hucre("—"), hucre("Kontrolü yap")])
  ]
};

await dene("yalnız GET veya POST", async () => {
  const c = cevap();
  await roadmap({ method:"DELETE" }, c);
  esit(c.kod, 405);
});

await dene("anahtar yoksa 503", async () => {
  delete process.env.NOTION_API_KEY;
  const c = cevap();
  await roadmap(istek({ hafta:1 }), c);
  esit(c.kod, 503);
  esit(c.veri.hata, "anahtar-yok");
  process.env.NOTION_API_KEY = "test-notion-anahtari";
});

await dene("geçersiz hafta 400 döner (0, 21, sayı değil)", async () => {
  for(const h of [0, 21, "x", null]){
    const c = cevap();
    await roadmap(istek({ hafta:h }), c);
    esit(c.kod, 400, "hafta=" + h);
  }
});

await dene("POST: hafta 1'in tam müfredatı döner", async () => {
  sayfaTaklit(HAFTA1_SAYFALARI);
  const c = cevap();
  await roadmap(istek({ hafta:1 }), c);
  esit(c.kod, 200);
  esit(c.veri.hafta, 1);
  esit(c.veri.faz, "Java temeli");
  icerir(c.veri.baslik, "Terminal, Git");
  icerir(c.veri.giris, "terminali kullanabilmelisin");
  icerir(c.veri.algoritma, "7 soru");
  esit(c.veri.gunler.length, 2, "yalnız başlık satırı hariç, iki gün eklendi");
  esit(c.veri.gunler[0].gun, "1");
  esit(c.veri.gunler[0].konu, "Terminal komutları");
  icerir(c.veri.gunler[0].kaynak, "linuxjourney.com");
  esit(c.veri.gunler[1].gun, "6");
  esit(c.veri.kontrol.length, 2);
  esit(c.veri.kontrol[0].tamam, false);
  esit(c.veri.kontrol[1].tamam, true);
});

await dene("GET ?hafta= ile de çalışır", async () => {
  sayfaTaklit(HAFTA1_SAYFALARI);
  const c = cevap();
  await roadmap(istekGet("/api/roadmap?hafta=1"), c);
  esit(c.kod, 200);
  esit(c.veri.hafta, 1);
});

await dene("Notion isteği başarısız olursa 502", async () => {
  global.fetch = async () => ({ ok:false, status:500, text: async () => "notion çöktü" });
  const c = cevap();
  await roadmap(istek({ hafta:1 }), c);
  esit(c.kod, 502);
  esit(c.veri.hata, "notion");
});

await dene("gövde okunamazsa 400", async () => {
  const c = cevap();
  await roadmap(istek("bu json değil"), c);
  esit(c.kod, 400);
});

bolum("api/veri — §16 Supabase senkronu (bootstrap kilidi, giriş ekranı yok)");

delete require.cache[require.resolve("../api/veri")];
const veri = require("../api/veri");

function veriIstek(govde, anahtar, yontem){
  return { method: yontem || "POST", body: govde,
    headers: anahtar != null ? { "x-ledger-anahtar": anahtar } : {} };
}

/** Supabase REST'ini (PostgREST) taklit eder: 'veri' tablosunun tek satırı belleğe simüle edilir. */
function supabaseTaklit(baslangicSatir){
  const durum = { satir: baslangicSatir || null, istekler: [] };
  global.fetch = async (url, secenek) => {
    durum.istekler.push({ url, secenek });
    const yontem = (secenek && secenek.method) || "GET";
    if(yontem === "GET"){
      return { ok:true, status:200, json: async () => (durum.satir ? [durum.satir] : []) };
    }
    if(yontem === "POST"){
      const [gelen] = JSON.parse(secenek.body);
      durum.satir = gelen;
      return { ok:true, status:201, json: async () => [gelen], text: async () => JSON.stringify([gelen]) };
    }
    return { ok:false, status:405, text: async () => "" };
  };
  return durum;
}

const V_ANAHTAR_A = "a".repeat(48);
const V_ANAHTAR_B = "b".repeat(48);

await dene("SUPABASE_SERVICE_ROLE_KEY yoksa 503 (SUPABASE_URL olsa da)", async () => {
  process.env.SUPABASE_URL = "https://xyz.supabase.co";
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  supabaseTaklit();
  const c = cevap();
  await veri(veriIstek({ icerik:{ a:1 } }, V_ANAHTAR_A), c);
  esit(c.kod, 503);
});

process.env.SUPABASE_SERVICE_ROLE_KEY = "servis-anahtari-test";

await dene("SUPABASE_URL tanımsızsa gömülü proje adresine düşer", async () => {
  delete process.env.SUPABASE_URL;
  const s = supabaseTaklit(null);
  const c = cevap();
  await veri(veriIstek({ icerik:{ a:1 } }, V_ANAHTAR_A), c);
  esit(c.kod, 200);
  icerir(s.istekler[0].url, "https://xkomkawyqekhdxjngrws.supabase.co/rest/v1/");
});

process.env.SUPABASE_URL = "https://xyz.supabase.co";

await dene("anahtar yoksa ya da çok kısaysa 400", async () => {
  supabaseTaklit();
  const c = cevap();
  await veri(veriIstek({ icerik:{ a:1 } }, "kisa"), c);
  esit(c.kod, 400);
});

await dene("GET: satır yoksa icerik null döner (400 değil)", async () => {
  supabaseTaklit(null);
  const c = cevap();
  await veri(veriIstek(null, V_ANAHTAR_A, "GET"), c);
  esit(c.kod, 200);
  esit(c.veri.icerik, null);
});

await dene("POST: ilk yazma anahtarı sahiplenir (bootstrap)", async () => {
  const s = supabaseTaklit(null);
  const c = cevap();
  await veri(veriIstek({ icerik:{ namaz:"x" } }, V_ANAHTAR_A), c);
  esit(c.kod, 200);
  dogru(c.veri.tamam);
  dogru(!!c.veri.guncellendi);
  dogru(!!s.satir.anahtar_ozet, "hash kaydedilmeli");
  esit(s.satir.icerik.namaz, "x");
});

await dene("POST: aynı anahtar günceller, hash değişmez", async () => {
  const s = supabaseTaklit(null);
  await veri(veriIstek({ icerik:{ n:1 } }, V_ANAHTAR_A), cevap());
  const ilkOzet = s.satir.anahtar_ozet;
  const c = cevap();
  await veri(veriIstek({ icerik:{ n:2 } }, V_ANAHTAR_A), c);
  esit(c.kod, 200);
  esit(s.satir.icerik.n, 2);
  esit(s.satir.anahtar_ozet, ilkOzet);
});

await dene("POST: başka anahtar sahipli satırı değiştiremez (401)", async () => {
  const s = supabaseTaklit(null);
  await veri(veriIstek({ icerik:{ n:1 } }, V_ANAHTAR_A), cevap());
  const c = cevap();
  await veri(veriIstek({ icerik:{ n:99 } }, V_ANAHTAR_B), c);
  esit(c.kod, 401);
  esit(s.satir.icerik.n, 1, "yazılmamalı");
});

await dene("GET: başka anahtarla okuma 401", async () => {
  const s = supabaseTaklit(null);
  await veri(veriIstek({ icerik:{ n:1 } }, V_ANAHTAR_A), cevap());
  const c = cevap();
  await veri(veriIstek(null, V_ANAHTAR_B, "GET"), c);
  esit(c.kod, 401);
});

await dene("POST: icerik eksikse 400", async () => {
  supabaseTaklit(null);
  const c = cevap();
  await veri(veriIstek({}, V_ANAHTAR_A), c);
  esit(c.kod, 400);
});

await dene("POST: çok büyük gövde 413", async () => {
  supabaseTaklit(null);
  const c = cevap();
  await veri(veriIstek({ icerik: { blok: "x".repeat(2100000) } }, V_ANAHTAR_A), c);
  esit(c.kod, 413);
});

await dene("desteklenmeyen yöntem 405", async () => {
  supabaseTaklit(null);
  const c = cevap();
  await veri(veriIstek(null, V_ANAHTAR_A, "DELETE"), c);
  esit(c.kod, 405);
});

console.log("\n" + (kalan ? "✗" : "✓") + "  " + gecen + " geçti, " + kalan + " kaldı\n");
process.exit(kalan ? 1 : 0);

})();
