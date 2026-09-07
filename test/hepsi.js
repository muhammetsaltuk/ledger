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
  esit(u.aladhan().length, 0, "önbellek varken ağa çıkmamalı");
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
  dogru(u.aladhan().every(i => i.includes("method=13")), "her istekte method=13 olmalı");
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

/** Oturumu aç ve açılıştaki bütün eşzamansız işler bitene kadar bekle. */
const ac = async se => { const u = kur(se); await bekleCok(u, 20); return u; };

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
  const takvim = o.u.aladhan().filter(i => i.includes("/calendar/")).length;
  const gunluk = o.u.aladhan().filter(i => i.includes("/timings/")).length;
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

/* ---------------------------------------------------------------
   §11 — Su
   --------------------------------------------------------------- */

bolum("§11 — su");

await dene("hedef 10 bardak, 250 ml", async () => {
  const u = kur({});
  esit(u.ic.SU_HEDEFI, 10);
  u.ic.suDegistir(+4);
  esit(u.ctx.document.getElementById("su-sayi").textContent, "1,00 L");
});

await dene("ekle ve geri al; sıfırın altına inmez, hedefi aşmaz", async () => {
  const u = kur({ simdi:"2026-09-06T14:00:00" });
  u.ic.suDegistir(+1); u.ic.suDegistir(+1);
  esit(u.veri().gunler["2026-09-06"].su, 2);
  u.ic.suDegistir(-1);
  esit(u.veri().gunler["2026-09-06"].su, 1);
  for(let i = 0; i < 5; i++) u.ic.suDegistir(-1);
  esit(u.veri().gunler["2026-09-06"].su, 0, "sıfırın altına inmemeli");
  for(let i = 0; i < 15; i++) u.ic.suDegistir(+1);
  esit(u.veri().gunler["2026-09-06"].su, 10, "hedefi aşmamalı");
});

await dene("su sayacı gece kaymasına uyar: 00:30 dünün sayacı", async () => {
  const u = kur({ simdi:"2026-09-07T00:30:00" });
  u.ic.suDegistir(+3);
  esit(u.veri().gunler["2026-09-06"].su, 3);
  esit(u.veri().gunler["2026-09-07"], undefined);
});

await dene("şerit on bölmeli, hedefte kutlama yok", async () => {
  const u = kur({ simdi:"2026-09-06T14:00:00" });
  for(let i = 0; i < 10; i++) u.ic.suDegistir(+1);
  const h = u.html("b-su");                       // şerit bir kez kurulur
  esit((h.match(/<i>/g) || []).length, 10);
  esit(u.ctx.document.getElementById("su-sayi").textContent, "2,50 L");
  icermez(h, "tebrik"); icermez(h, "harika"); icermez(h, "🎉");
  // Dolan bölmeler yerinde güncellendiği için tarayıcı tarafında doğrulanıyor.
});

/* ---------------------------------------------------------------
   §6 — Plan (yapay zeka olmadan)
   --------------------------------------------------------------- */

bolum("§6 — plan: elle madde, işaretleme, not");

await dene("madde eklenir, saate göre sıralanır", async () => {
  const u = await ac({ simdi:"2026-09-06T14:00:00" });
  u.ic.maddeEkle("09:30", "Kod bloğu");
  u.ic.maddeEkle("08:00", "Kalk, bir bardak su");
  const g = u.veri().gunler["2026-09-06"].maddeler;
  esit(g.length, 2);
  const h = u.html("b-plan");
  dogru(h.indexOf("Kalk") < h.indexOf("Kod bloğu"), "08:00 önce yazılmalı");
});

await dene("madde işaretlenir ve geri alınır", async () => {
  const u = await ac({ simdi:"2026-09-06T14:00:00" });
  u.ic.maddeEkle("08:00", "Kalk");
  const id = u.veri().gunler["2026-09-06"].maddeler[0].id;
  u.ic.maddeIsaretle(id);
  esit(u.veri().gunler["2026-09-06"].maddeler[0].yapildi, true);
  icerir(u.html("b-plan"), 'aria-pressed="true"');
  u.ic.maddeIsaretle(id);
  esit(u.veri().gunler["2026-09-06"].maddeler[0].yapildi, false);
});

await dene("maddeye not yazılır ve saklanır", async () => {
  const u = await ac({ simdi:"2026-09-06T14:00:00" });
  u.ic.maddeEkle("08:00", "Kalk, bir bardak su");
  const id = u.veri().gunler["2026-09-06"].maddeler[0].id;
  u.ic.maddeNot(id, "Kalktım ama suyu içmedim");
  esit(u.veri().gunler["2026-09-06"].maddeler[0].not, "Kalktım ama suyu içmedim");
  u.ic.planCiz();
  icerir(u.html("b-plan"), "Kalktım ama suyu içmedim");
});

await dene("madde silinir", async () => {
  const u = await ac({ simdi:"2026-09-06T14:00:00" });
  u.ic.maddeEkle("08:00", "Kalk");
  u.ic.maddeEkle("09:00", "Koşu");
  const id = u.veri().gunler["2026-09-06"].maddeler[0].id;
  u.ic.maddeSil(id);
  esit(u.veri().gunler["2026-09-06"].maddeler.length, 1);
  esit(u.veri().gunler["2026-09-06"].maddeler[0].baslik, "Koşu");
});

await dene("not ve işaret HTML'e kaçırılarak yazılır", async () => {
  const u = await ac({ simdi:"2026-09-06T14:00:00" });
  u.ic.maddeEkle("08:00", '<img src=x onerror="alert(1)">');
  icermez(u.html("b-plan"), "<img src=x");
  icerir(u.html("b-plan"), "&lt;img");
});

bolum("§6 — plan boş ekran göstermez");

