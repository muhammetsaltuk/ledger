/* Ledger — yapay zeka fonksiyonlarının ortak yanı (§12).
   Alt çizgiyle başlayan dosyalar Vercel'de uç nokta sayılmaz, yardımcıdır.

   GEMINI_API_KEY hiçbir koşulda istemciye gitmez: anahtar yalnız burada,
   sunucu tarafında okunur. */

const MODEL = "gemini-2.0-flash";
const TABAN = "https://generativelanguage.googleapis.com/v1beta/models/";

/* §12 — ortak sistem promptu. Dört fonksiyon da bununla başlar. */
const SISTEM = `Kullanıcı 25 yaşında, yazılım mühendisliği mezunu, bir buçuk yıldır işsiz.
Yalnız yaşıyor, düzeni yok, kurmaya çalışıyor. Namaza yeni başladı.
Akşamları İngilizce kursuna gidiyor.

- Türkçe yaz.
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
 * Gemini'ye tek turluk istek. `sema` verilirse yapılandırılmış çıktı zorunlu
 * olur (§12); verilmezse düz metin döner.
 */
async function gemini(istem, sema, ayar){
  const govde = {
    systemInstruction: { parts: [{ text: SISTEM }] },
    contents: [{ role: "user", parts: [{ text: istem }] }],
    generationConfig: Object.assign({ temperature: 0.7 }, ayar || {})
  };
  if(sema){
    govde.generationConfig.responseMimeType = "application/json";
    govde.generationConfig.responseSchema = sema;
  }

  const kontrol = new AbortController();
  const zaman = setTimeout(() => kontrol.abort(), 25000);
  let cevap;
  try{
    cevap = await fetch(TABAN + MODEL + ":generateContent?key=" + anahtar(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(govde),
      signal: kontrol.signal
    });
  }finally{
    clearTimeout(zaman);
  }

  const ham = await cevap.text();
  if(!cevap.ok){
    const e = new Error("gemini " + cevap.status);
    e.durum = cevap.status;
    e.ayrinti = ham.slice(0, 400);
    throw e;
  }

  let veri;
  try{ veri = JSON.parse(ham); }
  catch(e){ throw new Error("gemini cevabı JSON değil"); }

  const parca = veri &&
    veri.candidates && veri.candidates[0] &&
    veri.candidates[0].content && veri.candidates[0].content.parts &&
    veri.candidates[0].content.parts[0];
  const metin = parca && parca.text;
  if(!metin){
    const neden = veri && veri.candidates && veri.candidates[0] && veri.candidates[0].finishReason;
    throw new Error("gemini boş cevap" + (neden ? " (" + neden + ")" : ""));
  }
  return metin;
}

/** Yapılandırılmış çıktıyı çözer. Model yine de metne sararsa temizler. */
function jsonCoz(metin){
  const t = String(metin).trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  return JSON.parse(t);
}

/** Beklenmedik hatayı istemciye anlaşılır biçimde ver; ayrıntı sunucu günlüğünde kalsın. */
function hataVer(res, e){
  console.error("ledger api hatası:", e && (e.ayrinti || e.message || e));
  const durum = e && e.durum === 429 ? 429 : 502;
  res.status(durum).json({
    hata: durum === 429 ? "kota" : "model",
    mesaj: durum === 429
      ? "Ücretsiz katman kotası doldu, biraz sonra dene."
      : "Model cevap vermedi."
  });
}

module.exports = { MODEL, SISTEM, TURLER, anahtar, girdiAl, gemini, jsonCoz, hataVer };
