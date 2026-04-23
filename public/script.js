import { Parser, HtmlRenderer } from "https://esm.sh/commonmark";

const parser = new Parser();
const renderer = new HtmlRenderer();
const history = [];

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