await dene("plan yoksa son planlı gün kopyalanır, işaretler sıfırlanır", async () => {
  const u = await ac({ simdi:"2026-09-06T14:00:00" });
  u.ic.maddeEkle("08:00", "Kalk");
  u.ic.maddeEkle("22:00", "Kitap");
  const id = u.veri().gunler["2026-09-06"].maddeler[0].id;
  u.ic.maddeIsaretle(id);
  u.ic.maddeNot(id, "geç kalktım");
  const depo = Object.fromEntries(u.durum.depo);

  const y = kur({ simdi:"2026-09-08T10:00:00", depo });
  await bekleCok(y, 10);
  const g = y.veri().gunler["2026-09-08"];
  esit(g.maddeler.length, 2, "kopyalanmalı");
  esit(g.maddeler[0].yapildi, false, "işaret sıfırlanmalı");
  esit(g.maddeler[0].not, "", "not sıfırlanmalı");
  esit(g.planKaynak, "kopya");
  dogru(g.maddeler[0].id !== id, "yeni id verilmeli");
  icerir(y.html("b-plan"), "dünün planından");
});

await dene("hiç plan yoksa boş ama kullanılabilir ekran çıkar", async () => {
  const u = await ac({ simdi:"2026-09-06T14:00:00" });
  await bekleCok(u, 10);
  const h = u.html("b-plan");
  icerir(h, "Bugün için madde yok");
  icerir(h, 'id="p-ekle"');            // elle madde eklenebilir
});

await dene("bugünün planı varsa kopyalanmaz", async () => {
  const u = await ac({ simdi:"2026-09-06T14:00:00" });
  u.ic.maddeEkle("08:00", "Kalk");
  const depo = Object.fromEntries(u.durum.depo);
  const y = kur({ simdi:"2026-09-06T20:00:00", depo });
  await bekleCok(y, 10);
  esit(y.veri().gunler["2026-09-06"].maddeler.length, 1);
  esit(y.veri().gunler["2026-09-06"].planKaynak, undefined);
});

await dene("plan gece kaymasına uyar: 01:00'de eklenen madde dünün planına girer", async () => {
  const u = kur({ simdi:"2026-09-07T01:00:00" });
  u.ic.maddeEkle("23:30", "Kitap");
  esit(u.veri().gunler["2026-09-06"].maddeler.length, 1);
  esit(u.veri().gunler["2026-09-07"], undefined);
});

/* ---------------------------------------------------------------
   §6 + §12 — plan üretimi
   --------------------------------------------------------------- */

const SAHTE_PLAN = {
  tarih: "2026-09-06",
  maddeler: [
    { saat:"08:00", sure:10,  baslik:"Kalk, perdeyi aç, bir bardak su", tur:"uyku",
      gerekce:"Dün 08:40'ta kalkmışsın" },
    { saat:"08:20", sure:35,  baslik:"Ev sporu", tur:"spor", gerekce:"" },
    { saat:"09:05", sure:30,  baslik:"Kahvaltı", tur:"yemek", gerekce:"" }
  ],
  gununNotu: "Pazar, kurs yok."
};

bolum("§6 — plan üretimi");

await dene("plan yoksa açılışta model çağrılır ve plan yazılır", async () => {
  const u = await ac({ simdi:"2026-09-06T09:00:00", api:{ plan:SAHTE_PLAN } });
  const g = u.veri().gunler["2026-09-06"];
  esit(g.maddeler.length, 3);
  esit(g.planKaynak, "model");
  esit(g.gununNotu, "Pazar, kurs yok.");
  dogru(g.maddeler[0].id, "her maddeye id verilmeli");
  esit(g.maddeler[0].yapildi, false);
});

await dene("modele giden gövde: vakitler, borç, profil, son 14 gün, kurs", async () => {
  const ilk = await ac({ simdi:"2026-09-05T21:00:00" });
  ilk.ic.maddeEkle("08:00", "Kalk");
  ilk.ic.maddeNot(ilk.veri().gunler["2026-09-05"].maddeler[0].id, "geç kalktım");
  const v = JSON.parse(ilk.durum.depo.get("ledger/v1"));
  v.profil = "08:00 alarmına rağmen ortalama 08:35'te kalkıyor.";
  v.borc = { sabah:0, ogle:0, ikindi:2, aksam:0, yatsi:1 };
  delete v.ayar.yapayZeka;                     // anahtar bu sefer var sayılsın
  const depo = { "ledger/v1": JSON.stringify(v) };

  const u = await ac({ simdi:"2026-09-07T09:00:00", depo, api:{ plan:SAHTE_PLAN } });
  const cagri = u.durum.apiCagrilari.find(c => c.ad === "plan");
  dogru(cagri, "api/plan çağrılmalı");
  const b = cagri.govde;
  esit(b.tarih, "2026-09-07");
  esit(b.gunAdi, "Pazartesi");
  esit(b.kurs.bas, "18:00", "pazartesi kursu 18:00");
  dogru(b.vakitler && b.vakitler["Sabah"], "namaz vakitleri gitmeli");
  dogru(b.borc && b.borc.ikindi >= 2, "kaza borcu gitmeli");   // tarama üstüne eklemiş olabilir
  icerir(b.profil, "08:35");
  dogru(b.son14.some(g => g.tarih === "2026-09-05"), "son 14 gün gitmeli");
  const gun = b.son14.find(g => g.tarih === "2026-09-05");
  esit(gun.maddeler[0].not, "geç kalktım", "notlar plana girdi olmalı");
});

await dene("kurs saatleri: salı/perşembe 19:00, cuma-cumartesi-pazar yok", async () => {
  const u = await ac({ simdi:"2026-09-06T09:00:00" });
  esit(u.ic.kursSaati("2026-09-08").bas, "19:00", "salı");
  esit(u.ic.kursSaati("2026-09-10").bas, "19:00", "perşembe");
  esit(u.ic.kursSaati("2026-09-09").bas, "18:00", "çarşamba");
  esit(u.ic.kursSaati("2026-09-11"), null, "cuma");
  esit(u.ic.kursSaati("2026-09-12"), null, "cumartesi");
  esit(u.ic.kursSaati("2026-09-13"), null, "pazar");
});

