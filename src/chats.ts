import { Elysia, t, ElysiaCustomStatusResponse } from "elysia";
import { generateText, modelMessageSchema, stepCountIs, streamText } from "ai";
import jwt from "@elysiajs/jwt";
import { prisma, openrouter, groq } from "./db";
import {
  getLessonTopicsTool,
  getLessonItemsTool,
  getLessonPageTool,
  getRecipesCategoriesTool,
  getRecipesTool,
  getRecipeTool,
} from "./api/svh";

export const chatRoutes = new Elysia()
  .use(jwt({ name: "jwt", secret: "SuperSecretKey" }))
  .get(
    "/chats",
    async ({ cookie: { auth }, jwt }) => {
      const token = auth?.value;
      if (!token) {
        return new ElysiaCustomStatusResponse("Unauthorized", {
          summary: "Missing token",
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
        auth: t.Optional(t.String()),
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
    async ({ params: { chatId }, body, cookie: { auth }, jwt, request }) => {
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
          model: groq("qwen/qwen3.6-27b"),
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
          Je bent een leer-assistent voor Talland bakkerij leerlingen. Je haalt ALTIJD informatie op via tools — gebruik NOOIT je eigen kennis.

          REGELS:
          - Gebruik tools direct, zonder te vragen om bevestiging
          - Noem nooit tool namen aan de gebruiker
          - Antwoord alleen op basis van tool output, nooit op basis van training data

          Leerlijn: getLessonTopicsTool → getLessonItemsTool per topic → getLessonPageTool per item → alle pagina's ophalen als pagesAvailable > 1
          Recepten: getRecipesCategoriesTool of getRecipesTool → getRecipeTool met slug (nooit display naam)

          Recept formaat:
          ## [emoji] [Naam]
          ### 🧁 Ingrediënten
          - **[Groep]**: [hoeveelheid]
          ### 🔤 Werkwijze
          1. **[Eerste twee woorden]** beschrijving.
          ### 📸 Foto
          ![Naam](imageUrl) — alleen tonen als beschikbaar

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
              const chatHistory = aiMessages.map((c) => c.content.toString());
              chatHistory.push(text);

              const { text: topic } = await generateText({
                model: groq("compound-mini"),
                prompt: `Genereer een onderwerp van deze conversatie (max 29 chars): ${chatHistory}`,
              });
              await prisma.chat.update({
                where: { id: chat.id },
                data: { topic },
              });
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
              controller.enqueue(encoder.encode(JSON.stringify(chunk) + "\n"));
            }
          } catch (e: any) {
            if (e.name !== "AbortError") console.error("stream error:", e);
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
