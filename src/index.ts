import { staticPlugin } from "@elysiajs/static";
import jwt from "@elysiajs/jwt";
import { authRoutes } from "./auth";
import Elysia, { file } from "elysia";
import { chatRoutes } from "./chats";
import { compRoutes } from "./comps";

const api = new Elysia({ prefix: "/api" })
  .use(jwt({ name: "jwt", secret: "SuperSecretKey" }))
  .use(authRoutes)
  .use(chatRoutes)
  .use(compRoutes);

new Elysia()
  .use(api)
  .get("/register", file("public/register.html"))
  .get("/login", file("public/login.html"))
  .get("/", () => file("./public/home.html"))
  .use(staticPlugin({ assets: "public", prefix: "" }))
  .listen(3000);
