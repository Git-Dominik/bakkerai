import { Context, Elysia } from "elysia";
import { streamText } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { staticPlugin } from "@elysiajs/static";

const groq = createGroq({
  apiKey: process.env.lekey,
});

new Elysia()
  .post("/groq", async ({ request }: Context) => {
    const stream = streamText({
      model: groq("qwen/qwen3-32b"),
      system: "You are Hina Sorasaki",
      prompt: await request.text(),
    });

    return stream.toTextStreamResponse();
  })
  .use(staticPlugin())
  .listen(3000);
