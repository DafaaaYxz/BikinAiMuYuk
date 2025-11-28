const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('../public'));

// File untuk menyimpan data bot
const BOTS_FILE = path.join(__dirname, 'bots.json');

// Fungsi untuk membaca data bot
function readBots() {
  try {
    if (fs.existsSync(BOTS_FILE)) {
      return JSON.parse(fs.readFileSync(BOTS_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Error reading bots file:', error);
  }
  return {};
}

// Fungsi untuk menyimpan data bot
function saveBots(bots) {
  try {
    fs.writeFileSync(BOTS_FILE, JSON.stringify(bots, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving bots file:', error);
    return false;
  }
}

// API Key Gemini
const GEMINI_API_KEY = 'AIzaSyBywyuARVnFRcSMDerQJ2PZ_DZWHt5XaxA';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?key=${GEMINI_API_KEY}&alt=sse`;

// Endpoint untuk membuat bot baru
app.post('/api/create-bot', (req, res) => {
  const { name, description, imageUrl } = req.body;
  
  if (!name || !description) {
    return res.status(400).json({ error: 'Name and description are required' });
  }
  
  const botId = uuidv4();
  const bots = readBots();
  
  bots[botId] = {
    id: botId,
    name,
    description,
    imageUrl: imageUrl || '/default-avatar.png',
    createdAt: new Date().toISOString(),
    chatHistory: []
  };
  
  if (saveBots(bots)) {
    res.json({ 
      success: true, 
      botId,
      chatUrl: `/bot.html?id=${botId}`
    });
  } else {
    res.status(500).json({ error: 'Failed to create bot' });
  }
});

// Endpoint untuk mendapatkan data bot
app.get('/api/bot/:id', (req, res) => {
  const bots = readBots();
  const bot = bots[req.params.id];
  
  if (bot) {
    res.json(bot);
  } else {
    res.status(404).json({ error: 'Bot not found' });
  }
});

// Endpoint untuk mendapatkan semua bot (untuk halaman publik)
app.get('/api/bots', (req, res) => {
  const bots = readBots();
  res.json(Object.values(bots));
});

// Endpoint untuk chat dengan bot menggunakan Gemini API
app.post('/api/chat/:botId', async (req, res) => {
  const { message } = req.body;
  const botId = req.params.botId;
  
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }
  
  const bots = readBots();
  const bot = bots[botId];
  
  if (!bot) {
    return res.status(404).json({ error: 'Bot not found' });
  }
  
  try {
    // Membuat prompt berdasarkan persona bot
    const personaPrompt = `Anda adalah ${bot.name}. ${bot.description}. Berperilaku sesuai dengan deskripsi ini.`;
    
    // Mengirim permintaan ke Gemini API
    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `${personaPrompt}\n\nUser: ${message}\n\nAnda:`
              }
            ]
          }
        ]
      })
    });
    
    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }
    
    const responseText = await response.text();
    
    // Parsing response SSE dari Gemini
    const lines = responseText.split('\n');
    let botReply = '';
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.candidates && data.candidates[0].content.parts[0].text) {
            botReply += data.candidates[0].content.parts[0].text;
          }
        } catch (e) {
          // Skip lines that aren't valid JSON
        }
      }
    }
    
    // Menyimpan chat ke history
    const chatEntry = {
      user: message,
      bot: botReply,
      timestamp: new Date().toISOString()
    };
    
    bot.chatHistory.push(chatEntry);
    bots[botId] = bot;
    saveBots(bots);
    
    res.json({ reply: botReply });
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    res.status(500).json({ 
      error: 'Failed to get response from AI',
      reply: 'Maaf, saya sedang mengalami gangguan. Silakan coba lagi nanti.'
    });
  }
});

// Menyajikan file statis
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/bot', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/bot.html'));
});

// Menjalankan server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
