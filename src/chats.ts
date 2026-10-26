import { Elysia, t, ElysiaCustomStatusResponse } from "elysia";
import { generateText, modelMessageSchema, stepCountIs, streamText } from "ai";
import jwt from "@elysiajs/jwt";
import { prisma, groq } from "./db";
import { JWT_SECRET } from "./config";
import {
    getLessonTopicsTool,
    getLessonItemsTool,
    getLessonPageTool,
    getRecipesCategoriesTool,
    getRecipesTool,
    getRecipeTool,
} from "./api/svh";

const topicModel = groq("openai/gpt-oss-20b");
const pendingTopics = new Set<number>();

function sanitizeTopic(text: string) {
    return text
        .replace(/^[\s"'`]+|[\s"'`.!?]+$/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 60);
}

async function generateChatTopic(chatId: number) {
    if (pendingTopics.has(chatId)) return;
    pendingTopics.add(chatId);

    try {
        const chat = await prisma.chat.findUnique({
            where: { id: chatId },
        });
        if (!chat || chat.topic) return;

        const messages = await prisma.message.findMany({
            where: { chatId },
            orderBy: { id: "asc" },
            take: 12,
        });
        if (messages.length === 0) return;

        const history = messages
            .map((m) => `${m.userId ? "Gebruiker" : "Assistent"}: ${m.content}`)
            .join("\n");

        const { text } = await generateText({
            model: topicModel,
            system:
                "Je vat een gesprek samen als een korte, duidelijke chattitel in het Nederlands. Antwoord alleen met de titel: maximaal 6 woorden, zonder aanhalingstekens of leestekens aan het einde.",
            prompt: history,
        });

        const topic = sanitizeTopic(text);
        if (!topic) return;

        await prisma.chat.update({
            where: { id: chatId },
            data: { topic },
        });
    } catch (e) {
        console.error(
            "Failed to generate chat topic:",
            e instanceof Error ? e.message : e,
        );
    } finally {
        pendingTopics.delete(chatId);
    }
}

async function getAuthUser(auth: { value?: string }, jwt: any) {
    const token = auth?.value;
    if (!token) return null;

    try {
        const claims = await jwt.verify(token);
        if (!claims || typeof claims.email !== "string") return null;

        return await prisma.user.findUnique({
            where: { email: claims.email, emailVerified: true },
        });
    } catch {
        return null;
    }
}

export const chatRoutes = new Elysia()
    .use(jwt({ name: "jwt", secret: JWT_SECRET }))
    .get(
        "/chats",
        async ({ cookie: { auth }, jwt }) => {
            const user = await getAuthUser(auth, jwt);
            if (!user) {
                return new ElysiaCustomStatusResponse("Unauthorized", {
                    summary: "Invalid token",
                });
            }

            const chats = await prisma.chat.findMany({
                where: { userId: user.id },
                orderBy: { id: "desc" },
                include: {
                    messages: {
                        orderBy: { id: "asc" },
                        take: 1,
                    },
                },
            });

            return chats.map((chat) => {
                let topic = chat.topic;
                let pending = false;

                if (!topic) {
                    const firstMessage = chat.messages[0]?.content;
                    if (firstMessage) {
                        topic =
                            sanitizeTopic(firstMessage.split("\n")[0]) || null;
                        pending = true;
                        void generateChatTopic(chat.id);
                    }
                }

                return { id: chat.id, topic, pending };
            });
        },
        {
            cookie: t.Cookie({
                auth: t.Optional(t.String()),
            }),
        },
    )
    .get(
        "/chats/:chatId/messages",
        async ({ params: { chatId }, cookie: { auth }, jwt }) => {
            const user = await getAuthUser(auth, jwt);
            if (!user) {
                return new ElysiaCustomStatusResponse("Unauthorized", {
                    summary: "Invalid token",
                });
            }

            const chat = await prisma.chat.findFirst({
                where: { id: chatId, userId: user.id },
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
                auth: t.Optional(t.String()),
            }),
            params: t.Object({
                chatId: t.Number(),
            }),
        },
    )
    .post(
        "/chats/",
        async ({ cookie: { auth }, jwt }) => {
            const user = await getAuthUser(auth, jwt);
            if (!user) {
                return new ElysiaCustomStatusResponse("Unauthorized", {
                    summary: "Invalid token",
                });
            }

            const chat = await prisma.chat.create({
                data: {
                    userId: user.id,
                },
            });
            return new ElysiaCustomStatusResponse("OK", chat.id);
        },
        {
            cookie: t.Cookie({
                auth: t.Optional(t.String()),
            }),
        },
    )
    .post(
        "/chats/:chatId/messages",
        async ({
            params: { chatId },
            body,
            cookie: { auth },
            jwt,
            request,
        }) => {
            const user = await getAuthUser(auth, jwt);
            if (!user) {
                return new ElysiaCustomStatusResponse("Unauthorized", {
                    summary: "Invalid token",
                });
            }

            const chat = await prisma.chat.findFirst({
                where: { id: chatId, userId: user.id },
            });
            if (!chat) {
                return new ElysiaCustomStatusResponse("Not Found", {
                    summary: "Chat not found",
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

            const streamAbort = new AbortController();
            request.signal.addEventListener("abort", () => {
                console.log(
                    "[request] signal aborted, reason:",
                    request.signal.reason,
                    "streamAbort already aborted:",
                    streamAbort.signal.aborted,
                );
                streamAbort.abort();
            });

            const textStream = (abortSignal: AbortSignal) =>
                streamText({
                    model: groq("qwen/qwen3.8-27b"),
                    abortSignal,
                    tools: {
                        getRecipesCategoriesTool,
                        getRecipesTool,
                        getRecipeTool,
                        getLessonTopicsTool,
                        getLessonItemsTool,
                        getLessonPageTool,
                    },
                    stopWhen: stepCountIs(10),
                    system: `
          Je bent een professionele leer-assistent voor Talland bakkerij leerlingen. Je communiceert zakelijk, duidelijk en vriendelijk. Je haalt ALTIJD informatie op via tools. Gebruik NOOIT je eigen kennis.

          STIJL:
          - Gebruik geen emojis, ook niet als ze in tool-output staan
          - Gebruik geen uitroeptekens of informele taal
          - Wees beknopt en schrijf in correct Nederlands
          - Gebruik alleen markdown-opmaak die de leesbaarheid verbetert

          REGELS:
          - Gebruik tools direct, zonder te vragen om bevestiging
          - Noem nooit tool namen aan de gebruiker
          - Antwoord alleen op basis van tool output, nooit op basis van training data

          Leerlijn: getLessonTopicsTool → getLessonItemsTool per topic → getLessonPageTool per item → alle pagina's ophalen als pagesAvailable > 1
          Recepten: getRecipesCategoriesTool of getRecipesTool → getRecipeTool met slug (nooit display naam)

          Recept formaat:
          ## [Naam]
          ### Ingrediënten
          - **[Groep]**: [hoeveelheid]
          ### Werkwijze
          1. **[Eerste twee woorden]** beschrijving.
          ### Foto
          ![Naam](imageUrl) (alleen tonen als beschikbaar)

          Antwoord in het Nederlands, alleen markdown.
        `,
                    prompt: aiMessages,
                    onStepFinish: async (step) => {
                        console.log(
                            "finished step:",
                            step.finishReason,
                            ", toolCalls:",
                            step.toolCalls?.length,
                            ", usage:",
                            step.usage.raw,
                        );
                    },
                    onAbort: async ({ steps }) => {
                        const last = steps[steps.length - 1];
                        console.log(
                            "streamText aborted",
                            "finishedSteps:",
                            steps.length,
                            "lastFinishReason:",
                            last?.finishReason,
                            "requestAborted:",
                            request.signal.aborted,
                        );
                    },
                    onError: async ({ error: e }) => {
                        console.error(
                            "streamText error:",
                            e instanceof Error ? e.message : e,
                            "name:",
                            e instanceof Error ? e.name : typeof e,
                            "cause:",
                            e instanceof Error ? e.cause : undefined,
                            "stack:",
                            e instanceof Error
                                ? e.stack?.split("\n").slice(0, 4).join("\n")
                                : undefined,
                        );
                    },
                    onFinish: async ({ text }) => {
                        await prisma.message.create({
                            data: {
                                content: text,
                                timestamp: new Date(),
                                chatId: chat.id,
                            },
                        });

                        if (!chat.topic) {
                            await generateChatTopic(chat.id);
                        }
                    },
                });

            const readable = new ReadableStream({
                async start(controller) {
                    const encoder = new TextEncoder();
                    try {
                        const stream = textStream(streamAbort.signal);
                        for await (const chunk of stream.fullStream) {
                            if (streamAbort.signal.aborted) return;
                            controller.enqueue(
                                encoder.encode(JSON.stringify(chunk) + "\n"),
                            );
                        }
                    } catch (e: any) {
                        if (e.name !== "AbortError")
                            console.error("stream error:", e);
                    } finally {
                        try {
                            controller.close();
                        } catch {}
                    }
                },
                cancel() {
                    streamAbort.abort();
                },
            });

            return new Response(readable, {
                headers: { "Content-Type": "application/x-ndjson" },
            });
        },
        {
            cookie: t.Cookie({
                auth: t.Optional(t.String()),
            }),
            params: t.Object({
                chatId: t.Number(),
            }),
            body: t.String(),
        },
    );
