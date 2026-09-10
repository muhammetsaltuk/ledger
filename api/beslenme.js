/* §15 — beslenme: program üretimi, alternatif yemek, fotoğraftan kalori.
   Kalori/makro hedefi İSTEMCİDE hesaplanır (Mifflin-St Jeor); burada model
   yalnız o hedefe göre öğünleri kurar. Yapılandırılmış çıktı zorunlu (§12). */

const { girdiAl, gemini, jsonCoz, hataVer } = require("./_ortak");

/* --- Şemalar ------------------------------------------------------ */

const YEMEK = {
  type: "object",
  properties: {
    ad:      { type: "string" },
    miktar:  { type: "string", description: "ör. 100 g, 1 kase, 2 dilim" },
    kalori:  { type: "integer" },
    protein: { type: "integer", description: "gram" },
    karb:    { type: "integer", description: "gram" },
    yag:     { type: "integer", description: "gram" },
    tarif:   { type: "string", description: "kısa hazırlanış, en fazla 60 kelime" }
  },
  required: ["ad", "miktar", "kalori", "tarif"],
  propertyOrdering: ["ad", "miktar", "kalori", "protein", "karb", "yag", "tarif"]
};

const SEMA_PROGRAM = {
  type: "object",
  properties: {
    gunlukKalori: { type: "integer" },
    makro: {
      type: "object",
      properties: {
        protein: { type: "integer" }, karb: { type: "integer" }, yag: { type: "integer" }
      },
      required: ["protein", "karb", "yag"],
      propertyOrdering: ["protein", "karb", "yag"]
    },
    ogunler: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ad:      { type: "string", description: "Kahvaltı, Ara öğün, Öğle, İkindi, Akşam" },
          saat:    { type: "string", description: "HH:MM, isteğe bağlı" },
          yemekler: { type: "array", items: YEMEK }
        },
        required: ["ad", "yemekler"],
        propertyOrdering: ["ad", "saat", "yemekler"]
      }
    },
    not: { type: "string", description: "programın mantığı, en fazla iki cümle" }
  },
  required: ["gunlukKalori", "makro", "ogunler"],
  propertyOrdering: ["gunlukKalori", "makro", "ogunler", "not"]
};

const SEMA_ALTERNATIF = Object.assign({}, YEMEK);

const SEMA_FOTO = {
  type: "object",
  properties: {
    yemek:   { type: "string", description: "ne olduğunu kısa yaz" },
    kalori:  { type: "integer" },
    protein: { type: "integer", description: "gram" },
    karb:    { type: "integer", description: "gram" },
    yag:     { type: "integer", description: "gram" },
    guven:   { type: "string", enum: ["yuksek", "orta", "dusuk"] },
    not:     { type: "string", description: "varsayımların, en fazla bir cümle" }
  },
  required: ["yemek", "kalori", "guven"],
  propertyOrdering: ["yemek", "kalori", "protein", "karb", "yag", "guven", "not"]
};

/* --- İstem kurucular -------------------------------------------- */

function profilMetni(p){
  if(!p) return "bilinmiyor";
  return [
    p.cinsiyet === "kadin" ? "kadın" : "erkek",
    (p.yas || "?") + " yaş",
    (p.boy || "?") + " cm",
    (p.kilo || "?") + " kg",
    "aktivite: " + (p.aktivite || "?"),
    "haftalık hedef: +" + (p.haftalikHedef != null ? p.haftalikHedef : "?") + " kg"
  ].join(", ");
}

function programIstem(g){
  const h = g.hedef || {};
  const sevme = (g.sevmedigim || []).length
    ? g.sevmedigim.join(", ")
    : "yok";
  const mevcut = g.mevcut && g.mevcut.ogunler
    ? "\n\n## Şu anki program (üzerine düşün, tamamen değiştirmek zorunda değilsin)\n" +
      g.mevcut.ogunler.map(o => "- " + o.ad + ": " +
        (o.yemekler || []).map(y => y.ad).join(", ")).join("\n")
    : "";

  return "Kilo almak isteyen kullanıcı için bir günlük beslenme programı üret.\n\n" +
    "## Kullanıcı\n" + profilMetni(g.profil) +
    (g.profil && g.profil.metin ? "\n" + g.profil.metin : "") + "\n\n" +
    "## Günlük hedef (bunu tuttur)\n" +
    "- Kalori: " + (h.hedef || "?") + " kcal\n" +
    "- Protein: " + (h.protein || "?") + " g\n" +
    "- Karbonhidrat: " + (h.karb || "?") + " g\n" +
    "- Yağ: " + (h.yag || "?") + " g\n\n" +
    "## Sevmediği yemekler (kullanma)\n" + sevme + mevcut + "\n\n" +
    "## Kurallar\n" +
    "- Türkiye'de bulunan, sıradan yemekler. Pahalı ya da egzotik malzeme yok.\n" +
    "- 4-6 öğün; kilo almak için ara öğünler dahil.\n" +
    "- Öğünlerin kalori toplamı günlük hedefe ±100 kcal yaklaşsın; makrolar da yakın olsun.\n" +
    "- Her yemek için `miktar` gram/porsiyon olarak net yazılsın.\n" +
    "- Her yemek için kısa bir `tarif` (hazırlanış) yaz; en fazla 60 kelime. Uydurma.\n" +
    "- Sevmediği listesindekileri ve yakın türevlerini hiç koyma.\n" +
    "- `not` en fazla iki cümle: programın neden böyle kurulduğu.\n" +
    "- Övme, motivasyon cümlesi kurma, emoji kullanma.";
}

