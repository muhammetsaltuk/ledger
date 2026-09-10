/* §6 — günlük planı üretir. Yapılandırılmış çıktı zorunlu (§12). */

const { TURLER, girdiAl, gemini, jsonCoz, hataVer } = require("./_ortak");

const SEMA = {
  type: "object",
  properties: {
    tarih: { type: "string", description: "YYYY-MM-DD" },
    maddeler: {
      type: "array",
      items: {
        type: "object",
        properties: {
          saat:    { type: "string",  description: "HH:MM, 24 saat" },
          sure:    { type: "integer", description: "dakika" },
          baslik:  { type: "string" },
          tur:     { type: "string", enum: TURLER },
          gerekce: { type: "string", description: "tek cümle, isteğe bağlı" }
        },
        required: ["saat", "sure", "baslik", "tur"],
        propertyOrdering: ["saat", "sure", "baslik", "tur", "gerekce"]
      }
    },
    gununNotu: { type: "string" }
  },
  required: ["tarih", "maddeler"],
  propertyOrdering: ["tarih", "maddeler", "gununNotu"]
};

/* §6 — Değişmeyenler. Model bu çerçevenin dışına çıkmaz. */
const CERCEVE = `Çerçeve (dışına çıkma):
- Kurs saatleri sabittir, üstüne başka bir şey koyma.
- Uyku hedefi 8 saat. Kurs günlerinde uyku iki parçalı planlanır: sabah namazı,
  sonra tekrar uyku, sonra sabah kalkışı.
- Kahvaltı, spordan sonraki 45 dakika içinde.
- 22:00'den sonra tam öğün yok.
- Yatmadan önce 20 dakika kitap.
- Günde en az bir kez ev sporu. Koşu haftada üç gün ve yalnız kursun olmadığı günler.
- Namaz maddelerini vaktin aralığı içine yerleştir, aralığın dışına taşırma.`;

function bolum(baslik, icerik){
  return icerik ? "\n\n## " + baslik + "\n" + icerik : "";
}

