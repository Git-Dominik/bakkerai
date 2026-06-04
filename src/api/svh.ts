import { Mutex } from "async-mutex";
import { firefox, devices, Cookie } from "playwright";

const browser = await firefox.launch({ headless: false, slowMo: 300 });

export type Recipe = {};
export type RecipeTheme = "Banket" | "Brood";
export type RecipeCategory = string;

const mutex = new Mutex();

export function verifyCookie(cookie: Cookie): boolean {
  return cookie.expires > Date.now() / 1000;
}

export async function login(email: string, password: string) {
  await mutex.acquire();

  const context = await browser.newContext();

  if (await Bun.file("storage.json").exists()) {
    await context.setStorageState("storage.json");
    const crCookie = (await context.cookies()).find((c) => c.name === "CR");
    if (crCookie && verifyCookie(crCookie)) {
      console.log("cookie is valid");
      mutex.release();
      await context.close();
      return;
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
  await page.waitForEvent("domcontentloaded");

  const recipeText = await page.locator(".headText").first().textContent();
  const recipeBlocks = (await page.locator(".product-text").all()).map(
    async (h) => await h.textContent(),
  );

  return {
    name: recipeText ?? "",
    blocks: recipeBlocks,
  };
}
