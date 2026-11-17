
(() => {
  "use strict";

  const button = document.getElementById("zeydal-voice-toggle");

  if (!button) {
    console.warn("ZEYDAL AI: Sesli görüşme düğmesi bulunamadı.");
    return;
  }

  // --------------------------------------------------
  // AYARLAR
  // --------------------------------------------------

  const CONFIG = {
    model: "models/gemini-3.1-flash-live-preview",
    voiceName: "Aoede",
    inputSampleRate: 16000,
    outputSampleRate: 24000,
    processorBufferSize: 4096
  };

  const SYSTEM_INSTRUCTION = `
Sen ZEYDAL AI adlı yapay zekâ asistanısın.

Kullanıcıyla doğal, samimi, anlaşılır ve akıcı Türkçe konuş.
Bir insanla gerçek zamanlı sohbet ediyormuş gibi cevap ver.
Kullanıcının sözünü dikkatle dinle ve sorusunun amacını anlamaya çalış.
Gereksiz uzun cevaplar verme; gerektiğinde ayrıntılı açıklama yap.
Kullanıcı sözünü bitirmeden cevap vermeye çalışma.
Kullanıcı araya girerse konuşmanı kes ve onu dinle.
Bilmediğin konularda bilgi uydurma.
Kullanıcıya her zaman saygılı ve yardımcı ol.
Kendini ZEYDAL AI olarak tanıt.
`;

  // --------------------------------------------------
  // DURUM DEĞİŞKENLERİ
  // --------------------------------------------------

  let websocket = null;
  let microphoneStream = null;
  let audioContext = null;

  let microphoneSource = null;
  let processor = null;
  let silentGain = null;

  let active = false;
  let starting = false;
  let stopping = false;

  let nextPlayTime = 0;
  let turnCompleted = false;

  const playingSources = new Set();

  // --------------------------------------------------
  // ARAYÜZ
  // --------------------------------------------------

  function setButton(text, disabled = false) {
    button.textContent = text;
    button.disabled = disabled;
  }

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

  function setStatus(status) {
    notify("status", { status });
  }

  // --------------------------------------------------
  // DÜĞME
  // --------------------------------------------------

  button.addEventListener("click", async () => {
    if (active || starting) {
      stopVoice();
      return;
    }

    await startVoice();
  });

  // --------------------------------------------------
  // SESLİ GÖRÜŞMEYİ BAŞLAT
  // --------------------------------------------------

  async function startVoice() {
    if (starting || active) return;

    starting = true;
    stopping = false;

    setButton("Bağlanıyor...", true);
    setStatus("connecting");

    try {
      if (!window.zeydalRequestVoiceToken) {
        throw new Error(
          "Ses bağlantısı için giriş fonksiyonu bulunamadı."
        );
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Tarayıcı mikrofon kullanımını desteklemiyor."
        );
      }

      // Mikrofon izni al
      microphoneStream =
        await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });

      // Ses sistemi
      audioContext = new (
        window.AudioContext ||
        window.webkitAudioContext
      )();

      await audioContext.resume();

      // Sunucudan geçici erişim belirteci al
      const tokenResult =
        await window.zeydalRequestVoiceToken();

      const token =
        typeof tokenResult === "string"
          ? tokenResult
          : tokenResult?.token || tokenResult?.name;

      if (!token) {
        throw new Error(
          "Ses bağlantısı için geçerli oturum belirteci alınamadı."
        );
      }

      // WebSocket bağlantısı
      const url =
        "wss://generativelanguage.googleapis.com/ws/" +
        "google.ai.generativelanguage.v1beta.GenerativeService." +
        "BidiGenerateContentConstrained?access_token=" +
        encodeURIComponent(token);

      const socket = new WebSocket(url);
      websocket = socket;

      socket.onopen = () => {
        if (websocket !== socket || stopping) return;

        console.log("ZEYDAL AI: WebSocket bağlantısı kuruldu.");

        socket.send(JSON.stringify({
          setup: {
            model: CONFIG.model,

            generationConfig: {
              responseModalities: ["AUDIO"],

              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: CONFIG.voiceName
                  }
                }
              }
            },

            systemInstruction: {
              parts: [
                {
                  text: SYSTEM_INSTRUCTION
                }
              ]
            },

            inputAudioTranscription: {},
            outputAudioTranscription: {}
          }
        }));
      };

      // ------------------------------------------------
      // SUNUCUDAN GELEN MESAJLAR
      // ------------------------------------------------

      socket.onmessage = async (event) => {
        if (websocket !== socket || stopping) return;

        try {
          const rawData =
            event.data instanceof Blob
              ? await event.data.text()
              : event.data;

          const message = JSON.parse(rawData);

          console.log(
            "ZEYDAL Live mesajı:",
            Object.keys(message)
          );

          // Kurulum tamamlandı
          if (message.setupComplete) {
            active = true;
            starting = false;

            setButton("🔴 Görüşmeyi Bitir");
            setStatus("listening");

            startMicrophone();

            console.log(
              "ZEYDAL AI: Sesli görüşme başladı."
            );

            notify("connected");
          }

          // Sunucu hatası
          if (message.error) {
            throw new Error(
              message.error.message ||
              "Bilinmeyen ses bağlantısı hatası."
            );
          }

          const content = message.serverContent;

          if (!content) return;

          // Kullanıcı konuşurken oluşan metin
          if (content.inputTranscription?.text) {
            notify("user-transcription", {
              text: content.inputTranscription.text
            });
          }

          if (content.interimInputTranscription?.text) {
            notify("user-interim-transcription", {
              text: content.interimInputTranscription.text
            });
          }

          // ZEYDAL AI konuşmasının metni
          if (content.outputTranscription?.text) {
            notify("assistant-transcription", {
              text: content.outputTranscription.text
            });
          }

          // Kullanıcı araya girerse mevcut sesi kes
          if (content.interrupted) {
            clearPlayback();

            turnCompleted = false;

            if (active) {
              setButton("🎙️ Seni dinliyorum...");
              setStatus("listening");
            }
          }

          // Sesli cevap parçaları
          const parts =
            content.modelTurn?.parts || [];

          let receivedAudio = false;

          for (const part of parts) {
            if (part.inlineData?.data) {
              receivedAudio = true;

              setButton("🔊 ZEYDAL cevap veriyor...");
              setStatus("speaking");

              playAudio(part.inlineData.data);
            }

            if (part.text) {
              notify("assistant-text", {
                text: part.text
              });
            }
          }

          // Model yanıtını tamamladı
          if (content.turnComplete) {
            turnCompleted = true;

            if (playingSources.size === 0 && active) {
              setButton("🎙️ Seni dinliyorum...");
              setStatus("listening");
            }
          }

          if (receivedAudio) {
            console.log(
              "ZEYDAL AI: Sesli cevap alındı."
            );
          }

        } catch (error) {
          console.error(
            "ZEYDAL mesaj işleme hatası:",
            error
          );

          if (websocket === socket) {
            stopVoice();
            alert(
              "ZEYDAL AI ses hatası: " + error.message
            );
          }
        }
      };

      // ------------------------------------------------
      // BAĞLANTI HATALARI
      // ------------------------------------------------

      socket.onerror = (event) => {
        console.error(
          "ZEYDAL WebSocket hatası:",
          event
        );

        if (websocket === socket && !stopping) {
          stopVoice();

          alert(
            "Ses bağlantısında hata oluştu. " +
            "Lütfen tekrar deneyin."
          );
        }
      };

      socket.onclose = (event) => {
        console.log(
          "ZEYDAL WebSocket kapandı:",
          event.code,
          event.reason
        );

        if (websocket === socket && !stopping) {
          stopVoice();
        }
      };

    } catch (error) {
      console.error(
        "ZEYDAL ses başlatma hatası:",
        error
      );

      stopVoice();

      alert(
        "Sesli görüşme başlatılamadı: " +
        error.message
      );
    }
  }

  // --------------------------------------------------
  // MİKROFON
  // --------------------------------------------------

  function startMicrophone() {
    if (
      !audioContext ||
      !microphoneStream ||
      !websocket ||
      websocket.readyState !== WebSocket.OPEN
    ) {
      throw new Error(
        "Mikrofon başlatılamadı."
      );
    }

    microphoneSource =
      audioContext.createMediaStreamSource(
        microphoneStream
      );

    processor =
      audioContext.createScriptProcessor(
        CONFIG.processorBufferSize,
        1,
        1
      );

    // Mikrofon sesini hoparlöre doğrudan göndermiyoruz.
    silentGain = audioContext.createGain();
    silentGain.gain.value = 0;

    let microphoneDebugLogged = false;

    processor.onaudioprocess = (event) => {
      if (
        !active ||
        stopping ||
        !websocket ||
        websocket.readyState !== WebSocket.OPEN
      ) {
        return;
      }

      const input =
        event.inputBuffer.getChannelData(0);

      const samples = resampleAudio(
        input,
        audioContext.sampleRate,
        CONFIG.inputSampleRate
      );

      const pcm = new Int16Array(samples.length);

      for (let i = 0; i < samples.length; i++) {
        const value = Math.max(
          -1,
          Math.min(1, samples[i])
        );

        pcm[i] =
          value < 0
            ? value * 32768
            : value * 32767;
      }

      const bytes = new Uint8Array(pcm.buffer);

      const binary = bytesToBinary(bytes);

      // Gerçek zamanlı mikrofon verisini gönder
      websocket.send(JSON.stringify({
        realtimeInput: {
          audio: {
            mimeType: "audio/pcm;rate=16000",
            data: btoa(binary)
          }
        }
      }));

      // İlk mikrofon paketini kontrol et
      if (!microphoneDebugLogged) {
        let peak = 0;

        for (let i = 0; i < samples.length; i++) {
          peak = Math.max(
            peak,
            Math.abs(samples[i])
          );
        }

        console.log(
          "ZEYDAL mikrofon testi:",
          {
            paket: pcm.length,
            sesSeviyesi: peak
          }
        );

        microphoneDebugLogged = true;
      }
    };

    microphoneSource.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(audioContext.destination);

    console.log("ZEYDAL mikrofonu aktif.");
  }

  // --------------------------------------------------
  // SES DÖNÜŞÜMÜ
  // --------------------------------------------------

  function resampleAudio(input, inputRate, outputRate) {
    if (inputRate === outputRate) {
      return input;
    }

    const ratio = inputRate / outputRate;

    const length = Math.floor(
      input.length / ratio
    );

    const output = new Float32Array(length);

    for (let i = 0; i < length; i++) {
      const position = i * ratio;
      const index = Math.floor(position);
      const fraction = position - index;

      const first = input[index] || 0;

      const second =
        input[index + 1] !== undefined
          ? input[index + 1]
          : first;

      output[i] =
        first + (second - first) * fraction;
    }

    return output;
  }

  function bytesToBinary(bytes) {
    const chunkSize = 0x8000;
    let binary = "";

    for (
      let i = 0;
      i < bytes.length;
      i += chunkSize
    ) {
      const chunk = bytes.subarray(
        i,
        Math.min(i + chunkSize, bytes.length)
      );

      binary += String.fromCharCode(...chunk);
    }

    return binary;
  }

  // --------------------------------------------------
  // ZEYDAL AI SESİNİ ÇAL
  // --------------------------------------------------

  function playAudio(base64) {
    if (!audioContext || stopping) return;

    const binary = atob(base64);

    const samplesCount = Math.floor(
      binary.length / 2
    );

    const buffer = audioContext.createBuffer(
      1,
      samplesCount,
      CONFIG.outputSampleRate
    );

    const channel = buffer.getChannelData(0);

    const dataView = new DataView(
      Uint8Array.from(
        binary,
        char => char.charCodeAt(0)
      ).buffer
    );

    for (let i = 0; i < samplesCount; i++) {
      channel[i] =
        dataView.getInt16(i * 2, true) / 32768;
    }

    const source =
      audioContext.createBufferSource();

    source.buffer = buffer;
    source.connect(audioContext.destination);

    const startTime = Math.max(
      audioContext.currentTime + 0.02,
      nextPlayTime
    );

    source.start(startTime);

    nextPlayTime =
      startTime + buffer.duration;

    playingSources.add(source);

    source.onended = () => {
      playingSources.delete(source);

      // Son ses parçası da bittiyse dinlemeye dön
      if (
        playingSources.size === 0 &&
        turnCompleted &&
        active
      ) {
        setButton("🎙️ Seni dinliyorum...");
        setStatus("listening");
      }
    };
  }

  // --------------------------------------------------
  // SES KESME
  // --------------------------------------------------

  function clearPlayback() {
    for (const source of playingSources) {
      try {
        source.stop();
      } catch (_) {
        // Zaten durmuş olabilir.
      }
    }

    playingSources.clear();

    if (audioContext) {
      nextPlayTime = audioContext.currentTime;
    }

    turnCompleted = false;
  }

  // --------------------------------------------------
  // SESLİ GÖRÜŞMEYİ DURDUR
  // --------------------------------------------------

  function stopVoice() {
    if (stopping) return;

    stopping = true;

    active = false;
    starting = false;

    setStatus("stopping");

    // Çalan sesleri durdur
    clearPlayback();

    // Mikrofon işlemcisini kapat
    if (processor) {
      processor.onaudioprocess = null;
      processor.disconnect();
      processor = null;
    }

    // Mikrofon kaynağını kapat
    if (microphoneSource) {
      microphoneSource.disconnect();
      microphoneSource = null;
    }

    // Sessiz ses kanalını kapat
    if (silentGain) {
      silentGain.disconnect();
      silentGain = null;
    }

    // Mikrofon izinlerini ve akışını kapat
    if (microphoneStream) {
      microphoneStream
        .getTracks()
        .forEach(track => track.stop());

      microphoneStream = null;
    }

    // WebSocket bağlantısını kapat
    if (websocket) {
      const socket = websocket;
      websocket = null;

      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;

      if (
        socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING
      ) {
        try {
          socket.close();
        } catch (_) {}
      }
    }

    // Ses sistemini kapat
    if (audioContext) {
      const context = audioContext;
      audioContext = null;

      context.close().catch(() => {});
    }

    nextPlayTime = 0;
    turnCompleted = false;

    setButton("🎙️ Sesli Görüşme", false);
    setStatus("disconnected");

    notify("disconnected");

    stopping = false;

    console.log(
      "ZEYDAL AI: Sesli görüşme kapatıldı."
    );
  }

})();
