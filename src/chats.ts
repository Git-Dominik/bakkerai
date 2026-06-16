import { Elysia, t, ElysiaCustomStatusResponse } from "elysia";
import { generateText, modelMessageSchema, stepCountIs, streamText } from "ai";
import jwt from "@elysiajs/jwt";
import { prisma, openrouter } from "./db";
import {
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

      const textStream = () =>
        streamText({
          model: openrouter("google/gemma-4-31b-it:free"),
          abortSignal: request.signal,
          tools: {
            getRecipesCategoriesTool,
            getRecipesTool,
            getRecipeTool,
          },
          stopWhen: stepCountIs(10),
          system: `
        Je bent een recepten-assistent voor Talland leerlingen aan de bakker opleiding. Voor recepten gebruik je altijd de SVH website.

        BELANGRIJK: Je hebt GEEN kennis van recepten, categorieën of thema's uit jezelf.
        Je MOET altijd de tools gebruiken om informatie op te halen. Geef NOOIT een antwoord
        op basis van aannames of training data over recepten.

        Werkwijze:
        1. Gebruiker vraagt om recepten of categorieën → roep DIRECT de tool aan, geen uitleg vooraf
        2. Weet je de slug niet? → roep getRecipesTool aan eerst
        3. Presenteer de resultaten van de tool
        4. Vraag wat de gebruiker wil doen

        Tools:
        - getRecipesCategoriesTool(recipeTheme): categorieën voor "Banket" of "Brood"
        - getRecipesTool(recipeTheme, recipeCategory): geeft slugs terug (bijv. "BB-Kleinbrood-Abrikozenbolletjes")
        - getRecipeTool(recipeName): één recept via slug — gebruik ALTIJD de slug van getRecipesTool, NOOIT een display naam

        Wanneer je een recept weergeeft, gebruik ALTIJD dit formaat:

        ## [emoji] [Receptnaam]

        ### 🧁 Ingrediënten
        - **[Groepnaam]**: [hoeveelheid]

        ### 🔤 Werkwijze
        1. **[Stap]** beschrijving.

        ### 📸 Foto
        ![Receptnaam](imageUrl)

        Regels voor het formaat:
        - Verwijder prefixes zoals "BB-", "BB-Schuim-" uit de weergavenaam maar behoud de slug tussen haakjes
        - Groepeer ingrediënten logisch per onderdeel van het recept
        - Gebruik altijd vette tekst voor de eerste twee woorden van elke stap
        - Toon de foto alleen als imageUrl beschikbaar is

        Antwoord altijd in het Nederlands. Gebruik alleen markdown opmaak.
        `,
          prompt: aiMessages,
          onAbort: async ({ steps }) => {
            console.log("streamText aborted, finishedSteps:", steps);
          },
          onError: async ({ error }) => {
            console.error("streamText error:", error);
          },
          onFinish: async ({ text }) => {
            if (!chat.topic) {
              const chatHistory = aiMessages.map((c) => c.content.toString());
              chatHistory.push(text);

              const { text: topic } = await generateText({
                model: openrouter("google/gemma-4-26b-a4b:free"),
                prompt: `Genereer een onderwerp van deze conversatie (max 29 chars): ${chatHistory}`,
              });
              await prisma.chat.update({
                where: { id: chat.id },
                data: { topic },
              });
            }
            await prisma.message.create({
              data: {
                content: text,
                timestamp: new Date(),
                chatId: chat.id,
              },
            });
          },
        });

      const readable = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          let attempts = 3;

          while (attempts-- > 0) {
            try {
              const stream = textStream();
              for await (const chunk of stream.fullStream) {
                if (request.signal.aborted) return;
                controller.enqueue(
                  encoder.encode(JSON.stringify(chunk) + "\n"),
                );
              }
              break;
            } catch (e: any) {
              if (e.name === "AbortError") return;
              if (attempts === 0) {
                console.error("stream error:", e);
                break;
              }
              await new Promise((r) => setTimeout(r, 1000));
            }
          }

          try {
            controller.close();
          } catch {}
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
