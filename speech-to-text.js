
"use strict";

document.addEventListener("DOMContentLoaded", function () {

  const microphoneButton = document.getElementById(
    "speech-to-text-button"
  );

  const chatInput = document.getElementById("chat-input");

  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (!microphoneButton || !chatInput) {
    console.error(
      "ZEYDAL AI: Mikrofon düğmesi veya mesaj alanı bulunamadı."
    );
    return;
  }

  if (!SpeechRecognition) {
    microphoneButton.disabled = true;
    microphoneButton.title =
      "Tarayıcınız konuşma tanımayı desteklemiyor.";

    console.error(
      "ZEYDAL AI: Bu tarayıcı Speech Recognition desteklemiyor."
    );
    return;
  }

  const recognition = new SpeechRecognition();

  recognition.lang = "tr-TR";
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let isListening = false;
  let finalTranscript = "";

  microphoneButton.addEventListener("click", function () {

    if (isListening) {
      recognition.stop();
      return;
    }

    finalTranscript = "";

    try {
      recognition.start();
    } catch (error) {
      console.error(
        "ZEYDAL AI: Mikrofon başlatılamadı.",
        error
      );
    }
  });

  recognition.onstart = function () {

    isListening = true;

    microphoneButton.textContent = "⏹";
    microphoneButton.classList.add("recording");

    microphoneButton.title = "Dinlemeyi durdur";

    console.log("ZEYDAL AI: Mikrofon dinliyor.");
  };

  recognition.onresult = function (event) {

    let interimTranscript = "";

    for (
      let i = event.resultIndex;
      i < event.results.length;
      i++
    ) {

      const transcript =
        event.results[i][0].transcript;

      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }

    chatInput.value =
      finalTranscript + interimTranscript;

    chatInput.dispatchEvent(
      new Event("input", {
        bubbles: true
      })
    );
  };

  recognition.onerror = function (event) {

    console.error(
      "ZEYDAL AI ses tanıma hatası:",
      event.error
    );

    if (event.error === "not-allowed") {
      alert("Mikrofon kullanımı için izin vermen gerekiyor.");
    }

    if (event.error === "no-speech") {
      console.log("Herhangi bir konuşma algılanmadı.");
    }

    if (event.error === "network") {
      console.log("Ses tanıma sırasında ağ hatası oluştu.");
    }
  };

  recognition.onend = function () {

    isListening = false;

    microphoneButton.textContent = "🎙";
    microphoneButton.classList.remove("recording");

    microphoneButton.title =
      "Konuşmayı yazıya çevir";

    console.log("ZEYDAL AI: Ses dinleme sona erdi.");
  };

});
