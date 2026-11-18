
"use strict";

// ------------------------------------------
// ZEYDAL AI API AYARLARI
// ------------------------------------------

const ZEYDAL_API_URL =
  "https://zeydal-ai-api.zeydal-dev.workers.dev";

const ZEYDAL_SESSION_KEY = "zeydal_ai_session";

// ------------------------------------------
// OTURUM TOKEN'INI AL
// ------------------------------------------

function getZeydalToken() {
  return localStorage.getItem(ZEYDAL_SESSION_KEY);
}

// ------------------------------------------
// API İSTEKLERİ
// ------------------------------------------

async function zeydalRequest(
  action,
  data = {},
  authenticated = false
) {
  const token = getZeydalToken();

  const headers = {
    "Content-Type": "application/json"
  };

  if (authenticated && token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(ZEYDAL_API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      action,
      ...data
    })
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.success === false) {
    throw new Error(
      result.message ||
      result.error ||
      "İşlem başarısız."
    );
  }

  return result;
}

// ------------------------------------------
// YENİ KULLANICI KAYDI
// ------------------------------------------

async function zeydalRegister(email, password) {
  const result = await zeydalRequest("register", {
    email,
    password
  });

  if (result.token) {
    localStorage.setItem(
      ZEYDAL_SESSION_KEY,
      result.token
    );
  }

  return result;
}

// ------------------------------------------
// KULLANICI GİRİŞİ
// ------------------------------------------

async function zeydalLogin(email, password) {
  const result = await zeydalRequest("login", {
    email,
    password
  });

  if (result.token) {
    localStorage.setItem(
      ZEYDAL_SESSION_KEY,
      result.token
    );
  }

  return result;
}

// ------------------------------------------
// OTURUM KONTROLÜ
// ------------------------------------------

async function zeydalCheckSession() {
  const token = getZeydalToken();

  if (!token) {
    return false;
  }

  try {
    // Sunucuda session doğrulama işlemi
    const result = await zeydalRequest(
      "checkSession",
      {},
      true
    );

    return result.success !== false;

  } catch (error) {
    console.warn(
      "ZEYDAL AI oturum kontrolü:",
      error.message
    );

    return false;
  }
}

// ------------------------------------------
// OTURUM KAPATMA
// ------------------------------------------

async function zeydalLogout() {
  try {
    if (getZeydalToken()) {
      await zeydalRequest("logout", {}, true);
    }
  } finally {
    localStorage.removeItem(ZEYDAL_SESSION_KEY);
  }
}

// ------------------------------------------
// GİRİŞ GEREKTİREN API İSTEKLERİ
// ------------------------------------------

async function zeydalAuthenticatedRequest(action, data = {}) {
  if (!getZeydalToken()) {
    throw new Error("Önce giriş yapmalısınız.");
  }

  return await zeydalRequest(action, data, true);
}

// ------------------------------------------
// DİĞER DOSYALARDAN ERİŞİM
// ------------------------------------------

window.ZEYDAL_AUTH = {
  register: zeydalRegister,
  login: zeydalLogin,
  logout: zeydalLogout,
  request: zeydalAuthenticatedRequest,
  checkSession: zeydalCheckSession,

  isLoggedIn: () => Boolean(getZeydalToken())
};

console.log("ZEYDAL AI: Kalıcı oturum sistemi hazır.");
