/* §12 — gün sonu değerlendirmesi (düz metin, en fazla 120 kelime).
   §9 — uzun vadeli profilin yeniden yazımı da buradan çıkar: girdileri aynı
   (profil + son 14 günün kaydı), çıktısı yine düz metin. §2'deki dosya listesi
   beş fonksiyonla sınırlı olduğu için ayrı bir uç nokta açmadım; `tur` alanı
   hangi işin istendiğini söyler. */

const { girdiAl, gemini, hataVer } = require("./_ortak");

function kayitYaz(son14){
  if(!Array.isArray(son14) || !son14.length) return "Kayıt yok.";
  return son14.map(gun => {
    const satir = [gun.tarih + (gun.gunAdi ? " " + gun.gunAdi : "")];
    if(gun.namaz) satir.push("namaz: " + gun.namaz);
    if(gun.su != null) satir.push("su: " + gun.su + "/10");
    (gun.maddeler || []).forEach(m => {
      satir.push("  [" + (m.yapildi ? "x" : " ") + "] " + (m.saat || "") + " " +
        m.baslik + (m.not ? "  — not: " + m.not : ""));
    });
    return satir.join("\n");
  }).join("\n\n");
}

function gunIstemi(g){
  return "Bugünü değerlendir.\n\n" +
    "## Bugün\n" + (g.tarih || "") + " " + (g.gunAdi || "") + "\n\n" +
    "## Kullanıcı profili\n" + (g.profil || "Henüz yok.") + "\n\n" +
    "## Son 14 günün kaydı\n" + kayitYaz(g.son14) + "\n\n" +
    "## Nasıl\n" +
    "- En fazla 120 kelime, düz metin. Liste yapma, madde işareti kullanma.\n" +
    "- Bir şeyin neden yürümediğine dair somut bir gözlem yaz; gözlem kayıtta\n" +
    "  görünen bir şeye dayansın, uydurma.\n" +
    "- Ertesi gün için tek bir öneri ver, ölçülebilir olsun.\n" +
    "- Başlık atma, doğrudan yaz.";
}

/* §9 — profili yeniden yazma istemi, şartnamedeki cümlelerle. */
function profilIstemi(g){
  return "Aşağıdaki mevcut profili ve son 14 günün kaydını oku. Profili yeniden yaz. " +
    "Sadece kayıtta kanıtı olan gözlemleri yaz. Tahmin yürütme. En fazla 400 kelime.\n\n" +
    "## Mevcut profil\n" + (g.profil || "Henüz yok.") + "\n\n" +
    "## Son 14 günün kaydı\n" + kayitYaz(g.son14) + "\n\n" +
    "## Nasıl\n" +
    "- İçerik kullanıcının gözlemlenmiş davranışıdır, hedefleri değil.\n" +
    "- Her satır tek bir gözlem olsun: ne yaptığı, ne zaman yaptığı, neyi yapmadığı.\n" +
    "- Kanıtı olmayan bir gözlemi yazma, satır sayısını doldurmaya çalışma.\n" +
    "- Öğüt verme, yorum yapma. Yalnız gözlem.\n" +
    "- Düz metin, başlıksız.";
}

/** Kelime sınırını sunucuda uygula; model aşarsa kesilir. */
function kelimeKes(metin, sinir){
  const p = String(metin).trim().split(/\s+/);
  return p.length <= sinir ? p.join(" ") : p.slice(0, sinir).join(" ") + "…";
}

module.exports = async (req, res) => {
  const g = girdiAl(req, res);
  if(!g) return;

  const profilMi = g.tur === "profil";

  try{
    const metin = await gemini(
      profilMi ? profilIstemi(g) : gunIstemi(g),
      null,                                   // düz metin döner (§12)
      { temperature: profilMi ? 0.3 : 0.6 }
    );
    const temiz = kelimeKes(metin, profilMi ? 400 : 120);
    if(!temiz) throw new Error("boş cevap");

    res.status(200).json(profilMi ? { profil: temiz } : { metin: temiz });
  }catch(e){
    hataVer(res, e);
  }
};
