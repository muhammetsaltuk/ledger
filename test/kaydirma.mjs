/* Gerçek WebKit render'ında mobil düzen testi (§13):
   - hiçbir sekmede yatay kaydırma yok (scrollWidth <= innerWidth)
   - düğme etiketleri tek satır (kısa etiket harf harf sarmıyor)
   OPSİYONEL — playwright ister, "no deps" kuralının dışında:
     npm i -D playwright && npx playwright install webkit
     node test/kaydirma.mjs
   Sahte DOM düzen ölçemediği için buradaki asıl denetim; hepsi.js yalnız
   CSS değişmezlerini statik kontrol eder. */

import { webkit } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const KOK = normalize(join(dirname(fileURLToPath(import.meta.url)), ".."));

const MIME = { ".html":"text/html", ".js":"text/javascript", ".json":"application/json",
  ".css":"text/css", ".png":"image/png", ".svg":"image/svg+xml" };

const srv = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/index.html";
    const abs = normalize(join(KOK, p));
    if (!abs.startsWith(KOK)) { res.writeHead(403).end(); return; }
    const buf = await readFile(abs);
    res.writeHead(200, { "Content-Type": MIME[extname(abs)] || "application/octet-stream" });
    res.end(buf);
  } catch { res.writeHead(404).end("yok"); }
});
await new Promise(r => srv.listen(0, r));
const ADRES = `http://127.0.0.1:${srv.address().port}/index.html`;

/* Bütün bölümleri dolduran, uzun bölünemez metinler içeren tohum. */
const d = new Date();
if (d.getHours() < 4) d.setDate(d.getDate() - 1);
const iki = n => String(n).padStart(2, "0");
const BUGUN = `${d.getFullYear()}-${iki(d.getMonth()+1)}-${iki(d.getDate())}`;
const UZUN = "UzunKelimeAaaaaaaaaaaaaaaaaaaaaaaaaBbbbbbbbbbbbbbbbbbbbCcccccccccccccccc";
const ADRESIMSI = "https://www.example.com/cok/uzun/bir/yol/parametrelerle?x=11111111&y=22222222";

const veri = {
  surum: 1,
  profil: "Gözlem " + UZUN + " " + ADRESIMSI,
  borc: { sabah:2, ogle:0, ikindi:1, aksam:0, yatsi:3 },
  sohbet: [{ kim:"ben", metin:"Mesaj " + ADRESIMSI }, { kim:"model", metin:UZUN }],
  etkinlikler: [{ id:"e1", tarih:BUGUN, saat:"14:00", baslik:"Etkinlik " + UZUN }],
  gunler: { [BUGUN]: {
    namaz: { sabah:"vaktinde", ogle:"vaktinde" }, su: 4,
    maddeler: [
      { id:"m1", saat:"08:00", baslik:UZUN, tur:"kod", gerekce:"", yapildi:false, not:ADRESIMSI },
      { id:"m2", saat:"16:30", baslik:"Koşu", tur:"spor", gerekce:ADRESIMSI, yapildi:false, not:"" }
    ],
    gununNotu: "Gün notu " + UZUN
  }},
  ayar: { sekme:"bugun", ntfy:"ledger-abc23def45gh67ij" },
  beslenme: {
    profil: { boy:178, kilo:72, yas:25, cinsiyet:"erkek", aktivite:"orta", haftalikHedef:0.35 },
    program: { gunlukKalori:3020, makro:{ protein:132, karb:430, yag:85 },
      ogunler: [{ ad:"Kahvaltı " + UZUN, saat:"08:30", yemekler:[
        { ad:UZUN, miktar:"100 g " + UZUN, kalori:520, protein:22, karb:78, yag:12,
          tarif:"Hazırlanış: " + ADRESIMSI + " " + UZUN } ]}],
      not: "Program notu " + UZUN },
    tartim: [{ tarih:BUGUN, kilo:72 }, { tarih:"2026-01-01", kilo:70 }],
    kayit: { [BUGUN]: [{ ad:UZUN, kalori:600, kaynak:"foto", protein:30 }] },
    sevmedigim: [UZUN], sayac: {}
  }
};

const b = await webkit.launch();
let hata = 0;
for (const w of [360, 390, 414]) {
  const ctx = await b.newContext({ viewport: { width:w, height:844 }, deviceScaleFactor:2 });
  const page = await ctx.newPage();
  await page.addInitScript(([k, v]) => localStorage.setItem(k, v), ["ledger/v1", JSON.stringify(veri)]);
  await page.goto(ADRES, { waitUntil:"load" });
  await page.waitForTimeout(600);
  for (const s of ["bugun", "seri", "plan", "beslenme", "ayarlar"]) {
    await page.click(`.alt-nav button[data-gor="${s}"]`).catch(()=>{});
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => {
      const iw = innerWidth;
      // Düğme etiketi tek satırda mı (harf harf kırılmış mı)?
      const sarmisButon = [];
      for (const el of document.querySelectorAll("button, a.dg")) {
        if (el.offsetParent === null) continue;
        const cs = getComputedStyle(el);
        if (cs.flexDirection === "column") continue;      // alt-nav ikon+etiket
        const txt = (el.textContent || "").trim();
        if (!txt) continue;
        const rg = document.createRange(); rg.selectNodeContents(el);
        let t = Infinity, btm = -Infinity;
        for (const rc of rg.getClientRects()) { if (rc.height === 0) continue; t = Math.min(t, rc.top); btm = Math.max(btm, rc.bottom); }
        const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3;
        if (btm - t > lh * 1.6) sarmisButon.push(txt.slice(0, 24));
      }
      return {
        iw, doc: document.documentElement.scrollWidth, body: document.body.scrollWidth,
        sarmisButon
      };
    });
    const tasti = r.doc > r.iw + 1 || r.body > r.iw + 1;
    const butonKotu = r.sarmisButon.length > 0;
    if (tasti || butonKotu) hata++;
    let sat = `${tasti || butonKotu ? "✗" : "✓"} ${w}px / ${s.padEnd(9)} doc=${r.doc} body=${r.body} (iw=${r.iw})`;
    if (butonKotu) sat += `  sarmış düğme: ${r.sarmisButon.join(", ")}`;
    console.log(sat);
  }
  await ctx.close();
}
await b.close();
srv.close();
console.log(hata ? `\n✗ ${hata} durumda yatay kaydırma / sarmış düğme` : "\n✓ yatay kaydırma yok, düğme etiketleri tek satır");
process.exit(hata ? 1 : 0);
