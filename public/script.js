import { Parser, HtmlRenderer } from "https://esm.sh/commonmark";

const parser = new Parser();
const renderer = new HtmlRenderer();
const history = [];

const apiUrl = `${window.location.origin}/api`;

window.checkKeyPress = async function checkKeyPress(event) {
    if (event.key === "Enter") {
        check();
    }
};

window.check = async function check() {
    let messages = document.getElementById("lechonk");
    const input = document.getElementById("input");

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
    if (!response.ok) {
        let error = JSON.parse(await response.text());
        let message = document.createElement("p");
        message.innerHTML = error.summary;

        messages.append(message);
        return;
    }

    let userMessage = document.createElement("p");
    userMessage = input.value;
    messages.append(userMessage);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let message = document.createElement("p");
    messages.append(message);

    let fullText = "";
    let assistantReply = "";
    var speed = 5;
    let i = 0;

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
};
