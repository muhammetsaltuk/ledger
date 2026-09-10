/* Ledger — yapay zeka fonksiyonlarının ortak yanı (§12).
   Alt çizgiyle başlayan dosyalar Vercel'de uç nokta sayılmaz, yardımcıdır.

   GEMINI_API_KEY hiçbir koşulda istemciye gitmez: anahtar yalnız burada,
   sunucu tarafında okunur. */

/* §12 — model zinciri. Birincil model 404 dönerse (emekliye ayrıldıysa) ya da
   geçici hata denemeleri tükenirse sonrakine düşülür. Hepsi aynı istek şeklini
   destekliyor: responseSchema, systemInstruction, görsel parça.
   Birincil = gemini-2.5-flash: kararlı, ücretsiz katmanda, vision + yapılandırılmış
   çıktı var. gemini-3.6-flash yedekte — "gemini-2.0-flash" bir kez emekliye
   ayrılıp uygulamayı durdurmuştu, zincir bunun tekrarını sessizce toparlar. */
const MODELLER = ["gemini-2.5-flash", "gemini-3.6-flash"];
const TABAN = "https://generativelanguage.googleapis.com/v1beta/models/";

/* --- Sertleştirme (§12) ------------------------------------------
   Geçici hatada (429/5xx, ağ, timeout) model başına birkaç kez, üstel
   gecikmeyle yeniden denenir. Tüm zincir bir süre bütçesiyle sınırlı ki
   Vercel'in fonksiyon zaman aşımını geçmesin. */
const DENEME     = 3;                                     // model başına deneme
const BUTCE_MS   = 40000;                                 // tüm zincirin üst sınırı
const ISTEK_MS   = 18000;                                 // tek denemenin abort süresi
const GECIKME_MS = process.env.LEDGER_TEST ? 1 : 400;     // üstel backoff tabanı
const GECICI_KOD = new Set([429, 500, 502, 503, 504]);

function bekle(ms){ return new Promise(r => setTimeout(r, ms)); }

/** Bir modele tek HTTP isteği. Ham metni döner; hata durumu e.durum/e.gecici'de. */
async function birIstek(model, govde, kalanMs){
  const kontrol = new AbortController();
  const sure = Math.max(1500, Math.min(ISTEK_MS, kalanMs));
  const zaman = setTimeout(() => kontrol.abort(), sure);
  let cevap;
  try{
    cevap = await fetch(TABAN + model + ":generateContent?key=" + anahtar(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(govde),
      signal: kontrol.signal
    });
  }catch(e){
    const h = new Error("gemini ağ/timeout: " + (e && e.message));
    h.durum = 0; h.gecici = true;
    throw h;
  }finally{
    clearTimeout(zaman);
  }

  const ham = await cevap.text();
  if(!cevap.ok){
    const e = new Error("gemini " + cevap.status);
    e.durum = cevap.status;
    e.gecici = GECICI_KOD.has(cevap.status);
    e.ayrinti = ham.slice(0, 400);
    throw e;
  }
  return ham;
}

/** Ham cevaptan metni çıkarır. Biçimsiz/boş cevap geçici sayılır (kesilme,
    güvenlik filtresi gibi anlık durumlar bir denemede daha düzelebilir). */
function metinCoz(ham){
  let veri;
  try{ veri = JSON.parse(ham); }
  catch(e){ const x = new Error("gemini cevabı JSON değil"); x.gecici = true; throw x; }

  const parca = veri &&
    veri.candidates && veri.candidates[0] &&
    veri.candidates[0].content && veri.candidates[0].content.parts &&
    veri.candidates[0].content.parts[0];
  const metin = parca && parca.text;
  if(!metin){
    const neden = veri && veri.candidates && veri.candidates[0] && veri.candidates[0].finishReason;
    const x = new Error("gemini boş cevap" + (neden ? " (" + neden + ")" : ""));
    x.gecici = true;
    throw x;
  }
  return metin;
}

/* §12 — ortak sistem promptu. Dört fonksiyon da bununla başlar. */
const SISTEM = `Kullanıcı 25 yaşında, yazılım mühendisliği mezunu, bir buçuk yıldır işsiz.
Yalnız yaşıyor, düzeni yok, kurmaya çalışıyor. Namaza yeni başladı.
Akşamları İngilizce kursuna gidiyor.

- Türkçe yaz. Kullanıcıya "sen" diye hitap et.
- Övme. Motivasyon cümlesi kurma. Emoji kullanma.
- Kullanıcının dini pratiğini yorumlama; sadece tutarlılığından bahsedebilirsin.
- Kaza borcu hakkında suçlayıcı veya utandırıcı bir dil kullanma.
- Kötü giden bir şey varsa düz biçimde söyle, ama suçlamadan.
- Tavsiye vereceksen tek ve ölçülebilir olsun.`;