await dene("plan üretimi günde en fazla üç kez", async () => {
  const u = await ac({ simdi:"2026-09-06T09:00:00", api:{ plan:SAHTE_PLAN } });
  esit(u.ic.planHakki("2026-09-06"), 2, "açılıştaki üretim bir hak yakar");
  await u.ic.planUret(true);
  await u.ic.planUret(true);
  esit(u.ic.planHakki("2026-09-06"), 0);
  const oncekiCagri = u.durum.apiCagrilari.length;
  await u.ic.planUret(true);
  esit(u.durum.apiCagrilari.length, oncekiCagri, "hak bitince model çağrılmamalı");
  icerir(u.html("b-plan"), "hakkı doldu");
});

await dene("geçici yoğunluk yapay zekayı kalıcı kapatmaz", async () => {
  const u = await ac({ simdi:"2026-09-06T09:00:00", api:{
    plan:{ durum:503, hata:"yogun", mesaj:"Model şu an yoğun. Biraz sonra tekrar dene." } } });
  esit(u.veri().ayar.yapayZeka, undefined, "anahtar var sayılmalı, kapatılmamalı");
  icerir(u.html("b-plan"), "yoğun");
  const once = u.durum.apiCagrilari.length;
  await u.ic.planUret(true);
  dogru(u.durum.apiCagrilari.length > once, "sonraki denemede yine çağırmalı");
});

bolum("§14 — anahtar yokken uygulama çalışır");

await dene("anahtar yoksa plan üretilmez ama uygulama açılır", async () => {
  const u = await ac({ simdi:"2026-09-06T09:00:00" });     // api yok = 503
  esit(u.veri().ayar.yapayZeka, false);
  icerir(u.html("b-namaz"), "05:01");                      // namaz çalışıyor
  icerir(u.html("b-plan"), "madde ekle");                  // elle madde eklenebilir
  u.ic.maddeEkle("08:00", "Kalk");
  esit(u.veri().gunler["2026-09-06"].maddeler.length, 1);
  u.ic.suDegistir(+1);
  esit(u.veri().gunler["2026-09-06"].su, 1);
});

await dene("anahtar yoksa ertesi açılışta tekrar denenmez", async () => {
  const ilk = await ac({ simdi:"2026-09-06T09:00:00" });
  ilk.ic.maddeEkle("08:00", "Kalk");            // elle kurulmuş bir plan
  const depo = Object.fromEntries(ilk.durum.depo);
  const u = await ac({ simdi:"2026-09-07T09:00:00", depo });
  esit(u.durum.apiCagrilari.length, 0, "boşuna çağırmamalı");
  icerir(u.html("b-plan"), "Dünün planı kopyalandı");
});

await dene("model hata verirse dünün planı kopyalanır", async () => {
  const ilk = await ac({ simdi:"2026-09-05T21:00:00", api:{ plan:SAHTE_PLAN } });
  const depo = Object.fromEntries(ilk.durum.depo);
  const u = await ac({ simdi:"2026-09-06T09:00:00", depo,
                       api:{ plan:{ durum:502, mesaj:"Model cevap vermedi." } } });
  const g = u.veri().gunler["2026-09-06"];
  esit(g.planKaynak, "kopya");
  esit(g.maddeler.length, 3);
  icerir(u.html("b-plan"), "Dünün planı kopyalandı");
});

await dene("kota dolduğunda kullanıcıya söylenir, sessizce yutulmaz", async () => {
  const u = await ac({ simdi:"2026-09-06T09:00:00",
                       api:{ plan:{ durum:429, mesaj:"Ücretsiz katman kotası doldu, biraz sonra dene." } } });
  await u.ic.planUret(true);
  icerir(u.html("b-plan"), "kota");
});

bolum("api/ — anahtar istemciye sızmıyor");

await dene("istemci kodunda GEMINI_API_KEY geçmiyor", async () => {
  const fs = require("fs");
  const html = fs.readFileSync(require("path").join(__dirname, "..", "index.html"), "utf8");
  icermez(html, "GEMINI_API_KEY=");
  icermez(html, "generativelanguage.googleapis.com");
  icerir(html, 'fetch("api/plan"');
});

await dene("api/plan.js anahtarı yalnız ortam değişkeninden okur", async () => {
  const fs = require("fs"), path = require("path");
  const ortak = fs.readFileSync(path.join(__dirname, "..", "api", "_ortak.js"), "utf8");
  icerir(ortak, "process.env.GEMINI_API_KEY");
  icerir(ortak, "responseSchema");
  icerir(ortak, "gemini-2.0-flash");
});

/* ---------------------------------------------------------------
   §7 — Etkinlikler
   --------------------------------------------------------------- */

bolum("§7 — etkinlikler");

await dene('"12 Eylül saat 14\'te berber" doğru tarih ve saate çevrilir', async () => {
  const u = await ac({ simdi:"2026-09-06T14:00:00",
    api:{ plan:SAHTE_PLAN, parse:{ tarih:"2026-09-12", saat:"14:00", sure:60, baslik:"Berber" } } });
  await u.ic.etkinlikCozumle("12 Eylül saat 14'te berber randevum var");
  const e = u.veri().etkinlikler;
  esit(e.length, 1);
  esit(e[0].tarih, "2026-09-12");
  esit(e[0].saat, "14:00");
  esit(e[0].baslik, "Berber");
  const h = u.html("b-etkinlik");
  icerir(h, "12 Eylül");
  icerir(h, "Berber");
});

await dene("çözümlemeye bugünün tarihi gönderilir", async () => {
  const u = await ac({ simdi:"2026-09-06T14:00:00",
    api:{ plan:SAHTE_PLAN, parse:{ tarih:"2026-09-07", saat:"", sure:0, baslik:"Kargo" } } });
  await u.ic.etkinlikCozumle("yarın kargo gelecek");
  const cagri = u.durum.apiCagrilari.find(c => c.ad === "parse");
  esit(cagri.govde.bugun, "2026-09-06");
  esit(cagri.govde.metin, "yarın kargo gelecek");
});

