import { Tool, tool } from "ai";
import { Mutex } from "async-mutex";
import { devices, firefox, type Browser } from "playwright";
import z from "zod";

const BASE_URL = "https://svhbakkerstalent.nl";
const LOGIN_URL = `${BASE_URL}/login.html`;
const RECIPES_URL = `${BASE_URL}/Recepten`;

// Where we persist Playwright storage state (cookies/localStorage).
// Default is colocated with this module so it doesn’t depend on process.cwd().
const STORAGE_STATE_PATH =
  Bun.env.SVH_STORAGE_PATH ?? `${import.meta.dir}/svh.storage.json`;

const HEADLESS =
  Bun.env.SVH_HEADLESS === undefined
    ? true
    : !["0", "false", "no"].includes(Bun.env.SVH_HEADLESS.toLowerCase());

const SLOW_MO = Bun.env.SVH_SLOW_MO ? Number(Bun.env.SVH_SLOW_MO) : 0;

const mutex = new Mutex();
let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = firefox.launch({ headless: HEADLESS, slowMo: SLOW_MO });
  }
  return browserPromise;
}

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

async function verifyStorageState(): Promise<boolean> {
  if (!(await Bun.file(STORAGE_STATE_PATH).exists())) return false;

  const browser = await getBrowser();
  const context = await browser.newContext({
    ...devices["Desktop Firefox"],
    storageState: STORAGE_STATE_PATH,
  });

  try {
    const page = await context.newPage();
    await page.goto(RECIPES_URL);
    await page.waitForLoadState("domcontentloaded");
    const { pathname } = new URL(page.url());
    return pathname === "/Recepten";
  } finally {
    await context.close();
  }
}

async function loginAndPersistStorageState(): Promise<void> {
  const email = Bun.env.SVH_SERVICE_EMAIL;
  const password = Bun.env.SVH_SERVICE_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Missing SVH service credentials: set SVH_SERVICE_EMAIL and SVH_SERVICE_PASSWORD",
    );
  }

  const browser = await getBrowser();
  const context = await browser.newContext({
    ...devices["Desktop Firefox"],
  });

  try {
    const page = await context.newPage();
    await page.goto(LOGIN_URL);
    await page.waitForLoadState("domcontentloaded");

    await page.fill("input[id='email']", email);
    await page.fill("input[class='password']", password);

    // The checkbox is sometimes wrapped; click it if present.
    const rememberLabel = page.locator(".rememberme label");
    if ((await rememberLabel.count()) > 0) {
      await rememberLabel.first().click();
    }

    await page.click("input[type='submit']");

    // Verify login by navigating to the recipes page.
    await page.goto(RECIPES_URL);
    await page.waitForLoadState("domcontentloaded");
    const { pathname } = new URL(page.url());
    if (pathname !== "/Recepten") {
      throw new Error(
        `SVH login failed (expected to land on /Recepten, got ${pathname}).`,
      );
    }

    await context.storageState({ path: STORAGE_STATE_PATH });
  } finally {
    await context.close();
  }
}

export async function ensureSvhAuth(): Promise<void> {
  const release = await mutex.acquire();
  try {
    if (await verifyStorageState()) return;
    await loginAndPersistStorageState();
  } finally {
    release();
  }
}

async function newAuthedContext() {
  await ensureSvhAuth();

  const browser = await getBrowser();
  return browser.newContext({
    ...devices["Desktop Firefox"],
    storageState: STORAGE_STATE_PATH,
  });
}

export const getRecipesCategoriesTool: Tool = tool({
  description: "Get all recipe categories for a given recipe theme",
  inputSchema: z.object({
    recipeTheme: z.enum(["Banket", "Brood"]).describe("The recipe theme"),
  }),
  execute: ({ recipeTheme }) => getRecipesCategories(recipeTheme),
});

export const getRecipesTool: Tool = tool({
  description: "Get all recipes for a given theme and category",
  inputSchema: z.object({
    recipeTheme: z.enum(["Banket", "Brood"]).describe("The recipe theme"),
    recipeCategory: z.string().describe("The recipe category"),
  }),
  execute: ({ recipeTheme, recipeCategory }) =>
    getRecipes(recipeTheme, recipeCategory),
});

export const getRecipeTool: Tool = tool({
  description: "Get a single recipe by name",
  inputSchema: z.object({
    recipeName: z.string().describe("The recipe name/slug"),
  }),
  execute: ({ recipeName }) => getRecipe(recipeName),
});

export async function getRecipesCategories(
  recipeTheme: RecipeTheme,
): Promise<RecipeCategory[]> {
  const context = await newAuthedContext();

  try {
    const page = await context.newPage();
    await page.goto(RECIPES_URL);

    const categoryNames: string[] = [];

    // expand theme filter
    await page.locator('.option.default[data-text="Kies een thema"]').click();

    // select recipe theme
    await page
      .locator(".option[data-value]", {
        hasText: new RegExp(recipeTheme),
      })
      .click();

    // expand category filter
    const categoryFilter = page.locator(
      '.option.default[data-text="Kies een onderwerp"]',
    );
    await categoryFilter.click();

    // reset category theme (if visible)
    const resetButton = page.locator(".option.undo").filter({ visible: true });
    if ((await resetButton.count()) > 0) await resetButton.click();

    // get all categories for the selected theme
    const categories = await page.locator(".list-item.theme-block").all();
    for (const category of categories) {
      const name = await category
        .locator(".text .inner .underlined.title")
        .innerText();
      if (name) categoryNames.push(name);
    }

    return categoryNames;
  } finally {
    await context.close();
  }
}

export async function getRecipes(
  recipeTheme: RecipeTheme,
  recipeCategory: RecipeCategory,
): Promise<string[]> {
  const context = await newAuthedContext();

  try {
    const page = await context.newPage();
    await page.goto(RECIPES_URL);

    const recipeNames: string[] = [];

    // expand theme filter
    await page
      .locator('.option.default[data-text="Kies een thema"]')
      .first()
      .click();

    // select recipe theme
    await page
      .locator(".option[data-value]", {
        hasText: new RegExp(recipeTheme),
      })
      .click();

    // expand category filter
    await page
      .locator('.option.default[data-text="Kies een onderwerp"]')
      .click();

    // select category
    await page
      .locator(".option[data-value]", {
        hasText: new RegExp(recipeCategory),
      })
      .click();

    // get all recipes for the selected category and theme
    const recipes = await page
      .locator(".list-item.product-block:not(.dummy)")
      .all();

    for (const recipe of recipes) {
      const href = await recipe.getAttribute("href");
      const name = href?.split("/").pop() ?? null;
      if (name) recipeNames.push(name);
    }

    return recipeNames;
  } finally {
    await context.close();
  }
}

export async function getRecipe(recipeName: string): Promise<Recipe> {
  const context = await newAuthedContext();

  try {
    const page = await context.newPage();
    await page.goto(`${RECIPES_URL}/Productkaarten/${recipeName}`);
    await page.waitForLoadState("domcontentloaded");

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
      intro: introText ?? undefined,
      imageUrl: imageUrl ?? undefined,
      blocks: recipeBlocks,
    };
  } finally {
    await context.close();
  }
}
