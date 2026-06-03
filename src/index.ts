import { staticPlugin } from "@elysiajs/static";
import jwt from "@elysiajs/jwt";
import { authRoutes } from "./auth";
import Elysia, { file } from "elysia";
import { chatRoutes } from "./chats";
import { compRoutes } from "./comps";

import { login, getRecipesCategories, getRecipes, getRecipe } from "./api/svh";

const cookie = await login("c.lust@talland.nl", "Welkom123!");
console.log(cookie.value);

const categories = await getRecipesCategories(cookie, "Brood");
console.log(categories);

const recipes = await getRecipes(cookie, "Brood", categories[0]);
console.log(recipes);

const recipe = await getRecipe(cookie, recipes[0]);
console.log(recipe);

const api = new Elysia({ prefix: "/api" })
  .use(jwt({ name: "jwt", secret: "SuperSecretKey" }))
  .use(authRoutes)
  .use(chatRoutes)
  .use(compRoutes);

new Elysia()
  .use(api)
  .get("/register", file("public/register.html"))
  .get("/login", file("public/login.html"))
  .use(staticPlugin({ assets: "public", prefix: "" }))
  .listen(3000);
