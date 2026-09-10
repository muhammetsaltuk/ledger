/* Test koşumu — index.html içindeki betiği sahte bir DOM'da çalıştırır.
   Amaç §14'ü fiilen denemek: tarihi ileri almak, sınır durumlarını zorlamak.
   Tarayıcı gerekmez, bağımlılık yoktur: `node test/hepsi.js` */

const fs   = require("fs");
const path = require("path");
const vm   = require("vm");

const KOK = path.join(__dirname, "..");

/* Bursa, 6 Eylül 2026 — aladhan'dan alınmış gerçek veri (method=13). */
const BURSA_06 = { Fajr:"05:01", Sunrise:"06:29", Dhuhr:"13:07", Asr:"16:44",
                   Maghrib:"19:35", Isha:"20:56" };

/* Diğer günler bu çıpadan türetiliyor: gerçeğe yakın günlük kayma.
   Amaç tam astronomik doğruluk değil, taramayı gerçek aralıklarla denemek. */
const dk = s => { const p = s.split(":").map(Number); return p[0]*60 + p[1]; };
const ss = m => String(Math.floor(m/60)).padStart(2,"0") + ":" + String(m%60).padStart(2,"0");
const KAYMA = { Fajr:+0.9, Sunrise:+0.8, Dhuhr:-0.15, Asr:-0.7, Maghrib:-1.5, Isha:-1.6 };

function gunVakti(fark){                       // fark: 6 Eylül'e göre gün farkı
  const o = {};
  for(const k in BURSA_06) o[k] = ss(Math.round(dk(BURSA_06[k]) + KAYMA[k] * fark));
  return o;
}

// "DD-MM-YYYY" -> vakitler. 2026 Temmuz–Kasım arası hazır.
const SABIT = {};
(function(){
  const capa = new Date(2026, 8, 6);
  for(let f = -70; f <= 70; f++){
    const d = new Date(capa); d.setDate(d.getDate() + f);
    const anh = String(d.getDate()).padStart(2,"0") + "-" +
                String(d.getMonth()+1).padStart(2,"0") + "-" + d.getFullYear();
    SABIT[anh] = gunVakti(f);
  }
})();

const BURSA_07 = SABIT["07-09-2026"];

function betigiCikar(){
  const html = fs.readFileSync(path.join(KOK, "index.html"), "utf8");
  const parcalar = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  if(!parcalar.length) throw new Error("index.html içinde <script> bulunamadı");
  return parcalar.join("\n");
}

/* Sahte eleman — innerHTML'e yazılanı saklar ve içindeki id'leri belgeye
   tanıtır. Böylece "bu düğüm zaten var mı" kontrolleri gerçeğe uyar. */
function eleman(id, belge){
  let html = "";
  const e = {
    id, textContent: "", nitelik: {},
    get innerHTML(){ return html; },
    set innerHTML(v){ html = String(v); if(belge) belge._kayitEt(html); },
    style: { setProperty(){} },
    dataset: {}, dinleyiciler: {},
    addEventListener(ad, f){ (e.dinleyiciler[ad] = e.dinleyiciler[ad] || []).push(f); },
    removeEventListener(){},
    setAttribute(a, d){ e.nitelik[a] = d; }, removeAttribute(a){ delete e.nitelik[a]; },
    getAttribute(a){ return e.nitelik[a]; },
    focus(){}, closest(){ return null; },
    querySelector(){ return null; },
    querySelectorAll(sec){                       // yalnız basit etiket seçicisi
      const n = (html.match(new RegExp("<" + sec + "\\b", "g")) || []).length;
      return Array.from({ length:n }, () => eleman(sec, belge));
    },
    appendChild(){}, remove(){},
    classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } }
  };
  return e;
}