await dene("model emin değilse kullanıcı doldurur, tahmin edilmez", async () => {
  const u = await ac({ simdi:"2026-09-06T14:00:00",
    api:{ plan:SAHTE_PLAN, parse:{ tarih:"", saat:"", sure:0, baslik:"Diş hekimi" } } });
  await u.ic.etkinlikCozumle("diş hekimine gideceğim");
  esit(u.veri().etkinlikler.length, 0, "eksik etkinlik kaydedilmemeli");
  const h = u.html("b-etkinlik");
  icerir(h, "Eksik kalan yeri doldur");
  icerir(h, 'id="e-tarih"');
  icerir(h, "Diş hekimi");
});

await dene("etkinlik yoksa bölüm görünmez", async () => {
  const u = await ac({ simdi:"2026-09-06T14:00:00" });
  esit(u.ctx.document.getElementById("b-etkinlik").hidden, true);
});

await dene("geçmiş etkinlik listede görünmez", async () => {
  const u = await ac({ simdi:"2026-09-20T14:00:00",
    api:{ plan:SAHTE_PLAN, parse:{ tarih:"2026-09-25", saat:"", sure:0, baslik:"İleri" } } });
  u.ic.etkinlikKaydet({ tarih:"2026-09-12", saat:"14:00", sure:60, baslik:"Geçmiş" });
  u.ic.etkinlikKaydet({ tarih:"2026-09-25", saat:"", sure:0, baslik:"İleri" });
  const h = u.html("b-etkinlik");
  icerir(h, "İleri");
  icermez(h, "Geçmiş");
});

await dene("bugüne düşen etkinlik bugünün planına tur:etkinlik olarak girer", async () => {
  const u = await ac({ simdi:"2026-09-06T14:00:00" });
  u.ic.etkinlikKaydet({ tarih:"2026-09-06", saat:"16:00", sure:45, baslik:"Berber" });
  const m = u.veri().gunler["2026-09-06"].maddeler;
  esit(m.length, 1);
  esit(m[0].tur, "etkinlik");
  esit(m[0].saat, "16:00");
  icerir(u.html("b-plan"), "Berber");
});

await dene("etkinlik silinince plandaki maddesi de gider", async () => {
  const u = await ac({ simdi:"2026-09-06T14:00:00" });
  const e = u.ic.etkinlikKaydet({ tarih:"2026-09-06", saat:"16:00", sure:45, baslik:"Berber" });
  esit(u.veri().gunler["2026-09-06"].maddeler.length, 1);
  u.ic.etkinlikSil(e.id);
  esit(u.veri().gunler["2026-09-06"].maddeler.length, 0);
  esit(u.veri().etkinlikler.length, 0);
});

await dene("yaklaşan etkinlikler plan üretimine girdi olur", async () => {
  const u = await ac({ simdi:"2026-09-06T14:00:00", api:{ plan:SAHTE_PLAN } });
  u.ic.etkinlikKaydet({ tarih:"2026-09-12", saat:"14:00", sure:60, baslik:"Berber" });
  await u.ic.planUret(true);
  const cagri = u.durum.apiCagrilari.filter(c => c.ad === "plan").pop();
  esit(cagri.govde.etkinlikler[0].baslik, "Berber");
});

await dene("anahtar yokken etkinlik elle eklenebilir", async () => {
  const u = await ac({ simdi:"2026-09-06T14:00:00" });     // api yok
  await u.ic.etkinlikCozumle("12 Eylül berber");
  icerir(u.html("b-etkinlik"), "Yapay zeka kapalı");
  icerir(u.html("b-etkinlik"), 'id="e-tarih"');
  esit(u.durum.apiCagrilari.filter(c => c.ad === "parse").length, 0, "boşuna çağırmamalı");
});

/* ---------------------------------------------------------------
   §9 / §12 — profil ve gün sonu değerlendirmesi
   --------------------------------------------------------------- */

/** Son 14 güne veri koy: her gün bir madde, işaret ve not. */
function kayitliDepo(bitis, gunSayisi){
  const gunler = {};
  const g = (t, i) => ({
    namaz: { sabah: i % 3 ? "vaktinde" : "kaza" },
    su: 4 + (i % 5),
    maddeler: [{ id:"m"+i, saat:"08:00", sure:10, baslik:"Kalk", tur:"uyku",
                 gerekce:"", yapildi: i % 2 === 0, not: i % 2 ? "0"+(8+i%2)+":40'ta kalktım" : "" }]
  });
  for(let i = 1; i <= gunSayisi; i++){
    const t = new Date(bitis + "T12:00:00");
    t.setDate(t.getDate() - i);
    const anh = t.toISOString().slice(0,10);
    gunler[anh] = g(anh, i);
  }
  return { "ledger/v1": JSON.stringify({
    surum:1, konum:null, vakitler:{}, gunler,
    borc:{sabah:0,ogle:0,ikindi:0,aksam:0,yatsi:0}, islenmisVakitler:[],
    sonKontrol: bitis, profil:"", etkinlikler:[], sohbet:[], ayar:{}
  }) };
}

bolum("§12 — gün sonu değerlendirmesi");

await dene("değerlendirme istenir, güne yazılır", async () => {
  const u = await ac({ simdi:"2026-09-06T22:00:00", api:{
    plan:SAHTE_PLAN,
    review:{ metin:"Kod bloğunu üç gündür 09:30'da başlatıp yarıda bırakıyorsun. Yarın 10:30'da başlat." } } });
  await u.ic.degerlendir();
  icerir(u.veri().gunler["2026-09-06"].degerlendirme, "yarıda bırakıyorsun");
  icerir(u.html("b-degerlendirme"), "Yarın 10:30");
});

await dene("değerlendirme isteğinde profil ve son 14 gün gider", async () => {
  const depo = kayitliDepo("2026-09-06", 10);
  const v = JSON.parse(depo["ledger/v1"]);
  v.profil = "Koşuyu üç haftadır cumartesi hiç yapmadı.";
  depo["ledger/v1"] = JSON.stringify(v);

  const u = await ac({ simdi:"2026-09-06T22:00:00", depo,
                       api:{ plan:SAHTE_PLAN, review:{ metin:"tamam" } } });
  await u.ic.degerlendir();
  const c = u.durum.apiCagrilari.filter(x => x.ad === "review").pop();
  esit(c.govde.tur, "gun");
  icerir(c.govde.profil, "cumartesi");
  dogru(c.govde.son14.length >= 5, "son 14 günün kaydı gitmeli");
  dogru(c.govde.son14.some(g => g.maddeler.some(m => m.not)), "notlar gitmeli");
});

