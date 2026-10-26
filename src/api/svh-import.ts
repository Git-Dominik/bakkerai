import {
  getLessonItems,
  getLessonPage,
  getLessonTopics,
  getRecipe,
  getRecipes,
  getRecipesCategories,
  type RecipeTheme,
} from "./svh";
import { prisma } from "../db";

const progress = {
  current: "Starting",
  recipesSaved: 0,
  recipesSkipped: 0,
  recipesFailed: 0,
  lessonPagesSaved: 0,
  lessonPagesSkipped: 0,
  lessonPagesFailed: 0,
};

function reportProgress(current: string) {
  progress.current = current;
  console.log(
    `[svh-import] ${current} | recipes saved ${progress.recipesSaved}, skipped ${progress.recipesSkipped}, failed ${progress.recipesFailed} | lesson pages saved ${progress.lessonPagesSaved}, skipped ${progress.lessonPagesSkipped}, failed ${progress.lessonPagesFailed}`,
  );
}

const heartbeat = setInterval(() => {
  console.log(
    `[svh-import] still working: ${progress.current} | recipes saved ${progress.recipesSaved}, skipped ${progress.recipesSkipped}, failed ${progress.recipesFailed} | lesson pages saved ${progress.lessonPagesSaved}, skipped ${progress.lessonPagesSkipped}, failed ${progress.lessonPagesFailed}`,
  );
}, 15_000);

async function importRecipes() {
  for (const theme of ["Banket", "Brood"] as RecipeTheme[]) {
    reportProgress(`Loading ${theme} recipe categories`);
    const categories = await getRecipesCategories(theme, false);
    for (const [categoryIndex, name] of categories.entries()) {
      reportProgress(`${theme}: loading category ${categoryIndex + 1}/${categories.length} (${name})`);
      await prisma.svhRecipeCategory.upsert({
        where: { theme_name: { theme, name } },
        create: { theme, name },
        update: {},
      });

      const slugs = await getRecipes(theme, name, false);
      for (const [recipeIndex, slug] of slugs.entries()) {
        const label = `${theme}: category ${categoryIndex + 1}/${categories.length}, recipe ${recipeIndex + 1}/${slugs.length} (${slug})`;
        if (await prisma.svhRecipe.findUnique({ where: { slug } })) {
          progress.recipesSkipped++;
          reportProgress(`Skipping saved ${label}`);
          continue;
        }
        reportProgress(`Fetching ${label}`);
        try {
          const recipe = await getRecipe(slug);
          await prisma.svhRecipe.create({
            data: {
              slug,
              theme,
              category: name,
              name: recipe.name,
              personSize: recipe.personSize,
              intro: recipe.intro,
              imageUrl: recipe.imageUrl,
              blocksJson: JSON.stringify(recipe.blocks ?? []),
              url: recipe.url,
            },
          });
          progress.recipesSaved++;
          reportProgress(`Saved ${label}`);
        } catch (error) {
          progress.recipesFailed++;
          console.error(`[svh-import] failed ${label}; it will be retried on the next run:`, error);
          reportProgress(`Continuing after failed ${label}`);
        }
      }
    }
  }
}

async function importLessons() {
  const topics = await getLessonTopics(false);
  for (const [topicIndex, topic] of topics.entries()) {
    reportProgress(`Loading lesson topic ${topicIndex + 1}/${topics.length} (${topic})`);
    const items = await getLessonItems(topic, false);
    for (const [itemIndex, item] of items.entries()) {
      reportProgress(`Lesson ${topicIndex + 1}/${topics.length}, item ${itemIndex + 1}/${items.length} (${topic}/${item}): checking saved pages`);
      const existing = await prisma.svhLessonPage.findMany({
        where: { topic, item },
        select: { page: true, pagesAvailable: true },
      });
      const pagesAvailable = existing[0]?.pagesAvailable;
      if (pagesAvailable && existing.length >= pagesAvailable) {
        progress.lessonPagesSkipped += existing.length;
        reportProgress(`Skipping saved lesson ${topic}/${item} (${existing.length}/${pagesAvailable} pages)`);
        continue;
      }

      let firstPage: Awaited<ReturnType<typeof getLessonPage>> | undefined;
      try {
        firstPage = existing.length
          ? undefined
          : await getLessonPage(topic, item, 1, 0, 1_000_000);
      } catch (error) {
        progress.lessonPagesFailed++;
        console.error(`[svh-import] failed to inspect lesson ${topic}/${item}; it will be retried on the next run:`, error);
        reportProgress(`Continuing after failed lesson ${topic}/${item}`);
        continue;
      }
      const total = pagesAvailable ?? firstPage?.pagesAvailable;
      if (!total) continue;
      reportProgress(`Importing lesson ${topic}/${item} (0/${total} pages)`);

      for (let page = 1; page <= total; page++) {
        if (existing.some((entry) => entry.page === page)) {
          progress.lessonPagesSkipped++;
          reportProgress(`Skipping saved lesson ${topic}/${item}, page ${page}/${total}`);
          continue;
        }
        reportProgress(`Fetching lesson ${topic}/${item}, page ${page}/${total}`);
        try {
          const lesson =
            page === 1 && firstPage
              ? firstPage
              : await getLessonPage(topic, item, page, 0, 1_000_000);
          await prisma.svhLessonPage.create({
            data: {
              topic,
              item,
              page,
              pagesAvailable: lesson.pagesAvailable,
              url: lesson.url,
              magazine: lesson.magazine,
            },
          });
          progress.lessonPagesSaved++;
          reportProgress(`Saved lesson ${topic}/${item}, page ${page}/${total}`);
        } catch (error) {
          progress.lessonPagesFailed++;
          console.error(`[svh-import] failed lesson ${topic}/${item}, page ${page}/${total}; it will be retried on the next run:`, error);
          reportProgress(`Continuing after failed lesson ${topic}/${item}, page ${page}/${total}`);
        }
      }
    }
  }
}

try {
  reportProgress("Import started");
  await importRecipes();
  await importLessons();
  reportProgress(
    `Import complete${progress.recipesFailed || progress.lessonPagesFailed ? " with failures; rerun to retry them" : ""}`,
  );
} catch (error) {
  console.error("[svh-import] stopped; rerun to resume from saved records:", error);
  process.exitCode = 1;
} finally {
  clearInterval(heartbeat);
  await prisma.$disconnect();
}
