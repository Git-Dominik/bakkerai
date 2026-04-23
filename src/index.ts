import { Context, Elysia, t, ElysiaCustomStatusResponse } from "elysia";
import { streamText } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { staticPlugin } from "@elysiajs/static";
import { PrismaClient } from "../generated/prisma/client";
import { hash } from "argon2";
import { PrismaBunSqlite } from "prisma-adapter-bun-sqlite";

const adapter = new PrismaBunSqlite({ url: `${process.env.DATABASE_URL}` });
const prisma = new PrismaClient({ adapter });
await prisma.$connect().catch((e) => {
    console.error("Failed to connect to database:", e);
    process.exit(1);
});

const groq = createGroq({
    apiKey: process.env.lekey,
});

const api = new Elysia({ prefix: "/api" })
    .post(
        "/register",
        async ({ body }) => {
            await prisma.user.create({
                data: {
                    name: body.name,
                    email: body.email,
                    password: await hash(body.password),
                },
            });

            return new ElysiaCustomStatusResponse("OK", "");
        },
        {
            body: t.Object({
                name: t.String(),
                email: t.String({ format: "email" }),
                password: t.String(),
            }),
        },
    )
    .post("/send-message", async ({ request }: Context) => {
        const stream = streamText({
            model: groq("meta-llama/llama-4-scout-17b-16e-instruct"),
            system: "You are Hina Sorasaki",
            prompt: await request.text(),
        });

        return stream.textStream;
    });

new Elysia()
    .use(api)
    .use(staticPlugin({ assets: "public", prefix: "" }))
    .listen(3000);
