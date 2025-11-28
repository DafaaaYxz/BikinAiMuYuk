const express = require("express");
const fs = require("fs");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const fetch = require("node-fetch");

const app = express();
app.use(cors());
app.use(express.json());

const API_KEY = "AIzaSyBywyuARVnFRcSMDerQJ2PZ_DZWHt5XaxA";

// SSE clients
let clients = {}; // { botId: [res, res, res] }

// ==============================
// Load JSON helper
// ==============================
function loadBots() {
  return JSON.parse(fs.readFileSync("./bots.json"));
}

function saveBots(data) {
  fs.writeFileSync("./bots.json", JSON.stringify(data, null, 2));
}

function loadChats() {
  return JSON.parse(fs.readFileSync("./chats.json"));
}

function saveChats(data) {
  fs.writeFileSync("./chats.json", JSON.stringify(data, null, 2));
}

// ==============================
// CREATE BOT
// ==============================
app.post("/create-bot", (req, res) => {
  const { name, image, persona } = req.body;

  if (!name || !image || !persona) {
    return res.json({ success: false, message: "Data kurang!" });
  }

  const botId = "bot_" + uuidv4().slice(0, 8);

  const newBot = {
    id: botId,
    name,
    image,
    persona,
    createdAt: new Date().toISOString()
  };

  const bots = loadBots();
  bots.bots.push(newBot);
  saveBots(bots);

  return res.json({
    success: true,
    botId,
    message: "Bot berhasil dibuat!"
  });
});

// ==============================
// GET LIST BOT PUBLIK
// ==============================
app.get("/bots", (req, res) => {
  const bots = loadBots();
  res.json(bots);
});

// ==============================
// GET BOT DETAILS
// ==============================
app.get("/bot/:id", (req, res) => {
  const bots = loadBots();
  const bot = bots.bots.find(b => b.id === req.params.id);

  if (!bot) return res.json({ success: false, message: "Bot tidak ditemukan" });

  res.json({ success: true, bot });
});

// ==============================
// SSE REALTIME FOR CHAT
// ==============================
app.get("/stream/:id", (req, res) => {
  const botId = req.params.id;

  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive"
  });

  if (!clients[botId]) clients[botId] = [];
  clients[botId].push(res);

  console.log("Client connected to bot:", botId);

  req.on("close", () => {
    clients[botId] = clients[botId].filter(r => r !== res);
    console.log("Client disconnected:", botId);
  });
});

// ==============================
// SEND MESSAGE TO BOT (User → AI)
// ==============================
app.post("/chat/:id", async (req, res) => {
  const botId = req.params.id;
  const { message } = req.body;

  if (!message) return res.json({ success: false, message: "Pesan kosong" });

  const bots = loadBots();
  const bot = bots.bots.find(b => b.id === botId);

  if (!bot) return res.json({ success: false, message: "Bot tidak ditemukan" });

  // Simpan pesan user ke chats.json
  const chats = loadChats();
  if (!chats.chats[botId]) chats.chats[botId] = [];

  chats.chats[botId].push({
    sender: "user",
    text: message,
    time: Date.now()
  });
  saveChats(chats);

  // Broadcast ke semua client yang terhubung
  if (clients[botId]) {
    clients[botId].forEach(r =>
      r.write(`data: ${JSON.stringify({ sender: "user", text: message })}\n\n`)
    );
  }

  // ===============================
  // Generate reply from Gemini API
  // ===============================
  const personaPrompt = `
Anda adalah bot dengan persona berikut:
${bot.persona}

Jawablah pesan user dengan gaya dan sifat sesuai persona di atas.
`;

  const body = {
    contents: [
      {
        parts: [
          { text: personaPrompt },
          { text: "User: " + message }
        ]
      }
    ]
  };

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?key=${API_KEY}&alt=sse`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }
    );

    let botReply = "";

    response.body.on("data", chunk => {
      const str = chunk.toString();
      const lines = str.split("\n");

      lines.forEach(line => {
        if (line.startsWith("data: ")) {
          const json = JSON.parse(line.replace("data: ", "").trim());
          if (json?.candidates?.[0]?.content?.parts) {
            const part = json.candidates[0].content.parts[0].text || "";
            botReply += part;

            // Broadcast bot reply real-time
            if (clients[botId]) {
              clients[botId].forEach(r =>
                r.write(`data: ${JSON.stringify({ sender: "bot", text: part })}\n\n`)
              );
            }
          }
        }
      });
    });

    response.body.on("end", () => {
      // Simpan bot reply full ke chats.json
      const chats2 = loadChats();
      chats2.chats[botId].push({
        sender: "bot",
        text: botReply,
        time: Date.now()
      });
      saveChats(chats2);
    });

    res.json({ success: true });

  } catch (err) {
    console.log("Gemini API Error:", err);
    res.json({ success: false, message: "Gagal generate AI" });
  }
});

// ==============================
// GET CHAT HISTORY
// ==============================
app.get("/chat-history/:id", (req, res) => {
  const chats = loadChats();
  res.json({
    success: true,
    messages: chats.chats[req.params.id] || []
  });
});

// ==============================
app.listen(3000, () => {
  console.log("Server berjalan di port 3000");
});
