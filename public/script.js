import { Parser, HtmlRenderer } from "https://esm.sh/commonmark";

const parser = new Parser();
const renderer = new HtmlRenderer();
const messageHistory = [];
const speed = 5;

const apiUrl = `${window.location.origin}/api`;

const input = document.getElementById("input");
const button = document.getElementById("butone");

let currentChat;
let busy = false;

function getChatIdFromPath() {
  const match = window.location.pathname.match(/^\/chat\/(.+)$/);
  return match ? match[1] : null;
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

function scrollToBottom() {
  window.scrollTo(0, document.body.scrollHeight);
}

async function nukeToken() {
  await fetch(`${apiUrl}/logout`, {
    method: "POST",
    credentials: "include",
  });
}

async function getChats() {
  const chats = document.getElementById("chats");
  if (!chats) return;

  let response;
  try {
    response = await fetch(`${apiUrl}/chats`, {
      method: "GET",
      credentials: "include",
    });
  } catch {
    return;
  }

  if (!response.ok) {
    if (response.status === 401) {
      nukeToken();
    }
    const message = document.createElement("p");
    try {
      const error = JSON.parse(await response.text());
      message.textContent = error.summary || "Error loading chats";
    } catch {
      message.textContent = "Error loading chats";
    }
    chats.append(message);
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
      navigateToChat(chat.id);
      getMessages(chat.id);
    });
    chats.append(chatElement);
  });

  scrollToBottom();

  const newChatElement = document.createElement("button");
  newChatElement.textContent = "New Chat";
  newChatElement.addEventListener("click", () => {
    createChat().then(async (chatId) => {
      if (!chatId) return;
      navigateToChat(chatId);
      await getMessages(chatId);
      getChats();
    });
  });
  chats.append(newChatElement);

  const chatIdFromPath = getChatIdFromPath();
  if (chatIdFromPath && parsedChats.some((c) => c.id === chatIdFromPath)) {
    getMessages(chatIdFromPath);
  } else if (parsedChats.length > 0) {
    navigateToChat(parsedChats[0].id);
    getMessages(parsedChats[0].id);
  }
}

async function getMessages(chatId) {
  const messages = document.getElementById("lechonk");
  if (!messages) return;

  let response;
  try {
    response = await fetch(`${apiUrl}/chats/${chatId}/messages`, {
      method: "GET",
      credentials: "include",
    });
  } catch {
    return;
  }

  if (!response.ok) {
    if (response.status === 401) {
      nukeToken();
    }
    const message = document.createElement("p");
    try {
      const error = JSON.parse(await response.text());
      message.textContent = error.summary || "Error loading messages";
    } catch {
      message.textContent = "Error loading messages";
    }
    messages.append(message);
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
      const usrContainer = document.createElement("div");
      usrContainer.classList.add("user-message-container");
      const messageElement = document.createElement("p");
      messageElement.classList.add("user-message");
      messageElement.textContent = msg.content || "";
      usrContainer.append(messageElement);
      messages.append(usrContainer);
    } else {
      const messageElement = document.createElement("p");
      messageElement.classList.add("ai-response");
      const parsed = parser.parse(msg.content || "");
      messageElement.innerHTML = renderer.render(parsed);
      messages.append(messageElement);
    }
  });

  currentChat = chatId;
  scrollToBottom();
}

export async function createChat() {
  let response;
  try {
    response = await fetch(`${apiUrl}/chats`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    return;
  }

  if (!response.ok) {
    if (response.status === 401) {
      nukeToken();
    }
    return;
  }

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
    getChats();
  }

  if (!input) return;

  let response;
  try {
    response = await fetch(`${apiUrl}/chats/${currentChat}/messages`, {
      method: "POST",
      body: messageText,
      credentials: "include",
    });
  } catch {
    busy = false;
    return;
  }

  if (!response.ok || !response.body) {
    if (response.status === 401) {
      nukeToken();
    }

    const usrContainer = document.createElement("div");
    usrContainer.classList.add("user-message-container");
    const userMessage = document.createElement("p");
    userMessage.classList.add("user-message");
    userMessage.textContent = messageText;
    usrContainer.append(userMessage);
    messages.append(usrContainer);

    const error = document.createElement("p");
    error.classList.add("ai-response");
    error.textContent = "An error occurred";
    messages.append(error);
    busy = false;
    return;
  }

  const usrContainer = document.createElement("div");
  usrContainer.classList.add("user-message-container");
  const userMessage = document.createElement("p");
  userMessage.classList.add("user-message");
  userMessage.textContent = messageText;
  usrContainer.append(userMessage);
  messages.append(usrContainer);

  let message = document.createElement("p");
  message.classList.add("ai-response");
  messages.append(message);

  scrollToBottom();

  let fullText = "";
  let assistantReply = "";
  let i = 0;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  function typeWriter() {
    if (i < fullText.length) {
      i++;
      const parsed = parser.parse(fullText.slice(0, i));
      message.innerHTML = renderer.render(parsed);
      scrollToBottom();
      setTimeout(typeWriter, speed);
    } else {
      busy = false;
      document.getElementById("busy-warning")?.remove();
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chonk = decoder.decode(value);
    fullText += chonk;
    assistantReply += chonk;

    if (i === fullText.length - chonk.length) typeWriter();
  }

  messageHistory.push({ role: "assistant", content: assistantReply });
}

input.addEventListener("keypress", sendMessageKeyPress);
button.addEventListener("click", sendMessage);

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
