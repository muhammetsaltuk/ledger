/* §7 — serbest metni etkinliğe çevirir.
   "12 Eylül saat 14'te berber randevum var" → {tarih, saat, sure, baslik} */

const { girdiAl, gemini, jsonCoz, hataVer } = require("./_ortak");

const SEMA = {
  type: "object",
  properties: {
    tarih:  { type: "string", description: "YYYY-MM-DD; emin değilsen boş bırak" },
    saat:   { type: "string", description: "HH:MM; emin değilsen boş bırak" },
    sure:   { type: "integer", description: "dakika; bilinmiyorsa 0" },
    baslik: { type: "string", description: "kısa ad, en fazla üç kelime" }
  },
  required: ["tarih", "saat", "sure", "baslik"],
  propertyOrdering: ["tarih", "saat", "sure", "baslik"]
};

const GUNLER = ["Pazar","Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"];

function istemKur(metin, bugun, gunAdi){
  return "Aşağıdaki cümleyi bir etkinliğe çevir.\n\n" +
    "## Bugün\n" + bugun + (gunAdi ? " " + gunAdi : "") + "\n\n" +
    "## Cümle\n" + metin + "\n\n" +
    "## Kurallar\n" +
    "- \"yarın\", \"önümüzdeki salı\", \"haftaya\" gibi ifadeleri yukarıdaki bugüne göre çöz.\n" +
    "- Yıl söylenmemişse bugünün yılını kullan; o tarih geçmişte kalıyorsa bir sonraki yıl.\n" +
    "- Saat söylenmemişse `saat` alanını boş bırak. Tahmin etme.\n" +
    "- Tarih çözülemiyorsa `tarih` alanını boş bırak. Tahmin etme.\n" +
    "- Süre söylenmemişse 0 yaz.\n" +
    "- `baslik` kısa olsun: \"Berber\", \"Diş hekimi\", \"Kargo teslim\".";
}

module.exports = async (req, res) => {
  const g = girdiAl(req, res);
  if(!g) return;

  const metin = String(g.metin || "").trim().slice(0, 500);
  if(!metin){
    res.status(400).json({ hata: "metin boş" });
    return;
  }
  const bugun = /^\d{4}-\d{2}-\d{2}$/.test(g.bugun || "")
    ? g.bugun
    : new Date().toISOString().slice(0, 10);
  const gunAdi = GUNLER[new Date(bugun + "T12:00:00").getDay()];

  try{
    const cevap = jsonCoz(await gemini(istemKur(metin, bugun, gunAdi), SEMA, { temperature: 0.1 }));

    // Model emin değilse alan boş kalsın; uydurulmuş tarihi kabul etmeyelim.
    const etkinlik = {
      tarih:  /^\d{4}-\d{2}-\d{2}$/.test(cevap.tarih || "") ? cevap.tarih : "",
      saat:   /^\d{2}:\d{2}$/.test(cevap.saat || "") ? cevap.saat : "",
      sure:   Number.isFinite(cevap.sure) && cevap.sure > 0 ? Math.round(cevap.sure) : 0,
      baslik: String(cevap.baslik || "").trim().slice(0, 80)
    };
    // Geçmişe düşen bir tarih neredeyse her zaman yanlış çözümdür.
    if(etkinlik.tarih && etkinlik.tarih < bugun) etkinlik.tarih = "";

    res.status(200).json(etkinlik);
  }catch(e){
    hataVer(res, e);
  }
};
