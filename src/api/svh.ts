import { Tool, tool } from "ai";
import { Mutex } from "async-mutex";
import path from "path/win32";
import { firefox, devices, Cookie } from "playwright";
import z from "zod";

const browser = await firefox.launch({ headless: false, slowMo: 100 });

export type Recipe = {
  name: string;
  personSize: string;
  slug: string;
  intro?: string;
  imageUrl?: string;
  blocks?: string[];
};

export type RecipeTheme = "Banket" | "Brood";
export type RecipeCategory = string;

const mutex = new Mutex();

const email = Bun.env.SVH_SERVICE_EMAIL;
const password = Bun.env.SVH_SERVICE_PASSWORD;

if (!email || !password) {
  throw new Error(
    "Missing SVH service credentials: set SVH_SERVICE_EMAIL and SVH_SERVICE_PASSWORD",
  );
}

export const getRecipesCategoriesTool: Tool = tool({
  description: "Get all recipe categories for a given recipe theme",
  inputSchema: z.object({
    recipeTheme: z.enum(["Banket", "Brood"]).describe("The recipe theme"),
  }),
  execute: ({ recipeTheme }) => getRecipesCategories(recipeTheme),
});

export const getRecipesTool = tool({
  description: "Get all recipes for a given theme and category",
  inputSchema: z.object({
    recipeTheme: z.enum(["Banket", "Brood"]).describe("The recipe theme"),
    recipeCategory: z.string().describe("The recipe category"),
  }),
  execute: ({ recipeTheme, recipeCategory }) =>
    getRecipes(recipeTheme, recipeCategory),
});

export const getRecipeTool = tool({
  description: "Get a single recipe by name",
  inputSchema: z.object({
    recipeName: z.string().describe("The recipe name/slug"),
  }),
  execute: ({ recipeName }) => getRecipe(recipeName),
});

export async function verifyCookie(cookie: Cookie): Promise<boolean> {
  const expired = cookie.expires < Date.now() / 1000;
  if (expired) {
    return false;
  }

  const context = await browser.newContext(devices["Desktop Firefox"]);
  try {
    await context.setStorageState("storage.json");
    const page = await context.newPage();
    await page.goto("https://svhbakkerstalent.nl/Recepten");
    await page.waitForLoadState("domcontentloaded");
    const { pathname } = new URL(page.url());
    return pathname === "/Recepten";
  } finally {
    await context.close();
  }
}

export async function login(email: string, password: string) {
  await mutex.acquire();

  const context = await browser.newContext();

  if (await Bun.file("storage.json").exists()) {
    await context.setStorageState("storage.json");
    const crCookie = (await context.cookies()).find((c) => c.name === "CR");
    if (crCookie && (await verifyCookie(crCookie))) {
      console.log("cookie is valid");
      mutex.release();
      await context.close();
      return;
    } else {
      console.log("getting new cookie");
    }
  }

  const page = await context.newPage();

  await page.goto("https://svhbakkerstalent.nl/login.html");

  await page.fill("input[id='email']", email);
  await page.fill("input[class='password']", password);
  await page.click(".rememberme label");

  await page.click("input[type='submit']");

  await context.storageState({ path: "storage.json" });
  await context.close();

  mutex.release();
}

export async function getRecipesCategories(
  recipeTheme: RecipeTheme,
): Promise<RecipeCategory[]> {
  const context = await browser.newContext(devices["Desktop Firefox"]);
  await context.setStorageState("storage.json");

  const page = await context.newPage();
  await page.goto("https://svhbakkerstalent.nl/Recepten");

  let categoryNames: string[] = [];

  // expand theme filter
  await page.locator('.option.default[data-text="Kies een thema"]').click();

  // select recipe theme
  await page
    .locator(".option[data-value]", {
      hasText: new RegExp(recipeTheme), // only match exact themename
    })
    .click();

  // expand category filter
  const categoryFilter = page.locator(
    '.option.default[data-text="Kies een onderwerp"]',
  );
  await categoryFilter.click();

  // reset category theme
  const resetButton = page.locator(".option.undo").filter({ visible: true });
  if ((await resetButton.count()) > 0) await resetButton.click();

  // get all categories for the selected theme
  const categories = await page.locator(".list-item.theme-block").all();
  console.log(categories.length);
  for (const category of categories) {
    const name = await category
      .locator(".text .inner .underlined.title")
      .innerText();
    if (!name) continue;

    categoryNames.push(name);
  }

  await context.close();
  return categoryNames;
}

export async function getRecipes(
  recipeTheme: RecipeTheme,
  recipeCategory: RecipeCategory,
): Promise<string[]> {
  const context = await browser.newContext(devices["Desktop Firefox"]);
  await context.setStorageState("storage.json");

  const page = await context.newPage();
  await page.goto("https://svhbakkerstalent.nl/Recepten");

  let recipeNames: string[] = [];

  // expand theme filter
  await page
    .locator('.option.default[data-text="Kies een thema"]')
    .first()
    .click();

  // select recipe theme
  await page
    .locator(".option[data-value]", {
      hasText: new RegExp(recipeTheme), // only match exact themename
    })
    .click();

  // expand category filter
  await page.locator('.option.default[data-text="Kies een onderwerp"]').click();

  console.log(recipeCategory);

  // select category theme
  await page
    .locator(".option[data-value]", {
      hasText: new RegExp(recipeCategory), // only match exact category name
    })
    .click();

  // get all recipes for the selected category and theme
  const recipes = await page
    .locator(".list-item.product-block:not(.dummy)")
    .all();
  for (const recipe of recipes) {
    var name = await recipe.getAttribute("href");
    name = name?.split("/").pop() ?? null;

    if (name) recipeNames.push(name);
  }

  await context.close();
  return recipeNames;
}

export async function getRecipe(recipeName: string): Promise<Recipe> {
  const context = await browser.newContext(devices["Desktop Firefox"]);
  await context.setStorageState("storage.json");

  const page = await context.newPage();
  await page.goto(
    `https://svhbakkerstalent.nl/Recepten/Productkaarten/${recipeName}`,
  );

  const recipeText = await page.locator(".headText").first().textContent();
  const personSize = await page.locator(".headSubText").first().textContent();

  const recipeBlocks = (
    await Promise.all(
      (await page.locator(".product-text").all()).map((b) => b.textContent()),
    )
  )
    .filter((b): b is string => b !== null)
    .map((b) => b.replace(/\s+/g, " ").trim());

  const intro = page.locator(".intro");
  let introText: string | null = null;
  if ((await intro.count()) > 0) {
    introText = await intro.first().textContent();
  }

  const imageUrl = await page
    .locator(".productImage")
    .first()
    .getAttribute("src");

  return {
    name: (recipeText ?? "").replace(/\s+/g, " ").trim(),
    personSize: (personSize ?? "").replace(/\s+/g, " ").trim(),
    slug: recipeName,
    intro: introText,
    imageUrl: imageUrl,
    blocks: recipeBlocks,
  } as Recipe;
}

await login(email, password);

// const categories = await getRecipesCategories("Brood");
// console.log(categories);

// const recipes = await getRecipes("Brood", categories[0]);
// console.log(recipes);

// const recipe = await getRecipe("BB-Kleinbrood-Abrikozenbolletjes");
// console.log(recipe);
