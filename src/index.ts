import { Elysia, t, ElysiaCustomStatusResponse, file } from "elysia";
import { modelMessageSchema, streamText } from "ai";
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
    .post("/logout", async ({ cookie, redirect }) => {
        cookie.auth.remove();
        return redirect("/");
    })
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
    .get(
        "/chats",
        async ({ cookie: { auth }, jwt }) => {
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
                    summary: "Invalid token",
                });
            }

            const chats = await prisma.chat.findMany({
                where: { userId: user.id },
            });
            return chats;
        },
        {
            cookie: t.Cookie({
                auth: t.String(),
            }),
        },
    )
    .get(
        "/chats/:chatId/messages",
        async ({ params: { chatId }, cookie: { auth }, jwt }) => {
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
                where: { id: chatId },
            });
            if (!chat) {
                return new ElysiaCustomStatusResponse("Not Found", {
                    summary: "Chat not found",
                });
            }

            let messages = await prisma.message.findMany({
                where: { chatId: chatId },
            });

            return new ElysiaCustomStatusResponse("OK", {
                data: messages,
            });
        },
        {
            cookie: t.Cookie({
                auth: t.String(),
            }),
            params: t.Object({
                chatId: t.Number(),
            }),
        },
    )
    .post(
        "/chats/:chatId/messages",
        async ({ params: { chatId }, body, cookie: { auth }, jwt }) => {
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
                where: { id: chatId },
            });
            if (!chat) {
                chat = await prisma.chat.create({
                    data: {
                        userId: user.id,
                    },
                });
            }

            await prisma.message.create({
                data: {
                    content: body,
                    timestamp: new Date(),
                    userId: user.id,
                    chatId: chat.id,
                },
            });

            const history = await prisma.message.findMany({
                where: { chatId: chat.id },
                orderBy: { id: "asc" },
            });

            const aiMessages = history
                .filter((m) => typeof m.content === "string")
                .map((m) =>
                    modelMessageSchema.parse({
                        role: m.userId ? "user" : "assistant",
                        content: m.content,
                    }),
                );

            console.log(aiMessages);

            const stream = streamText({
                model: groq("meta-llama/llama-4-scout-17b-16e-instruct"),
                system: "You are Hina Sorasaki from Blue Archive",
                prompt: aiMessages,
            });

            stream.text.then(async (t) => {
                await prisma.message.create({
                    data: {
                        content: t,
                        timestamp: new Date(),
                        chatId: chat.id,
                    },
                });
            });

            return stream.textStream;
        },
        {
            cookie: t.Cookie({
                auth: t.String(),
            }),
            params: t.Object({
                chatId: t.Number(),
            }),
            body: t.String(),
        },
    );

new Elysia()
    .use(api)
    .get("/register", file("public/register.html"))
    .get("/login", file("public/login.html"))
    .use(staticPlugin({ assets: "public", prefix: "" }))
    .listen(3000);
