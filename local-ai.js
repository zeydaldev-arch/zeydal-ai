
"use strict";

/**
 * ZEYDAL AI
 * Local AI Engine
 * Version: 1.1.0
 * Ollama Integration
 */

class ZeydalLocalAI {
  constructor() {
    this.model = null;
    this.isReady = false;
    this.isGenerating = false;
    this.abortController = null;

    this.config = {
      apiUrl: "http://localhost:11434",
      modelName: "qwen2.5:0.5b",
      maxTokens: 1024,
      temperature: 0.7
    };
  }

  // Ollama bağlantısını başlat
  async initialize() {
    try {
      console.log("ZEYDAL AI: Yerel motor başlatılıyor...");

      const response = await fetch(
        `${this.config.apiUrl}/api/tags`
      );

      if (!response.ok) {
        throw new Error("Ollama sunucusuna erişilemedi.");
      }

      const data = await response.json();

      const modelExists = data.models?.some(
        item => item.name === this.config.modelName ||
                item.name.startsWith(this.config.modelName + ":")
      );

      if (!modelExists) {
        throw new Error(
          `Model bulunamadı: ${this.config.modelName}`
        );
      }

      this.model = this.config.modelName;
      this.isReady = true;

      console.log("ZEYDAL AI: Yerel model bağlantısı hazır.");

      return {
        success: true,
        message: "Ollama yerel modeli başarıyla bağlandı.",
        model: this.model
      };

    } catch (error) {
      console.error("Local AI başlatma hatası:", error);

      this.isReady = false;

      return {
        success: false,
        message: error.message
      };
    }
  }

  // Yerel modele mesaj gönder
  async sendMessage(message, history = []) {
    if (!this.isReady) {
      throw new Error("Yerel AI motoru henüz başlatılmadı.");
    }

    if (this.isGenerating) {
      throw new Error("Önceki yanıt henüz tamamlanmadı.");
    }

    if (typeof message !== "string" || !message.trim()) {
      throw new Error("Geçerli bir mesaj girilmelidir.");
    }

    this.isGenerating = true;
    this.abortController = new AbortController();

    try {
      const messages = history
        .filter(item =>
          ["user", "assistant", "system"].includes(item.role) &&
          typeof item.content === "string"
        )
        .map(item => ({
          role: item.role,
          content: item.content
        }));

      messages.push({
        role: "user",
        content: message.trim()
      });

      const response = await fetch(
        `${this.config.apiUrl}/api/chat`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json"
          },

          body: JSON.stringify({
            model: this.config.modelName,
            messages: messages,
            stream: false,
            options: {
              temperature: this.config.temperature,
              num_predict: this.config.maxTokens
            }
          }),

          signal: this.abortController.signal
        }
      );

      if (!response.ok) {
        throw new Error(
          `Ollama API hatası: ${response.status}`
        );
      }

      const data = await response.json();

      const answer = data.message?.content;

      if (!answer) {
        throw new Error("Model boş yanıt döndürdü.");
      }

      return {
        success: true,
        mode: "offline",
        model: this.config.modelName,
        response: answer,
        message: "Yerel model yanıtı başarıyla alındı."
      };

    } catch (error) {
      if (error.name === "AbortError") {
        return {
          success: false,
          mode: "offline",
          response: null,
          message: "Yerel model isteği durduruldu."
        };
      }

      console.error("Local AI mesaj hatası:", error);

      throw error;

    } finally {
      this.isGenerating = false;
      this.abortController = null;
    }
  }

  // Motor durumunu kontrol et
  getStatus() {
    return {
      ready: this.isReady,
      generating: this.isGenerating,
      model: this.config.modelName,
      apiUrl: this.config.apiUrl
    };
  }

  // Motoru durdur
  stop() {
    if (this.abortController) {
      this.abortController.abort();
    }

    this.isReady = false;
    this.isGenerating = false;
    this.model = null;

    console.log("ZEYDAL AI: Yerel motor durduruldu.");
  }
}

// Global erişim
window.ZeydalLocalAI = ZeydalLocalAI;
