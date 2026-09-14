/* §16 — Supabase senkronu: UYG.veri'nin tek satırlık uzak kopyası.
   Giriş ekranı yok. İstemci ilk kez senkron açtığında rastgele bir anahtar
   üretir; bu anahtarın SHA-256 hash'i "veri" satırında yoksa ilk yazan onu
   sahiplenir (bootstrap kilidi). Sonraki her istek aynı hash'i taşımak
   zorunda. Anahtarın kendisi sunucuda hiç saklanmaz, yalnız hash'i.

   Supabase'e yalnız SUPABASE_SERVICE_ROLE_KEY ile, sunucudan erişilir —
   bu anahtar hiçbir koşulda istemciye gitmez (RLS "veri" tablosunda anon/
   authenticated için zaten her şeyi reddediyor; service_role RLS'i atlar). */

const crypto = require("crypto");

const SATIR_ID = "tek";
const BOYUT_SINIRI = 2000000;              // 2 MB — tek kullanıcı için bol

// Proje URL'i gizli değil (Supabase'in kendisi bunu istemciye zaten söyler);
// env değişkeni tanımlıysa o üstün gelir, tanımsızsa buraya düşer — kurulumda
// tek gerçek sır SUPABASE_SERVICE_ROLE_KEY olarak kalsın diye.
const SUPABASE_URL_VARSAYILAN = "https://xkomkawyqekhdxjngrws.supabase.co";

function supabaseUrl(){
  return process.env.SUPABASE_URL || SUPABASE_URL_VARSAYILAN;
}
function supabaseAyarli(){
  return !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function hashle(anahtar){
  return crypto.createHash("sha256").update(String(anahtar)).digest("hex");
}

async function supabaseIstek(yol, secenek){
  const taban = supabaseUrl().replace(/\/$/, "");
  const servisAnahtari = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return fetch(taban + "/rest/v1/" + yol, Object.assign({}, secenek, {
    headers: Object.assign({
      apikey: servisAnahtari,
      Authorization: "Bearer " + servisAnahtari,
      "Content-Type": "application/json"
    }, (secenek && secenek.headers) || {})
  }));
}

/** Satırı okur. Yoksa null döner. */
async function satiriOku(){
  const cevap = await supabaseIstek(
    "veri?id=eq." + SATIR_ID + "&select=icerik,anahtar_ozet,guncellendi", { method: "GET" });
  if(!cevap.ok) throw new Error("supabase okuma " + cevap.status);
  const satirlar = await cevap.json();
  return satirlar[0] || null;
}

module.exports = async (req, res) => {
  if(!supabaseAyarli()){
    res.status(503).json({ hata: "supabase-yok",
      mesaj: "SUPABASE_SERVICE_ROLE_KEY tanımlı değil." });
    return;
  }

  const anahtar = req.headers["x-ledger-anahtar"];
  if(!anahtar || String(anahtar).length < 16){
    res.status(400).json({ hata: "anahtar yok" });
    return;
  }
  const ozet = hashle(anahtar);

  try{
    if(req.method === "GET"){
      const satir = await satiriOku();
      if(!satir){ res.status(200).json({ icerik: null, guncellendi: null }); return; }
      if(satir.anahtar_ozet && satir.anahtar_ozet !== ozet){
        res.status(401).json({ hata: "yetkisiz" });
        return;
      }
      res.status(200).json({ icerik: satir.icerik, guncellendi: satir.guncellendi });
      return;
    }

    if(req.method === "POST" || req.method === "PUT"){
      let govde = req.body;
      if(typeof govde === "string"){
        try{ govde = JSON.parse(govde); }catch(e){ govde = null; }
      }
      if(!govde || typeof govde !== "object" || !govde.icerik || typeof govde.icerik !== "object"){
        res.status(400).json({ hata: "gövde okunamadı" });
        return;
      }
      if(JSON.stringify(govde.icerik).length > BOYUT_SINIRI){
        res.status(413).json({ hata: "cok-buyuk" });
        return;
      }

      const satir = await satiriOku();
      if(satir && satir.anahtar_ozet && satir.anahtar_ozet !== ozet){
        res.status(401).json({ hata: "yetkisiz" });
        return;
      }

      const guncellendi = new Date().toISOString();
      const cevap = await supabaseIstek("veri", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify([{
          id: SATIR_ID, icerik: govde.icerik, anahtar_ozet: ozet, guncellendi: guncellendi
        }])
      });
      if(!cevap.ok){
        const ham = await cevap.text().catch(() => "");
        console.error("supabase yazma hatası:", ham.slice(0, 300));
        res.status(502).json({ hata: "supabase", mesaj: "Yazılamadı." });
        return;
      }
      res.status(200).json({ tamam: true, guncellendi: guncellendi });
      return;
    }

    res.status(405).json({ hata: "yöntem desteklenmiyor" });
  }catch(e){
    console.error("ledger api/veri hatası:", e && e.message);
    res.status(502).json({ hata: "sunucu", mesaj: "Senkron başarısız." });
  }
};
