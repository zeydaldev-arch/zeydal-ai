
(() => {
  const button = document.getElementById("zeydal-voice-toggle");

  if (!button) return;

  let websocket = null;
  let microphoneStream = null;
  let audioContext = null;
  let microphoneSource = null;
  let processor = null;
  let silentGain = null;
  let active = false;
  let starting = false;
  let nextPlayTime = 0;
  const playingSources = new Set();

  button.addEventListener("click", async () => {
    if (active || starting) {
      stopVoice();
      return;
    }

    await startVoice();
  });

  async function startVoice() {
    starting = true;
    button.disabled = true;
    button.textContent = "Bağlanıyor...";

    try {
      if (!window.zeydalRequestVoiceToken) {
        throw new Error("Ses bağlantısı için giriş fonksiyonu bulunamadı.");
      }

      microphoneStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });

      audioContext = new AudioContext();
      await audioContext.resume();

      const token = await window.zeydalRequestVoiceToken();

      const url =
        "wss://generativelanguage.googleapis.com/ws/" +
        "google.ai.generativelanguage.v1beta.GenerativeService." +
        "BidiGenerateContentConstrained?access_token=" +
        encodeURIComponent(token);

      websocket = new WebSocket(url);

      websocket.onopen = () => {
        websocket.send(JSON.stringify({
          setup: {
            model: "models/gemini-3.1-flash-live-preview",
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: "Aoede"
                  }
                }
              }
            },
            systemInstruction: {
              parts: [{
                text:
                  "Sen ZEYDAL AI adlı Türkçe konuşan yapay zeka asistanısın. " +
                  "Kullanıcıyla doğal, anlaşılır ve yardımcı bir şekilde Türkçe konuş."
              }]
            }
          }
        }));
      };

      websocket.onmessage = async (event) => {
        const message = JSON.parse(event.data);

        if (message.setupComplete) {
          active = true;
          starting = false;
          button.disabled = false;
          button.textContent = "🔴 Görüşmeyi Bitir";
          startMicrophone();
        }

        if (message.serverContent?.interrupted) {
          clearPlayback();
        }

        const parts = message.serverContent?.modelTurn?.parts || [];

        for (const part of parts) {
          if (part.inlineData?.data) {
            playAudio(part.inlineData.data);
          }
        }

        if (message.error) {
          alert("ZEYDAL AI: " + message.error.message);
          stopVoice();
        }
      };

      websocket.onerror = () => {
        alert("Ses bağlantısında hata oluştu.");
        stopVoice();
      };

      websocket.onclose = () => {
        if (active || starting) {
          stopVoice();
        }
      };

    } catch (error) {
      stopVoice();
      alert("Sesli görüşme başlatılamadı: " + error.message);
    }
  }

  function startMicrophone() {
    microphoneSource =
      audioContext.createMediaStreamSource(microphoneStream);

    processor = audioContext.createScriptProcessor(4096, 1, 1);

    silentGain = audioContext.createGain();
    silentGain.gain.value = 0;

    processor.onaudioprocess = (event) => {
      if (!active || !websocket || websocket.readyState !== WebSocket.OPEN) {
        return;
      }

      const input = event.inputBuffer.getChannelData(0);

      const samples = resampleAudio(
        input,
        audioContext.sampleRate,
        16000
      );

      const pcm = new Int16Array(samples.length);

      for (let i = 0; i < samples.length; i++) {
        const value = Math.max(-1, Math.min(1, samples[i]));
        pcm[i] = value < 0 ? value * 32768 : value * 32767;
      }

      const bytes = new Uint8Array(pcm.buffer);
      let binary = "";

      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }

      websocket.send(JSON.stringify({
        realtimeInput: {
          audio: {
            mimeType: "audio/pcm;rate=16000",
            data: btoa(binary)
          }
        }
      }));
    };

    microphoneSource.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(audioContext.destination);
  }

  function resampleAudio(input, inputRate, outputRate) {
    if (inputRate === outputRate) return input;

    const ratio = inputRate / outputRate;
    const length = Math.floor(input.length / ratio);
    const output = new Float32Array(length);

    for (let i = 0; i < length; i++) {
      const position = i * ratio;
      const index = Math.floor(position);
      const fraction = position - index;

      const first = input[index] || 0;
      const second = input[index + 1] || first;

      output[i] = first + (second - first) * fraction;
    }

    return output;
  }

  function playAudio(base64) {
    if (!audioContext) return;

    const binary = atob(base64);
    const samples = new Int16Array(binary.length / 2);

    for (let i = 0; i < samples.length; i++) {
      const low = binary.charCodeAt(i * 2);
      const high = binary.charCodeAt(i * 2 + 1);
      let value = (high << 8) | low;

      if (value >= 32768) value -= 65536;

      samples[i] = value;
    }

    const buffer = audioContext.createBuffer(
      1,
      samples.length,
      24000
    );

    const channel = buffer.getChannelData(0);

    for (let i = 0; i < samples.length; i++) {
      channel[i] = samples[i] / 32768;
    }

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);

    const startTime = Math.max(
      audioContext.currentTime + 0.02,
      nextPlayTime
    );

    source.start(startTime);
    nextPlayTime = startTime + buffer.duration;

    playingSources.add(source);

    source.onended = () => {
      playingSources.delete(source);
    };
  }

  function clearPlayback() {
    for (const source of playingSources) {
      try {
        source.stop();
      } catch (_) {}
    }

    playingSources.clear();

    if (audioContext) {
      nextPlayTime = audioContext.currentTime;
    }
  }

  function stopVoice() {
    active = false;
    starting = false;

    clearPlayback();

    if (processor) {
      processor.disconnect();
      processor = null;
    }

    if (microphoneSource) {
      microphoneSource.disconnect();
      microphoneSource = null;
    }

    if (silentGain) {
      silentGain.disconnect();
      silentGain = null;
    }

    if (microphoneStream) {
      microphoneStream.getTracks().forEach(track => track.stop());
      microphoneStream = null;
    }

    if (websocket) {
      const socket = websocket;
      websocket = null;

      if (socket.readyState === WebSocket.OPEN ||
          socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    }

    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }

    button.disabled = false;
    button.textContent = "🎙️ Sesli Görüşme";
  }
})();

