/* §19 — Java roadmap'inin bir haftasının tam müfredatını Notion'dan canlı
   okur: gün gün Konu/Kaynak/Uygulama, algoritma satırı, haftalık kontrol.
   Salt okunur — hiçbir şeye yazmaz, api/notion.js'in (§18) tersi yön.
   Ledger'ın "Yol Haritası" görünümü bunu her açılışta ve her hafta
   değişiminde tazeler; önbelleklenmez (§19 README). */

const { anahtar, haftaIcerigi } = require("./_notion");

module.exports = async (req, res) => {
  if(req.method !== "POST" && req.method !== "GET"){
    res.status(405).json({ hata: "yalnız GET veya POST" });
    return;
  }
  if(!anahtar()){
    res.status(503).json({ hata: "anahtar-yok",
      mesaj: "NOTION_API_KEY tanımlı değil; roadmap görünümü kapalı." });
    return;
  }

  let hafta;
  if(req.method === "GET"){
    const u = new URL(req.url, "http://x");
    hafta = Number(u.searchParams.get("hafta"));
  }else{
    let g = req.body;
    if(typeof g === "string"){ try{ g = JSON.parse(g); }catch(e){ g = null; } }
    hafta = g && Number(g.hafta);
  }
  if(!Number.isInteger(hafta) || hafta < 1 || hafta > 20){
    res.status(400).json({ hata: "geçersiz hafta" });
    return;
  }

  try{
    const icerik = await haftaIcerigi(hafta);
    if(!icerik){
      res.status(404).json({ hata: "hafta-bulunamadi" });
      return;
    }
    res.status(200).json(icerik);
  }catch(e){
    console.error("roadmap api hatası:", e && (e.ayrinti || e.message || e));
    res.status(502).json({
      hata: "notion",
      mesaj: (e && e.durum) === 401 || (e && e.durum) === 403
        ? "Notion entegrasyonunun sayfaya erişimi yok ya da anahtar geçersiz."
        : "Roadmap okunamadı."
    });
  }
};
