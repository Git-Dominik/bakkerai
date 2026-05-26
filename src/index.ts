import { staticPlugin } from "@elysiajs/static";
import jwt from "@elysiajs/jwt";
import { authRoutes } from "./auth";
import Elysia, { file } from "elysia";
import { chatRoutes } from "./chats";

const api = new Elysia({ prefix: "/api" })
  .use(jwt({ name: "jwt", secret: "SuperSecretKey" }))
  .use(authRoutes)
  .use(chatRoutes);

new Elysia()
  .use(api)
  .get("/register", file("public/register.html"))
  .get("/login", file("public/login.html"))
  .use(staticPlugin({ assets: "public", prefix: "" }))
  .listen(3000);