await dene("değerlendirme alınamazsa sessizce yutulmaz", async () => {
  const u = await ac({ simdi:"2026-09-06T22:00:00",
    api:{ plan:SAHTE_PLAN, review:{ durum:429, mesaj:"Ücretsiz katman kotası doldu, biraz sonra dene." } } });
  await u.ic.degerlendir();
  icerir(u.html("b-degerlendirme"), "kotası doldu");
});

bolum("§9 — uzun vadeli profil");

await dene("profil güncellenir ve tarihi işaretlenir", async () => {
  const depo = kayitliDepo("2026-09-06", 10);
  const u = await ac({ simdi:"2026-09-06T22:00:00", depo, api:{
    plan:SAHTE_PLAN,
    review:{ profil:"08:00 alarmına rağmen ortalama 08:35'te kalkıyor. 08:30 daha gerçekçi." } } });
  await u.ic.profilGuncelle();
  icerir(u.veri().profil, "08:35");
  esit(u.veri().profilGuncelleme, "2026-09-06");
  icerir(u.html("b-ayar"), "08:35");
});

await dene("profil isteği tur:profil ile gider", async () => {
  const depo = kayitliDepo("2026-09-06", 10);
  const u = await ac({ simdi:"2026-09-06T22:00:00", depo,
                       api:{ plan:SAHTE_PLAN, review:{ profil:"gözlem" } } });
  await u.ic.profilGuncelle();
  const c = u.durum.apiCagrilari.filter(x => x.ad === "review").pop();
  esit(c.govde.tur, "profil");
});

await dene("yeterli kayıt yoksa profil kendiliğinden denenmez", async () => {
  const u = await ac({ simdi:"2026-09-06T22:00:00",
                       api:{ plan:SAHTE_PLAN, review:{ profil:"gözlem" } } });
  esit(u.ic.profilZamaniMi(), false);
  esit(u.durum.apiCagrilari.filter(x => x.ad === "review").length, 0);
});

await dene("yeterli kayıt varsa haftada bir kendiliğinden güncellenir", async () => {
  const depo = kayitliDepo("2026-09-06", 10);
  const u = await ac({ simdi:"2026-09-06T22:00:00", depo,
                       api:{ plan:SAHTE_PLAN, review:{ profil:"gözlem" } } });
  esit(u.veri().profil, "gözlem", "açılışta güncellenmeli");

  const y = await ac({ simdi:"2026-09-08T22:00:00", depo:Object.fromEntries(u.durum.depo),
                       api:{ plan:SAHTE_PLAN, review:{ profil:"ikinci" } } });
  esit(y.veri().profil, "gözlem", "iki gün sonra tekrar güncellenmemeli");

  const z = await ac({ simdi:"2026-09-14T22:00:00", depo:Object.fromEntries(u.durum.depo),
                       api:{ plan:SAHTE_PLAN, review:{ profil:"ikinci" } } });
  esit(z.veri().profil, "ikinci", "sekiz gün sonra güncellenmeli");
});

await dene("profil plan üretimine girdi olur", async () => {
  const depo = kayitliDepo("2026-09-06", 10);
  const v = JSON.parse(depo["ledger/v1"]);
  v.profil = "Kod bloğunu 10:30'da başlattığında bitiriyor.";
  v.profilGuncelleme = "2026-09-06";
  depo["ledger/v1"] = JSON.stringify(v);
  const u = await ac({ simdi:"2026-09-07T09:00:00", depo, api:{ plan:SAHTE_PLAN } });
  const c = u.durum.apiCagrilari.filter(x => x.ad === "plan").pop();
  icerir(c.govde.profil, "10:30");
});

/* ---------------------------------------------------------------
   §10 — Sohbet
   --------------------------------------------------------------- */

bolum("§10 — sohbet");

await dene("soru sorulunca yalnız metin cevap gelir", async () => {
  const u = await ac({ simdi:"2026-09-06T14:00:00", api:{
    plan:SAHTE_PLAN,
    chat:{ cevap:"Yatsı 20:56'da giriyor.", planGuncelle:null, etkinlikEkle:null, profilEki:"" } } });
  const oncekiPlan = JSON.stringify(u.veri().gunler["2026-09-06"].maddeler);
  await u.ic.sohbetGonder("yatsı kaçta?");
  esit(u.veri().sohbet.length, 2);
  esit(u.veri().sohbet[0].kim, "ben");
  esit(u.veri().sohbet[1].metin, "Yatsı 20:56'da giriyor.");
  esit(JSON.stringify(u.veri().gunler["2026-09-06"].maddeler), oncekiPlan, "plan değişmemeli");
  esit(u.veri().profil, "", "profil değişmemeli");
});

await dene('"koşuyu akşama al" hem planı değiştirir hem profile satır düşer', async () => {
  const u = await ac({ simdi:"2026-09-06T14:00:00", api:{
    plan:SAHTE_PLAN,
    chat:{
      cevap:"Koşuyu 19:30'a aldım.",
      planGuncelle:{ tarih:"2026-09-06", maddeler:[
        { saat:"08:00", sure:10, baslik:"Kalk, perdeyi aç, bir bardak su", tur:"uyku", gerekce:"" },
        { saat:"09:05", sure:30, baslik:"Kahvaltı", tur:"yemek", gerekce:"" },
        { saat:"19:30", sure:40, baslik:"Koşu", tur:"spor", gerekce:"" }
      ], gununNotu:"" },
      etkinlikEkle:null,
      profilEki:"Sabah koşusunu yapmıyor, akşamı tercih ediyor."
    } } });

  await u.ic.sohbetGonder("Sabahları koşamıyorum, akşama alalım.");
  const m = u.veri().gunler["2026-09-06"].maddeler;
  dogru(m.some(x => x.baslik === "Koşu" && x.saat === "19:30"), "koşu akşama taşınmalı");
  icerir(u.veri().profil, "akşamı tercih ediyor");
  icerir(u.html("b-plan"), "19:30");
  icerir(u.html("b-ayar"), "akşamı tercih ediyor");
});

