/* §14 kabul kriterleri — fiilen çalıştırılan denetim.
   node test/hepsi.js */

const { kur } = require("./kosum");

let gecen = 0, kalan = 0;
const basliklar = [];

function bolum(ad){ basliklar.push(ad); console.log("\n— " + ad); }
async function dene(ad, f){
  try{
    await f();
    gecen++; console.log("  ✓ " + ad);
  }catch(e){
    kalan++; console.log("  ✗ " + ad + "\n      " + (e && e.message));
  }
}
function esit(a, b, not){
  if(a !== b) throw new Error((not ? not + ": " : "") + "beklenen " + JSON.stringify(b) + ", gelen " + JSON.stringify(a));
}
function dogru(k, not){ if(!k) throw new Error(not || "doğru bekleniyordu"); }
function icerir(metin, parca){
  if(String(metin).indexOf(parca) === -1)
    throw new Error("çıktıda bulunamadı: " + JSON.stringify(parca));
}
function icermez(metin, parca){
  if(String(metin).indexOf(parca) !== -1)
    throw new Error("çıktıda olmamalıydı: " + JSON.stringify(parca));
}

(async function(){

bolum("§4 — vakit aralıkları ve gece kayması");

await dene("gece kayması: 00:30 hâlâ bir önceki günü gösterir", async () => {
  const u = kur({ simdi:"2026-09-07T00:30:00" });
  esit(u.ic.uygulamaGunu(), "2026-09-06");
});

await dene("gece kayması: 03:59 dün, 04:00 bugün", async () => {
  const u = kur({ simdi:"2026-09-07T03:59:00" });
  esit(u.ic.uygulamaGunu(), "2026-09-06", "03:59");
  u.zamanAtla("2026-09-07T04:00:00");
  esit(u.ic.uygulamaGunu(), "2026-09-07", "04:00");
});

await dene("yatsı aralığı ertesi günün imsağında biter", async () => {
  const u = kur({ simdi:"2026-09-06T21:00:00" });
  await u.bekle(); await u.bekle(); await u.bekle();
  const l = u.ic.UYG.namaz.liste;
  const yatsi = l[4];
  esit(yatsi.a, "yatsi");
  esit(yatsi.bas.getHours() + ":" + yatsi.bas.getMinutes(), "20:56");
  esit(yatsi.bit.getDate(), 7, "bitiş ertesi gün olmalı");
  esit(yatsi.bit.getHours() + ":" + yatsi.bit.getMinutes(), "5:2");
});

await dene("her aralık bir öncekinin bitişinden başlar (öğle-ikindi-akşam-yatsı)", async () => {
  const u = kur({ simdi:"2026-09-06T14:00:00" });
  await u.bekle(); await u.bekle(); await u.bekle();
  const l = u.ic.UYG.namaz.liste;
  for(let i = 1; i < 4; i++){
    if(l[i].bit.getTime() !== l[i+1].bas.getTime())
      throw new Error(l[i].ad + " bitişi " + l[i+1].ad + " başlangıcına eşit değil");
  }
});

bolum("§14 — 07:30'da aktif vakit yoktur");

await dene("07:30: aktif vakit yok, sıradaki Öğle 13:07 yazar", async () => {
  const u = kur({ simdi:"2026-09-06T07:30:00" });
  await u.bekle(); await u.bekle(); await u.bekle();
  const h = u.html("b-namaz");
  icerir(h, "sıradaki: Öğle 13:07");
  esit(u.ic.aktifAralik(u.ic.UYG.namaz.liste, new Date("2026-09-06T07:30:00")), null);
});

await dene("06:28 hâlâ Sabah, 06:29 (güneş) artık değil", async () => {
  const u = kur({ simdi:"2026-09-06T06:00:00" });
  await u.bekle(); await u.bekle(); await u.bekle();
  const l = u.ic.UYG.namaz.liste;
  esit(u.ic.aktifAralik(l, new Date("2026-09-06T06:28:00")).a, "sabah");
  esit(u.ic.aktifAralik(l, new Date("2026-09-06T06:29:00")), null);
  esit(u.ic.aktifAralik(l, new Date("2026-09-06T13:07:00")).a, "ogle");
});

bolum("§13 — vurgu rengi vakte göre değişir");

await dene("ikindi vakti girdiğinde vurgu turuncuya döner", async () => {
  const u = kur({ simdi:"2026-09-06T17:00:00" });
  let sonRenk = null;
  u.ctx.document.documentElement.style.setProperty = (ad, deger) => {
    if(ad === "--vakit") sonRenk = deger;
  };
  await u.bekle(); await u.bekle(); await u.bekle();
  u.ic.namazCiz();
  esit(sonRenk, "#E09A4F", "ikindi turuncusu");
});

await dene("kuşlukta renk son aktif vaktin rengiyle kalır", async () => {
  const u = kur({ simdi:"2026-09-06T06:00:00" });
  let sonRenk = null;
  u.ctx.document.documentElement.style.setProperty = (a, d) => { if(a === "--vakit") sonRenk = d; };
  await u.bekle(); await u.bekle(); await u.bekle();
  u.ic.namazCiz();
  esit(sonRenk, "#6E7FB8", "sabah moru");
  u.zamanAtla("2026-09-06T07:30:00");
  u.ic.namazCiz();
  esit(sonRenk, "#6E7FB8", "kuşlukta değişmemeli");
});

bolum("§4 — işaretleme ve geri alma");

await dene("üç durum: yok → vaktinde → geri al", async () => {
  const u = kur({ simdi:"2026-09-06T14:00:00" });
  await u.bekle(); await u.bekle(); await u.bekle();
  icerir(u.html("b-namaz"), 'data-kildim="ogle"');
  u.ic.namazIsaretle("2026-09-06", "ogle", "vaktinde");
  esit(u.veri().gunler["2026-09-06"].namaz.ogle, "vaktinde");
  icerir(u.html("b-namaz"), 'data-geri="ogle"');
  u.ic.namazIsaretle("2026-09-06", "ogle", null);
  esit(u.veri().gunler["2026-09-06"].namaz.ogle, undefined);
});

await dene("vakti çıkmış namaz için düğme 'kaza kıldım' olur", async () => {
  const u = kur({ simdi:"2026-09-06T14:00:00" });
  await u.bekle(); await u.bekle(); await u.bekle();
  const h = u.html("b-namaz");
  icerir(h, 'data-kaza="sabah"');       // sabah vakti çıktı
  icerir(h, 'data-kildim="ogle"');      // öğle sürüyor
  icermez(h, 'data-kildim="ikindi"');   // ikindi henüz girmedi
});

await dene("00:30'da işaretlenen yatsı bir önceki günün kaydına yazılır", async () => {
  const u = kur({ simdi:"2026-09-07T00:30:00" });
  await u.bekle(); await u.bekle(); await u.bekle();
  esit(u.ic.UYG.namaz.tarih, "2026-09-06");
  esit(u.ic.aktifAralik(u.ic.UYG.namaz.liste, new Date("2026-09-07T00:30:00")).a, "yatsi");
  u.ic.namazIsaretle(u.ic.UYG.namaz.tarih, "yatsi", "vaktinde");
  const g = u.veri().gunler;
  esit(g["2026-09-06"].namaz.yatsi, "vaktinde");
  esit(g["2026-09-07"], undefined, "ertesi güne yazılmamalı");
});

bolum("§4 — konum");

await dene("izin verilmezse Bursa kullanılır", async () => {
  const u = kur({ simdi:"2026-09-06T14:00:00", konum:"izinsiz" });
  await u.bekle(); await u.bekle(); await u.bekle();
  esit(u.ic.konumuKullan().lat, 40.1826);
  dogru(u.durum.istekler.some(i => i.includes("latitude=40.1826")), "Bursa ile sorgulanmalı");
  icerir(u.html("b-namaz"), "Bursa'ya göre");
});

await dene("izin verilirse cihaz konumu kullanılır ve önbelleğe alınır", async () => {
  const u = kur({ simdi:"2026-09-06T14:00:00", konum:"izinli" });
  for(let i = 0; i < 12; i++) await u.bekle();
  esit(u.veri().konum.lat, 41.0082);
  esit(u.veri().konum.kaynak, "cihaz");
  dogru(u.durum.istekler.some(i => i.includes("latitude=41.0082")), "cihaz konumuyla sorgulanmalı");
});

await dene("konum önbellekteyse ikinci açılışta tekrar sorulmaz", async () => {
  const ilk = kur({ simdi:"2026-09-06T14:00:00", konum:"izinli" });
  for(let i = 0; i < 12; i++) await ilk.bekle();
  const depo = Object.fromEntries(ilk.durum.depo);

  let soruldu = false;
  const u = kur({ simdi:"2026-09-06T15:00:00", depo });
  u.ctx.navigator.geolocation.getCurrentPosition = () => { soruldu = true; };
  // yeniden kur: baslat() zaten çağrıldı, konumSor(false) önbelleği kullanmalı
  await u.ic.konumSor(false);
  dogru(!soruldu, "geolocation'a tekrar sorulmamalı");
});

bolum("§14 — uçak modu");

await dene("ağ yokken önbellekteki vakitlerle açılır, çökmez", async () => {
  const ilk = kur({ simdi:"2026-09-06T14:00:00" });
  for(let i = 0; i < 8; i++) await ilk.bekle();
  const depo = Object.fromEntries(ilk.durum.depo);

  const u = kur({ simdi:"2026-09-06T17:00:00", depo, ag:false });
  for(let i = 0; i < 8; i++) await u.bekle();
  const h = u.html("b-namaz");
  icerir(h, "İkindi");
  icermez(h, "alınamadı");
  esit(u.durum.istekler.length, 0, "önbellek varken ağa çıkmamalı");
});

await dene("ağ da önbellek de yokken hata görünür, sessizce yutulmaz", async () => {
  const u = kur({ simdi:"2026-09-06T14:00:00", ag:false });
  for(let i = 0; i < 8; i++) await u.bekle();
  icerir(u.html("b-namaz"), "Vakitler alınamadı");
});

bolum("§4 — API biçimi");

await dene('"05:01 (+03)" biçimi ilk boşluktan bölünür', async () => {
  const u = kur({ simdi:"2026-09-06T14:00:00" });
  for(let i = 0; i < 8; i++) await u.bekle();
  const v = Object.values(u.veri().vakitler)[0];
  esit(v.Fajr, "05:01");
  esit(v.Isha, "20:56");
});

await dene("method=13 (Diyanet) ile sorgulanır", async () => {
  const u = kur({ simdi:"2026-09-06T14:00:00" });
  for(let i = 0; i < 8; i++) await u.bekle();
  dogru(u.durum.istekler.every(i => i.includes("method=13")), "her istekte method=13 olmalı");
});

await dene("süre metni: 1 sa 28 dk", async () => {
  const u = kur({});
  esit(u.ic.sureMetni((88 * 60 + 30) * 1000), "1 sa 28 dk");
  esit(u.ic.sureMetni(45 * 60 * 1000), "45 dk");
  esit(u.ic.sureMetni(-5000), "0 sn");
});

/* ---------------------------------------------------------------
   §5 — Kaza borcu
   --------------------------------------------------------------- */

const bekleCok = async (u, n) => { for(let i = 0; i < (n || 40); i++) await u.bekle(); };

/** Bir oturum aç, işi bitir, localStorage içeriğini döndür (sonraki oturuma girdi). */
async function otur(simdi, depo, se){
  const u = kur(Object.assign({ simdi, depo }, se || {}));
  await bekleCok(u);
  return { u, depo: Object.fromEntries(u.durum.depo), veri: u.veri() };
}

/** İlk kurulum: 6 Eylül 21:00'de açılır, borç sıfırdan başlar. */
async function ilkKurulum(){
  const o = await otur("2026-09-06T21:00:00");
  esit(o.veri.sonKontrol, "2026-09-06", "ilk açılışta sonKontrol bugüne kurulur");
  esit(Object.values(o.veri.borc).reduce((a,b)=>a+b,0), 0, "ilk açılışta borç sıfır");
  return o.depo;
}

bolum("§5 — kaza borcu birikimi");

await dene("ilk açılışta kurulumdan önceki vakitler borç sayılmaz", async () => {
  await ilkKurulum();
});

await dene("yatsı işaretlenmeden ertesi imsak geçince borç 1 artar", async () => {
  const depo = await ilkKurulum();
  const o = await otur("2026-09-07T06:00:00", depo);
  esit(o.veri.borc.yatsi, 1);
  esit(o.veri.borc.sabah, 0, "07 Eylül sabahı henüz kapanmadı");
});

await dene("aynı gün beş kez açılınca borç yalnızca bir kez artar", async () => {
  let depo = await ilkKurulum();
  for(let i = 0; i < 5; i++){
    const o = await otur("2026-09-07T06:0" + i + ":00", depo);
    depo = o.depo;
    esit(o.veri.borc.yatsi, 1, (i+1) + ". açılış");
  }
});

await dene("üç gün açılmayınca geçen bütün vakitler doğru hesaplanır", async () => {
  const depo = await ilkKurulum();
  const o = await otur("2026-09-10T14:00:00", depo);
  const b = o.veri.borc;
  // 06: yatsı · 07/08/09: beş vakit · 10: yalnız sabah (öğle 13:05'te başladı, sürüyor)
  esit(b.sabah, 4, "sabah");
  esit(b.ogle, 3, "öğle");
  esit(b.ikindi, 3, "ikindi");
  esit(b.aksam, 3, "akşam");
  esit(b.yatsi, 4, "yatsı");
  esit(Object.values(b).reduce((a,c)=>a+c,0), 17, "toplam");
});

await dene("60 günden eskisine bakılmaz", async () => {
  const depo = await ilkKurulum();
  const v = JSON.parse(depo["ledger/v1"]);
  v.sonKontrol = "2026-05-01";                 // dört ay önce
  depo["ledger/v1"] = JSON.stringify(v);
  const o = await otur("2026-09-06T21:00:00", depo);
  const toplam = Object.values(o.veri.borc).reduce((a,b)=>a+b,0);
  dogru(toplam <= 60 * 5, "tarama 60 günle sınırlı olmalı");
  dogru(o.veri.islenmisVakitler.every(a => a.split("|")[0] >= "2026-07-07"),
        "60 günden eski kayıt tutulmamalı");
});

await dene("geriye dönük tarama gün gün değil ay ay sorar", async () => {
  const depo = await ilkKurulum();
  const o = await otur("2026-09-10T14:00:00", depo, {});
  const takvim = o.u.durum.istekler.filter(i => i.includes("/calendar/")).length;
  const gunluk = o.u.durum.istekler.filter(i => i.includes("/timings/")).length;
  dogru(takvim >= 1, "takvim uç noktası kullanılmalı");
  dogru(gunluk <= 3, "gün gün sorgu 3'ü geçmemeli, geldi: " + gunluk);
});

await dene("takvim uç noktası bozulursa gün gün sorguya düşer", async () => {
  const depo = await ilkKurulum();
  const o = await otur("2026-09-09T14:00:00", depo, { takvim:false });
  dogru(o.veri.borc.yatsi >= 3, "yedek yolla da borç hesaplanmalı");
});

bolum("§5 — ödeme ve geri alma");

await dene("kaza kıldım sayacı bir azaltır, sıfırın altına inmez", async () => {
  const depo = await ilkKurulum();
  const o = await otur("2026-09-10T14:00:00", depo);
  esit(o.veri.borc.ikindi, 3);
  o.u.ic.borcDegistir("ikindi", -1); o.u.ic.kaydet();
  esit(o.u.veri().borc.ikindi, 2);
  for(let i = 0; i < 9; i++) o.u.ic.borcDegistir("ikindi", -1);
  o.u.ic.kaydet();
  esit(o.u.veri().borc.ikindi, 0, "sıfırın altına inmemeli");
});

await dene("geçmiş vakti kaza olarak işaretlemek aynı sayacı düşürür", async () => {
  const depo = await ilkKurulum();
  const o = await otur("2026-09-07T14:00:00", depo);
  const once = o.veri.borc.sabah;
  dogru(once >= 1, "7 Eylül sabahı borca girmiş olmalı");
  o.u.ic.namazIsaretle("2026-09-07", "sabah", "kaza");
  esit(o.u.veri().borc.sabah, once - 1);
  o.u.ic.namazIsaretle("2026-09-07", "sabah", null);        // geri al
  esit(o.u.veri().borc.sabah, once, "geri alınca sayaç geri gelmeli");
});

await dene("vakti henüz kapanmamış namazı işaretlemek borcu etkilemez", async () => {
  const depo = await ilkKurulum();
  const o = await otur("2026-09-07T14:00:00", depo);
  const once = JSON.stringify(o.u.veri().borc);
  o.u.ic.namazIsaretle("2026-09-07", "ogle", "vaktinde");   // öğle sürüyor
  esit(JSON.stringify(o.u.veri().borc), once);
});

bolum("§5 — ekranda");

await dene("borç sıfırsa kaza bölümü ekranda hiç görünmez", async () => {
  const o = await otur("2026-09-06T21:00:00");
  const k = o.u.ctx.document.getElementById("b-kaza");
  esit(k.hidden, true);
  esit(k.innerHTML, "");
});

await dene("borcu olmayan namaz türü listede görünmez, büyük toplam yazılmaz", async () => {
  const depo = await ilkKurulum();
  const o = await otur("2026-09-07T06:00:00", depo);        // yalnız yatsı 1
  const h = o.u.ctx.document.getElementById("b-kaza").innerHTML;
  esit(o.u.ctx.document.getElementById("b-kaza").hidden, false);
  icerir(h, "Yatsı");
  icermez(h, "Sabah");
  icermez(h, "İkindi");
  icermez(h, "toplam");
  icermez(h, "#A8615C");                                    // kırmızı vurgu yok
  icerir(h, 'data-ode="yatsi"');                            // tek dokunuşluk ödeme
});

bolum("§5 — dayanıklılık");

await dene("ağ yokken sonKontrol ilerlemez, bağlantı gelince borç hesaplanır", async () => {
  const depo = await ilkKurulum();
  const kesik = await otur("2026-09-09T14:00:00", depo, { ag:false });
  esit(kesik.veri.sonKontrol, "2026-09-06", "çözülemeyen gün varken ilerlememeli");
  // Önbellekte verisi olan gün (06 Eylül) çevrimdışıyken de hesaplanır; gerisi bekler.
  esit(Object.values(kesik.veri.borc).reduce((a,b)=>a+b,0), 1, "yalnız 06 Eylül yatsısı");

  const geri = await otur("2026-09-09T15:00:00", kesik.depo);
  esit(geri.veri.sonKontrol, "2026-09-09");
  esit(Object.values(geri.veri.borc).reduce((a,b)=>a+b,0), 12,
       "06 yatsı + 07/08 beşer + 09 sabah");
  esit(geri.veri.borc.yatsi, 3, "06, 07, 08 yatsıları");
});

console.log("\n" + (kalan ? "✗" : "✓") + "  " + gecen + " geçti, " + kalan + " kaldı\n");
process.exit(kalan ? 1 : 0);

})();