/**
 * @param {object} se
 *   se.simdi   — başlangıç zamanı (Date veya "2026-09-06T07:30:00")
 *   se.depo    — başlangıç localStorage içeriği (nesne)
 *   se.konum   — "izinli" | "izinsiz" | "yok"
 *   se.anaEkran— true: uygulama ana ekrandan açılmış (standalone)
 *   se.ag      — true: aladhan cevap verir, false: uçak modu
 *   se.vakitler— DD-MM-YYYY -> vakit tablosu (varsayılan SABIT)
 */
function kur(se = {}){
  const durum = {
    simdi: new Date(se.simdi || "2026-09-06T07:30:00"),
    istekler: [],
    apiCagrilari: [],
    bildirimler: [],
    gidilenAdres: null,
    depo: new Map(Object.entries(se.depo || {})),
    zamanlayicilar: []
  };
  const tablo = se.vakitler || SABIT;

  class SahteTarih extends Date {
    constructor(...a){
      if(a.length === 0) super(durum.simdi.getTime());
      else super(...a);
    }
    static now(){ return durum.simdi.getTime(); }
  }

  const belge = {
    _elemanlar: new Map(),
    documentElement: { style: { setProperty(){}, getPropertyValue(){ return "800ms"; } } },
    body: { style: {} },
    /* index.html'deki bölümler her zaman vardır; diğer id'ler ancak bir yere
       yazıldıysa bulunur — gerçek DOM da böyle davranır. */
    getElementById(id){
      if(belge._elemanlar.has(id)) return belge._elemanlar.get(id);
      if(id.indexOf("b-") === 0){
        const e = eleman(id, belge);
        belge._elemanlar.set(id, e);
        return e;
      }
      return null;
    },
    _kayitEt(html){
      const bulunan = html.match(/id="([^"]+)"/g) || [];
      for(const p of bulunan){
        const kimlik = p.slice(4, -1);
        if(!belge._elemanlar.has(kimlik)) belge._elemanlar.set(kimlik, eleman(kimlik, belge));
      }
    },
    querySelector(){ return null; },
    querySelectorAll(){ return []; },
    createElement(){ return eleman("yeni", belge); },
    addEventListener(){}
  };

  const ctx = {
    console,
    structuredClone,
    JSON, Math, Object, Array, String, Number, Boolean, Promise, Error, Map, Set, RegExp,
    isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
    Date: SahteTarih,
    document: belge,
    location: {
      origin: "https://ledger.test",
      get href(){ return durum.gidilenAdres || "https://ledger.test/"; },
      set href(v){ durum.gidilenAdres = v; }        // intent:// navigasyonu
    },
    matchMedia: sorgu => ({
      matches: se.anaEkran === true && /standalone/.test(String(sorgu || "")),
      addEventListener(){}, addListener(){}
    }),
    addEventListener(){},
    setTimeout(f, ms){ const h = { f, ms }; durum.zamanlayicilar.push(h); return h; },
    clearTimeout(){},
    setInterval(f, ms){ const h = { f, ms, aralik:true }; durum.zamanlayicilar.push(h); return h; },
    clearInterval(){},
    localStorage: {
      getItem: k => (durum.depo.has(k) ? durum.depo.get(k) : null),
      setItem: (k, v) => durum.depo.set(k, String(v)),
      removeItem: k => durum.depo.delete(k),
      clear: () => durum.depo.clear()
    },
    Intl, URL, URLSearchParams,
    crypto: { getRandomValues(d){ for(let i=0;i<d.length;i++) d[i] = (i*37+11) % 256; return d; } },
    navigator: {
      userAgent: se.cihaz === "masaustu"
        ? "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        : se.cihaz === "ios"
        ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 Version/18.2 Mobile/15E148 Safari/604.1"
        : "Mozilla/5.0 (Linux; Android 14) Chrome/126",
      platform: se.cihaz === "ios" ? "iPhone" : "Win32",
      standalone: se.anaEkran === true ? true : undefined,   // iOS ana ekran bayrağı
      maxTouchPoints: se.cihaz === "ios" ? 5 : 0,
      geolocation: se.konum === "yok" ? undefined : {
        getCurrentPosition(basarili, hata){
          if(se.konum === "izinli") basarili({ coords:{ latitude:41.0082, longitude:28.9784 } });
          else hata({ code:1, message:"reddedildi" });
        }
      }
    },
    fetch(url, secenek){
      durum.istekler.push(url);
      if(se.ag === false) return Promise.reject(new Error("ağ yok"));

      /* Kendi uç noktalarımız. Varsayılan: anahtar yok — uygulamanın yapay zeka
         olmadan da çalıştığını her testte doğrulamış oluyoruz (§12). */
      if(String(url).indexOf("api/") === 0){
        const ad = String(url).slice(4);
        durum.apiCagrilari.push({ ad, govde: secenek && JSON.parse(secenek.body || "{}") });
        const sahte = se.api && se.api[ad];
        if(!sahte)
          return Promise.resolve({ ok:false, status:503,
            json: async () => ({ hata:"anahtar-yok" }) });
        if(sahte.durum && sahte.durum !== 200)
          return Promise.resolve({ ok:false, status:sahte.durum,
            json: async () => ({ hata:sahte.hata || "model", mesaj:sahte.mesaj || "hata" }) });
        return Promise.resolve({ ok:true, status:200, json: async () => sahte });
      }
      const ekle = t => {
        const o = {};
        for(const k in t) o[k] = t[k] + " (+03)";       // gerçek API biçimi
        return o;
      };

      const takvim = String(url).match(/calendar\/(\d{4})\/(\d{1,2})/);
      if(takvim){
        if(se.takvim === false)
          return Promise.resolve({ ok:false, status:500, json: async () => ({}) });
        const yil = +takvim[1], ay = +takvim[2];
        const gunler = [];
        for(let g = 1; g <= 31; g++){
          const anh = String(g).padStart(2,"0") + "-" + String(ay).padStart(2,"0") + "-" + yil;
          if(!tablo[anh]) continue;
          gunler.push({ date:{ gregorian:{ date: anh } }, timings: ekle(tablo[anh]) });
        }
        return Promise.resolve({ ok:true, status:200, json: async () => ({ code:200, data:gunler }) });
      }

      const m = String(url).match(/timings\/(\d{2}-\d{2}-\d{4})/);
      const t = m && tablo[m[1]];
      if(!t) return Promise.resolve({ ok:false, status:404, json: async () => ({}) });
      return Promise.resolve({
        ok:true, status:200,
        json: async () => ({ code:200, data:{ timings: ekle(t), meta:{ timezone:"Europe/Istanbul" } } })
      });
    }
  };
  // §8.6 bildirim izni: varsayılan "default" — ilk açılışta izin istenmiyor.
  if(se.bildirim !== "yok"){
    class SahteBildirim {
      constructor(baslik, ayar){ durum.bildirimler.push({ baslik, govde:(ayar||{}).body, tag:(ayar||{}).tag }); }
      static permission = se.bildirim || "default";
      static async requestPermission(){ return SahteBildirim.permission; }
    }
    ctx.Notification = SahteBildirim;
  }

  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.self = ctx;

  vm.createContext(ctx);
  vm.runInContext(betigiCikar() + "\n;globalThis.__IC = { " + [
    "UYG","uygulamaGunu","tarihAnahtar","gunKaydir","saatDate","araliklar",
    "aktifAralik","siradakiAralik","vakitGetir","namazKur","namazCiz","namazIsaretle",
    "gunKaydi","sureMetni","konumuKullan","konumSor","kaydet","yukle","VAKITLER",
    "borcTara","kazaCiz","toplamBorc","islenmisMi","borcDegistir","vakitleriHazirla",
    "ayGetir","baslat","suDegistir","suCiz","SU_HEDEFI","maddeEkle","maddeSil","maddeIsaretle","maddeNot","planCiz","planKopyala","planHazirla","planUreteBasla","dunUyumSorulsun","saatSirala","TURLER","planUret","planHakki","son14Gun","kursSaati","gunAdi","yaklasanEtkinlikler","PLAN_SINIR","etkinlikCozumle","etkinlikKaydet","etkinlikSil","etkinlikCiz","tarihYaz","degerlendir","degerCiz","profilGuncelle","profilZamaniMi","ayarCiz","modelIste","sohbetGonder","sohbetCiz","sohbetYaz","sohbetAc","maddeSor","HIZLI_SOHBET","SOHBET_SINIR","intentAdresi","kisayolAdresi","kisayolAdi","anaEkrandaMi","alarmAdresi","alarmBilgisi","iosMu","platform","kalkisSaati","yarininImsagi","alarmKur","alarmKuruldu","alarmCiz","icsUret","bildirimTara","bildirimGonder","bildirimDurumu","topicUret","cronAdresi","ayarlarCiz","SU_ARALIK","CIKISA_KALA","gunTamMi","gununNamazSayisi","seriHesapla","enUzunSeri","gunlukCiz","istatistikCiz","gorunum","GORUNUM","halkaSVG","kaloriHedefi","guncelHedef","sonKilo","tartimEkle","kiloTrend","gununBeslenme","AKTIVITE","VARSAYILAN_HEDEF","beslenmeCiz","profilKaydet","programUret","beslenmeHakki","yemekBegenmedim","tarifVideosu","tartimGirisGonder","PROGRAM_SINIR","sevmedigimEkle","ogunCiz","ogunEkle","ogunSil","ogunGirisGonder","fotoDegisti","fotoOnayla","gununOgunleri"
  ].join(",") + " };", ctx, { filename:"index.html<script>" });

  return {
    ctx,
    ic: ctx.__IC,
    durum,
    /** §8.1 intent adresine gidildi mi. */
    adres(){ return durum.gidilenAdres; },
    /** §8.6 gönderilen bildirimler. */
    bildirim(){ return durum.bildirimler; },
    /** Yalnız aladhan istekleri. */
    aladhan(){ return durum.istekler.filter(i => i.indexOf("aladhan") !== -1); },
    /** Sahte saati ilerlet. */
    zamanAtla(yeni){ durum.simdi = new Date(yeni); },
    /** Bir elemanın son çizilen HTML'i. */
    html(id){ return belge.getElementById(id).innerHTML; },
    /** localStorage'daki uygulama verisi. */
    veri(){ return JSON.parse(durum.depo.get("ledger/v1") || "{}"); },
    /** Bir girdiye değer yazıp change olayını tetikler.
        Dinleyiciler bölüm elemanına bağlı ve e.target.id'ye bakıyor; gerçek
        DOM'da olay oraya kabarıyor, burada elle taşınıyor. */
    degistir(id, deger){
      const hedef = { id, value: deger, closest(){ return null; } };
      let calisti = false;
      for(const e of belge._elemanlar.values())
        for(const f of e.dinleyiciler.change || []){ f({ target: hedef }); calisti = true; }
      if(!calisti) throw new Error("change dinleyicisi yok: " + id);
    },
    /** Bir düğmeye tıklamayı taklit eder. spec: {id} ya da {dataset:{...}}.
        Sentetik hedefin closest'ı her zaman kendini döndürür (o düğme). */
    tikla(spec){
      const btn = Object.assign({ id: "", dataset: {}, closest(){ return btn; } }, spec || {});
      let calisti = false;
      for(const e of belge._elemanlar.values())
        for(const f of (e.dinleyiciler.click || [])){ f({ target: btn, preventDefault(){} }); calisti = true; }
      if(!calisti) throw new Error("click dinleyicisi yok");
    },
    /** Bir id'ye ait sahte elemanı (varsa) döndürür — .value yazmak için. */
    el(id){ return belge._elemanlar.get(id) || null; },
    /** Kayıtlı setInterval geri çağrılarını bir kez çalıştır. */
    tik(){ durum.zamanlayicilar.filter(z => z.aralik).forEach(z => z.f()); },
    bekle(){ return new Promise(r => setImmediate(r)); }
  };
}

module.exports = { kur, SABIT, BURSA_06, BURSA_07 };
