
"use strict";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register(
        "./service-worker.js"
      );

      console.log("ZEYDAL AI Offline Core hazır.");

    } catch (error) {
      console.error(
        "Offline Core başlatılamadı:",
        error
      );
    }
  });
}

window.addEventListener("online", () => {
  console.log("ZEYDAL AI: İnternet bağlantısı var.");
});

window.addEventListener("offline", () => {
  console.log("ZEYDAL AI: Çevrimdışı mod.");
});

