import { Context, Elysia, t, ElysiaCustomStatusResponse, file } from "elysia";
import { streamText, userModelMessageSchema } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { staticPlugin } from "@elysiajs/static";
import { PrismaClient } from "../generated/prisma/client";
import { hash, verify } from "argon2";
import { PrismaBunSqlite } from "prisma-adapter-bun-sqlite";
import jwt from "@elysiajs/jwt";

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
    .use(jwt({ name: "jwt", secret: "SuperSecretKey" }))
    .post(
        "/register",
        async ({ body, redirect }) => {
            const hashedPassword = await hash(body.password);
            await prisma.user.create({
                data: {
                    name: body.username,
                    email: body.email,
                    password: hashedPassword,
                },
            });

            return redirect("/");
        },
        {
            body: t.Object({
                username: t.String(),
                email: t.String({ format: "email" }),
                password: t.String(),
            }),
        },
    )
    .post(
        "/login",
        async ({ body, jwt, cookie, redirect }) => {
            const user = await prisma.user.findUnique({
                where: { email: body.email },
            });
            if (!user || !(await verify(user.password, body.password))) {
                return new ElysiaCustomStatusResponse("Unauthorized", {
                    summary: "Password incorrect",
                });
            }

            const token = await jwt.sign({
                email: body.email,
                sub: user.id.toString(),
            });
            cookie.auth.set({
                value: token,
                httpOnly: true,
                maxAge: 7 * 86400,
            });

            return redirect("/");
        },
        {
            body: t.Object({
                email: t.String({ format: "email" }),
                password: t.String(),
            }),
        },
    )
    .post(
        "/send-message",
        async ({ body, cookie: { auth }, jwt }) => {
            const token = auth?.value;
            if (!token) {
                return new ElysiaCustomStatusResponse("Unauthorized", {
                    summary: "Invalid token",
                });
            }

            const { email } = await jwt.verify(token);

            const user = await prisma.user.findUnique({
                where: { email },
            });
            if (!user) {
                return new ElysiaCustomStatusResponse("Unauthorized", {
                    summary: "User not found",
                });
            }

            let chat = await prisma.chat.findUnique({
                where: { id: body.chatId },
            });
            if (!chat) {
                chat = await prisma.chat.create({
                    data: {
                        userId: user.id,
                    },
                });
            }

            const messages = await prisma.message.findMany({
                where: { chatId: body.chatId },
            });
            await prisma.message.create({
                data: {
                    content: body.message,
                    timestamp: new Date(),
                    userId: user.id,
                    chatId: body.chatId,
                },
            });

            const stream = streamText({
                model: groq("meta-llama/llama-4-scout-17b-16e-instruct"),
                system: "You are Hina Sorasaki from Blue Archive",
                prompt: messages.map((m) => {
                    return userModelMessageSchema.parse({
                        role: "user",
                        content: m.content,
                    });
                }),
            });

            stream.text.then(async (t) => {
                await prisma.message.create({
                    data: {
                        content: t,
                        timestamp: new Date(),
                        chatId: body.chatId,
                    },
                });
            });

            return stream.textStream;
        },
        {
            cookie: t.Cookie({
                auth: t.String(),
            }),
            body: t.Object({
                chatId: t.Number(),
                message: t.String(),
            }),
        },
    );

new Elysia()
    .use(api)
    .get("/register", file("public/register.html"))
    .get("/login", file("public/login.html"))
    .use(staticPlugin({ assets: "public", prefix: "" }))
    .listen(3000);
