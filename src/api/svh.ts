import { firefox, devices, Cookie } from "playwright";

const browser = await firefox.launch({ headless: false, slowMo: 100 });

export type Recipe = {};
export type RecipeTheme = "Banket" | "Brood";

export async function login(email: string, password: string): Promise<Cookie> {
  if (await Bun.file("cookie").exists()) {
    const cookieText = await Bun.file("cookie").text();
    return JSON.parse(cookieText);
  }

  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://svhbakkerstalent.nl/login.html");

  await page.fill("input[id='email']", email);
  await page.fill("input[class='password']", password);

  await page.click("input[type='submit']");

  const cookies = await context.cookies();
  await context.close();

  const sessionCookie = cookies.find((c) => c.name === "PHPSESSID");
  if (!sessionCookie) {
    throw new Error("PHPSESSID cookie not found");
  }

  await Bun.write("cookie", JSON.stringify(sessionCookie, null, 2));

  return sessionCookie;
}

export async function getRecipesCategories(
  cookie: Cookie,
  recipeTheme: RecipeTheme,
): Promise<string[]> {
  const context = await browser.newContext(devices["Desktop Firefox"]);
  await context.addCookies([cookie]);

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
  let resetButton = page.locator(".option.undo").filter({ visible: true });
  if (resetButton) await resetButton.click();

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
  cookie: Cookie,
  recipeTheme: RecipeTheme,
  recipeCategory: string,
): Promise<string[]> {
  const context = await browser.newContext(devices["Desktop Firefox"]);
  await context.addCookies([cookie]);

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

export async function getRecipe(
  cookie: Cookie,
  recipeName: string,
): Promise<Recipe> {
  const context = await browser.newContext(devices["Desktop Firefox"]);
  await context.addCookies([cookie]);

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
