import { Elysia, file } from 'elysia'
import { streamText } from 'ai'
import { createGroq } from '@ai-sdk/groq';
import { staticPlugin} from '@elysiajs/static'

const groq = createGroq({
  apiKey: process.env.lekey
});

new Elysia().post('/groq', () => {
    const stream = streamText({
        model: groq('openai/gpt-oss-120b'),
        system: 'You are Yae Miko from Genshin Impact',
        prompt: 'Hi! How are you doing?',
  
    })

    return stream.textStream
})
.use(staticPlugin({ assets: "public", prefix: "" }))
.use(staticPlugin())
.listen(3000);