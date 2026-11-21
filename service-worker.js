
"use strict";

const CACHE_NAME = "zeydal-ai-offline-v2";

const APP_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./voice.js",
  "./manifest.json",
  "./offline.js"
];

// Uygulama dosyalarını önbelleğe al
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

// Eski önbellekleri temizle
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key =>
              key.startsWith("zeydal-ai-offline-") &&
              key !== CACHE_NAME
            )
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Ağ isteklerini yönet
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  // Yalnızca aynı siteye ait GET isteklerini işle
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin
  ) {
    return;
  }

  // Sayfa açılışları
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();

            caches.open(CACHE_NAME)
              .then(cache =>
                cache.put("./index.html", copy)
              );
          }

          return response;
        })
        .catch(async () => {
          return (
            await caches.match(request) ||
            await caches.match("./index.html") ||
            new Response(
              "ZEYDAL AI çevrimdışı. Önce internet bağlantısıyla uygulamayı açmalısın.",
              {
                status: 503,
                headers: {
                  "Content-Type": "text/plain; charset=utf-8"
                }
              }
            )
          );
        })
    );

    return;
  }

  // CSS, JavaScript ve diğer statik dosyalar
  event.respondWith(
    caches.match(request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(request)
          .then(response => {
            if (response && response.ok) {
              const copy = response.clone();

              caches.open(CACHE_NAME)
                .then(cache =>
                  cache.put(request, copy)
                );
            }

            return response;
          });
      })
      .catch(() => {
        return new Response(
          "Dosya çevrimdışı olarak kullanılamıyor.",
          {
            status: 503,
            headers: {
              "Content-Type": "text/plain; charset=utf-8"
            }
          }
        );
      })
  );
});
