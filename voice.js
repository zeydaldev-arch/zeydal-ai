
(() => {
  "use strict";

  const button = document.getElementById("zeydal-voice-toggle");

  if (!button) {
    console.warn("ZEYDAL AI: Sesli görüşme düğmesi bulunamadı.");
    return;
  }

  // ------------------------------------------
  // AYARLAR
  // ------------------------------------------

  const SYSTEM_NAME = "ZEYDAL AI";

  const CHAT_API_URL =
    "https://zeydal-api.zeydal-dev.workers.dev/api/chat";

  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  let recognition = null;

  let active = false;
  let listening = false;
  let speaking = false;
  let busy = false;

  const conversationHistory = [];

  // ------------------------------------------
  // SESLENDİRME METNİNİ DÜZENLE
  // ------------------------------------------

  function prepareSpeechText(text) {
    return text.replace(
      /\bZ[\s.,-]*E[\s.,-]*Y[\s.,-]*D[\s.,-]*A[\s.,-]*L\b/gi,
      "Zeydal"
    );
  }

  // ------------------------------------------
  // ARAYÜZ
  // ------------------------------------------

  function setButton(text, disabled = false) {
    button.textContent = text;
    button.disabled = disabled;
  }

  function notify(type, detail = {}) {
    window.dispatchEvent(
      new CustomEvent("zeydal:voice", {
        detail: { type, ...detail }
      })
    );
  }

  function setStatus(status) {
    notify("status", { status });
  }

  // ------------------------------------------
  // DÜĞME
  // ------------------------------------------

  button.addEventListener("click", () => {
    if (active) {
      stopVoice();
    } else {
      startVoice();
    }
  });

  // ------------------------------------------
  // SESLİ GÖRÜŞMEYİ BAŞLAT
  // ------------------------------------------

  function startVoice() {
    if (active) return;

    if (!SpeechRecognition) {
      alert(
        "Tarayıcınız ses tanımayı desteklemiyor. " +
        "Lütfen Android telefonda Chrome kullanın."
      );
      return;
    }

    if (!window.speechSynthesis) {
      alert(
        "Tarayıcınız seslendirme özelliğini desteklemiyor."
      );
      return;
    }

    active = true;
    busy = false;
    speaking = false;

    conversationHistory.length = 0;

    recognition = new SpeechRecognition();

    recognition.lang = "tr-TR";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    // ------------------------------------------
    // KONUŞMA ALGILAMA
    // ------------------------------------------

    recognition.onstart = () => {
      listening = true;

      if (!busy && !speaking) {
        setButton("🎙️ Seni dinliyorum...");
        setStatus("listening");
      }
    };

    recognition.onresult = async (event) => {
      for (
        let i = event.resultIndex;
        i < event.results.length;
        i++
      ) {
        if (!event.results[i].isFinal) continue;

        const transcript =
          event.results[i][0].transcript.trim();

        if (!transcript || !active || busy) continue;

        notify("user-transcription", {
          text: transcript
        });

        await sendToZeydal(transcript);
      }
    };

    // ------------------------------------------
    // HATA YÖNETİMİ
    // ------------------------------------------

    recognition.onerror = (event) => {
      console.error(
        SYSTEM_NAME + " konuşma tanıma hatası:",
        event.error
      );

      if (event.error === "not-allowed") {
        notify("error", {
          message: "Mikrofon izni verilmedi."
        });

        stopVoice();

        alert(
          "Lütfen tarayıcı ayarlarından mikrofon izni verin."
        );

        return;
      }

      if (event.error === "audio-capture") {
        notify("error", {
          message: "Mikrofon bulunamadı."
        });

        stopVoice();
      }
    };

    // ------------------------------------------
    // DİNLEME BİTTİĞİNDE
    // ------------------------------------------

    recognition.onend = () => {
      listening = false;

      if (
        active &&
        !busy &&
        !speaking
      ) {
        restartRecognition();
      }
    };

    try {
      recognition.start();

      setButton("🎙️ Bağlanıyor...", true);
      setStatus("connecting");

      setTimeout(() => {
        if (!active) return;

        setButton("🎙️ Seni dinliyorum...");
        setStatus("listening");

        notify("connected");
      }, 500);

    } catch (error) {
      console.error(error);

      stopVoice();

      alert(
        "ZEYDAL AI mikrofonu başlatamadı: " +
        error.message
      );
    }
  }

  // ------------------------------------------
  // DİNLEMEYİ YENİDEN BAŞLAT
  // ------------------------------------------

  function restartRecognition() {
    if (
      !active ||
      busy ||
      speaking ||
      listening ||
      !recognition
    ) {
      return;
    }

    try {
      recognition.start();
    } catch (error) {
      console.warn(
        SYSTEM_NAME + ": Dinleme yeniden başlatılamadı.",
        error
      );
    }
  }

  // ------------------------------------------
  // GEMINI API'YE MESAJ GÖNDER
  // ------------------------------------------

  async function sendToZeydal(message) {
    if (!active || busy) return;

    busy = true;

    setButton("ZEYDAL AI düşünüyor...");
    setStatus("thinking");

    try {
      conversationHistory.push({
        role: "user",
        content: message
      });

      const messages =
        conversationHistory.slice(-12);

      const response = await fetch(CHAT_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: messages
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error?.message ||
          result.error ||
          result.message ||
          "Gemini API bağlantı hatası."
        );
      }

      const reply =
        result.reply ||
        result.data?.reply ||
        result.response ||
        result.text ||
        result.data?.text ||
        result.candidates?.[0]?.content?.parts
          ?.map(part => part.text || "")
          .join("") ||
        "";

      if (!reply || typeof reply !== "string") {
        throw new Error(
          "ZEYDAL AI'den geçerli bir cevap alınamadı."
        );
      }

      conversationHistory.push({
        role: "assistant",
        content: reply
      });

      notify("assistant-text", {
        text: reply
      });

      await speakReply(reply);

    } catch (error) {
      console.error(
        SYSTEM_NAME + " API hatası:",
        error
      );

      notify("error", {
        message: error.message
      });

      alert(
        "ZEYDAL AI cevap veremedi:\n" +
        error.message
      );

      busy = false;

      if (active) {
        setButton("🎙️ Seni dinliyorum...");
        setStatus("listening");

        restartRecognition();
      }
    }
  }

  // ------------------------------------------
  // ZEYDAL AI CEVABINI SESLENDİR
  // ------------------------------------------

  function speakReply(text) {
    return new Promise((resolve) => {
      if (!active) {
        busy = false;
        resolve();
        return;
      }

      speaking = true;

      if (recognition && listening) {
        try {
          recognition.stop();
        } catch (_) {}
      }

      window.speechSynthesis.cancel();

      const speechText = prepareSpeechText(text);

      const utterance =
        new SpeechSynthesisUtterance(speechText);

      utterance.lang = "tr-TR";
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;

      const voices =
        window.speechSynthesis.getVoices();

      const turkishVoice = voices.find(voice =>
        voice.lang.toLowerCase().startsWith("tr")
      );

      if (turkishVoice) {
        utterance.voice = turkishVoice;
      }

      utterance.onstart = () => {
        if (!active) return;

        setButton("🔊 ZEYDAL AI konuşuyor...");
        setStatus("speaking");
      };

      utterance.onend = () => {
        speaking = false;
        busy = false;

        resolve();

        if (active) {
          setButton("🎙️ Seni dinliyorum...");
          setStatus("listening");

          setTimeout(() => {
            restartRecognition();
          }, 300);
        }
      };

      utterance.onerror = (event) => {
        console.error(
          SYSTEM_NAME + " seslendirme hatası:",
          event
        );

        speaking = false;
        busy = false;

        resolve();

        if (active) {
          restartRecognition();
        }
      };

      window.speechSynthesis.speak(utterance);
    });
  }

  // ------------------------------------------
  // SESLİ GÖRÜŞMEYİ DURDUR
  // ------------------------------------------

  function stopVoice() {
    active = false;
    listening = false;
    speaking = false;
    busy = false;

    if (recognition) {
      try {
        recognition.onend = null;
        recognition.stop();
      } catch (_) {}

      recognition = null;
    }

    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    setButton("🎙️ Sesli Görüşme");
    setStatus("disconnected");

    notify("disconnected");

    console.log(
      SYSTEM_NAME + ": Ücretsiz sesli görüşme kapatıldı."
    );
  }

  console.log(
    SYSTEM_NAME + ": Ücretsiz tarayıcı ses sistemi hazır."
  );

})();
