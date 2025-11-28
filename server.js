import express from "express";
import cors from "cors";
import fs from "fs-extra";
import { Server } from "socket.io";
import http from "http";
import axios from "axios";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const BOTS_FILE = "./bots.json";
const API_KEY = "AIzaSyBywyuARVnFRcSMDerQJ2PZ_DZWHt5XaxA";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?key=${API_KEY}&alt=sse`;

if (!fs.existsSync(BOTS_FILE)) fs.writeJSONSync(BOTS_FILE, []);

// === CREATE BOT ===
app.post("/api/create-bot", async (req, res) => {
  const { name, description, image } = req.body;
  if (!name || !description) return res.status(400).json({ error: "Data tidak lengkap!" });

  const id = Date.now().toString();
  const bot = { id, name, description, image, chats: [] };

  const bots = await fs.readJSON(BOTS_FILE);
  bots.push(bot);
  await fs.writeJSON(BOTS_FILE, bots);

  res.json({ link: `/chat.html?id=${id}`, bot });
});

// === LIST ALL BOTS (PUBLIC) ===
app.get("/api/bots", async (req, res) => {
  const bots = await fs.readJSON(BOTS_FILE);
  res.json(bots);
});

// === SOCKET REAL-TIME CHAT ===
io.on("connection", (socket) => {
  console.log("user connected");

  socket.on("joinBot", async (botId) => {
    socket.join(botId);
    const bots = await fs.readJSON(BOTS_FILE);
    const bot = bots.find(b => b.id === botId);
    if (bot) socket.emit("loadChats", bot.chats);
  });

  socket.on("sendMessage", async ({ botId, user, text }) => {
    if (!botId || !text) return;

    io.to(botId).emit("message", { sender: user, text });

    const bots = await fs.readJSON(BOTS_FILE);
    const bot = bots.find(b => b.id === botId);
    if (!bot) return;

    bot.chats.push({ sender: user, text });
    await fs.writeJSON(BOTS_FILE, bots);

    // === Send to Gemini AI ===
    try {
      const response = await axios.post(GEMINI_URL, {
        contents: [{ role: "user", parts: [{ text: `${bot.description}\nUser: ${text}` }] }]
      });

      const aiText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "⚠️ Bot tidak menjawab.";
      io.to(botId).emit("message", { sender: bot.name, text: aiText });

      bot.chats.push({ sender: bot.name, text: aiText });
      await fs.writeJSON(BOTS_FILE, bots);
    } catch (err) {
      console.error(err.message);
    }
  });
});

server.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
