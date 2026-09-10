/* Ledger — çevrimdışı kabuk (§2).
   Kabuk önbellekten, API çağrıları hep ağdan. Uçak modunda uygulama açılmalı (§14). */

const SURUM  = "ledger-v5";   /* buton etiketi kırılması düzeltmesi */
const KABUK  = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(SURUM)
      .then(c => c.addAll(KABUK))
      .then(() => self.skipWaiting())
      .catch(err => console.warn("kabuk önbelleğe alınamadı", err))
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(adlar => Promise.all(adlar.filter(a => a !== SURUM).map(a => caches.delete(a))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const istek = e.request;
  if(istek.method !== "GET") return;

  const url = new URL(istek.url);

  // Kendi API'miz ve dış servisler: önbelleğe girmez, doğrudan ağa.
  if(url.pathname.startsWith("/api/") || url.origin !== self.location.origin){
    return;   // tarayıcı kendi hâline baksın; başarısızlığı uygulama kodu yakalar
  }

  // Gezinme: önce ağ, olmazsa önbellekteki kabuk.
  if(istek.mode === "navigate"){
    e.respondWith(
      fetch(istek)
        .then(y => {
          const kopya = y.clone();
          caches.open(SURUM).then(c => c.put("./index.html", kopya)).catch(()=>{});
          return y;
        })
        .catch(() => caches.match("./index.html").then(y => y || caches.match("./")))
    );
    return;
  }

  // Diğer kendi kaynaklarımız: önce önbellek, arkadan tazele.
  e.respondWith(
    caches.match(istek).then(onbellek => {
      const agdan = fetch(istek).then(y => {
        if(y && y.status === 200){
          const kopya = y.clone();
          caches.open(SURUM).then(c => c.put(istek, kopya)).catch(()=>{});
        }
        return y;
      }).catch(() => onbellek);
      return onbellek || agdan;
    })
  );
});