function alternatifIstem(g){
  const y = g.yemek || {};
  const sevme = (g.sevmedigim || []).length ? g.sevmedigim.join(", ") : "yok";
  return "Bir beslenme programındaki bir yemek beğenilmedi. Yerine geçecek TEK bir " +
    "yemek öner.\n\n" +
    "## Değişecek yemek\n" +
    "- " + (y.ad || "?") + " (" + (y.miktar || "?") + ") — " +
    (y.kalori || "?") + " kcal, P" + (y.protein || 0) + " K" + (y.karb || 0) + " Y" + (y.yag || 0) + "\n" +
    (g.ogun ? "- Öğün: " + g.ogun + "\n" : "") + "\n" +
    "## Sevmediği yemekler (bunu ve listedekileri önerme)\n" + sevme + "\n\n" +
    "## Kurallar\n" +
    "- Kalorisi ve makroları değişen yemeğe yakın olsun (±80 kcal).\n" +
    "- Türkiye'de bulunan sıradan bir yemek.\n" +
    "- `miktar` net, `tarif` en fazla 60 kelime, uydurma yok.\n" +
    "- Sadece yemeği döndür; açıklama yazma.";
}

function fotoIstem(g){
  return [
    { text:
      "Fotoğraftaki yemeği ya da besin etiketini incele ve tek bir öğün için " +
      "kalori ve makro tahmini yap.\n\n" +
      (g.ipucu ? "## Kullanıcının notu\n" + String(g.ipucu).slice(0, 200) + "\n\n" : "") +
      "## Kurallar\n" +
      "- Etiket görüyorsan porsiyon başına değerleri oku.\n" +
      "- Tabak görüyorsan görünen porsiyonu tahmin et; tabak/çatal boyutundan ölçek çıkar.\n" +
      "- Emin değilsen `guven` alanını 'dusuk' yap ve `not`ta neyi varsaydığını yaz.\n" +
      "- `yemek` kısa olsun: 'Mercimek çorbası', 'Tavuklu pilav', 'Protein bar'.\n" +
      "- Rakamları abartma; makul bir tek porsiyon tahmini ver." },
    { inline_data: { mime_type: g.mime || "image/jpeg", data: String(g.foto || "") } }
  ];
}

/* --- Sağlama --------------------------------------------------- */

function tamsayi(x){ return Number.isFinite(+x) ? Math.max(0, Math.round(+x)) : 0; }

function yemekTemizle(y){
  return {
    ad:      String(y.ad || "").slice(0, 80),
    miktar:  String(y.miktar || "").slice(0, 40),
    kalori:  tamsayi(y.kalori),
    protein: tamsayi(y.protein),
    karb:    tamsayi(y.karb),
    yag:     tamsayi(y.yag),
    tarif:   String(y.tarif || "").slice(0, 600)
  };
}

module.exports = async (req, res) => {
  const g = girdiAl(req, res);
  if(!g) return;

  const mod = g.mod || "program";

  try{
    if(mod === "program"){
      const p = jsonCoz(await gemini(programIstem(g), SEMA_PROGRAM, { temperature: 0.7 }));
      if(!p || !Array.isArray(p.ogunler) || !p.ogunler.length)
        throw new Error("program boş geldi");

      p.gunlukKalori = tamsayi(p.gunlukKalori);
      p.makro = {
        protein: tamsayi(p.makro && p.makro.protein),
        karb:    tamsayi(p.makro && p.makro.karb),
        yag:     tamsayi(p.makro && p.makro.yag)
      };
      p.ogunler = p.ogunler
        .filter(o => o && o.ad && Array.isArray(o.yemekler) && o.yemekler.length)
        .map(o => ({
          ad:    String(o.ad).slice(0, 40),
          saat:  /^\d{2}:\d{2}$/.test(o.saat || "") ? o.saat : "",
          yemekler: o.yemekler.filter(y => y && y.ad).map(yemekTemizle)
        }))
        .filter(o => o.yemekler.length);
      if(!p.ogunler.length) throw new Error("program boş geldi");
      p.not = p.not ? String(p.not).slice(0, 300) : "";

      res.status(200).json(p);
      return;
    }

    if(mod === "alternatif"){
      const y = yemekTemizle(jsonCoz(await gemini(alternatifIstem(g), SEMA_ALTERNATIF, { temperature: 0.8 })));
      if(!y.ad) throw new Error("alternatif boş geldi");
      res.status(200).json(y);
      return;
    }

    if(mod === "foto"){
      if(!g.foto || String(g.foto).length < 100){
        res.status(400).json({ hata: "foto yok" });
        return;
      }
      const f = jsonCoz(await gemini(fotoIstem(g), SEMA_FOTO, { temperature: 0.2 }));
      if(!f || !f.yemek) throw new Error("çözümlenemedi");
      res.status(200).json({
        yemek:   String(f.yemek).slice(0, 80),
        kalori:  tamsayi(f.kalori),
        protein: tamsayi(f.protein),
        karb:    tamsayi(f.karb),
        yag:     tamsayi(f.yag),
        guven:   ["yuksek", "orta", "dusuk"].indexOf(f.guven) === -1 ? "dusuk" : f.guven,
        not:     f.not ? String(f.not).slice(0, 200) : ""
      });
      return;
    }

    res.status(400).json({ hata: "bilinmeyen mod" });
  }catch(e){
    hataVer(res, e);
  }
};
