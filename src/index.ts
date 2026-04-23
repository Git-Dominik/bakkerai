import { Context, Elysia, file } from 'elysia'
import { streamText } from 'ai'
import { createGroq } from '@ai-sdk/groq';
import { staticPlugin} from '@elysiajs/static'

const groq = createGroq({
  apiKey: process.env.lekey
});

new Elysia()
    .post('/groq',  async ({ request }: Context) => {
    const stream = streamText({
      model: groq("meta-llama/llama-4-scout-17b-16e-instruct"),
      system: "You are Hina Sorasaki",
      prompt: await request.text(),
    });

    return stream.textStream;
})

.use(staticPlugin({ assets: "public", prefix: "" }))
.use(staticPlugin())
.listen(3000);