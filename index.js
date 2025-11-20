// ============================================================
// CONFIGURACIÓN INICIAL Y DEPENDENCIAS
// ============================================================
require("dotenv").config();
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const qrcode = require("qrcode-terminal");
const pino = require("pino");
const http = require("http");

// Mantener Railway activo
http.createServer((req, res) => res.end("Bot activo")).listen(process.env.PORT || 3000);

// Inicialización de Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// ============================================================
// CONSTANTES Y RESPUESTAS
// ============================================================
const chatHistory = new Map();
const MAX_HISTORY_LENGTH = 10;

const personalityPrompt =
  "Tu nombre es Bot de respuesta personalizado. Eres un amigo relajado, casual y servicial. Responde siempre en español, con tono natural, usando emojis sin abusar. No menciones que eres IA ni bot.";

const identityPhrases = [
  "quien eres", "quién eres", "que eres", "qué eres",
  "eres un bot", "eres bot", "como te llamas", "cómo te llamas",
  "quien es", "quién es"
];

const greetingPhrases = [
  "hola", "buenas", "que onda", "qué onda", "oye", "ola",
  "amigo", "bro", "buen día", "buenas tardes", "buenas noches"
];

const imagePhrases = [
  "crea una imagen", "haz una imagen", "genera una imagen",
  "puedes hacer una imagen", "crear imagen", "imagen por favor"
];

const howAreYouTriggers = [
  "como estas", "cómo estás", "como estas?", "cómo estás?",
  "que haces", "qué haces", "que haces?", "qué haces?"
];

const identityResponse =
  "Soy un Agente Personalizado de Respuesta Automática. Si quieres comunicarte conmigo, envíame mensaje en Telegram a @Cm24HrdZ⚡⭐✨\n, ¿En qué te puedo ayudar este medio? 🤲";

const greetingResponse =
  "Hola, soy un Agente Personalizado de Respuesta Automática. Si quieres comunicararte conmigo, puedes escribirme en Telegram a @Cm24HrdZ⚡⭐✨\n , Cuéntame ¿en qué te puedo ayudar por este medio? 🤲";

const noImageResponse =
  "Lo siento, no puedo crear imágenes. Soy un Agente Personalizado de Respuesta Automática. Si quieres contactarme, puedes escribirme a @Cm24HrdZ en Telegram ⚡⭐✨";

const howAreYouResponse =
  "Yo de lujo, como agente personalizado de respuesta automática siempre hay mucho que hacer 😎✨, ¿Y tú qué tal, qué cuentas? 🤭";

const cooldowns = new Map();
const COOLDOWN_SECONDS = 5;

// ============================================================
// CONEXIÓN PRINCIPAL
// ============================================================
async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");

  const logger = pino({ level: "warn" });
  const { version } = await fetchLatestBaileysVersion();

  console.log("📦 Versión WhatsApp Web:", version);

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
  });

  let botJid = "";

  // ============================================================
  // EVENTOS DE CONEXIÓN
  // ============================================================
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    console.log("📡 Estado:", connection);

    if (qr) {
      // **NUEVA URL DE QR** Usamos quickchart.io como alternativa
      const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(qr)}&size=250x250`;
      
      console.log("📱 Escanea este QR:");
      
      // Opción 1: QR en terminal (para uso local)
      qrcode.generate(qr, { small: true });

      // Opción 2: URL de escaneo (para usar en consolas de servidores como Railway)
      console.log("-----------------------------------------");
      console.log("🔗 URL del QR (Pégala en un navegador para escanear):");
      console.log(qrUrl);
      console.log("-----------------------------------------");
    }

    if (connection === "open" && sock.user?.id) {
      let cleaned = sock.user.id.replace(/:[0-9]+/, "");
      if (cleaned.startsWith("521")) cleaned = cleaned.replace("521", "52");
      botJid = cleaned.split("@")[0];
      console.log("🤖 Bot conectado como:", botJid);
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== 401;

      console.log("❌ Desconectado:", lastDisconnect?.error);
      console.log("📊 Código:", code);

      if (shouldReconnect) {
        console.log("🔄 Reconectando en 5 segundos...");
        setTimeout(connectToWhatsApp, 5000);
      } else {
        console.log("⚠️ Sesión inválida. Elimina la carpeta auth_info y vuelve a escanear.");
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);

  // ============================================================
  // MANEJO DE MENSAJES
  // ============================================================
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const m = messages[0];
    if (!m.message || m.key.fromMe) return;

    const remoteJid = m.key.remoteJid;

    if (remoteJid.endsWith("@g.us") || remoteJid.includes("@newsletter")) return;

    let text =
      m.message.conversation ||
      m.message.extendedTextMessage?.text ||
      m.message.imageMessage?.caption ||
      m.message.videoMessage?.caption ||
      "";

    if (!text) return;

    text = text.replace(/^@\d+\s*/g, "").trim();

    if (cooldowns.has(remoteJid) && Date.now() < cooldowns.get(remoteJid)) return;

    const normalized = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    if (identityPhrases.some((p) => normalized.includes(p))) {
      await sock.sendMessage(remoteJid, { text: identityResponse });
      cooldowns.set(remoteJid, Date.now() + COOLDOWN_SECONDS * 1000);
      return;
    }

    if (greetingPhrases.some((p) => normalized.startsWith(p))) {
      await sock.sendMessage(remoteJid, { text: greetingResponse });
      cooldowns.set(remoteJid, Date.now() + COOLDOWN_SECONDS * 1000);
      return;
    }

    if (howAreYouTriggers.some((p) => normalized.includes(p))) {
      await sock.sendMessage(remoteJid, { text: howAreYouResponse });
      cooldowns.set(remoteJid, Date.now() + COOLDOWN_SECONDS * 1000);
      return;
    }

    if (imagePhrases.some((p) => normalized.includes(p))) {
      await sock.sendMessage(remoteJid, { text: noImageResponse });
      cooldowns.set(remoteJid, Date.now() + COOLDOWN_SECONDS * 1000);
      return;
    }

    if (!chatHistory.has(remoteJid)) chatHistory.set(remoteJid, []);

    let history = chatHistory.get(remoteJid);

    const isFactual = text.match(/\b(qué|cual|cuál|quién|dónde|cuántos|cuántas|cómo)\b/i);

    let contextPrompt = personalityPrompt;
    if (isFactual) contextPrompt += " Responde con precisión.";
    else contextPrompt += " Responde breve, casual y natural.";

    const conversation = [
      { role: "user", parts: [{ text: contextPrompt }] },
      ...history,
      { role: "user", parts: [{ text }] },
    ];

    console.log("📩 Mensaje recibido:", text);

    try {
      const result = await model.generateContent({ contents: conversation });
      const replyCore = result.response.text();

      const reply =
        replyCore +
        "\n\n⚡⭐✨ Si necesitas algo más, contáctame también en @Cm24HrdZ o escribe a Axeltech24@protonmail.com";

      history.push({ role: "user", parts: [{ text }] });
      history.push({ role: "model", parts: [{ text: reply }] });

      if (history.length > MAX_HISTORY_LENGTH) {
        chatHistory.set(remoteJid, history.slice(-MAX_HISTORY_LENGTH));
      }

      cooldowns.set(remoteJid, Date.now() + COOLDOWN_SECONDS * 1000);

      await sock.sendMessage(remoteJid, { text: reply });
    } catch (err) {
      console.error("❌ Error Gemini:", err);
      await sock.sendMessage(remoteJid, { text: "Hubo un error, intenta de nuevo." });
    }
  });
}

// ============================================================
// INICIO DEL BOT
// ============================================================
connectToWhatsApp();

