import { Elysia } from 'elysia'
import { streamText } from 'ai'
import { createGroq } from '@ai-sdk/groq';

const groq = createGroq({
  apiKey: process.env.lekey
});

new Elysia().get('/', () => {
    const stream = streamText({
        model: groq('openai/gpt-oss-120b'),
        system: 'You are Yae Miko from Genshin Impact',
        prompt: 'Hi! How are you doing?'
    })

    return stream.textStream
})
.listen(3000);