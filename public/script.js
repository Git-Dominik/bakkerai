import { Parser, HtmlRenderer } from "https://esm.sh/commonmark";

const parser = new Parser();
const renderer = new HtmlRenderer();
const history = [];
const speed = 5;

const apiUrl = `${window.location.origin}/api`;

const input = document.getElementById("input");
const button = document.getElementById("butone");

let currentChat;
let busy = false;

function sendMessageKeyPress(event) {
  if (event.key === "Enter") {
    sendMessage();
  }
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

  const response = await fetch(`${apiUrl}/chats`, {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) {
    if (response.status === 401) {
      nukeToken();
    }

    let error = JSON.parse(await response.text());
    let message = document.createElement("p");
    message.innerHTML = error.summary || "Error loading chats";

    chats.append(message);
    return;
  }

  const parsedChats = JSON.parse(await response.text());
  if (parsedChats.length !== 0) {
    getMessages(parsedChats[0].id);
  }

  chats.innerHTML = "";

  parsedChats.forEach((chat) => {
    const chatElement = document.createElement("button");
    chatElement.innerHTML = chat.id;
    chatElement.addEventListener("click", () => {
      if (chat.id === currentChat) return;
      getMessages(chat.id);
    });

    chats.append(chatElement);
  });

  const newChatElement = document.createElement("button");
  newChatElement.innerHTML = "New Chat";
  newChatElement.addEventListener("click", () => {
    getChats();
    createChat().then((chatId) => {
      getMessages(chatId);
    });
  });
  chats.append(newChatElement);
}

async function getMessages(chatId) {
  const messages = document.getElementById("lechonk");
  if (!messages) return;

  const response = await fetch(`${apiUrl}/chats/${chatId}/messages`, {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) {
    if (response.status === 401) {
      nukeToken();
    }

    let error = JSON.parse(await response.text());
    let message = document.createElement("p");
    message.innerHTML = error.summary || "Error loading messages";

    messages.append(message);
    return;
  }

  messages.innerHTML = "";

  const parsedMessages = JSON.parse(await response.text());
  parsedMessages.data.forEach((message) => {
    const isUser = message.userId || message.role === "user";
    if (isUser) {
      const usrContainer = document.createElement("div");
      usrContainer.classList.add("user-message-container");
      const messageElement = document.createElement("p");
      messageElement.classList.add("user-message");
      messageElement.innerHTML = message.content;
      usrContainer.append(messageElement);
      messages.append(usrContainer);
    } else {
      const messageElement = document.createElement("p");
      messageElement.classList.add("ai-response");
      messageElement.innerHTML = message.content;
      messages.append(messageElement);
    }
  });

  currentChat = chatId;
}

export async function createChat() {
  const response = await fetch(`${apiUrl}/chats`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    if (response.status === 401) {
      nukeToken();
    }
    return;
  }

  return await response.text();
}

export async function sendMessage() {
  const messages = document.getElementById("lechonk");
  if (!messages) return;

  if (busy) {
    if (!document.getElementById("busy-warning")) {
      const busyElement = document.createElement("p");
      busyElement.id = "busy-warning";
      busyElement.innerHTML = "hollon im cookin";
      messages.append(busyElement);
      console.log("wait for le finish");
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
  }

  if (!input) return;

  const response = await fetch(`${apiUrl}/chats/${currentChat}/messages`, {
    method: "POST",
    body: input.value,
    credentials: "include",
  });
  if (!response.ok || !response.body) {
    if (response.status === 401) {
      nukeToken();
    }

    const usrContainer = document.createElement("div");
    usrContainer.classList.add("user-message-container");

    let userMessage = document.createElement("p");
    userMessage.classList.add("user-message");
    userMessage.innerHTML = input.value;
    usrContainer.append(userMessage);
    messages.append(usrContainer);

    let error = document.createElement("p");
    error.classList.add("ai-response");
    error.innerHTML = "An error occurred";
    messages.append(error);
    busy = false;
    return;
  }

  const usrContainer = document.createElement("div");
  usrContainer.classList.add("user-message-container");

  let userMessage = document.createElement("p");
  userMessage.classList.add("user-message");
  userMessage.innerHTML = input.value;
  usrContainer.append(userMessage);
  messages.append(usrContainer);

  let message = document.createElement("p");
  message.classList.add("ai-response");
  messages.append(message);

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

  history.push({ role: "assistant", content: assistantReply });
  console.log(history);
}

input.addEventListener("keypress", sendMessageKeyPress);
button.addEventListener("click", sendMessage);

await getChats();
