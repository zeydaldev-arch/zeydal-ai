
(() => {
  "use strict";

  // ==========================================
  // ZEYDAL AI - SESLİ ASİSTAN
  // Genel sürüm
  // ==========================================

  const SYSTEM_NAME = "ZEYDAL AI";

  const CHAT_API_URL =
    "https://zeydal-api.zeydal-dev.workers.dev/api/chat";

  const button = document.getElementById("zeydal-voice-toggle");
  const statusElement = document.getElementById("zeydal-voice-status");

  if (!button) {
    console.warn(SYSTEM_NAME + ": Mikrofon düğmesi bulunamadı.");
    return;
  }

  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  let recognition = null;
  let active = false;
  let listening = false;
  let speaking = false;
  let busy = false;
  let recognitionShouldRestart = false;

  const conversationHistory = [];

  // ==========================================
  // OLAYLAR VE ARAYÜZ
  // ==========================================

  function notify(type, detail = {}) {
    window.dispatchEvent(
      new CustomEvent("zeydal:voice", {
        detail: {
          type,
          ...detail
        }
      })
    );
  }

  function setButton(text, disabled = false) {
    button.textContent = text;
    button.disabled = disabled;
  }

  function setStatus(status, message = "") {
    if (statusElement) {
      statusElement.textContent = message;
    }

    notify("status", {
      status,
      message
    });
  }

  // ==========================================
  // MİKROFONU BAŞLAT
  // ==========================================

  function startVoice() {
    if (active) return;

    if (!SpeechRecognition) {
      alert(
        "Tarayıcınız ses tanımayı desteklemiyor. " +
        "Android telefonda Chrome kullanmayı deneyin."
      );
      return;
    }

    if (!window.speechSynthesis) {
      alert("Tarayıcınız seslendirme özelliğini desteklemiyor.");
      return;
    }

    active = true;
    busy = false;
    speaking = false;
    listening = false;
    recognitionShouldRestart = true;

    conversationHistory.length = 0;

    recognition = new SpeechRecognition();

    recognition.lang = "tr-TR";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      listening = true;

      if (active && !busy && !speaking) {
        setButton("🎙️", false);
        setStatus("listening", "Seni dinliyorum...");
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

        // Kullanıcının söylediğini ekrana yaz.
        notify("user-transcription", {
          text: transcript
        });

        await sendToZeydal(transcript);
      }
    };

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

        alert("Lütfen tarayıcı ayarlarından mikrofon izni verin.");
        return;
      }

      if (event.error === "audio-capture") {
        notify("error", {
          message: "Mikrofon bulunamadı."
        });

        stopVoice();
      }
    };

    recognition.onend = () => {
      listening = false;

      if (
        active &&
        recognitionShouldRestart &&
        !busy &&
        !speaking
      ) {
        restartRecognition();
      }
    };

    try {
      setButton("⏳", true);
      setStatus("connecting", "Mikrofon açılıyor...");

      recognition.start();

    } catch (error) {
      console.error(error);
      stopVoice();

      alert(
        "ZEYDAL AI mikrofonu başlatamadı: " +
        error.message
      );
    }
  }

  // ==========================================
  // DİNLEMEYİ YENİDEN BAŞLAT
  // ==========================================

  function restartRecognition() {
    if (
      !active ||
      busy ||
      speaking ||
      listening ||
      !recognition ||
      !recognitionShouldRestart
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

  // ==========================================
  // API BAĞLANTISI
  // ==========================================

  async function sendToZeydal(message) {
    if (!active || busy) return;

    busy = true;

    setButton("⏳", true);
    setStatus("thinking", "ZEYDAL AI düşünüyor...");

    try {
      conversationHistory.push({
        role: "user",
        content: message
      });

      const response = await fetch(CHAT_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: conversationHistory.slice(-12)
        })
      });

      let result;

      try {
        result = await response.json();
      } catch {
        throw new Error("Sunucudan geçerli yanıt alınamadı.");
      }

      if (!response.ok) {
        throw new Error(
          result.error?.message ||
          result.error ||
          result.message ||
          "API bağlantı hatası."
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
        throw new Error("ZEYDAL AI geçerli bir cevap vermedi.");
      }

      conversationHistory.push({
        role: "assistant",
        content: reply
      });

      // Cevabı sohbet ekranına gönder.
      notify("assistant-text", {
        text: reply
      });

      // Cevabı seslendir.
      await speakReply(reply);

    } catch (error) {
      console.error(SYSTEM_NAME + " API hatası:", error);

      notify("error", {
        message: error.message
      });

      busy = false;

      if (active) {
        setButton("🎙️", false);
        setStatus("listening", "Seni dinliyorum...");
        restartRecognition();
      }
    }
  }

  // ==========================================
  // CEVABI SESLENDİR
  // ==========================================

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

      listening = false;

      window.speechSynthesis.cancel();

      const utterance =
        new SpeechSynthesisUtterance(text);

      utterance.lang = "tr-TR";
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;

      const voices = window.speechSynthesis.getVoices();

      const turkishVoice = voices.find(voice =>
        voice.lang.toLowerCase().startsWith("tr")
      );

      if (turkishVoice) {
        utterance.voice = turkishVoice;
      }

      utterance.onstart = () => {
        if (!active) return;

        setButton("🔊", false);
        setStatus("speaking", "ZEYDAL AI konuşuyor...");
      };

      utterance.onend = () => {
        speaking = false;
        busy = false;
        resolve();

        if (active) {
          setButton("🎙️", false);
          setStatus("listening", "Seni dinliyorum...");

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
          setButton("🎙️", false);
          setStatus("listening", "Seni dinliyorum...");
          restartRecognition();
        }
      };

      window.speechSynthesis.speak(utterance);
    });
  }

  // ==========================================
  // SESLİ GÖRÜŞMEYİ DURDUR
  // ==========================================

  function stopVoice() {
    if (!active && !recognition) return;

    active = false;
    listening = false;
    speaking = false;
    busy = false;
    recognitionShouldRestart = false;

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

    setButton("🎙️", false);
    setStatus("disconnected", "Sesli görüşme sona erdi.");

    notify("disconnected");

    console.log(
      SYSTEM_NAME + ": Sesli görüşme kapatıldı."
    );
  }

  // ==========================================
  // MİKROFON DÜĞMESİ
  // ==========================================

  button.addEventListener("click", () => {
    if (active) {
      stopVoice();
    } else {
      startVoice();
    }
  });

  console.log(
    SYSTEM_NAME + ": Sesli asistan hazır."
  );

})();
