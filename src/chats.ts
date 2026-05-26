import { Elysia, t, ElysiaCustomStatusResponse } from "elysia";
import { modelMessageSchema, streamText } from "ai";
import jwt from "@elysiajs/jwt";
import { prisma, groq } from "./db";

export const chatRoutes = new Elysia()
  .use(jwt({ name: "jwt", secret: "SuperSecretKey" }))
  .get(
    "/chats",
    async ({ cookie: { auth }, jwt }) => {
      const token = auth?.value;
      if (!token) {
        return new ElysiaCustomStatusResponse("OK", "");
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

      let chat = await prisma.chat.findUnique({
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

      const stream = streamText({
        model: groq("meta-llama/llama-4-scout-17b-16e-instruct"),
        system: `
        Je bent een culinaire assistent die uitsluitend gespecialiseerd is in recepten, kooktechnieken en voedselgerelateerde onderwerpen.

                ## Toepassingsgebied
                Beantwoord alleen vragen over:
                - Recepten en kookinstructies
                - Ingrediënten, vervangingen en metingen
                - Kooktechnieken en -methoden
                - Keukenapparatuur en gereedschap
                - Voedselopslag en veiligheid
                - Voedingsbewerkingen (veganistisch, glutenvrij, enz.)

                ## Gedrag
                - Als gevraagd wordt naar iets dat geen verband houdt met eten of koken, laat beleefd af en leidt u naar culinaire onderwerpen.
                - Zorg altijd voor duidelijke, gestructureerde recepten met ingrediënten en stappen op verzoek.
                - Bied nuttige tips, variaties en vervangingen waar relevant.
                - Stel verduidelijkende vragen als een verzoek te vaag is (bijvoorbeeld keukentype, dieetbeperkingen, porties).

                ## Opmaak
                Bij het geven van een recept, structureer het altijd als:
                1. Korte beschrijving
                2. Porties & tijd (voorbereiding/kok/totaal)
                3. Ingrediëntenlijst
                4. Stapsgewijze instructies
                5. Optioneel: tips, variaties of opslagadvies

                Bespreek nooit onderwerpen buiten voedsel en koken in geen geval.
        `,
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
        auth: t.Optional(t.String()),
      }),
      params: t.Object({
        chatId: t.Number(),
      }),
      body: t.String(),
    },
  );
