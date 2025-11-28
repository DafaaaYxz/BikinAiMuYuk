// Fungsi untuk halaman utama (index.html)
if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
    document.addEventListener('DOMContentLoaded', function() {
        const botForm = document.getElementById('botForm');
        const resultDiv = document.getElementById('result');
        const chatLink = document.getElementById('chatLink');
        const copyLinkBtn = document.getElementById('copyLink');
        
        // Memuat daftar bot publik
        loadPublicBots();
        
        // Menangani pembuatan bot
        botForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData(botForm);
            const botData = {
                name: formData.get('botName'),
                description: formData.get('botDescription'),
                imageUrl: formData.get('botImage') || ''
            };
            
            try {
                const response = await fetch('/api/create-bot', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(botData)
                });
                
                const result = await response.json();
                
                if (result.success) {
                    // Menampilkan hasil
                    const fullUrl = `${window.location.origin}${result.chatUrl}`;
                    chatLink.href = fullUrl;
                    chatLink.textContent = fullUrl;
                    resultDiv.classList.remove('hidden');
                    
                    // Reset form
                    botForm.reset();
                    
                    // Memuat ulang daftar bot publik
                    loadPublicBots();
                } else {
                    alert('Gagal membuat bot: ' + result.error);
                }
            } catch (error) {
                console.error('Error creating bot:', error);
                alert('Terjadi kesalahan saat membuat bot');
            }
        });
        
        // Menangani penyalinan link
        copyLinkBtn.addEventListener('click', function() {
            const linkText = chatLink.href;
            navigator.clipboard.writeText(linkText)
                .then(() => {
                    copyLinkBtn.textContent = 'Tersalin!';
                    setTimeout(() => {
                        copyLinkBtn.textContent = 'Salin Link';
                    }, 2000);
                })
                .catch(err => {
                    console.error('Failed to copy: ', err);
                });
        });
        
        // Fungsi untuk memuat daftar bot publik
        async function loadPublicBots() {
            try {
                const response = await fetch('/api/bots');
                const bots = await response.json();
                
                const botsContainer = document.getElementById('publicBots');
                
                if (bots.length === 0) {
                    botsContainer.innerHTML = '<p>Belum ada bot yang dibuat. Jadilah yang pertama!</p>';
                    return;
                }
                
                botsContainer.innerHTML = bots.map(bot => `
                    <div class="bot-card">
                        <img src="${bot.imageUrl}" alt="${bot.name}">
                        <h3>${bot.name}</h3>
                        <p>${bot.description}</p>
                        <a href="/bot.html?id=${bot.id}" class="btn-secondary">Chat Sekarang</a>
                    </div>
                `).join('');
            } catch (error) {
                console.error('Error loading public bots:', error);
            }
        }
    });
}

// Fungsi untuk halaman chat (bot.html)
if (window.location.pathname === '/bot.html') {
    document.addEventListener('DOMContentLoaded', function() {
        const urlParams = new URLSearchParams(window.location.search);
        const botId = urlParams.get('id');
        
        if (!botId) {
            alert('Bot ID tidak valid');
            window.location.href = '/';
            return;
        }
        
        const botNameElem = document.getElementById('botName');
        const botDescriptionElem = document.getElementById('botDescription');
        const botAvatarElem = document.getElementById('botAvatar');
        const chatMessages = document.getElementById('chatMessages');
        const messageInput = document.getElementById('messageInput');
        const sendBtn = document.getElementById('sendBtn');
        const shareBtn = document.getElementById('shareBtn');
        
        let botData = null;
        
        // Memuat data bot
        loadBotData();
        
        // Menangani pengiriman pesan
        sendBtn.addEventListener('click', sendMessage);
        messageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
        
        // Menangani tombol bagikan
        shareBtn.addEventListener('click', function() {
            const currentUrl = window.location.href;
            navigator.clipboard.writeText(currentUrl)
                .then(() => {
                    shareBtn.textContent = 'Tersalin!';
                    setTimeout(() => {
                        shareBtn.textContent = 'Bagikan';
                    }, 2000);
                })
                .catch(err => {
                    console.error('Failed to copy: ', err);
                });
        });
        
        // Fungsi untuk memuat data bot
        async function loadBotData() {
            try {
                const response = await fetch(`/api/bot/${botId}`);
                botData = await response.json();
                
                botNameElem.textContent = botData.name;
                botDescriptionElem.textContent = botData.description;
                
                if (botData.imageUrl) {
                    botAvatarElem.src = botData.imageUrl;
                }
                
                // Memuat riwayat chat
                loadChatHistory();
            } catch (error) {
                console.error('Error loading bot data:', error);
                alert('Gagal memuat data bot');
            }
        }
        
        // Fungsi untuk memuat riwayat chat
        function loadChatHistory() {
            if (!botData || !botData.chatHistory) return;
            
            chatMessages.innerHTML = '';
            
            botData.chatHistory.forEach(chat => {
                addMessageToChat(chat.user, 'user');
                addMessageToChat(chat.bot, 'bot');
            });
            
            scrollToBottom();
        }
        
        // Fungsi untuk mengirim pesan
        async function sendMessage() {
            const message = messageInput.value.trim();
            
            if (!message) return;
            
            // Menambahkan pesan pengguna ke chat
            addMessageToChat(message, 'user');
            messageInput.value = '';
            
            // Menampilkan indikator typing
            const typingIndicator = addTypingIndicator();
            
            try {
                const response = await fetch(`/api/chat/${botId}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ message })
                });
                
                const result = await response.json();
                
                // Menghapus indikator typing
                typingIndicator.remove();
                
                // Menambahkan balasan bot ke chat
                addMessageToChat(result.reply, 'bot');
            } catch (error) {
                console.error('Error sending message:', error);
                
                // Menghapus indikator typing
                typingIndicator.remove();
                
                // Menampilkan pesan error
                addMessageToChat('Maaf, terjadi kesalahan. Silakan coba lagi.', 'bot');
            }
        }
        
        // Fungsi untuk menambahkan pesan ke chat
        function addMessageToChat(text, sender) {
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${sender}-message`;
            
            const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            messageDiv.innerHTML = `
                <div>${text}</div>
                <div class="message-time">${time}</div>
            `;
            
            chatMessages.appendChild(messageDiv);
            scrollToBottom();
        }
        
        // Fungsi untuk menambahkan indikator typing
        function addTypingIndicator() {
            const typingDiv = document.createElement('div');
            typingDiv.className = 'message bot-message typing-indicator';
            typingDiv.id = 'typing-indicator';
            typingDiv.innerHTML = `
                <div>Mengetik...</div>
            `;
            
            chatMessages.appendChild(typingDiv);
            scrollToBottom();
            
            return typingDiv;
        }
        
        // Fungsi untuk scroll ke bawah
        function scrollToBottom() {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    });
}
