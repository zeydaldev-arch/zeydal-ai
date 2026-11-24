
let recognition;

function initSpeechToText() {
  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    alert("Tarayıcınız ses tanımayı desteklemiyor.");
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "tr-TR";
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onresult = function (event) {
    const transcript =
      event.results[0][0].transcript;

    const messageInput =
      document.querySelector("#messageInput");

    if (messageInput) {
      messageInput.value = transcript;
    }
  };

  recognition.onerror = function (event) {
    console.error("Ses tanıma hatası:", event.error);
  };
}

function startSpeechToText() {
  if (!recognition) {
    initSpeechToText();
  }

  if (recognition) {
    recognition.start();
  }
}

