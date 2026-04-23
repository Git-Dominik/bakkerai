import { Context, Elysia, t, ElysiaCustomStatusResponse } from "elysia";
import { streamText } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { staticPlugin } from "@elysiajs/static";
import { PrismaClient } from "../generated/prisma/client";
import { hash } from "argon2";
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
        async ({ body }) => {
            const hashedPassword = await hash(body.password);
            await prisma.user.create({
                data: {
                    name: body.name,
                    email: body.email,
                    password: hashedPassword,
                },
            });

            return new ElysiaCustomStatusResponse("Permanent Redirect", {
                location: "/login",
            });
        },
        {
            body: t.Object({
                name: t.String(),
                email: t.String({ format: "email" }),
                password: t.String(),
            }),
        },
    )
    .post(
        "/login",
        async ({ body, jwt, cookie }) => {
            const hashedPassword = await hash(body.password);

            const user = await prisma.user.findUnique({
                where: { email: body.email },
            });
            if (!user || user.password !== hashedPassword) {
                return new ElysiaCustomStatusResponse("Unauthorized", {});
            }

            const token = await jwt.sign({
                email: body.email,
                password: hashedPassword,
            });
            cookie.auth.set({
                value: token,
                httpOnly: true,
                maxAge: 7 * 86400,
            });

            return new ElysiaCustomStatusResponse("OK", {});
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
        async ({ request, cookie: { auth }, jwt }) => {
            const token = auth?.value;
            if (!token) {
                return new ElysiaCustomStatusResponse("Unauthorized", {});
            }

            const { email } = await jwt.verify(token);

            const user = await prisma.user.findUnique({
                where: { email },
            });
            if (!user) {
                return new ElysiaCustomStatusResponse("Unauthorized", {});
            }

            const stream = streamText({
                model: groq("meta-llama/llama-4-scout-17b-16e-instruct"),
                system: "You are Hina Sorasaki",
                prompt: await request.text(),
            });

            return stream.textStream;
        },
        {
            cookie: t.Cookie({
                auth: t.String(),
            }),
        },
    );

new Elysia()
    .use(api)
    .use(staticPlugin({ assets: "public", prefix: "" }))
    .listen(3000);
