async function loadBots() {
  const res = await fetch("/api/bots");
  const bots = await res.json();
  const div = document.getElementById("botsList");
  div.innerHTML = bots.map(b => `
    <div class="bot-card">
      <img src="${b.image || 'https://via.placeholder.com/60'}" width="60">
      <b>${b.name}</b><br>
      <a href="chat.html?id=${b.id}" target="_blank">Chat Sekarang</a>
    </div>
  `).join('');
}

document.getElementById("createBtn").onclick = async () => {
  const name = document.getElementById("botName").value;
  const description = document.getElementById("botDesc").value;
  const image = document.getElementById("botImage").value;

  const res = await fetch("/api/create-bot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description, image })
  });
  const data = await res.json();
  alert("Bot berhasil dibuat! " + data.link);
  loadBots();
};

loadBots();
