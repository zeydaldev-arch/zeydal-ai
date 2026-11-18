
(() => {
  "use strict";

  // ------------------------------------------
  // ZEYDAL AI OTURUM YÖNETİMİ
  // ------------------------------------------

  const SESSION_KEY = "zeydal_ai_session";

  // Eski sessionStorage oturumunu yeni sisteme taşı
  try {
    const oldToken = sessionStorage.getItem(SESSION_KEY);
    const newToken = localStorage.getItem(SESSION_KEY);

    if (!newToken && oldToken) {
      localStorage.setItem(SESSION_KEY, oldToken);
      sessionStorage.removeItem(SESSION_KEY);
    }
  } catch (error) {
    console.error("ZEYDAL AI: Oturum depolama hatası.", error);
  }

  // ------------------------------------------
  // ARAYÜZ ALANLARI
  // ------------------------------------------

  function getAuthPanel() {
    return document.querySelector(
      "#authPanel, #auth-panel, #loginPanel, #login-panel"
    );
  }

  function getAppPanel() {
    return document.querySelector(
      "#appPanel, #app-panel, #chatPanel, #chat-panel, #mainApp"
    );
  }

  // ------------------------------------------
  // GİRİŞ EKRANINI GÖSTER
  // ------------------------------------------

  function showLogin() {
    const authPanel = getAuthPanel();
    const appPanel = getAppPanel();

    if (authPanel) {
      authPanel.style.display = "block";
    }

    if (appPanel) {
      appPanel.style.display = "none";
    }

    window.dispatchEvent(
      new CustomEvent("zeydal:session-closed")
    );
  }

  // ------------------------------------------
  // ANA UYGULAMAYI GÖSTER
  // ------------------------------------------

  function showApp() {
    const authPanel = getAuthPanel();
    const appPanel = getAppPanel();

    if (authPanel) {
      authPanel.style.display = "none";
    }

    if (appPanel) {
      appPanel.style.display = "block";
    }

    window.dispatchEvent(
      new CustomEvent("zeydal:session-ready")
    );
  }

  // ------------------------------------------
  // OTURUMU KONTROL ET
  // ------------------------------------------

  async function checkUserSession() {
    const token = localStorage.getItem(SESSION_KEY);

    if (!token) {
      showLogin();
      return;
    }

    if (!window.ZEYDAL_AUTH) {
      console.error("ZEYDAL AI: auth.js yüklenemedi.");
      showLogin();
      return;
    }

    try {
      const valid = await window.ZEYDAL_AUTH.checkSession();

      if (valid) {
        showApp();

        console.log("ZEYDAL AI: Oturum devam ediyor.");
      } else {
        localStorage.removeItem(SESSION_KEY);
        showLogin();
      }

    } catch (error) {
      console.error(
        "ZEYDAL AI: Oturum kontrolü başarısız.",
        error
      );

      // Sunucuya ulaşılamıyorsa token'ı hemen silme.
      // Geçici bağlantı sorununda kullanıcıyı dışarı atma.
      showApp();

      window.dispatchEvent(
        new CustomEvent("zeydal:session-unverified")
      );
    }
  }

  // ------------------------------------------
  // ÇIKIŞ DÜĞMESİ
  // ------------------------------------------

  document.addEventListener("click", async (event) => {
    const logoutButton = event.target.closest(
      "[data-zeydal-logout], #logoutButton, #logout-btn, #logoutBtn"
    );

    if (!logoutButton) return;

    event.preventDefault();

    logoutButton.disabled = true;

    try {
      await window.ZEYDAL_AUTH.logout();
      showLogin();

      console.log("ZEYDAL AI: Oturum kapatıldı.");

    } catch (error) {
      console.error("ZEYDAL AI çıkış hatası:", error);

    } finally {
      logoutButton.disabled = false;
    }
  });

  // ------------------------------------------
  // GİRİŞ VE KAYIT SONRASI EKRANI GÜNCELLE
  // ------------------------------------------

  window.addEventListener("zeydal:login-success", () => {
    showApp();
  });

  window.addEventListener("zeydal:register-success", () => {
    showApp();
  });

  // ------------------------------------------
  // SAYFA AÇILDIĞINDA OTURUMU KONTROL ET
  // ------------------------------------------

  document.addEventListener("DOMContentLoaded", () => {
    checkUserSession();
  });

  console.log("ZEYDAL AI: Oturum yönetimi hazır.");

})();

