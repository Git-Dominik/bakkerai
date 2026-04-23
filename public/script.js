import { Parser, HtmlRenderer } from "https://esm.sh/commonmark";

const parser = new Parser();
const renderer = new HtmlRenderer();

const apiUrl = `${window.location.origin}/api`;

window.check = async function check() {
    const input = document.getElementById("input");

    const response = await fetch(`${apiUrl}/send-message`, {
        method: "POST",
        body: input.value,
    });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let messages = document.getElementById("lechonk");
    let message = document.createElement("p");
    messages.append(message);

    let fullText = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        fullText += decoder.decode(value);

        const parsed = parser.parse(fullText);
        message.innerHTML = renderer.render(parsed);
    }
};
