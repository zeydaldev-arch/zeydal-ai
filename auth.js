
const ZEYDAL_API_URL = "https://zeydal-ai-api.zeydal-dev.workers.dev";

// Kullanıcı oturumunu saklama
const ZEYDAL_SESSION_KEY = "zeydal_ai_session";

// API istekleri
async function zeydalRequest(action, data = {}, authenticated = false) {
  const token = sessionStorage.getItem(ZEYDAL_SESSION_KEY);

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
    throw new Error(result.message || result.error || "İşlem başarısız.");
  }

  return result;
}

// Yeni kullanıcı kaydı
async function zeydalRegister(email, password) {
  const result = await zeydalRequest("register", {
    email,
    password
  });

  if (result.token) {
    sessionStorage.setItem(ZEYDAL_SESSION_KEY, result.token);
  }

  return result;
}

// Kullanıcı girişi
async function zeydalLogin(email, password) {
  const result = await zeydalRequest("login", {
    email,
    password
  });

  if (result.token) {
    sessionStorage.setItem(ZEYDAL_SESSION_KEY, result.token);
  }

  return result;
}

// Oturum kapatma
async function zeydalLogout() {
  try {
    await zeydalRequest("logout", {}, true);
  } finally {
    sessionStorage.removeItem(ZEYDAL_SESSION_KEY);
  }
}

// Giriş gerektiren API istekleri
async function zeydalAuthenticatedRequest(action, data = {}) {
  if (!sessionStorage.getItem(ZEYDAL_SESSION_KEY)) {
    throw new Error("Önce giriş yapmalısınız.");
  }

  return await zeydalRequest(action, data, true);
}

// Diğer dosyalardan erişim
window.ZEYDAL_AUTH = {
  register: zeydalRegister,
  login: zeydalLogin,
  logout: zeydalLogout,
  request: zeydalAuthenticatedRequest,
  isLoggedIn: () => Boolean(
    sessionStorage.getItem(ZEYDAL_SESSION_KEY)
  )
};

