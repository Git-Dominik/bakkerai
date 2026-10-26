import { Tool, tool } from "ai";
import { Mutex } from "async-mutex";
import { firefox, devices, Cookie, Page } from "playwright";
import z from "zod";
import { prisma } from "../db";

const browser = await firefox.launch({ headless: true });
const lessonYear = "Leerjaar-1-uitvoerend-en-zelfstandig";

export type Recipe = {
  name: string;
  personSize: string;
  slug: string;
  intro?: string;
  imageUrl?: string;
  blocks?: string[];
  url: string;
};

export type LessonPage = {
  url: string;
  pagesAvailable: number;
  magazine: string;
};

export type RecipeTheme = "Banket" | "Brood";
export type LessonElement =
  | "Onderwerp"
  | "Magazine"
  | "Werkopdracht"
  | "Theorieopdracht"
  | "Instructie"
  | "Toets";
export type RecipeCategory = string;

const mutex = new Mutex();

// Keep requests to SVH serialized and spaced out, including concurrent app users.
const minimumNavigationGapMs = 2500;
let lastNavigationAt = 0;
let navigationQueue: Promise<void> = Promise.resolve();
const cookieVerificationCacheMs = 10 * 60 * 1000;
let cookieVerifiedUntil = 0;

async function gotoSource(page: Page, url: string) {
  const queuedNavigation = navigationQueue.then(async () => {
    for (let attempt = 1; ; attempt++) {
      const waitMs = Math.max(
        0,
        minimumNavigationGapMs - (Date.now() - lastNavigationAt),
      );
      if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
      lastNavigationAt = Date.now();

      try {
        // Waiting for every resource to finish can make Firefox report
        // NS_ERROR_ABORT when the site redirects or a background request is
        // cancelled. The DOM is sufficient for the scrapers below.
        await page.goto(url, { waitUntil: "domcontentloaded" });
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes("NS_ERROR_ABORT") || attempt >= 3) throw error;

        console.warn(
          `[svh] navigation aborted; retrying (${attempt}/2): ${url}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  });
  navigationQueue = queuedNavigation.catch(() => {});
  await queuedNavigation;
}

const email = Bun.env.SVH_SERVICE_EMAIL;
const password = Bun.env.SVH_SERVICE_PASSWORD;

const _email = email ?? "";
const _password = password ?? "";

export const getRecipesCategoriesTool: Tool = tool({
  description: "Get all recipe categories for a given recipe theme",
  inputSchema: z.object({
    recipeTheme: z.enum(["Banket", "Brood"]).describe("The recipe theme"),
  }),
  execute: ({ recipeTheme }) => {
    console.log(
      `[getRecipesCategoriesTool] called with recipeTheme: ${recipeTheme}`,
    );
    return getRecipesCategories(recipeTheme);
  },
});

export const getRecipesTool = tool({
  description: "Get all recipes slug names for a given theme and category",
  inputSchema: z.object({
    recipeTheme: z.enum(["Banket", "Brood"]).describe("The recipe theme"),
    recipeCategory: z.string().describe("The recipe category"),
  }),
  execute: ({ recipeTheme, recipeCategory }) => {
    console.log(
      `[getRecipesTool] called with recipeTheme: ${recipeTheme}, recipeCategory: ${recipeCategory}`,
    );
    return getRecipes(recipeTheme, recipeCategory);
  },
});

export const getRecipeTool = tool({
  description:
    "Get a single recipe by its slug (as returned by getRecipesTool, do not pass display names only slugs.",
  inputExamples: [
    { input: { recipeName: "BB-Kleinbrood-Abrikozenbolletjes" } },
  ],
  inputSchema: z.object({
    recipeName: z
      .string()
      .regex(/^\S+$/, "Slug must not contain spaces")
      .describe("The recipe slug as returned by getRecipesTool"),
  }),
  execute: ({ recipeName }) => getRecipe(recipeName),
});

export const getLessonTopicsTool = tool({
  description: "Get all lesson topics for leerjaar 1",
  inputSchema: z.object({}),
  execute: () => getLessonTopics(),
});

export const getLessonItemsTool = tool({
  description: "Get lesson items for a given topic",
  inputSchema: z.object({
    topic: z.string().describe("The lesson topic"),
  }),
  execute: ({ topic }) => getLessonItems(topic),
});

export const getLessonPageTool = tool({
  description: "Get the content of a specific lesson page",
  inputSchema: z.object({
    lessonTopic: z.string(),
    lessonItem: z.string(),
    lessonPage: z.number().int().min(1),
    offset: z.number().int().min(0).optional(),
    size: z.number().int().min(100).max(2000).optional(),
  }),
  execute: ({ lessonTopic, lessonItem, lessonPage, offset, size }) =>
    getLessonPage(
      lessonTopic,
      lessonItem,
      lessonPage,
      offset ?? 0,
      size ?? 2000,
    ),
});

export async function verifyCookie(cookie: Cookie): Promise<boolean> {
  const expired = cookie.expires < Date.now() / 1000;
  if (expired) {
    console.log("[verifyCookie] cookie expired");
    return false;
  }

  const context = await browser.newContext(devices["Desktop Firefox"]);
  try {
    await context.setStorageState("storage.json");
    const page = await context.newPage();

    await gotoSource(page, "https://svhbakkerstalent.nl/Recepten");
    await page.waitForLoadState("domcontentloaded");

    const { pathname } = new URL(page.url());
    const valid = pathname === "/Recepten";

    return valid;
  } finally {
    await context.close();
  }
}

export async function login(email: string, password: string) {
  if (!email || !password) {
    throw new Error(
      "SVH lookup requires SVH_SERVICE_EMAIL and SVH_SERVICE_PASSWORD",
    );
  }
  const release = await mutex.acquire();
  let context;

  try {
    context = await browser.newContext();

    if (await Bun.file("storage.json").exists()) {
      await context.setStorageState("storage.json");
      const crCookie = (await context.cookies()).find((c) => c.name === "CR");
      if (crCookie && crCookie.expires >= Date.now() / 1000) {
        if (Date.now() < cookieVerifiedUntil) return;
        if (await verifyCookie(crCookie)) {
          cookieVerifiedUntil = Math.min(
            crCookie.expires * 1000,
            Date.now() + cookieVerificationCacheMs,
          );
          return;
        }
      }

      cookieVerifiedUntil = 0;
      console.log("[login] cookie invalid or expired, getting new cookie");
    } else {
      console.log("[login] no storage.json found, performing full login");
    }

    const page = await context.newPage();
    console.log("[login] navigating to login page");
    await gotoSource(page, "https://svhbakkerstalent.nl/login.html");

    await page.fill("input[id='email']", email);
    await page.fill("input[class='password']", password);
    await page.click(".rememberme label");

    console.log("[login] submitting login form");
    await page.click("input[type='submit']");

    await context.storageState({ path: "storage.json" });
    const loggedInCookie = (await context.cookies()).find((c) => c.name === "CR");
    cookieVerifiedUntil = loggedInCookie
      ? Math.min(
          loggedInCookie.expires * 1000,
          Date.now() + cookieVerificationCacheMs,
        )
      : 0;
    console.log("[login] login successful, storage saved");
  } finally {
    try {
      await context?.close();
    } finally {
      release();
    }
  }
}

export async function getRecipesCategories(
  recipeTheme: RecipeTheme,
  useCache = true,
): Promise<RecipeCategory[]> {
  const cachedCategories = useCache ? await prisma.svhRecipeCategory.findMany({
    where: { theme: recipeTheme },
    select: { name: true },
    orderBy: { name: "asc" },
  }) : [];
  if (cachedCategories.length) return cachedCategories.map(({ name }) => name);

  console.log(`[getRecipesCategories] starting - theme: ${recipeTheme}`);
  await login(_email, _password);

  const context = await browser.newContext(devices["Desktop Firefox"]);
  await context.setStorageState("storage.json");

  const page = await context.newPage();
  try {
    await gotoSource(page, "https://svhbakkerstalent.nl/Recepten");

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
    console.log(`[getRecipesCategories] found ${categories.length} categories`);
    for (const category of categories) {
      const name = await category
        .locator(".text .inner .underlined.title")
        .innerText();
      if (!name) continue;

      categoryNames.push(name);
    }

    console.log(
      `[getRecipesCategories] done - categories: ${JSON.stringify(categoryNames)}`,
    );

    return categoryNames;
  } finally {
    await context.close();
  }
}

export async function getRecipes(
  recipeTheme: RecipeTheme,
  recipeCategory: RecipeCategory,
  useCache = true,
): Promise<string[]> {
  const categoryCached = useCache ? await prisma.svhRecipeCategory.findUnique({
    where: { theme_name: { theme: recipeTheme, name: recipeCategory } },
  }) : null;
  if (categoryCached) {
    const recipes = await prisma.svhRecipe.findMany({
      where: { theme: recipeTheme, category: recipeCategory },
      select: { slug: true },
      orderBy: { name: "asc" },
    });
    return recipes.map(({ slug }) => slug);
  }

  console.log(
    `[getRecipes] starting - theme: ${recipeTheme}, category: ${recipeCategory}`,
  );
  await login(_email, _password);

  const context = await browser.newContext(devices["Desktop Firefox"]);
  await context.setStorageState("storage.json");

  const page = await context.newPage();
  try {
    await gotoSource(page, "https://svhbakkerstalent.nl/Recepten");

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
    await page
      .locator('.option.default[data-text="Kies een onderwerp"]')
      .click();

    console.log(`[getRecipes] selecting category: ${recipeCategory}`);

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

    console.log(`[getRecipes] found ${recipes.length} recipe blocks`);

    for (const recipe of recipes) {
      var name = await recipe.getAttribute("href");
      name = name?.split("/").pop() ?? null;

      if (name) recipeNames.push(name);
    }

    console.log(`[getRecipes] done - recipes: ${JSON.stringify(recipeNames)}`);
    return recipeNames;
  } finally {
    await context.close();
  }
}

export async function getRecipe(recipeName: string): Promise<Recipe> {
  if (recipeName.includes(" ")) {
    throw new Error(`Invalid slug, contains spaces: ${recipeName}`);
  }

  const cachedRecipe = await prisma.svhRecipe.findUnique({
    where: { slug: recipeName },
  });
  if (cachedRecipe) {
    return {
      name: cachedRecipe.name,
      personSize: cachedRecipe.personSize,
      slug: cachedRecipe.slug,
      intro: cachedRecipe.intro ?? undefined,
      imageUrl: cachedRecipe.imageUrl ?? undefined,
      blocks: JSON.parse(cachedRecipe.blocksJson) as string[],
      url: cachedRecipe.url,
    };
  }

  console.log(`[getRecipe] starting - recipeName: ${recipeName}`);
  await login(_email, _password);

  const context = await browser.newContext(devices["Desktop Firefox"]);
  await context.setStorageState("storage.json");

  const page = await context.newPage();
  try {
    await gotoSource(page,
      `https://svhbakkerstalent.nl/Recepten/Productkaarten/${recipeName}`,
    );

    const url = page.url();
    if (
      url.endsWith("/Recepten/Productkaarten/") ||
      url.endsWith("/Recepten/Productkaarten")
    ) {
      throw new Error(`Recipe not found: ${recipeName}`);
    }

    const recipeText = await page.locator(".headText").first().textContent();
    const personSize = await page.locator(".headSubText").first().textContent();

    console.log(
      `[getRecipe] name: "${recipeText}", personSize: "${personSize}"`,
    );

    const recipeBlocks = (
      await Promise.all(
        (await page.locator(".product-text").all()).map((b) => b.textContent()),
      )
    )
      .filter((b): b is string => b !== null)
      .map((b) => b.replace(/\s+/g, " ").trim());

    console.log(`[getRecipe] found ${recipeBlocks.length} blocks`);

    const intro = page.locator(".intro");
    let introText: string | null = null;
    if ((await intro.count()) > 0) {
      introText = await intro.first().textContent();
      console.log(
        `[getRecipe] intro found: "${introText?.substring(0, 80)}..."`,
      );
    } else {
      console.log(`[getRecipe] no intro found`);
    }

    const imageUrl = await page
      .locator(".productImage")
      .first()
      .getAttribute("src");

    console.log(`[getRecipe] imageUrl: ${imageUrl}`);

    const result: Recipe = {
      name: (recipeText ?? "").replace(/\s+/g, " ").trim(),
      personSize: (personSize ?? "").replace(/\s+/g, " ").trim(),
      slug: recipeName,
      intro: introText ?? undefined,
      imageUrl: imageUrl ?? undefined,
      blocks: recipeBlocks,
      url: `https://svhbakkerstalent.nl/Recepten/Productkaarten/${recipeName}`,
    };

    console.log(`[getRecipe] done - returning recipe: ${result.name}`);
    return result;
  } finally {
    await context.close();
  }
}

export async function getLessonTopics(useCache = true): Promise<string[]> {
  const cachedTopics = useCache ? await prisma.svhLessonPage.findMany({
    distinct: ["topic"],
    select: { topic: true },
    orderBy: { topic: "asc" },
  }) : [];
  if (cachedTopics.length) return cachedTopics.map(({ topic }) => topic);

  await login(_email, _password);

  const context = await browser.newContext(devices["Desktop Firefox"]);
  await context.setStorageState("storage.json");

  const page = await context.newPage();
  try {
    await gotoSource(page, `https://svhbakkerstalent.nl/Leerlijn/${lessonYear}`);

    const seen = new Set<string>();

    for (const item of await page
      .locator(".leerlijnMagazineItemWrap a[href]")
      .all()) {
      const href = await item.getAttribute("href");
      if (!href) continue;
      const match = href.match(/\/([^\/]+)\/([^\/]+)$/);
      if (!match) continue;
      seen.add(match[1]);
    }

    return [...seen];
  } finally {
    await context.close();
  }
}

export async function getLessonItems(topic: string, useCache = true): Promise<string[]> {
  const cachedItems = useCache ? await prisma.svhLessonPage.findMany({
    where: { topic },
    distinct: ["item"],
    select: { item: true },
    orderBy: { item: "asc" },
  }) : [];
  if (cachedItems.length) return cachedItems.map(({ item }) => item);

  await login(_email, _password);

  const context = await browser.newContext(devices["Desktop Firefox"]);
  await context.setStorageState("storage.json");

  const page = await context.newPage();
  try {
    await gotoSource(page, `https://svhbakkerstalent.nl/Leerlijn/${lessonYear}`);

    const seen = new Set<string>();

    for (const item of await page
      .locator(".leerlijnMagazineItemWrap a[href]")
      .all()) {
      const href = await item.getAttribute("href");
      if (!href) continue;
      const match = href.match(/\/([^\/]+)\/([^\/]+)$/);
      if (!match) continue;
      if (match[1] !== topic) continue;
      seen.add(match[2]);
    }

    return [...seen];
  } finally {
    await context.close();
  }
}

export async function getLessonPage(
  lessonTopic: string,
  lessonItem: string,
  lessonPage: number,
  offset: number = 0,
  size: number = 1500,
): Promise<LessonPage> {
  const cachedPage = await prisma.svhLessonPage.findUnique({
    where: { topic_item_page: { topic: lessonTopic, item: lessonItem, page: lessonPage } },
  });
  if (cachedPage) {
    return {
      url: cachedPage.url,
      pagesAvailable: cachedPage.pagesAvailable,
      magazine: cachedPage.magazine.substring(offset, offset + size),
    };
  }

  await login(_email, _password);

  const context = await browser.newContext(devices["Desktop Firefox"]);
  await context.setStorageState("storage.json");

  const page = await context.newPage();
  try {
    await gotoSource(page,
      `https://svhbakkerstalent.nl/Leerlijn/${lessonYear}/${lessonTopic}/${lessonItem}/Pagina-${lessonPage}.html`,
    );

    const pagesAvailable = await page
      .locator(".paginatePages > .paginatePage")
      .count();
    if (!pagesAvailable) throw new Error("no pages available");

    const magazine = (await page.locator(".contentWrap").first().textContent())
      ?.replace(/\s+/g, " ")
      .trim();
    if (!magazine) throw new Error("magazine not found");

    return {
      url: page.url(),
      pagesAvailable,
      magazine: magazine.substring(offset, offset + size),
    };
  } finally {
    await context.close();
  }
}

// const categories = await getRecipesCategories("Brood");
// console.log(categories);
//
// const recipes = await getRecipes("Brood", categories[0]);
// console.log(recipes);
//
// const recipe = await getRecipe("cheeks");
// console.log(recipe);
