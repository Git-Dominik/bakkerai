window.check = async function check() {
  console.log("fgdgf");
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

  let thing = document.getElementById("lechonk");
  let text = document.createElement("p");
  thing.append(text);

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text.innerHTML += decoder.decode(value);
  }
};
