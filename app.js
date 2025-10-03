const connectionForm = document.getElementById("connection-form");
const messageForm = document.getElementById("message-form");
const disconnectButton = document.getElementById("disconnect");
const sendButton = document.getElementById("send");
const clearButton = document.getElementById("clear");
const statusText = document.getElementById("status");
const chatLog = document.getElementById("chat-log");

let client = null;
let joinedChannel = "";

const updateStatus = (message, type = "info") => {
  statusText.textContent = message;
  statusText.dataset.type = type;
  statusText.className = `status ${type}`;
};

const appendMessage = ({ author, text, tags = {} }) => {
  const entry = document.createElement("li");
  entry.className = "chat-entry";

  const meta = document.createElement("div");
  meta.className = "meta";

  const authorSpan = document.createElement("span");
  authorSpan.className = "author";
  authorSpan.textContent = author;
  meta.appendChild(authorSpan);

  const badgesSpan = document.createElement("span");
  badgesSpan.className = "badges";
  const badges = [];
  if (tags["badges"]?.broadcaster) badges.push("Streamer");
  if (tags["mod"]) badges.push("Mod");
  if (tags["subscriber"]) badges.push("Sub");
  badgesSpan.textContent = badges.join(" · ");
  meta.appendChild(badgesSpan);

  const messageParagraph = document.createElement("p");
  messageParagraph.textContent = text;

  entry.append(meta, messageParagraph);
  chatLog.appendChild(entry);
  chatLog.scrollTop = chatLog.scrollHeight;
};

const resetClient = async () => {
  if (client) {
    try {
      await client.disconnect();
    } catch (error) {
      console.warn("Fehler beim Trennen:", error);
    }
  }
  client = null;
  joinedChannel = "";
  sendButton.disabled = true;
  disconnectButton.disabled = true;
  updateStatus("Nicht verbunden");
};

connectionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(connectionForm);
  const username = formData.get("username").trim();
  const token = formData.get("token").trim();
  const channel = formData.get("channel").trim().replace(/^#/, "");

  if (!username || !token || !channel) {
    updateStatus("Bitte fülle alle Felder aus.", "error");
    return;
  }

  await resetClient();
  updateStatus("Verbinde...");

  client = new tmi.Client({
    options: { debug: true },
    connection: {
      secure: true,
      reconnect: true,
    },
    identity: {
      username,
      password: token,
    },
    channels: [channel],
  });

  client.on("message", (_channel, tags, message, self) => {
    if (self) return;
    appendMessage({
      author: tags["display-name"] || tags.username,
      text: message,
      tags,
    });
  });

  client.on("connected", (_addr, _port) => {
    joinedChannel = channel;
    updateStatus(`Verbunden mit #${channel}`, "success");
    sendButton.disabled = false;
    disconnectButton.disabled = false;
  });

  client.on("disconnected", (reason) => {
    updateStatus(`Verbindung getrennt: ${reason || "Unbekannt"}`, "warning");
    sendButton.disabled = true;
    disconnectButton.disabled = true;
  });

  client.on("reconnect", () => {
    updateStatus(`Verbinde erneut mit #${channel}...`, "info");
  });

  try {
    await client.connect();
  } catch (error) {
    console.error(error);
    updateStatus("Verbindung fehlgeschlagen. Prüfe Benutzername, Token und Channel.", "error");
    await resetClient();
  }
});

disconnectButton.addEventListener("click", async () => {
  if (!client) return;
  updateStatus("Trenne Verbindung...");
  await resetClient();
});

messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!client || !joinedChannel) {
    updateStatus("Bitte verbinde dich zuerst mit einem Channel.", "error");
    return;
  }

  const messageInput = document.getElementById("message");
  const text = messageInput.value.trim();
  if (!text) return;

  try {
    await client.say(joinedChannel, text);
    appendMessage({ author: "Du", text });
    messageInput.value = "";
    messageInput.focus();
  } catch (error) {
    console.error(error);
    updateStatus("Nachricht konnte nicht gesendet werden.", "error");
  }
});

clearButton.addEventListener("click", () => {
  chatLog.innerHTML = "";
});

window.addEventListener("beforeunload", () => {
  if (client) {
    client.disconnect();
  }
});