await dene("plan güncellenirken mevcut işaretler ve notlar korunur", async () => {
  const u = await ac({ simdi:"2026-09-06T14:00:00", api:{
    plan:SAHTE_PLAN,
    chat:{ cevap:"tamam", planGuncelle:{ tarih:"2026-09-06", maddeler:[
      { saat:"08:00", sure:10, baslik:"Kalk, perdeyi aç, bir bardak su", tur:"uyku", gerekce:"" },
      { saat:"11:00", sure:60, baslik:"Yeni madde", tur:"kod", gerekce:"" }
    ], gununNotu:"" }, etkinlikEkle:null, profilEki:"" } } });

  const ilk = u.veri().gunler["2026-09-06"].maddeler[0];
  u.ic.maddeIsaretle(ilk.id);
  u.ic.maddeNot(ilk.id, "suyu içmedim");

  await u.ic.sohbetGonder("kahvaltıyı çıkar, öğlene kod koy");
  const m = u.veri().gunler["2026-09-06"].maddeler;
  const kalk = m.find(x => x.baslik === "Kalk, perdeyi aç, bir bardak su");
  esit(kalk.yapildi, true, "işaret korunmalı");
  esit(kalk.not, "suyu içmedim", "not korunmalı");
  esit(kalk.id, ilk.id, "id korunmalı");
  dogru(m.some(x => x.baslik === "Yeni madde"));
});

await dene("sohbetten etkinlik eklenir", async () => {
  const u = await ac({ simdi:"2026-09-06T14:00:00", api:{
    plan:SAHTE_PLAN,
    chat:{ cevap:"12 Eylül 14:00'e berber ekledim.", planGuncelle:null,
           etkinlikEkle:{ tarih:"2026-09-12", saat:"14:00", sure:60, baslik:"Berber" },
           profilEki:"" } } });
  await u.ic.sohbetGonder("12 Eylül saat 14'te berber randevum var");
  esit(u.veri().etkinlikler.length, 1);
  esit(u.veri().etkinlikler[0].baslik, "Berber");
  icerir(u.html("b-etkinlik"), "12 Eylül");
});

await dene("sohbet geçmişi son 20 mesajla sınırlı", async () => {
  const u = await ac({ simdi:"2026-09-06T14:00:00", api:{
    plan:SAHTE_PLAN,
    chat:{ cevap:"tamam", planGuncelle:null, etkinlikEkle:null, profilEki:"" } } });
  for(let i = 0; i < 15; i++) await u.ic.sohbetGonder("mesaj " + i);
  esit(u.veri().sohbet.length, 20);
  icerir(u.veri().sohbet[0].metin + u.veri().sohbet[1].metin, "mesaj 5");
});

await dene("modele giden gövdede bugünün planı, profil ve geçmiş var", async () => {
  const u = await ac({ simdi:"2026-09-06T14:00:00", api:{
    plan:SAHTE_PLAN,
    chat:{ cevap:"tamam", planGuncelle:null, etkinlikEkle:null, profilEki:"" } } });
  await u.ic.sohbetGonder("ilk mesaj");
  await u.ic.sohbetGonder("ikinci mesaj");
  const c = u.durum.apiCagrilari.filter(x => x.ad === "chat").pop();
  esit(c.govde.metin, "ikinci mesaj");
  esit(c.govde.tarih, "2026-09-06");
  esit(c.govde.gunAdi, "Pazar");
  dogru(c.govde.plan.length > 0, "bugünün planı gitmeli");
  dogru(c.govde.vakitler && c.govde.vakitler["Yatsı"], "vakitler gitmeli");
  dogru(c.govde.sohbet.some(m => m.metin === "ilk mesaj"), "geçmiş gitmeli");
  dogru(!c.govde.sohbet.some(m => m.metin === "ikinci mesaj"), "yeni mesaj geçmişte olmamalı");
});

await dene("profil 400 kelimeyi aşarsa en eski satırlar düşer", async () => {
  const u = await ac({ simdi:"2026-09-06T14:00:00", api:{
    plan:SAHTE_PLAN,
    chat:{ cevap:"tamam", planGuncelle:null, etkinlikEkle:null,
           profilEki: Array.from({length:150}, (_,i)=>"k"+i).join(" ") } } });
  await u.ic.sohbetGonder("bir");
  await u.ic.sohbetGonder("iki");
  await u.ic.sohbetGonder("üç");
  const kelime = u.veri().profil.split(/\s+/).length;
  dogru(kelime <= 400, "400 kelimeyi aşmamalı, geldi: " + kelime);
});

await dene("sohbet başarısız olursa kullanıcı görür, mesajı kaybolmaz", async () => {
  const u = await ac({ simdi:"2026-09-06T14:00:00", api:{
    plan:SAHTE_PLAN, chat:{ durum:502, mesaj:"Model cevap vermedi." } } });
  u.ic.sohbetAc();
  await u.ic.sohbetGonder("bir şey");
  icerir(u.html("b-sohbet"), "Model cevap vermedi");
  esit(u.veri().sohbet.length, 1, "kullanıcının mesajı kayıtta kalmalı");
});

await dene("sohbet paneli kapalı başlar", async () => {
  const u = await ac({ simdi:"2026-09-06T14:00:00", api:{ plan:SAHTE_PLAN } });
  const h = u.html("b-sohbet");
  icerir(h, 'id="s-ac"');
  icermez(h, 'id="s-metin"');
});

/* ---------------------------------------------------------------
   §8 — Alarm
   --------------------------------------------------------------- */

bolum("§8.1 — Android intent");

