
(() => {
  "use strict";

  const button = document.getElementById("zeydal-voice-toggle");

  if (!button) {
    console.warn("ZEYDAL AI Personal: Ses düğmesi bulunamadı.");
    return;
  }

  const SYSTEM_NAME = "ZEYDAL AI Personal";

  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  let recognition = null;
  let active = false;
  let listening = false;
  let speaking = false;
  let busy = false;

  const conversationHistory = [];

  function notify(type, detail = {}) {
    window.dispatchEvent(
      new CustomEvent("zeydal:voice", {
        detail: { type, ...detail }
      })
    );
  }

  function setButton(text, disabled = false) {
    button.textContent = text;
    button.disabled = disabled;
  }

  function prepareSpeechText(text) {
    let speechText = String(text);

    speechText = speechText.replace(/<[^>]*>/g, " ");

    speechText = speechText
      .replace(/\*\*(.*?)\*\*/gs, "$1")
      .replace(/\*(.*?)\*/gs, "$1")
      .replace(/__(.*?)__/gs, "$1")
      .replace(/_(.*?)_/gs, "$1")
      .replace(/`([^`]*)`/g, "$1");

    speechText = speechText.replace(
      /Z[\s.,;:_-]*E[\s.,;:_-]*Y[\s.,;:_-]*D[\s.,;:_-]*A[\s.,;:_-]*L/gi,
      "zey-dal"
    );

    speechText = speechText.replace(/\bZEYDAL\b/gi, "zey-dal");
    speechText = speechText.replace(/[*_#~`]/g, " ");

    return speechText.replace(/\s+/g, " ").trim();
  }

  function startVoice() {
    if (active) return;

    if (
      !window.ZEYDAL_LOCAL_AI ||
      !window.ZEYDAL_LOCAL_AI.getStatus().ready
    ) {
      notify("error", {
        message: "Önce yerel AI modelini başlatmalısın."
      });

      alert("Önce ZEYDAL AI modelinin yüklenmesini beklemelisin.");
      return;
    }

    if (!SpeechRecognition) {
      alert("Tarayıcın ses tanımayı desteklemiyor. Chrome kullanmayı dene.");
      return;
    }

    if (!window.speechSynthesis) {
      alert("Tarayıcın seslendirme özelliğini desteklemiyor.");
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

    recognition.onstart = () => {
      listening = true;

      if (!busy && !speaking) {
        setButton("🎙️ Seni dinliyorum...");
        notify("status", { status: "listening" });
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

        if (!transcript || !active || busy) continue;

        notify("user-transcription", {
          text: transcript
        });

        await sendToZeydal(transcript);
      }
    };

    recognition.onerror = event => {
      console.error(SYSTEM_NAME + " ses tanıma hatası:", event.error);

      if (event.error === "not-allowed") {
        notify("error", {
          message: "Mikrofon izni verilmedi."
        });

        stopVoice();
        alert("Lütfen tarayıcı ayarlarından mikrofon izni ver.");
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

      setButton("🎙️ Bağlanıyor...", true);
      notify("status", { status: "connecting" });

      setTimeout(() => {
        if (!active) return;

        setButton("🎙️ Seni dinliyorum...");
        button.disabled = false;

        notify("connected");
        notify("status", { status: "listening" });
      }, 500);

    } catch (error) {
      console.error(error);
      stopVoice();
      alert("Mikrofon başlatılamadı: " + error.message);
    }
  }

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
      console.warn("Ses dinleme yeniden başlatılamadı:", error);
    }
  }

  async function sendToZeydal(message) {
    if (!active || busy) return;

    busy = true;

    setButton("ZEYDAL AI düşünüyor...");
    notify("status", { status: "thinking" });

    try {
      conversationHistory.push({
        role: "user",
        content: message
      });

      const reply = await window.ZEYDAL_LOCAL_AI.chat(
        conversationHistory.slice(-11)
      );

      if (!active) return;

      conversationHistory.push({
        role: "assistant",
        content: reply
      });

      while (conversationHistory.length > 12) {
        conversationHistory.shift();
      }

      notify("assistant-text", {
        text: reply
      });

      await speakReply(reply);

    } catch (error) {
      console.error(SYSTEM_NAME + " yerel AI hatası:", error);

      notify("error", {
        message: error.message
      });

      busy = false;

      if (active) {
        setButton("🎙️ Seni dinliyorum...");
        notify("status", { status: "listening" });
        restartRecognition();
      }
    }
  }

  function speakReply(text) {
    return new Promise(resolve => {
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

      const utterance = new SpeechSynthesisUtterance(
        prepareSpeechText(text)
      );

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

        setButton("🔊 ZEYDAL AI konuşuyor...");
        notify("status", { status: "speaking" });
      };

      utterance.onend = () => {
        speaking = false;
        busy = false;
        resolve();

        if (active) {
          setButton("🎙️ Seni dinliyorum...");
          notify("status", { status: "listening" });

          setTimeout(restartRecognition, 300);
        }
      };

      utterance.onerror = error => {
        console.error("Seslendirme hatası:", error);

        speaking = false;
        busy = false;
        resolve();

        if (active) restartRecognition();
      };

      window.speechSynthesis.speak(utterance);
    });
  }

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
    notify("status", { status: "disconnected" });
    notify("disconnected");
  }

  button.addEventListener("click", () => {
    if (active) {
      stopVoice();
    } else {
      startVoice();
    }
  });

  console.log(SYSTEM_NAME + ": Yerel sesli görüşme altyapısı hazır.");
})();
