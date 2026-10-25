import { staticPlugin } from "@elysiajs/static";
import jwt from "@elysiajs/jwt";
import { authRoutes } from "./auth";
import Elysia, { file, t } from "elysia";
import { chatRoutes } from "./chats";
import { compRoutes } from "./comps";
import { adminRoutes } from "./admin";

const api = new Elysia({ prefix: "/api" })
  .use(jwt({ name: "jwt", secret: "SuperSecretKey" }))
  .use(authRoutes)
  .use(chatRoutes)
  .use(compRoutes)
  .use(adminRoutes);

new Elysia()
  .use(api)
  .use(jwt({ name: "jwt", secret: "SuperSecretKey" }))
  .get("/register", file("public/register.html"))
  .get("/login", file("public/login.html"))
  .get("/chat", file("public/chat.html"))
  .get("/chat/*", file("public/chat.html"))
  .get("/admin", file("public/admin.html"))
  .get(
    "/",
    async ({ cookie: { auth }, jwt, redirect }) => {
      if (auth?.value) {
        try {
          await jwt.verify(auth.value);
          return redirect("/chat");
        } catch {
          // An invalid or expired token should see the login page.
        }
      }

      return file("public/login.html");
    },
    {
      cookie: t.Cookie({
        auth: t.Optional(t.String()),
      }),
    },
  )
  .use(staticPlugin({ assets: "public", prefix: "" }))
  .listen(3000);
