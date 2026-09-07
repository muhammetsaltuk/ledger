/* api/ fonksiyonlarını doğrudan çalıştırır: gövde doğrulama, istem kurulumu,
   şema zorlaması ve hata yolları. Gemini'ye gerçek istek atılmaz, uydurulur.
   node test/api.js */

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

/** Gemini'yi taklit et; son gönderilen gövdeyi sakla. */
function geminiTaklit(uret){
  const kayit = { istekler: [] };
  global.fetch = async (url, secenek) => {
    const govde = JSON.parse(secenek.body);
    kayit.istekler.push({ url, govde });
    const sonuc = uret(govde);
    if(sonuc && sonuc.durum && sonuc.durum !== 200){
      return { ok:false, status:sonuc.durum, text: async () => sonuc.metin || "hata" };
    }
    return {
      ok: true, status: 200,
      text: async () => JSON.stringify({
        candidates: [{ content: { parts: [{ text: sonuc.metin }] } }]
      })
    };
  };
  return kayit;
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
  icerir(metin, "09:10'da kalktım");         // son 14 günün notları
  icerir(metin, "Kahvaltı, spordan sonraki 45 dakika içinde");   // çerçeve
});

await dene("sistem promptu §12'deki kurallarla gider", async () => {
  const kayit = geminiTaklit(() => ({ metin: PLAN_CEVABI }));
  await plan(istek(ORNEK_GOVDE), cevap());
  const sis = kayit.istekler[0].govde.systemInstruction.parts[0].text;
  icerir(sis, "Övme.");
  icerir(sis, "Emoji kullanma.");
  icerir(sis, "suçlayıcı veya utandırıcı");
});

await dene("yapılandırılmış çıktı zorunlu, model gemini-2.0-flash", async () => {
  const kayit = geminiTaklit(() => ({ metin: PLAN_CEVABI }));
  await plan(istek(ORNEK_GOVDE), cevap());
  const g = kayit.istekler[0].govde;
  esit(g.generationConfig.responseMimeType, "application/json");
  dogru(g.generationConfig.responseSchema, "responseSchema gitmeli");
  icerir(kayit.istekler[0].url, "gemini-2.0-flash:generateContent");
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

console.log("\n" + (kalan ? "✗" : "✓") + "  " + gecen + " geçti, " + kalan + " kaldı\n");
process.exit(kalan ? 1 : 0);

})();
