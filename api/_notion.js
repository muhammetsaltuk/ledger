/* §17/§18/§19 — Notion roadmap sayfaları için paylaşılan yardımcılar.
   api/notion.js (§18, checkbox işaretleme — yazma) ve api/roadmap.js
   (§19, müfredat okuma — salt okuma) ve api/plan.js (§17, günlük plana
   zenginleştirme) bu dosyayı paylaşır. Alt çizgiyle başlayan dosyalar
   Vercel'de uç nokta sayılmaz (bkz. api/_ortak.js).

   NOTION_API_KEY hiçbir koşulda istemciye gitmez: yalnız burada, sunucu
   tarafında okunur. */

const SURUM = "2022-06-28";
const TABAN = "https://api.notion.com/v1";

/* Hangi hafta hangi Faz sayfasında. Sayfa ID'leri Notion URL'inin
   app.notion.com/p/<id> kısmından, tire olmadan. Roadmap'in kendisi
   (index.html'deki JAVA_FAZLAR) yalnız isim + hafta aralığı tutar; sayfa
   ID'leri istemciye gitmesin diye yalnız burada. */
const FAZ_SAYFALARI = [
  { ilk:1,  son:4,  ad:"Java temeli",                   sayfa:"3e2921af4e6781ce903adf5ccd27e5b1" },
  { ilk:5,  son:7,  ad:"Web ve veritabanı temelleri",   sayfa:"3e2921af4e678190969bf7c335da3e0c" },
  { ilk:8,  son:12, ad:"Spring Boot",                    sayfa:"3e2921af4e6781119ebbe5b11674eecd" },
  { ilk:13, son:16, ad:"DevOps temelleri",                sayfa:"3e2921af4e678190b6fdf613a38d18ab" },
  { ilk:17, son:20, ad:"İleri konular ve iş hazırlığı",   sayfa:"3e2921af4e6781a6af65c04020bbe666" }
];

function fazBul(hafta){
  return FAZ_SAYFALARI.find(f => hafta >= f.ilk && hafta <= f.son) || null;
}

function anahtar(){
  return process.env.NOTION_API_KEY || "";
}

function basliklar(){
  return {
    "Authorization": "Bearer " + anahtar(),
    "Notion-Version": SURUM,
    "Content-Type": "application/json"
  };
}

async function notionIstek(yol, secenek){
  const cevap = await fetch(TABAN + yol, Object.assign({ headers: basliklar() }, secenek || {}));
  if(!cevap.ok){
    const ham = await cevap.text().catch(() => "");
    const e = new Error("notion " + cevap.status);
    e.durum = cevap.status;
    e.ayrinti = ham.slice(0, 400);
    throw e;
  }
  return cevap.json();
}

/** Bir bloğun bütün çocuklarını sayfalayarak çeker. */
async function cocuklariGetir(blokId){
  const liste = [];
  let imlec = null;
  do{
    const veri = await notionIstek(
      "/blocks/" + blokId + "/children?page_size=100" + (imlec ? "&start_cursor=" + imlec : "")
    );
    liste.push.apply(liste, veri.results || []);
    imlec = veri.has_more ? veri.next_cursor : null;
  }while(imlec);
  return liste;
}

function duzMetin(blok){
  const tur = blok.type;
  const rt = blok[tur] && blok[tur].rich_text;
  if(!Array.isArray(rt)) return "";
  return rt.map(p => p.plain_text || "").join("");
}

/** Bir tablo hücresinin (rich_text dizisi) metnini döner; parçanın linki
    varsa "metin (url)" biçiminde katıştırır — Kaynak sütununda birden çok
    link olabiliyor, her parça kendi linkini taşıyor. */
function hucreMetni(hucre){
  return (hucre || []).map(seg => {
    const t = seg.plain_text || "";
    const url = seg.text && seg.text.link && seg.text.link.url;
    return url ? t + " (" + url + ")" : t;
  }).join("");
}

function isBaslik(blok){
  return blok.type === "heading_1" || blok.type === "heading_2" || blok.type === "heading_3";
}