await dene("yarının sabah namazı için SET_ALARM intent'i kurulur", async () => {
  const u = await ac({ simdi:"2026-09-06T22:00:00" });
  const b = u.ic.alarmBilgisi("namaz");
  const adres = u.ic.intentAdresi(b.saat, b.dakika, b.mesaj);
  icerir(u.html("b-alarm"), "href=\"intent://");        // düğme gerçek bağlantı
  icerir(adres, "intent://");
  icerir(adres, "action=android.intent.action.SET_ALARM");
  icerir(adres, "i.android.intent.extra.alarm.HOUR=5");
  icerir(adres, "i.android.intent.extra.alarm.MINUTES=2");   // 7 Eylül imsağı 05:02
  icerir(adres, "B.android.intent.extra.alarm.SKIP_UI=true");
  icerir(adres, "MESSAGE=Sabah%20namaz");
});

await dene("kalkış alarmı ayrı kurulur ve saati değiştirilebilir", async () => {
  const u = await ac({ simdi:"2026-09-06T22:00:00" });
  const adres = t => { const b = u.ic.alarmBilgisi(t); return u.ic.intentAdresi(b.saat, b.dakika, b.mesaj); };
  icerir(adres("kalkis"), "HOUR=8");                          // varsayılan 08:00
  icerir(adres("kalkis"), "MINUTES=0");

  u.ic.UYG.veri.ayar.kalkis = "07:15"; u.ic.kaydet();
  icerir(adres("kalkis"), "HOUR=7");
  icerir(adres("kalkis"), "MINUTES=15");
});

await dene("kalkış saati plandaki uyku maddesinden gelir", async () => {
  const u = await ac({ simdi:"2026-09-06T22:00:00" });
  u.ic.maddeEkle("08:30", "Kalk, perdeyi aç");
  const m = u.veri().gunler["2026-09-06"].maddeler[0];
  u.ic.UYG.veri.gunler["2026-09-06"].maddeler[0].tur = "uyku";
  esit(u.ic.kalkisSaati(), "08:30");
});

await dene("kurulduğu gün kaydedilir, aynı gün için ikinci kez kurulmuş sayılmaz", async () => {
  const u = await ac({ simdi:"2026-09-06T22:00:00" });
  esit(u.ic.alarmKuruldu("namaz"), false);
  u.ic.alarmKur("namaz");
  esit(u.ic.alarmKuruldu("namaz"), true);
  esit(u.veri().ayar.alarmKuruldu.namaz, "2026-09-07");
  icerir(u.html("b-alarm"), "yeniden kur");
});

await dene("kurma denemesi tarayıcı kimliğine bakıp reddedilmez", async () => {
  const u = await ac({ simdi:"2026-09-06T22:00:00", cihaz:"masaustu" });
  // "Masaüstü sitesi iste" açık bir Android telefon da masaüstü görünür;
  // denemeyi engellememeli, bağlantı yine kurulmalı.
  icerir(u.html("b-alarm"), "href=\"intent://");
  u.ic.alarmKur("namaz");
  const h = u.html("b-alarm");
  icerir(h, "elle kur");
  icerir(h, "05:02");
  icerir(h, "Android görünmüyor");        // yine de uyarıyor
});

await dene("alarm bölümünde iki saat de yazılı", async () => {
  const u = await ac({ simdi:"2026-09-06T22:00:00" });
  const h = u.html("b-alarm");
  icerir(h, "05:02");        // yarının imsağı
  icerir(h, "Sabah namazı");
  icerir(h, "08:00");
  icerir(h, "Kalk");
  icerir(h, "7 Eylül");
});

bolum("§8.5 — iOS: alarm değil, takvim bildirimi");

await dene(".ics VALARM ile üretilir ve alarm olmadığı yazılı", async () => {
  const u = await ac({ simdi:"2026-09-06T22:00:00" });
  const ics = u.ic.icsUret();
  icerir(ics, "BEGIN:VCALENDAR");
  icerir(ics, "BEGIN:VALARM");
  icerir(ics, "SUMMARY:Sabah namazı");
  icerir(ics, "SUMMARY:Kalk");
  icerir(u.html("b-alarm"), ".ics dosyası alarm değildir");
});

bolum("§8.6 — uygulama içi bildirim");

await dene("ilk açılışta bildirim izni istenmez", async () => {
  const u = await ac({ simdi:"2026-09-06T14:00:00" });
  esit(u.ic.bildirimDurumu(), "default");
  esit(u.bildirim().length, 0);
  icerir(u.html("b-ayarlar"), "bildirimlere izin ver");     // düğmenin arkasında
});

await dene("izin yokken bildirim gönderilmez", async () => {
  const u = await ac({ simdi:"2026-09-06T20:56:30" });
  u.ic.bildirimTara();
  esit(u.bildirim().length, 0);
});

await dene("vakit girdiğinde bildirim düşer, iki kez düşmez", async () => {
  const u = await ac({ simdi:"2026-09-06T20:56:30", bildirim:"granted" });
  u.ic.bildirimTara();
  const b = u.bildirim();
  esit(b.length, 1);
  esit(b[0].baslik, "Yatsı");
  icerir(b[0].govde, "Vakit girdi");
  u.ic.bildirimTara();
  esit(u.bildirim().length, 1, "aynı vakit için ikinci bildirim olmamalı");
});

await dene("vakit çıkmasına 20 dakika kala uyarır, kılınmışsa uyarmaz", async () => {
  const u = await ac({ simdi:"2026-09-06T16:30:00", bildirim:"granted" });
  u.ic.bildirimTara();                            // öğle 16:44'te çıkıyor
  dogru(u.bildirim().some(b => b.baslik === "Öğle" && b.govde.indexOf("Çıkmasına") === 0),
        "çıkışa yakın uyarı gelmeli");

  const y = await ac({ simdi:"2026-09-06T16:30:00", bildirim:"granted" });
  y.ic.namazIsaretle("2026-09-06", "ogle", "vaktinde");
  y.ic.bildirimTara();
  dogru(!y.bildirim().some(b => b.govde && b.govde.indexOf("Çıkmasına") === 0),
        "kılınmış namaz için uyarı olmamalı");
});