function istemKur(g){
  const kurs = g.kurs
    ? g.kurs.bas + " - " + g.kurs.bit + " arası İngilizce kursu"
    : "Bugün kurs yok.";

  const vakitler = g.vakitler
    ? Object.keys(g.vakitler).map(k => k + ": " + g.vakitler[k]).join(" · ")
    : "bilinmiyor";

  const borc = g.borc && Object.keys(g.borc).filter(k => g.borc[k] > 0).length
    ? Object.keys(g.borc).filter(k => g.borc[k] > 0)
        .map(k => k + " " + g.borc[k]).join(" · ")
    : "yok";

  const etkinlik = (g.etkinlikler || []).length
    ? g.etkinlikler.map(e => e.tarih + " " + (e.saat || "") + " " + e.baslik +
        (e.sure ? " (" + e.sure + " dk)" : "")).join("\n")
    : "";

  function gunSatiri(gun, kisa){
    const satir = [gun.tarih + (gun.gunAdi ? " " + gun.gunAdi : "")];
    if(gun.namaz) satir.push("namaz: " + gun.namaz);
    if(gun.su != null) satir.push("su: " + gun.su + "/10");
    (gun.maddeler || []).forEach(m => {
      satir.push("  [" + (m.yapildi ? "x" : " ") + "] " + (m.saat || "") + " " +
        m.baslik + (m.not ? "  — not: " + m.not : ""));
    });
    if(!kisa && gun.gununNotu)     satir.push("  planın şekli: " + gun.gununNotu);
    if(gun.kullaniciNotu)          satir.push("  kullanıcı: " + gun.kullaniciNotu);
    if(gun.degerlendirme)          satir.push("  gün sonu değerlendirmesi: " + gun.degerlendirme);
    return satir.join("\n");
  }

  const dizi = g.son14 || [];
  const dun  = dizi.length ? dizi[dizi.length - 1] : null;
  const dunCumle = String(g.dun || "").trim().slice(0, 400);

  const dunMetni = (() => {
    const parcalar = [];
    if(dun) parcalar.push(gunSatiri(dun, false));
    if(dunCumle) parcalar.push("Kullanıcının az önce yazdığı: " + dunCumle);
    return parcalar.join("\n");
  })();

  const gecmis = dizi.length > 1
    ? dizi.slice(0, -1).map(gun => gunSatiri(gun, true)).join("\n\n")
    : (dizi.length ? "" : "Kayıt yok; bu ilk günlerden biri.");

  return "Bugün için bir günlük plan üret." +
    bolum("Bugün", g.tarih + " " + (g.gunAdi || "") + "\n" + kurs) +
    bolum("Namaz vakitleri", vakitler) +
    bolum("Kaza borcu", borc + (borc !== "yok"
      ? "\nBirikmiş borç varsa güne bir kaza namazı yerleştirebilirsin." : "")) +
    bolum("Yaklaşan etkinlikler", etkinlik) +
    bolum("Kullanıcı profili", g.profil) +
    bolum("Dün", dunMetni) +
    bolum("Daha önceki günler", gecmis) +
    bolum("Çerçeve", CERCEVE) +
    "\n\n## Nasıl\n" +
    "- Günün tamamını planla, sabah kalkıştan yatmaya kadar.\n" +
    "- Saatler HH:MM, 24 saat biçiminde ve artan sırada olsun.\n" +
    "- **Bugünü düne göre ayarla.** Dün yarım kalan ya da atlanan bir işi bugüne\n" +
    "  taşı; sürekli aksayan bir maddenin saatini/süresini değiştir ya da bugün\n" +
    "  çıkar. Dünkü değerlendirmedeki veya kullanıcının yazdığı tek öneriyi uygula.\n" +
    "- **Sabit şablon üretme.** Esnek blokların (kod, ev sporu, kitap, serbest\n" +
    "  zaman) sırasını ve sürelerini günden güne değiştir. Çerçevedeki maddeler\n" +
    "  değişmez; onların dışındaki her şey düne ve bugünün koşullarına göre akar.\n" +
    "- `gerekce` kısa ve isteğe bağlıdır; yalnız kayıtta karşılığı olan bir gözleme\n" +
    "  dayanıyorsa yaz. Uydurma.\n" +
    "- `gununNotu` en fazla iki cümle: bugünkü planın dünden ne farkla kurulduğu.";
}

module.exports = async (req, res) => {
  const g = girdiAl(req, res);
  if(!g) return;

  try{
    const metin = await gemini(istemKur(g), SEMA, { temperature: 0.8 });
    const plan  = jsonCoz(metin);

    // Model şemayı tutturmuş olsa da gelen veriyi kendimiz sağlama alalım.
    if(!plan || !Array.isArray(plan.maddeler) || !plan.maddeler.length)
      throw new Error("plan boş geldi");

    plan.tarih = g.tarih || plan.tarih;
    plan.maddeler = plan.maddeler
      .filter(m => m && m.baslik)
      .map(m => ({
        saat:    /^\d{2}:\d{2}$/.test(m.saat || "") ? m.saat : "",
        sure:    Number.isFinite(m.sure) ? Math.max(0, Math.round(m.sure)) : null,
        baslik:  String(m.baslik).slice(0, 120),
        tur:     TURLER.indexOf(m.tur) === -1 ? "bos" : m.tur,
        gerekce: m.gerekce ? String(m.gerekce).slice(0, 200) : ""
      }))
      // Saatsiz maddeler sona: boş dize aksi halde 08:00'in önüne geçer.
      .sort((a, b) => (a.saat || "99:99").localeCompare(b.saat || "99:99"));
    plan.gununNotu = plan.gununNotu ? String(plan.gununNotu).slice(0, 300) : "";

    res.status(200).json(plan);
  }catch(e){
    hataVer(res, e);
  }
};
