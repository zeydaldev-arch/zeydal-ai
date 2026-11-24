
(() => {
  "use strict";

  // ------------------------------------------
  // ZEYDAL AI PERSONAL - YEREL AI MOTORU
  // ------------------------------------------

  const MODEL_ID =
    "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";

  const LIBRARY_URL =
    "https://esm.run/@mlc-ai/web-llm@0.2.89";

  let engine = null;
  let loadingPromise = null;

  let status = {
    ready: false,
    loading: false,
    supported: false,
    message: "Yerel AI henüz başlatılmadı."
  };

  // ------------------------------------------
  // DURUM BİLDİRİMİ
  // ------------------------------------------

  function updateStatus(data) {
    status = {
      ...status,
      ...data
    };

    window.dispatchEvent(
      new CustomEvent("zeydal:local-ai", {
        detail: { ...status }
      })
    );
  }

  function getStatus() {
    return { ...status };
  }

  // ------------------------------------------
  // WEBGPU KONTROLÜ
  // ------------------------------------------

  function isSupported() {
    return Boolean(
      navigator.gpu &&
      window.isSecureContext
    );
  }

  // ------------------------------------------
  // MODELİ YÜKLE
  // ------------------------------------------

  async function initialize(onProgress) {
    if (engine) {
      return true;
    }

    if (loadingPromise) {
      return loadingPromise;
    }

    if (!isSupported()) {
      updateStatus({
        supported: false,
        ready: false,
        loading: false,
        message:
          "Bu tarayıcıda WebGPU kullanılamıyor."
      });

      throw new Error(
        "Yerel AI için WebGPU destekli ve güvenli bağlantılı bir tarayıcı gerekiyor."
      );
    }

    loadingPromise = (async () => {
      updateStatus({
        supported: true,
        loading: true,
        message: "AI motoru hazırlanıyor."
      });

      try {
        const webllm = await import(LIBRARY_URL);

        updateStatus({
          message: "Yapay zeka modeli yükleniyor."
        });

        engine = await webllm.CreateMLCEngine(
          MODEL_ID,
          {
            initProgressCallback: (progress) => {
              const message =
                progress.text ||
                "Model yükleniyor.";

              updateStatus({
                loading: true,
                message
              });

              if (typeof onProgress === "function") {
                onProgress(progress);
              }
            }
          },
          {
            context_window_size: 2048
          }
        );

        updateStatus({
          ready: true,
          loading: false,
          message: "ZEYDAL AI Personal hazır."
        });

        return true;

      } catch (error) {
        engine = null;

        updateStatus({
          ready: false,
          loading: false,
          message: error.message ||
            "Yerel AI başlatılamadı."
        });

        throw error;

      } finally {
        loadingPromise = null;
      }
    })();

    return loadingPromise;
  }

  // ------------------------------------------
  // YEREL AI İLE SOHBET
  // ------------------------------------------

  async function chat(messages) {
    if (!engine) {
      throw new Error(
        "Önce yerel AI modelini yüklemelisiniz."
      );
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error(
        "Geçerli bir konuşma geçmişi gönderilmedi."
      );
    }

    const safeMessages = messages
      .filter(message =>
        message &&
        ["system", "user", "assistant"].includes(
          message.role
        ) &&
        typeof message.content === "string"
      )
      .slice(-12)
      .map(message => ({
        role: message.role,
        content: message.content
      }));

    if (safeMessages.length === 0) {
      throw new Error(
        "Gönderilecek geçerli mesaj bulunamadı."
      );
    }

    const response =
      await engine.chat.completions.create({
        messages: [
          {
            role: "system",
            content:
              "Sen ZEYDAL AI Personal'sın. " +
              "Kullanıcıya Türkçe, açık, yardımcı " +
              "ve doğru cevaplar ver."
          },
          ...safeMessages
        ],
        temperature: 0.7,
        max_tokens: 512
      });

    const reply =
      response.choices?.[0]?.message?.content;

    if (!reply || typeof reply !== "string") {
      throw new Error(
        "Yerel AI geçerli bir cevap üretmedi."
      );
    }

    return reply;
  }

  // ------------------------------------------
  // MODELİ BELLEKTEN BOŞALT
  // ------------------------------------------

  async function unload() {
    if (!engine) return;

    const currentEngine = engine;
    engine = null;

    await currentEngine.unload();

    updateStatus({
      ready: false,
      loading: false,
      message: "Yerel AI modeli kapatıldı."
    });
  }

  // ------------------------------------------
  // DIŞ ERİŞİM
  // ------------------------------------------

  window.ZEYDAL_LOCAL_AI = {
    initialize,
    chat,
    unload,
    isSupported,
    getStatus
  };

  console.log(
    "ZEYDAL AI Personal: Yerel AI altyapısı hazır."
  );

})();

