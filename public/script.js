import { Parser, HtmlRenderer } from "https://esm.sh/commonmark";

const parser = new Parser();
const renderer = new HtmlRenderer();
const history = [];
const speed = 5;
const currentChat = 1;

const apiUrl = `${window.location.origin}/api`;

const input = document.getElementById("input");
const button = document.getElementById("butone");

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
    parsedChats.forEach((chat) => {
        const chatElement = document.createElement("button");
        chatElement.innerHTML = chat.name;
        chats.append(chatElement);
    });
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

    const parsedMessages = JSON.parse(await response.text());
    parsedMessages.data.forEach((message) => {
        const messageElement = document.createElement("p");
        messageElement.innerHTML = message.content;
        messages.append(messageElement);
    });
}
let busy = false;

export async function sendMessage() {
    const messages = document.getElementById("lechonk");
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
    if (!messages) return;

    const input = document.getElementById("input");
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

        let error = JSON.parse(await response.text());
        let message = document.createElement("p");
        message.innerHTML = error.summary || "An error occurred";

        messages.append(message);
        return;
    }

    let userMessage = document.createElement("p");
    userMessage.innerHTML = input.value;
    messages.append(userMessage);

    let message = document.createElement("p");
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

await getMessages(currentChat);
await getChats();