await dene("su hatırlatması 08:00-21:00 arası, gece yok", async () => {
  const gunduz = await ac({ simdi:"2026-09-06T09:30:00", bildirim:"granted" });
  gunduz.ic.bildirimTara();
  dogru(gunduz.bildirim().some(b => b.baslik === "Su"), "gündüz hatırlatmalı");

  const gece = await ac({ simdi:"2026-09-07T02:00:00", bildirim:"granted" });
  gece.ic.bildirimTara();
  dogru(!gece.bildirim().some(b => b.baslik === "Su"), "gece hatırlatmamalı");
});

await dene("hedefe ulaşınca su hatırlatması kesilir", async () => {
  const u = await ac({ simdi:"2026-09-06T09:30:00", bildirim:"granted" });
  for(let i = 0; i < 10; i++) u.ic.suDegistir(+1);
  u.ic.bildirimTara();
  dogru(!u.bildirim().some(b => b.baslik === "Su"));
});

await dene("plandaki madde başlarken bildirim düşer", async () => {
  const u = await ac({ simdi:"2026-09-06T10:30:30", bildirim:"granted" });
  u.ic.maddeEkle("10:30", "Kod bloğu");
  u.ic.bildirimTara();
  dogru(u.bildirim().some(b => b.baslik === "Kod bloğu"), "madde bildirimi gelmeli");
});

bolum("§8.2 — ntfy");

await dene("topic rastgele üretilir, tahmin edilebilir değil", async () => {
  const u = await ac({ simdi:"2026-09-06T14:00:00" });
  const t = u.ic.topicUret();
  icerir(t, "ledger-");
  dogru(t.length >= 20, "en az 20 karakter olmalı");
});

await dene("cron adresi topic, konum ve saat dilimini taşır", async () => {
  const u = await ac({ simdi:"2026-09-06T14:00:00" });
  u.ic.UYG.veri.ayar.ntfy = "ledger-gizlibirsey";
  u.ic.kaydet();
  const adres = u.ic.cronAdresi();
  icerir(adres, "/api/push?topic=ledger-gizlibirsey");
  icerir(adres, "lat=40.1826");
  icerir(adres, "pencere=5");
});

await dene("ntfy kurulmamışsa uygulama normal çalışır", async () => {
  const u = await ac({ simdi:"2026-09-06T14:00:00" });
  esit(u.veri().ayar.ntfy, undefined);
  esit(u.ic.cronAdresi(), "");
  icerir(u.html("b-namaz"), "05:01");
});

/* ---------------------------------------------------------------
   §14 — kalan kabul kriterleri
   --------------------------------------------------------------- */

bolum("§14 — kalan kriterler");

await dene("bir maddeye yazılan not ertesi günün plan isteğine dahil edilir", async () => {
  const ilk = await ac({ simdi:"2026-09-06T09:00:00", api:{ plan:SAHTE_PLAN } });
  const m = ilk.veri().gunler["2026-09-06"].maddeler[0];
  ilk.ic.maddeNot(m.id, "20 dakika koştum, nefesim yetmedi");

  const y = await ac({ simdi:"2026-09-07T09:00:00",
                       depo:Object.fromEntries(ilk.durum.depo),
                       api:{ plan:SAHTE_PLAN } });
  const c = y.durum.apiCagrilari.filter(x => x.ad === "plan").pop();
  const dun = c.govde.son14.find(g => g.tarih === "2026-09-06");
  dogru(dun, "dünün kaydı gitmeli");
  dogru(dun.maddeler.some(x => x.not === "20 dakika koştum, nefesim yetmedi"),
        "not plan isteğine girmeli");
});

await dene("aynı not gün sonu değerlendirmesine de girer", async () => {
  const u = await ac({ simdi:"2026-09-06T22:00:00",
                       api:{ plan:SAHTE_PLAN, review:{ metin:"tamam" } } });
  const m = u.veri().gunler["2026-09-06"].maddeler[0];
  u.ic.maddeNot(m.id, "yarıda bıraktım");
  await u.ic.degerlendir();
  const c = u.durum.apiCagrilari.filter(x => x.ad === "review").pop();
  dogru(JSON.stringify(c.govde.son14).indexOf("yarıda bıraktım") !== -1,
        "bugünün notu değerlendirmeye girmeli");
});

await dene("manifest ana ekran için standalone", async () => {
  const fs = require("fs"), path = require("path");
  const m = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"));
  esit(m.display, "standalone", "adres çubuğu görünmemeli");
  esit(m.start_url, "./");
  esit(m.background_color, "#0E1318");
  dogru(m.icons.some(i => i.sizes === "192x192"), "192 ikon gerekli");
  dogru(m.icons.some(i => i.purpose === "maskable"), "maskable ikon gerekli");
});

await dene("hiçbir metin kullanıcıyı övmüyor, emoji yok", async () => {
  const fs = require("fs"), path = require("path");
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  for(const yasak of ["harika", "tebrik", "muhteşem", "bravo", "seri bozuldu", "🎉", "🔥", "💪"]){
    if(html.toLowerCase().indexOf(yasak) !== -1)
      throw new Error("arayüzde geçmemeli: " + yasak);
  }
});

await dene("vurgu rengi yalnız §13'ün izin verdiği yerlerde", async () => {
  const fs = require("fs"), path = require("path");
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const css = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
  const kullanim = (css.match(/var\(--vakit\)/g) || []).length;
  // aktif vakit adı, kalan süre çubuğu, aktif vakit tırnağı, aktif satır adı,
  // birincil düğme kenarlığı, odak halkası, giriş odağı
  dogru(kullanim <= 8, "vurgu rengi dağılmamalı, kullanım: " + kullanim);
  const suSerit = css.slice(css.indexOf(".su-serit"), css.indexOf(".su-serit") + 400);
  if(suSerit.indexOf("--vakit") !== -1) throw new Error("su şeridinde vurgu rengi olmamalı");
});

console.log("\n" + (kalan ? "✗" : "✓") + "  " + gecen + " geçti, " + kalan + " kaldı\n");
process.exit(kalan ? 1 : 0);

})();
