
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

  let peerConnection = null;
  let microphoneStream = null;
  let remoteAudio = null;
  let dataChannel = null;

  let active = false;
  let starting = false;
  let stopping = false;

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

  button.addEventListener("click", async () => {
    if (active || starting) {
      stopVoice();
      return;
    }

    await startVoice();
  });

  // ------------------------------------------
  // SESLİ GÖRÜŞMEYİ BAŞLAT
  // ------------------------------------------

  async function startVoice() {
    if (starting || active) return;

    starting = true;
    stopping = false;

    setButton("Bağlanıyor...", true);
    setStatus("connecting");

    try {
      if (!window.zeydalRequestVoiceToken) {
        throw new Error(
          "Ses bağlantısı fonksiyonu bulunamadı."
        );
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Tarayıcı mikrofon kullanımını desteklemiyor."
        );
      }

      // 1. Mikrofon izni al
      microphoneStream =
        await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });

      if (stopping) return;

      // 2. Sunucudan geçici OpenAI anahtarı al
      const tokenResult =
        await window.zeydalRequestVoiceToken();

      const token =
        typeof tokenResult === "string"
          ? tokenResult
          : tokenResult?.token ||
            tokenResult?.value ||
            tokenResult?.name;

      if (!token) {
        throw new Error(
          "OpenAI geçici bağlantı anahtarı alınamadı."
        );
      }

      if (stopping) return;

      // 3. WebRTC bağlantısını oluştur
      peerConnection = new RTCPeerConnection();

      const pc = peerConnection;

      // 4. Uzak ses için oynatıcı
      remoteAudio = document.createElement("audio");
      remoteAudio.autoplay = true;
      remoteAudio.playsInline = true;
      remoteAudio.style.display = "none";

      document.body.appendChild(remoteAudio);

      // 5. OpenAI'den gelen sesi oynat
      pc.ontrack = async (event) => {
        if (peerConnection !== pc || stopping) return;

        remoteAudio.srcObject =
          event.streams?.[0] ||
          new MediaStream([event.track]);

        try {
          await remoteAudio.play();
        } catch (error) {
          console.warn(
            "Ses otomatik oynatılamadı:",
            error
          );

          notify("audio-playback-error", {
            message: "Ses oynatma izni gerekli olabilir."
          });
        }
      };

      // 6. Mikrofon sesini WebRTC'ye ekle
      microphoneStream.getTracks().forEach(track => {
        pc.addTrack(track, microphoneStream);
      });

      // 7. Olay ve metin aktarımı kanalı
      dataChannel = pc.createDataChannel("oai-events");

      const channel = dataChannel;

      channel.onopen = () => {
        if (dataChannel !== channel || stopping) return;

        console.log(
          SYSTEM_NAME + ": Olay kanalı açıldı."
        );
      };

      channel.onmessage = (event) => {
        if (dataChannel !== channel || stopping) return;

        try {
          const message = JSON.parse(event.data);

          handleRealtimeEvent(message);

        } catch (error) {
          console.error(
            "ZEYDAL olay işleme hatası:",
            error
          );
        }
      };

      channel.onerror = (error) => {
        console.error(
          "ZEYDAL olay kanalı hatası:",
          error
        );
      };

      // 8. SDP teklifini oluştur
      const offer = await pc.createOffer();

      await pc.setLocalDescription(offer);

      // ICE adaylarının toplanmasını bekle
      await waitForIceGathering(pc);

      if (stopping) return;

      // 9. OpenAI Realtime bağlantısını kur
      const response = await fetch(
        "https://api.openai.com/v1/realtime/calls",
        {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + token,
            "Content-Type": "application/sdp"
          },
          body: pc.localDescription.sdp
        }
      );

      const answerSdp = await response.text();

      if (!response.ok) {
        let errorMessage = answerSdp;

        try {
          const errorData = JSON.parse(answerSdp);
          errorMessage =
            errorData.error?.message || answerSdp;
        } catch (_) {}

        throw new Error(
          "OpenAI bağlantı hatası: " + errorMessage
        );
      }

      if (stopping) return;

      // 10. OpenAI yanıtını WebRTC'ye uygula
      await pc.setRemoteDescription({
        type: "answer",
        sdp: answerSdp
      });

      if (stopping) return;

      active = true;
      starting = false;

      setButton("🔴 Görüşmeyi Bitir");
      setStatus("listening");

      notify("connected");

      console.log(
        SYSTEM_NAME + ": OpenAI Realtime bağlantısı kuruldu."
      );

    } catch (error) {
      console.error(
        "ZEYDAL ses başlatma hatası:",
        error
      );

      stopVoice();

      alert(
        "ZEYDAL AI ses bağlantısı kurulamadı:\n" +
        error.message
      );
    }
  }

  // ------------------------------------------
  // ICE ADAYLARINI BEKLE
  // ------------------------------------------

  function waitForIceGathering(pc) {
    if (pc.iceGatheringState === "complete") {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(
          new Error("WebRTC bağlantı hazırlığı zaman aşımına uğradı.")
        );
      }, 15000);

      function cleanup() {
        clearTimeout(timeout);
        pc.removeEventListener(
          "icegatheringstatechange",
          checkState
        );
      }

      function checkState() {
        if (pc.iceGatheringState === "complete") {
          cleanup();
          resolve();
        }
      }

      pc.addEventListener(
        "icegatheringstatechange",
        checkState
      );

      checkState();
    });
  }

  // ------------------------------------------
  // OPENAI GERÇEK ZAMANLI OLAYLARI
  // ------------------------------------------

  function handleRealtimeEvent(message) {
    const type = message.type;

    console.log(
      "ZEYDAL Realtime:",
      type
    );

    switch (type) {

      case "session.created":
      case "session.updated":
        console.log(
          "ZEYDAL oturumu hazır."
        );
        break;

      case "input_audio_buffer.speech_started":
        setButton("🎙️ Seni dinliyorum...");
        setStatus("listening");

        notify("user-speaking");
        break;

      case "input_audio_buffer.speech_stopped":
        setButton("Düşünüyorum...");
        setStatus("thinking");
        break;

      case "conversation.item.input_audio_transcription.completed":
        if (message.transcript) {
          notify("user-transcription", {
            text: message.transcript
          });
        }
        break;

      case "response.created":
        setButton("Düşünüyorum...");
        setStatus("thinking");
        break;

      case "response.output_audio_transcript.delta":
        if (message.delta) {
          notify("assistant-transcription", {
            text: message.delta
          });
        }
        break;

      case "response.output_audio_transcript.done":
        if (message.transcript) {
          notify("assistant-text", {
            text: message.transcript
          });
        }
        break;

      case "response.output_text.delta":
        if (message.delta) {
          notify("assistant-text", {
            text: message.delta
          });
        }
        break;

      case "response.done":
        setButton("🎙️ Seni dinliyorum...");
        setStatus("listening");

        notify("response-complete");
        break;

      case "input_audio_buffer.speech_started":
        notify("user-speaking");
        break;

      case "error":
        console.error(
          "OpenAI Realtime hatası:",
          message.error
        );

        notify("error", {
          message:
            message.error?.message ||
            "Ses bağlantısında hata oluştu."
        });
        break;
    }
  }

  // ------------------------------------------
  // SESLİ GÖRÜŞMEYİ DURDUR
  // ------------------------------------------

  function stopVoice() {
    if (stopping) return;

    stopping = true;

    active = false;
    starting = false;

    setStatus("stopping");

    // Olay kanalını kapat
    if (dataChannel) {
      try {
        dataChannel.close();
      } catch (_) {}

      dataChannel = null;
    }

    // WebRTC bağlantısını kapat
    if (peerConnection) {
      try {
        peerConnection.close();
      } catch (_) {}

      peerConnection = null;
    }

    // Mikrofonu kapat
    if (microphoneStream) {
      microphoneStream.getTracks().forEach(track => {
        track.stop();
      });

      microphoneStream = null;
    }

    // Uzak sesi kapat
    if (remoteAudio) {
      remoteAudio.pause();
      remoteAudio.srcObject = null;
      remoteAudio.remove();
      remoteAudio = null;
    }

    setButton("🎙️ Sesli Görüşme", false);
    setStatus("disconnected");

    notify("disconnected");

    stopping = false;

    console.log(
      SYSTEM_NAME + ": Sesli görüşme kapatıldı."
    );
  }

})();
