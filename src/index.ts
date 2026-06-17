import { staticPlugin } from "@elysiajs/static";
import jwt from "@elysiajs/jwt";
import { authRoutes } from "./auth";
import Elysia, { file } from "elysia";
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
  .get("/register", file("public/register.html"))
  .get("/login", file("public/login.html"))
  .get("/chat", file("public/chat.html"))
  .get("/chat/*", file("public/chat.html"))
  .get("/admin", file("public/admin.html"))
  .get("/", () => file("./public/index.html"))
  .use(staticPlugin({ assets: "public", prefix: "" }))
  .listen(3000);
