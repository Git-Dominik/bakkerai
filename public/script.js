import { Parser, HtmlRenderer } from "https://esm.sh/commonmark";

const parser = new Parser();
const renderer = new HtmlRenderer();
const history = [];

window.check = async function check() {
    const input = document.getElementById("input");

    history.push({ role: "user", content: input.value })

    const url = "http://localhost:3000/groq";
    const response = await fetch(url, {
        method: "POST",
        body: JSON.stringify({ messages: history }),
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
