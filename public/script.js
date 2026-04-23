import { Parser, HtmlRenderer } from "https://esm.sh/commonmark";

const parser = new Parser();
const renderer = new HtmlRenderer();
const history = [];
const speed = 5;

const apiUrl = `${window.location.origin}/api`;

const input = document.getElementById("input");
const button = document.getElementById("butone");

function sendMessageKeyPress(event) {
    if (event.key === "Enter") {
        sendMessage();
    }
}

async function getMessages(chatId) {
    const messages = document.getElementById("lechonk");
    if (!messages) return;

    const response = await fetch(`${apiUrl}/get-chat/${chatId}`, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
        },
        credentials: "include",
    });
    if (!response.ok) {
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

export async function sendMessage() {
    const messages = document.getElementById("lechonk");
    if (!messages) return;

    const input = document.getElementById("input");
    if (!input) return;

    const response = await fetch(`${apiUrl}/send-message`, {
        method: "POST",
        body: JSON.stringify({
            chatId: 1,
            message: input.value,
        }),
        headers: {
            "Content-Type": "application/json",
        },
        credentials: "include",
    });
    if (!response.ok || !response.body) {
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

await getMessages(1);
