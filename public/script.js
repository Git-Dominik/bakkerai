import { Parser, HtmlRenderer } from "https://esm.sh/commonmark";

const parser = new Parser();
const renderer = new HtmlRenderer();

window.check = async function check() {
    const input = document.getElementById("input");

    const url = "http://localhost:3000/groq";
    const response = await fetch(url, {
        method: "POST",
        body: input.value,
        headers: {
            "Content-Type": "application/json; charset=UTF-8",
        },
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
