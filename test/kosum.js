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
const BURSA_07 = { Fajr:"05:02", Sunrise:"06:30", Dhuhr:"13:07", Asr:"16:43",
                   Maghrib:"19:33", Isha:"20:54" };
const BURSA_08 = { Fajr:"05:03", Sunrise:"06:31", Dhuhr:"13:06", Asr:"16:42",
                   Maghrib:"19:31", Isha:"20:52" };
const BURSA_09 = { Fajr:"05:04", Sunrise:"06:32", Dhuhr:"13:06", Asr:"16:41",
                   Maghrib:"19:30", Isha:"20:50" };
const BURSA_10 = { Fajr:"05:05", Sunrise:"06:33", Dhuhr:"13:05", Asr:"16:40",
                   Maghrib:"19:28", Isha:"20:48" };

// "DD-MM-YYYY" -> vakitler.  Gerçek API biçimi gibi "(+03)" ekiyle döner.
const SABIT = {
  "06-09-2026": BURSA_06,
  "07-09-2026": BURSA_07,
  "08-09-2026": BURSA_08,
  "09-09-2026": BURSA_09,
  "10-09-2026": BURSA_10
};

function betigiCikar(){
  const html = fs.readFileSync(path.join(KOK, "index.html"), "utf8");
  const parcalar = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  if(!parcalar.length) throw new Error("index.html içinde <script> bulunamadı");
  return parcalar.join("\n");
}

/* Sahte eleman — innerHTML'e yazılanı saklar, sorgulanabilir. */
function eleman(id){
  const e = {
    id, innerHTML: "", style: { setProperty(){}, },
    dataset: {}, dinleyiciler: {},
    addEventListener(ad, f){ (e.dinleyiciler[ad] = e.dinleyiciler[ad] || []).push(f); },
    removeEventListener(){},
    setAttribute(){}, removeAttribute(){}, focus(){}, closest(){ return null; },
    querySelector(){ return null; }, querySelectorAll(){ return []; },
    appendChild(){}, remove(){}, classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } }
  };
  return e;
}

/**
 * @param {object} se
 *   se.simdi   — başlangıç zamanı (Date veya "2026-09-06T07:30:00")
 *   se.depo    — başlangıç localStorage içeriği (nesne)
 *   se.konum   — "izinli" | "izinsiz" | "yok"
 *   se.ag      — true: aladhan cevap verir, false: uçak modu
 *   se.vakitler— DD-MM-YYYY -> vakit tablosu (varsayılan SABIT)
 */
function kur(se = {}){
  const durum = {
    simdi: new Date(se.simdi || "2026-09-06T07:30:00"),
    istekler: [],
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
    getElementById(id){
      if(!belge._elemanlar.has(id)) belge._elemanlar.set(id, eleman(id));
      return belge._elemanlar.get(id);
    },
    querySelector(){ return null; },
    querySelectorAll(){ return []; },
    createElement(){ return eleman("yeni"); },
    addEventListener(){}
  };

  const ctx = {
    console,
    structuredClone,
    JSON, Math, Object, Array, String, Number, Boolean, Promise, Error, Map, Set, RegExp,
    isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
    Date: SahteTarih,
    document: belge,
    location: { origin: "https://ledger.test", href: "https://ledger.test/" },
    matchMedia: () => ({ matches:false, addEventListener(){}, addListener(){} }),
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
    navigator: {
      geolocation: se.konum === "yok" ? undefined : {
        getCurrentPosition(basarili, hata){
          if(se.konum === "izinli") basarili({ coords:{ latitude:41.0082, longitude:28.9784 } });
          else hata({ code:1, message:"reddedildi" });
        }
      }
    },
    fetch(url){
      durum.istekler.push(url);
      if(se.ag === false) return Promise.reject(new Error("ağ yok"));
      const m = String(url).match(/timings\/(\d{2}-\d{2}-\d{4})/);
      const t = m && tablo[m[1]];
      if(!t) return Promise.resolve({ ok:false, status:404, json: async () => ({}) });
      const ekli = {};
      for(const k in t) ekli[k] = t[k] + " (+03)";     // gerçek API biçimi
      return Promise.resolve({
        ok:true, status:200,
        json: async () => ({ code:200, data:{ timings: ekli, meta:{ timezone:"Europe/Istanbul" } } })
      });
    }
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.self = ctx;

  vm.createContext(ctx);
  vm.runInContext(betigiCikar() + "\n;globalThis.__IC = { " + [
    "UYG","uygulamaGunu","tarihAnahtar","gunKaydir","saatDate","araliklar",
    "aktifAralik","siradakiAralik","vakitGetir","namazKur","namazCiz","namazIsaretle",
    "gunKaydi","sureMetni","konumuKullan","konumSor","kaydet","yukle","VAKITLER"
  ].join(",") + " };", ctx, { filename:"index.html<script>" });

  return {
    ctx,
    ic: ctx.__IC,
    durum,
    /** Sahte saati ilerlet. */
    zamanAtla(yeni){ durum.simdi = new Date(yeni); },
    /** Bir elemanın son çizilen HTML'i. */
    html(id){ return belge.getElementById(id).innerHTML; },
    /** localStorage'daki uygulama verisi. */
    veri(){ return JSON.parse(durum.depo.get("ledger/v1") || "{}"); },
    /** Kayıtlı setInterval geri çağrılarını bir kez çalıştır. */
    tik(){ durum.zamanlayicilar.filter(z => z.aralik).forEach(z => z.f()); },
    bekle(){ return new Promise(r => setImmediate(r)); }
  };
}

module.exports = { kur, SABIT, BURSA_06, BURSA_07 };
