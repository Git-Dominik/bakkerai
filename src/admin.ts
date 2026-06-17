import { Elysia, t, ElysiaCustomStatusResponse } from "elysia";
import jwt from "@elysiajs/jwt";
import { prisma } from "./db";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@bakkerai.nl";

const adminGuard = async (auth: { value?: string }, jwt: any) => {
  const token = auth?.value;
  if (!token) {
    return new ElysiaCustomStatusResponse("Unauthorized", {
      summary: "Missing token",
    });
  }

  const { email } = await jwt.verify(token);
  if (email !== ADMIN_EMAIL) {
    return new ElysiaCustomStatusResponse("Forbidden", {
      summary: "Admin access required",
    });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return new ElysiaCustomStatusResponse("Unauthorized", {
      summary: "User not found",
    });
  }

  return user;
};

export const adminRoutes = new Elysia()
  .use(jwt({ name: "jwt", secret: "SuperSecretKey" }))
  .get("/admin/ping", () => ({ ok: true, time: Date.now() }))
  .get(
    "/admin/users",
    async ({ cookie: { auth }, jwt }) => {
      const user = await adminGuard(auth, jwt);
      if (user instanceof ElysiaCustomStatusResponse) return user;

      const users = await prisma.user.findMany({
        orderBy: { id: "asc" },
      });

      const usersWithCounts = await Promise.all(
        users.map(async (u) => {
          const [chatCount, messageCount] = await Promise.all([
            prisma.chat.count({ where: { userId: u.id } }),
            prisma.message.count({ where: { userId: u.id } }),
          ]);
          return {
            id: u.id,
            name: u.name,
            email: u.email,
            chatCount,
            messageCount,
          };
        }),
      );

      return usersWithCounts;
    },
    {
      cookie: t.Cookie({
        auth: t.Optional(t.String()),
      }),
    },
  )
  .get(
    "/admin/users/:userId",
    async ({ cookie: { auth }, jwt, params: { userId } }) => {
      const user = await adminGuard(auth, jwt);
      if (user instanceof ElysiaCustomStatusResponse) return user;

      try {
        const [targetUser, totalMessages] = await Promise.all([
          prisma.user.findUnique({ where: { id: userId } }),
          prisma.message.count({ where: { userId } }),
        ]);

        if (!targetUser) {
          return new ElysiaCustomStatusResponse("Not Found", {
            summary: "User not found",
          });
        }

        const userChats = await prisma.chat.findMany({
          where: { userId },
          orderBy: { id: "desc" },
        });

        const chatsWithCounts = await Promise.all(
          userChats.map(async (chat) => {
            const count = await prisma.message.count({
              where: { chatId: chat.id },
            });
            return {
              id: chat.id,
              topic: chat.topic || "Untitled",
              messageCount: count,
            };
          }),
        );

        return {
          id: targetUser.id,
          name: targetUser.name,
          email: targetUser.email,
          messageCount: totalMessages,
          chats: chatsWithCounts,
        };
      } catch (e) {
        console.error("admin/user detail error:", e);
        return new ElysiaCustomStatusResponse("Internal Server Error", {
          summary: String(e),
        });
      }
    },
    {
      cookie: t.Cookie({
        auth: t.Optional(t.String()),
      }),
      params: t.Object({
        userId: t.Number(),
      }),
    },
  )
  .get(
    "/admin/chats/:chatId/messages",
    async ({ cookie: { auth }, jwt, params: { chatId } }) => {
      const user = await adminGuard(auth, jwt);
      if (user instanceof ElysiaCustomStatusResponse) return user;

      const chat = await prisma.chat.findUnique({
        where: { id: chatId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      if (!chat) {
        return new ElysiaCustomStatusResponse("Not Found", {
          summary: "Chat not found",
        });
      }

      const messages = await prisma.message.findMany({
        where: { chatId },
        orderBy: { id: "asc" },
      });

      return {
        chatId: chat.id,
        topic: chat.topic || "Untitled",
        user: {
          id: chat.user.id,
          name: chat.user.name,
          email: chat.user.email,
        },
        messages: messages.map((m) => ({
          id: m.id,
          content: m.content,
          role: m.userId ? "user" : "assistant",
          timestamp: m.timestamp,
        })),
      };
    },
    {
      cookie: t.Cookie({
        auth: t.Optional(t.String()),
      }),
      params: t.Object({
        chatId: t.Number(),
      }),
    },
  );
