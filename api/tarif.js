/* §15 — bir yemek adı için ÇALIŞAN bir YouTube tarif linki döndürür.
   Katmanlı:
     1. YOUTUBE_API_KEY varsa  → YouTube Data API araması, gerçek watch linki
     2. anahtar yoksa          → results sayfasından ilk videoId'yi çek
     3. o da olmazsa           → arama linki (her zaman açılır)
   GEMINI_API_KEY ile ilgisi yok; bu uç nokta anahtarsız da çalışır. */

function aramaLinki(q){
  return "https://www.youtube.com/results?search_query=" + encodeURIComponent(q + " tarif");
}

async function dataApi(q, anahtar){
  const url = "https://www.googleapis.com/youtube/v3/search" +
    "?part=snippet&type=video&maxResults=1&relevanceLanguage=tr&safeSearch=none" +
    "&q=" + encodeURIComponent(q + " tarif") + "&key=" + anahtar;
  const c = await fetch(url);
  if(!c.ok) throw new Error("youtube api " + c.status);
  const j = await c.json();
  const id = j && j.items && j.items[0] && j.items[0].id && j.items[0].id.videoId;
  if(!id) throw new Error("video bulunamadı");
  return "https://www.youtube.com/watch?v=" + id;
}

async function kazi(q){
  const c = await fetch(aramaLinki(q) + "&hl=tr", {
    headers: {
      "Accept-Language": "tr-TR,tr;q=0.9",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
    }
  });
  if(!c.ok) throw new Error("results " + c.status);
  const html = await c.text();
  const m = html.match(/"videoId":"([\w-]{11})"/);
  if(!m) throw new Error("videoId bulunamadı");
  return "https://www.youtube.com/watch?v=" + m[1];
}

module.exports = async (req, res) => {
  if(req.method !== "POST" && req.method !== "GET"){
    res.status(405).json({ hata: "yalnız GET veya POST" });
    return;
  }

  let yemek = "";
  if(req.method === "GET"){
    const u = new URL(req.url, "http://x");
    yemek = u.searchParams.get("yemek") || "";
  }else{
    let g = req.body;
    if(typeof g === "string"){ try{ g = JSON.parse(g); }catch(e){ g = {}; } }
    yemek = (g && g.yemek) || "";
  }
  yemek = String(yemek).trim().slice(0, 120);
  if(!yemek){
    res.status(400).json({ hata: "yemek adı boş" });
    return;
  }

  const anahtar = process.env.YOUTUBE_API_KEY || "";

  if(anahtar){
    try{
      const url = await dataApi(yemek, anahtar);
      res.status(200).json({ url, kaynak: "api" });
      return;
    }catch(e){ console.warn("youtube data api:", e && e.message); }
  }

  try{
    const url = await kazi(yemek);
    res.status(200).json({ url, kaynak: "kazima" });
    return;
  }catch(e){ console.warn("youtube kazıma:", e && e.message); }

  res.status(200).json({ url: aramaLinki(yemek), kaynak: "arama" });
};
