
(() => {
  "use strict";

  const button = document.getElementById("speech-to-text-button");

  if (!button) {
    console.warn("ZEYDAL AI: Ortak mikrofon düğmesi bulunamadı.");
    return;
  }

  const SYSTEM_NAME = "ZEYDAL AI";
  const CHAT_API_URL =
    "https://zeydal-api.zeydal-dev.workers.dev/api/chat";

  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  const HOLD_DURATION = 550;

  let recognition = null;
  let active = false;
  let listening = false;
  let speaking = false;
  let busy = false;

  let holdTimer = null;
  let holdTriggered = false;
  let pointerDown = false;

  const conversationHistory = [];

  // ------------------------------------------
  // SESLENDİRME METNİNİ TEMİZLE
  // ------------------------------------------

  function prepareSpeechText(text) {
    let speechText = String(text || "");

    speechText = speechText.replace(/```[\s\S]*?```/g, " ");
    speechText = speechText.replace(/<[^>]*>/g, " ");

    speechText = speechText.replace(
      /!?\[([^\]]*)\]\([^)]+\)/g,
      "$1"
    );

    speechText = speechText
      .replace(/\*\*(.*?)\*\*/gs, "$1")
      .replace(/\*(.*?)\*/gs, "$1")
      .replace(/__(.*?)__/gs, "$1")
      .replace(/_(.*?)_/gs, "$1")
      .replace(/`([^`]*)`/g, "$1");

    speechText = speechText.replace(
      /[#*0-9]\uFE0F?\u20E3/gu,
      " "
    );

    speechText = speechText.replace(
      /[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\uFE0E\uFE0F\u200D]/gu,
      " "
    );

    speechText = speechText.replace(
      /(?:[:;=8][-^']?[)(/DPp]|<3)/g,
      " "
    );

    speechText = speechText.replace(
      /Z[\s.,;:_-]*E[\s.,;:_-]*Y[\s.,;:_-]*D[\s.,;:_-]*A[\s.,;:_-]*L/gi,
      "zey-dal"
    );

    speechText = speechText.replace(/\bZEYDAL\b/gi, "zey-dal");
    speechText = speechText.replace(/[*_#~`]/g, " ");

    return speechText.replace(/\s+/g, " ").trim();
  }

  // ------------------------------------------
  // ARAYÜZ VE DURUM
  // ------------------------------------------

  function setButton(text, title) {
    button.textContent = text;

    if (title) {
      button.title = title;
    }
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

  // Diğer mikrofon modülünün sesli görüşmenin durumunu öğrenmesini sağlar.
  window.zeydalIsVoiceActive = function () {
    return active;
  };

  // ------------------------------------------
  // BASILI TUTMA KONTROLÜ
  // ------------------------------------------

  function clearHoldTimer() {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  }

  function handlePointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;

    pointerDown = true;
    holdTriggered = false;

    clearHoldTimer();

    holdTimer = setTimeout(() => {
      if (!pointerDown) return;

      holdTriggered = true;

      // speech-to-text.js tarafından gelen click olayı yok sayılacak.
      window.__zeydalSuppressMicClick = true;

      toggleVoice();
    }, HOLD_DURATION);
  }

  function handlePointerUp() {
    pointerDown = false;
    clearHoldTimer();
  }

  button.addEventListener("pointerdown", handlePointerDown);
  button.addEventListener("pointerup", handlePointerUp);
  button.addEventListener("pointercancel", handlePointerUp);
  button.addEventListener("lostpointercapture", handlePointerUp);

  button.addEventListener("contextmenu", event => {
    event.preventDefault();
  });

  // Uzun basış sonrası oluşabilecek click olayını yakala.
  button.addEventListener("click", event => {
    if (holdTriggered) {
      event.preventDefault();
      event.stopImmediatePropagation();

      holdTriggered = false;
      window.__zeydalSuppressMicClick = false;
    }
  }, true);

  function toggleVoice() {
    if (active) {
      stopVoice();
    } else {
      startVoice();
    }
  }

  // ------------------------------------------
  // SESLİ GÖRÜŞMEYİ BAŞLAT
  // ------------------------------------------

  function startVoice() {
    if (active) return;

    if (!SpeechRecognition) {
      alert("Tarayıcınız ses tanımayı desteklemiyor. Lütfen Chrome kullanın.");
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

    conversationHistory.length = 0;

    recognition = new SpeechRecognition();

    recognition.lang = "tr-TR";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      listening = true;

      if (!busy && !speaking) {
        setButton("🎙", "Sesli görüşme açık. Kapatmak için basılı tut.");
        button.classList.add("recording");
        setStatus("listening");
      }
    };

    recognition.onresult = async event => {
      for (
        let i = event.resultIndex;
        i < event.results.length;
        i++
      ) {
        if (!event.results[i].isFinal) continue;

        const transcript =
          event.results[i][0].transcript.trim();

        if (!transcript || !active || busy || speaking) {
          continue;
        }

        notify("user-transcription", {
          text: transcript
        });

        await sendToZeydal(transcript);
      }
    };

    recognition.onerror = event => {
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

      if (active && !busy && !speaking) {
        restartRecognition();
      }
    };

    try {
      recognition.start();

      setButton("⌛", "Sesli görüşme başlatılıyor...");
      button.classList.add("recording");
      setStatus("connecting");

      notify("connected");

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
  // API'YE MESAJ GÖNDER
  // ------------------------------------------

  async function sendToZeydal(message) {
    if (!active || busy) return;

    busy = true;

    setButton("…", "ZEYDAL AI düşünüyor...");
    setStatus("thinking");

    try {
      conversationHistory.push({
        role: "user",
        content: message
      });

      const messages = conversationHistory.slice(-12);

      const response = await fetch(CHAT_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ messages })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error?.message ||
          result.error ||
          result.message ||
          "ZEYDAL AI API bağlantı hatası."
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
        throw new Error("ZEYDAL AI'den geçerli bir cevap alınamadı.");
      }

      conversationHistory.push({
        role: "assistant",
        content: reply
      });

      notify("assistant-text", { text: reply });

      await speakReply(reply);

    } catch (error) {
      console.error(SYSTEM_NAME + " API hatası:", error);

      notify("error", {
        message: error.message
      });

      alert("ZEYDAL AI cevap veremedi:\n" + error.message);

      busy = false;

      if (active) {
        setButton("🎙", "Sesli görüşme açık. Kapatmak için basılı tut.");
        setStatus("listening");
        restartRecognition();
      }
    }
  }

  // ------------------------------------------
  // CEVABI SESLENDİR
  // ------------------------------------------

  function speakReply(text) {
    return new Promise(resolve => {
      if (!active) {
        busy = false;
        resolve();
        return;
      }

      speaking = true;
      busy = true;

      if (recognition) {
        try {
          recognition.stop();
        } catch (error) {
          console.warn("Mikrofon durdurulamadı.", error);
        }
      }

      listening = false;
      window.speechSynthesis.cancel();

      const speechText = prepareSpeechText(text);

      if (!speechText) {
        speaking = false;
        busy = false;
        resolve();

        if (active) {
          setButton("🎙", "Sesli görüşme açık. Kapatmak için basılı tut.");
          setTimeout(restartRecognition, 300);
        }

        return;
      }

      const utterance = new SpeechSynthesisUtterance(speechText);

      utterance.lang = "tr-TR";
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;

      const voices = window.speechSynthesis.getVoices();

      const turkishVoice = voices.find(voice =>
        voice.lang &&
        voice.lang.toLowerCase().startsWith("tr")
      );

      if (turkishVoice) {
        utterance.voice = turkishVoice;
      }

      utterance.onstart = () => {
        if (!active) return;

        setButton("🔊", "ZEYDAL AI konuşuyor. Kapatmak için basılı tut.");
        setStatus("speaking");
      };

      utterance.onend = () => {
        speaking = false;
        busy = false;

        resolve();

        if (active) {
          setButton("🎙", "Sesli görüşme açık. Kapatmak için basılı tut.");
          setStatus("listening");

          setTimeout(restartRecognition, 500);
        }
      };

      utterance.onerror = event => {
        console.error(SYSTEM_NAME + " seslendirme hatası:", event);

        speaking = false;
        busy = false;

        resolve();

        if (active) {
          setButton("🎙", "Sesli görüşme açık. Kapatmak için basılı tut.");
          setStatus("listening");

          setTimeout(restartRecognition, 500);
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

    button.classList.remove("recording");

    setButton(
      "🎙",
      "Kısa bas: konuşmayı yazıya çevir | Basılı tut: sesli görüşme"
    );

    setStatus("disconnected");
    notify("disconnected");

    console.log(SYSTEM_NAME + ": Sesli görüşme kapatıldı.");
  }

  console.log(SYSTEM_NAME + ": Ortak mikrofon sistemi hazır.");
})();
