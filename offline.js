
"use strict";

// ZEYDAL AI PERSONAL - ÇEVRİMDIŞI ALTYAPISI

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration =
        await navigator.serviceWorker.register(
          "./service-worker.js"
        );

      console.log(
        "ZEYDAL AI Personal çevrimdışı altyapısı hazır."
      );

    } catch (error) {
      console.error(
        "Çevrimdışı altyapı başlatılamadı:",
        error
      );
    }
  });
}

window.addEventListener("online", () => {
  console.log(
    "ZEYDAL AI Personal: İnternet bağlantısı var."
  );
});

window.addEventListener("offline", () => {
  console.log(
    "ZEYDAL AI Personal: İnternet bağlantısı kesildi."
  );
});

