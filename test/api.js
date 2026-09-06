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

console.log("\n" + (kalan ? "✗" : "✓") + "  " + gecen + " geçti, " + kalan + " kaldı\n");
process.exit(kalan ? 1 : 0);

})();
