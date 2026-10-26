import { staticPlugin } from "@elysiajs/static";
import jwt from "@elysiajs/jwt";
import { authRoutes } from "./auth";
import Elysia, { file, t } from "elysia";
import { chatRoutes } from "./chats";
import { compRoutes } from "./comps";
import { adminRoutes } from "./admin";
import { prisma } from "./db";
import { JWT_SECRET, isAdminEmail } from "./config";

const api = new Elysia({ prefix: "/api" })
  .use(jwt({ name: "jwt", secret: JWT_SECRET }))
  .use(authRoutes)
  .use(chatRoutes)
  .use(compRoutes)
  .use(adminRoutes);

function readCookie(request: Request, name: string) {
  const header = request.headers.get("cookie");
  if (!header) return undefined;

  for (const entry of header.split(";")) {
    const separator = entry.indexOf("=");
    if (separator === -1) continue;
    if (entry.slice(0, separator).trim() === name) {
      const value = entry.slice(separator + 1).trim();
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }

  return undefined;
}

function redirectTo(path: string) {
  return new Response(null, {
    status: 302,
    headers: { Location: path },
  });
}

const isChatPage = (pathname: string) =>
  pathname === "/chat" ||
  pathname.startsWith("/chat/") ||
  pathname === "/chat.html";

const isAdminPage = (pathname: string) =>
  pathname === "/admin" || pathname === "/admin.html";

const isAuthPage = (pathname: string) =>
  pathname === "/login" ||
  pathname === "/login.html" ||
  pathname === "/register" ||
  pathname === "/register.html";

async function pageUser(token: string | undefined, jwt: any) {
  if (!token) return null;

  try {
    const claims = await jwt.verify(token);
    if (!claims || typeof claims.email !== "string") return null;

    return await prisma.user.findUnique({
      where: { email: claims.email, emailVerified: true },
      select: { email: true },
    });
  } catch {
    return null;
  }
}

new Elysia()
  .use(jwt({ name: "jwt", secret: JWT_SECRET }))
  .onRequest(async ({ request, jwt }) => {
    const { pathname } = new URL(request.url);
    const adminPage = isAdminPage(pathname);

    if (isAuthPage(pathname)) {
      const user = await pageUser(readCookie(request, "auth"), jwt);
      if (user) return redirectTo("/chat");
      return;
    }

    if (!adminPage && !isChatPage(pathname)) return;

    const user = await pageUser(readCookie(request, "auth"), jwt);
    if (!user) return redirectTo("/login");
    if (adminPage && !isAdminEmail(user.email)) return redirectTo("/chat");
  })
  .use(api)
  .get(
    "/register",
    async ({ cookie: { auth }, jwt, redirect }) => {
      const user = await pageUser(auth?.value, jwt);
      if (user) return redirect("/chat");
      return file("public/register.html");
    },
    {
      cookie: t.Cookie({
        auth: t.Optional(t.String()),
      }),
    },
  )
  .get(
    "/login",
    async ({ cookie: { auth }, jwt, redirect }) => {
      const user = await pageUser(auth?.value, jwt);
      if (user) return redirect("/chat");
      return file("public/login.html");
    },
    {
      cookie: t.Cookie({
        auth: t.Optional(t.String()),
      }),
    },
  )
  .get("/verify", file("public/verify.html"))
  .get("/forgot-password", file("public/forgot-password.html"))
  .get("/reset-password", file("public/reset-password.html"))
  .get(
    "/chat",
    async ({ cookie: { auth }, jwt, redirect }) => {
      const user = await pageUser(auth?.value, jwt);
      if (!user) return redirect("/login");
      return file("public/chat.html");
    },
    {
      cookie: t.Cookie({
        auth: t.Optional(t.String()),
      }),
    },
  )
  .get(
    "/chat/*",
    async ({ cookie: { auth }, jwt, redirect }) => {
      const user = await pageUser(auth?.value, jwt);
      if (!user) return redirect("/login");
      return file("public/chat.html");
    },
    {
      cookie: t.Cookie({
        auth: t.Optional(t.String()),
      }),
    },
  )
  .get(
    "/admin",
    async ({ cookie: { auth }, jwt, redirect }) => {
      const user = await pageUser(auth?.value, jwt);
      if (!user) return redirect("/login");
      if (!isAdminEmail(user.email)) return redirect("/chat");
      return file("public/admin.html");
    },
    {
      cookie: t.Cookie({
        auth: t.Optional(t.String()),
      }),
    },
  )
  .get(
    "/",
    async ({ cookie: { auth }, jwt, redirect }) => {
      const user = await pageUser(auth?.value, jwt);
      if (user) return redirect("/chat");

      return file("public/login.html");
    },
    {
      cookie: t.Cookie({
        auth: t.Optional(t.String()),
      }),
    },
  )
  .use(staticPlugin({ assets: "public", prefix: "" }))
  .listen(Number(Bun.env.PORT) || 3000);
