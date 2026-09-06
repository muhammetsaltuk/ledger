/* §10 — sohbet. Model dört şeyden birini yapar: cevap verir, bugünün planını
   günceller, etkinlik ekler, profile kalıcı bir tercih işler. Yapılandırılmış
   çıktı zorunlu (§12). */

const { TURLER, girdiAl, gemini, jsonCoz, hataVer } = require("./_ortak");

const MADDE = {
  type: "object",
  properties: {
    saat:    { type: "string" },
    sure:    { type: "integer" },
    baslik:  { type: "string" },
    tur:     { type: "string", enum: TURLER },
    gerekce: { type: "string" }
  },
  required: ["saat", "sure", "baslik", "tur"],
  propertyOrdering: ["saat", "sure", "baslik", "tur", "gerekce"]
};

const SEMA = {
  type: "object",
  properties: {
    cevap: { type: "string", description: "kullanıcıya gösterilecek kısa metin" },
    planGuncelle: {
      type: "object",
      nullable: true,
      description: "yalnız bugünün planı değişiyorsa; planın tamamını yaz",
      properties: {
        tarih:     { type: "string" },
        maddeler:  { type: "array", items: MADDE },
        gununNotu: { type: "string" }
      },
      required: ["maddeler"],
      propertyOrdering: ["tarih", "maddeler", "gununNotu"]
    },
    etkinlikEkle: {
      type: "object",
      nullable: true,
      description: "yalnız yeni bir etkinlik varsa",
      properties: {
        tarih:  { type: "string" },
        saat:   { type: "string" },
        sure:   { type: "integer" },
        baslik: { type: "string" }
      },
      required: ["tarih", "baslik"],
      propertyOrdering: ["tarih", "saat", "sure", "baslik"]
    },
    profilEki: {
      type: "string",
      description: "kalıcı bir tercih öğrenildiyse tek cümle; yoksa boş dize"
    }
  },
  required: ["cevap"],
  propertyOrdering: ["cevap", "planGuncelle", "etkinlikEkle", "profilEki"]
};

function planYaz(maddeler){
  if(!Array.isArray(maddeler) || !maddeler.length) return "Bugün için plan yok.";
  return maddeler.map(m =>
    "[" + (m.yapildi ? "x" : " ") + "] " + (m.saat || "--:--") + " " + m.baslik +
    (m.sure ? " (" + m.sure + " dk)" : "") +
    (m.not ? "  — not: " + m.not : "")).join("\n");
}

function istemKur(g){
  const gecmis = (g.sohbet || []).slice(-20)
    .map(m => (m.kim === "ben" ? "Kullanıcı: " : "Sen: ") + m.metin).join("\n");

  return "Kullanıcı sana bir şey yazdı. Ne yapılması gerektiğine karar ver.\n\n" +
    "## Bugün\n" + (g.tarih || "") + " " + (g.gunAdi || "") + "\n" +
    (g.kurs ? "Kurs " + g.kurs.bas + " - " + g.kurs.bit + "\n" : "Bugün kurs yok.\n") +
    (g.vakitler ? "Namaz: " + Object.keys(g.vakitler).map(k => k + " " + g.vakitler[k]).join(" · ") + "\n" : "") +
    "\n## Bugünün planı\n" + planYaz(g.plan) +
    "\n\n## Kullanıcı profili\n" + (g.profil || "Henüz yok.") +
    (gecmis ? "\n\n## Son konuşma\n" + gecmis : "") +
    "\n\n## Kullanıcının yazdığı\n" + String(g.metin || "") +
    "\n\n## Nasıl karar verirsin\n" +
    "- Soru veya sohbetse yalnız `cevap` yaz, diğerlerini boş bırak.\n" +
    "- Bugünün planı değişiyorsa `planGuncelle` içine planın **tamamını** yaz;\n" +
    "  değişmeyen maddeleri de aynen tekrar et, yoksa silinirler.\n" +
    "- Yeni bir randevu/etkinlik söylendiyse `etkinlikEkle` doldur. Tarihi\n" +
    "  yukarıdaki bugüne göre çöz; emin değilsen boş bırak, tahmin etme.\n" +
    "- Kalıcı bir tercih öğrendiysen `profilEki` alanına tek cümle yaz.\n" +
    "  Örnek: \"Sabah koşusunu yapmıyor, akşamı tercih ediyor.\"\n" +
    "  Geçici bir durum için profile satır ekleme.\n" +
    "- `cevap` kısa olsun: ne yaptığını bir cümleyle söyle. Övme, emoji kullanma.";
}

module.exports = async (req, res) => {
  const g = girdiAl(req, res);
  if(!g) return;
  if(!String(g.metin || "").trim()){
    res.status(400).json({ hata: "metin boş" });
    return;
  }

  const bugun = /^\d{4}-\d{2}-\d{2}$/.test(g.tarih || "") ? g.tarih : "";

  try{
    const c = jsonCoz(await gemini(istemKur(g), SEMA, { temperature: 0.6 }));

    const sonuc = {
      cevap: String(c.cevap || "").trim().slice(0, 600),
      planGuncelle: null,
      etkinlikEkle: null,
      profilEki: c.profilEki ? String(c.profilEki).trim().slice(0, 200) : ""
    };

    if(c.planGuncelle && Array.isArray(c.planGuncelle.maddeler) && c.planGuncelle.maddeler.length){
      sonuc.planGuncelle = {
        tarih: bugun || c.planGuncelle.tarih || "",
        maddeler: c.planGuncelle.maddeler
          .filter(m => m && m.baslik)
          .map(m => ({
            saat:    /^\d{2}:\d{2}$/.test(m.saat || "") ? m.saat : "",
            sure:    Number.isFinite(m.sure) && m.sure > 0 ? Math.round(m.sure) : null,
            baslik:  String(m.baslik).slice(0, 120),
            tur:     TURLER.indexOf(m.tur) === -1 ? "bos" : m.tur,
            gerekce: m.gerekce ? String(m.gerekce).slice(0, 200) : ""
          }))
          .sort((a, b) => (a.saat || "99:99").localeCompare(b.saat || "99:99")),
        gununNotu: c.planGuncelle.gununNotu
          ? String(c.planGuncelle.gununNotu).slice(0, 300) : ""
      };
      if(!sonuc.planGuncelle.maddeler.length) sonuc.planGuncelle = null;
    }

    if(c.etkinlikEkle && c.etkinlikEkle.baslik &&
       /^\d{4}-\d{2}-\d{2}$/.test(c.etkinlikEkle.tarih || "") &&
       (!bugun || c.etkinlikEkle.tarih >= bugun)){
      sonuc.etkinlikEkle = {
        tarih:  c.etkinlikEkle.tarih,
        saat:   /^\d{2}:\d{2}$/.test(c.etkinlikEkle.saat || "") ? c.etkinlikEkle.saat : "",
        sure:   Number.isFinite(c.etkinlikEkle.sure) && c.etkinlikEkle.sure > 0
                  ? Math.round(c.etkinlikEkle.sure) : 0,
        baslik: String(c.etkinlikEkle.baslik).trim().slice(0, 80)
      };
    }

    if(!sonuc.cevap) throw new Error("boş cevap");
    res.status(200).json(sonuc);
  }catch(e){
    hataVer(res, e);
  }
};
