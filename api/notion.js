/* §18 — Java roadmap'inin haftalık kontrol checkbox'larını Notion'da işaretler.
   Yapay zeka fonksiyonlarından (api/_ortak.js) bağımsız: bu uçta model yok,
   yalnız Notion REST API'ye düz istek var (paylaşılan yardımcılar api/_notion.js'te
   — api/roadmap.js, §19, aynı dosyayı salt okuma için kullanıyor). Otomatik
   tetiklenmez — istemci bunu yalnız kullanıcı "bu haftayı gerçekten biliyorum"
   dediğinde çağırır (§17/§18 README). Roadmap'in checkbox'ları "bakmadan"
   kendi kendine test sorularıdır; ledger'daki bir günü "yapıldı" işaretlemek
   "biliyorum" anlamına gelmez, o yüzden bağlantı tek yönlü ve elle onaylıdır. */

const { anahtar, fazBul, notionIstek, cocuklariGetir, haftaninToDolari } = require("./_notion");

async function toDoIsaretle(blokId){
  await notionIstek("/blocks/" + blokId, {
    method: "PATCH",
    body: JSON.stringify({ to_do: { checked: true } })
  });
}

module.exports = async (req, res) => {
  if(req.method !== "POST"){
    res.status(405).json({ hata: "yalnız POST" });
    return;
  }
  if(!anahtar()){
    // §12'deki "anahtar yoksa uygulamanın geri kalanı çalışsın" kuralıyla aynı.
    res.status(503).json({ hata: "anahtar-yok",
      mesaj: "NOTION_API_KEY tanımlı değil; Notion senkronu kapalı." });
    return;
  }

  let govde = req.body;
  if(typeof govde === "string"){
    try{ govde = JSON.parse(govde); }catch(e){ govde = null; }
  }
  const hafta = govde && Number(govde.hafta);
  if(!Number.isInteger(hafta) || hafta < 1 || hafta > 20){
    res.status(400).json({ hata: "geçersiz hafta" });
    return;
  }

  const faz = fazBul(hafta);
  if(!faz){
    res.status(400).json({ hata: "hafta eşleşmedi" });
    return;
  }

  try{
    const bloklar = await cocuklariGetir(faz.sayfa);
    const toDolar = haftaninToDolari(bloklar, hafta);
    if(!toDolar.length){
      res.status(404).json({ hata: "kontrol-listesi-bulunamadi",
        mesaj: "Hafta " + hafta + " için Notion'da checkbox bulunamadı." });
      return;
    }
    let isaretlenen = 0;
    for(const b of toDolar){
      if(b.to_do && b.to_do.checked) continue;    // zaten işaretliyse tekrar yazma
      await toDoIsaretle(b.id);
      isaretlenen++;
    }
    res.status(200).json({ tamam: true, isaretlenen: isaretlenen, toplam: toDolar.length });
  }catch(e){
    console.error("notion api hatası:", e && (e.ayrinti || e.message || e));
    res.status(502).json({
      hata: "notion",
      mesaj: (e && e.durum) === 401 || (e && e.durum) === 403
        ? "Notion entegrasyonunun sayfaya erişimi yok ya da anahtar geçersiz."
        : "Notion güncellenemedi."
    });
  }
};
