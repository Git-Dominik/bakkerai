import { Parser, HtmlRenderer } from "https://esm.sh/commonmark";

const parser = new Parser();
const renderer = new HtmlRenderer();
const messageHistory = [];
const speed = 5;

const apiUrl = `${window.location.origin}/api`;

const input = document.getElementById("input");
const button = document.getElementById("butone");
const lechonk = document.getElementById("lechonk");

let currentChat;
let busy = false;
let userScrolledUp = false;

async function apiFetch(url, opts = {}) {
  const res = await fetch(`${apiUrl}${url}`, {
    credentials: "include",
    ...opts,
  });
  if (res.status === 401) {
    await fetch(`${apiUrl}/logout`, { method: "POST", credentials: "include" });
  }
  return res;
}

function addUserMessage(text) {
  const container = document.createElement("div");
  container.classList.add("user-message-container");
  const el = document.createElement("p");
  el.classList.add("user-message");
  el.textContent = text;
  container.append(el);
  document.getElementById("lechonk").append(container);
}

window.useSuggestion = function (btn) {
  input.value = btn.textContent.trim();
  input.focus();
};

const emptyState = document.getElementById("empty-state");
function showEmptyState() {
  emptyState.classList.toggle("visible", lechonk.children.length === 0);
}

function getChatIdFromPath() {
  const match = window.location.pathname.match(/^\/chat\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

function navigateToChat(chatId) {
  const newPath = chatId ? `/chat/${chatId}` : "/chat";
  if (window.location.pathname !== newPath) {
    window.history.pushState({ chatId }, "", newPath);
  }
  currentChat = chatId;
}

function sendMessageKeyPress(event) {
  if (event.key === "Enter") {
    sendMessage();
  }
}

function isNearBottom() {
  return lechonk.scrollTop + lechonk.clientHeight >= lechonk.scrollHeight - 100;
}

function scrollToBottom() {
  if (userScrolledUp) return;
  lechonk.scrollTop = lechonk.scrollHeight;
}

async function getChats() {
  const chats = document.getElementById("chats");
  if (!chats) return;

  const response = await apiFetch("/chats").catch(() => null);
  if (!response || !response.ok) {
    if (response) {
      const message = document.createElement("p");
      try {
        const error = JSON.parse(await response.text());
        message.textContent = error.summary || "Error loading chats";
      } catch {
        message.textContent = "Error loading chats";
      }
      chats.append(message);
    }
    return;
  }

  let parsedChats;
  try {
    parsedChats = JSON.parse(await response.text());
  } catch {
    return;
  }

  chats.innerHTML = "";

  parsedChats.forEach((chat) => {
    const chatElement = document.createElement("button");
    chatElement.textContent = `Chat ${chat.id}`;
    chatElement.classList.add("chatButton");
    chatElement.addEventListener("click", () => {
      if (chat.id === currentChat) return;
      userScrolledUp = false;
      navigateToChat(chat.id);
      getMessages(chat.id);
    });
    chats.append(chatElement);
  });

  scrollToBottom();

  const newChatElement = document.createElement("button");
  newChatElement.textContent = "+ New Chat";
  newChatElement.classList.add("new-chat-btn");
  newChatElement.addEventListener("click", () => {
    userScrolledUp = false;
    currentChat = null;
    lechonk.innerHTML = "";
    navigateToChat(null);
    showEmptyState();
  });
  chats.append(newChatElement);

  const chatIdFromPath = getChatIdFromPath();
  if (chatIdFromPath && parsedChats.some((c) => c.id === chatIdFromPath)) {
    getMessages(chatIdFromPath);
  }
}

async function getMessages(chatId) {
  const messages = document.getElementById("lechonk");
  if (!messages) return;

  const response = await apiFetch(`/chats/${chatId}/messages`).catch(() => null);
  if (!response || !response.ok) {
    if (response) {
      const message = document.createElement("p");
      try {
        const error = JSON.parse(await response.text());
        message.textContent = error.summary || "Error loading messages";
      } catch {
        message.textContent = "Error loading messages";
      }
      messages.append(message);
    }
    return;
  }

  messages.innerHTML = "";

  let parsedMessages;
  try {
    parsedMessages = JSON.parse(await response.text());
  } catch {
    return;
  }

  parsedMessages.data.forEach((msg) => {
    const isUser = msg.userId || msg.role === "user";
    if (isUser) {
      addUserMessage(msg.content || "");
    } else {
      const messageElement = document.createElement("p");
      messageElement.classList.add("ai-response");
      console.log(msg.content);
      const parsed = parser.parse(msg.content || "");
      messageElement.innerHTML = renderer.render(parsed);
      messages.append(messageElement);
    }
  });

  currentChat = chatId;
  scrollToBottom();
  showEmptyState();
}

export async function createChat() {
  const response = await apiFetch("/chats", { method: "POST" }).catch(() => null);
  if (!response || !response.ok) return;
  return await response.text();
}

export async function sendMessage() {
  const messageText = input.value;
  input.value = "";

  const messages = document.getElementById("lechonk");
  if (!messages) return;

  if (busy) {
    if (!document.getElementById("busy-warning")) {
      const busyElement = document.createElement("p");
      busyElement.id = "busy-warning";
      busyElement.textContent = "hollon im cookin";
      messages.append(busyElement);
    }
    return;
  }
  busy = true;

  if (!currentChat) {
    currentChat = await createChat();
    if (!currentChat) {
      busy = false;
      return;
    }
    navigateToChat(currentChat);
  }

  if (!input) return;

  const response = await apiFetch(`/chats/${currentChat}/messages`, {
    method: "POST",
    body: messageText,
  }).catch(() => null);

  if (!response || !response.ok || !response.body) {
    if (response) addUserMessage(messageText);
    const error = document.createElement("p");
    error.classList.add("ai-response");
    error.textContent = "An error occurred";
    messages.append(error);
    busy = false;
    return;
  }

  addUserMessage(messageText);

  let message = document.createElement("p");
  message.classList.add("ai-response");
  messages.append(message);

  scrollToBottom();

  let fullText = "";
  let assistantReply = "";
  let renderedLen = 0;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  function showToolIndicator(type, name) {
    if (type === "reasoning") {
      let el = document.getElementById("reasoning-block");
      if (!el) {
        el = document.createElement("div");
        el.id = "reasoning-block";
        el.classList.add("reasoning-indicator", "loading");
        el.innerHTML = `
          <div class="spinner"></div>
          <span class="reasoning-title">Aan het nadenken...</span>
        `;
        message.before(el);
      }
      scrollToBottom();
      return;
    }

    if (type === "reasoning-done") {
      document.getElementById("reasoning-block")?.remove();
      scrollToBottom();
      return;
    }

    if (type === "tool") {
      let el = document.getElementById(`tool-${name}`);
      if (!el) {
        el = document.createElement("div");
        el.id = `tool-${name}`;
        el.classList.add("tool-indicator", "loading");
        el.innerHTML = `
          <div class="spinner"></div>
          <span class="tool-name">${name.replace("Tool", "")}</span>
        `;
        message.before(el);
      }
      scrollToBottom();
      return;
    }

    if (type === "tool-done") {
      const el = document.getElementById(`tool-${name}`);
      if (el) {
        el.classList.remove("loading");
        el.classList.add("done");
      }
      scrollToBottom();
    }
  }

  let typing = false;

  function typeWriter() {
    if (typing) return;
    typing = true;
    function tick() {
      if (renderedLen < fullText.length) {
        renderedLen++;
        const parsed = parser.parse(fullText.slice(0, renderedLen));
        message.innerHTML = renderer.render(parsed);
        scrollToBottom();
        setTimeout(tick, speed);
      } else {
        typing = false;
        busy = false;
        document.getElementById("busy-warning")?.remove();
      }
    }
    tick();
  }

  function handleChunk(chunk) {
    switch (chunk.type) {
      case "text-delta":
        fullText += chunk.text;
        assistantReply += chunk.text;
        typeWriter();
        break;
      case "reasoning-start":
        showToolIndicator("reasoning");
        break;
      case "reasoning-end":
        showToolIndicator("reasoning-done");
        break;
      case "tool-call":
        showToolIndicator("tool", chunk.toolName);
        break;
      case "tool-result":
        showToolIndicator("tool-done", chunk.toolName);
        break;
    }
  }

  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value);

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try { handleChunk(JSON.parse(line)); } catch {}
    }
  }

  if (buffer.trim()) {
    try { handleChunk(JSON.parse(buffer)); } catch {}
  }

  showEmptyState();
  messageHistory.push({ role: "assistant", content: assistantReply });
}

input.addEventListener("keypress", sendMessageKeyPress);
button.addEventListener("click", sendMessage);

lechonk.addEventListener("scroll", () => {
  userScrolledUp = !isNearBottom();
});

window.addEventListener("popstate", () => {
  const chatId = getChatIdFromPath();
  if (chatId) {
    currentChat = chatId;
    getMessages(chatId);
  } else if (currentChat) {
    currentChat = null;
    const el = document.getElementById("lechonk");
    if (el) el.innerHTML = "";
  }
});

await getChats();
showEmptyState();
