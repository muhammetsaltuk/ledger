/* §8.2 — ntfy'ye bildirim gönderir.
   Sunucu durumsuzdur: kullanıcının verisi telefonda durur, burada veritabanı
   yok. O yüzden cron isteği topic'i, konumu ve saat dilimini kendisi taşır;
   fonksiyon o an gönderilmesi gereken bir şey var mı diye aladhan'a bakıp
   karar verir.

   cron-job.org (ücretsiz, kredi kartı istemez) beş dakikada bir çağırır:
   /api/push?topic=...&lat=40.1826&lng=29.0665&tz=Europe/Istanbul&pencere=5 */

const NTFY   = "https://ntfy.sh/";
const ALADHAN = "https://api.aladhan.com/v1/timings/";
const ALANLAR = ["Fajr","Sunrise","Dhuhr","Asr","Maghrib","Isha"];

const VAKITLER = [
  { a:"sabah",  ad:"Sabah namazı",  bas:"Fajr",    bit:"Sunrise", oncelik:5 },
  { a:"ogle",   ad:"Öğle namazı",   bas:"Dhuhr",   bit:"Asr",     oncelik:3 },
  { a:"ikindi", ad:"İkindi namazı", bas:"Asr",     bit:"Maghrib", oncelik:3 },
  { a:"aksam",  ad:"Akşam namazı",  bas:"Maghrib", bit:"Isha",    oncelik:4 },
  { a:"yatsi",  ad:"Yatsı namazı",  bas:"Isha",    bit:null,      oncelik:3 }
];

const iki = n => String(n).padStart(2, "0");
const dk  = s => { const p = String(s).split(":"); return (+p[0]) * 60 + (+p[1]); };

/** Verilen saat diliminde "YYYY-MM-DD" ve dakika cinsinden şimdi. */
function yerelZaman(tz){
  const simdi = new Date();
  let tarih, saat;
  try{
    tarih = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(simdi);
    saat  = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(simdi);
  }catch(e){
    tarih = simdi.toISOString().slice(0, 10);
    saat  = iki(simdi.getUTCHours()) + ":" + iki(simdi.getUTCMinutes());
  }
  return { tarih, dakika: dk(saat), saat };
}

async function vakitGetir(tarih, lat, lng){
  const p = tarih.split("-");
  const url = ALADHAN + p[2] + "-" + p[1] + "-" + p[0] +
    "?latitude=" + lat + "&longitude=" + lng + "&method=13";
  const c = await fetch(url);
  if(!c.ok) throw new Error("aladhan " + c.status);
  const v = await c.json();
  const ham = v && v.data && v.data.timings;
  if(!ham) throw new Error("vakit verisi boş");
  const temiz = {};
  for(const a of ALANLAR) temiz[a] = String(ham[a] || "").split(" ")[0];
  return temiz;
}

/* JSON yayın biçimi: başlık başlığında yüzde kodlamaya gerek kalmıyor,
   "Sabah namazı" gibi Türkçe metinler olduğu gibi geçiyor. */
async function ntfyGonder(topic, baslik, govde, oncelik){
  const c = await fetch(NTFY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: topic,
      title: baslik,
      message: govde,
      priority: oncelik,
      tags: ["bell"]
    })
  });
  if(!c.ok) throw new Error("ntfy " + c.status);
  return true;
}

function sureMetni(dakika){
  if(dakika < 0) dakika = 0;
  const sa = Math.floor(dakika / 60), d = dakika % 60;
  return sa > 0 ? sa + " saat " + d + " dakika" : d + " dakika";
}

module.exports = async (req, res) => {
  const q = (req.query && Object.keys(req.query).length)
    ? req.query
    : Object.fromEntries(new URL(req.url, "http://x").searchParams);

  const topic = String(q.topic || "").trim();
  if(!topic){
    res.status(400).json({ hata: "topic yok" });
    return;
  }

  // Ayarlar bölümündeki "deneme bildirimi gönder" düğmesi.
  if(q.deneme){
    try{
      await ntfyGonder(topic, "Ledger", "Deneme bildirimi. Bunu gördüysen kurulum tamam.", 4);
      res.status(200).json({ gonderilen: ["deneme"] });
    }catch(e){
      console.error("ntfy deneme hatası:", e.message);
      res.status(502).json({ hata: "ntfy", mesaj: "ntfy'ye ulaşılamadı." });
    }
    return;
  }

  const lat     = Number(q.lat) || 40.1826;         // Bursa
  const lng     = Number(q.lng) || 29.0665;
  const tz      = String(q.tz || "Europe/Istanbul");
  const pencere = Math.min(30, Math.max(1, Number(q.pencere) || 5));

  try{
    const z = yerelZaman(tz);
    const bugunku = await vakitGetir(z.tarih, lat, lng);

    const gonderilen = [];
    for(const v of VAKITLER){
      const bas = dk(bugunku[v.bas]);
      const fark = z.dakika - bas;
      // Cron penceresi içinde bir kez: [bas, bas+pencere)
      if(fark < 0 || fark >= pencere) continue;

      let bit;
      if(v.bit){
        bit = dk(bugunku[v.bit]);
      }else{
        const p = z.tarih.split("-").map(Number);
        const y = new Date(Date.UTC(p[0], p[1]-1, p[2] + 1));
        const ertesi = await vakitGetir(
          y.getUTCFullYear() + "-" + iki(y.getUTCMonth()+1) + "-" + iki(y.getUTCDate()), lat, lng);
        bit = dk(ertesi.Fajr) + 24 * 60;
      }

      await ntfyGonder(topic, v.ad,
        "Vakit girdi, çıkmasına " + sureMetni(bit - z.dakika), v.oncelik);
      gonderilen.push(v.a);
    }

    res.status(200).json({ saat: z.saat, tarih: z.tarih, gonderilen });
  }catch(e){
    console.error("push hatası:", e && e.message);
    res.status(502).json({ hata: "push", mesaj: "Gönderilemedi." });
  }
};
