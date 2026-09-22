/* §17 — Java roadmap'inin haftalık kontrol checkbox'larını Notion'da işaretler.
   Yapay zeka fonksiyonlarından (api/_ortak.js) bağımsız: bu uçta model yok,
   yalnız Notion REST API'ye düz istek var. Otomatik tetiklenmez — istemci bunu
   yalnız kullanıcı "bu haftayı gerçekten biliyorum" dediğinde çağırır (§16/§17
   README). Roadmap'in checkbox'ları "bakmadan" kendi kendine test sorularıdır;
   ledger'daki bir günü "yapıldı" işaretlemek "biliyorum" anlamına gelmez, o
   yüzden bağlantı tek yönlü ve elle onaylıdır. */

const SURUM = "2022-06-28";
const TABAN = "https://api.notion.com/v1";

/* §17 — hangi hafta hangi Faz sayfasında. Sayfa ID'leri Notion URL'inin
   app.notion.com/p/<id> kısmından, tire olmadan. Roadmap'in kendisi
   (index.html'deki JAVA_FAZLAR) yalnız isim + hafta aralığı tutar; sayfa
   ID'leri istemciye gitmesin diye yalnız burada. */
const FAZ_SAYFALARI = [
  { ilk:1,  son:4,  sayfa:"3e2921af4e6781ce903adf5ccd27e5b1" },   // Faz 1 — Java temeli
  { ilk:5,  son:7,  sayfa:"3e2921af4e678190969bf7c335da3e0c" },   // Faz 2 — Web ve veritabanı
  { ilk:8,  son:12, sayfa:"3e2921af4e6781119ebbe5b11674eecd" },   // Faz 3 — Spring Boot
  { ilk:13, son:16, sayfa:"3e2921af4e678190b6fdf613a38d18ab" },   // Faz 4 — DevOps temelleri
  { ilk:17, son:20, sayfa:"3e2921af4e6781a6af65c04020bbe666" }    // Faz 5 — İleri konular
];

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

/** Bir bloğun bütün çocuklarını sayfalayarak çeker (yalnız bir seviye —
    tablo satırları gibi iç içe çocuklar burada işimize yaramıyor). */
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

/** Hedef haftanın "## Hafta N — …" başlığıyla bir sonraki hafta başlığı ya da
    ayraç (`---`) arasındaki to_do (checkbox) bloklarını toplar. Sayfanın son
    haftasında sınır yok, sayfa sonuna kadar toplar. */
function haftaninToDolari(bloklar, hafta){
  let icinde = false;
  const bulunanlar = [];
  for(const b of bloklar){
    if(b.type === "heading_1" || b.type === "heading_2" || b.type === "heading_3"){
      const m = duzMetin(b).match(/^Hafta\s+(\d+)/i);
      if(m){ icinde = Number(m[1]) === hafta; continue; }
      icinde = false;                       // "Hafta"la başlamayan başka bir başlıksa kapat
      continue;
    }
    if(b.type === "divider"){ if(icinde) break; continue; }
    if(icinde && b.type === "to_do") bulunanlar.push(b);
  }
  return bulunanlar;
}

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

  const faz = FAZ_SAYFALARI.find(f => hafta >= f.ilk && hafta <= f.son);
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
    const durum = e && e.durum;
    res.status(502).json({
      hata: "notion",
      mesaj: durum === 401 || durum === 403
        ? "Notion entegrasyonunun sayfaya erişimi yok ya da anahtar geçersiz."
        : "Notion güncellenemedi."
    });
  }
};