const TURLER = ["uyku","spor","yemek","kod","kitap","ingilizce","kurs",
                "etkinlik","namaz","ev","bos"];

function anahtar(){
  return process.env.GEMINI_API_KEY || "";
}

/** Ortak giriş kontrolü. Uygun değilse cevabı yazar ve null döner. */
function girdiAl(req, res){
  if(req.method !== "POST"){
    res.status(405).json({ hata: "yalnız POST" });
    return null;
  }
  if(!anahtar()){
    // Anahtar yoksa uygulamanın geri kalanı çalışmaya devam eder (§12).
    res.status(503).json({ hata: "anahtar-yok",
      mesaj: "GEMINI_API_KEY tanımlı değil; yapay zeka bölümleri kapalı." });
    return null;
  }
  let govde = req.body;
  if(typeof govde === "string"){
    try{ govde = JSON.parse(govde); }catch(e){ govde = null; }
  }
  if(!govde || typeof govde !== "object"){
    res.status(400).json({ hata: "gövde okunamadı" });
    return null;
  }
  return govde;
}

/**
 * Gemini'ye tek turluk istek — model zinciri + geçici hatada yeniden deneme (§12).
 * `sema` verilirse yapılandırılmış çıktı (responseSchema) zorunlu olur; verilmezse
 * düz metin döner.
 *
 * `istem` bir metin ya da parça dizisi olabilir. Dizi biçimi görsel için:
 *   [{ text: "..." }, { inline_data: { mime_type: "image/jpeg", data: "<base64>" } }]
 *
 * Sıra: her model için DENEME kez denenir. 404 (emekli model) → retry yok, sonraki
 * modele geç. 400/401/403 → hemen fırlat. 429/5xx/ağ/biçimsiz → üstel gecikmeyle
 * yeniden dene, tükenince sonraki modele. Hepsi bittiğinde son hata fırlar.
 */
async function gemini(istem, sema, ayar){
  const parcalar = Array.isArray(istem) ? istem : [{ text: String(istem) }];
  const govde = {
    systemInstruction: { parts: [{ text: SISTEM }] },
    contents: [{ role: "user", parts: parcalar }],
    generationConfig: Object.assign({ temperature: 0.7 }, ayar || {})
  };
  if(sema){
    govde.generationConfig.responseMimeType = "application/json";
    govde.generationConfig.responseSchema = sema;
  }

  const bitis = Date.now() + BUTCE_MS;
  let sonHata = null;

  for(const model of MODELLER){
    for(let deneme = 1; deneme <= DENEME; deneme++){
      const kalan = bitis - Date.now();
      if(kalan <= 800){ if(sonHata) throw sonHata; break; }
      try{
        return metinCoz(await birIstek(model, govde, kalan));
      }catch(e){
        sonHata = e;
        if(e.durum === 404) break;             // model emekli → sonraki modele
        if(!e.gecici) throw e;                  // kalıcı hata → hemen bırak
        if(deneme < DENEME && (bitis - Date.now()) > 1500){
          await bekle(GECIKME_MS * Math.pow(2, deneme - 1) + Math.floor(Math.random() * 150));
        }
      }
    }
  }
  throw sonHata || new Error("gemini: cevap alınamadı");
}

/** Yapılandırılmış çıktıyı çözer. Model yine de metne sararsa temizler. */
function jsonCoz(metin){
  const t = String(metin).trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  return JSON.parse(t);
}

/** Beklenmedik hatayı istemciye anlaşılır biçimde ver; ayrıntı sunucu günlüğünde kalsın. */
function hataVer(res, e){
  console.error("ledger api hatası:", e && (e.ayrinti || e.message || e));
  const d = e && e.durum;
  // 503 UNAVAILABLE geçici yoğunluk demek; "cevap vermedi" yanıltıcı oluyor.
  const durum = (d === 429 || d === 503) ? d : 502;
  const mesaj =
    d === 429 ? "Ücretsiz katman kotası doldu, biraz sonra dene."
  : d === 503 ? "Model şu an yoğun. Biraz sonra tekrar dene."
  : "Model cevap vermedi.";
  res.status(durum).json({
    hata: d === 429 ? "kota" : d === 503 ? "yogun" : "model",
    mesaj: mesaj
  });
}

module.exports = { MODELLER, SISTEM, TURLER, anahtar, girdiAl, gemini, jsonCoz, hataVer };