/** Hedef haftanın "## Hafta N — …" başlığıyla bir sonraki hafta başlığı ya da
    ayraç (`---`) arasındaki blokları döner. Sayfanın son haftasında sınır
    yok, sayfa sonuna kadar toplar. */
function haftaBlogu(bloklar, hafta){
  let icinde = false;
  const dilim = [];
  for(const b of bloklar){
    if(isBaslik(b)){
      const m = duzMetin(b).match(/^Hafta\s+(\d+)/i);
      if(m){ icinde = Number(m[1]) === hafta; continue; }
      icinde = false;
      continue;
    }
    if(b.type === "divider"){ if(icinde) break; continue; }
    if(icinde) dilim.push(b);
  }
  return dilim;
}

/** §18'in yazma yolu: hedef haftanın to_do (checkbox) bloklarını döner. */
function haftaninToDolari(bloklar, hafta){
  return haftaBlogu(bloklar, hafta).filter(b => b.type === "to_do");
}

/** §17/§19'un okuma yolu: bir haftanın tablosu (Gün/Konu/Kaynak/Uygulama),
    algoritma satırı, giriş cümlesi ve haftalık kontrol maddelerini Notion'dan
    canlı okur. Sayfa küçük olduğu için her çağrıda haftanın bulunduğu Faz
    sayfasının tamamı çekilir (tek istek + tablo satırları için bir istek
    daha); önbelleklenmez — istemci "canlı" davranış istiyor (§17/§19 README). */
async function haftaIcerigi(hafta){
  const faz = fazBul(hafta);
  if(!faz) return null;

  const bloklar = await cocuklariGetir(faz.sayfa);
  const dilim = haftaBlogu(bloklar, hafta);

  const baslikBlok = bloklar.find(b =>
    isBaslik(b) && new RegExp("^Hafta\\s+" + hafta + "\\b").test(duzMetin(b)));
  const giris = dilim.find(b => b.type === "paragraph") || null;
  const tabloBlok = dilim.find(b => b.type === "table") || null;
  const algoritmaBlok = dilim.find(b => b.type === "paragraph" && /^Algoritma/i.test(duzMetin(b))) || null;
  const kontrolBloklari = dilim.filter(b => b.type === "to_do");

  const satirlar = tabloBlok ? await cocuklariGetir(tabloBlok.id) : [];
  const gunler = satirlar.slice(1)      // ilk satır başlık (Gün/Konu/Kaynak/Uygulama)
    .map(r => {
      const h = (r.table_row && r.table_row.cells) || [];
      return {
        gun: hucreMetni(h[0]).trim(),
        konu: hucreMetni(h[1]),
        kaynak: hucreMetni(h[2]),
        uygulama: hucreMetni(h[3])
      };
    });

  return {
    hafta: hafta,
    faz: faz.ad,
    baslik: baslikBlok ? duzMetin(baslikBlok) : "",
    giris: giris ? duzMetin(giris) : "",
    gunler: gunler,
    algoritma: algoritmaBlok ? duzMetin(algoritmaBlok) : "",
    kontrol: kontrolBloklari.map(b => ({ metin: duzMetin(b), tamam: !!(b.to_do && b.to_do.checked) }))
  };
}

/** Tek bir günün (Notion tablosundaki 1-6) satırını döner — api/plan'in
    (§17) günlük prompt zenginleştirmesinde kullanılır. */
async function gununIcerigi(hafta, gun){
  const h = await haftaIcerigi(hafta);
  if(!h) return null;
  const satir = h.gunler.find(g => g.gun === String(gun));
  if(!satir) return null;
  return Object.assign({ hafta: hafta, faz: h.faz, algoritma: h.algoritma }, satir);
}

module.exports = {
  FAZ_SAYFALARI, fazBul, anahtar, basliklar, notionIstek, cocuklariGetir,
  duzMetin, hucreMetni, isBaslik, haftaBlogu, haftaninToDolari,
  haftaIcerigi, gununIcerigi
};
